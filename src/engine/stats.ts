import { BUILDING_BY_ID } from '../rules/buildings';
import {
  alignmentBonus, alignmentLabel, ATTRS, HOLIDAY, PROMOTION, SETTLEMENT_SIZES, TAXATION, turnLimits,
  type Attr, type TurnLimits,
} from '../rules/kingdom';
import { ROLES, type RoleId } from '../rules/leadership';
import type { Kingdom, Settlement } from '../state/types';

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
      const v = base + (l.leadershipFeat ? 1 : 0);
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
    for (const id of allBuildings(s)) {
      const b = BUILDING_BY_ID[id];
      if (!b) continue;
      for (const a of ATTRS) sum[a] += b[a] ?? 0;
    }
    for (const a of ATTRS) add(a, `Buildings in ${s.name}`, sum[a]);
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

  return {
    economy: total('economy'),
    loyalty: total('loyalty'),
    stability: total('stability'),
    consumption: Math.max(0, total('consumption')),
    controlDC: 20 + k.size + districts,
    districts,
    incomeBonus: f('mine') + f('quarry') + f('sawmill'),
    fame: k.fame + fameFromBuildings,
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
