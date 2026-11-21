// Army statistics and management (Ultimate Campaign mass combat).
import { building } from '../rules/buildings';
import {
  BOONS, CR_LADDER, crLabel, HD_AVG, PRESETS, RESOURCES, ROLE_BOONS, SIZE_INFO, SPECIALS, TACTICS,
  type ArmyPreset, type BoonId, type ResourceId, type TacticId,
} from '../rules/massCombat';
import type { Army, Commander, Kingdom } from '../state/types';
import { uid } from '../state/util';
import { log } from './actions';
import { allBuildings } from './stats';
import { kingdomCheck } from './turn';

/** Army Challenge Rating: the unit's CR (or its mounts', if higher) moved along the CR ladder by the army's size. */
export function acr(a: Pick<Army, 'cr' | 'mountCr' | 'size'>): number | null {
  const unit = Math.max(a.cr, a.mountCr ?? 0);
  let idx = CR_LADDER.findIndex((c) => Math.abs(c - unit) < 1e-6 || c > unit);
  if (idx < 0) idx = CR_LADDER.length - 1;
  const i = idx + SIZE_INFO[a.size].steps;
  return i < 0 ? null : CR_LADDER[Math.min(i, CR_LADDER.length - 1)];
}

const special = (a: Army, id: string) => a.specials.find((s) => s.id === id);

export function leadership(c: Commander) {
  return c.level + c.cha + (c.leadershipFeat ? 3 : 0);
}

/** Commander's bonus on Morale checks (kingdom leaders use the better of Profession/5 or level/6, minimum 1). */
export function commanderBonus(c?: Commander) {
  if (!c) return 0;
  const training = c.role ? Math.max(Math.floor(c.profession / 5), Math.floor(c.level / 6), 1) : Math.floor(c.profession / 5);
  return c.cha + training;
}
export function maxBoons(c: Commander) {
  const training = c.role ? Math.max(Math.floor(c.profession / 5), Math.floor(c.level / 6), 1) : Math.floor(c.profession / 5);
  return 1 + training;
}
/** Boons that work: a leader's role boons always count; others need the Leadership score. */
export function activeBoons(c?: Commander): BoonId[] {
  if (!c) return [];
  const lead = leadership(c);
  const roleBoons = c.role ? ROLE_BOONS[c.role] : [];
  return c.boons.filter((b) => roleBoons.includes(b) || lead >= BOONS[b].minLeadership);
}
export const hasBoon = (a: Army, b: BoonId) => activeBoons(a.commander).includes(b);

export function resourceCost(a: Army, r: ResourceId) {
  const def = RESOURCES[r];
  if (r === 'mounts') return Math.max(1, Math.ceil(acr(a) ?? 1));
  if (!def.scales) return def.cost;
  return Math.max(1, Math.round(def.cost * SIZE_INFO[a.size].resourceMult));
}
function resourceConsumption(a: Army, r: ResourceId) {
  const def = RESOURCES[r];
  if (!def.consumption) return 0;
  if (!def.scales) return def.consumption;
  return Math.max(1, Math.round(def.consumption * SIZE_INFO[a.size].resourceMult));
}

export interface ArmyStats {
  acr: number | null;
  acrLabel: string;
  /** ACR rounded down for OM and DV (fractional ACRs count as 0). */
  level: number;
  hpMax: number;
  om: number;
  dv: number;
  ranged: boolean;
  mounted: boolean;
  spellcasting: number;
  /** Per week (deployed) or per month (reserve). */
  consumption: number;
  monthlyUpkeep: number;
  maxTactics: number;
  usableTactics: TacticId[];
  moraleMod: number;
  effectiveMorale: number;
  units: number;
  xp: number;
}

const XP_BY_CR: Record<string, number> = {
  '1/8': 50, '1/6': 65, '1/4': 100, '1/3': 135, '1/2': 200, 1: 400, 2: 600, 3: 800, 4: 1200, 5: 1600, 6: 2400, 7: 3200,
  8: 4800, 9: 6400, 10: 9600, 11: 12800, 12: 19200, 13: 25600, 14: 38400, 15: 51200, 16: 76800, 17: 102400, 18: 153600,
  19: 204800, 20: 307200, 21: 409600, 22: 614400, 23: 819200, 24: 1228800, 25: 1638400,
};

export function armyStats(a: Army): ArmyStats {
  const A = acr(a);
  const level = A === null ? 0 : Math.floor(A);
  const r = a.resources;
  const sc = special(a, 'spellcasting')?.value ?? 0;
  let om = level + a.om + (r.weapons ?? 0) + (r.mounts ? 2 : 0) + ((r.siege ?? 0) > 0 ? 2 : 0) + sc;
  let dv = 10 + level + a.dv + (r.armor ?? 0) + (r.mounts ? 2 : 0) + sc + (hasBoon(a, 'defensiveTactics') ? 2 : 0);
  for (const s of a.specials) {
    const d = SPECIALS[s.id];
    if (!d) continue;
    om += d.om ?? 0;
    dv += d.dv ?? 0;
  }
  let consumption = Math.max(1, Math.floor((A ?? 0) / 2));
  if (r.armor) consumption += resourceConsumption(a, r.armor === 2 ? 'magicArmor' : 'armor');
  if (r.weapons) consumption += resourceConsumption(a, r.weapons === 2 ? 'magicWeapons' : 'weapons');
  if (r.mounts) consumption += resourceConsumption(a, 'mounts');
  if (r.ranged) consumption += resourceConsumption(a, 'ranged');
  consumption += 3 * (r.siege ?? 0);
  const ranged = !!r.ranged || a.specials.some((s) => SPECIALS[s.id]?.ranged);
  const bonusTactic = hasBoon(a, 'bonusTactic') && a.commander?.bonusTactic ? [a.commander.bonusTactic] : [];
  const mindless = !!special(a, 'mindless');
  const usable = mindless ? ['standard' as TacticId] : [...new Set<TacticId>(['standard', 'withdraw', ...a.tactics, ...bonusTactic])]
    .filter((t) => TACTICS[t].needs !== 'mounts' || r.mounts || a.specials.some((s) => s.id === 'cavalierMount'))
    .filter((t) => TACTICS[t].needs !== 'ranged' || ranged);
  const loyalty = hasBoon(a, 'loyalty') ? (leadership(a.commander!) >= 12 ? 4 : 2) : 0;
  const moraleMod = commanderBonus(a.commander) + loyalty;
  const effectiveMorale = a.morale - (a.unpaid ? 2 : 0);
  return {
    acr: A, acrLabel: A === null ? 'below 1/8' : crLabel(A), level,
    hpMax: A === null ? 0 : Math.max(1, Math.floor(A * HD_AVG[a.hd])),
    om, dv, ranged, mounted: !!r.mounts || a.specials.some((s) => s.id === 'cavalierMount'), spellcasting: sc,
    consumption, monthlyUpkeep: a.reserve ? consumption : consumption * 4,
    maxTactics: Math.max(0, Math.floor((A ?? 0) / 2)), usableTactics: usable,
    moraleMod, effectiveMorale, units: SIZE_INFO[a.size].units,
    xp: A === null ? 0 : XP_BY_CR[crLabel(A)] ?? 0,
  };
}

/** The army's total modifier on a Morale check, before situational bonuses. */
export const moraleCheckMod = (a: Army) => armyStats(a).effectiveMorale + armyStats(a).moraleMod;

// ---------- reserve capacity ----------
const RESERVE_ORDER = ['fine', 'diminutive', 'tiny', 'small', 'medium', 'large', 'huge'];
/** Largest army a settlement can hold in reserve: Watchtower Small, Barracks Medium, Castle Large, Garrison Huge. */
export function reserveCapacity(k: Kingdom, settlementId: string) {
  const s = k.settlements.find((x) => x.id === settlementId);
  if (!s) return null;
  const b = allBuildings(s);
  if (b.includes('garrison')) return 'huge';
  if (b.includes('castle')) return 'large';
  if (b.includes('barracks')) return 'medium';
  if (b.includes('watchtower')) return 'small';
  return null;
}
export const fitsReserve = (k: Kingdom, a: Army, settlementId: string) => {
  const cap = reserveCapacity(k, settlementId);
  return !!cap && RESERVE_ORDER.indexOf(a.size) >= 0 && RESERVE_ORDER.indexOf(a.size) <= RESERVE_ORDER.indexOf(cap);
};

// ---------- creating and changing armies ----------
export function blankArmy(side: Army['side']): Army {
  return {
    id: uid(), name: side === 'kingdom' ? 'New army' : 'Enemy army', side, type: 'humans (warrior 1)', alignment: 'N',
    size: 'medium', cr: 1 / 3, hd: 'd10', speed: 2, hp: 1, tactics: [], resources: {}, specials: [], om: 0, dv: 0,
    morale: 0, status: 'ready', history: [],
  };
}

export function fromPreset(p: ArmyPreset, side: Army['side']): Army {
  const a: Army = {
    ...blankArmy(side), name: p.name, type: p.type, alignment: p.alignment, size: p.size, cr: p.cr, hd: p.hd, speed: p.speed,
    tactics: [...(p.tactics ?? [])], specials: (p.specials ?? []).map((s) => ({ ...s })), om: p.om ?? 0, dv: p.dv ?? 0,
  };
  for (const r of p.resources ?? []) {
    if (r === 'armor') a.resources.armor = 1;
    else if (r === 'magicArmor') a.resources.armor = 2;
    else if (r === 'weapons') a.resources.weapons = 1;
    else if (r === 'magicWeapons') a.resources.weapons = 2;
    else if (r === 'siege') a.resources.siege = (a.resources.siege ?? 0) + 1;
    else a.resources[r] = true;
  }
  a.hp = armyStats(a).hpMax;
  return a;
}
export const presetByName = (name: string) => PRESETS.find((p) => p.name === name);

/** Recruiting counts against the "new settlements or armies" limit for the turn (Table 4-4). */
export function recruit(k: Kingdom, a: Army) {
  (k.armies ??= []).push(a);
  a.history.push({ turn: k.turn, text: a.side === 'kingdom' ? 'Recruited.' : 'Appeared.' });
  if (a.side === 'kingdom') {
    if (!k.settings.setupMode) k.turnState.settlements += 1;
    log(k, `Recruited ${a.name} (${SIZE_INFO[a.size].label} army of ${a.type}, ACR ${armyStats(a).acrLabel}).`);
  } else log(k, `Added enemy army ${a.name}.`);
}

/** Buildings in the kingdom that allow buying a resource, if it needs any. */
export function resourceAllowed(k: Kingdom, r: ResourceId) {
  const needs = RESOURCES[r].needs;
  if (!needs) return { ok: true, why: '' };
  const ok = k.settlements.some((s) => allBuildings(s).some((b) => needs.includes(b)));
  return { ok, why: ok ? '' : `Needs a ${needs.map((n) => building(n).name).join(', ').replace(/, ([^,]*)$/, ' or $1')} in one of your settlements.` };
}

export function buyResource(k: Kingdom, id: string, r: ResourceId) {
  const a = k.armies!.find((x) => x.id === id)!;
  let cost = resourceCost(a, r);
  if (r === 'magicArmor' && a.resources.armor === 1) cost -= resourceCost(a, 'armor');
  if (r === 'magicWeapons' && a.resources.weapons === 1) cost -= resourceCost(a, 'weapons');
  if (r === 'armor') a.resources.armor = 1;
  else if (r === 'magicArmor') a.resources.armor = 2;
  else if (r === 'weapons') a.resources.weapons = 1;
  else if (r === 'magicWeapons') a.resources.weapons = 2;
  else if (r === 'siege') a.resources.siege = (a.resources.siege ?? 0) + 1;
  else a.resources[r] = true;
  const free = k.settings.setupMode || a.side === 'enemy';
  if (!free) k.treasury -= cost;
  a.history.push({ turn: k.turn, text: `Equipped with ${RESOURCES[r].label.toLowerCase()}.` });
  log(k, `${a.name}: bought ${RESOURCES[r].label.toLowerCase()}${free ? '' : ` for ${cost} BP`}.`, { bp: free ? undefined : -cost });
}

export function removeResource(k: Kingdom, id: string, r: ResourceId) {
  const a = k.armies!.find((x) => x.id === id)!;
  if (r === 'armor' || r === 'magicArmor') delete a.resources.armor;
  else if (r === 'weapons' || r === 'magicWeapons') delete a.resources.weapons;
  else if (r === 'siege') a.resources.siege = Math.max(0, (a.resources.siege ?? 0) - 1);
  else delete a.resources[r];
}

/** Morale is −4 to +4; at −5 or lower the army deserts. */
export function changeMorale(k: Kingdom, a: Army, delta: number, why: string) {
  a.morale = Math.max(-5, Math.min(4, a.morale + delta));
  a.history.push({ turn: k.turn, text: `${why}: Morale ${delta > 0 ? '+' : '−'}${Math.abs(delta)}.` });
  if (a.morale <= -5 && a.status !== 'disbanded') {
    a.status = 'disbanded';
    a.history.push({ turn: k.turn, text: 'Morale fell to −5: the army deserted.' });
    log(k, `${a.name}'s Morale fell to −5: the army deserted.`);
  }
}

// ---------- upkeep ----------
export const activeArmies = (k: Kingdom) => (k.armies ?? []).filter((a) => a.side === 'kingdom' && a.status !== 'defeated' && a.status !== 'disbanded');

export function armyUpkeepTotal(k: Kingdom) {
  return activeArmies(k).reduce((n, a) => n + armyStats(a).monthlyUpkeep, 0);
}

/**
 * Upkeep for the month: pay (or don't pay) Consumption, armies without a commander lose Morale
 * (1 per week deployed, 1 per month in reserve), and armies that didn't fight last month heal to full.
 */
export function payArmies(k: Kingdom, pay: boolean) {
  const total = armyUpkeepTotal(k);
  const lines: string[] = [];
  if (pay) {
    k.treasury -= total;
    for (const a of activeArmies(k)) a.unpaid = false;
    lines.push(`Paid ${total} BP army Consumption`);
  } else {
    for (const a of activeArmies(k)) a.unpaid = true;
    lines.push('Armies went unpaid: Morale −2 until they’re paid');
  }
  for (const a of activeArmies(k)) {
    if (!a.commander) changeMorale(k, a, a.reserve ? -1 : -4, 'No commander this month');
    if ((a.lastBattleTurn ?? -1) < k.turn - 1 && a.status !== 'routed') {
      const max = armyStats(a).hpMax;
      if (a.hp < max) { a.hp = max; a.history.push({ turn: k.turn, text: 'Rested and recovered to full strength.' }); }
    }
  }
  const leaderless = activeArmies(k).filter((a) => !a.commander).length;
  if (leaderless) lines.push(`${leaderless} army${leaderless > 1 ? ' armies' : ''} without a commander lost Morale`);
  log(k, `${lines.join('. ')}.`, { bp: pay && total ? -total : undefined });
  k.turnState.done['upkeep.armies'] = `${lines.join('. ')}.`;
}

/** A routed army rejoins after a successful Loyalty check in the Upkeep phase (once per turn). */
export function rally(k: Kingdom, id: string, roll: number) {
  const a = k.armies!.find((x) => x.id === id)!;
  const c = kingdomCheck(k, 'loyalty', roll);
  k.turnState.done[`rally.${id}`] = c.success ? 'rallied' : 'failed';
  const text = `Loyalty check ${c.total} vs DC ${c.dc}: ${c.success ? 'the army is ready to fight again' : 'still refuses to fight'}.`;
  if (c.success) a.status = 'ready';
  a.history.push({ turn: k.turn, text });
  log(k, `${a.name} rally: ${text}`);
  return c;
}

/** Rest for some days outside battle: heal ACR per day, plus ACR more on each successful daily Loyalty check. */
export function rest(k: Kingdom, id: string, days: number, loyaltyRolls: number[] = []) {
  const a = k.armies!.find((x) => x.id === id)!;
  const st = armyStats(a);
  const A = Math.max(1, Math.floor(st.acr ?? 1));
  let heal = A * days;
  let extra = 0;
  for (const r of loyaltyRolls.slice(0, days)) if (kingdomCheck(k, 'loyalty', r).success) extra += A;
  heal += extra;
  const before = a.hp;
  a.hp = Math.min(st.hpMax, a.hp + heal);
  a.history.push({ turn: k.turn, text: `Rested ${days} day${days > 1 ? 's' : ''}: +${a.hp - before} hp.` });
  log(k, `${a.name} rested ${days} day${days > 1 ? 's' : ''} and recovered ${a.hp - before} hp.`);
}

export function disband(k: Kingdom, id: string) {
  const a = k.armies!.find((x) => x.id === id)!;
  k.armies = k.armies!.filter((x) => x.id !== id);
  log(k, `${a.side === 'kingdom' ? 'Disbanded' : 'Removed enemy army'} ${a.name}.`);
}

/** Kingdom-level losses when one of your armies is destroyed (by army size). */
export function applyDefeatPenalty(k: Kingdom, a: Army) {
  const p = SIZE_INFO[a.size].defeat;
  if (p.economy || p.loyalty || p.stability)
    k.modifiers.push({ id: uid(), label: `${a.name} destroyed`, economy: p.economy, loyalty: p.loyalty, stability: p.stability, consumption: 0 });
  return p;
}

