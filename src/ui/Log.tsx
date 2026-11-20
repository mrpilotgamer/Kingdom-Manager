import { fmt } from '../engine/stats';
import type { Kingdom } from '../state/types';
import { Panel, Signed } from './common';

export function Log({ k }: { k: Kingdom }) {
  const turns = [...new Set(k.log.map((e) => e.turn))].sort((a, b) => b - a);
  return (
    <Panel title="Chronicle">
      <p className="small muted">Every change to the kingdom, newest first. Use Undo in the header to take back a mistake.</p>
      {!k.log.length && <p className="muted">Nothing has happened yet.</p>}
      {turns.map((t) => (
        <div key={t} className="log-turn">
          <h3>Turn {t}</h3>
          {k.log.filter((e) => e.turn === t).map((e) => (
            <div key={e.id} className="log-entry">
              <span>{e.text}</span>
              <span className="small">{e.bp ? <><Signed n={e.bp} /> BP</> : ''}</span>
              <span className="small">{e.unrest ? <><span className={`num ${e.unrest > 0 ? 'neg' : 'pos'}`}>{fmt(e.unrest)}</span> Unrest</> : ''}</span>
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}
