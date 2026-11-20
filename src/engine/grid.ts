// District grid geometry: 3x3 blocks of 4 lots each = a 6x6 lot grid. Streets run between blocks.
import { building, type BuildingDef } from '../rules/buildings';
import type { District, Lot, PlacedBuilding, Settlement, Side } from '../state/types';

export const GRID = 6;
export type Orientation = 'h' | 'v';

export const lotKey = ([r, c]: Lot) => `${r},${c}`;

/** Lots covered by a building of `size` lots anchored at its top-left lot. */
export function footprint(size: number, [r, c]: Lot, o: Orientation = 'h'): Lot[] {
  if (size <= 1) return [[r, c]];
  if (size === 2) return o === 'h' ? [[r, c], [r, c + 1]] : [[r, c], [r + 1, c]];
  return [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]];
}

export const inBounds = ([r, c]: Lot) => r >= 0 && c >= 0 && r < GRID && c < GRID;

export function occupancy(d: District, ignoreId?: string) {
  const m = new Map<string, PlacedBuilding>();
  for (const b of d.buildings) if (b.id !== ignoreId) for (const l of b.lots) m.set(lotKey(l), b);
  return m;
}

function neighborLots([r, c]: Lot, diagonal: boolean): Lot[] {
  const out: Lot[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (!diagonal && dr && dc) continue;
      const l: Lot = [r + dr, c + dc];
      if (inBounds(l)) out.push(l);
    }
  return out;
}

/** Placed buildings adjacent to the given footprint (lots across a street count as adjacent). */
export function adjacentBuildings(d: District, lots: Lot[], diagonal: boolean, ignoreId?: string) {
  const occ = occupancy(d, ignoreId);
  const own = new Set(lots.map(lotKey));
  const found = new Map<string, PlacedBuilding>();
  for (const l of lots)
    for (const n of neighborLots(l, diagonal)) {
      const k = lotKey(n);
      if (own.has(k)) continue;
      const b = occ.get(k);
      if (b) found.set(b.id, b);
    }
  return [...found.values()];
}

export function edgesOf(lots: Lot[]): Side[] {
  const s = new Set<Side>();
  for (const [r, c] of lots) {
    if (r === 0) s.add('n');
    if (r === GRID - 1) s.add('s');
    if (c === 0) s.add('w');
    if (c === GRID - 1) s.add('e');
  }
  return [...s];
}

export function touchesWater(d: District, lots: Lot[], diagonal: boolean, ignoreId?: string) {
  if (edgesOf(lots).some((side) => d.borders[side] === 'water')) return true;
  return adjacentBuildings(d, lots, diagonal, ignoreId).some((b) => b.type === 'waterway');
}

export interface Issue { buildingId?: string; text: string }

/**
 * Adjacency requirements ("Adjacent to 1 House") where each neighbor can satisfy only one building.
 * Solved as bipartite matching so the app finds an assignment whenever one exists.
 */
export function requirementIssues(d: District, diagonal: boolean): Issue[] {
  const slots: { owner: PlacedBuilding; any: string[] }[] = [];
  for (const b of d.buildings) {
    const req = building(b.type).requires;
    if (req) for (let i = 0; i < req.count; i++) slots.push({ owner: b, any: req.any });
  }
  if (!slots.length) return [];
  const cand = slots.map((s) =>
    adjacentBuildings(d, s.owner.lots, diagonal, s.owner.id).filter((n) => s.any.includes(n.type)).map((n) => n.id));
  const matchOf = new Map<string, number>(); // provider id -> slot index
  const tryAssign = (i: number, seen: Set<string>): boolean => {
    for (const p of cand[i]) {
      if (seen.has(p)) continue;
      seen.add(p);
      const cur = matchOf.get(p);
      if (cur === undefined || tryAssign(cur, seen)) {
        matchOf.set(p, i);
        return true;
      }
    }
    return false;
  };
  const unmet = new Map<string, number>();
  slots.forEach((s, i) => {
    if (!tryAssign(i, new Set())) unmet.set(s.owner.id, (unmet.get(s.owner.id) ?? 0) + 1);
  });
  return [...unmet].map(([id, n]) => {
    const b = d.buildings.find((x) => x.id === id)!;
    const def = building(b.type);
    const names = def.requires!.any.map((x) => building(x).name).join(' or ');
    return { buildingId: id, text: `${def.name} needs ${n} more adjacent ${names} (each can support only one building).` };
  });
}

export function districtIssues(d: District, diagonal: boolean): Issue[] {
  const out: Issue[] = [...requirementIssues(d, diagonal)];
  for (const b of d.buildings) {
    const def = building(b.type);
    if (def.needsWater && !touchesWater(d, b.lots, diagonal, b.id))
      out.push({ buildingId: b.id, text: `${def.name} must be next to a water border or Waterway.` });
    if (def.notAdjacent) {
      const bad = adjacentBuildings(d, b.lots, diagonal, b.id).filter((n) => def.notAdjacent!.includes(n.type));
      if (bad.length)
        out.push({ buildingId: b.id, text: `${def.name} cannot be adjacent to ${[...new Set(bad.map((x) => building(x.type).name))].join(', ')}.` });
    }
  }
  for (const side of Object.keys(d.walls) as Side[])
    if (d.borders[side] === 'water') out.push({ text: `The ${SIDE_LABEL[side]} border is water; walls and moats go on land borders.` });
  return out;
}

export const SIDE_LABEL: Record<Side, string> = { n: 'north', e: 'east', s: 'south', w: 'west' };

export interface PlacementCheck { errors: string[]; warnings: string[] }

/** Hard errors block placement; warnings are rules issues the GM may choose to allow. */
export function checkPlacement(
  s: Settlement, d: District, def: BuildingDef, lots: Lot[], diagonal: boolean, replacingId?: string,
): PlacementCheck {
  const errors: string[] = [], warnings: string[] = [];
  if (lots.some((l) => !inBounds(l))) errors.push('Does not fit inside the district.');
  const occ = occupancy(d, replacingId);
  if (lots.some((l) => occ.has(lotKey(l)))) errors.push('Those lots are already built on.');
  if (def.onePerSettlement) {
    const existing = s.districts.flatMap((x) => x.buildings).filter((b) => b.type === def.id && b.id !== replacingId);
    if (existing.length) errors.push(`Only 1 ${def.name} per settlement.`);
  }
  if (errors.length) return { errors, warnings };
  const trial: District = {
    ...d,
    buildings: [...d.buildings.filter((b) => b.id !== replacingId), { id: '__trial', type: def.id, lots }],
  };
  const before = new Set(districtIssues({ ...d, buildings: d.buildings.filter((b) => b.id !== replacingId) }, diagonal).map((i) => i.text));
  for (const i of districtIssues(trial, diagonal)) if (!before.has(i.text)) warnings.push(i.text);
  return { errors, warnings };
}
