import { useState } from 'react';
import { activeArmies } from '../engine/armies';
import { die } from '../engine/dice';
import {
  ALIGN, ATTITUDES, blankForeign, CHECKS_NEEDED, diplomacyDC, diplomaticEdict, endExpedition, resolveTrade, specialEdictUsed,
  startExpedition, startTrade, tradeAllowed, tradeDC, tradeTypeBonus, TRADE_TYPES, vassalEdict, type Attitude, type TradeType,
} from '../engine/specialEdicts';
import { computeStats } from '../engine/stats';
import { createKingdom } from '../state/factory';
import { addKingdom, update } from '../state/store';
import type { ForeignKingdom, Kingdom } from '../state/types';
import { Panel, useId } from './common';

const RELATION_LABEL = { none: 'No relations', embassy: 'Embassy', treaty: 'Treaty', alliance: 'Alliance' };
const terms = (t?: ForeignKingdom['treaty']) => (t === 'ours' ? 'in your favor' : t === 'theirs' ? 'in their favor' : 'balanced');

export function Diplomacy({ k }: { k: Kingdom }) {
  const used = specialEdictUsed(k);
  return (
    <>
      <Panel title="Special edict this turn">
        {used ? <p className="result">{used}</p> : (
          <p className="small muted">In the Edict phase you may issue one special edict: Diplomatic, Exploration, Trade, or Vassalage. Choose it below.</p>
        )}
      </Panel>
      <Neighbors k={k} />
      <div className="grid-2">
        <Trade k={k} />
        <Exploration k={k} />
      </div>
      <Vassals k={k} />
    </>
  );
}

function Neighbors({ k }: { k: Kingdom }) {
  const list = k.foreign ?? [];
  return (
    <Panel title="Other kingdoms" actions={<button className="btn" onClick={() => update('Add kingdom', (d) => { (d.foreign ??= []).push(blankForeign()); })}>Add a kingdom</button>}>
      <p className="small muted">Kingdoms you trade and negotiate with. For an NPC kingdom, estimate its Economy and Stability as 2d6 + its Size.</p>
      {!list.length && <p className="muted">None yet.</p>}
      <div className="army-grid">{list.map((f) => <ForeignCard key={f.id} k={k} f={f} />)}</div>
    </Panel>
  );
}

function ForeignCard({ k, f }: { k: Kingdom; f: ForeignKingdom }) {
  const [editing, setEditing] = useState(false);
  const [talking, setTalking] = useState(false);
  const edit = (fn: (x: ForeignKingdom) => void) => update('Edit kingdom', (d) => { fn(d.foreign!.find((x) => x.id === f.id)!); });
  const ids = Object.fromEntries(['n', 'a', 's', 'e', 'st', 'at', 'eb'].map((x) => [x, useId(`fk-${x}`)]));
  return (
    <div className="army-card">
      <div className="row">
        <h3 style={{ flex: 1, minWidth: 0 }}>{f.name}</h3>
        <span className={`chip ${f.relation === 'none' ? '' : 'ok'}`}>{RELATION_LABEL[f.relation]}{f.relation === 'treaty' ? `, ${terms(f.treaty)}` : f.relation === 'alliance' ? `, ${terms(f.alliance)}` : ''}</span>
        {f.vassal && <span className="chip warn">Vassal</span>}
      </div>
      <p className="small muted">{f.alignment} · Size {f.size} · Economy {f.economy} · Stability {f.stability} · {f.attitude}</p>
      {f.embassyBuilding && <p className="small">Your embassy there: {f.embassyBuilding === 'mansion' ? 'Mansion' : 'Noble Villa'} (Economy +2, Society +2, Consumption +1, plus the building’s bonuses).</p>}
      <div className="row">
        <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
        <button className="btn sm primary" disabled={!!specialEdictUsed(k)} onClick={() => setTalking(!talking)}>Diplomatic edict</button>
        <span className="spacer" />
        <button className="btn sm ghost danger" onClick={() => update('Remove kingdom', (d) => { d.foreign = d.foreign!.filter((x) => x.id !== f.id); })}>Remove</button>
      </div>
      {editing && (
        <div className="gen-grid">
          <label className="field" htmlFor={ids.n}>Name<input id={ids.n} type="text" value={f.name} onChange={(e) => edit((x) => { x.name = e.target.value; })} /></label>
          <label className="field" htmlFor={ids.a}>Alignment
            <select id={ids.a} value={f.alignment} onChange={(e) => edit((x) => { x.alignment = e.target.value; })}>{ALIGN.map((a) => <option key={a}>{a}</option>)}</select>
          </label>
          <label className="field" htmlFor={ids.s}>Size<input id={ids.s} type="number" min={1} value={f.size} onChange={(e) => edit((x) => { x.size = Math.max(1, Number(e.target.value) || 1); })} /></label>
          <label className="field" htmlFor={ids.at}>Attitude to you
            <select id={ids.at} value={f.attitude} onChange={(e) => edit((x) => { x.attitude = e.target.value as Attitude; })}>{ATTITUDES.map((a) => <option key={a}>{a}</option>)}</select>
          </label>
          <label className="field" htmlFor={ids.e}>Economy<input id={ids.e} type="number" value={f.economy} onChange={(e) => edit((x) => { x.economy = Number(e.target.value) || 0; })} /></label>
          <label className="field" htmlFor={ids.st}>Stability<input id={ids.st} type="number" value={f.stability} onChange={(e) => edit((x) => { x.stability = Number(e.target.value) || 0; })} /></label>
          {f.relation !== 'none' && (
            <label className="field" htmlFor={ids.eb}>Your embassy building there
              <select id={ids.eb} value={f.embassyBuilding ?? ''} onChange={(e) => edit((x) => { x.embassyBuilding = (e.target.value || undefined) as ForeignKingdom['embassyBuilding']; })}>
                <option value="">None</option><option value="mansion">Mansion</option><option value="noble-villa">Noble Villa</option>
              </select>
            </label>
          )}
        </div>
      )}
      {talking && <DiplomaticForm k={k} f={f} onDone={() => setTalking(false)} />}
    </div>
  );
}

function DiplomaticForm({ k, f, onDone }: { k: Kingdom; f: ForeignKingdom; onDone: () => void }) {
  const next = f.relation === 'none' ? 'embassy' : f.relation === 'embassy' ? 'treaty' : f.relation === 'treaty' ? 'alliance' : null;
  const [intimidate, setIntimidate] = useState(false);
  const [bribes, setBribes] = useState(0);
  const [rel, setRel] = useState(0);
  const [mod, setMod] = useState(10);
  const [checks, setChecks] = useState<string[]>([]);
  const [advantage, setAdvantage] = useState<'us' | 'them'>('us');
  const [balanced, setBalanced] = useState(true);
  const ids = Object.fromEntries(['b', 'r', 'm'].map((x) => [x, useId(`df-${x}`)]));
  if (!next) return <p className="small muted">You already have an alliance.</p>;
  const cooldown = f.cooldown?.[intimidate ? 'threat' : next];
  if (cooldown && cooldown > k.turn) return <p className="small callout">You can’t try for {next === 'embassy' && intimidate ? 'a threatened embassy' : `a ${next}`} again until turn {cooldown}.</p>;
  const dc = diplomacyDC(k, f, { intimidate, bribes, relationship: rel });
  const [count, need] = CHECKS_NEEDED[next];
  const st = computeStats(k);
  const intimBonus = st.infamy + activeArmies(k).length;
  const values = Array.from({ length: count }, (_, i) => Number(checks[i]));
  const ready = values.every((v) => Number.isFinite(v) && checks.length >= count && v > 0);
  return (
    <div className="stack army-editor">
      <h4>Seek {next === 'embassy' ? 'an embassy' : `a ${next}`} with {f.name}</h4>
      {next === 'embassy' && (
        <div className="segmented" role="group" aria-label="Approach">
          <button aria-pressed={!intimidate} onClick={() => setIntimidate(false)}>Diplomacy</button>
          <button aria-pressed={intimidate} onClick={() => setIntimidate(true)}>Threats (Intimidate)</button>
        </div>
      )}
      <div className="row">
        <label className="field" htmlFor={ids.b}>Bribes and gifts (BP)<input id={ids.b} type="number" min={0} value={bribes} onChange={(e) => setBribes(Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className="field" htmlFor={ids.r}>Third-party relationships<input id={ids.r} type="number" value={rel} onChange={(e) => setRel(Number(e.target.value) || 0)} /></label>
      </div>
      <p className="small muted">DC {dc.dc} = {dc.lines.map(([l, v]) => `${l} ${v >= 0 ? '+' : '−'}${Math.abs(v)}`).join(', ')}. Costs 1d4 BP{bribes ? ` + ${bribes} BP in bribes` : ''}.
        {next !== 'embassy' && ` Needs ${need} of ${count} checks to succeed.`}{intimidate && ` Add your Infamy and +1 per active army (+${intimBonus}) to the envoy’s check; Infamy rises by 1 either way.`}</p>
      <div className="row">
        <label className="field" htmlFor={ids.m}>Envoy’s skill bonus<input id={ids.m} type="number" value={mod} onChange={(e) => setMod(Number(e.target.value) || 0)} /></label>
        <button className="btn sm" style={{ alignSelf: 'flex-end' }} onClick={() => setChecks(Array.from({ length: count }, () => String(die(20) + mod + (intimidate ? intimBonus : 0))))}>Roll {count} check{count > 1 ? 's' : ''}</button>
      </div>
      <div className="row">
        {Array.from({ length: count }, (_, i) => (
          <input key={i} type="number" aria-label={`Check ${i + 1} total`} placeholder={`Check ${i + 1}`} value={checks[i] ?? ''}
            className={checks[i] ? (Number(checks[i]) >= dc.dc ? 'ok-input' : 'bad-input') : ''}
            onChange={(e) => { const c = [...checks]; c[i] = e.target.value; setChecks(c); }} />
        ))}
      </div>
      {next !== 'embassy' && (
        <div className="stack">
          <span className="small">If talks succeed, the envoys negotiate (opposed Bluff, Diplomacy, Knowledge (local), Knowledge (nobility), and Sense Motive). Who won most of them?</span>
          <div className="row">
            <div className="segmented" role="group" aria-label="Advantage">
              <button aria-pressed={advantage === 'us'} onClick={() => setAdvantage('us')}>Your envoy</button>
              <button aria-pressed={advantage === 'them'} onClick={() => setAdvantage('them')}>Their envoy</button>
            </div>
            <div className="segmented" role="group" aria-label="Terms">
              <button aria-pressed={balanced} onClick={() => setBalanced(true)}>Balanced</button>
              <button aria-pressed={!balanced} onClick={() => setBalanced(false)}>Unbalanced</button>
            </div>
          </div>
        </div>
      )}
      <div className="row">
        <button className="btn primary" disabled={!ready} onClick={() => {
          update('Diplomatic edict', (d) => diplomaticEdict(d, { foreignId: f.id, goal: next, intimidate, bribes, relationship: rel, checks: values, advantage, balanced }));
          onDone();
        }}>Issue the edict</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function Trade({ k }: { k: Kingdom }) {
  const [partner, setPartner] = useState('');
  const [sId, setSId] = useState(k.settlements[0]?.id ?? '');
  const [type, setType] = useState<TradeType>('goods');
  const [trl, setTrl] = useState(6);
  const [invested, setInvested] = useState(5);
  const [turns, setTurns] = useState(0);
  const ids = Object.fromEntries(['p', 's', 't', 'l', 'i', 'd'].map((x) => [x, useId(`tr-${x}`)]));
  const routes = k.tradeRoutes ?? [];
  const allowed = sId ? tradeAllowed(k, sId, type) : { ok: false, missing: [], busy: false };
  const dc = sId ? tradeDC(k, sId, trl) : null;
  return (
    <Panel title="Trade routes">
      {routes.map((r) => {
        const due = r.status === 'travelling' && r.arrivesTurn <= k.turn;
        return (
          <div key={r.id} className="row small">
            <strong style={{ flex: 1, minWidth: 0 }}>{TRADE_TYPES[r.type].label} to {r.partner}</strong>
            {r.status === 'travelling' && !due && <span className="chip">Arrives turn {r.arrivesTurn}</span>}
            {due && <button className="btn sm primary" onClick={() => update('Trade arrives', (d) => { resolveTrade(d, r.id); })}>Traders arrive: roll 3 checks</button>}
            {r.status === 'active' && <span className={`chip ${(r.expiresTurn ?? 0) > k.turn ? 'ok' : ''}`}>{(r.expiresTurn ?? 0) > k.turn ? `Economy +${r.economy} until turn ${r.expiresTurn}` : 'Expired'}</span>}
            {r.status === 'failed' && <span className="chip bad">Failed</span>}
          </div>
        );
      })}
      <h4>Trade edict</h4>
      <div className="gen-grid">
        <label className="field" htmlFor={ids.p}>Partner<input id={ids.p} type="text" list="foreign-names" value={partner} placeholder="Restov" onChange={(e) => setPartner(e.target.value)} /></label>
        <datalist id="foreign-names">{(k.foreign ?? []).map((f) => <option key={f.id} value={f.name} />)}</datalist>
        <label className="field" htmlFor={ids.s}>From
          <select id={ids.s} value={sId} onChange={(e) => setSId(e.target.value)}>{k.settlements.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="field" htmlFor={ids.t}>Goods
          <select id={ids.t} value={type} onChange={(e) => setType(e.target.value as TradeType)}>{(Object.keys(TRADE_TYPES) as TradeType[]).map((t) => <option key={t} value={t}>{TRADE_TYPES[t].label}</option>)}</select>
        </label>
        <label className="field" htmlFor={ids.l}>Route length (TRL)<input id={ids.l} type="number" min={1} value={trl} onChange={(e) => setTrl(Math.max(1, Number(e.target.value) || 1))} /></label>
        <label className="field" htmlFor={ids.i}>Invest (BP, 5+)<input id={ids.i} type="number" min={5} value={invested} onChange={(e) => setInvested(Math.max(5, Number(e.target.value) || 5))} /></label>
        <label className="field" htmlFor={ids.d}>Turns to arrive<input id={ids.d} type="number" min={0} value={turns} onChange={(e) => setTurns(Math.max(0, Number(e.target.value) || 0))} /></label>
      </div>
      <p className="small muted">
        {TRADE_TYPES[type].text} Count route length by hexes: Roads and rivers 1, grassland and desert 2, water and Highways ½.
        {dc && ` DC ${dc.dc} (Control DC + Corruption ${dc.corruption} + RM ${dc.rm} + LM ${dc.lm} − Productivity ${dc.productivity}).`}
        {sId && ` This settlement would add Economy +${tradeTypeBonus(k, sId, type)} for the goods.`}
      </p>
      {!allowed.ok && <p className="small callout">{allowed.busy ? `You already have an active ${TRADE_TYPES[type].label.toLowerCase()} route.` : `Missing: ${allowed.missing.join(', ')}.`}</p>}
      <div><button className="btn" disabled={!partner.trim() || !allowed.ok || !!specialEdictUsed(k)} onClick={() => {
        update('Trade edict', (d) => { const r = startTrade(d, { partner: partner.trim(), settlementId: sId, type, trl, invested, travelTurns: turns }); if (!turns) resolveTrade(d, r.id); });
        setPartner('');
      }}>Send the traders ({invested} BP)</button></div>
    </Panel>
  );
}

function Exploration({ k }: { k: Kingdom }) {
  const [months, setMonths] = useState(1);
  const [note, setNote] = useState('');
  const ids = { m: useId('ex'), n: useId('ex') };
  return (
    <Panel title="Expeditions">
      {(k.expeditions ?? []).map((e) => (
        <div key={e.id} className="row small">
          <span style={{ flex: 1, minWidth: 0 }}><strong>{e.note || 'Explorers'}</strong> · {e.months} month{e.months > 1 ? 's' : ''}, {e.cost} BP</span>
          {e.status === 'out' && e.returnsTurn > k.turn && <span className="chip">Back on turn {e.returnsTurn}</span>}
          {e.status === 'out' && (
            <>
              {e.returnsTurn <= k.turn && <button className="btn sm primary" onClick={() => update('Explorers return', (d) => endExpedition(d, e.id, 'returned'))}>They’re back</button>}
              <button className="btn sm" onClick={() => update('Explorers scattered', (d) => endExpedition(d, e.id, 'scattered'))}>Scattered</button>
              <button className="btn sm ghost danger" onClick={() => update('Explorers lost', (d) => endExpedition(d, e.id, 'lost'))}>Lost</button>
            </>
          )}
          {e.status !== 'out' && <span className="chip">{e.status === 'returned' ? 'Returned' : e.status === 'scattered' ? 'Scattered' : 'Lost'}</span>}
        </div>
      ))}
      <h4>Exploration edict</h4>
      <p className="small muted">Explorers map unclaimed hexes from your capital for the months you pay for (1d4 BP per month, up front). When they return, mark their hexes explored with the map’s Exploration brush. If they meet trouble alone: Stealth DC 10 + twice the CR, then a Stability check (Control DC + twice the CR) or they’re lost.</p>
      <div className="row">
        <label className="field" htmlFor={ids.m}>Months<input id={ids.m} type="number" min={1} max={12} value={months} onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))} /></label>
        <label className="field" htmlFor={ids.n} style={{ flex: 1, minWidth: 140 }}>Route<input id={ids.n} type="text" value={note} placeholder="The southern hills" onChange={(e) => setNote(e.target.value)} /></label>
        <button className="btn" style={{ alignSelf: 'flex-end' }} disabled={!!specialEdictUsed(k)} onClick={() => { update('Exploration edict', (d) => { startExpedition(d, months, note.trim()); }); setNote(''); }}>Send them ({months}d4 BP)</button>
      </div>
    </Panel>
  );
}

function Vassals({ k }: { k: Kingdom }) {
  const [name, setName] = useState('');
  const [viceroy, setViceroy] = useState(k.leaders.viceroy?.name ?? '');
  const [alignment, setAlignment] = useState('N');
  const [size, setSize] = useState(3);
  const [grant, setGrant] = useState(5);
  const [mode, setMode] = useState<'colony' | 'subjugated'>('colony');
  const [relation, setRelation] = useState<'embassy' | 'treaty' | 'alliance'>('alliance');
  const [makeKingdom, setMakeKingdom] = useState(true);
  const ids = Object.fromEntries(['n', 'v', 'a', 's', 'g', 'r'].map((x) => [x, useId(`vs-${x}`)]));
  const maxGrant = Math.floor(Math.max(0, k.treasury) / 4);
  const vassals = (k.foreign ?? []).filter((f) => f.vassal);
  return (
    <Panel title="Vassals and colonies">
      {vassals.map((f) => (
        <div key={f.id} className="row small">
          <strong style={{ flex: 1, minWidth: 0 }}>{f.name}</strong>
          <span className="chip">{f.vassal!.mode === 'colony' ? 'Colony' : 'Subjugated'} · Viceroy {f.vassal!.viceroy}</span>
          {f.vassal!.mode === 'subjugated' && <span className={`chip ${f.vassal!.settled ? 'ok' : 'warn'}`}>{f.vassal!.settled ? 'At peace' : `Loyalty checks each Upkeep (${f.vassal!.peaceStreak}/3)`}</span>}
        </div>
      ))}
      <h4>Vassalage edict</h4>
      <p className="small muted">Found a colony or take a conquered kingdom as a vassal, governed by a Viceroy. Costs 1d4 BP plus a grant of up to a quarter of your Treasury ({maxGrant} BP now). A colony gets an embassy, treaty, or alliance at once; a subjugated kingdom starts with an embassy and needs a Loyalty check every Upkeep (harder by its Size ÷ 5) until three succeed in a row.</p>
      <div className="segmented" role="group" aria-label="Kind of vassal">
        <button aria-pressed={mode === 'colony'} onClick={() => setMode('colony')}>New colony</button>
        <button aria-pressed={mode === 'subjugated'} onClick={() => setMode('subjugated')}>Subjugate a conquered kingdom</button>
      </div>
      <div className="gen-grid">
        <label className="field" htmlFor={ids.n}>Name<input id={ids.n} type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field" htmlFor={ids.v}>Viceroy<input id={ids.v} type="text" value={viceroy} onChange={(e) => setViceroy(e.target.value)} /></label>
        <label className="field" htmlFor={ids.a}>Alignment<select id={ids.a} value={alignment} onChange={(e) => setAlignment(e.target.value)}>{ALIGN.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="field" htmlFor={ids.s}>Size<input id={ids.s} type="number" min={1} value={size} onChange={(e) => setSize(Math.max(1, Number(e.target.value) || 1))} /></label>
        <label className="field" htmlFor={ids.g}>Grant (BP)<input id={ids.g} type="number" min={0} max={maxGrant} value={grant} onChange={(e) => setGrant(Math.max(0, Math.min(maxGrant, Number(e.target.value) || 0)))} /></label>
        {mode === 'colony' && (
          <label className="field" htmlFor={ids.r}>Relationship
            <select id={ids.r} value={relation} onChange={(e) => setRelation(e.target.value as typeof relation)}><option value="embassy">Embassy</option><option value="treaty">Treaty</option><option value="alliance">Alliance</option></select>
          </label>
        )}
      </div>
      <label className="check small"><input type="checkbox" checked={makeKingdom} onChange={(e) => setMakeKingdom(e.target.checked)} /> Also run it as its own kingdom in this app (starting Treasury = the grant)</label>
      <div><button className="btn" disabled={!name.trim() || !viceroy.trim() || !!specialEdictUsed(k)} onClick={() => {
        const g = Math.min(grant, maxGrant);
        update('Vassalage edict', (d) => { vassalEdict(d, { name: name.trim(), viceroy: viceroy.trim(), alignment, size, grant: g, mode, relation, terms: 'balanced' }); });
        if (makeKingdom) {
          const al = { L: 'lawful', N: 'neutral', C: 'chaotic' } as const, mo = { G: 'good', N: 'neutral', E: 'evil' } as const;
          const a = alignment === 'N' ? 'NN' : alignment;
          const v = createKingdom({ name: name.trim(), alignment: { law: al[a[0] as 'L'], moral: mo[a[1] as 'G'] }, startingBP: g + 2, settlementName: `${name.trim()} Hold`, terrain: 'plains' }, 1);
          v.leaders.viceroy = { name: viceroy.trim(), mod: 0, leadershipFeat: false, attrs: [], active: true };
          v.log.unshift({ id: 'vassal', turn: 1, phase: 'setup', text: `Founded as a ${mode === 'colony' ? 'colony' : 'vassal'} of ${k.name}.` });
          addKingdom(v);
        }
        setName('');
      }}>Issue the edict</button></div>
      {makeKingdom && <p className="small muted">The new kingdom opens when you issue the edict; switch back with the kingdom menu at the top.</p>}
    </Panel>
  );
}
