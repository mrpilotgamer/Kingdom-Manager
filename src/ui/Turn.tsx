import { useState, type ReactNode } from 'react';
import { log, loseHex } from '../engine/actions';
import { activeArmies, armyUpkeepTotal, payArmies, rally } from '../engine/armies';
import { computeStats } from '../engine/stats';
import {
  collectTaxes, deposit, endTurn, eventChance, modifyUnrest, payConsumption, PHASES, resolveStability, rollEvents,
  pendingEvents, royalEnforcer, withdraw, type RolledEvent,
} from '../engine/turn';
import { ATTR_LABEL, ATTRS } from '../rules/kingdom';
import { update } from '../state/store';
import type { Kingdom, Phase } from '../state/types';
import { CheckRow, Panel, useId } from './common';
import { AddEventForm, OngoingEventCard, RolledLine } from './Events';
import { Edicts } from './Overview';

export type Tab = 'overview' | 'turn' | 'settlements' | 'territory' | 'armies' | 'leaders' | 'log' | 'settings';

function Step({ n, title, done, children }: { n: number; title: string; done?: string; children?: ReactNode }) {
  return (
    <div className={`step ${done ? 'done' : ''}`}>
      <span className="badge">{done ? '✓' : n}</span>
      <div className="body">
        <h3>{title}</h3>
        {done ? <p className="result">{done}</p> : children}
      </div>
    </div>
  );
}

const setPhase = (p: Phase) => update(`Go to ${p} phase`, (d) => { d.turnState.phase = p; });

export function Turn({ k, go }: { k: Kingdom; go: (t: Tab) => void }) {
  const phase = k.turnState.phase;
  const idx = PHASES.findIndex((p) => p.id === phase);
  return (
    <>
      <div className="phases" role="list">
        {PHASES.map((p, i) => (
          <button key={p.id} role="listitem" aria-current={p.id === phase ? 'step' : undefined} onClick={() => setPhase(p.id)}>
            <span className="n">Phase {i + 1}</span>
            <span className="t">{p.label}</span>
          </button>
        ))}
      </div>
      <Panel title={`Turn ${k.turn} · ${PHASES[idx].label} phase`}>
        <p className="muted">{PHASES[idx].summary}</p>
        {phase === 'upkeep' && <Upkeep k={k} go={go} />}
        {phase === 'edict' && <EdictPhase k={k} go={go} />}
        {phase === 'income' && <Income k={k} />}
        {phase === 'event' && <EventPhase k={k} />}
        <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {idx > 0 && <button className="btn ghost" onClick={() => setPhase(PHASES[idx - 1].id)}>Back to {PHASES[idx - 1].label}</button>}
          <span className="spacer" />
          {idx < 3
            ? <button className="btn primary" onClick={() => setPhase(PHASES[idx + 1].id)}>Continue to {PHASES[idx + 1].label}</button>
            : <>
                {pendingEvents(k).length > 0 && <span className="small neg">{pendingEvents(k).length} ongoing event{pendingEvents(k).length > 1 ? 's' : ''} not dealt with yet</span>}
                <button className="btn primary" onClick={() => update('End turn', endTurn)}>End turn {k.turn}</button>
              </>}
        </div>
      </Panel>
    </>
  );
}

function Upkeep({ k, go }: { k: Kingdom; go: (t: Tab) => void }) {
  const st = computeStats(k);
  const done = k.turnState.done;
  const anarchy = k.unrest >= 20;
  if (k.size === 0) return <p className="callout">Your kingdom controls no hexes, so the Upkeep phase is skipped.</p>;
  const negative = ATTRS.filter((x) => st[x] < 0);
  const gain = negative.length + st.vacancyUnrest;
  const a = activeArmies(k).length ? 1 : 0;
  return (
    <div>
      <Step n={1} title="Determine kingdom stability" done={done['upkeep.stability']}>
        <p className="small">Success: Unrest −1 (or +1 BP if Unrest is 0). Fail by 1–4: Unrest +1. Fail by 5+: Unrest +1d4.</p>
        <CheckRow k={k} attr="stability" label="Check Stability" onResolve={(r) => update('Stability check', (d) => { resolveStability(d, r); })} />
      </Step>
      <Step n={2} title="Pay Consumption" done={done['upkeep.consumption']}>
        <p className="small">Pay {st.consumption} BP. The Treasury goes from {k.treasury} to {k.treasury - st.consumption} BP
          {k.treasury - st.consumption < 0 ? ', which is negative: Unrest +2.' : '.'}</p>
        <div><button className="btn primary" onClick={() => update('Pay Consumption', payConsumption)}>Pay {st.consumption} BP</button></div>
      </Step>
      <ArmyUpkeep k={k} go={go} n={3} />
      <Step n={3 + a} title="Fill vacant magic item slots">
        <p className="small muted">Roll d% for each district with an open slot: 51–100 fills it with an item up to the settlement's base value. Track items at the table for now.</p>
      </Step>
      <Step n={4 + a} title="Modify Unrest" done={done['upkeep.unrest']}>
        <p className="small">
          {gain
            ? <>Unrest +{gain}: {[negative.length ? `${negative.map((x) => ATTR_LABEL[x]).join(', ')} negative` : '', st.vacancyUnrest ? `vacant leadership roles (+${st.vacancyUnrest})` : ''].filter(Boolean).join('; ')}.</>
            : 'No attribute is negative and no Unrest-causing role is vacant.'}
        </p>
        <div><button className="btn primary" onClick={() => update('Modify Unrest', modifyUnrest)}>Apply</button></div>
      </Step>
      {k.leaders.royalEnforcer?.name && k.leaders.royalEnforcer.active && (
        <Step n={5 + a} title="Royal Enforcer (optional)" done={done['upkeep.enforcer']}>
          <p className="small">Reduce Unrest by 1, then attempt a Loyalty check. If it fails, Loyalty drops by 1 for good.</p>
          <CheckRow k={{ ...k, unrest: Math.max(0, k.unrest - 1) }} attr="loyalty" label="Crack down" disabled={k.unrest === 0}
            onResolve={(r) => update('Royal Enforcer', (d) => royalEnforcer(d, r))} />
        </Step>
      )}
      {k.unrest >= 11 && !anarchy && (
        <div className="callout bad row">
          <span style={{ flex: 1 }}>Unrest is {k.unrest}: the kingdom loses 1 hex this Upkeep. The leaders choose which.</span>
          {k.map?.active
            ? <button className="btn sm danger" onClick={() => go('territory')}>Choose it on the map</button>
            : <button className="btn sm danger" onClick={() => update('Lose hex', loseHex)}>Lose a hex</button>}
        </div>
      )}
      {anarchy && <p className="callout bad">The kingdom is in anarchy. Restoring order takes quests and adventures; the kingdom can take no actions until then.</p>}
    </div>
  );
}

function EdictPhase({ k, go }: { k: Kingdom; go: (t: Tab) => void }) {
  const st = computeStats(k);
  const t = k.turnState;
  return (
    <div>
      <Step n={1} title="Assign leadership">
        <p className="small">Fill vacant roles or move leaders around. {st.vacancies.length ? `${st.vacancies.length} required role${st.vacancies.length > 1 ? 's are' : ' is'} vacant.` : 'All required roles are filled.'}</p>
        <div><button className="btn" onClick={() => go('leaders')}>Open leadership</button></div>
      </Step>
      <Step n={2} title="Claim and abandon hexes">
        <p className="small">{t.hexClaims} of {st.limits.hexClaims} claims used this turn.{k.map?.active ? ' Claim hexes by selecting them on the map.' : ''}</p>
        <div><button className="btn" onClick={() => go('territory')}>Open territory</button></div>
      </Step>
      <Step n={3} title="Build terrain improvements">
        <p className="small">{t.improvements} of {st.limits.improvements} improvements used this turn.</p>
        <div><button className="btn" onClick={() => go('territory')}>Open territory</button></div>
      </Step>
      <Step n={4} title="Create and improve settlements">
        <p className="small">{t.buildings} of {Number.isFinite(st.limits.buildings) ? st.limits.buildings : '∞'} buildings used this turn
          {t.freeHousingUsed ? '' : ', plus one free House, Mansion, Noble Villa, or Tenement'}. {t.settlements} of {st.limits.settlements} new settlements.</p>
        <div><button className="btn" onClick={() => go('settlements')}>Open settlements</button></div>
      </Step>
      <Step n={5} title="Create army units">
        <p className="small">Recruiting, expanding, or equipping an army uses the same allowance as founding a settlement ({t.settlements} of {st.limits.settlements} used).</p>
        <div><button className="btn" onClick={() => go('armies')}>Open armies</button></div>
      </Step>
      <Step n={6} title="Issue edicts">
        <Edicts k={k} />
      </Step>
    </div>
  );
}

function Income({ k }: { k: Kingdom }) {
  const done = k.turnState.done;
  const st = computeStats(k);
  const [bp, setBp] = useState(1);
  const [gp, setGp] = useState(4000);
  const [item, setItem] = useState(10000);
  const ids = { bp: useId('inc'), gp: useId('inc'), item: useId('inc') };
  const itemBP = Math.floor(item / 2 / 4000);
  return (
    <div>
      <Step n={1} title="Withdraw from the Treasury (optional)" done={done['income.withdraw']}>
        <p className="small">Each BP becomes 2,000 gp for a leader's personal use and adds 1 Unrest.</p>
        <div className="row">
          <label className="small" htmlFor={ids.bp}>BP</label>
          <input id={ids.bp} type="number" min={1} value={bp} onChange={(e) => setBp(Math.max(1, Number(e.target.value) || 1))} />
          <button className="btn" onClick={() => update('Withdraw', (d) => withdraw(d, bp))}>Withdraw {bp} BP ({(bp * 2000).toLocaleString()} gp)</button>
        </div>
      </Step>
      <Step n={2} title="Deposit to the Treasury (optional)" done={done['income.deposit']}>
        <p className="small">Coins, gems, and items worth 4,000 gp or less each: every full 4,000 gp is 1 BP.</p>
        <div className="row">
          <label className="small" htmlFor={ids.gp}>gp</label>
          <input id={ids.gp} type="number" min={0} step={1000} value={gp} style={{ width: '8em' }} onChange={(e) => setGp(Math.max(0, Number(e.target.value) || 0))} />
          <button className="btn" disabled={gp < 4000} onClick={() => update('Deposit', (d) => deposit(d, gp))}>Deposit for {Math.floor(gp / 4000)} BP</button>
        </div>
      </Step>
      <Step n={3} title="Sell expensive items (optional)">
        <p className="small">One item per district per turn, priced at or below the settlement's base value: half its price ÷ 4,000 gp.</p>
        <div className="row">
          <label className="small" htmlFor={ids.item}>Item price (gp)</label>
          <input id={ids.item} type="number" min={0} step={1000} value={item} style={{ width: '8em' }} onChange={(e) => setItem(Math.max(0, Number(e.target.value) || 0))} />
          <button className="btn" disabled={!itemBP} onClick={() => update('Sell item', (d) => {
            d.treasury += itemBP;
            log(d, `Sold an item worth ${item.toLocaleString()} gp: +${itemBP} BP.`, { bp: itemBP });
          })}>Sell for {itemBP} BP</button>
        </div>
      </Step>
      <Step n={4} title="Collect taxes" done={done['income.taxes']}>
        {st.canCollectTaxes ? (
          <>
            <p className="small">On a success, gain the check result ÷ 3 in BP{st.incomeBonus ? `, plus ${st.incomeBonus} BP from Mines, Quarries, and Sawmills` : ''}. A failure collects nothing from taxes.</p>
            <CheckRow k={k} attr="economy" label="Collect" onResolve={(r) => update('Collect taxes', (d) => { collectTaxes(d, r); })} />
          </>
        ) : (
          <>
            <p className="callout bad">No Treasurer: the kingdom cannot collect taxes this turn.</p>
            <div><button className="btn" onClick={() => update('Skip taxes', (d) => { collectTaxes(d, 10); })}>Record it</button></div>
          </>
        )}
      </Step>
    </div>
  );
}

function EventPhase({ k }: { k: Kingdom }) {
  const done = k.turnState.done['event.roll'];
  let rolled: RolledEvent[] = [];
  try { rolled = JSON.parse(k.turnState.done['event.list'] ?? '[]'); } catch { /* older save */ }
  const ongoing = (k.events ?? []).filter((e) => e.startedTurn < k.turn);
  const fresh = (k.events ?? []).filter((e) => e.startedTurn === k.turn);
  const pending = pendingEvents(k).filter((e) => e.startedTurn < k.turn);
  return (
    <div>
      <Step n={1} title="Continue ongoing events" done={ongoing.length ? undefined : 'No ongoing events.'}>
        {ongoing.length ? (
          <>
            <p className="small">
              {pending.length
                ? `${pending.length} continuous event${pending.length > 1 ? 's' : ''} still need${pending.length > 1 ? '' : 's'} dealing with this turn.`
                : 'Every continuous event has been dealt with this turn.'}
              {ongoing.some((e) => e.lasts === 'next-event') ? ' Events that last until the next Event phase end when you roll below.' : ''}
            </p>
            <div className="stack">
              {ongoing.map((e) => <OngoingEventCard key={e.id} k={k} e={e} eventPhase />)}
            </div>
          </>
        ) : null}
      </Step>
      <Step n={2} title="Roll for a new event" done={done}>
        <p className="small">{eventChance(k)}% chance this turn, {k.eventLastTurn ? 'because an event happened last turn' : 'because nothing happened last turn'}. The GM may also run a campaign event instead.</p>
        <div><button className="btn primary" onClick={() => update('Roll event', (d) => { rollEvents(d); })}>Roll</button></div>
      </Step>
      {fresh.length > 0 && (
        <div className="stack">
          {rolled.length > 0 && <div className="row">{rolled.map((e, i) => <RolledLine key={i} e={e} />)}</div>}
          {fresh.map((e) => <OngoingEventCard key={e.id} k={k} e={e} eventPhase />)}
          <p className="callout info">
            Effects are applied automatically and recorded in the Chronicle. Anything only the GM can decide is listed as a note.
          </p>
        </div>
      )}
      <Step n={3} title="Campaign events (optional)">
        <p className="small muted">Add your own event to track, such as a plot development from the adventure.</p>
        <AddEventForm />
      </Step>
    </div>
  );
}

/** Upkeep: pay army Consumption (weekly for deployed armies, monthly in reserve) and rally routed armies. */
function ArmyUpkeep({ k, go, n }: { k: Kingdom; go: (t: Tab) => void; n: number }) {
  const armies = activeArmies(k);
  if (!armies.length) return null;
  const total = armyUpkeepTotal(k);
  const done = k.turnState.done['upkeep.armies'];
  const routed = armies.filter((a) => a.status === 'routed');
  return (
    <Step n={n} title="Pay and rally your armies" done={done && !routed.some((a) => !k.turnState.done[`rally.${a.id}`]) ? done : undefined}>
      {!done && (
        <>
          <p className="small">
            {armies.length} arm{armies.length === 1 ? 'y' : 'ies'} cost {total} BP this month (four weeks of Consumption for deployed
            armies, one month for armies in reserve). Unpaid armies take Morale −2 until they’re paid. Armies without a commander
            lose Morale each week; armies that didn’t fight last month heal to full.
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => update('Pay armies', (d) => payArmies(d, true))}>Pay {total} BP</button>
            <button className="btn" onClick={() => update('Don’t pay armies', (d) => payArmies(d, false))}>Don’t pay this month</button>
            <button className="btn ghost" onClick={() => go('armies')}>Open armies</button>
          </div>
        </>
      )}
      {done && <p className="result">{done}</p>}
      {routed.map((a) => (
        <div key={a.id} className="stack">
          <strong className="small">{a.name} routed and won’t fight until it rallies.</strong>
          {k.turnState.done[`rally.${a.id}`]
            ? <p className="small result">{k.turnState.done[`rally.${a.id}`] === 'rallied' ? 'Rallied: ready to fight.' : 'Failed to rally this turn.'}</p>
            : <CheckRow k={k} attr="loyalty" label="Rally" onResolve={(r) => update(`Rally ${a.name}`, (d) => { rally(d, a.id, r); })} />}
        </div>
      ))}
    </Step>
  );
}
