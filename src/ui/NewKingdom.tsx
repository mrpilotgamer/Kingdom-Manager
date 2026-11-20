import { useState } from 'react';
import { ALIGNMENTS, TERRAIN, type Terrain } from '../rules/kingdom';
import { createKingdom } from '../state/factory';
import { addKingdom } from '../state/store';
import { Panel, useId } from './common';

export function NewKingdom({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [align, setAlign] = useState(0);
  const [bp, setBp] = useState(50);
  const [sname, setSname] = useState('');
  const [terrain, setTerrain] = useState<Terrain>('plains');
  const ids = { n: useId('nk'), a: useId('nk'), b: useId('nk'), s: useId('nk'), t: useId('nk') };
  const prep = TERRAIN[terrain].prepCost;
  const ok = name.trim() && sname.trim();
  return (
    <Panel title="Found a kingdom">
      <p className="muted">
        Your first settlement becomes the capital. Founding claims its hex (1 BP) and prepares the site; then you build your
        first buildings from what's left. Ultimate Campaign suggests starting with an Inn, Shrine, Monastery, or Watchtower, plus a House.
      </p>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field" htmlFor={ids.n}>Kingdom name<input id={ids.n} type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field" htmlFor={ids.a}>Alignment
          <select id={ids.a} value={align} onChange={(e) => setAlign(Number(e.target.value))}>
            {ALIGNMENTS.map((a, i) => <option key={a.abbr} value={i}>{a.label}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.b}>Starting build points
          <input id={ids.b} type="number" min={0} value={bp} onChange={(e) => setBp(Number(e.target.value) || 0)} />
        </label>
        <label className="field" htmlFor={ids.s}>Capital name<input id={ids.s} type="text" value={sname} onChange={(e) => setSname(e.target.value)} /></label>
        <label className="field" htmlFor={ids.t}>Capital hex terrain
          <select id={ids.t} value={terrain} onChange={(e) => setTerrain(e.target.value as Terrain)}>
            {Object.entries(TERRAIN).map(([id, t]) => <option key={id} value={id}>{t.label} — prepare for {t.prepCost} BP ({t.prepTime})</option>)}
          </select>
        </label>
      </div>
      <p className="small muted">A wealthy sponsor typically provides 50 BP. You'll start with {bp - 1 - prep} BP after claiming the hex and preparing the site.</p>
      <div className="row">
        <button className="btn primary" disabled={!ok} onClick={() => {
          addKingdom(createKingdom({ name: name.trim(), alignment: ALIGNMENTS[align].value, startingBP: bp, settlementName: sname.trim(), terrain }, prep));
          onDone();
        }}>Found {name.trim() || 'kingdom'}</button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </Panel>
  );
}
