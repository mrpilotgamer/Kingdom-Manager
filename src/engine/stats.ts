import { BUILDING_BY_ID } from '../rules/buildings';
import {
  alignmentBonus, alignmentLabel, ATTRS, HOLIDAY, PROMOTION, SETTLEMENT_SIZES, TAXATION, turnLimits,
  type Attr, type TurnLimits,
} from '../rules/kingdom';
import { ROLES, type RoleId } from '../rules/leadership';
import type { Kingdom, Settlement } from '../state/types';
import { embassyBonuses, foreignBonuses } from './specialEdicts';
import { GOVERNMENTS, RENOWN_SIZES, SETTLEMENT_STATS, sizeModifier, type SettlementStat } from '../rules/settlement';

export interface Line { label: string; value: number }
export interface KingdomStats {
  economy: number;
  loyalty: number;
  stability: number;
  consumption: number;
  controlDC: number;
  districts: number;
  incomeBonus: number;
  fame: number;
  breakdown: Record<Attr | 'consumption', Line[]>;
  vacancies: RoleId[];
  rulerCovered: 'ruler' | 'consort' | 'heir' | null;
  canCollectTaxes: boolean;
  holidayBlocked: boolean;
  /** Unrest gained each Upkeep from vacant roles. */
  vacancyUnrest: number;
  infamy: number;
  renown: { fame: Line[]; infamy: Line[] };
  limits: TurnLimits;
  rulerAttrCount: number;
}

export function rulerAttrCount(size: number) {
  return size >= 101 ? 3 : size >= 26 ? 2 : 1;
}

export function leaderFilled(k: Kingdom, id: RoleId) {
  const l = k.leaders[id];
  return !!l && l.active && l.name.trim() !== '';
}

/** Building types giving benefits in a settlement (damaged buildings give none until repaired). */
export function allBuildings(s: Settlement) {
  return s.districts.flatMap((d) => [
    ...d.buildings.filter((b) => !b.damaged).map((b) => b.type),
    ...d.improvements,
  ]);
}

export function computeStats(k: Kingdom): KingdomStats {
  const bd: KingdomStats['breakdown'] = { economy: [], loyalty: [], stability: [], consumption: [] };
  const add = (key: keyof typeof bd, label: string, value: number) => {
    if (value) bd[key].push({ label, value });
  };

  const al = alignmentBonus(k.alignment);
  for (const a of ATTRS) add(a, `Alignment (${alignmentLabel(k.alignment)})`, al[a]);

  // Leadership
  const vacancies: RoleId[] = [];
  let vacancyUnrest = 0;
  const rulerCount = rulerAttrCount(k.size);
  let rulerCovered: KingdomStats['rulerCovered'] = null;
  if (leaderFilled(k, 'ruler')) rulerCovered = 'ruler';
  else if (leaderFilled(k, 'consort')) rulerCovered = 'consort';
  else if (leaderFilled(k, 'heir')) rulerCovered = 'heir';

  for (const role of ROLES) {
    const l = k.leaders[role.id];
    if (leaderFilled(k, role.id) && l) {
      const base = role.half ? Math.floor(l.mod / 2) : l.mod;
      const v = base + (l.leadershipFeat ? 1 : 0) + (k.settings.roleSkills ? Math.floor((l.skillRanks ?? 0) / 5) : 0);
      if (role.attr === 'choice') {
        const n = role.id === 'ruler' ? rulerCount : 1;
        const chosen = (l.attrs.length ? l.attrs : ['economy' as Attr]).slice(0, n);
        for (const a of chosen) add(a, `${role.name}: ${l.name}`, v);
      } else {
        add(role.attr, `${role.name}: ${l.name}`, v);
      }
    } else if (!role.optional) {
      if (role.id === 'ruler' && rulerCovered) continue;
      vacancies.push(role.id);
      for (const a of ATTRS) add(a, `${role.name} vacant`, role.vacancy[a] ?? 0);
      vacancyUnrest += role.vacancyUnrest ?? 0;
    }
  }

  // Edicts
  const holidayBlocked = vacancies.includes('councilor');
  const canCollectTaxes = !vacancies.includes('treasurer');
  const hasBuilding = (id: string) => k.settlements.some((s) => allBuildings(s).includes(id));

  const hol = HOLIDAY[k.edicts.holiday];
  add('loyalty', `Holiday edict (${hol.label})${holidayBlocked && (hol.loyalty ?? 0) > 0 ? ' — no Councilor' : ''}`,
    holidayBlocked ? Math.min(0, hol.loyalty ?? 0) : hol.loyalty ?? 0);
  add('consumption', `Holiday edict (${hol.label})`, hol.consumption ?? 0);

  const pro = PROMOTION[k.edicts.promotion];
  add('stability', `Promotion edict (${pro.label})`, pro.stability ?? 0);
  const proCons = pro.consumption ?? 0;
  add('consumption', `Promotion edict (${pro.label})${hasBuilding('cathedral') && proCons ? ', halved by Cathedral' : ''}`,
    hasBuilding('cathedral') ? Math.floor(proCons / 2) : proCons);

  const tax = TAXATION[canCollectTaxes ? k.edicts.taxation : 0];
  add('economy', `Taxation edict (${tax.label})`, tax.economy ?? 0);
  let taxLoy = tax.loyalty ?? 0;
  if (taxLoy < 0 && hasBuilding('waterfront')) taxLoy = -Math.floor(-taxLoy / 2);
  add('loyalty', `Taxation edict (${tax.label})${hasBuilding('waterfront') && (tax.loyalty ?? 0) < 0 ? ', halved by Waterfront' : ''}`, taxLoy);

  // Buildings, grouped per settlement
  let districts = 0;
  for (const s of k.settlements) {
    districts += s.districts.length;
    const sum = { economy: 0, loyalty: 0, stability: 0 };
    const holy = { economy: 0, loyalty: 0, stability: 0 };
    for (const d of s.districts) {
      for (const pb of d.buildings) {
        if (pb.damaged) continue;
        const b = BUILDING_BY_ID[pb.type];
        if (!b) continue;
        const deity = k.settings.deities && pb.deity ? deityBonus(pb.type, pb.deity) : null;
        for (const a of ATTRS) {
          if (deity) holy[a] += deity[a];
          else sum[a] += b[a] ?? 0;
        }
      }
      for (const id of d.improvements) {
        const b = BUILDING_BY_ID[id];
        if (b) for (const a of ATTRS) sum[a] += b[a] ?? 0;
      }
    }
    for (const a of ATTRS) add(a, `Buildings in ${s.name}`, sum[a]);
    for (const a of ATTRS) add(a, `Holy sites in ${s.name}`, holy[a]);
  }

  // Terrain improvements and special terrain
  const f = (id: keyof Kingdom['features']) => k.features[id] ?? 0;
  add('economy', 'Mines', f('mine'));
  add('stability', 'Quarries', f('quarry'));
  add('stability', 'Sawmills', f('sawmill'));
  add('economy', 'Roads (1 per 4 hexes)', Math.floor(f('road') / 4));
  add('stability', 'Roads (1 per 8 hexes)', Math.floor(f('road') / 8));
  add('economy', 'Highways (1 per 4 hexes)', Math.floor(f('highway') / 4));
  add('stability', 'Highways (1 per 8 hexes)', Math.floor(f('highway') / 8));
  add('stability', 'Forts', 2 * f('fort'));
  add('stability', 'Watchtowers', f('watchtower'));
  add('loyalty', 'Aqueducts', f('aqueduct'));
  add('stability', 'Aqueducts', f('aqueduct'));
  add('economy', 'Resource hexes', f('resource'));
  add('loyalty', 'Landmarks', f('landmark') + f('landmarkRoad'));
  add('stability', 'Lairs', f('lair'));
  add('economy', 'Rivers (1 per 4 hexes)', Math.floor(f('river') / 4));
  add('stability', 'Rivers (1 per 8 hexes)', Math.floor(f('river') / 8));

  // Treaties, alliances, and embassies abroad
  for (const b of foreignBonuses(k)) add(b.attr, b.label, b.value);
  const emb = embassyBonuses(k);
  add('economy', 'Embassies abroad', emb.economy);
  add('loyalty', 'Embassies abroad', emb.loyalty);
  add('stability', 'Embassies abroad', emb.stability);
  add('consumption', 'Embassies abroad', emb.consumption);

  // Consumption
  add('consumption', 'Kingdom Size', k.size);
  if (k.settings.districtsAddConsumption) add('consumption', 'Districts', districts);
  add('consumption', 'Forts', f('fort'));
  add('consumption', 'Farms', -2 * f('farm'));
  add('consumption', 'Fisheries', -f('fishery'));

  for (const m of k.modifiers) {
    add('economy', m.label, m.economy);
    add('loyalty', m.label, m.loyalty);
    add('stability', m.label, m.stability);
    add('consumption', m.label, m.consumption);
  }

  const total = (key: keyof typeof bd) => bd[key].reduce((n, l) => n + l.value, 0);
  const fameFromBuildings = k.settlements.reduce(
    (n, s) => n + allBuildings(s).reduce((m, id) => m + (BUILDING_BY_ID[id]?.fame ?? 0), 0), 0);
  const totals = SETTLEMENT_STATS.reduce((o, st) => ({ ...o, [st]: 0 }), {} as Record<SettlementStat, number>);
  for (const s of k.settlements) {
    const v = settlementModifiers(k, s).values;
    for (const st of SETTLEMENT_STATS) totals[st] += v[st];
  }
  const fameLines: Line[] = [], infamyLines: Line[] = [];
  if (k.fame) fameLines.push({ label: 'Starting value and events', value: k.fame });
  if (emb.fame) fameLines.push({ label: 'Noble Villa embassies', value: emb.fame });
  if (fameFromBuildings) fameLines.push({ label: 'Famous buildings', value: fameFromBuildings });
  const loreSociety = Math.floor(Math.max(0, totals.lore + totals.society) / 10);
  if (loreSociety) fameLines.push({ label: `Settlements’ Lore + Society (${totals.lore + totals.society}) ÷ 10`, value: loreSociety });
  if (k.infamy) infamyLines.push({ label: 'Starting value and events', value: k.infamy });
  const corruptCrime = Math.floor(Math.max(0, totals.corruption + totals.crime) / 10);
  if (corruptCrime) infamyLines.push({ label: `Settlements’ Corruption + Crime (${totals.corruption + totals.crime}) ÷ 10`, value: corruptCrime });

  return {
    economy: total('economy'),
    loyalty: total('loyalty'),
    stability: total('stability'),
    consumption: Math.max(0, total('consumption')),
    controlDC: 20 + k.size + districts,
    districts,
    incomeBonus: f('mine') + f('quarry') + f('sawmill'),
    fame: Math.max(0, fameLines.reduce((n, l) => n + l.value, 0)),
    infamy: Math.max(0, infamyLines.reduce((n, l) => n + l.value, 0)),
    renown: { fame: fameLines, infamy: infamyLines },
    breakdown: bd,
    vacancies,
    rulerCovered,
    canCollectTaxes,
    holidayBlocked,
    vacancyUnrest,
    limits: turnLimits(k.size),
    rulerAttrCount: rulerCount,
  };
}

export interface SettlementStats {
  lots: number;
  population: number;
  sizeLabel: string;
  baseValue: number;
  baseValueCap: number;
  defense: number;
  magicItems: string[];
}

export function settlementStats(s: Settlement): SettlementStats {
  let lots = 0, base = 0, defense = 0;
  const magicItems: string[] = [];
  for (const d of s.districts) {
    for (const b of d.buildings) {
      const def = BUILDING_BY_ID[b.type];
      if (def.id !== 'waterway') lots += b.lots.length;
      if (b.damaged) continue;
      base += def.baseValue ?? 0;
      defense += def.defense ?? 0;
      if (def.magicItems) magicItems.push(`${def.name}: ${def.magicItems}`);
    }
    for (const id of d.improvements) base += BUILDING_BY_ID[id]?.baseValue ?? 0;
    defense += Object.values(d.walls).length;
  }
  const population = lots * 250;
  const size = SETTLEMENT_SIZES.find((x) => population <= x.maxPop)!;
  return {
    lots, population, sizeLabel: size.label, baseValue: Math.min(base, size.baseValue), baseValueCap: size.baseValue,
    defense, magicItems,
  };
}

export const fmt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// ---------- settlement modifiers ----------
export type SettlementMods = { values: Record<SettlementStat, number>; breakdown: Record<SettlementStat, Line[]> };

function blankMods(): SettlementMods {
  const values = {} as Record<SettlementStat, number>, breakdown = {} as Record<SettlementStat, Line[]>;
  for (const st of SETTLEMENT_STATS) { values[st] = 0; breakdown[st] = []; }
  return { values, breakdown };
}
function addMods(r: SettlementMods, label: string, mods: Partial<Record<SettlementStat, number>>) {
  for (const st of SETTLEMENT_STATS) {
    const v = mods[st];
    if (!v) continue;
    r.values[st] += v;
    const line = r.breakdown[st].find((l) => l.label === label);
    if (line) line.value += v;
    else r.breakdown[st].push({ label, value: v });
  }
}

/** Corruption, Crime, Law, Lore, Productivity, and Society for one settlement, with where each comes from. */
export function settlementModifiers(k: Kingdom, s: Settlement): SettlementMods {
  const r = blankMods();
  for (const d of s.districts) {
    for (const b of d.buildings) {
      if (b.damaged) continue;
      const def = BUILDING_BY_ID[b.type];
      if (def?.settlementMods) addMods(r, def.name, def.settlementMods);
    }
    for (const id of d.improvements) {
      const def = BUILDING_BY_ID[id];
      if (def?.settlementMods) addMods(r, def.name, def.settlementMods);
    }
    for (const [id, n] of Object.entries(d.addons)) {
      const def = BUILDING_BY_ID[id];
      if (def?.settlementMods && n) for (let i = 0; i < n; i++) addMods(r, def.name, def.settlementMods);
    }
  }
  const gov = GOVERNMENTS[k.government ?? 'autocracy'];
  addMods(r, `Government: ${gov.label}`, gov.mods);
  if (k.settings.settlementSizeMods !== false) {
    const lots = settlementStats(s).lots;
    const size = sizeModifier(lots, s.districts.length);
    if (size.mod) addMods(r, `Size: ${size.label} (${lots} lot${lots === 1 ? '' : 's'})`, Object.fromEntries(SETTLEMENT_STATS.map((st) => [st, size.mod])));
  }
  for (const a of k.settlementAdjustments ?? []) if (a.settlementId === s.id) addMods(r, a.label, a.mods);
  return r;
}

/** Kingdom-wide settlement modifiers ("Expanding Settlement Modifiers"): all settlements ÷ 10, plus alignment. */
export function kingdomSettlementModifiers(k: Kingdom): SettlementMods {
  const r = blankMods();
  const sum = SETTLEMENT_STATS.reduce((o, st) => ({ ...o, [st]: 0 }), {} as Record<SettlementStat, number>);
  for (const s of k.settlements) {
    const v = settlementModifiers(k, s).values;
    for (const st of SETTLEMENT_STATS) sum[st] += v[st];
  }
  addMods(r, 'All settlements ÷ 10', Object.fromEntries(SETTLEMENT_STATS.map((st) => [st, Math.trunc(sum[st] / 10)])));
  const a = k.alignment;
  const al: Partial<Record<SettlementStat, number>> = {};
  if (a.law === 'chaotic') al.crime = 1;
  if (a.law === 'lawful') al.law = 1;
  if (a.moral === 'evil') al.corruption = 1;
  if (a.moral === 'good') al.society = 1;
  al.lore = (a.law === 'neutral' ? 1 : 0) + (a.moral === 'neutral' ? 1 : 0);
  addMods(r, `Alignment (${alignmentLabel(a)})`, al);
  for (const adj of k.settlementAdjustments ?? []) if (!adj.settlementId) addMods(r, adj.label, adj.mods);
  const emb = embassyBonuses(k);
  if (emb.society) addMods(r, 'Embassies abroad', { society: emb.society });
  return r;
}

/** Size milestones reached that haven't yet given their +1 Fame or Infamy. */
export function renownDue(k: Kingdom) {
  return RENOWN_SIZES.filter((n) => k.size >= n && !(k.renownAwarded ?? []).includes(n));
}

/**
 * Deities and Holy Sites (optional): a Temple gives +2 per alignment component of its god (Chaotic/Good Loyalty,
 * Lawful/Evil Economy, each Neutral Stability), a Cathedral +4; a Shrine gives +1 to one of those attributes.
 */
export function deityBonus(type: string, deity: { alignment: string; attr?: Attr }): Record<Attr, number> {
  const r = { economy: 0, loyalty: 0, stability: 0 };
  const al = deity.alignment === 'N' ? 'NN' : deity.alignment;
  const parts: Attr[] = [...al].map((ch) => (ch === 'C' || ch === 'G' ? 'loyalty' : ch === 'L' || ch === 'E' ? 'economy' : 'stability'));
  if (type === 'shrine') {
    const attr = deity.attr && parts.includes(deity.attr) ? deity.attr : parts[0];
    r[attr] += 1;
    return r;
  }
  const per = type === 'cathedral' ? 4 : 2;
  for (const p of parts) r[p] += per;
  return r;
}
export const HOLY_BUILDINGS = ['shrine', 'temple', 'cathedral'];
