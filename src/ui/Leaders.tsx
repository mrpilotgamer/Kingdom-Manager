import { computeStats, fmt, leaderFilled } from '../engine/stats';
import { ATTR_LABEL, ATTRS, type Attr } from '../rules/kingdom';
import { ROLES, type RoleDef } from '../rules/leadership';
import { update } from '../state/store';
import type { Kingdom, Leader } from '../state/types';
import { Panel } from './common';

const blank = (): Leader => ({ name: '', mod: 0, leadershipFeat: false, attrs: [], active: true });

export function Leaders({ k }: { k: Kingdom }) {
  const st = computeStats(k);
  const edit = (role: RoleDef, fn: (l: Leader) => void) =>
    update(`Edit ${role.name}`, (d) => {
      const l = d.leaders[role.id] ?? blank();
      fn(l);
      d.leaders[role.id] = l;
    });
  return (
    <Panel title="Leadership">
      <p className="small muted">
        Enter each leader's ability modifier (the higher of the two listed). Leaders must spend 7 days a month on their duties;
        untick <em>On duty</em> for a month they skip, and the role counts as vacant.
      </p>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr><th>Role</th><th>Leader</th><th>Mod</th>{k.settings.roleSkills && <th>Skill ranks</th>}<th>Leadership feat</th><th>On duty</th><th>Effect now</th></tr>
          </thead>
          <tbody>
            {ROLES.map((role) => {
              const l = k.leaders[role.id];
              const filled = leaderFilled(k, role.id);
              const value = l ? (role.half ? Math.floor(l.mod / 2) : l.mod) + (l.leadershipFeat ? 1 : 0) + (k.settings.roleSkills ? Math.floor((l.skillRanks ?? 0) / 5) : 0) : 0;
              const nAttrs = role.id === 'ruler' ? st.rulerAttrCount : 1;
              const attrs = (l?.attrs.length ? l.attrs : ['economy' as Attr]).slice(0, nAttrs);
              return (
                <tr key={role.id}>
                  <td style={{ minWidth: 170 }}>
                    <strong>{role.name}</strong>{role.optional && <span className="muted small"> (optional)</span>}
                    <div className="small muted">{role.benefit}</div>
                  </td>
                  <td>
                    <input type="text" aria-label={`${role.name} name`} placeholder="Vacant" value={l?.name ?? ''}
                      onChange={(e) => edit(role, (x) => { x.name = e.target.value; })} />
                  </td>
                  <td>
                    <input type="number" aria-label={`${role.name} ${role.ability} modifier`} value={l?.mod ?? 0}
                      onChange={(e) => edit(role, (x) => { x.mod = Number(e.target.value) || 0; })} />
                    <div className="small muted">{role.ability}{role.half ? ' (half)' : ''}</div>
                  </td>
                  {k.settings.roleSkills && (
                    <td>
                      <input type="number" min={0} aria-label={`${role.name} ${role.skill} ranks`} value={l?.skillRanks ?? 0}
                        onChange={(e) => edit(role, (x) => { x.skillRanks = Math.max(0, Number(e.target.value) || 0); })} />
                      <div className="small muted">{role.skill} (+1 per 5)</div>
                    </td>
                  )}
                  <td>
                    <input type="checkbox" aria-label={`${role.name} has Leadership`} checked={!!l?.leadershipFeat}
                      onChange={(e) => edit(role, (x) => { x.leadershipFeat = e.target.checked; })} />
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`${role.name} on duty`} checked={l ? l.active : true}
                      onChange={(e) => edit(role, (x) => { x.active = e.target.checked; })} />
                  </td>
                  <td style={{ minWidth: 180 }}>
                    {filled ? (
                      role.attr === 'choice' ? (
                        <div className="stack" style={{ gap: 4 }}>
                          {Array.from({ length: nAttrs }, (_, i) => (
                            <select key={i} aria-label={`${role.name} attribute ${i + 1}`} value={attrs[i] ?? 'economy'}
                              onChange={(e) => edit(role, (x) => {
                                const next = [...attrs];
                                next[i] = e.target.value as Attr;
                                x.attrs = next;
                              })}>
                              {ATTRS.map((a) => <option key={a} value={a}>{ATTR_LABEL[a]} {fmt(value)}</option>)}
                            </select>
                          ))}
                        </div>
                      ) : (
                        <span className="pos">{ATTR_LABEL[role.attr]} {fmt(value)}</span>
                      )
                    ) : role.optional ? (
                      <span className="muted">No effect</span>
                    ) : role.id === 'ruler' && st.rulerCovered ? (
                      <span className="small">Covered by the {st.rulerCovered === 'consort' ? 'Consort' : 'Heir'}</span>
                    ) : (
                      <span className="small neg">Vacant: {role.vacancyText}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
