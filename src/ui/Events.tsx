import { useState } from 'react';
import { log } from '../engine/actions';
import { continueEvent, eventCheck, isContinuous, resolveEvent, trackEvent, type RolledEvent } from '../engine/turn';
import { ATTR_LABEL, ATTRS, type Attr } from '../rules/kingdom';
import { update } from '../state/store';
import type { ActiveEvent, Kingdom } from '../state/types';
import { CheckRow, Panel, useId } from './common';

const HIRE = [
  { bonus: 0, cost: 0, label: 'No adventurers' },
  { bonus: 2, cost: 4, label: 'Levels 1–2: +2 for 4 BP' },
  { bonus: 5, cost: 8, label: 'Levels 3–5: +5 for 8 BP' },
  { bonus: 10, cost: 16, label: 'Level 6+: +10 for 16 BP' },
];

/** Default check for an event: whichever attribute its rules text mentions first. */
function guessAttr(text: string): Attr {
  const hits = ATTRS.map((a) => [a, text.indexOf(`${ATTR_LABEL[a]} check`)] as const).filter(([, i]) => i >= 0);
  return hits.sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'stability';
}

export function since(k: Kingdom, e: ActiveEvent) {
  const n = k.turn - e.startedTurn;
  return n === 0 ? 'began this turn' : `since turn ${e.startedTurn} (${n + 1} turns)`;
}

export function OngoingEventCard({ k, e, eventPhase }: { k: Kingdom; e: ActiveEvent; eventPhase: boolean }) {
  const [attr, setAttr] = useState<Attr>(() => guessAttr(e.text));
  const [bonus, setBonus] = useState(0);
  const [hire, setHire] = useState(0);
  const [open, setOpen] = useState(false);
  const ids = { attr: useId('ev'), bonus: useId('ev'), hire: useId('ev'), loc: useId('ev') };
  const hiredThisPhase = !!k.turnState.done['event.hired'];
  const dealt = e.addressedTurn === k.turn;
  const h = HIRE[hire];
  return (
    <div className="event-card">
      <div className="row">
        <h3>{e.name}</h3>
        {e.location && <span className="chip">{e.location}</span>}
        <span className={`chip ${e.lasts === 'resolved' ? 'warn' : ''}`}>{e.lasts === 'resolved' ? 'Until resolved' : 'Until next Event phase'}</span>
        <span className="spacer" />
        <span className="small muted">{since(k, e)}</span>
      </div>
      <p className="small">{e.text}</p>
      {e.history.length > 1 && (
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          {e.history.slice(-4).map((x, i) => <li key={i}>Turn {x.turn}: {x.text}</li>)}
        </ul>
      )}
      {eventPhase && e.lasts === 'resolved' && (
        <div className="stack">
          <div className="row">
            <label className="field" htmlFor={ids.attr}>Check
              <select id={ids.attr} value={attr} onChange={(x) => setAttr(x.target.value as Attr)}>
                {ATTRS.map((a) => <option key={a} value={a}>{ATTR_LABEL[a]}</option>)}
              </select>
            </label>
            <label className="field" htmlFor={ids.bonus}>Modifier
              <input id={ids.bonus} type="number" value={bonus} onChange={(x) => setBonus(Number(x.target.value) || 0)} />
            </label>
            <label className="field" htmlFor={ids.hire}>Hire adventurers
              <select id={ids.hire} value={hire} disabled={hiredThisPhase} onChange={(x) => setHire(Number(x.target.value))}>
                {HIRE.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
              </select>
            </label>
          </div>
          {hiredThisPhase && <p className="small muted">Adventurers were already hired this Event phase.</p>}
          <CheckRow k={k} attr={attr} bonus={bonus + h.bonus} label="Check" onResolve={(roll) => update(`${e.name} check`, (d) => {
            if (h.cost && !d.turnState.done['event.hired']) {
              d.treasury -= h.cost;
              d.turnState.done['event.hired'] = e.name;
              log(d, `Hired adventurers for ${e.name} (+${h.bonus}).`, { bp: -h.cost });
            }
            eventCheck(d, e.id, attr, roll, bonus + h.bonus);
          })} />
          <p className="small muted">Apply the check's effects with Quick adjust or an ongoing modifier, then mark the event resolved or let it continue.</p>
        </div>
      )}
      <div className="row">
        {e.lasts === 'resolved' && eventPhase && !dealt && (
          <button className="btn sm" onClick={() => update('Event continues', (d) => continueEvent(d, e.id))}>It continues</button>
        )}
        <button className="btn sm" onClick={() => update('Resolve event', (d) => resolveEvent(d, e.id))}>{e.lasts === 'resolved' ? 'Resolved' : 'End it now'}</button>
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Edit place'}</button>
        {dealt && e.startedTurn < k.turn && <span className="chip ok">Dealt with this turn</span>}
      </div>
      {open && (
        <label className="field" htmlFor={ids.loc}>Where it's happening
          <input id={ids.loc} type="text" value={e.location ?? ''} placeholder="Settlement or hex"
            onChange={(x) => update('Edit event place', (d) => { d.events!.find((y) => y.id === e.id)!.location = x.target.value || undefined; })} />
        </label>
      )}
    </div>
  );
}

/** A freshly rolled event, with whether it's being carried over. */
export function RolledEventCard({ k, e }: { k: Kingdom; e: RolledEvent }) {
  const tracked = (k.events ?? []).find((x) => x.eventId === e.id && x.startedTurn === k.turn);
  return (
    <div className="event-card">
      <div className="row">
        <h3>{e.name}</h3>
        {e.tags && <span className="chip">{e.tags}</span>}
        {tracked?.location && <span className="chip">{tracked.location}</span>}
        <span className="spacer" />
        <span className="small muted">{e.table}, d% {e.roll}</span>
      </div>
      <p className="small">{e.text}</p>
      <div className="row small">
        {tracked ? (
          <span className={`chip ${tracked.lasts === 'resolved' ? 'warn' : ''}`}>
            {tracked.lasts === 'resolved' ? 'Continuous: kept on the ongoing list until resolved' : 'Kept until the next Event phase'}
          </span>
        ) : (
          <>
            <span className="muted">Happens once.</span>
            <button className="btn sm" onClick={() => update('Keep event', (d) => {
              trackEvent(d, { eventId: e.id, name: e.name, tags: e.tags, text: e.text }, isContinuous(e.tags) ? 'resolved' : 'next-event');
            })}>Keep it on the list anyway</button>
          </>
        )}
      </div>
    </div>
  );
}

export function AddEventForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [where, setWhere] = useState('');
  const [lasts, setLasts] = useState<ActiveEvent['lasts']>('resolved');
  const ids = { n: useId('ae'), t: useId('ae'), w: useId('ae'), l: useId('ae') };
  if (!open) return <div><button className="btn sm" onClick={() => setOpen(true)}>Add a campaign event</button></div>;
  return (
    <div className="stack">
      <div className="row">
        <label className="field" htmlFor={ids.n} style={{ flex: 1 }}>Event<input id={ids.n} type="text" value={name} placeholder="Troll raids" onChange={(e) => setName(e.target.value)} /></label>
        <label className="field" htmlFor={ids.w}>Where<input id={ids.w} type="text" value={where} placeholder="Optional" onChange={(e) => setWhere(e.target.value)} /></label>
        <label className="field" htmlFor={ids.l}>Lasts
          <select id={ids.l} value={lasts} onChange={(e) => setLasts(e.target.value as ActiveEvent['lasts'])}>
            <option value="resolved">Until resolved</option>
            <option value="next-event">Until the next Event phase</option>
          </select>
        </label>
      </div>
      <label className="field" htmlFor={ids.t}>What happens<textarea id={ids.t} rows={2} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <div className="row">
        <button className="btn primary" disabled={!name.trim()} onClick={() => {
          update('Add event', (d) => trackEvent(d, { name: name.trim(), tags: lasts === 'resolved' ? 'Campaign, Continuous' : 'Campaign', text: text.trim() }, lasts, where.trim() || undefined));
          setOpen(false); setName(''); setText(''); setWhere('');
        }}>Add event</button>
        <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/** Compact list for the Kingdom tab. */
export function OngoingSummary({ k, onOpen }: { k: Kingdom; onOpen: () => void }) {
  const events = k.events ?? [];
  if (!events.length) return null;
  return (
    <Panel title="Ongoing events" actions={<button className="btn sm" onClick={onOpen}>Open Event phase</button>}>
      <table className="breakdown"><tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td><strong>{e.name}</strong>{e.location ? ` · ${e.location}` : ''} <span className="small muted">{since(k, e)}</span></td>
            <td style={{ width: 'auto', whiteSpace: 'nowrap' }}><span className={`chip ${e.lasts === 'resolved' ? 'warn' : ''}`}>{e.lasts === 'resolved' ? 'Until resolved' : 'Until next Event'}</span></td>
          </tr>
        ))}
      </tbody></table>
    </Panel>
  );
}
