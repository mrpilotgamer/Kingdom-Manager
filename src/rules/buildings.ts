// Building data comes from Ultimate Campaign (via Archives of Nethys), parsed by scripts/parse-aon.py.
// This file layers structured placement rules on top of the parsed text.
import raw from './buildings.json';
import type { SettlementStat } from './settlement';

export type BuildingKind = 'lot' | 'district' | 'border' | 'addon';
export type Category =
  | 'housing' | 'commerce' | 'faith' | 'military' | 'civic' | 'industry' | 'learning' | 'leisure' | 'water';

export interface BuildingDef {
  id: string;
  name: string;
  cost: number;
  lots: number;
  kind: BuildingKind;
  category: Category;
  economy?: number;
  loyalty?: number;
  stability?: number;
  /** One-time Unrest change applied when completed. */
  unrest?: number;
  unrestOncePerSettlement?: boolean;
  fame?: number;
  discounts?: string[];
  upgradeTo?: string[];
  upgradeFrom?: string[];
  limitText?: string;
  specialText?: string;
  magicItems?: string;
  settlementText?: string;
  baseValue?: number;
  defense?: number;
  /** Corruption, Crime, Law, Lore, Productivity, Society. */
  settlementMods?: Partial<Record<SettlementStat, number>>;
  description?: string;
  /** Must be adjacent to `count` distinct buildings from `any` (each neighbor can satisfy only one building). */
  requires?: { any: string[]; count: number };
  notAdjacent?: string[];
  needsWater?: boolean;
  onePerSettlement?: boolean;
  onePerDistrict?: boolean;
  /** House, Mansion, Noble Villa, Tenement: the first one each turn is free of the build limit. */
  housing?: boolean;
  short: string;
}

const HOUSE = ['house', 'tenement'];

const rules: Record<string, Partial<BuildingDef>> = {
  alchemist: { requires: { any: HOUSE, count: 1 }, category: 'commerce' },
  'black-market': { requires: { any: HOUSE, count: 2 }, category: 'commerce' },
  'dance-hall': { requires: { any: HOUSE, count: 1 }, category: 'leisure' },
  'exotic-artisan': { requires: { any: HOUSE, count: 1 }, category: 'commerce' },
  herbalist: { requires: { any: HOUSE, count: 1 }, category: 'commerce' },
  inn: { requires: { any: HOUSE, count: 1 }, category: 'leisure' },
  'luxury-store': { requires: { any: HOUSE, count: 1 }, category: 'commerce' },
  'magic-shop': { requires: { any: HOUSE, count: 2 }, category: 'commerce' },
  market: { requires: { any: HOUSE, count: 2 }, category: 'commerce' },
  shop: { requires: { any: [...HOUSE, 'mansion'], count: 1 }, category: 'commerce' },
  stable: { requires: { any: [...HOUSE, 'mansion', 'noble-villa'], count: 1 }, category: 'commerce' },
  tavern: { requires: { any: [...HOUSE, 'mansion'], count: 1 }, category: 'leisure' },
  'trade-shop': { requires: { any: HOUSE, count: 1 }, category: 'commerce' },
  cistern: { notAdjacent: ['dump', 'graveyard', 'stable', 'stockyard', 'tannery'], category: 'civic' },
  dump: { notAdjacent: ['house', 'mansion', 'noble-villa'], category: 'industry' },
  tannery: { notAdjacent: ['house', 'mansion', 'noble-villa', 'tenement'], category: 'industry' },
  foundry: { needsWater: true, category: 'industry' },
  mill: { needsWater: true, category: 'industry' },
  pier: { needsWater: true, category: 'water' },
  waterfront: { needsWater: true, onePerSettlement: true, category: 'water' },
  arena: { onePerSettlement: true, category: 'leisure' },
  castle: { onePerSettlement: true, category: 'military' },
  cathedral: { onePerSettlement: true, category: 'faith' },
  'military-academy': { onePerSettlement: true, category: 'military' },
  house: { housing: true, category: 'housing' },
  mansion: { housing: true, category: 'housing' },
  'noble-villa': { housing: true, category: 'housing' },
  tenement: { housing: true, category: 'housing' },
  'paved-streets': { kind: 'district', onePerDistrict: true, category: 'civic' },
  'sewer-system': { kind: 'district', onePerDistrict: true, category: 'civic' },
  'city-wall': { kind: 'border', category: 'military' },
  moat: { kind: 'border', category: 'military' },
  'everflowing-spring': { kind: 'addon', category: 'civic' },
  'magical-streetlamps': { kind: 'addon', category: 'civic' },
  academy: { category: 'learning' }, 'bardic-college': { category: 'learning' }, library: { category: 'learning' },
  'magical-academy': { category: 'learning' }, university: { category: 'learning' }, observatory: { category: 'learning' },
  museum: { category: 'learning' }, 'casters-tower': { category: 'learning' }, monastery: { category: 'faith' },
  shrine: { category: 'faith' }, temple: { category: 'faith' }, graveyard: { category: 'faith' },
  barracks: { category: 'military' }, garrison: { category: 'military' }, watchtower: { category: 'military' },
  jail: { category: 'civic' }, 'town-hall': { category: 'civic' }, bureau: { category: 'civic' },
  palace: { category: 'civic' }, mint: { category: 'civic' }, hospital: { category: 'civic' },
  orphanage: { category: 'civic' }, granary: { category: 'civic' }, monument: { category: 'civic' },
  park: { category: 'leisure' }, theater: { category: 'leisure' }, brewery: { category: 'leisure' },
  menagerie: { category: 'leisure' }, bank: { category: 'commerce' }, guildhall: { category: 'commerce' },
  'foreign-quarter': { category: 'commerce' }, smithy: { category: 'industry' }, stockyard: { category: 'industry' },
  bridge: { category: 'water' }, waterway: { category: 'water' },
};

/** Two-to-three letter labels for the district grid. */
const SHORT: Record<string, string> = {
  'black-market': 'BM', 'casters-tower': 'CT', 'city-wall': 'Wl', 'dance-hall': 'DH', 'exotic-artisan': 'EA',
  'foreign-quarter': 'FQ', 'luxury-store': 'Lx', 'magic-shop': 'MS', 'magical-academy': 'MA', 'military-academy': 'MiA',
  'noble-villa': 'NV', 'trade-shop': 'TS', 'town-hall': 'TH', 'bardic-college': 'BC', 'paved-streets': 'PS',
  'sewer-system': 'Sw', mansion: 'Mn', market: 'Mk', mill: 'Ml', mint: 'Mt', museum: 'Mu', monastery: 'Mo',
  monument: 'Mon', menagerie: 'Me', house: 'H', tenement: 'Tn', tavern: 'Tv', tannery: 'Ta', temple: 'Te',
  theater: 'Th', shrine: 'Sh', shop: 'Sp', smithy: 'Sm', stable: 'St', stockyard: 'Sk', inn: 'In', jail: 'J',
  library: 'Lb', granary: 'Gr', graveyard: 'Gy', garrison: 'Ga', guildhall: 'Gh', barracks: 'Ba', bank: 'Bk',
  brewery: 'Br', bridge: 'Bd', bureau: 'Bu', castle: 'Ca', cathedral: 'Cd', cistern: 'Ci', academy: 'Ac',
  alchemist: 'Al', arena: 'Ar', dump: 'Du', foundry: 'Fo', herbalist: 'He', hospital: 'Ho', observatory: 'Ob',
  orphanage: 'Or', palace: 'Pa', park: 'Pk', pier: 'Pi', university: 'Un', watchtower: 'Wt', waterfront: 'WF',
  waterway: 'Ww', moat: 'Mt', 'everflowing-spring': 'ES', 'magical-streetlamps': 'ML', watergate: 'WG',
};

export const BUILDINGS: BuildingDef[] = (raw as Omit<BuildingDef, 'kind' | 'category' | 'short'>[])
  .filter((b) => b.id !== 'watergate') // folded into City Wall; not tracked separately
  .map((b) => ({
    kind: 'lot' as BuildingKind,
    category: 'civic' as Category,
    ...b,
    ...rules[b.id],
    short: SHORT[b.id] ?? b.name.slice(0, 2),
  }));

export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

export function building(id: string): BuildingDef {
  const b = BUILDING_BY_ID[id];
  if (!b) throw new Error(`Unknown building: ${id}`);
  return b;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  housing: 'Housing', commerce: 'Commerce', faith: 'Faith', military: 'Military', civic: 'Civic',
  industry: 'Industry', learning: 'Learning', leisure: 'Leisure', water: 'Waterside',
};
