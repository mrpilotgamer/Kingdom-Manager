import { useMemo, useState } from 'react';
import { HEX_TERRAIN } from '../engine/map';
import { DEFAULT_GEN, generateMap, randomSeed, type GenOptions } from '../engine/mapgen';
import { ALIGNMENTS, TERRAIN, type Terrain } from '../rules/kingdom';
import { GOVERNMENTS, type Government } from '../rules/settlement';
import { createKingdom } from '../state/factory';
import { addKingdom } from '../state/store';
import { Panel, useId } from './common';
import { GenOptionsForm } from './HexMap';
import { MiniMap } from './MiniMap';

const SIZES = { small: [12, 10], medium: [16, 12], large: [24, 18], huge: [32, 24] } as const;
type MapSize = keyof typeof SIZES;

export function NewKingdom({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [align, setAlign] = useState(0);
  const [bp, setBp] = useState(50);
  const [sname, setSname] = useState('');
  const [terrain, setTerrain] = useState<Terrain>('plains');
  const [random, setRandom] = useState(true);
  const [gov, setGov] = useState<Government>('autocracy');
  const [renown, setRenown] = useState<'fame' | 'infamy'>('fame');
  const [gen, setGen] = useState<GenOptions>(() => ({ ...DEFAULT_GEN, seed: randomSeed() }));
  const [size, setSize] = useState<MapSize>('medium');
  const ids = { n: useId('nk'), a: useId('nk'), b: useId('nk'), s: useId('nk'), t: useId('nk'), size: useId('nk'), gov: useId('nk') };
  const generated = useMemo(() => (random ? generateMap(gen, SIZES[size][0], SIZES[size][1]) : null), [random, gen, size]);
  const capitalTerrain = (generated ? generated.map.hexes[generated.capital].terrain : terrain) as Terrain;
  const prep = TERRAIN[capitalTerrain].prepCost;
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
        <label className="field" htmlFor={ids.gov}>Government
          <select id={ids.gov} value={gov} onChange={(e) => setGov(e.target.value as Government)}>
            {Object.entries(GOVERNMENTS).map(([id, g]) => <option key={id} value={id}>{g.label}</option>)}
          </select>
        </label>
        <div className="field">Known for
          <div className="segmented" role="group" aria-label="Starting reputation">
            <button aria-pressed={renown === 'fame'} onClick={() => setRenown('fame')}>Fame 1</button>
            <button aria-pressed={renown === 'infamy'} onClick={() => setRenown('infamy')}>Infamy 1</button>
          </div>
        </div>
        <label className="field" htmlFor={ids.s}>Capital name<input id={ids.s} type="text" value={sname} onChange={(e) => setSname(e.target.value)} /></label>
        {!random && (
          <label className="field" htmlFor={ids.t}>Capital hex terrain
            <select id={ids.t} value={terrain} onChange={(e) => setTerrain(e.target.value as Terrain)}>
              {Object.entries(TERRAIN).map(([id, t]) => <option key={id} value={id}>{t.label} — prepare for {t.prepCost} BP ({t.prepTime})</option>)}
            </select>
          </label>
        )}
      </div>
      <h3>Map</h3>
      <div className="segmented" role="group" aria-label="Map">
        <button aria-pressed={random} onClick={() => setRandom(true)}>Random map</button>
        <button aria-pressed={!random} onClick={() => setRandom(false)}>Blank map</button>
      </div>
      {random && generated ? (
        <div className="grid-2" style={{ gap: 16 }}>
          <div className="stack">
            <label className="field" htmlFor={ids.size}>Size
              <select id={ids.size} value={size} onChange={(e) => setSize(e.target.value as MapSize)}>
                {Object.entries(SIZES).map(([id, [c, r]]) => <option key={id} value={id}>{id[0].toUpperCase() + id.slice(1)} ({c} × {r} hexes)</option>)}
              </select>
            </label>
            <GenOptionsForm value={gen} onChange={setGen} />
          </div>
          <div className="stack">
            <MiniMap map={generated.map} capital={generated.capital} />
            <p className="small muted">
              The capital (outlined) goes on {HEX_TERRAIN[generated.map.hexes[generated.capital].terrain].toLowerCase()}
              {generated.map.hexes[generated.capital].river ? ' by a river' : ''}. This preview is the GM's view: players
              start with only the capital and its neighbors explored.
            </p>
          </div>
        </div>
      ) : (
        <p className="small muted">A blank 16 × 12 map of unexplored plains. Paint terrain yourself, or use Generate on the map later.</p>
      )}
      <p className="small muted">A wealthy sponsor typically provides 50 BP. You'll start with {bp - 1 - prep} BP after claiming the hex and preparing the site.</p>
      <div className="row">
        <button className="btn primary" disabled={!ok} onClick={() => {
          addKingdom(createKingdom({ name: name.trim(), alignment: ALIGNMENTS[align].value, startingBP: bp, settlementName: sname.trim(), terrain: capitalTerrain, government: gov, renown }, prep, generated ?? undefined));
          onDone();
        }}>Found {name.trim() || 'kingdom'}</button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </Panel>
  );
}
