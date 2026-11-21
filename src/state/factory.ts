import { newDistrict } from '../engine/actions';
import { drawRiverPath, key, newMap, syncFromMap } from '../engine/map';
import type { Generated } from '../engine/mapgen';
import type { Alignment, Attr, Terrain } from '../rules/kingdom';
import type { Hex, HexImprovement, HexMap, HexTerrain, Kingdom, Lot, PlacedBuilding } from './types';
import { uid } from './util';

export interface NewKingdomInput {
  name: string;
  alignment: Alignment;
  startingBP: number;
  settlementName: string;
  terrain: Terrain;
}

const blankTurn = (): Kingdom['turnState'] => ({
  phase: 'upkeep', done: {}, buildings: 0, freeHousingUsed: false, hexClaims: 0, improvements: 0, settlements: 0,
});

export function blankKingdom(name: string, alignment: Alignment): Kingdom {
  const now = Date.now();
  return {
    id: uid(), name, alignment, turn: 1, treasury: 0, unrest: 0, size: 1, fame: 0,
    leaders: {}, edicts: { holiday: 0, promotion: 0, taxation: 0 }, features: {},
    settlements: [], modifiers: [], log: [], turnState: blankTurn(), eventLastTurn: false,
    settings: { districtsAddConsumption: true, diagonalAdjacency: false, setupMode: false },
    createdAt: now, updatedAt: now,
  };
}

/** Founding a Kingdom: claim the first hex (1 BP) and prepare the site, then build from the Treasury. */
export function createKingdom(input: NewKingdomInput, prepCost: number, generated?: Generated): Kingdom {
  const k = blankKingdom(input.name, input.alignment);
  k.treasury = input.startingBP - 1 - prepCost;
  let map: HexMap, home: string;
  if (generated) {
    map = structuredClone(generated.map);
    home = generated.capital;
    map.hexes[home].status = 'claimed';
    map.hexes[home].name = undefined;
  } else {
    map = newMap(16, 12, true);
    home = key(7, 5);
    const terrain: HexTerrain = input.terrain === 'cavern' ? 'mountains' : input.terrain;
    map.hexes[home] = { terrain, status: 'claimed', improvements: [] };
  }
  k.map = map;
  k.settlements.push({ id: uid(), name: input.settlementName, terrain: input.terrain, districts: [newDistrict('District 1')], hexKey: home });
  syncFromMap(k);
  k.log.unshift({
    id: uid(), turn: 1, phase: 'setup',
    text: `Founded ${input.name} with ${input.startingBP} BP. Claimed the first hex (1 BP) and prepared ${input.settlementName} (${prepCost} BP).`,
    bp: -(1 + prepCost),
  });
  return k;
}

const pb = (type: string, ...lots: Lot[]): PlacedBuilding => ({ id: uid(), type, lots });

/** A filled-in example kingdom so the app shows what it does on first open. */
export function sampleKingdom(): Kingdom {
  const k = blankKingdom('Barony of Greyford (example)', { law: 'lawful', moral: 'good' });
  Object.assign(k, { turn: 5, treasury: 19, unrest: 1, size: 7 });
  k.edicts = { holiday: 1, promotion: 1, taxation: 1 };
  k.features = { farm: 2, road: 3, mine: 1, river: 2 };
  const L = (name: string, mod: number, attrs: Attr[] = []) => ({ name, mod, leadershipFeat: false, attrs, active: true });
  k.leaders = {
    ruler: L('Aldra Venn', 4, ['loyalty']),
    councilor: L('Brother Tamsin', 2),
    general: L('Sir Oric Hale', 3),
    grandDiplomat: L('Lady Mirel', 2),
    highPriest: L('Ysolde of the Dawn', 4),
    magister: L('Quillan Marsh', 3),
    marshal: L('Kestrel', 3),
    spymaster: L('Nettle', 2, ['economy']),
    treasurer: L('Fenwick Ash', 2),
    warden: L('Garrick Stone', 2),
  };
  const d = newDistrict('Old Town');
  d.borders.e = 'water';
  d.buildings = [
    pb('house', [2, 2]), pb('inn', [2, 3]), pb('house', [3, 2]), pb('tavern', [3, 3]),
    pb('shrine', [2, 4]), pb('watchtower', [3, 4]), pb('mill', [2, 5]), pb('smithy', [3, 5]),
    pb('house', [1, 2]), pb('shop', [1, 3]), pb('town-hall', [4, 2], [4, 3]),
  ];
  k.map = sampleMap();
  k.settlements = [{ id: uid(), name: 'Greyford', terrain: 'plains', districts: [d], hexKey: key(7, 5) }];
  syncFromMap(k);
  const entries: [number, string, number?, number?][] = [
    [4, 'Turn 4 ended. Treasury 19 BP, Unrest 1.'],
    [4, 'Economy check 31 vs DC 28: 10 BP in taxes, +1 BP from Mines, Quarries, and Sawmills.', 11],
    [4, 'Built Town Hall in Greyford.', -22],
    [4, 'Paid 6 BP Consumption.', -6],
    [4, 'Stability check 30 vs DC 28. Success: Unrest −1.', 0, -1],
    [3, 'Built Shop in Greyford.', -8],
    [2, 'Claimed a hex. Size is now 7.', -1],
    [1, 'Founded the Barony of Greyford with 50 BP.'],
  ];
  k.log = entries.map(([turn, text, bp, unrest]) => ({ id: uid(), turn, text, bp, unrest }));
  return k;
}

// ---------- example map ----------
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(x: number, y: number, seed: number, scale: number) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  return lerp(lerp(hash(x0, y0, seed), hash(x0 + 1, y0, seed), tx), lerp(hash(x0, y0 + 1, seed), hash(x0 + 1, y0 + 1, seed), tx), ty);
}
/** Distance in hexes between offset (odd-q) coordinates. */
function hexDistance(c1: number, r1: number, c2: number, r2: number) {
  const cube = (c: number, r: number) => { const x = c, z = r - (c - (c & 1)) / 2; return [x, -x - z, z]; };
  const a = cube(c1, r1), b = cube(c2, r2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function sampleMap(): HexMap {
  const m = newMap(16, 12, true);
  for (let c = 0; c < m.cols; c++)
    for (let r = 0; r < m.rows; r++) {
      const height = smooth(c, r, 7, 4) * 0.7 + smooth(c, r, 11, 2) * 0.3;
      const wet = smooth(c, r, 23, 3);
      let terrain: HexTerrain = 'plains';
      if (height > 0.72) terrain = 'mountains';
      else if (height > 0.58) terrain = 'hills';
      else if (height < 0.2) terrain = 'water';
      else if (wet > 0.68) terrain = height < 0.35 ? 'marsh' : 'forest';
      else if (wet > 0.5) terrain = 'forest';
      const d = hexDistance(c, r, 7, 5);
      const status: Hex['status'] = d <= 2 ? 'cleared' : d <= 3 ? 'explored' : 'unexplored';
      m.hexes[key(c, r)] = { terrain, status, improvements: [] };
    }
  // A river running north to south through the capital.
  const course = [[8, 0], [8, 1], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [6, 7], [6, 8], [5, 8], [5, 9], [4, 10], [4, 11]];
  for (const [c, r] of course) {
    const h = m.hexes[key(c, r)];
    if (h.terrain === 'water' || h.terrain === 'mountains') h.terrain = 'plains';
  }
  drawRiverPath(m, course.map(([c, r]) => key(c, r)));
  const claimed: [number, number, HexTerrain, HexImprovement[]][] = [
    [7, 5, 'plains', ['road']], [7, 4, 'plains', ['road']], [7, 6, 'plains', ['road']],
    [8, 5, 'plains', ['farm']], [6, 5, 'plains', ['farm']], [6, 6, 'hills', ['mine']], [8, 6, 'forest', []],
  ];
  for (const [c, r, terrain, improvements] of claimed)
    m.hexes[key(c, r)] = { ...m.hexes[key(c, r)], terrain, improvements, status: 'claimed' };
  m.hexes[key(7, 5)].name = 'Greyford';
  Object.assign(m.hexes[key(9, 4)], { terrain: 'hills', special: 'resource', notes: 'Silver seam spotted by the Marshal.' });
  Object.assign(m.hexes[key(5, 3)], { terrain: 'plains', special: 'landmark', name: 'The Weeping Stone' });
  Object.assign(m.hexes[key(10, 7)], { terrain: 'forest', special: 'lair', notes: 'Owlbear den. Not yet cleared.', status: 'explored' });
  return m;
}
