import { Fragment, useState } from 'react';
import { fmt, kingdomSettlementModifiers, settlementModifiers, type SettlementMods } from '../engine/stats';
import { SETTLEMENT_STATS, STAT_HINT, STAT_LABEL, type SettlementStat } from '../rules/settlement';
import { update } from '../state/store';
import type { Kingdom, Settlement } from '../state/types';
import { uid } from '../state/util';
import { Panel, Signed, useId } from './common';

function ModsTable({ mods }: { mods: SettlementMods }) {
  const [open, setOpen] = useState<SettlementStat | null>(null);
  return (
    <table className="breakdown smods">
      <tbody>
        {SETTLEMENT_STATS.map((st) => (
          <Fragment key={st}>
            <tr className="smod-row" onClick={() => setOpen(open === st ? null : st)} title={STAT_HINT[st]}>
              <td>
                <button className="linklike" aria-expanded={open === st}>{STAT_LABEL[st]}</button>
              </td>
              <td><Signed n={mods.values[st]} /></td>
            </tr>
            {open === st && (
              <tr>
                <td colSpan={2} className="smod-detail">
                  <div className="small muted">{STAT_HINT[st]}.</div>
                  {mods.breakdown[st].length ? (
                    <table className="breakdown small"><tbody>
                      {mods.breakdown[st].map((l, i) => <tr key={i}><td>{l.label}</td><td><Signed n={l.value} /></td></tr>)}
                    </tbody></table>
                  ) : <div className="small muted">Nothing changes it yet.</div>}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

/** A settlement's Corruption, Crime, Law, Lore, Productivity, and Society, plus GM adjustments. */
export function SettlementModsPanel({ k, s }: { k: Kingdom; s: Settlement }) {
  const mods = settlementModifiers(k, s);
  return (
    <Panel title="Settlement modifiers">
      <p className="small muted">Tap one to see where it comes from. They apply to skill checks in {s.name} and feed Fame and Infamy.</p>
      <ModsTable mods={mods} />
      <Adjustments k={k} settlementId={s.id} />
    </Panel>
  );
}

export function KingdomModsPanel({ k }: { k: Kingdom }) {
  return (
    <Panel title="Kingdom-wide settlement modifiers">
      <p className="small muted">All settlements added together ÷ 10, plus alignment (Expanding Settlement Modifiers). For rolls in a settlement, use the higher of this and the settlement’s own value.</p>
      <ModsTable mods={kingdomSettlementModifiers(k)} />
      <Adjustments k={k} />
    </Panel>
  );
}

function Adjustments({ k, settlementId }: { k: Kingdom; settlementId?: string }) {
  const [adding, setAdding] = useState(false);
  const [stat, setStat] = useState<SettlementStat>('law');
  const [value, setValue] = useState(1);
  const [label, setLabel] = useState('');
  const ids = { s: useId('adj'), v: useId('adj'), l: useId('adj') };
  const list = (k.settlementAdjustments ?? []).filter((a) => a.settlementId === settlementId);
  return (
    <div className="stack">
      {list.length > 0 && (
        <table className="breakdown small"><tbody>
          {list.map((a) => (
            <tr key={a.id}>
              <td>
                {a.label}: {SETTLEMENT_STATS.filter((st) => a.mods[st]).map((st) => `${STAT_LABEL[st]} ${fmt(a.mods[st]!)}`).join(', ')}
                <span className="muted">{a.until === 'event' ? ' · while the event lasts' : a.until === 'next-event' ? ' · until next Event phase' : a.expiresTurn ? ` · until turn ${a.expiresTurn}` : ''}</span>
              </td>
              <td style={{ width: 'auto' }}>
                <button className="btn sm ghost danger" onClick={() => update('Remove adjustment', (d) => { d.settlementAdjustments = d.settlementAdjustments!.filter((x) => x.id !== a.id); })}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      )}
      {adding ? (
        <div className="row">
          <label className="field" htmlFor={ids.l} style={{ flex: 1, minWidth: 120 }}>Why<input id={ids.l} type="text" value={label} placeholder="Thieves’ guild" onChange={(e) => setLabel(e.target.value)} /></label>
          <label className="field" htmlFor={ids.s}>Modifier
            <select id={ids.s} value={stat} onChange={(e) => setStat(e.target.value as SettlementStat)}>
              {SETTLEMENT_STATS.map((st) => <option key={st} value={st}>{STAT_LABEL[st]}</option>)}
            </select>
          </label>
          <label className="field" htmlFor={ids.v}>By<input id={ids.v} type="number" value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} /></label>
          <button className="btn sm primary" style={{ alignSelf: 'flex-end' }} disabled={!value} onClick={() => {
            update('Add adjustment', (d) => {
              (d.settlementAdjustments ??= []).push({ id: uid(), label: label.trim() || 'GM adjustment', settlementId, mods: { [stat]: value } });
            });
            setAdding(false); setLabel('');
          }}>Add</button>
          <button className="btn sm ghost" style={{ alignSelf: 'flex-end' }} onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : <div><button className="btn sm" onClick={() => setAdding(true)}>Add an adjustment</button></div>}
    </div>
  );
}
