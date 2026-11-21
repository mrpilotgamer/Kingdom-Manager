import { useState } from 'react';
import { log } from '../engine/actions';
import { actionsFor, bonusesFor, runAction, type EventAction } from '../engine/eventEffects';
import { computeStats } from '../engine/stats';
import { checkModsFor, continueEvent, eventCheck, resolveEvent, trackEvent, type RolledEvent } from '../engine/turn';
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
  const [open, setOpen] = useState(false);
  const ids = { loc: useId('ev') };
  const actions = actionsFor(k, e);
  const canAct = eventPhase && actions.length > 0 && e.handledTurn !== k.turn;
  const lastsLabel = e.lasts === 'resolved' ? 'Until resolved' : e.lasts === 'next-event' ? 'Until next Event phase' : 'This turn';
  const latest = e.history.filter((h) => h.turn === k.turn && !/^(Began|Happened)/.test(h.text)).slice(-1)[0];
  return (
    <div className="event-card">
      <div className="row">
        <h3>{e.name}</h3>
        {e.location && <span className="chip">{e.location}</span>}
        <span className={`chip ${e.lasts === 'resolved' ? 'warn' : ''}`}>{lastsLabel}</span>
        <span className="spacer" />
        <span className="small muted">{since(k, e)}</span>
      </div>
      <p className="small">{e.text}</p>
      {e.state?.demand && <p className="callout">The citizens demand you <strong>{e.state.demand}</strong>.</p>}
      {e.state?.offer && <p className="callout info">Offers to build a <strong>{e.state.offer}</strong> at no cost.</p>}
      {e.history.length > 1 && (
        <ul className="small muted event-history">
          {e.history.slice(-4).map((x, i) => <li key={i}>Turn {x.turn}: {x.text}</li>)}
        </ul>
      )}
      {latest && !canAct && <p className="result small">This turn: {latest.text}</p>}
      {canAct && <EventActions k={k} e={e} actions={actions} />}
      {eventPhase && actions.length === 0 && e.lasts === 'resolved' && <ManualCheck k={k} e={e} />}
      <div className="row">
        {e.lasts === 'resolved' && eventPhase && actions.length === 0 && e.addressedTurn !== k.turn && (
          <button className="btn sm" onClick={() => update('Event continues', (d) => continueEvent(d, e.id))}>It continues</button>
        )}
        {e.lasts !== 'once' && (
          <button className="btn sm ghost" onClick={() => update('Resolve event', (d) => resolveEvent(d, e.id))}>
            {e.lasts === 'resolved' ? 'Mark resolved' : 'End it now'}
          </button>
        )}
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Edit place'}</button>
        {e.handledTurn === k.turn && e.startedTurn <= k.turn && actions.length > 0 && <span className="chip ok">Done this turn</span>}
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

/** The event's own choices, with the checks each one calls for. */
function EventActions({ k, e, actions }: { k: Kingdom; e: ActiveEvent; actions: EventAction[] }) {
  const [actionId, setActionId] = useState(actions[0].id);
  const a = actions.find((x) => x.id === actionId) ?? actions[0];
  const [rolls, setRolls] = useState<string[]>([]);
  const [extra, setExtra] = useState(0);
  const [hire, setHire] = useState(0);
  const ids = { extra: useId('ea'), hire: useId('ea') };
  const st = computeStats(k);
  const hiredThisPhase = !!k.turnState.done['event.hired'];
  const bonuses = bonusesFor(k, e, a);
  const h = HIRE[hire];
  const parsed = (a.checks ?? []).map((_, i) => {
    const n = Number(rolls[i]);
    return rolls[i] && Number.isInteger(n) && n >= 1 && n <= 20 ? n : undefined;
  });
  const go = (useTyped: boolean) => update(`${e.name}: ${a.label}`, (d) => {
    if (h.cost && a.checks?.length && !d.turnState.done['event.hired']) {
      d.treasury -= h.cost;
      d.turnState.done['event.hired'] = e.name;
      log(d, `Hired adventurers for ${e.name} (+${h.bonus} on one check).`, { bp: -h.cost });
    }
    runAction(d, e.id, a.id, useTyped ? parsed : [], extra, a.checks?.length ? h.bonus : 0);
  });
  return (
    <div className="stack event-actions">
      {actions.length > 1 && (
        <div className="segmented" role="group" aria-label={`What to do about ${e.name}`}>
          {actions.map((x) => <button key={x.id} aria-pressed={x.id === a.id} onClick={() => { setActionId(x.id); setRolls([]); }}>{x.label}</button>)}
        </div>
      )}
      {actions.length === 1 && <strong className="small">{a.label}</strong>}
      {a.checks?.map((c, i) => {
        const b = bonuses[i].value + extra + (i === 0 ? h.bonus : 0) + checkModsFor(k, c.attr, true).reduce((n, m) => n + m.value, 0);
        const need = Math.min(20, Math.max(2, st.controlDC - (st[c.attr] - k.unrest + b)));
        return (
          <div key={i} className="row small">
            <span style={{ minWidth: '7em' }}><strong>{ATTR_LABEL[c.attr]}</strong> check</span>
            <input type="number" min={1} max={20} aria-label={`Natural d20 for ${ATTR_LABEL[c.attr]} check ${i + 1}`} placeholder="d20"
              value={rolls[i] ?? ''} onChange={(x) => { const r = [...rolls]; r[i] = x.target.value; setRolls(r); }} />
            <span className="muted">needs {need}+{bonuses[i].why ? ` · ${bonuses[i].why}` : ''}</span>
          </div>
        );
      })}
      {a.autoChecks && <p className="small muted">The app rolls a Stability check for each threatened {a.autoChecks.includes('lot') ? 'lot' : 'hex'} ({a.autoChecks}).</p>}
      {a.checks && a.checks.length > 0 && (
        <div className="row">
          <label className="field" htmlFor={ids.extra}>Other modifier
            <input id={ids.extra} type="number" value={extra} onChange={(x) => setExtra(Number(x.target.value) || 0)} />
          </label>
          <label className="field" htmlFor={ids.hire}>Hire adventurers (first check)
            <select id={ids.hire} value={hire} disabled={hiredThisPhase} onChange={(x) => setHire(Number(x.target.value))}>
              {HIRE.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {hiredThisPhase && a.checks?.length ? <p className="small muted">Adventurers were already hired this Event phase.</p> : null}
      <div className="row">
        {a.checks?.length ? (
          <>
            <button className="btn" disabled={parsed.some((p) => p === undefined)} onClick={() => go(true)}>Use these rolls</button>
            <button className="btn primary" onClick={() => go(false)}>Roll for me</button>
          </>
        ) : (
          <button className="btn primary" onClick={() => go(false)}>{a.autoChecks ? 'Roll for me' : 'Do it'}</button>
        )}
      </div>
    </div>
  );
}

/** For campaign events: a plain kingdom check whose effects the GM applies. */
function ManualCheck({ k, e }: { k: Kingdom; e: ActiveEvent }) {
  const [attr, setAttr] = useState<Attr>(() => guessAttr(e.text));
  const [bonus, setBonus] = useState(0);
  const ids = { attr: useId('mc'), bonus: useId('mc') };
  return (
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
      </div>
      <CheckRow k={k} attr={attr} bonus={bonus} label="Check" onResolve={(roll) => update(`${e.name} check`, (d) => { eventCheck(d, e.id, attr, roll, bonus); })} />
      <p className="small muted">Apply the effects with Quick adjust or an ongoing modifier, then mark it resolved or let it continue.</p>
    </div>
  );
}

/** The dice behind a freshly rolled event (the event itself appears as a card in the list). */
export function RolledLine({ e }: { e: RolledEvent }) {
  return <span className="small muted">{e.name}: {e.table}, d% {e.roll}</span>;
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
            <td style={{ width: 'auto', whiteSpace: 'nowrap' }}><span className={`chip ${e.lasts === 'resolved' ? 'warn' : ''}`}>{e.lasts === 'resolved' ? 'Until resolved' : e.lasts === 'once' ? 'This turn' : 'Until next Event'}</span></td>
          </tr>
        ))}
      </tbody></table>
    </Panel>
  );
}
