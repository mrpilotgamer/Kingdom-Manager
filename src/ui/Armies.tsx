import { useState } from 'react';
import {
  armyStats, armyUpkeepTotal, blankArmy, buyResource, commanderBonus, disband, fitsReserve, fromPreset,
  leadership, maxBoons, recruit, removeResource, reserveCapacity, resourceAllowed, resourceCost, rest,
} from '../engine/armies';
import { leaderFilled } from '../engine/stats';
import { hexName } from '../engine/map';
import {
  ARMY_SIZES, BOONS, CR_LADDER, crLabel, HD_AVG, LEARNABLE_TACTICS, PRESETS, RESOURCES, ROLE_BOONS, SIZE_INFO, SPECIALS,
  TACTICS, type ArmySize, type BoonId, type HitDie, type ResourceId, type SpecialId, type TacticId,
} from '../rules/massCombat';
import { ROLE_BY_ID, ROLES, type RoleId } from '../rules/leadership';
import { update } from '../state/store';
import type { Army, Commander, Kingdom } from '../state/types';
import { BattleSetupPanel, BattleView } from './Battle';
import { Panel, useId } from './common';

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

export function Armies({ k }: { k: Kingdom }) {
  const [settingUp, setSettingUp] = useState(false);
  const ours = (k.armies ?? []).filter((a) => a.side === 'kingdom' && a.status !== 'disbanded');
  const foes = (k.armies ?? []).filter((a) => a.side === 'enemy');
  const fallen = ours.filter((a) => a.status === 'defeated');
  return (
    <>
      {k.battle ? <BattleView k={k} /> : settingUp ? (
        <BattleSetupPanel k={k} onDone={() => setSettingUp(false)} />
      ) : (
        <Panel title="Battle" actions={
          <button className="btn primary" disabled={!ours.some((a) => a.status === 'ready') || !foes.some((a) => a.status !== 'defeated')}
            onClick={() => setSettingUp(true)}>Start a battle</button>}>
          <p className="small muted">
            Battles run in three phases: tactics, one round of ranged attacks, then melee until one side is destroyed, routs,
            or withdraws. Add your armies and the enemy’s below, then start a battle.
          </p>
        </Panel>
      )}

      <Panel title="Your armies" actions={<Recruit side="kingdom" />}>
        <p className="small muted">
          Upkeep: {armyUpkeepTotal(k)} BP a month (Consumption is weekly for deployed armies, monthly for armies in reserve).
          Recruiting counts toward this turn’s “new settlements or armies” limit.
        </p>
        {ours.length === 0 && <p className="muted">No armies yet. Recruit one from a sample army or build your own.</p>}
        <div className="army-grid">
          {ours.filter((a) => a.status !== 'defeated').map((a) => <ArmyCard key={a.id} k={k} a={a} />)}
        </div>
        {fallen.length > 0 && <p className="small muted">Destroyed: {fallen.map((a) => a.name).join(', ')}.</p>}
      </Panel>

      <Panel title="Enemy armies" actions={<Recruit side="enemy" />}>
        <p className="small muted">For the GM: armies your kingdom may face. They cost nothing to add.</p>
        <div className="army-grid">
          {foes.map((a) => <ArmyCard key={a.id} k={k} a={a} />)}
        </div>
      </Panel>
    </>
  );
}

function Recruit({ side }: { side: Army['side'] }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState('');
  const [size, setSize] = useState<ArmySize | ''>('');
  const [name, setName] = useState('');
  const ids = { p: useId('rc'), s: useId('rc'), n: useId('rc') };
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>{side === 'kingdom' ? 'Recruit an army' : 'Add an enemy army'}</button>;
  const list = [...PRESETS].sort((a, b) => Number(!!a.foe === (side === 'kingdom')) - Number(!!b.foe === (side === 'kingdom')));
  const p = PRESETS.find((x) => x.name === preset);
  const draft = p ? fromPreset(p, side) : blankArmy(side);
  if (size) draft.size = size;
  const st = armyStats(draft);
  return (
    <div className="stack recruit">
      <div className="row">
        <label className="field" htmlFor={ids.p}>Start from
          <select id={ids.p} value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">Custom army</option>
            {list.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.type})</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.s}>Size
          <select id={ids.s} value={size || draft.size} onChange={(e) => setSize(e.target.value as ArmySize)}>
            {ARMY_SIZES.map((z) => <option key={z} value={z}>{SIZE_INFO[z].label} ({SIZE_INFO[z].units.toLocaleString()} units)</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.n} style={{ flex: 1, minWidth: 140 }}>Name
          <input id={ids.n} type="text" value={name} placeholder={draft.name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <p className="small muted">
        {st.acr === null ? 'Too small to count as an army (ACR below 1/8): choose a bigger size.'
          : `ACR ${st.acrLabel} · hp ${st.hpMax} · DV ${st.dv} · OM ${signed(st.om)}${st.ranged ? ', ranged' : ''} · Consumption ${st.consumption}/week`}
        {side === 'kingdom' && p?.resources?.length ? ' · Starts with its listed resources (recruitment cost not charged; buy more below).' : ''}
      </p>
      <div className="row">
        <button className="btn primary" disabled={st.acr === null} onClick={() => {
          const a = draft;
          if (name.trim()) a.name = name.trim();
          a.hp = armyStats(a).hpMax;
          update(side === 'kingdom' ? `Recruit ${a.name}` : `Add ${a.name}`, (d) => recruit(d, a));
          setOpen(false); setName(''); setPreset(''); setSize('');
        }}>{side === 'kingdom' ? 'Recruit' : 'Add'}</button>
        <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function hpBar(hp: number, max: number) {
  const pct = max ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  return (
    <div className="hpbar" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} aria-label="Hit points">
      <span style={{ width: `${pct}%` }} className={pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''} />
    </div>
  );
}

export function ArmyCard({ k, a }: { k: Kingdom; a: Army }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [days, setDays] = useState(1);
  const st = armyStats(a);
  const daysId = useId('rest');
  const reserveName = a.reserve ? k.settlements.find((s) => s.id === a.reserve)?.name : undefined;
  return (
    <div className={`army-card ${a.side}`}>
      <div className="row">
        <h3 style={{ flex: 1, minWidth: 0 }}>{a.name}</h3>
        {a.status !== 'ready' && <span className={`chip ${a.status === 'routed' ? 'warn' : 'bad'}`}>{a.status === 'routed' ? 'Routed' : a.status === 'defeated' ? 'Destroyed' : 'Deserted'}</span>}
        {reserveName && <span className="chip">Reserve: {reserveName}</span>}
        {a.location && k.map && !reserveName && <span className="chip">{hexName(k.map, a.location)}</span>}
        {a.unpaid && <span className="chip bad">Unpaid</span>}
      </div>
      <p className="small muted">{a.alignment} {SIZE_INFO[a.size].label} army of {a.type} · {st.units.toLocaleString()} units</p>
      <div className="row small">
        <span className="num"><strong>hp</strong> {a.hp}/{st.hpMax}</span>
        <span style={{ flex: 1, minWidth: 80 }}>{hpBar(a.hp, st.hpMax)}</span>
      </div>
      <div className="statline">
        <span><b>ACR</b> {st.acrLabel}</span>
        <span><b>DV</b> {st.dv}</span>
        <span><b>OM</b> {signed(st.om)}{st.ranged ? ', ranged' : ''}</span>
        <span><b>Morale</b> {signed(st.effectiveMorale)}{a.unpaid ? ' (unpaid)' : ''}</span>
        <span><b>Speed</b> {a.speed}</span>
        <span><b>Consumption</b> {st.consumption}/{a.reserve ? 'month' : 'week'}</span>
      </div>
      <dl className="army-dl small">
        <dt>Tactics</dt><dd>{st.usableTactics.map((t) => TACTICS[t].label).join(', ')}</dd>
        {(a.resources.armor || a.resources.weapons || a.resources.mounts || a.resources.ranged || a.resources.potions || a.resources.siege) ? (
          <><dt>Resources</dt><dd>{resourceList(a).join(', ')}</dd></>
        ) : null}
        {a.specials.length > 0 && <><dt>Special</dt><dd>{a.specials.map((s) => `${SPECIALS[s.id]?.label ?? s.id}${s.value ? ` ${s.id === 'bravery' ? '+' : ''}${s.value}` : ''}${s.note ? ` (${s.note})` : ''}`).join(', ')}</dd></>}
        <dt>Commander</dt>
        <dd>{a.commander ? `${a.commander.name}${a.commander.role ? ` (${ROLE_BY_ID[a.commander.role].name})` : ''}: Morale ${signed(commanderBonus(a.commander))}, Leadership ${leadership(a.commander)}${a.commander.boons.length ? `; ${a.commander.boons.map((b) => BOONS[b].label).join(', ')}` : ''}` : (a.side === 'kingdom' ? <span className="neg">None: loses Morale every week</span> : <span className="muted">None</span>)}</dd>
      </dl>
      <div className="row">
        <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
        {a.status !== 'defeated' && a.hp < st.hpMax && !k.battle && (
          <span className="row small" style={{ gap: 4 }}>
            <label htmlFor={daysId} className="muted">Rest</label>
            <input id={daysId} type="number" min={1} max={30} value={days} style={{ width: '4em' }} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} />
            <button className="btn sm" onClick={() => update(`Rest ${a.name}`, (d) => rest(d, a.id, days))}>days (+{Math.max(1, Math.floor(st.acr ?? 1)) * days} hp)</button>
          </span>
        )}
        <span className="spacer" />
        {confirm ? (
          <span className="row small">{a.side === 'kingdom' ? 'Disband it?' : 'Remove it?'}
            <button className="btn sm danger" onClick={() => update('Disband army', (d) => disband(d, a.id))}>Yes</button>
            <button className="btn sm ghost" onClick={() => setConfirm(false)}>No</button>
          </span>
        ) : <button className="btn sm ghost danger" disabled={!!k.battle?.armies.some((x) => x.armyId === a.id)} onClick={() => setConfirm(true)}>{a.side === 'kingdom' ? 'Disband' : 'Remove'}</button>}
      </div>
      {editing && <ArmyEditor k={k} a={a} />}
    </div>
  );
}

function resourceList(a: Army) {
  const r = a.resources, out: string[] = [];
  if (r.armor) out.push(r.armor === 2 ? 'magic armor' : 'improved armor');
  if (r.weapons) out.push(r.weapons === 2 ? 'magic weapons' : 'improved weapons');
  if (r.mounts) out.push('mounts');
  if (r.ranged) out.push('ranged weapons');
  if (r.potions) out.push('healing potions');
  if (r.siege) out.push(`${r.siege} siege engine${r.siege > 1 ? 's' : ''}`);
  return out;
}

function ArmyEditor({ k, a }: { k: Kingdom; a: Army }) {
  const st = armyStats(a);
  const edit = (label: string, fn: (x: Army) => void) => update(label, (d) => { fn(d.armies!.find((y) => y.id === a.id)!); });
  const ids = Object.fromEntries(['n', 't', 'al', 'sz', 'cr', 'hd', 'mcr', 'sp', 'hp', 'mo', 'om', 'dv', 'res', 'sa', 'sv'].map((x) => [x, useId(`ae-${x}`)]));
  const [newSpecial, setNewSpecial] = useState<SpecialId>('darkvision');
  const [specialValue, setSpecialValue] = useState(1);
  const free = k.settings.setupMode || a.side === 'enemy';
  const reserveOptions = k.settlements.filter((s) => reserveCapacity(k, s.id));
  return (
    <div className="stack army-editor">
      <div className="gen-grid">
        <label className="field" htmlFor={ids.n}>Name<input id={ids.n} type="text" value={a.name} onChange={(e) => edit('Rename army', (x) => { x.name = e.target.value; })} /></label>
        <label className="field" htmlFor={ids.t}>Units<input id={ids.t} type="text" value={a.type} onChange={(e) => edit('Edit army', (x) => { x.type = e.target.value; })} /></label>
        <label className="field" htmlFor={ids.sz}>Size
          <select id={ids.sz} value={a.size} onChange={(e) => edit('Resize army', (x) => {
            const pct = x.hp / Math.max(1, armyStats(x).hpMax);
            x.size = e.target.value as ArmySize;
            x.hp = Math.max(1, Math.round(armyStats(x).hpMax * pct));
          })}>
            {ARMY_SIZES.map((z) => <option key={z} value={z}>{SIZE_INFO[z].label}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.cr}>Unit CR
          <select id={ids.cr} value={CR_LADDER.findIndex((c) => Math.abs(c - a.cr) < 1e-6)} onChange={(e) => edit('Edit army', (x) => { x.cr = CR_LADDER[Number(e.target.value)]; })}>
            {CR_LADDER.slice(0, 30).map((c, i) => <option key={i} value={i}>{crLabel(c)}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.hd}>Hit Die
          <select id={ids.hd} value={a.hd} onChange={(e) => edit('Edit army', (x) => { x.hd = e.target.value as HitDie; })}>
            {(Object.keys(HD_AVG) as HitDie[]).map((h) => <option key={h} value={h}>{h} ({HD_AVG[h]} per ACR)</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.al}>Alignment<input id={ids.al} type="text" value={a.alignment} onChange={(e) => edit('Edit army', (x) => { x.alignment = e.target.value; })} /></label>
        <label className="field" htmlFor={ids.hp}>Current hp<input id={ids.hp} type="number" min={0} max={st.hpMax} value={a.hp} onChange={(e) => edit('Set army hp', (x) => { x.hp = Math.max(0, Math.min(st.hpMax, Number(e.target.value) || 0)); })} /></label>
        <label className="field" htmlFor={ids.mo}>Morale (−4 to +4)<input id={ids.mo} type="number" min={-4} max={4} value={a.morale} onChange={(e) => edit('Set Morale', (x) => { x.morale = Math.max(-4, Math.min(4, Number(e.target.value) || 0)); })} /></label>
        <label className="field" htmlFor={ids.sp}>Speed (hexes/day)<input id={ids.sp} type="number" min={0} value={a.speed} onChange={(e) => edit('Edit army', (x) => { x.speed = Number(e.target.value) || 0; })} /></label>
        <label className="field" htmlFor={ids.om}>Extra OM<input id={ids.om} type="number" value={a.om} onChange={(e) => edit('Adjust OM', (x) => { x.om = Number(e.target.value) || 0; })} /></label>
        <label className="field" htmlFor={ids.dv}>Extra DV<input id={ids.dv} type="number" value={a.dv} onChange={(e) => edit('Adjust DV', (x) => { x.dv = Number(e.target.value) || 0; })} /></label>
        {a.side === 'kingdom' && (
          <label className="field" htmlFor={ids.res}>Held in reserve
            <select id={ids.res} value={a.reserve ?? ''} onChange={(e) => edit('Move army', (x) => { x.reserve = e.target.value || undefined; })}>
              <option value="">No: deployed</option>
              {reserveOptions.map((s) => (
                <option key={s.id} value={s.id} disabled={!fitsReserve(k, a, s.id)}>
                  {s.name} (up to {SIZE_INFO[reserveCapacity(k, s.id)!].label}){fitsReserve(k, a, s.id) ? '' : ': too small'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {a.side === 'kingdom' && !reserveOptions.length && <p className="small muted">A Watchtower, Barracks, Castle, or Garrison lets a settlement hold armies in reserve (paid monthly instead of weekly).</p>}

      <h4>Tactics <span className="small muted">({a.tactics.length} of {st.maxTactics} known; Standard and Withdraw are free)</span></h4>
      <div className="check-grid">
        {LEARNABLE_TACTICS.map((t) => {
          const known = a.tactics.includes(t);
          return (
            <label key={t} className="check small" title={TACTICS[t].text}>
              <input type="checkbox" checked={known} disabled={!known && a.tactics.length >= st.maxTactics && a.side === 'kingdom'}
                onChange={(e) => edit('Change tactics', (x) => { x.tactics = e.target.checked ? [...x.tactics, t] : x.tactics.filter((y) => y !== t); })} />
              {TACTICS[t].label}
            </label>
          );
        })}
      </div>

      <h4>Resources</h4>
      <table className="list small"><tbody>
        {(Object.keys(RESOURCES) as ResourceId[]).map((r) => {
          const owned = r === 'armor' ? a.resources.armor === 1 : r === 'magicArmor' ? a.resources.armor === 2 : r === 'weapons' ? a.resources.weapons === 1
            : r === 'magicWeapons' ? a.resources.weapons === 2 : r === 'siege' ? false : !!a.resources[r as 'mounts' | 'ranged' | 'potions'];
          const allowed = resourceAllowed(k, r);
          const cost = resourceCost(a, r);
          return (
            <tr key={r}>
              <td><strong>{RESOURCES[r].label}</strong>{r === 'siege' && a.resources.siege ? ` (${a.resources.siege})` : ''}<div className="muted">{RESOURCES[r].text}{!allowed.ok && a.side === 'kingdom' ? ` ${allowed.why}` : ''}</div></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {owned || (r === 'siege' && a.resources.siege) ? (
                  <button className="btn sm ghost danger" onClick={() => update('Remove resource', (d) => removeResource(d, a.id, r))}>Remove</button>
                ) : null}
                {!owned && (
                  <button className="btn sm" disabled={a.side === 'kingdom' && !allowed.ok && !k.settings.setupMode}
                    onClick={() => update(`Buy ${RESOURCES[r].label}`, (d) => buyResource(d, a.id, r))}>
                    {free ? 'Add' : `Buy · ${cost} BP`}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody></table>

      <h4>Special abilities</h4>
      {a.specials.length > 0 && (
        <div className="row">
          {a.specials.map((s, i) => (
            <span key={i} className="chip">
              {SPECIALS[s.id]?.label ?? s.id}{s.value ? ` ${s.value}` : ''}{s.note ? ` (${s.note})` : ''}
              <button className="linklike" aria-label={`Remove ${SPECIALS[s.id]?.label}`} onClick={() => edit('Remove ability', (x) => { x.specials = x.specials.filter((_, j) => j !== i); })}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <label className="field" htmlFor={ids.sa}>Add ability
          <select id={ids.sa} value={newSpecial} onChange={(e) => setNewSpecial(e.target.value as SpecialId)}>
            {(Object.keys(SPECIALS) as SpecialId[]).map((s) => <option key={s} value={s}>{SPECIALS[s].label}</option>)}
          </select>
        </label>
        {SPECIALS[newSpecial].value && SPECIALS[newSpecial].value !== 'note' && (
          <label className="field" htmlFor={ids.sv}>{SPECIALS[newSpecial].value}<input id={ids.sv} type="number" value={specialValue} onChange={(e) => setSpecialValue(Number(e.target.value) || 0)} /></label>
        )}
        <button className="btn sm" style={{ alignSelf: 'flex-end' }} onClick={() => edit('Add ability', (x) => {
          const note = SPECIALS[newSpecial].value === 'note' ? 'describe it' : undefined;
          x.specials.push({ id: newSpecial, value: SPECIALS[newSpecial].value && !note ? specialValue : undefined, note });
        })}>Add</button>
      </div>
      <p className="small muted">{SPECIALS[newSpecial].text}</p>

      <CommanderEditor k={k} a={a} />
    </div>
  );
}

function CommanderEditor({ k, a }: { k: Kingdom; a: Army }) {
  const c = a.commander;
  const edit = (fn: (c: Commander) => void) => update('Edit commander', (d) => {
    const x = d.armies!.find((y) => y.id === a.id)!;
    x.commander ??= { name: 'Captain', cha: 0, profession: 0, level: 1, leadershipFeat: false, boons: [] };
    fn(x.commander);
  });
  const ids = Object.fromEntries(['n', 'c', 'p', 'l', 'r'].map((x) => [x, useId(`ce-${x}`)]));
  if (!c) {
    return (
      <div className="stack">
        <h4>Commander</h4>
        <div className="row">
          <button className="btn sm" onClick={() => edit(() => {})}>Appoint a commander</button>
          <button className="btn sm ghost" onClick={() => edit((x) => { x.name = 'Promoted sergeant'; x.level = Math.max(1, Math.round(a.cr)); })}>Promote one of the troops</button>
        </div>
      </div>
    );
  }
  const roleBoons = c.role ? ROLE_BOONS[c.role] : [];
  const lead = leadership(c);
  const max = maxBoons(c);
  const leaders = ROLES.filter((r) => leaderFilled(k, r.id));
  return (
    <div className="stack">
      <div className="row">
        <h4 style={{ flex: 1 }}>Commander</h4>
        <button className="btn sm ghost danger" onClick={() => update('Remove commander', (d) => { delete d.armies!.find((y) => y.id === a.id)!.commander; })}>Remove</button>
      </div>
      <div className="gen-grid">
        {a.side === 'kingdom' && (
          <label className="field" htmlFor={ids.r}>Kingdom leader
            <select id={ids.r} value={c.role ?? ''} onChange={(e) => edit((x) => {
              const role = (e.target.value || undefined) as RoleId | undefined;
              x.role = role;
              if (role) { x.name = k.leaders[role]?.name || x.name; x.boons = [...new Set([...x.boons.filter((b) => !ROLE_BOONS[role].includes(b)), ROLE_BOONS[role][0]])]; }
            })}>
              <option value="">No: a hired commander</option>
              {leaders.map((r) => <option key={r.id} value={r.id}>{k.leaders[r.id]!.name} ({r.name})</option>)}
            </select>
          </label>
        )}
        <label className="field" htmlFor={ids.n}>Name<input id={ids.n} type="text" value={c.name} onChange={(e) => edit((x) => { x.name = e.target.value; })} /></label>
        <label className="field" htmlFor={ids.c}>Cha modifier<input id={ids.c} type="number" value={c.cha} onChange={(e) => edit((x) => { x.cha = Number(e.target.value) || 0; })} /></label>
        <label className="field" htmlFor={ids.p}>Profession (soldier) ranks<input id={ids.p} type="number" min={0} value={c.profession} onChange={(e) => edit((x) => { x.profession = Math.max(0, Number(e.target.value) || 0); })} /></label>
        <label className="field" htmlFor={ids.l}>Level or HD<input id={ids.l} type="number" min={1} value={c.level} onChange={(e) => edit((x) => { x.level = Math.max(1, Number(e.target.value) || 1); })} /></label>
        <label className="check" style={{ alignSelf: 'flex-end' }}><input type="checkbox" checked={c.leadershipFeat} onChange={(e) => edit((x) => { x.leadershipFeat = e.target.checked; })} /> Leadership feat</label>
      </div>
      <p className="small muted">Morale {signed(commanderBonus(c))} · Leadership {lead} · Boons {c.boons.length} of {max}{c.role ? ` · As ${ROLE_BY_ID[c.role].name}, automatically knows one of: ${roleBoons.map((b) => BOONS[b].label).join(', ')}` : ''}</p>
      <div className="check-grid">
        {(Object.keys(BOONS) as BoonId[]).map((b) => {
          const on = c.boons.includes(b);
          const eligible = roleBoons.includes(b) || lead >= BOONS[b].minLeadership;
          return (
            <label key={b} className="check small" title={`${BOONS[b].text}${BOONS[b].minLeadership ? ` Needs Leadership ${BOONS[b].minLeadership}.` : ''}`}>
              <input type="checkbox" checked={on} disabled={!on && (c.boons.length >= max || !eligible)}
                onChange={(e) => edit((x) => { x.boons = e.target.checked ? [...x.boons, b] : x.boons.filter((y) => y !== b); })} />
              {BOONS[b].label}{!eligible ? ` (Leadership ${BOONS[b].minLeadership})` : ''}
            </label>
          );
        })}
      </div>
      {c.boons.includes('bonusTactic') && (
        <label className="field">Bonus tactic
          <select value={c.bonusTactic ?? ''} onChange={(e) => edit((x) => { x.bonusTactic = (e.target.value || undefined) as TacticId | undefined; })}>
            <option value="">Choose</option>
            {LEARNABLE_TACTICS.map((t) => <option key={t} value={t}>{TACTICS[t].label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
