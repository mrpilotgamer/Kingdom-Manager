// Armies on the hex map. Any number of armies can share a hex.
import type { Army, HexMap, Kingdom } from '../state/types';
import { log } from './actions';
import { getHex, hexName, key, parse } from './map';

/** Hexes are 12 miles across by default (Ultimate Campaign's kingdom hexes). */
export const milesPerHex = (m?: HexMap) => m?.milesPerHex ?? 12;
/** Area of a hex `w` miles across its flat sides. */
export const hexArea = (w: number) => Math.round((Math.sqrt(3) / 2) * w * w);

const toCube = (m: HexMap, hk: string) => {
  const [c, r] = parse(hk);
  const ac = c + (m.originC ?? 0), ar = r;
  const z = ar - (ac - (ac & 1)) / 2;
  return [ac, -ac - z, z];
};
const fromCube = (m: HexMap, x: number, z: number) => {
  const ac = x;
  const r = z + (ac - (ac & 1)) / 2;
  return key(ac - (m.originC ?? 0), r);
};
function cubeRound(x: number, y: number, z: number) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, ry, rz];
}

export function hexDistanceKeys(m: HexMap, a: string, b: string) {
  const A = toCube(m, a), B = toCube(m, b);
  return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
}

/** The hexes along a straight line from a to b (excluding a). */
export function hexLine(m: HexMap, a: string, b: string): string[] {
  const n = hexDistanceKeys(m, a, b);
  const A = toCube(m, a), B = toCube(m, b);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const [x, , z] = cubeRound(A[0] + (B[0] - A[0]) * t + 1e-6, A[1] + (B[1] - A[1]) * t + 1e-6, A[2] + (B[2] - A[2]) * t - 2e-6);
    out.push(fromCube(m, x, z));
  }
  return out;
}

const DIFFICULT = ['forest', 'hills', 'jungle', 'marsh', 'mountains'];

/** Days to march from `from` to `to`: each hex costs 1, or 2 in difficult terrain without a Road or Highway. */
export function travel(k: Kingdom, a: Army, from: string, to: string) {
  const m = k.map!;
  const path = hexLine(m, from, to);
  let cost = 0, difficult = 0;
  for (const hk of path) {
    const h = getHex(m, hk);
    const road = h.improvements.includes('road') || h.improvements.includes('highway');
    const hard = DIFFICULT.includes(h.terrain) && !road && !a.specials.some((s) => s.id === 'flight');
    if (hard) difficult++;
    cost += hard ? 2 : 1;
  }
  const speed = Math.max(a.speed, 0.25);
  return { hexes: path.length, difficult, days: Math.ceil(cost / speed), miles: path.length * milesPerHex(m), water: path.some((hk) => getHex(m, hk).terrain === 'water') };
}

export const armiesAt = (k: Kingdom, hk: string) =>
  (k.armies ?? []).filter((a) => a.location === hk && a.status !== 'defeated' && a.status !== 'disbanded');

export function placeArmy(k: Kingdom, id: string, hk: string | undefined) {
  const a = k.armies!.find((x) => x.id === id)!;
  a.location = hk;
  if (hk) {
    a.history.push({ turn: k.turn, text: `Stationed in ${hexName(k.map!, hk)}.` });
    log(k, `${a.name} is stationed in ${hexName(k.map!, hk)}.`);
  } else log(k, `${a.name} was taken off the map.`);
}

export function marchArmy(k: Kingdom, id: string, to: string) {
  const a = k.armies!.find((x) => x.id === id)!;
  const from = a.location;
  if (!from || from === to) return placeArmy(k, id, to);
  const t = travel(k, a, from, to);
  a.location = to;
  if (a.reserve) a.reserve = undefined; // leaving a settlement makes it an active army again
  const text = `Marched ${t.hexes} hex${t.hexes === 1 ? '' : 'es'} (${t.miles} miles) to ${hexName(k.map!, to)}: about ${t.days} day${t.days === 1 ? '' : 's'}${t.difficult ? `, ${t.difficult} through difficult terrain` : ''}.`;
  a.history.push({ turn: k.turn, text });
  log(k, `${a.name}: ${text}`);
  return t;
}

/** Armies held in reserve sit in their settlement's hex. */
export function reserveLocation(k: Kingdom, a: Army) {
  if (!a.reserve) return a.location;
  return k.settlements.find((s) => s.id === a.reserve)?.hexKey ?? a.location;
}

