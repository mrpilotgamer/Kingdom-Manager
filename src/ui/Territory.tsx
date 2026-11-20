import { useState } from 'react';
import { activateMap, newMap } from '../engine/map';
import { HexMapView } from './HexMap';
import { abandonHex, addFeature, claimHex, loseHex, removeFeature } from '../engine/actions';
import { computeStats } from '../engine/stats';
import { FEATURES, TERRAIN, type FeatureDef, type Terrain } from '../rules/kingdom';
import { update } from '../state/store';
import type { Kingdom } from '../state/types';
import { Panel, useId } from './common';

function costFor(f: FeatureDef, terrain: Terrain, river: boolean, size: number): number | null {
  if (f.fixedCost !== undefined) return f.fixedCost;
  const t = TERRAIN[terrain];
  if (f.id === 'farm') return t.farmCost;
  if (f.id === 'road' || f.id === 'aqueduct') return t.roadCost * (river && f.id === 'road' ? 2 : 1);
  if (f.id === 'highway') return size >= 26 ? t.roadCost * (river ? 2 : 1) * 2 : null;
  return 0;
}

export function Territory({ k, go }: { k: Kingdom; go: (t: 'settlements') => void }) {
  if (k.map?.active) return <MapTerritory k={k} go={go} />;
  return (
    <>
      <MapSetup k={k} go={go} />
      <CountsTerritory k={k} />
    </>
  );
}

function MapTerritory({ k, go }: { k: Kingdom; go: (t: 'settlements') => void }) {
  const st = computeStats(k);
  const t = k.turnState;
  const f = k.features;
  const rows: [string, number][] = [
    ['Farms', f.farm ?? 0], ['Fisheries', f.fishery ?? 0], ['Mines', f.mine ?? 0], ['Quarries', f.quarry ?? 0],
    ['Sawmills', f.sawmill ?? 0], ['Road hexes', f.road ?? 0], ['Highway hexes', f.highway ?? 0], ['Forts', f.fort ?? 0],
    ['Watchtowers', f.watchtower ?? 0], ['River hexes', f.river ?? 0], ['Resources', f.resource ?? 0],
    ['Landmarks', f.landmark ?? 0], ['Lairs', f.lair ?? 0],
  ];
  return (
    <>
      <div className="row">
        <span className="chip">Size {k.size}</span>
        <span className="chip">Hex claims this turn {t.hexClaims} / {st.limits.hexClaims}</span>
        <span className="chip">Improvements this turn {t.improvements} / {st.limits.improvements}</span>
        {k.settings.setupMode && <span className="chip warn">Setup mode: everything is free</span>}
      </div>
      <HexMapView k={k} go={go} />
      <div className="grid-2">
        <Panel title="From the map">
          <p className="small muted">Counted from your claimed hexes and fed into the kingdom sheet.</p>
          <table className="breakdown"><tbody>
            {rows.filter(([, n]) => n).map(([l, n]) => <tr key={l}><td>{l}</td><td>{n}</td></tr>)}
          </tbody></table>
        </Panel>
        <Panel title="Aqueducts">
          <p className="small muted">An Aqueduct runs across several hexes from a hill or mountain source to a settlement. Count each finished one here: Loyalty +1, Stability +1.</p>
          <FeatureTable k={k} group="improvement" terrain="plains" river={false} only={['aqueduct']} />
        </Panel>
      </div>
    </>
  );
}

function MapSetup({ k, go }: { k: Kingdom; go: (t: 'settlements') => void }) {
  const [confirm, setConfirm] = useState(false);
  if (!k.map) {
    return (
      <Panel title="Hex map">
        <p>Draw your kingdom on a hex map: paint terrain and rivers, track exploration, claim hexes, and build improvements where they stand.</p>
        <div><button className="btn primary" onClick={() => update('Create hex map', (d) => { d.map = newMap(16, 12, false); })}>Create a hex map</button></div>
      </Panel>
    );
  }
  const claimed = Object.values(k.map.hexes).filter((h) => h.status === 'claimed').length;
  return (
    <>
      <div className="callout info stack">
        <p>
          Your kingdom still uses the counts below. Set up the map first: paint terrain, then turn on Setup mode (Options) and use the
          Exploration brush to mark your {k.size} claimed hexes for free, and add their improvements.
        </p>
        <p>When it matches, switch over. Size and improvements will then come from the map ({claimed} claimed hex{claimed === 1 ? '' : 'es'} right now).</p>
        <div className="row">
          {confirm ? (
            <>
              <span className="small">Size will become {claimed} (now {k.size}). Improvement counts will be replaced by what's on the map.</span>
              <button className="btn sm primary" onClick={() => update('Use hex map', activateMap)}>Switch to the map</button>
              <button className="btn sm ghost" onClick={() => setConfirm(false)}>Not yet</button>
            </>
          ) : <button className="btn primary" onClick={() => setConfirm(true)}>Use the map for Size and improvements</button>}
        </div>
      </div>
      <HexMapView k={k} go={go} />
    </>
  );
}

function CountsTerritory({ k }: { k: Kingdom }) {
  const st = computeStats(k);
  const setup = k.settings.setupMode;
  const [terrain, setTerrain] = useState<Terrain>('plains');
  const [river, setRiver] = useState(false);
  const ids = { t: useId('ter'), r: useId('ter') };
  const t = k.turnState;
  return (
    <>
      <div className="grid-2">
        <Panel title={`Size ${k.size}`}>
          <p className="small muted">
            Claiming needs an explored and cleared hex adjacent to your kingdom, and costs 1 BP.
            This turn: {t.hexClaims} of {st.limits.hexClaims} claims used.
          </p>
          {!st.rulerCovered && <p className="callout bad">No Ruler: you cannot claim hexes.</p>}
          <div className="row">
            <button className="btn primary" onClick={() => update('Claim hex', claimHex)}>Claim a hex{setup ? '' : ' (1 BP)'}</button>
            <button className="btn" onClick={() => update('Abandon hex', (d) => abandonHex(d))}>Abandon a hex{setup ? '' : ' (Unrest +1)'}</button>
            {k.unrest >= 11 && <button className="btn danger" onClick={() => update('Lose hex', loseHex)}>Lose a hex to Unrest</button>}
          </div>
        </Panel>
        <Panel title="Build in">
          <div className="row">
            <label className="field" htmlFor={ids.t}>Hex terrain
              <select id={ids.t} value={terrain} onChange={(e) => setTerrain(e.target.value as Terrain)}>
                {Object.entries(TERRAIN).map(([id, x]) => <option key={id} value={id}>{x.label}</option>)}
              </select>
            </label>
            <label className="check" htmlFor={ids.r}><input id={ids.r} type="checkbox" checked={river} onChange={(e) => setRiver(e.target.checked)} /> Hex has a river</label>
          </div>
          <p className="small muted">Sets the price of Farms, Roads, and Highways below. This turn: {t.improvements} of {st.limits.improvements} terrain improvements used.</p>
        </Panel>
      </div>
      <Panel title="Terrain improvements">
        <FeatureTable k={k} group="improvement" terrain={terrain} river={river} />
      </Panel>
      <Panel title="Special terrain">
        <p className="small muted">Placed by the GM and discovered while exploring. Add them as you claim those hexes.</p>
        <FeatureTable k={k} group="special" terrain={terrain} river={river} />
      </Panel>
    </>
  );
}

function FeatureTable({ k, group, terrain, river, only }: { k: Kingdom; group: FeatureDef['group']; terrain: Terrain; river: boolean; only?: string[] }) {
  const setup = k.settings.setupMode;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead><tr><th>Feature</th><th>Effect</th><th>Cost</th><th>Count</th><th /></tr></thead>
        <tbody>
          {FEATURES.filter((f) => f.group === group && (!only || only.includes(f.id))).map((f) => {
            const cost = costFor(f, terrain, river, k.size);
            const n = k.features[f.id] ?? 0;
            const blocked = cost === null;
            return (
              <tr key={f.id}>
                <td><strong>{f.label}</strong></td>
                <td className="small">{f.effect}</td>
                <td className="small">{group === 'special' ? '—' : blocked ? <span className="muted">Not on {TERRAIN[terrain].label.toLowerCase()}{f.id === 'highway' ? ' / needs Size 26' : ''}</span> : `${cost} BP`}</td>
                <td className="num"><strong>{n}</strong></td>
                <td>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn sm" disabled={!n} aria-label={`Remove ${f.label}`}
                      onClick={() => update(`Remove ${f.label}`, (d) => removeFeature(d, f.id, f.label))}>−</button>
                    <button className="btn sm" disabled={blocked} aria-label={`Add ${f.label}`}
                      onClick={() => update(`Add ${f.label}`, (d) => addFeature(d, f.id, cost ?? 0, `${f.label}${group === 'improvement' && !setup ? ` (${cost} BP)` : ''}`))}>
                      {group === 'improvement' && !setup ? `Build` : 'Add'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
