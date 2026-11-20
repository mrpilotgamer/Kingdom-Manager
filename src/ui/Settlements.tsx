import { useMemo, useState } from 'react';
import {
  addDistrict, changeAddon, demolish, foundSettlement, placeBuilding, removeSettlement, setWall, toggleImprovement,
  upgradeBuilding,
} from '../engine/actions';
import { buildCost, upgradeCost } from '../engine/costs';
import { checkPlacement, districtIssues, footprint, lotKey, occupancy, SIDE_LABEL, type Orientation } from '../engine/grid';
import { computeStats, fmt, settlementStats } from '../engine/stats';
import { building, BUILDINGS, CATEGORY_LABEL, type BuildingDef, type Category } from '../rules/buildings';
import { TERRAIN, type Terrain } from '../rules/kingdom';
import { update } from '../state/store';
import type { District, Kingdom, Lot, PlacedBuilding, Settlement, Side } from '../state/types';
import { Panel, useId } from './common';

const pos = (i: number) => i + Math.floor(i / 2) + 1;
function area(lots: Lot[]) {
  const rs = lots.map((l) => l[0]), cs = lots.map((l) => l[1]);
  return {
    gridRow: `${pos(Math.min(...rs))} / ${pos(Math.max(...rs)) + 1}`,
    gridColumn: `${pos(Math.min(...cs))} / ${pos(Math.max(...cs)) + 1}`,
  };
}

function modsText(b: BuildingDef) {
  const out: string[] = [];
  if (b.economy) out.push(`Eco ${fmt(b.economy)}`);
  if (b.loyalty) out.push(`Loy ${fmt(b.loyalty)}`);
  if (b.stability) out.push(`Stab ${fmt(b.stability)}`);
  if (b.unrest) out.push(`Unrest ${fmt(b.unrest)}`);
  if (b.fame) out.push(`Fame ${fmt(b.fame)}`);
  return out;
}

type Mode = { kind: 'idle' } | { kind: 'place'; type: string; orientation: Orientation; upgradeOf?: PlacedBuilding };

export function Settlements({ k }: { k: Kingdom }) {
  const [sId, setSId] = useState(k.settlements[0]?.id ?? '');
  const s = k.settlements.find((x) => x.id === sId) ?? k.settlements[0];
  const [dId, setDId] = useState('');
  const d = s?.districts.find((x) => x.id === dId) ?? s?.districts[0];

  return (
    <>
      <Panel title="Settlements" actions={<FoundSettlement k={k} onFounded={setSId} />}>
        {k.settlements.length ? (
          <div className="segmented" role="group" aria-label="Choose settlement">
            {k.settlements.map((x, i) => (
              <button key={x.id} aria-pressed={x.id === s?.id} onClick={() => { setSId(x.id); setDId(''); }}>
                {x.name}{i === 0 ? ' ★' : ''}
              </button>
            ))}
          </div>
        ) : <p className="muted">Found your first settlement to start building.</p>}
      </Panel>
      {s && d && <SettlementView key={s.id} k={k} s={s} d={d} setDId={setDId} />}
    </>
  );
}

function FoundSettlement({ k, onFounded }: { k: Kingdom; onFounded: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [terrain, setTerrain] = useState<Terrain>('plains');
  const ids = { n: useId('fs'), t: useId('fs') };
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>Found a settlement</button>;
  const cost = TERRAIN[terrain].prepCost;
  return (
    <div className="row">
      <label className="field" htmlFor={ids.n}>Name<input id={ids.n} type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field" htmlFor={ids.t}>Hex terrain
        <select id={ids.t} value={terrain} onChange={(e) => setTerrain(e.target.value as Terrain)}>
          {Object.entries(TERRAIN).map(([id, t]) => <option key={id} value={id}>{t.label} ({t.prepCost} BP, {t.prepTime})</option>)}
        </select>
      </label>
      <button className="btn primary" disabled={!name.trim()} onClick={() => {
        let newId = '';
        update(`Found ${name}`, (dk) => { newId = foundSettlement(dk, name.trim(), terrain).id; });
        onFounded(newId);
        setOpen(false); setName('');
      }}>Prepare site ({k.settings.setupMode ? 'free in setup' : `${cost} BP`})</button>
      <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

function SettlementView({ k, s, d, setDId }: { k: Kingdom; s: Settlement; d: District; setDId: (id: string) => void }) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [selected, setSelected] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Lot | null>(null);
  const [hover, setHover] = useState<Lot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const diag = k.settings.diagonalAdjacency;
  const ss = settlementStats(s);
  const issues = useMemo(() => districtIssues(d, diag), [d, diag]);
  const issueIds = new Set(issues.map((i) => i.buildingId));
  const occ = occupancy(d);
  const sel = d.buildings.find((b) => b.id === selected) ?? null;
  const nameId = useId('sname');

  const startPlace = (type: string, upgradeOf?: PlacedBuilding) => {
    setMode({ kind: 'place', type, orientation: 'h', upgradeOf });
    setSelected(null);
    setAnchor(upgradeOf ? upgradeOf.lots.reduce((a, l) => (l[0] < a[0] || (l[0] === a[0] && l[1] < a[1]) ? l : a)) : null);
  };
  const cancel = () => { setMode({ kind: 'idle' }); setAnchor(null); };

  const placing = mode.kind === 'place' ? building(mode.type) : null;
  const at = hover ?? anchor;
  const fp = placing && at ? footprint(placing.lots, at, mode.kind === 'place' ? mode.orientation : 'h') : null;
  const check = placing && fp && mode.kind === 'place'
    ? checkPlacement(s, d, placing, fp, diag, mode.upgradeOf?.id)
    : null;
  if (check && mode.kind === 'place' && mode.upgradeOf) {
    const keys = new Set(fp!.map(lotKey));
    if (!mode.upgradeOf.lots.every((l) => keys.has(lotKey(l)))) check.errors.push('An upgrade must cover the lots of the building it replaces.');
  }

  return (
    <>
      <div className="row">
        <label className="field" htmlFor={nameId}>Settlement name
          <input id={nameId} type="text" value={s.name} onChange={(e) => update('Rename settlement', (dk) => {
            dk.settlements.find((x) => x.id === s.id)!.name = e.target.value;
          })} />
        </label>
        <span className="chip">{ss.sizeLabel}</span>
        <span className="chip">Pop. ~{ss.population.toLocaleString()}</span>
        <span className="chip">Base value {ss.baseValue.toLocaleString()} gp</span>
        <span className="chip">Defense {ss.defense}</span>
        <span className="chip">{TERRAIN[s.terrain].label}</span>
        <span className="spacer" />
        {confirmDelete ? (
          <span className="row small">Remove {s.name} and all its buildings?
            <button className="btn sm danger" onClick={() => update('Remove settlement', (dk) => removeSettlement(dk, s.id))}>Remove</button>
            <button className="btn sm ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        ) : <button className="btn sm ghost danger" onClick={() => setConfirmDelete(true)}>Remove settlement</button>}
      </div>

      <div className="row">
        <div className="segmented" role="group" aria-label="Choose district">
          {s.districts.map((x) => (
            <button key={x.id} aria-pressed={x.id === d.id} onClick={() => { setDId(x.id); cancel(); setSelected(null); }}>{x.name}</button>
          ))}
        </div>
        <button className="btn sm" onClick={() => update('Add district', (dk) => addDistrict(dk, s.id))}
          title="Add a district when the grid is full. Each district adds 1 to the Control DC.">
          Add district ({k.settings.setupMode ? 'free in setup' : `${TERRAIN[s.terrain].prepCost} BP`})
        </button>
      </div>

      <div className="workspace">
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          <div className={`district ${(['n', 'e', 's', 'w'] as Side[]).filter((x) => d.borders[x] === 'water').map((x) => `border-${x}`).join(' ')}`}>
            {(Object.entries(d.walls) as [Side, string][]).map(([side, type]) => (
              <div key={side} className={`wall-${side} ${type === 'moat' ? 'moat' : ''}`} title={`${building(type).name} (${SIDE_LABEL[side]})`} />
            ))}
            <div className="lots" onMouseLeave={() => setHover(null)}>
              <div className="street-v" style={{ gridColumn: 3, gridRow: '1 / -1' }} />
              <div className="street-v" style={{ gridColumn: 6, gridRow: '1 / -1' }} />
              <div className="street-h" style={{ gridRow: 3, gridColumn: '1 / -1' }} />
              <div className="street-h" style={{ gridRow: 6, gridColumn: '1 / -1' }} />
              {Array.from({ length: 36 }, (_, i) => {
                const lot: Lot = [Math.floor(i / 6), i % 6];
                if (occ.has(lotKey(lot))) return null;
                return (
                  <button key={i} className="lot" style={{ gridRow: pos(lot[0]), gridColumn: pos(lot[1]) }}
                    aria-label={`Empty lot, row ${lot[0] + 1}, column ${lot[1] + 1}`}
                    onMouseEnter={() => mode.kind === 'place' && setHover(lot)}
                    onClick={() => { if (mode.kind === 'place') { setAnchor(lot); setHover(null); } else setSelected(null); }} />
                );
              })}
              {d.buildings.map((b) => {
                const def = building(b.type);
                const upgrading = mode.kind === 'place' && mode.upgradeOf?.id === b.id;
                return (
                  <button key={b.id} className={`bldg cat-${def.category} ${issueIds.has(b.id) ? 'issue' : ''}`}
                    style={{ ...area(b.lots), opacity: upgrading ? 0.35 : 1 }} aria-pressed={selected === b.id}
                    title={`${def.name}${issueIds.has(b.id) ? ' (rules issue)' : ''}`}
                    onMouseEnter={() => mode.kind === 'place' && setHover(b.lots[0])}
                    onClick={() => {
                      if (mode.kind === 'place') { setAnchor(b.lots[0]); setHover(null); return; }
                      setSelected(b.id);
                    }}>
                    <span className="ab">{def.short}</span>
                    <span className="nm">{def.name}</span>
                  </button>
                );
              })}
              {fp && check && (
                <div className={`preview ${check.errors.length ? 'bad' : check.warnings.length ? 'warn' : ''}`}
                  style={area(fp.filter(([r, c]) => r < 6 && c < 6).length ? fp.filter(([r, c]) => r < 6 && c < 6) : fp)} />
              )}
            </div>
          </div>
          {issues.length > 0 && (
            <div className="stack">
              {issues.map((i) => <div key={i.text} className="callout">{i.text}</div>)}
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          {mode.kind === 'place' && placing ? (
            <PlacePanel k={k} s={s} d={d} def={placing} mode={mode} anchor={anchor} check={anchor ? checkPlacement(s, d, placing, footprint(placing.lots, anchor, mode.orientation), diag, mode.upgradeOf?.id) : null}
              onOrient={(o) => setMode({ ...mode, orientation: o })} onCancel={cancel}
              onBuild={() => {
                const lots = footprint(placing.lots, anchor!, mode.orientation);
                if (mode.upgradeOf) update(`Upgrade to ${placing.name}`, (dk) => upgradeBuilding(dk, s.id, d.id, mode.upgradeOf!.id, placing.id, lots));
                else update(`Build ${placing.name}`, (dk) => placeBuilding(dk, s.id, d.id, placing.id, lots));
                cancel();
              }} />
          ) : sel ? (
            <BuildingDetail k={k} s={s} d={d} b={sel} issues={issues.filter((i) => i.buildingId === sel.id).map((i) => i.text)}
              onClose={() => setSelected(null)}
              onUpgrade={(to) => {
                if (building(to).lots === sel.lots.length) {
                  update(`Upgrade to ${building(to).name}`, (dk) => upgradeBuilding(dk, s.id, d.id, sel.id, to, sel.lots));
                } else startPlace(to, sel);
              }}
              onDemolish={() => { update(`Demolish ${building(sel.type).name}`, (dk) => demolish(dk, s.id, d.id, sel.id)); setSelected(null); }} />
          ) : (
            <Palette k={k} s={s} onPick={(t) => startPlace(t)} />
          )}
          {ss.magicItems.length > 0 && (
            <Panel title="Magic item slots">
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {ss.magicItems.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </Panel>
          )}
        </div>
      </div>
      <DistrictControls k={k} s={s} d={d} />
    </>
  );
}

function PlacePanel({ k, s, def, mode, anchor, check, onOrient, onCancel, onBuild }: {
  k: Kingdom; s: Settlement; d: District; def: BuildingDef; mode: Extract<Mode, { kind: 'place' }>; anchor: Lot | null;
  check: ReturnType<typeof checkPlacement> | null;
  onOrient: (o: Orientation) => void; onCancel: () => void; onBuild: () => void;
}) {
  const st = computeStats(k);
  const setup = k.settings.setupMode;
  const price = mode.upgradeOf ? { cost: upgradeCost(mode.upgradeOf.type, def.id), base: def.cost } : buildCost(s, def.id);
  const free = def.housing && !k.turnState.freeHousingUsed;
  const over = !setup && !free && k.turnState.buildings >= st.limits.buildings;
  const errors = [...(check?.errors ?? [])];
  if (mode.upgradeOf && anchor) {
    const lots = footprint(def.lots, anchor, mode.orientation).map(lotKey);
    if (!mode.upgradeOf.lots.every((l) => lots.includes(lotKey(l)))) errors.push('An upgrade must cover the lots of the building it replaces.');
  }
  return (
    <Panel title={mode.upgradeOf ? `Upgrade to ${def.name}` : `Build ${def.name}`}>
      <div className="row">
        <span className="chip">{def.lots} lot{def.lots > 1 ? 's' : ''}</span>
        <span className="chip">{setup ? 'Setup mode: free' : `${price.cost} BP${price.cost !== price.base && !mode.upgradeOf ? ` (half of ${price.base})` : ''}`}</span>
        {modsText(def).map((m) => <span key={m} className="chip">{m}</span>)}
      </div>
      {def.lots === 2 && (
        <div className="segmented" role="group" aria-label="Orientation">
          <button aria-pressed={mode.orientation === 'h'} onClick={() => onOrient('h')}>Side by side</button>
          <button aria-pressed={mode.orientation === 'v'} onClick={() => onOrient('v')}>Stacked</button>
        </div>
      )}
      {def.limitText && <p className="small"><strong>Limit:</strong> {def.limitText}</p>}
      {!anchor && <p className="callout info">Tap a lot to place it{def.lots > 1 ? ' (its top-left corner)' : ''}. Buildings can span a street.</p>}
      {errors.map((e) => <p key={e} className="callout bad">{e}</p>)}
      {check?.warnings.map((w) => <p key={w} className="callout">{w} You can still build it if your GM allows.</p>)}
      {over && <p className="callout">This turn's building limit ({st.limits.buildings}) is already used.</p>}
      {!setup && price.cost > k.treasury && <p className="callout">This leaves the Treasury at {k.treasury - price.cost} BP.</p>}
      <div className="row">
        <button className="btn primary" disabled={!anchor || errors.length > 0} onClick={onBuild}>
          {mode.upgradeOf ? 'Upgrade' : 'Build'}{setup ? '' : ` for ${price.cost} BP`}
        </button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </Panel>
  );
}

function BuildingDetail({ k, s, b, issues, onClose, onUpgrade, onDemolish }: {
  k: Kingdom; s: Settlement; d: District; b: PlacedBuilding; issues: string[];
  onClose: () => void; onUpgrade: (to: string) => void; onDemolish: () => void;
}) {
  const def = building(b.type);
  const setup = k.settings.setupMode;
  const rows: [string, string | undefined][] = [
    ['Discount', def.discounts?.map((x) => building(x).name).join(', ')],
    ['Limit', def.limitText], ['Special', def.specialText], ['Magic items', def.magicItems], ['Settlement', def.settlementText],
  ];
  void s;
  return (
    <Panel title={def.name} actions={<button className="btn sm ghost" onClick={onClose}>Close</button>}>
      <div className="row">
        <span className={`chip cat-${def.category}`}>{CATEGORY_LABEL[def.category]}</span>
        <span className="chip">{def.cost} BP</span>
        <span className="chip">{def.lots} lot{def.lots > 1 ? 's' : ''}</span>
        {modsText(def).map((m) => <span key={m} className="chip">{m}</span>)}
      </div>
      {def.description && <p className="muted">{def.description}</p>}
      <table className="breakdown small"><tbody>
        {rows.filter(([, v]) => v).map(([l, v]) => <tr key={l}><td style={{ width: '6.5em', verticalAlign: 'top' }}><strong>{l}</strong></td><td style={{ textAlign: 'left', fontWeight: 400, width: 'auto' }}>{v}</td></tr>)}
      </tbody></table>
      {issues.map((i) => <p key={i} className="callout">{i}</p>)}
      <div className="row">
        {def.upgradeTo?.map((to) => (
          <button key={to} className="btn" onClick={() => onUpgrade(to)}>
            Upgrade to {building(to).name}{setup ? '' : ` (${upgradeCost(def.id, to)} BP)`}
          </button>
        ))}
        <button className="btn danger" onClick={onDemolish}>{setup ? 'Remove' : 'Demolish (1 BP)'}</button>
      </div>
    </Panel>
  );
}

function Palette({ k, s, onPick }: { k: Kingdom; s: Settlement; onPick: (type: string) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const ids = { q: useId('pq'), c: useId('pc') };
  const list = BUILDINGS.filter((b) => b.kind === 'lot')
    .filter((b) => (!cat || b.category === cat) && (!q || b.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Panel title="Build">
      <div className="row">
        <label className="field" htmlFor={ids.q} style={{ flex: 1 }}>Search
          <input id={ids.q} type="text" value={q} placeholder="Inn, Temple…" onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field" htmlFor={ids.c}>Type
          <select id={ids.c} value={cat} onChange={(e) => setCat(e.target.value as Category | '')}>
            <option value="">All</option>
            {Object.entries(CATEGORY_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="palette">
        {list.map((b) => {
          const price = buildCost(s, b.id);
          return (
            <button key={b.id} className="pal-item" onClick={() => onPick(b.id)} title={b.description}>
              <span className={`swatch cat-${b.category}`}>{b.short}</span>
              <span style={{ minWidth: 0 }}>
                <strong>{b.name}</strong> <span className="small muted">{b.lots} lot{b.lots > 1 ? 's' : ''}</span>
                <span className="mods">{modsText(b).join(' · ')}{b.limitText ? ` · ${b.limitText}` : ''}</span>
              </span>
              <span className="cost">{price.cost !== price.base && <s>{price.base}</s>}{k.settings.setupMode ? '—' : price.cost} BP</span>
            </button>
          );
        })}
        {!list.length && <p className="muted small">No buildings match.</p>}
      </div>
    </Panel>
  );
}

function DistrictControls({ k, s, d }: { k: Kingdom; s: Settlement; d: District }) {
  const setup = k.settings.setupMode;
  const dname = useId('dname');
  const improvements = BUILDINGS.filter((b) => b.kind === 'district');
  const addons = BUILDINGS.filter((b) => b.kind === 'addon');
  return (
    <Panel title="District">
      <label className="field" htmlFor={dname}>District name
        <input id={dname} type="text" value={d.name} onChange={(e) => update('Rename district', (dk) => {
          dk.settlements.find((x) => x.id === s.id)!.districts.find((x) => x.id === d.id)!.name = e.target.value;
        })} />
      </label>
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Border</th><th>Edge</th><th>Fortification (2 BP each)</th></tr></thead>
          <tbody>
            {(['n', 'e', 's', 'w'] as Side[]).map((side) => (
              <tr key={side}>
                <td style={{ textTransform: 'capitalize' }}>{SIDE_LABEL[side]}</td>
                <td>
                  <select aria-label={`${SIDE_LABEL[side]} border`} value={d.borders[side]}
                    onChange={(e) => update('Change border', (dk) => {
                      dk.settlements.find((x) => x.id === s.id)!.districts.find((x) => x.id === d.id)!.borders[side] = e.target.value as 'land' | 'water';
                    })}>
                    <option value="land">Land</option>
                    <option value="water">Water (river, lake, sea)</option>
                  </select>
                </td>
                <td>
                  <select aria-label={`${SIDE_LABEL[side]} fortification`} value={d.walls[side] ?? ''} disabled={d.borders[side] === 'water'}
                    onChange={(e) => update('Change fortification', (dk) => setWall(dk, s.id, d.id, side, (e.target.value || null) as 'city-wall' | 'moat' | null))}>
                    <option value="">None</option>
                    <option value="city-wall">City Wall (Defense +1, Unrest −2 once)</option>
                    <option value="moat">Moat (Defense +1, Unrest −1 once)</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stack">
        <h3>District-wide</h3>
        {improvements.map((b) => {
          const has = d.improvements.includes(b.id);
          return (
            <label key={b.id} className="check">
              <input type="checkbox" checked={has} onChange={() => update(`${has ? 'Remove' : 'Build'} ${b.name}`, (dk) => toggleImprovement(dk, s.id, d.id, b.id))} />
              <span><strong>{b.name}</strong> <span className="small muted">{setup ? '' : `${buildCost(s, b.id).cost} BP · `}{modsText(b).join(', ')}</span></span>
            </label>
          );
        })}
        {addons.map((b) => (
          <div key={b.id} className="row">
            <span style={{ flex: 1, minWidth: 0 }}><strong>{b.name}</strong> <span className="small muted">{b.cost} BP · {b.limitText}</span></span>
            <button className="btn sm" aria-label={`Remove ${b.name}`} onClick={() => update(`Remove ${b.name}`, (dk) => changeAddon(dk, s.id, d.id, b.id, -1))}>−</button>
            <span className="num">{d.addons[b.id] ?? 0}</span>
            <button className="btn sm" aria-label={`Add ${b.name}`} onClick={() => update(`Add ${b.name}`, (dk) => changeAddon(dk, s.id, d.id, b.id, 1))}>+</button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
