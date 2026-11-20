// Core kingdom tables from Ultimate Campaign (Archives of Nethys, Rules IDs 1491-1525).

export type Attr = 'economy' | 'loyalty' | 'stability';
export const ATTRS: Attr[] = ['economy', 'loyalty', 'stability'];
export const ATTR_LABEL: Record<Attr, string> = { economy: 'Economy', loyalty: 'Loyalty', stability: 'Stability' };

export type LawAxis = 'lawful' | 'neutral' | 'chaotic';
export type MoralAxis = 'good' | 'neutral' | 'evil';
export interface Alignment { law: LawAxis; moral: MoralAxis }

export const ALIGNMENTS: { label: string; abbr: string; value: Alignment }[] = [
  ['Lawful Good', 'LG', 'lawful', 'good'], ['Neutral Good', 'NG', 'neutral', 'good'], ['Chaotic Good', 'CG', 'chaotic', 'good'],
  ['Lawful Neutral', 'LN', 'lawful', 'neutral'], ['True Neutral', 'N', 'neutral', 'neutral'], ['Chaotic Neutral', 'CN', 'chaotic', 'neutral'],
  ['Lawful Evil', 'LE', 'lawful', 'evil'], ['Neutral Evil', 'NE', 'neutral', 'evil'], ['Chaotic Evil', 'CE', 'chaotic', 'evil'],
].map(([label, abbr, law, moral]) => ({ label, abbr, value: { law: law as LawAxis, moral: moral as MoralAxis } }));

export function alignmentLabel(a: Alignment) {
  return ALIGNMENTS.find((x) => x.value.law === a.law && x.value.moral === a.moral)!.label;
}

/** Chaotic/Good: +2 Loyalty. Lawful/Evil: +2 Economy. Each neutral component: +2 Stability. */
export function alignmentBonus(a: Alignment): Record<Attr, number> {
  const r = { economy: 0, loyalty: 0, stability: 0 };
  if (a.law === 'lawful') r.economy += 2;
  if (a.law === 'chaotic') r.loyalty += 2;
  if (a.law === 'neutral') r.stability += 2;
  if (a.moral === 'evil') r.economy += 2;
  if (a.moral === 'good') r.loyalty += 2;
  if (a.moral === 'neutral') r.stability += 2;
  return r;
}

export interface EdictLevel { label: string; economy?: number; loyalty?: number; stability?: number; consumption?: number }

export const HOLIDAY: EdictLevel[] = [
  { label: 'None', loyalty: -1, consumption: 0 },
  { label: '1 per year', loyalty: 1, consumption: 1 },
  { label: '6 per year', loyalty: 2, consumption: 2 },
  { label: '12 per year', loyalty: 3, consumption: 4 },
  { label: '24 per year', loyalty: 4, consumption: 8 },
];
export const PROMOTION: EdictLevel[] = [
  { label: 'None', stability: -1, consumption: 0 },
  { label: 'Token', stability: 1, consumption: 1 },
  { label: 'Standard', stability: 2, consumption: 2 },
  { label: 'Aggressive', stability: 3, consumption: 4 },
  { label: 'Expansionist', stability: 4, consumption: 8 },
];
export const TAXATION: EdictLevel[] = [
  { label: 'None', economy: 0, loyalty: 1 },
  { label: 'Light', economy: 1, loyalty: -1 },
  { label: 'Normal', economy: 2, loyalty: -2 },
  { label: 'Heavy', economy: 3, loyalty: -4 },
  { label: 'Overwhelming', economy: 4, loyalty: -8 },
];

/** Table 4-4: Improvement Edicts — per-turn limits by kingdom Size. */
export interface TurnLimits { settlements: number; buildings: number; improvements: number; hexClaims: number }
export function turnLimits(size: number): TurnLimits {
  if (size <= 10) return { settlements: 1, buildings: 1, improvements: 2, hexClaims: 1 };
  if (size <= 25) return { settlements: 1, buildings: 2, improvements: 3, hexClaims: 2 };
  if (size <= 50) return { settlements: 1, buildings: 5, improvements: 5, hexClaims: 3 };
  if (size <= 100) return { settlements: 2, buildings: 10, improvements: 7, hexClaims: 4 };
  if (size <= 200) return { settlements: 3, buildings: 20, improvements: 9, hexClaims: 8 };
  return { settlements: 4, buildings: Infinity, improvements: 12, hexClaims: 12 };
}

/** Table 4-5: Settlement Size and Base Value. */
export const SETTLEMENT_SIZES: { maxPop: number; label: string; baseValue: number }[] = [
  { maxPop: 20, label: 'Thorp', baseValue: 50 },
  { maxPop: 60, label: 'Hamlet', baseValue: 200 },
  { maxPop: 200, label: 'Village', baseValue: 500 },
  { maxPop: 2000, label: 'Small town', baseValue: 1000 },
  { maxPop: 5000, label: 'Large town', baseValue: 2000 },
  { maxPop: 10000, label: 'Small city', baseValue: 4000 },
  { maxPop: 25000, label: 'Large city', baseValue: 8000 },
  { maxPop: Infinity, label: 'Metropolis', baseValue: 16000 },
];

export type Terrain = 'cavern' | 'desert' | 'forest' | 'hills' | 'jungle' | 'marsh' | 'mountains' | 'plains';
/** Table 4-6: Terrain and Terrain Improvements. null = not allowed. */
export const TERRAIN: Record<Terrain, { label: string; prepCost: number; prepTime: string; farmCost: number | null; roadCost: number }> = {
  cavern: { label: 'Cavern', prepCost: 8, prepTime: '3 months', farmCost: null, roadCost: 4 },
  desert: { label: 'Desert', prepCost: 4, prepTime: '1 month', farmCost: 8, roadCost: 4 },
  forest: { label: 'Forest', prepCost: 4, prepTime: '2 months', farmCost: null, roadCost: 2 },
  hills: { label: 'Hills', prepCost: 2, prepTime: '1 month', farmCost: 4, roadCost: 3 },
  jungle: { label: 'Jungle', prepCost: 12, prepTime: '4 months', farmCost: null, roadCost: 4 },
  marsh: { label: 'Marsh', prepCost: 8, prepTime: '3 months', farmCost: null, roadCost: 4 },
  mountains: { label: 'Mountains', prepCost: 12, prepTime: '4 months', farmCost: null, roadCost: 4 },
  plains: { label: 'Plains', prepCost: 1, prepTime: 'Immediate', farmCost: 2, roadCost: 1 },
};

/** Terrain improvements and special terrain, counted kingdom-wide until the hex map exists. */
export type TerrainFeature =
  | 'farm' | 'fishery' | 'mine' | 'quarry' | 'sawmill' | 'road' | 'highway' | 'fort' | 'watchtower' | 'aqueduct'
  | 'lair' | 'landmark' | 'landmarkRoad' | 'resource' | 'river';

export interface FeatureDef { id: TerrainFeature; label: string; group: 'improvement' | 'special'; cost: string; effect: string; fixedCost?: number }
export const FEATURES: FeatureDef[] = [
  { id: 'farm', label: 'Farm', group: 'improvement', cost: 'By terrain (2–8 BP)', effect: 'Consumption −2' },
  { id: 'fishery', label: 'Fishery', group: 'improvement', cost: '4 BP', fixedCost: 4, effect: 'Consumption −1' },
  { id: 'mine', label: 'Mine', group: 'improvement', cost: '6 BP', fixedCost: 6, effect: 'Economy +1, +1 BP income' },
  { id: 'quarry', label: 'Quarry', group: 'improvement', cost: '6 BP', fixedCost: 6, effect: 'Stability +1, +1 BP income' },
  { id: 'sawmill', label: 'Sawmill', group: 'improvement', cost: '3 BP', fixedCost: 3, effect: 'Stability +1, +1 BP income' },
  { id: 'road', label: 'Road (hexes)', group: 'improvement', cost: 'By terrain (1–4 BP, ×2 with river)', effect: 'Economy +1 per 4, Stability +1 per 8' },
  { id: 'highway', label: 'Highway (hexes)', group: 'improvement', cost: '2× Road; Size 26+', effect: 'Economy +1 per 4, Stability +1 per 8' },
  { id: 'fort', label: 'Fort', group: 'improvement', cost: '24 BP', fixedCost: 24, effect: 'Stability +2, Consumption +1, Unrest −1 once' },
  { id: 'watchtower', label: 'Watchtower', group: 'improvement', cost: '12 BP', fixedCost: 12, effect: 'Stability +1, Unrest −1 once' },
  { id: 'aqueduct', label: 'Aqueduct (completed)', group: 'improvement', cost: 'As Road', effect: 'Loyalty +1, Stability +1' },
  { id: 'resource', label: 'Resource hex', group: 'special', cost: 'Found by GM', effect: 'Economy +1' },
  { id: 'landmark', label: 'Landmark hex', group: 'special', cost: 'Found by GM', effect: 'Loyalty +1' },
  { id: 'landmarkRoad', label: 'Landmark with Road', group: 'special', cost: 'Found by GM', effect: 'Loyalty +1 more' },
  { id: 'lair', label: 'Lair hex', group: 'special', cost: 'Found by GM', effect: 'Stability +1' },
  { id: 'river', label: 'River hexes', group: 'special', cost: 'Found by GM', effect: 'Economy +1 per 4, Stability +1 per 8' },
];

/** Starting from Scratch: gp → BP rate for self-starting kingdoms (optional). */
export const SCRATCH_RATES = [
  { maxSize: 25, buy: 1000, withdraw: 500 },
  { maxSize: 50, buy: 2000, withdraw: 1000 },
  { maxSize: 100, buy: 3000, withdraw: 1500 },
  { maxSize: Infinity, buy: 4000, withdraw: 2000 },
];
