// Hex map: geometry, rules for claiming and improving hexes, and syncing Size/improvements to the kingdom.
// Flat-top hexes in offset coordinates, odd columns shifted down half a hex ("odd-q").
import { TERRAIN, type TerrainFeature } from '../rules/kingdom';
import type { Hex, HexImprovement, HexMap, HexSpecial, HexTerrain, Kingdom } from '../state/types';
import { changeUnrest, log, newDistrict, spend } from './actions';
import { uid } from '../state/util';
import { computeStats } from './stats';
import { generateMap, terrainAt, type GenOptions } from './mapgen';

export const key = (c: number, r: number) => `${c},${r}`;
export const parse = (k: string) => k.split(',').map(Number) as [number, number];

/** Neighbor offsets in edge order: SE, S, SW, NW, N, NE (edge i joins corners i and i+1). */
const DIRS: [number, number][][] = [
  [[1, 0], [0, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], // even column
  [[1, 1], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, 0]], // odd column
];

/** 1 for columns drawn half a hex lower (odd absolute columns). */
export const colParity = (m: HexMap, c: number) => (c + (m.originC ?? 0)) & 1;

export function neighborKeys(m: HexMap, hk: string): (string | null)[] {
  const [c, r] = parse(hk);
  return DIRS[colParity(m, c)].map(([dc, dr]) => {
    const nc = c + dc, nr = r + dr;
    return nc >= 0 && nr >= 0 && nc < m.cols && nr < m.rows ? key(nc, nr) : null;
  });
}

export const BLANK: Hex = { terrain: 'plains', status: 'unexplored', improvements: [] };
export const getHex = (m: HexMap, hk: string): Hex => m.hexes[hk] ?? BLANK;
export function editHex(m: HexMap, hk: string): Hex {
  if (!m.hexes[hk]) m.hexes[hk] = structuredClone(BLANK);
  return m.hexes[hk];
}

export function newMap(cols = 16, rows = 12, active = true): HexMap {
  return { cols, rows, hexes: {}, active };
}

// ---------- labels ----------
export const HEX_TERRAIN: Record<HexTerrain, string> = {
  plains: 'Plains', hills: 'Hills', forest: 'Forest', jungle: 'Jungle', marsh: 'Marsh', mountains: 'Mountains',
  desert: 'Desert', water: 'Water',
};
export const EXPLORE_TIME: Record<HexTerrain, string> = {
  plains: '1 day', hills: '1 day', forest: '2 days', jungle: '3 days', marsh: '3 days', mountains: '3 days',
  desert: '2 days', water: '2 days (by boat)',
};
export const STATUS_LABEL = { unexplored: 'Unexplored', explored: 'Explored', cleared: 'Explored and cleared', claimed: 'Claimed' };

export const SPECIALS: Record<HexSpecial, { label: string; effect: string }> = {
  resource: { label: 'Resource', effect: 'Economy +1 when claimed; boosts a Mine, Quarry, Sawmill, Farm, or Fishery here by 1.' },
  landmark: { label: 'Landmark', effect: 'Loyalty +1 when claimed, +1 more with a Road or Highway.' },
  lair: { label: 'Lair', effect: 'Stability +1 when claimed; +1 Defense for a Fort or Watchtower here.' },
  ruin: { label: 'Ruin', effect: 'Half price for one suitable building in a settlement here, or salvage 1d4 BP off a building.' },
  building: { label: 'Abandoned building', effect: 'A settlement here gets the building for free.' },
  freeCity: { label: 'Free City', effect: 'Claim peacefully with a Stability check; failure adds 1d4 Unrest.' },
  bridge: { label: 'Bridge', effect: 'A Road here does not cost double for the river.' },
};

export interface ImpDef { id: HexImprovement; label: string; short: string; effect: string }
export const IMPROVEMENTS: ImpDef[] = [
  { id: 'farm', label: 'Farm', short: 'Fa', effect: 'Consumption −2' },
  { id: 'fishery', label: 'Fishery', short: 'Fi', effect: 'Consumption −1' },
  { id: 'mine', label: 'Mine', short: 'Mi', effect: 'Economy +1, +1 BP income' },
  { id: 'quarry', label: 'Quarry', short: 'Qu', effect: 'Stability +1, +1 BP income' },
  { id: 'sawmill', label: 'Sawmill', short: 'Sa', effect: 'Stability +1, +1 BP income' },
  { id: 'road', label: 'Road', short: 'Rd', effect: 'Economy +1 per 4 hexes, Stability +1 per 8' },
  { id: 'highway', label: 'Highway', short: 'Hw', effect: 'Upgrades a Road; same bonuses, faster travel' },
  { id: 'canal', label: 'Canal', short: 'Ca', effect: 'Counts as a river for settlements and Farms' },
  { id: 'watchtower', label: 'Watchtower', short: 'Wt', effect: 'Stability +1, Defense +2, Unrest −1 once' },
  { id: 'fort', label: 'Fort', short: 'Fo', effect: 'Stability +2, Defense +4, Consumption +1, Unrest −1 once' },
];
export const IMP_BY_ID = Object.fromEntries(IMPROVEMENTS.map((i) => [i.id, i])) as Record<HexImprovement, ImpDef>;

// ---------- rules ----------
export interface Check { cost: number | null; errors: string[]; warnings: string[] }

const isWet = (h: Hex) => h.terrain === 'water' || h.terrain === 'marsh' || !!h.river || h.improvements.includes('canal');

function roadCost(h: Hex) {
  if (h.terrain === 'water') return null;
  const base = TERRAIN[h.terrain].roadCost;
  return h.river && h.special !== 'bridge' ? base * 2 : base;
}

/** Can this improvement be built in this hex, and for how much? */
export function checkImprovement(k: Kingdom, m: HexMap, hk: string, imp: HexImprovement): Check {
  const h = getHex(m, hk);
  const errors: string[] = [], warnings: string[] = [];
  const has = (i: HexImprovement) => h.improvements.includes(i);
  const land = h.terrain !== 'water';
  let cost: number | null = null;
  const t = h.terrain;
  const nbrs = neighborKeys(m, hk).filter((x): x is string => !!x).map((x) => getHex(m, x));

  if (h.status !== 'claimed') errors.push('Claim this hex first.');
  switch (imp) {
    case 'farm':
      cost = land ? TERRAIN[t as keyof typeof TERRAIN].farmCost : null;
      if (!['plains', 'hills', 'desert'].includes(t)) errors.push('Farms grow only on plains, hills, or irrigated desert.');
      else if (t === 'desert' && !h.river && !has('canal')) errors.push('A desert Farm needs a river or Canal in the hex.');
      if (!isWet(h) && !nbrs.some(isWet) && nbrs.filter((n) => n.improvements.includes('farm')).length < 2)
        warnings.push('A Farm must be in or next to a hex with a river, lake, swamp, or Canal, or next to 2 Farms.');
      break;
    case 'fishery':
      cost = 4;
      if (!(t === 'water' || t === 'marsh' || h.river || nbrs.some((n) => n.terrain === 'water')))
        errors.push('Fisheries need water: a lake or sea hex, marsh, river, or coastline.');
      break;
    case 'mine':
      cost = 6;
      if (!['desert', 'hills', 'mountains'].includes(t)) errors.push('Mines go in desert, hills, or mountains.');
      break;
    case 'quarry':
      cost = 6;
      if (!['hills', 'mountains'].includes(t)) errors.push('Quarries go in hills or mountains.');
      break;
    case 'sawmill':
      cost = 3;
      if (!['forest', 'jungle'].includes(t)) errors.push('Sawmills go in forest or jungle.');
      break;
    case 'road':
      cost = roadCost(h);
      if (!land) errors.push('Roads need land.');
      if (has('highway')) errors.push('This hex already has a Highway.');
      break;
    case 'highway': {
      const rc = roadCost(h);
      cost = rc === null ? null : has('road') ? rc : rc * 2; // upgrading pays the difference
      if (!land) errors.push('Highways need land.');
      if (k.size < 26) errors.push('Highways need a kingdom of Size 26 or more.');
      break;
    }
    case 'canal': {
      const rc = roadCost(h);
      cost = rc === null ? null : TERRAIN[t as keyof typeof TERRAIN].roadCost * 2;
      if (!['desert', 'hills', 'plains'].includes(t)) errors.push('Canals go in desert, hills, or plains.');
      break;
    }
    case 'watchtower':
      cost = 12;
      if (!land) errors.push('Watchtowers need land.');
      if (has('fort') || has('watchtower')) errors.push('A Watchtower cannot share a hex with a Fort or another Watchtower.');
      break;
    case 'fort':
      cost = has('watchtower') ? 12 : 24; // upgrading a Watchtower pays the difference
      if (!land) errors.push('Forts need land.');
      break;
  }
  if (has(imp) && imp !== 'highway') errors.push(`This hex already has a ${IMP_BY_ID[imp].label}.`);
  const exclusive: HexImprovement[] = ['mine', 'quarry', 'sawmill'];
  if (exclusive.includes(imp) && h.improvements.some((i) => exclusive.includes(i) && i !== imp))
    errors.push('A hex can hold only one Mine, Quarry, or Sawmill.');
  const st = computeStats(k);
  if ((imp === 'farm' || imp === 'road') && !st.rulerCovered) warnings.push('Without a Ruler the kingdom cannot create Farms or build Roads.');
  if (!k.settings.setupMode && k.turnState.improvements >= st.limits.improvements)
    warnings.push(`This turn's terrain improvement limit (${st.limits.improvements}) is already used.`);
  return { cost, errors, warnings };
}

export function checkClaim(k: Kingdom, m: HexMap, hk: string): Check {
  const h = getHex(m, hk);
  const errors: string[] = [], warnings: string[] = [];
  if (h.status === 'claimed') errors.push('Already part of the kingdom.');
  const anyClaimed = Object.values(m.hexes).some((x) => x.status === 'claimed');
  const adjacent = neighborKeys(m, hk).some((n) => n && getHex(m, n).status === 'claimed');
  if (anyClaimed && !adjacent) warnings.push('You can only claim a hex next to one you already hold.');
  if (h.status === 'unexplored') warnings.push(`Explore it first (about ${EXPLORE_TIME[h.terrain]}), then clear it of monsters.`);
  else if (h.status === 'explored') warnings.push('Clear it of monsters and hazards before claiming.');
  if (h.special === 'freeCity') warnings.push('A Free City needs a Stability check to claim peacefully (failure: Unrest +1d4).');
  const st = computeStats(k);
  if (!st.rulerCovered) warnings.push('Without a Ruler the kingdom cannot claim hexes.');
  if (!k.settings.setupMode && k.turnState.hexClaims >= st.limits.hexClaims)
    warnings.push(`This turn's hex claim limit (${st.limits.hexClaims}) is already used.`);
  return { cost: 1, errors, warnings };
}

// ---------- syncing ----------
/** Recompute Size and terrain-feature counts from claimed hexes (aqueducts stay hand-counted). */
export function syncFromMap(k: Kingdom) {
  const m = k.map;
  if (!m?.active) return;
  const claimed = Object.values(m.hexes).filter((h) => h.status === 'claimed');
  const count = (f: (h: Hex) => boolean) => claimed.filter(f).length;
  const has = (i: HexImprovement) => (h: Hex) => h.improvements.includes(i);
  const roadLike = (h: Hex) => h.improvements.includes('road') || h.improvements.includes('highway');
  const f: Partial<Record<TerrainFeature, number>> = {
    farm: count(has('farm')), fishery: count(has('fishery')), mine: count(has('mine')), quarry: count(has('quarry')),
    sawmill: count(has('sawmill')), fort: count(has('fort')), watchtower: count(has('watchtower')),
    highway: count(has('highway')), road: count((h) => h.improvements.includes('road') && !h.improvements.includes('highway')),
    resource: count((h) => h.special === 'resource'), lair: count((h) => h.special === 'lair'),
    landmark: count((h) => h.special === 'landmark'), landmarkRoad: count((h) => h.special === 'landmark' && roadLike(h)),
    river: count((h) => !!h.river),
    aqueduct: k.features.aqueduct ?? 0,
  };
  // Resources boost Farms/Fisheries (extra −1 Consumption) and Mines/Quarries/Sawmills (+1 to their benefit).
  const resourceFood = count((h) => h.special === 'resource' && (h.improvements.includes('farm') || h.improvements.includes('fishery')));
  const resourceMine = count((h) => h.special === 'resource' && (['mine', 'quarry', 'sawmill'] as HexImprovement[]).some((i) => h.improvements.includes(i)));
  k.features = f;
  k.size = claimed.length;
  k.modifiers = k.modifiers.filter((x) => x.id !== 'map-resources');
  if (resourceFood || resourceMine) {
    const mineEco = count((h) => h.special === 'resource' && h.improvements.includes('mine'));
    const stab = resourceMine - mineEco;
    k.modifiers.push({
      id: 'map-resources', label: 'Resource hexes boosting improvements', economy: mineEco, loyalty: 0, stability: stab,
      consumption: -resourceFood,
    });
  }
}

// ---------- actions ----------
export function claim(k: Kingdom, hk: string) {
  const m = k.map!;
  const h = editHex(m, hk);
  h.status = 'claimed';
  const bp = spend(k, 1);
  if (!k.settings.setupMode) k.turnState.hexClaims += 1;
  syncFromMap(k);
  if (h.special === 'freeCity' && !k.settings.setupMode) log(k, 'This hex has a Free City: attempt a Stability check (failure: Unrest +1d4).');
  log(k, `Claimed ${hexName(m, hk)}. Size is now ${k.size}.`, { bp });
}

export function unclaim(k: Kingdom, hk: string, reason: 'abandon' | 'lose') {
  const m = k.map!;
  const h = editHex(m, hk);
  const settlement = k.settlements.find((s) => s.hexKey === hk);
  h.status = 'cleared';
  syncFromMap(k);
  let unrest = 0;
  if (reason === 'abandon' && !k.settings.setupMode) unrest = changeUnrest(k, settlement ? 4 : 1);
  log(k, `${reason === 'abandon' ? 'Abandoned' : 'Lost control of'} ${hexName(m, hk)}. Size is now ${k.size}.`, { unrest });
}

export function build(k: Kingdom, hk: string, imp: HexImprovement) {
  const m = k.map!;
  const c = checkImprovement(k, m, hk, imp);
  const h = editHex(m, hk);
  if (imp === 'highway') h.improvements = h.improvements.filter((i) => i !== 'road');
  if (imp === 'fort') h.improvements = h.improvements.filter((i) => i !== 'watchtower');
  h.improvements.push(imp);
  const bp = spend(k, c.cost ?? 0);
  if (!k.settings.setupMode) k.turnState.improvements += 1;
  let unrest = 0;
  if ((imp === 'fort' || imp === 'watchtower') && !k.settings.setupMode) unrest = changeUnrest(k, -1);
  syncFromMap(k);
  log(k, `Built a ${IMP_BY_ID[imp].label} in ${hexName(m, hk)}.`, { bp, unrest });
}

export function removeImprovement(k: Kingdom, hk: string, imp: HexImprovement) {
  const m = k.map!;
  const h = editHex(m, hk);
  h.improvements = h.improvements.filter((i) => i !== imp);
  syncFromMap(k);
  log(k, `Removed the ${IMP_BY_ID[imp].label} from ${hexName(m, hk)}.`);
}

export function foundSettlementAt(k: Kingdom, hk: string, name: string) {
  const m = k.map!;
  const h = getHex(m, hk);
  if (h.terrain === 'water') throw new Error('Settlements need land.');
  const terrain = h.terrain;
  const bp = spend(k, TERRAIN[terrain].prepCost);
  k.settlements.push({ id: uid(), name, terrain, districts: [newDistrict('District 1')], hexKey: hk });
  if (!k.settings.setupMode) k.turnState.settlements += 1;
  log(k, `Founded ${name} in ${hexName(m, hk)} (site preparation).`, { bp });
}

export function hexName(m: HexMap, hk: string) {
  const h = getHex(m, hk);
  const [c, r] = parse(hk);
  return h.name ? `${h.name} (${coordLabel(c, r)})` : `hex ${coordLabel(c, r)}`;
}

/** Spreadsheet-style label: column letter + row number, e.g. "H7". */
export function coordLabel(c: number, r: number) {
  let s = '', n = c;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `${s}${r + 1}`;
}

/** Turn on the map for an existing kingdom; Size and improvements now come from claimed hexes. */
export function activateMap(k: Kingdom) {
  if (!k.map) k.map = newMap(16, 12, false);
  k.map.active = true;
  syncFromMap(k);
  log(k, `Switched territory to the hex map. Size is now ${k.size}.`);
}

export type Side = 'top' | 'bottom' | 'left' | 'right';
export const MAX_MAP = 80;

/** Claimed hexes in the strip that removing `n` rows or columns from `side` would cut off. */
export function shrinkBlocked(m: HexMap, side: Side, n: number) {
  return Object.entries(m.hexes).some(([hk, h]) => {
    if (h.status !== 'claimed') return false;
    const [c, r] = parse(hk);
    return side === 'left' ? c < n : side === 'right' ? c >= m.cols - n : side === 'top' ? r < n : r >= m.rows - n;
  });
}

/**
 * Grow (n > 0) or shrink (n < 0) the map on one side. Adding on the left or top renumbers hexes and moves the
 * origin so nothing shifts on screen; new hexes continue the generated terrain when the map has a seed.
 */
export function resizeSide(k: Kingdom, side: Side, n: number) {
  const m = k.map!;
  const horizontal = side === 'left' || side === 'right';
  const size = horizontal ? m.cols : m.rows;
  n = Math.max(4 - size, Math.min(MAX_MAP - size, n));
  if (!n || (n < 0 && shrinkBlocked(m, side, -n))) return;
  const shift = side === 'left' || side === 'top' ? n : 0;
  const moved: Record<string, Hex> = {};
  const newCols = horizontal ? m.cols + n : m.cols, newRows = horizontal ? m.rows : m.rows + n;
  const remap = (hk: string) => {
    const [c, r] = parse(hk);
    const nc = side === 'left' ? c + shift : c, nr = side === 'top' ? r + shift : r;
    return nc >= 0 && nr >= 0 && nc < newCols && nr < newRows ? key(nc, nr) : null;
  };
  for (const [hk, h] of Object.entries(m.hexes)) {
    const to = remap(hk);
    if (to) moved[to] = h;
  }
  for (const s of k.settlements) if (s.hexKey) s.hexKey = remap(s.hexKey) ?? undefined;
  if (side === 'left') m.originC = (m.originC ?? 0) - shift;
  if (side === 'top') m.originR = (m.originR ?? 0) - shift;
  m.cols = newCols;
  m.rows = newRows;
  m.hexes = moved;
  if (m.gen && n > 0) {
    for (let c = 0; c < m.cols; c++)
      for (let r = 0; r < m.rows; r++) {
        const hk = key(c, r);
        if (!m.hexes[hk]) m.hexes[hk] = { terrain: terrainAt(m.gen, c + (m.originC ?? 0), r + (m.originR ?? 0)), status: 'unexplored', improvements: [] };
      }
  }
  log(k, `${n > 0 ? 'Added' : 'Removed'} ${Math.abs(n)} ${horizontal ? 'column' : 'row'}${Math.abs(n) > 1 ? 's' : ''} ${n > 0 ? 'on' : 'from'} the ${side} of the map.`);
  return shift;
}

/**
 * Regenerate terrain from generator options. Claimed hexes (and their improvements and settlements) are kept;
 * unclaimed hexes get new terrain but keep how far they've been explored.
 */
export function regenerate(k: Kingdom, o: GenOptions) {
  const m = k.map!;
  const g = generateMap(o, m.cols, m.rows, m.originC ?? 0, m.originR ?? 0);
  const anyClaimed = Object.values(m.hexes).some((h) => h.status === 'claimed');
  for (const [hk, fresh] of Object.entries(g.map.hexes)) {
    const old = m.hexes[hk];
    if (old?.status === 'claimed') continue;
    m.hexes[hk] = { ...fresh, status: anyClaimed ? old?.status ?? 'unexplored' : fresh.status };
  }
  m.gen = g.map.gen;
  reconcileRivers(m);
  syncFromMap(k);
  log(k, `Generated new terrain from seed "${o.seed}"${anyClaimed ? '; claimed hexes kept as they were' : ''}.`);
  return g.capital;
}

// ---------- rivers ----------
/** Edge index from hex a to neighbor b, or -1 if they aren't neighbors. */
export function dirTo(m: HexMap, a: string, b: string) {
  return neighborKeys(m, a).indexOf(b);
}

function addEdge(h: Hex, i: number) {
  h.riverEdges = [...new Set([...(h.riverEdges ?? []), i])].sort();
}

/** Join two neighboring hexes with a river. Flowing into a water hex only marks the river's mouth. */
export function linkRiver(m: HexMap, a: string, b: string) {
  const i = dirTo(m, a, b);
  if (i < 0) return false;
  const ha = editHex(m, a), hb = editHex(m, b);
  if (ha.terrain === 'water') return false;
  ha.river = true;
  addEdge(ha, i);
  if (hb.terrain !== 'water') {
    hb.river = true;
    addEdge(hb, (i + 3) % 6);
  }
  return true;
}

/** Remove the river from a hex, and the matching edges from its neighbors. */
export function eraseRiver(m: HexMap, hk: string) {
  const h = editHex(m, hk);
  h.river = false;
  delete h.riverEdges;
  neighborKeys(m, hk).forEach((n, i) => {
    const nh = n ? m.hexes[n] : undefined;
    if (nh?.riverEdges) nh.riverEdges = nh.riverEdges.filter((e) => e !== (i + 3) % 6);
  });
}

/**
 * Put a river in one hex and connect it sensibly: to up to two neighboring river ends (hexes whose river
 * doesn't continue on both sides yet), otherwise to any neighboring river, and to water as a mouth.
 */
export function attachRiver(m: HexMap, hk: string) {
  const h = editHex(m, hk);
  if (h.terrain === 'water') return;
  h.river = true;
  h.riverEdges ??= [];
  const nb = neighborKeys(m, hk).filter((n): n is string => !!n);
  const rivers = nb.filter((n) => getHex(m, n).river);
  const ends = rivers.filter((n) => (getHex(m, n).riverEdges?.length ?? 0) < 2);
  const picks = (ends.length ? ends : rivers).slice(0, 2);
  for (const n of picks) linkRiver(m, hk, n);
  if (picks.length < 2) {
    const water = nb.find((n) => getHex(m, n).terrain === 'water');
    if (water) linkRiver(m, hk, water);
  }
}

/** Draw a river along a stroke of hexes, in the order they were dragged through. */
export function drawRiverPath(m: HexMap, keys: string[]) {
  const land = keys.filter((k) => getHex(m, k).terrain !== 'water');
  if (land.length === 1) return attachRiver(m, land[0]);
  for (let i = 0; i < keys.length; i++) {
    const h = editHex(m, keys[i]);
    if (h.terrain !== 'water') { h.river = true; h.riverEdges ??= []; }
    if (i > 0) linkRiver(m, keys[i - 1], keys[i]);
  }
  // Connect the ends of the stroke to rivers or water they touch.
  for (const end of [keys[0], keys[keys.length - 1]]) {
    if (getHex(m, end).terrain === 'water') continue;
    const nb = neighborKeys(m, end).filter((n): n is string => !!n && !keys.includes(n));
    const target = nb.find((n) => getHex(m, n).river) ?? nb.find((n) => getHex(m, n).terrain === 'water');
    if (target) linkRiver(m, end, target);
  }
}

/**
 * Which edges each river hex's river crosses, for drawing. Uses stored edges where present. River hexes without
 * them (older maps) are threaded into chains that follow a single course, so bends don't turn into triangles.
 */
export function riverLinks(m: HexMap): Map<string, number[]> {
  const out = new Map<string, Set<number>>();
  const add = (hk: string, i: number) => { if (!out.has(hk)) out.set(hk, new Set()); out.get(hk)!.add(i); };
  const loose: string[] = [];
  for (const [hk, h] of Object.entries(m.hexes)) {
    if (!h.river || h.terrain === 'water') continue;
    if (h.riverEdges) { add(hk, -1); for (const e of h.riverEdges) add(hk, e); }
    else loose.push(hk);
  }
  const isLoose = new Set(loose);
  const unvisited = new Set(loose);
  const looseNbrs = (hk: string) => neighborKeys(m, hk).filter((n): n is string => !!n && unvisited.has(n));
  const link = (a: string, b: string) => {
    const i = dirTo(m, a, b);
    add(a, i);
    if (getHex(m, b).terrain !== 'water') add(b, (i + 3) % 6);
  };
  while (unvisited.size) {
    // Start a chain at the hex with the fewest loose neighbors (an end of the river, if there is one).
    let cur = [...unvisited].sort((a, b) => looseNbrs(a).length - looseNbrs(b).length)[0];
    unvisited.delete(cur);
    add(cur, -1);
    for (;;) {
      const cands = looseNbrs(cur);
      if (!cands.length) break;
      // Prefer the neighbor with the fewest other options: it's the next hex along the course, not a shortcut.
      const next = cands.sort((a, b) => looseNbrs(a).length - looseNbrs(b).length)[0];
      link(cur, next);
      unvisited.delete(next);
      cur = next;
    }
  }
  // Loose hexes with an open end: join a neighboring stored river, or flow into water.
  for (const hk of loose) {
    const edges = out.get(hk)!;
    if (edges.size - 1 >= 2) continue;
    const nb = neighborKeys(m, hk);
    const j = nb.findIndex((n) => !!n && !isLoose.has(n) && getHex(m, n).river && !edges.has(nb.indexOf(n)));
    const w = nb.findIndex((n) => !!n && getHex(m, n).terrain === 'water');
    if (j >= 0) link(hk, nb[j]!);
    else if (w >= 0 && edges.size - 1 < 2) add(hk, w);
  }
  return new Map([...out].map(([hk, set]) => [hk, [...set].filter((i) => i >= 0).sort()]));
}

/** Offset coordinates of the neighbor across edge i (may be off the map). */
export function neighborCoord(m: HexMap, c: number, r: number, i: number): [number, number] {
  const [dc, dr] = DIRS[colParity(m, c)][i];
  return [c + dc, r + dr];
}

/**
 * Make river edges agree across the map after hexes change underneath them (regenerating, terrain edits):
 * an edge into a neighboring river joins it; an edge into dry land with no river is trimmed.
 */
export function reconcileRivers(m: HexMap) {
  for (const [hk, h] of Object.entries(m.hexes)) {
    if (!h.river || !h.riverEdges || h.terrain === 'water') continue;
    const nb = neighborKeys(m, hk);
    h.riverEdges = h.riverEdges.filter((i) => {
      const n = nb[i];
      if (!n) return true; // off the map
      const nh = getHex(m, n);
      if (nh.terrain === 'water') return true;
      if (nh.river) { if (nh.riverEdges) addEdge(nh, (i + 3) % 6); return true; }
      return false;
    });
  }
}
