import { useState } from 'react';
import { adjust } from '../engine/actions';
import { computeStats, fmt, settlementStats } from '../engine/stats';
import { HOLIDAY, PROMOTION, TAXATION } from '../rules/kingdom';
import { ROLE_BY_ID } from '../rules/leadership';
import { update } from '../state/store';
import type { Kingdom } from '../state/types';
import { uid } from '../state/util';
import { Panel, Signed, useId } from './common';

type Key = 'economy' | 'loyalty' | 'stability' | 'consumption';

export function Warnings({ k }: { k: Kingdom }) {
  const st = computeStats(k);
  const items: { tone: 'bad' | '' | 'info'; text: string }[] = [];
  if (k.unrest >= 20) items.push({ tone: 'bad', text: 'Unrest is 20: the kingdom is in anarchy. It can take no actions and every check result counts as 0.' });
  else if (k.unrest >= 11) items.push({ tone: 'bad', text: `Unrest is ${k.unrest}: the kingdom loses 1 hex every Upkeep phase until Unrest drops below 11.` });
  if (k.treasury < 0) items.push({ tone: 'bad', text: `The Treasury is in debt (${k.treasury} BP). Paying Consumption from a negative Treasury adds 2 Unrest.` });
  if (!st.rulerCovered) items.push({ tone: 'bad', text: 'No Ruler: the kingdom cannot claim hexes, create Farms, build Roads, or buy districts, and gains 4 Unrest each Upkeep.' });
  else if (st.rulerCovered !== 'ruler') items.push({ tone: '', text: `The ${ROLE_BY_ID[st.rulerCovered].name} is standing in for the Ruler (Loyalty check each Upkeep or Unrest +1).` });
  for (const id of st.vacancies.filter((v) => v !== 'ruler'))
    items.push({ tone: '', text: `${ROLE_BY_ID[id].name} is vacant: ${ROLE_BY_ID[id].vacancyText}` });
  for (const a of ['economy', 'loyalty', 'stability'] as const)
    if (st[a] < 0) items.push({ tone: '', text: `${a[0].toUpperCase() + a.slice(1)} is negative: +1 Unrest each Upkeep.` });
  if (!items.length) return null;
  return (
    <div className="stack">
      {items.map((i) => <div key={i.text} className={`callout ${i.tone}`}>{i.text}</div>)}
    </div>
  );
}

export function Overview({ k }: { k: Kingdom }) {
  const st = computeStats(k);
  const [open, setOpen] = useState<Key>('economy');
  const cards: { key: Key | null; label: string; value: string; sub: string }[] = [
    { key: 'economy', label: 'Economy', value: fmt(st.economy), sub: `check ${fmt(st.economy - k.unrest)} after Unrest` },
    { key: 'loyalty', label: 'Loyalty', value: fmt(st.loyalty), sub: `check ${fmt(st.loyalty - k.unrest)} after Unrest` },
    { key: 'stability', label: 'Stability', value: fmt(st.stability), sub: `check ${fmt(st.stability - k.unrest)} after Unrest` },
    { key: null, label: 'Unrest', value: String(k.unrest), sub: k.unrest >= 11 ? 'losing hexes' : 'subtracted from checks' },
    { key: 'consumption', label: 'Consumption', value: String(st.consumption), sub: 'BP paid each Upkeep' },
    { key: null, label: 'Treasury', value: `${k.treasury}`, sub: 'build points' },
    { key: null, label: 'Control DC', value: String(st.controlDC), sub: `20 + Size ${k.size} + ${st.districts} district${st.districts === 1 ? '' : 's'}` },
    { key: null, label: 'Fame', value: String(st.fame), sub: 'from buildings and events' },
  ];
  const lines = st.breakdown[open];
  const total = lines.reduce((n, l) => n + l.value, 0);
  return (
    <>
      <Warnings k={k} />
      <div className="stats">
        {cards.map((c) => (
          <button key={c.label} className="stat" aria-pressed={c.key === open} disabled={!c.key}
            style={c.key ? undefined : { cursor: 'default' }} onClick={() => c.key && setOpen(c.key)}>
            <span className="k">{c.label}</span>
            <span className="v">{c.value}</span>
            <span className="sub">{c.sub}</span>
          </button>
        ))}
      </div>
      <div className="grid-2">
        <Panel title={`Where ${open[0].toUpperCase() + open.slice(1)} comes from`}>
          <table className="breakdown">
            <tbody>
              {lines.map((l, i) => <tr key={i}><td>{l.label}</td><td><Signed n={l.value} /></td></tr>)}
              <tr className="total"><td>Total{open === 'consumption' && total < 0 ? ' (cannot go below 0)' : ''}</td><td>{open === 'consumption' ? st.consumption : fmt(total)}</td></tr>
            </tbody>
          </table>
        </Panel>
        <div className="stack" style={{ gap: 20 }}>
          <Edicts k={k} />
          <ThisTurn k={k} />
        </div>
      </div>
      <div className="grid-2">
        <Settlements k={k} />
        <QuickAdjust />
      </div>
      <Modifiers k={k} />
    </>
  );
}

export function Edicts({ k }: { k: Kingdom }) {
  const st = computeStats(k);
  const ids = { holiday: useId('hol'), promotion: useId('pro'), taxation: useId('tax') };
  const rows = [
    { key: 'holiday' as const, label: 'Holidays', table: HOLIDAY, note: st.holidayBlocked ? 'No Councilor: holidays give no Loyalty bonus.' : '' },
    { key: 'promotion' as const, label: 'Promotion', table: PROMOTION, note: '' },
    { key: 'taxation' as const, label: 'Taxation', table: TAXATION, note: st.canCollectTaxes ? '' : 'No Treasurer: taxation counts as None.' },
  ];
  const describe = (l: (typeof HOLIDAY)[number]) =>
    [l.economy ? `Eco ${fmt(l.economy)}` : '', l.loyalty ? `Loy ${fmt(l.loyalty)}` : '', l.stability ? `Stab ${fmt(l.stability)}` : '',
      l.consumption ? `Cons +${l.consumption}` : ''].filter(Boolean).join(', ');
  return (
    <Panel title="Edicts">
      {rows.map((r) => (
        <div key={r.key} className="stack" style={{ gap: 4 }}>
          <label className="field" htmlFor={ids[r.key]}>
            {r.label}
            <select id={ids[r.key]} value={k.edicts[r.key]}
              onChange={(e) => update(`Set ${r.label} edict`, (d) => { d.edicts[r.key] = Number(e.target.value); })}>
              {r.table.map((l, i) => <option key={l.label} value={i}>{l.label} — {describe(l) || 'no effect'}</option>)}
            </select>
          </label>
          {r.note && <span className="small neg">{r.note}</span>}
        </div>
      ))}
    </Panel>
  );
}

function ThisTurn({ k }: { k: Kingdom }) {
  const st = computeStats(k);
  const t = k.turnState;
  const rows: [string, number, number][] = [
    ['Buildings', t.buildings, st.limits.buildings],
    ['Terrain improvements', t.improvements, st.limits.improvements],
    ['Hex claims', t.hexClaims, st.limits.hexClaims],
    ['New settlements or armies', t.settlements, st.limits.settlements],
  ];
  return (
    <Panel title={`Turn ${k.turn} limits`}>
      <p className="small muted">From Table 4–4 for Size {k.size}. The first House, Mansion, Noble Villa, or Tenement each turn is free{t.freeHousingUsed ? ' (used this turn)' : ''}.</p>
      <table className="breakdown">
        <tbody>
          {rows.map(([label, used, max]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className={used > max ? 'neg' : ''}>{used} / {Number.isFinite(max) ? max : '∞'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Settlements({ k }: { k: Kingdom }) {
  return (
    <Panel title="Settlements">
      {k.settlements.length === 0 && <p className="muted">No settlements yet. Found one on the Settlements tab.</p>}
      <table className="list">
        <thead><tr><th>Name</th><th>Size</th><th>Pop.</th><th>Base value</th><th>Defense</th></tr></thead>
        <tbody>
          {k.settlements.map((s, i) => {
            const ss = settlementStats(s);
            return (
              <tr key={s.id}>
                <td>{s.name}{i === 0 && <span className="chip" style={{ marginLeft: 6 }}>Capital</span>}</td>
                <td>{ss.sizeLabel}</td>
                <td className="num">{ss.population.toLocaleString()}</td>
                <td className="num">{ss.baseValue.toLocaleString()} gp</td>
                <td className="num">{ss.defense}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function QuickAdjust() {
  const [what, setWhat] = useState<'treasury' | 'unrest' | 'fame'>('treasury');
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const ids = { what: useId('qa'), amt: useId('qa'), why: useId('qa') };
  const go = (sign: 1 | -1) => {
    const delta = sign * Math.abs(amount);
    const label = { treasury: 'Treasury', unrest: 'Unrest', fame: 'Fame' }[what];
    update(`Adjust ${label}`, (d) => adjust(d, what, delta, `${label} ${fmt(delta)}${reason ? `: ${reason}` : ''}.`));
    setReason('');
  };
  return (
    <Panel title="Quick adjust">
      <p className="small muted">For event results, GM rulings, and anything the app doesn't automate. Every change is logged.</p>
      <div className="row">
        <label className="field" htmlFor={ids.what}>Change
          <select id={ids.what} value={what} onChange={(e) => setWhat(e.target.value as typeof what)}>
            <option value="treasury">Treasury (BP)</option>
            <option value="unrest">Unrest</option>
            <option value="fame">Fame</option>
          </select>
        </label>
        <label className="field" htmlFor={ids.amt}>By
          <input id={ids.amt} type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </label>
        <label className="field" htmlFor={ids.why} style={{ flex: 1, minWidth: 160 }}>Reason
          <input id={ids.why} type="text" value={reason} placeholder="e.g. Economic boom event" onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button className="btn" onClick={() => go(1)}>Add</button>
        <button className="btn" onClick={() => go(-1)}>Subtract</button>
      </div>
    </Panel>
  );
}

function Modifiers({ k }: { k: Kingdom }) {
  const set = (id: string, field: 'label' | 'economy' | 'loyalty' | 'stability' | 'consumption', v: string) =>
    update('Edit modifier', (d) => {
      const m = d.modifiers.find((x) => x.id === id)!;
      if (field === 'label') m.label = v;
      else m[field] = Number(v) || 0;
    });
  return (
    <Panel title="Ongoing modifiers" actions={
      <button className="btn sm" onClick={() => update('Add modifier', (d) => {
        d.modifiers.push({ id: uid(), label: 'New modifier', economy: 0, loyalty: 0, stability: 0, consumption: 0 });
      })}>Add modifier</button>}>
      <p className="small muted">Lasting effects from events, magic, or house rules (for example, Good Weather: Economy +2, Loyalty +2 until the next Event phase).</p>
      {k.modifiers.length > 0 && (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Source</th><th>Eco</th><th>Loy</th><th>Stab</th><th>Cons</th><th /></tr></thead>
            <tbody>
              {k.modifiers.map((m) => (
                <tr key={m.id}>
                  <td><input type="text" aria-label="Source" value={m.label} onChange={(e) => set(m.id, 'label', e.target.value)} /></td>
                  {(['economy', 'loyalty', 'stability', 'consumption'] as const).map((f) => (
                    <td key={f}><input type="number" aria-label={f} value={m[f]} onChange={(e) => set(m.id, f, e.target.value)} /></td>
                  ))}
                  <td><button className="btn sm danger" onClick={() => update('Remove modifier', (d) => { d.modifiers = d.modifiers.filter((x) => x.id !== m.id); })}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
