import { newDistrict } from '../engine/actions';
import type { Alignment, Attr, Terrain } from '../rules/kingdom';
import type { Kingdom, Lot, PlacedBuilding } from './types';
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
export function createKingdom(input: NewKingdomInput, prepCost: number): Kingdom {
  const k = blankKingdom(input.name, input.alignment);
  k.treasury = input.startingBP - 1 - prepCost;
  k.settlements.push({ id: uid(), name: input.settlementName, terrain: input.terrain, districts: [newDistrict('District 1')] });
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
  k.settlements = [{ id: uid(), name: 'Greyford', terrain: 'plains', districts: [d] }];
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
