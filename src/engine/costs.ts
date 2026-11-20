import { building } from '../rules/buildings';
import type { Settlement } from '../state/types';

/**
 * A discount halves the cost of the first building of each listed type, per discounting building.
 * Returns the cost and which placed building's discount would be used.
 */
export function buildCost(s: Settlement, type: string): { cost: number; base: number; discountedBy?: string; sourceName?: string } {
  const base = building(type).cost;
  const placed = s.districts.flatMap((d) => d.buildings);
  for (const src of placed) {
    const def = building(src.type);
    if (!def.discounts?.includes(type)) continue;
    const used = placed.some((b) => b.type === type && b.discountedBy === src.id);
    if (!used) return { cost: Math.ceil(base / 2), base, discountedBy: src.id, sourceName: def.name };
  }
  return { cost: base, base };
}

export function upgradeCost(fromType: string, toType: string) {
  return Math.max(0, building(toType).cost - building(fromType).cost);
}
