import { useState } from 'react';
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

export function Territory({ k }: { k: Kingdom }) {
  const st = computeStats(k);
  const setup = k.settings.setupMode;
  const [terrain, setTerrain] = useState<Terrain>('plains');
  const [river, setRiver] = useState(false);
  const ids = { t: useId('ter'), r: useId('ter') };
  const t = k.turnState;
  return (
    <>
      <div className="callout info">
        The hex map is coming in a later version. For now, track your territory as counts: each claimed hex adds 1 to Size,
        and improvements apply their bonuses kingdom-wide.
      </div>
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

function FeatureTable({ k, group, terrain, river }: { k: Kingdom; group: FeatureDef['group']; terrain: Terrain; river: boolean }) {
  const setup = k.settings.setupMode;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead><tr><th>Feature</th><th>Effect</th><th>Cost</th><th>Count</th><th /></tr></thead>
        <tbody>
          {FEATURES.filter((f) => f.group === group).map((f) => {
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
