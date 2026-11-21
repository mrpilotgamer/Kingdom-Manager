// Random map generation. Terrain is a pure function of the seed and absolute hex coordinates,
// so a map can be regenerated from its seed and extended later with matching terrain.
import type { Hex, HexMap, HexSpecial, HexTerrain } from '../state/types';

export type Climate = 'temperate' | 'cold' | 'arid' | 'tropical';
export type Water = 'inland' | 'lakes' | 'coast';
export type Ruggedness = 'gentle' | 'rolling' | 'rugged';
export type Specials = 'none' | 'few' | 'some' | 'many';

export interface GenOptions {
  seed: string;
  climate: Climate;
  water: Water;
  ruggedness: Ruggedness;
  specials: Specials;
}

/** Everything needed to compute terrain for any absolute coordinate, saved on the map. */
export interface GenParams extends GenOptions {
  coastSide: 0 | 1 | 2 | 3; // N, E, S, W
  /** Size of the area the thresholds were measured on (absolute coordinates). */
  area: { c0: number; r0: number; cols: number; rows: number };
  thresholds: { water: number; hills: number; mountains: number };
}

export const CLIMATES: Record<Climate, string> = { temperate: 'Temperate', cold: 'Cold', arid: 'Arid', tropical: 'Tropical' };
export const WATERS: Record<Water, string> = { inland: 'Inland (few ponds)', lakes: 'Lakes', coast: 'Coastline' };
export const RUGGED: Record<Ruggedness, string> = { gentle: 'Gentle', rolling: 'Rolling hills', rugged: 'Rugged mountains' };
export const SPECIAL_LEVELS: Record<Specials, string> = { none: 'None', few: 'A few', some: 'Some', many: 'Many' };

export const DEFAULT_GEN: Omit<GenOptions, 'seed'> = { climate: 'temperate', water: 'lakes', ruggedness: 'rolling', specials: 'some' };

// ---------- seeded randomness ----------
function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rngFrom(seed: string) {
  let a = hashString(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function lattice(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * s(t);
  return lerp(lerp(lattice(x0, y0, seed), lattice(x0 + 1, y0, seed), tx), lerp(lattice(x0, y0 + 1, seed), lattice(x0 + 1, y0 + 1, seed), tx), ty);
}
function fbm(x: number, y: number, seed: number, scale: number) {
  let total = 0, amp = 1, norm = 0, f = 1 / scale;
  for (let o = 0; o < 3; o++) {
    total += noise(x * f, y * f, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return total / norm;
}

const WORDS_A = ['amber', 'ash', 'bramble', 'cinder', 'copper', 'dusk', 'ember', 'fallow', 'frost', 'gilded', 'hollow', 'iron', 'moss', 'raven', 'river', 'silver', 'stone', 'thorn', 'willow', 'wolf'];
const WORDS_B = ['barrow', 'crown', 'dale', 'fen', 'ford', 'gate', 'glen', 'haven', 'hold', 'march', 'mere', 'moor', 'reach', 'ridge', 'shire', 'vale', 'watch', 'weald', 'wick', 'wood'];
export function randomSeed(rand: () => number = Math.random) {
  const p = (l: string[]) => l[Math.floor(rand() * l.length)];
  return `${p(WORDS_A)}-${p(WORDS_B)}-${Math.floor(rand() * 90) + 10}`;
}

// ---------- terrain ----------
/** Hex centers in a roughly isotropic space so noise doesn't stretch along columns. */
const pos = (ac: number, ar: number): [number, number] => [ac * 0.866, ar + ((ac & 1) ? 0.5 : 0)];

function rawHeight(p: GenParams, ac: number, ar: number) {
  const seed = hashString(p.seed);
  const [x, y] = pos(ac, ar);
  const scale = p.ruggedness === 'rugged' ? 4 : p.ruggedness === 'gentle' ? 7 : 5.5;
  let h = fbm(x, y, seed, scale);
  if (p.water === 'coast') {
    const { c0, r0, cols, rows } = p.area;
    // Distance from the coast edge, 0 at the edge to 1 across the original area.
    const t = [(ar - r0) / rows, 1 - (ac - c0) / cols, 1 - (ar - r0) / rows, (ac - c0) / cols][p.coastSide];
    h = h * 0.75 + Math.min(1, Math.max(-0.5, t)) * 0.45 - 0.12;
  }
  return h;
}
function moisture(p: GenParams, ac: number, ar: number) {
  const [x, y] = pos(ac, ar);
  return fbm(x, y, hashString(p.seed) + 7919, 4.5);
}

export function terrainAt(p: GenParams, ac: number, ar: number): HexTerrain {
  const h = rawHeight(p, ac, ar);
  const m = moisture(p, ac, ar);
  const t = p.thresholds;
  if (h < t.water) return 'water';
  if (h >= t.mountains) return 'mountains';
  if (h >= t.hills) return p.climate === 'arid' && m < 0.35 ? 'desert' : 'hills';
  const lowland = h < t.water + 0.05;
  switch (p.climate) {
    case 'cold':
      if (lowland && m > 0.5) return 'marsh';
      return m > 0.5 ? 'forest' : 'plains';
    case 'arid':
      if (m < 0.48) return 'desert';
      if (lowland && m > 0.62) return 'marsh';
      return m > 0.7 ? 'forest' : 'plains';
    case 'tropical':
      if (lowland && m > 0.45) return 'marsh';
      if (m > 0.55) return 'jungle';
      return m > 0.45 ? 'forest' : 'plains';
    default:
      if (lowland && m > 0.56) return 'marsh';
      return m > 0.57 ? 'forest' : 'plains';
  }
}

function quantile(sorted: number[], q: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

/** Fix thresholds from the share of water/hills/mountains wanted on the original area. */
export function makeParams(o: GenOptions, area: GenParams['area']): GenParams {
  const rand = rngFrom(o.seed + ':coast');
  const p: GenParams = { ...o, coastSide: Math.floor(rand() * 4) as GenParams['coastSide'], area, thresholds: { water: -1, hills: 2, mountains: 2 } };
  const heights: number[] = [];
  for (let c = 0; c < area.cols; c++) for (let r = 0; r < area.rows; r++) heights.push(rawHeight(p, area.c0 + c, area.r0 + r));
  heights.sort((a, b) => a - b);
  const water = { inland: 0.03, lakes: 0.1, coast: 0.24 }[o.water];
  const mountains = { gentle: 0.04, rolling: 0.08, rugged: 0.15 }[o.ruggedness];
  const hills = { gentle: 0.1, rolling: 0.17, rugged: 0.22 }[o.ruggedness];
  p.thresholds = { water: quantile(heights, water), mountains: quantile(heights, 1 - mountains), hills: quantile(heights, 1 - mountains - hills) };
  return p;
}

// ---------- whole-map generation ----------
type Off = [number, number];
const DIRS: Off[][] = [
  [[1, 0], [0, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]],
  [[1, 1], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, 0]],
];
/** Hex distance between absolute offset coordinates. */
export function hexDistance(c1: number, r1: number, c2: number, r2: number) {
  const cube = (c: number, r: number) => { const z = r - (c - (c & 1)) / 2; return [c, -c - z, z]; };
  const a = cube(c1, r1), b = cube(c2, r2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

const LANDMARK_A = ['Weeping', 'Broken', 'Singing', 'Crimson', 'Hollow', 'Sleeping', 'Whispering', 'Old', 'Shattered', 'Drowned', 'Twin', 'Lonely'];
const LANDMARK_B = ['Stone', 'Oak', 'Falls', 'Spire', 'Tor', 'Circle', 'Giant', 'Pool', 'Arch', 'Crag', 'Mound', 'Pillar'];

export interface Generated { map: HexMap; capital: string }

/**
 * Generate a full map. Keys are relative to the map; (c0, r0) is the absolute coordinate of key "0,0".
 * The capital site is chosen and left cleared, ready to be claimed.
 */
export function generateMap(o: GenOptions, cols: number, rows: number, c0 = 0, r0 = 0): Generated {
  const p = makeParams(o, { c0, r0, cols, rows });
  const rand = rngFrom(o.seed + ':features');
  const hexes: Record<string, Hex> = {};
  const k = (c: number, r: number) => `${c},${r}`;
  const height = (c: number, r: number) => rawHeight(p, c + c0, r + r0);
  const neighbors = (_cols: number, _rows: number, c: number, r: number): Off[] =>
    DIRS[(c + c0) & 1].map(([dc, dr]) => [c + dc, r + dr] as Off).filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows);
  const distance = (c1: number, r1: number, c2: number, r2: number) => hexDistance(c1 + c0, r1 + r0, c2 + c0, r2 + r0);
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) hexes[k(c, r)] = { terrain: terrainAt(p, c + c0, r + r0), status: 'unexplored', improvements: [] };

  // Rivers: start high, walk to the lowest neighbor until reaching water, the map edge, or another river.
  const riverCount = Math.max(1, Math.round((cols * rows) / 70));
  const sources = Object.keys(hexes)
    .map((key) => key.split(',').map(Number) as Off)
    .filter(([c, r]) => hexes[k(c, r)].terrain === 'hills' || hexes[k(c, r)].terrain === 'mountains')
    .sort(() => rand() - 0.5);
  const starts: Off[] = [];
  for (const s of sources) {
    if (starts.length >= riverCount) break;
    if (starts.every(([c, r]) => distance(c, r, s[0], s[1]) >= 4)) starts.push(s);
  }
  const dirIndex = (c: number, r: number, nc: number, nr: number) =>
    DIRS[(c + c0) & 1].findIndex(([dc, dr]) => c + dc === nc && r + dr === nr);
  const addEdge = (h: Hex, i: number) => { h.riverEdges = [...new Set([...(h.riverEdges ?? []), i])].sort(); };
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  for (const [sc, sr] of starts) {
    let [c, r] = [sc, sr];
    const path: Off[] = [];
    const onPath = (x: number, y: number) => path.some(([px, py]) => px === x && py === y);
    // Where the river ends: into a hex (water, a lake, or another river) or off the map through an edge.
    let end: { into?: Off; lake?: boolean; offEdge?: number } = {};
    for (let step = 0; step < cols + rows; step++) {
      path.push([c, r]);
      const offEdge = DIRS[(c + c0) & 1].findIndex(([dc, dr]) => !inside(c + dc, r + dr));
      if (step > 0 && offEdge >= 0) {
        // Flow off the map if that's downhill from here.
        const [dc, dr] = DIRS[(c + c0) & 1][offEdge];
        if (rawHeight(p, c + dc + c0, r + dr + r0) <= height(c, r)) { end = { offEdge }; break; }
      }
      // Only step to hexes that don't touch the river's earlier course, so it never doubles back.
      const nb = neighbors(cols, rows, c, r).filter(([x, y]) =>
        !onPath(x, y) && !neighbors(cols, rows, x, y).some(([a, b]) => onPath(a, b) && !(a === c && b === r)));
      if (!nb.length) { end = { lake: true }; break; }
      nb.sort((a, b) => height(...a) - height(...b));
      const [nc, nr] = nb[0];
      const next = hexes[k(nc, nr)];
      if (next.terrain === 'water' || next.river) { end = { into: [nc, nr] }; break; }
      if (step > 2 && height(nc, nr) > height(c, r) + 0.03) { end = { lake: true }; break; }
      [c, r] = [nc, nr];
    }
    if (path.length < 3) continue;
    if (end.lake) {
      // Stuck in a hollow: the last hex becomes a small lake the river flows into.
      const [lc, lr] = path.pop()!;
      hexes[k(lc, lr)].terrain = 'water';
      end = { into: [lc, lr] };
    }
    path.forEach(([pc, pr], i) => {
      const h = hexes[k(pc, pr)];
      if (h.terrain === 'mountains') h.terrain = 'hills';
      h.river = true;
      if (i > 0) {
        const [qc, qr] = path[i - 1];
        addEdge(h, dirIndex(pc, pr, qc, qr));
        addEdge(hexes[k(qc, qr)], dirIndex(qc, qr, pc, pr));
      }
    });
    const [lc, lr] = path[path.length - 1];
    const last = hexes[k(lc, lr)];
    if (end.offEdge !== undefined) addEdge(last, end.offEdge);
    if (end.into) {
      const [ic, ir] = end.into;
      addEdge(last, dirIndex(lc, lr, ic, ir));
      const target = hexes[k(ic, ir)];
      if (target.river) addEdge(target, dirIndex(ic, ir, lc, lr)); // joins another river
    }
  }

  // Capital: plains or hills near the middle, ideally on a river with buildable land around it.
  let best = k(Math.floor(cols / 2), Math.floor(rows / 2)), bestScore = -Infinity;
  for (let c = 1; c < cols - 1; c++)
    for (let r = 1; r < rows - 1; r++) {
      const h = hexes[k(c, r)];
      if (h.terrain !== 'plains' && h.terrain !== 'hills') continue;
      const nb = neighbors(cols, rows, c, r).map(([x, y]) => hexes[k(x, y)]);
      let score = (h.river ? 4 : 0) + (h.terrain === 'plains' ? 1 : 0);
      score += nb.filter((n) => ['plains', 'hills', 'forest'].includes(n.terrain)).length * 0.6;
      score += nb.some((n) => n.terrain === 'water') ? 1 : 0;
      score -= distance(c, r, Math.floor(cols / 2), Math.floor(rows / 2)) * 0.5;
      score += rand() * 0.5;
      if (score > bestScore) { bestScore = score; best = k(c, r); }
    }
  const [cc, cr] = best.split(',').map(Number);
  if (hexes[best].terrain !== 'plains' && hexes[best].terrain !== 'hills') hexes[best].terrain = 'plains';
  hexes[best].status = 'cleared';
  for (const [x, y] of neighbors(cols, rows, cc, cr)) hexes[k(x, y)].status = 'explored';

  // Special sites, spread out and away from the capital.
  const want = { none: 0, few: 3, some: 6, many: 10 }[o.specials];
  const n = Math.round((want * cols * rows) / 192);
  const placed: Off[] = [];
  const candidates = Object.keys(hexes).map((key) => key.split(',').map(Number) as Off).sort(() => rand() - 0.5);
  const pickType = (t: HexTerrain): HexSpecial => {
    const x = rand();
    if (x < 0.32) return ['hills', 'mountains', 'forest', 'jungle', 'desert'].includes(t) ? 'resource' : 'landmark';
    if (x < 0.52) return 'landmark';
    if (x < 0.72) return ['forest', 'marsh', 'mountains', 'jungle', 'hills'].includes(t) ? 'lair' : 'ruin';
    if (x < 0.88) return 'ruin';
    if (x < 0.94) return 'building';
    return ['plains', 'hills'].includes(t) ? 'freeCity' : 'ruin';
  };
  for (const [c, r] of candidates) {
    if (placed.length >= n) break;
    const h = hexes[k(c, r)];
    if (h.terrain === 'water' || distance(c, r, cc, cr) < 2) continue;
    if (placed.some(([x, y]) => distance(c, r, x, y) < 3)) continue;
    const type = pickType(h.terrain);
    if (type === 'freeCity' && distance(c, r, cc, cr) < 5) continue;
    h.special = type;
    if (type === 'landmark') h.name = `The ${LANDMARK_A[Math.floor(rand() * LANDMARK_A.length)]} ${LANDMARK_B[Math.floor(rand() * LANDMARK_B.length)]}`;
    placed.push([c, r]);
  }

  return { map: { cols, rows, hexes, active: true, originC: c0, originR: r0, gen: p }, capital: best };
}
