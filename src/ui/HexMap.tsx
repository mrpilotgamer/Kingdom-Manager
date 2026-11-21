import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  build, checkClaim, checkImprovement, claim, colParity, coordLabel, editHex, EXPLORE_TIME, foundSettlementAt, getHex,
  HEX_TERRAIN, hexName, IMP_BY_ID, IMPROVEMENTS, key, MAX_MAP, neighborKeys, parse, regenerate, removeImprovement,
  resizeSide, shrinkBlocked, SPECIALS, STATUS_LABEL, syncFromMap, unclaim, type Side,
} from '../engine/map';
import { CLIMATES, DEFAULT_GEN, randomSeed, RUGGED, SPECIAL_LEVELS, WATERS, type GenOptions } from '../engine/mapgen';
import { log } from '../engine/actions';
import { TERRAIN } from '../rules/kingdom';
import { update } from '../state/store';
import type { Hex, HexSpecial, HexStatus, HexTerrain, Kingdom } from '../state/types';
import { Panel, useId } from './common';

const S = 30; // hex radius in SVG units
const H = Math.sqrt(3) * S;
const corner = (cx: number, cy: number, i: number): [number, number] => [cx + S * Math.cos((Math.PI / 3) * i), cy + S * Math.sin((Math.PI / 3) * i)];
const points = (cx: number, cy: number) => Array.from({ length: 6 }, (_, i) => corner(cx, cy, i).join(',')).join(' ');
const edgeMid = (cx: number, cy: number, i: number): [number, number] => {
  const a = corner(cx, cy, i), b = corner(cx, cy, i + 1);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
};

type Tool = 'select' | 'terrain' | 'river' | 'status' | 'generate';
type ViewMode = 'gm' | 'players';
const VIEW_KEY = 'kingdom-manager/map-view';
function loadView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'players' ? 'players' : 'gm'; } catch { return 'gm'; }
}
const TERRAINS = Object.keys(HEX_TERRAIN) as HexTerrain[];
const ZOOMS = [1, 1.5, 2, 3];

export function HexMapView({ k, go }: { k: Kingdom; go: (tab: 'settlements') => void }) {
  const m = k.map!;
  const [tool, setTool] = useState<Tool>('select');
  const [brush, setBrush] = useState<HexTerrain>('forest');
  const [statusBrush, setStatusBrush] = useState<HexStatus>('explored');
  const [selected, setSelected] = useState<string | null>(() => k.settlements.find((s) => s.hexKey)?.hexKey ?? null);
  const [zoom, setZoom] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 2 : 0));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewModeState] = useState<ViewMode>(loadView);
  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-browser preference only */ }
  };
  const players = viewMode === 'players';
  const center = (c: number, r: number): [number, number] => [S + c * 1.5 * S, H / 2 + H * (r + 0.5 * colParity(m, c))];
  /** Players don't see what's in unexplored hexes. */
  const hidden = (h: Hex) => players && h.status === 'unexplored';
  const [stroke, setStroke] = useState<{ keys: Set<string>; river?: boolean } | null>(null);

  const width = S * 1.5 * m.cols + S * 0.5;
  const height = H * (m.rows + 0.5);

  // Keep the selected hex (or the capital) in view when zoomed in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selected) return;
    const [cx, cy] = center(...parse(selected));
    el.scrollLeft = (cx / width) * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = (cy / height) * el.scrollHeight - el.clientHeight / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Show a paint stroke before it is committed as one undoable change.
  const view = (hk: string): Hex => {
    const h = getHex(m, hk);
    if (!stroke?.keys.has(hk)) return h;
    if (tool === 'terrain') return { ...h, terrain: brush };
    if (tool === 'river') return { ...h, river: stroke.river };
    if (tool === 'status') return { ...h, status: statusBrush };
    return h;
  };

  const keyAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-key]');
    return el?.getAttribute('data-key') ?? null;
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    const hk = keyAt(e);
    if (!hk) return;
    if (tool === 'select') { setSelected(hk); return; }
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setStroke({ keys: new Set([hk]), river: tool === 'river' ? !getHex(m, hk).river : undefined });
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!stroke) return;
    const hk = keyAt(e);
    if (hk && !stroke.keys.has(hk)) setStroke({ ...stroke, keys: new Set(stroke.keys).add(hk) });
  };
  const onUp = () => {
    if (!stroke) return;
    const keys = [...stroke.keys];
    const label = tool === 'terrain' ? `Paint ${HEX_TERRAIN[brush]}` : tool === 'river' ? (stroke.river ? 'Draw river' : 'Erase river') : `Mark ${STATUS_LABEL[statusBrush]}`;
    update(label, (d) => {
      const dm = d.map!;
      for (const hk of keys) {
        const h = editHex(dm, hk);
        if (tool === 'terrain') h.terrain = brush;
        if (tool === 'river') h.river = stroke.river;
        if (tool === 'status') {
          // Claimed status changes only through this brush in setup mode; otherwise it's left alone.
          if ((h.status === 'claimed' || statusBrush === 'claimed') && !d.settings.setupMode) continue;
          h.status = statusBrush;
        }
      }
      syncFromMap(d);
      if (tool === 'status' && statusBrush === 'claimed') log(d, `Marked ${keys.length} hex${keys.length > 1 ? 'es' : ''} as claimed (setup). Size is now ${d.size}.`);
    });
    setStroke(null);
  };

  const all = useMemo(() => {
    const out: string[] = [];
    for (let c = 0; c < m.cols; c++) for (let r = 0; r < m.rows; r++) out.push(key(c, r));
    return out;
  }, [m.cols, m.rows]);
  const settlementAt = new Map(k.settlements.filter((s) => s.hexKey).map((s) => [s.hexKey!, s]));
  const capitalId = k.settlements[0]?.id;

  return (
    <div className="workspace">
      <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        <div className="row">
          <div className="segmented" role="group" aria-label="Map tool">
            {([['select', 'Select'], ['terrain', 'Paint terrain'], ['river', 'Rivers'], ['status', 'Exploration'], ['generate', 'Generate']] as [Tool, string][]).map(([t, l]) => (
              <button key={t} aria-pressed={tool === t} onClick={() => setTool(t)}>{l}</button>
            ))}
          </div>
          <span className="spacer" />
          <div className="segmented" role="group" aria-label="Show the map as">
            <button aria-pressed={!players} onClick={() => setViewMode('gm')} title="See all terrain and special sites">GM view</button>
            <button aria-pressed={players} onClick={() => setViewMode('players')} title="Hide everything in unexplored hexes">Players' view</button>
          </div>
          <button className="btn sm" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>−</button>
          <span className="small num" style={{ minWidth: '3em', textAlign: 'center' }}>{ZOOMS[zoom] * 100}%</span>
          <button className="btn sm" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)}>+</button>
        </div>
        <div className="hexmap-scroll" ref={scrollRef}>
          <svg className={`hexmap ${tool !== 'select' ? 'painting' : ''}`} viewBox={`-4 -4 ${width + 8} ${height + 8}`}
            style={{ width: `${ZOOMS[zoom] * 100}%` }} role="img" aria-label={`Hex map, ${m.cols} by ${m.rows}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
            <defs>
              <pattern id="fog" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--fog)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--fog-line)" strokeWidth="2" />
              </pattern>
            </defs>
            {/* terrain */}
            {all.map((hk) => {
              const [c, r] = parse(hk);
              const [cx, cy] = center(c, r);
              const h = view(hk);
              return (
                <g key={hk} data-key={hk}>
                  <polygon points={points(cx, cy)} className={`hx t-${h.terrain}`} />
                  {h.status === 'unexplored' && <polygon points={points(cx, cy)} fill="url(#fog)" opacity={players ? 1 : 0.6} className={players ? 'hx-hidden' : undefined} />}
                  {h.status === 'explored' && <polygon points={points(cx, cy)} className="hx-explored" />}
                  {h.status === 'claimed' && <polygon points={points(cx, cy)} className="hx-claimed" />}
                </g>
              );
            })}
            {/* rivers, canals and roads */}
            <g pointerEvents="none">
              {all.map((hk) => {
                const h = view(hk);
                if (hidden(h)) return null;
                const [cx, cy] = center(...parse(hk));
                const nb = neighborKeys(m, hk);
                const lines: JSX.Element[] = [];
                const link = (cls: string, test: (n: Hex) => boolean, stub: boolean) => {
                  let any = false;
                  nb.forEach((n, i) => {
                    if (n && !hidden(view(n)) && test(view(n))) {
                      any = true;
                      const [mx, my] = edgeMid(cx, cy, i);
                      lines.push(<line key={`${cls}${i}`} x1={cx} y1={cy} x2={mx} y2={my} className={cls} />);
                    }
                  });
                  if (!any && stub) lines.push(<line key={`${cls}-stub`} x1={cx - S * 0.35} y1={cy} x2={cx + S * 0.35} y2={cy} className={cls} />);
                };
                if (h.river) {
                  const riverN = nb.filter((n) => n && view(n).river).length;
                  let mouth = riverN <= 1;
                  link('river', (n) => {
                    if (n.river) return true;
                    if (mouth && n.terrain === 'water') { mouth = false; return true; }
                    return false;
                  }, true);
                }
                if (h.improvements.includes('canal')) link('canal', (n) => n.improvements.includes('canal') || !!n.river || n.terrain === 'water', true);
                const roadish = (x: Hex, hkey?: string) => x.improvements.includes('road') || x.improvements.includes('highway') || (!!hkey && settlementAt.has(hkey));
                if (roadish(h)) {
                  nb.forEach((n, i) => {
                    if (n && roadish(view(n), n)) {
                      const [mx, my] = edgeMid(cx, cy, i);
                      const hw = h.improvements.includes('highway') && view(n).improvements.includes('highway');
                      lines.push(<line key={`r${i}`} x1={cx} y1={cy} x2={mx} y2={my} className={hw ? 'highway' : 'road'} />);
                    }
                  });
                  if (!nb.some((n) => n && roadish(view(n), n))) lines.push(<circle key="rs" cx={cx} cy={cy} r={3} className="road-dot" />);
                }
                return <g key={hk}>{lines}</g>;
              })}
            </g>
            {/* kingdom border */}
            <g pointerEvents="none">
              {all.filter((hk) => view(hk).status === 'claimed').map((hk) => {
                const [cx, cy] = center(...parse(hk));
                return neighborKeys(m, hk).map((n, i) => {
                  if (n && view(n).status === 'claimed') return null;
                  const a = corner(cx, cy, i), b = corner(cx, cy, i + 1);
                  return <line key={`${hk}-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="border" />;
                });
              })}
            </g>
            {/* symbols */}
            <g pointerEvents="none">
              {all.map((hk) => {
                const h = view(hk);
                if (hidden(h)) return null;
                const [cx, cy] = center(...parse(hk));
                const st = settlementAt.get(hk);
                const badges = h.improvements.filter((i) => !['road', 'highway', 'canal'].includes(i));
                return (
                  <g key={hk}>
                    {st && (
                      <g>
                        <path d={`M${cx - 8} ${cy + 6} V${cy - 2} L${cx - 4} ${cy - 6} L${cx} ${cy - 2} L${cx + 4} ${cy - 6} L${cx + 8} ${cy - 2} V${cy + 6} Z`} className="town" />
                        {st.id === capitalId && <circle cx={cx} cy={cy - 12} r={3} className="capital" />}
                        <text x={cx} y={cy + 18} className="town-label">{st.name}</text>
                      </g>
                    )}
                    {!st && h.name && <text x={cx} y={cy + 18} className="hex-label">{h.name}</text>}
                    {badges.map((b, i) => (
                      <g key={b}>
                        <rect x={cx - (badges.length * 15) / 2 + i * 15} y={cy - (st ? 24 : 7)} width={14} height={12} rx={3} className="badge" />
                        <text x={cx - (badges.length * 15) / 2 + i * 15 + 7} y={cy - (st ? 24 : 7) + 9} className="badge-text">{IMP_BY_ID[b].short}</text>
                      </g>
                    ))}
                    {h.special && (
                      <g opacity={h.status === 'unexplored' ? 0.6 : 1}>
                        <rect x={cx + S * 0.38} y={cy - S * 0.62} width={11} height={11} rx={2} transform={`rotate(45 ${cx + S * 0.38 + 5.5} ${cy - S * 0.62 + 5.5})`} className="special" />
                        <text x={cx + S * 0.38 + 5.5} y={cy - S * 0.62 + 8.5} className="special-text">{SPECIALS[h.special].label[0]}</text>
                      </g>
                    )}
                  </g>
                );
              })}
              {selected && (() => {
                const [c, r] = parse(selected);
                if (c >= m.cols || r >= m.rows) return null;
                const [cx, cy] = center(c, r);
                return <polygon points={points(cx, cy)} className="hx-selected" />;
              })()}
            </g>
          </svg>
        </div>
        <Legend />
        <MapSize k={k} onShift={(side, n) => {
          if (!selected || n <= 0) return;
          const [c, r] = parse(selected);
          setSelected(side === 'left' ? key(c + n, r) : side === 'top' ? key(c, r + n) : selected);
        }} />
      </div>
      <div className="stack" style={{ gap: 16 }}>
        {tool === 'terrain' && (
          <Panel title="Paint terrain">
            <p className="small muted">Tap or drag across hexes. Each stroke is one change you can undo.</p>
            <div className="terrain-swatches">
              {TERRAINS.map((t) => (
                <button key={t} aria-pressed={brush === t} onClick={() => setBrush(t)}>
                  <svg width="22" height="20" viewBox="-11 -10 22 20" aria-hidden="true"><polygon points={Array.from({ length: 6 }, (_, i) => [10 * Math.cos((Math.PI / 3) * i), 10 * Math.sin((Math.PI / 3) * i)].join(',')).join(' ')} className={`hx t-${t}`} /></svg>
                  {HEX_TERRAIN[t]}
                </button>
              ))}
            </div>
          </Panel>
        )}
        {tool === 'river' && (
          <Panel title="Rivers">
            <p className="small muted">Tap or drag to draw a river; start on a river hex to erase instead. Rivers connect to neighboring river and water hexes.</p>
            <p className="small">Each 4 claimed river hexes give Economy +1, and each 8 give Stability +1. Roads cost double in river hexes unless there's a Bridge.</p>
          </Panel>
        )}
        {tool === 'status' && (
          <Panel title="Exploration">
            <p className="small muted">Mark what the party has explored and cleared. Fogged hexes are unexplored.</p>
            <div className="segmented" role="group" aria-label="Exploration brush">
              {(['unexplored', 'explored', 'cleared'] as HexStatus[]).concat(k.settings.setupMode ? ['claimed'] : []).map((s) => (
                <button key={s} aria-pressed={statusBrush === s} onClick={() => setStatusBrush(s)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
            {!k.settings.setupMode && <p className="small muted">Claimed hexes aren't changed by this brush. Use Select to claim or abandon a hex, or turn on Setup mode in Options to paint claimed hexes for free.</p>}
          </Panel>
        )}
        {tool === 'generate' && <GeneratePanel k={k} onDone={(capital) => { if (capital) setSelected(capital); setTool('select'); }} />}
        {tool === 'select' && (selected ? <HexPanel k={k} hk={selected} go={go} players={players} /> : (
          <Panel title="Select a hex"><p className="muted">Tap a hex to see it, claim it, or build on it.</p></Panel>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend small">
      {TERRAINS.map((t) => (
        <span key={t} className="row" style={{ gap: 4 }}>
          <svg width="14" height="12" viewBox="-7 -6 14 12" aria-hidden="true"><polygon points={Array.from({ length: 6 }, (_, i) => [6 * Math.cos((Math.PI / 3) * i), 6 * Math.sin((Math.PI / 3) * i)].join(',')).join(' ')} className={`hx t-${t}`} /></svg>
          {HEX_TERRAIN[t]}
        </span>
      ))}
      <span className="muted">Red line: your border · Hatched: unexplored · Pale: explored but not cleared · ◆ special site</span>
    </div>
  );
}

const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

function MapSize({ k, onShift }: { k: Kingdom; onShift: (side: Side, n: number) => void }) {
  const m = k.map!;
  const [side, setSide] = useState<Side>('right');
  const [n, setN] = useState(1);
  const horizontal = side === 'left' || side === 'right';
  const size = horizontal ? m.cols : m.rows;
  const unit = horizontal ? (n === 1 ? 'column' : 'columns') : n === 1 ? 'row' : 'rows';
  const blocked = shrinkBlocked(m, side, n);
  const ids = { side: useId('ms'), n: useId('ms') };
  const go = (delta: number) => {
    update(`${delta > 0 ? 'Add' : 'Remove'} ${unit}`, (d) => { resizeSide(d, side, delta); });
    onShift(side, delta);
  };
  return (
    <div className="row small resize">
      <span className="muted">Map {m.cols} × {m.rows}</span>
      <label htmlFor={ids.n} className="muted">Change</label>
      <input id={ids.n} type="number" min={1} max={20} value={n} onChange={(e) => setN(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
      <span>{unit} on the</span>
      <select id={ids.side} aria-label="Side of the map" value={side} onChange={(e) => setSide(e.target.value as Side)}>
        {SIDES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <button className="btn sm" disabled={size >= MAX_MAP} onClick={() => go(n)}>Add</button>
      <button className="btn sm" disabled={size - n < 4 || blocked} onClick={() => go(-n)}
        title={blocked ? 'That would cut off claimed hexes' : undefined}>Remove</button>
      {blocked && <span className="muted">Can't remove: claimed hexes are there.</span>}
    </div>
  );
}

function GeneratePanel({ k, onDone }: { k: Kingdom; onDone: (capital: string | null) => void }) {
  const m = k.map!;
  const [o, setO] = useState<GenOptions>(() => ({ ...DEFAULT_GEN, ...(m.gen ? { climate: m.gen.climate, water: m.gen.water, ruggedness: m.gen.ruggedness, specials: m.gen.specials } : {}), seed: randomSeed() }));
  const claimed = Object.values(m.hexes).filter((h) => h.status === 'claimed').length;
  return (
    <Panel title="Generate terrain">
      <p className="small muted">Builds new terrain, rivers, and special sites for the whole map. Claimed hexes, with their improvements and settlements, stay exactly as they are{claimed ? ` (${claimed} right now)` : ''}. You can undo it.</p>
      <GenOptionsForm value={o} onChange={setO} />
      {m.gen && <p className="small muted">Current map seed: <code>{m.gen.seed}</code></p>}
      <div className="row">
        <button className="btn primary" onClick={() => {
          let capital: string | null = null;
          update('Generate terrain', (d) => { capital = regenerate(d, o); });
          onDone(claimed ? null : capital);
        }}>Generate</button>
        <button className="btn ghost" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </Panel>
  );
}

export function GenOptionsForm({ value, onChange }: { value: GenOptions; onChange: (o: GenOptions) => void }) {
  const ids = { seed: useId('g'), c: useId('g'), w: useId('g'), r: useId('g'), s: useId('g') };
  const set = <K extends keyof GenOptions>(f: K, v: GenOptions[K]) => onChange({ ...value, [f]: v });
  return (
    <div className="stack">
      <div className="row">
        <label className="field" htmlFor={ids.seed} style={{ flex: 1 }}>Seed
          <input id={ids.seed} type="text" value={value.seed} onChange={(e) => set('seed', e.target.value)} />
        </label>
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => set('seed', randomSeed())}>New seed</button>
      </div>
      <div className="gen-grid">
        <label className="field" htmlFor={ids.c}>Climate
          <select id={ids.c} value={value.climate} onChange={(e) => set('climate', e.target.value as GenOptions['climate'])}>
            {Object.entries(CLIMATES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.w}>Water
          <select id={ids.w} value={value.water} onChange={(e) => set('water', e.target.value as GenOptions['water'])}>
            {Object.entries(WATERS).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.r}>Terrain
          <select id={ids.r} value={value.ruggedness} onChange={(e) => set('ruggedness', e.target.value as GenOptions['ruggedness'])}>
            {Object.entries(RUGGED).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.s}>Special sites
          <select id={ids.s} value={value.specials} onChange={(e) => set('specials', e.target.value as GenOptions['specials'])}>
            {Object.entries(SPECIAL_LEVELS).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </label>
      </div>
      <p className="small muted">The same seed and settings always make the same map, so you can share a seed with another GM.</p>
    </div>
  );
}

function HexPanel({ k, hk, go, players }: { k: Kingdom; hk: string; go: (tab: 'settlements') => void; players: boolean }) {
  const m = k.map!;
  const h = getHex(m, hk);
  const [c, r] = parse(hk);
  const setup = k.settings.setupMode;
  const settlement = k.settlements.find((s) => s.hexKey === hk);
  const unplaced = k.settlements.filter((s) => !s.hexKey);
  const [townName, setTownName] = useState('');
  const [confirm, setConfirm] = useState<'abandon' | 'lose' | null>(null);
  const ids = { name: useId('hx'), terrain: useId('hx'), special: useId('hx'), notes: useId('hx'), town: useId('hx') };
  const claimCheck = checkClaim(k, m, hk);
  const edit = (label: string, fn: (h: Hex) => void) => update(label, (d) => { fn(editHex(d.map!, hk)); syncFromMap(d); });
  const secret = players && h.status === 'unexplored';

  return (
    <>
      <Panel title={(!secret && h.name) || `Hex ${coordLabel(c, r)}`}>
        <div className="row">
          {!secret && <span className="chip">{HEX_TERRAIN[h.terrain]}</span>}
          <span className={`chip ${h.status === 'claimed' ? 'ok' : ''}`}>{STATUS_LABEL[h.status]}</span>
          {!secret && h.river && <span className="chip">River</span>}
          {!secret && h.special && <span className="chip">{SPECIALS[h.special].label}{h.status === 'unexplored' ? ' (undiscovered)' : ''}</span>}
          {!secret && h.name && <span className="chip">{coordLabel(c, r)}</span>}
        </div>
        {secret && <p className="small muted">Players' view: nobody knows what's here yet. Switch to GM view to see it.</p>}
        {!secret && h.special && <p className="small">{SPECIALS[h.special].effect}</p>}
        {!secret && h.notes && <p className="small muted">{h.notes}</p>}
        {!m.active && <p className="callout info">The map isn't driving your kingdom's numbers yet. Switch it on below the map when your hexes are in place.</p>}

        {h.status !== 'claimed' ? (
          <div className="stack">
            {h.status === 'unexplored' && !secret && (
              <p className="small">Exploring takes about {EXPLORE_TIME[h.terrain]} for a party moving 30 ft.</p>
            )}
            <div className="row">
              {h.status === 'unexplored' && <button className="btn" onClick={() => edit('Explore hex', (x) => { x.status = 'explored'; })}>Mark explored</button>}
              {h.status !== 'cleared' && <button className="btn" onClick={() => edit('Clear hex', (x) => { x.status = 'cleared'; })}>Mark explored and cleared</button>}
            </div>
            {m.active && (
              <>
                {claimCheck.warnings.map((w) => <p key={w} className="callout">{w}</p>)}
                <div><button className="btn primary" onClick={() => update('Claim hex', (d) => claim(d, hk))}>
                  Claim this hex{setup ? ' (free in setup)' : ' for 1 BP'}
                </button></div>
              </>
            )}
          </div>
        ) : m.active && (
          <div className="row">
            {confirm ? (
              <span className="row small">
                {confirm === 'abandon' ? `Abandon this hex? Unrest +${settlement ? 4 : 1}.` : 'Lose this hex to Unrest?'}
                <button className="btn sm danger" onClick={() => { update(confirm === 'abandon' ? 'Abandon hex' : 'Lose hex', (d) => unclaim(d, hk, confirm)); setConfirm(null); }}>Yes</button>
                <button className="btn sm ghost" onClick={() => setConfirm(null)}>No</button>
              </span>
            ) : (
              <>
                <button className="btn sm danger" onClick={() => setConfirm('abandon')}>Abandon hex</button>
                {k.unrest >= 11 && <button className="btn sm danger" onClick={() => setConfirm('lose')}>Lose to Unrest</button>}
              </>
            )}
          </div>
        )}
      </Panel>

      {h.status === 'claimed' && m.active && (
        <Panel title="Improvements">
          {h.improvements.length > 0 && (
            <div className="stack">
              {h.improvements.map((i) => (
                <div key={i} className="row">
                  <strong style={{ flex: 1 }}>{IMP_BY_ID[i].label}</strong>
                  <span className="small muted">{IMP_BY_ID[i].effect}</span>
                  <button className="btn sm ghost danger" onClick={() => update(`Remove ${IMP_BY_ID[i].label}`, (d) => removeImprovement(d, hk, i))}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <table className="list small">
            <tbody>
              {IMPROVEMENTS.map((imp) => {
                const chk = checkImprovement(k, m, hk, imp.id);
                if (h.improvements.includes(imp.id)) return null;
                const why = chk.errors[0] ?? chk.warnings[0];
                return (
                  <tr key={imp.id}>
                    <td><strong>{imp.label}</strong><div className={chk.errors.length ? 'muted' : chk.warnings.length ? '' : 'muted'}>{why ?? imp.effect}</div></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn sm" disabled={chk.errors.length > 0} onClick={() => update(`Build ${imp.label}`, (d) => build(d, hk, imp.id))}>
                        {setup ? 'Add' : chk.cost === null ? 'Build' : `Build · ${chk.cost} BP`}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {h.status === 'claimed' && m.active && h.terrain !== 'water' && (
        <Panel title="Settlement">
          {settlement ? (
            <div className="row">
              <strong style={{ flex: 1 }}>{settlement.name}</strong>
              <button className="btn sm" onClick={() => go('settlements')}>Open districts</button>
              <button className="btn sm ghost" onClick={() => update('Move settlement off map', (d) => { d.settlements.find((s) => s.id === settlement.id)!.hexKey = undefined; })}>Unlink</button>
            </div>
          ) : (
            <div className="stack">
              <div className="row">
                <label className="field" htmlFor={ids.town} style={{ flex: 1 }}>New settlement name
                  <input id={ids.town} type="text" value={townName} onChange={(e) => setTownName(e.target.value)} />
                </label>
                <button className="btn primary" disabled={!townName.trim()} onClick={() => { update(`Found ${townName}`, (d) => foundSettlementAt(d, hk, townName.trim())); setTownName(''); }}>
                  Found here{setup ? '' : ` · ${TERRAIN[h.terrain as keyof typeof TERRAIN].prepCost} BP`}
                </button>
              </div>
              {unplaced.length > 0 && (
                <div className="row small">
                  <span className="muted">Or place an existing settlement:</span>
                  {unplaced.map((s) => (
                    <button key={s.id} className="btn sm" onClick={() => update(`Place ${s.name}`, (d) => {
                      d.settlements.find((x) => x.id === s.id)!.hexKey = hk;
                      log(d, `Placed ${s.name} in ${hexName(d.map!, hk)}.`);
                    })}>{s.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      {!secret && <Panel title="Edit hex">
        <label className="field" htmlFor={ids.name}>Name
          <input id={ids.name} type="text" value={h.name ?? ''} placeholder={coordLabel(c, r)} onChange={(e) => edit('Rename hex', (x) => { x.name = e.target.value || undefined; })} />
        </label>
        <div className="row">
          <label className="field" htmlFor={ids.terrain}>Terrain
            <select id={ids.terrain} value={h.terrain} onChange={(e) => edit('Change terrain', (x) => { x.terrain = e.target.value as HexTerrain; })}>
              {TERRAINS.map((t) => <option key={t} value={t}>{HEX_TERRAIN[t]}</option>)}
            </select>
          </label>
          <label className="field" htmlFor={ids.special}>Special terrain
            <select id={ids.special} value={h.special ?? ''} onChange={(e) => edit('Change special terrain', (x) => { x.special = (e.target.value || undefined) as HexSpecial | undefined; })}>
              <option value="">None</option>
              {Object.entries(SPECIALS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <label className="check"><input type="checkbox" checked={!!h.river} onChange={(e) => edit('Toggle river', (x) => { x.river = e.target.checked; })} /> River runs through this hex</label>
        <label className="field" htmlFor={ids.notes}>GM notes
          <textarea id={ids.notes} rows={2} value={h.notes ?? ''} onChange={(e) => edit('Edit notes', (x) => { x.notes = e.target.value || undefined; })} />
        </label>
      </Panel>}
    </>
  );
}
