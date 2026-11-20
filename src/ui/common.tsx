import { useState, type ReactNode } from 'react';
import { die } from '../engine/dice';
import { computeStats, fmt } from '../engine/stats';
import { ATTR_LABEL, type Attr } from '../rules/kingdom';
import type { Kingdom } from '../state/types';

export function Signed({ n }: { n: number }) {
  return <span className={`num ${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}`}>{fmt(n)}</span>;
}

export function Panel({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="panel-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

let idSeq = 0;
export function useId(prefix: string) {
  const [id] = useState(() => `${prefix}-${++idSeq}`);
  return id;
}

/**
 * A kingdom check: type the natural d20 you rolled at the table, or let the app roll.
 * Shows what's needed before committing.
 */
export function CheckRow({ k, attr, label, bonus = 0, onResolve, disabled }: {
  k: Kingdom; attr: Attr; label: string; bonus?: number; onResolve: (roll: number) => void; disabled?: boolean;
}) {
  const id = useId('roll');
  const [roll, setRoll] = useState('');
  const st = computeStats(k);
  const mod = st[attr] - k.unrest + bonus;
  const need = Math.min(20, Math.max(2, st.controlDC - mod));
  const n = Number(roll);
  const valid = Number.isInteger(n) && n >= 1 && n <= 20;
  return (
    <div className="stack">
      <p className="small muted">
        {ATTR_LABEL[attr]} {fmt(st[attr])}{k.unrest ? `, Unrest −${k.unrest}` : ''}{bonus ? `, bonus ${fmt(bonus)}` : ''} vs Control DC {st.controlDC}.{' '}
        {k.unrest >= 20 ? <strong className="neg">Anarchy: every check fails.</strong> :
          <>Succeeds on a natural <strong>{need}+</strong> ({Math.round(((21 - need) / 20) * 100)}%).</>}
      </p>
      <div className="row">
        <label htmlFor={id} className="small">Natural d20</label>
        <input id={id} type="number" min={1} max={20} value={roll} onChange={(e) => setRoll(e.target.value)} disabled={disabled} />
        <button className="btn" disabled={disabled || !valid} onClick={() => { onResolve(n); setRoll(''); }}>{label}</button>
        <button className="btn primary" disabled={disabled} onClick={() => onResolve(die(20))}>Roll for me</button>
      </div>
    </div>
  );
}

export function NumberField({ label, value, onChange, min, max, id }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; id: string;
}) {
  return (
    <label className="field" htmlFor={id}>
      {label}
      <input id={id} type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

export function Crest() {
  return (
    <svg className="crest" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 3 L35 8 V19 C35 28 28 34 20 37 C12 34 5 28 5 19 V8 Z" fill="var(--accent)" />
      <path d="M12 23 L15 14 L20 19 L25 14 L28 23 Z" fill="var(--gold)" />
      <rect x="12" y="24" width="16" height="3" rx="1" fill="var(--gold)" />
    </svg>
  );
}
