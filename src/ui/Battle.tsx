import { useState } from 'react';
import { armyStats, hasBoon } from '../engine/armies';
import {
  armyOf, closeBattle, effDV, effOM, finishBattle, resolvePhase, setTactics, startBattle, victoryCheck,
  type BattleArmy, type Conditions, type Order, type Side,
} from '../engine/battle';
import { settlementStats } from '../engine/stats';
import { die } from '../engine/dice';
import { BOONS, LEARNABLE_TACTICS, STRATEGIES, TACTICS, WIND, type BoonId, type TacticId } from '../rules/massCombat';
import { update } from '../state/store';
import type { Kingdom } from '../state/types';
import { Panel, useId } from './common';

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

export function BattleSetupPanel({ k, onDone }: { k: Kingdom; onDone: () => void }) {
  const ours = (k.armies ?? []).filter((a) => a.side === 'kingdom' && a.status === 'ready');
  const foes = (k.armies ?? []).filter((a) => a.side === 'enemy' && a.status !== 'defeated');
  const [name, setName] = useState('');
  const [pick, setPick] = useState<Record<string, boolean>>(() => Object.fromEntries([...ours, ...foes].map((a) => [a.id, true])));
  const [c, setC] = useState<Conditions>({ light: 'bright', fog: false, sandstorm: false, wind: 0 });
  const [fortSide, setFortSide] = useState<Side | ''>('');
  const [fortSource, setFortSource] = useState('');
  const [fortValue, setFortValue] = useState(8);
  const [pcs, setPcs] = useState(0);
  const ids = Object.fromEntries(['n', 'l', 'w', 'at', 'ad', 'fs', 'fv', 'fx', 'pc'].map((x) => [x, useId(`bs-${x}`)]));
  const settlementDefense = (id: string) => {
    const s = k.settlements.find((x) => x.id === id);
    return s ? settlementStats(s).defense : 0;
  };
  const fort = fortSide ? (fortSource && fortSource !== 'custom' ? settlementDefense(fortSource) : fortValue) : 0;
  const chosen = (side: 'kingdom' | 'enemy') => (side === 'kingdom' ? ours : foes).filter((a) => pick[a.id]).map((a) => a.id);
  const ready = chosen('kingdom').length > 0 && chosen('enemy').length > 0;
  return (
    <Panel title="New battle">
      <label className="field" htmlFor={ids.n}>Name<input id={ids.n} type="text" value={name} placeholder="Battle of the Narlmarch" onChange={(e) => setName(e.target.value)} /></label>
      <div className="grid-2" style={{ gap: 12 }}>
        {(['kingdom', 'enemy'] as const).map((side) => (
          <div key={side} className="stack">
            <h3>{side === 'kingdom' ? 'Your armies' : 'Enemy armies'}</h3>
            {(side === 'kingdom' ? ours : foes).map((a) => {
              const st = armyStats(a);
              return (
                <label key={a.id} className="check small">
                  <input type="checkbox" checked={!!pick[a.id]} onChange={(e) => setPick({ ...pick, [a.id]: e.target.checked })} />
                  <span><strong>{a.name}</strong> · ACR {st.acrLabel} · hp {a.hp}/{st.hpMax} · DV {st.dv} · OM {signed(st.om)}</span>
                </label>
              );
            })}
            {(side === 'kingdom' ? ours : foes).length === 0 && <p className="small muted">None available.</p>}
          </div>
        ))}
      </div>
      <h3>Battlefield</h3>
      <div className="gen-grid">
        <label className="field" htmlFor={ids.l}>Light
          <select id={ids.l} value={c.light} onChange={(e) => setC({ ...c, light: e.target.value as Conditions['light'] })}>
            <option value="bright">Daylight</option><option value="dim">Dim light (OM −1)</option><option value="dark">Darkness (OM −2, DV −3)</option>
          </select>
        </label>
        <label className="field" htmlFor={ids.w}>Weather
          <select id={ids.w} value={c.wind} onChange={(e) => setC({ ...c, wind: Number(e.target.value) })}>
            {WIND.map((w, i) => <option key={i} value={i}>{w.label}{w.ranged > -99 && w.ranged ? ` (ranged OM ${w.ranged})` : ''}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.at}>Advantageous terrain (DV +2)
          <select id={ids.at} value={c.advTerrain ?? ''} onChange={(e) => setC({ ...c, advTerrain: (e.target.value || undefined) as Side | undefined })}>
            <option value="">Neither</option><option value="kingdom">Your side</option><option value="enemy">The enemy</option>
          </select>
        </label>
        <label className="field" htmlFor={ids.ad}>Knows the battlefield (OM and DV +2)
          <select id={ids.ad} value={c.advantage ?? ''} onChange={(e) => setC({ ...c, advantage: (e.target.value || undefined) as Side | undefined })}>
            <option value="">Neither</option><option value="kingdom">Your side</option><option value="enemy">The enemy</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label className="check"><input type="checkbox" checked={c.fog} onChange={(e) => setC({ ...c, fog: e.target.checked })} /> Fog or snow (damage halved)</label>
        <label className="check"><input type="checkbox" checked={c.sandstorm} onChange={(e) => setC({ ...c, sandstorm: e.target.checked })} /> Sandstorm (as fog, 1 damage a phase)</label>
      </div>
      <div className="gen-grid">
        <label className="field" htmlFor={ids.fs}>Fortified side
          <select id={ids.fs} value={fortSide} onChange={(e) => setFortSide(e.target.value as Side | '')}>
            <option value="">No fortifications</option><option value="kingdom">Your side</option><option value="enemy">The enemy</option>
          </select>
        </label>
        {fortSide && (
          <label className="field" htmlFor={ids.fx}>Fortification
            <select id={ids.fx} value={fortSource} onChange={(e) => setFortSource(e.target.value)}>
              <option value="custom">Custom value</option>
              {fortSide === 'kingdom' && k.settlements.map((s) => <option key={s.id} value={s.id}>{s.name} (Defense {settlementDefense(s.id)})</option>)}
            </select>
          </label>
        )}
        {fortSide && (fortSource === 'custom' || !fortSource) && (
          <label className="field" htmlFor={ids.fv}>DV bonus<input id={ids.fv} type="number" value={fortValue} onChange={(e) => setFortValue(Number(e.target.value) || 0)} /></label>
        )}
        <label className="field" htmlFor={ids.pc}>PCs’ own fight (OM and DV)
          <select id={ids.pc} value={pcs} onChange={(e) => setPcs(Number(e.target.value))}>
            <option value={0}>No effect</option><option value={4}>PCs won: +4</option><option value={-4}>PCs lost: −4</option>
          </select>
        </label>
      </div>
      <div className="row">
        <button className="btn primary" disabled={!ready} onClick={() => {
          update('Start battle', (d) => startBattle(d, {
            name: name.trim() || 'Battle', kingdom: chosen('kingdom'), enemy: chosen('enemy'),
            conditions: { ...c, pcs: pcs ? { side: 'kingdom', value: pcs } : undefined },
            fortification: fortSide ? { [fortSide]: fort } : undefined,
          }));
          onDone();
        }}>Begin: tactics phase</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </Panel>
  );
}

export function BattleView({ k }: { k: Kingdom }) {
  const b = k.battle!;
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const set = (id: string, o: Partial<Order>) => setOrders({ ...orders, [id]: { ...orders[id], ...o } });
  const phase = b.phase;
  const phaseLabel = phase === 'tactics' ? 'Tactics phase' : phase === 'ranged' ? 'Ranged phase' : phase === 'melee' ? `Melee phase ${b.meleeRound + 1}` : 'Battle over';
  const c = b.conditions;
  const condText = [
    c.light !== 'bright' ? (c.light === 'dim' ? 'dim light' : 'darkness') : '', c.fog ? 'fog' : '', c.sandstorm ? 'sandstorm' : '',
    c.wind ? WIND[c.wind].label.toLowerCase() : '', c.advTerrain ? `${c.advTerrain === 'kingdom' ? 'your' : 'enemy'} high ground` : '',
    c.advantage ? `${c.advantage === 'kingdom' ? 'you know' : 'the enemy knows'} the field` : '',
    c.pcs ? `PCs ${c.pcs.value > 0 ? 'won' : 'lost'} their fight (${signed(c.pcs.value)})` : '',
  ].filter(Boolean).join(', ');
  return (
    <Panel title={b.name} actions={<span className={`chip ${phase === 'over' ? 'ok' : 'warn'}`}>{phaseLabel}</span>}>
      {condText && <p className="small muted">Battlefield: {condText}.</p>}
      {phase !== 'over' && (
        <p className="small">
          {phase === 'tactics' && 'Each commander picks a tactic and an opening strategy. No checks are needed now.'}
          {phase === 'ranged' && 'Armies with ranged attacks fire once while the others advance. Leave d20 blank to have the app roll.'}
          {phase === 'melee' && `Melee: attacks are simultaneous. Moving strategy one step is free${b.meleeRound ? '; more needs a DC 20 Morale check' : ''}; changing tactic needs a DC 15 Morale check (withdraw needs none).`}
        </p>
      )}
      <div className="battle-sides">
        {(['kingdom', 'enemy'] as const).map((side) => (
          <div key={side} className="stack">
            <h3>{side === 'kingdom' ? 'Your forces' : 'The enemy'}</h3>
            {b.armies.filter((x) => x.side === side).map((ba) => <BattleRow key={ba.armyId} k={k} ba={ba} o={orders[ba.armyId] ?? {}} set={(o) => set(ba.armyId, o)} />)}
          </div>
        ))}
      </div>
      <div className="row">
        {phase === 'tactics' && <button className="btn primary" onClick={() => { update('Set tactics', (d) => setTactics(d, orders)); setOrders({}); }}>Begin the battle</button>}
        {(phase === 'ranged' || phase === 'melee') && (
          <>
            <button className="btn primary" onClick={() => { update(`Resolve ${phase} phase`, (d) => resolvePhase(d, orders)); setOrders(Object.fromEntries(Object.entries(orders).map(([id, o]) => [id, { target: o.target }]))); }}>
              Resolve {phase === 'ranged' ? 'ranged' : 'melee'} phase
            </button>
            <button className="btn ghost" onClick={() => update('End battle', finishBattle)}>End the battle here</button>
          </>
        )}
        {phase === 'over' && <button className="btn primary" onClick={() => update('Close battle', closeBattle)}>Close battle report</button>}
      </div>
      {phase === 'over' && <Aftermath k={k} />}
      <div className="stack battle-log">
        {[...b.log].reverse().map((p, i) => (
          <div key={i}>
            <h4>{p.title}</h4>
            <ul className="small">{p.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BattleRow({ k, ba, o, set }: { k: Kingdom; ba: BattleArmy; o: Order; set: (o: Partial<Order>) => void }) {
  const b = k.battle!;
  const a = armyOf(k, ba.armyId);
  const st = armyStats(a);
  const foes = b.armies.filter((x) => x.side !== ba.side && x.state === 'fighting');
  const target = foes.find((f) => f.armyId === (o.target ?? ba.target)) ?? foes[0];
  const phase = b.phase === 'ranged' ? 'ranged' : 'melee';
  const ids = Object.fromEntries(['t', 's', 'g', 'a', 'r'].map((x) => [x, useId(`br-${x}`)]));
  const active = ba.state === 'fighting' && b.phase !== 'over';
  const mindless = a.specials.some((s) => s.id === 'mindless');
  const pct = st.hpMax ? Math.max(0, Math.min(100, (ba.hp / st.hpMax) * 100)) : 0;
  return (
    <div className={`battle-army ${ba.state}`}>
      <div className="row">
        <strong style={{ flex: 1 }}>{a.name}</strong>
        {ba.state !== 'fighting' && <span className={`chip ${ba.state === 'withdrawn' ? '' : 'bad'}`}>{ba.state === 'routed' ? 'Routed' : ba.state === 'defeated' ? 'Destroyed' : 'Withdrew'}</span>}
        {ba.skipNext && active && <span className="chip warn">Can’t attack next phase</span>}
        {ba.onFerocity && <span className="chip warn">Ferocity</span>}
      </div>
      <div className="row small">
        <span className="num">hp {Math.max(0, ba.hp)}/{st.hpMax}</span>
        <span className="hpbar" style={{ flex: 1, minWidth: 60 }}><span style={{ width: `${pct}%` }} className={pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''} /></span>
        <span className="muted">rout at {Math.floor(st.acr ?? 0)}</span>
      </div>
      {active && target && b.phase !== 'tactics' && (
        <p className="small muted">
          vs {armyOf(k, target.armyId).name}: OM {signed(effOM(k, b, ba, target, phase))} against DV {effDV(k, b, target, ba, phase)}
          {phase === 'ranged' && !st.ranged ? ' (no ranged attack: advancing)' : ''}
          {ba.fortification ? ` · fortified +${ba.fortification}` : ''}
        </p>
      )}
      {active && (
        <div className="gen-grid">
          <label className="field" htmlFor={ids.t}>Tactic
            <select id={ids.t} value={o.tactic ?? ba.tactic} disabled={mindless} onChange={(e) => set({ tactic: e.target.value as TacticId })}>
              {st.usableTactics.map((t) => <option key={t} value={t} title={TACTICS[t].text}>{TACTICS[t].label}</option>)}
            </select>
          </label>
          {(b.phase === 'melee' || b.phase === 'tactics') && (
            <label className="field" htmlFor={ids.s}>Strategy
              <select id={ids.s} value={o.strategy ?? ba.strategy} disabled={mindless} onChange={(e) => set({ strategy: Number(e.target.value) })}>
                {STRATEGIES.map((x, i) => <option key={i} value={i}>{x.label} (DV {signed(x.dv)}, OM {signed(x.om)}, dmg {signed(x.dmg)})</option>)}
              </select>
            </label>
          )}
          {foes.length > 1 && (
            <label className="field" htmlFor={ids.g}>Target
              <select id={ids.g} value={target?.armyId} onChange={(e) => set({ target: e.target.value })}>
                {foes.map((f) => <option key={f.armyId} value={f.armyId}>{armyOf(k, f.armyId).name}</option>)}
              </select>
            </label>
          )}
          {b.phase !== 'tactics' && (
            <label className="field" htmlFor={ids.a}>Action
              <select id={ids.a} value={o.action ?? 'attack'} onChange={(e) => set({ action: e.target.value as Order['action'] })}>
                <option value="attack">Attack</option>
                {a.resources.potions && ba.potionsUsed < 2 && <option value="potions">Drink healing potions (+{2 * Math.max(1, Math.floor(st.acr ?? 1))} hp)</option>}
                {(o.tactic ?? ba.tactic) === 'falseRetreat' && !ba.falseRetreatUsed && <option value="falseRetreat">Feign a retreat</option>}
                {hasBoon(a, 'triage') && !ba.triageUsed && <option value="triage">Attack with triage (OM −4, heal)</option>}
                <option value="hold">Hold back</option>
              </select>
            </label>
          )}
          {b.phase !== 'tactics' && (o.action ?? 'attack') !== 'hold' && (
            <label className="field" htmlFor={ids.r}>Offense d20
              <input id={ids.r} type="number" min={1} max={20} placeholder="auto" value={o.roll ?? ''} onChange={(e) => set({ roll: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function Aftermath({ k }: { k: Kingdom }) {
  const b = k.battle!;
  if (!b.victors?.length) return null;
  return (
    <div className="stack">
      <h3>Victory</h3>
      <p className="small muted">Each winning army may attempt a Loyalty check to learn a tactic (and gain +1 Morale), and another for its commander to learn a boon.</p>
      {b.victors.map((v) => <VictorRow key={v.armyId} k={k} armyId={v.armyId} tacticDone={v.tactic} boonDone={v.boon} />)}
    </div>
  );
}

function VictorRow({ k, armyId, tacticDone, boonDone }: { k: Kingdom; armyId: string; tacticDone?: string; boonDone?: string }) {
  const a = armyOf(k, armyId);
  const st = armyStats(a);
  const room = a.tactics.length < st.maxTactics;
  const [tactic, setTactic] = useState<TacticId | ''>(LEARNABLE_TACTICS.find((t) => !a.tactics.includes(t)) ?? '');
  const [boon, setBoon] = useState<BoonId | ''>('');
  const ids = { t: useId('vr'), b: useId('vr') };
  return (
    <div className="event-card">
      <strong>{a.name}</strong>
      {tacticDone ? <p className="small result">{tacticDone}</p> : (
        <div className="row">
          {room ? (
            <label className="field" htmlFor={ids.t}>Tactic to learn
              <select id={ids.t} value={tactic} onChange={(e) => setTactic(e.target.value as TacticId)}>
                {LEARNABLE_TACTICS.filter((t) => !a.tactics.includes(t)).map((t) => <option key={t} value={t}>{TACTICS[t].label}</option>)}
              </select>
            </label>
          ) : <span className="small muted">Knows as many tactics as it can ({st.maxTactics}); a success still gives +1 Morale.</span>}
          <button className="btn sm" style={{ alignSelf: 'flex-end' }} onClick={() => update('Victory check', (d) => { victoryCheck(d, armyId, 'tactic', die(20), room ? tactic || undefined : undefined); })}>Loyalty check</button>
        </div>
      )}
      {a.commander && (boonDone ? <p className="small result">{boonDone}</p> : (
        <div className="row">
          <label className="field" htmlFor={ids.b}>Boon for {a.commander.name}
            <select id={ids.b} value={boon} onChange={(e) => setBoon(e.target.value as BoonId)}>
              <option value="">Choose</option>
              {(Object.keys(BOONS) as BoonId[]).filter((x) => !a.commander!.boons.includes(x)).map((x) => <option key={x} value={x}>{BOONS[x].label}</option>)}
            </select>
          </label>
          <button className="btn sm" style={{ alignSelf: 'flex-end' }} disabled={!boon} onClick={() => update('Boon check', (d) => { victoryCheck(d, armyId, 'boon', die(20), boon || undefined); })}>Loyalty check</button>
        </div>
      ))}
    </div>
  );
}
