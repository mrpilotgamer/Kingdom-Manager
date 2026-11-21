import { describe, expect, it } from 'vitest';
import { sampleKingdom } from '../state/factory';
import { fromPreset, presetByName, recruit } from './armies';
import { armiesAt, hexArea, hexDistanceKeys, hexLine, marchArmy, placeArmy, travel } from './armyMap';
import { editHex, key, resizeSide } from './map';

describe('armies on the map', () => {
  it('draws straight hex lines as long as the distance', () => {
    const m = sampleKingdom().map!;
    for (const [a, b] of [['0,0', '5,3'], ['7,5', '2,9'], ['3,3', '3,8'], ['10,1', '4,1']]) {
      const line = hexLine(m, a, b);
      expect(line).toHaveLength(hexDistanceKeys(m, a, b));
      expect(line[line.length - 1]).toBe(b);
    }
  });

  it('marches at half speed through difficult terrain unless there is a road', () => {
    const k = sampleKingdom();
    const m = k.map!;
    const path = hexLine(m, key(0, 0), key(4, 0));
    for (const hk of path) { const h = editHex(m, hk); h.terrain = 'forest'; h.improvements = []; }
    const a = k.armies![0];
    a.speed = 2;
    expect(travel(k, a, key(0, 0), key(4, 0))).toMatchObject({ hexes: 4, difficult: 4, days: 4, miles: 48 });
    editHex(m, path[1]).improvements.push('road');
    expect(travel(k, a, key(0, 0), key(4, 0)).difficult).toBe(3);
  });

  it('any number of armies can share a hex, and they move with the map when it grows left', () => {
    const k = sampleKingdom();
    const hk = key(7, 5);
    for (let i = 0; i < 5; i++) {
      const a = fromPreset(presetByName('Militia')!, 'kingdom');
      recruit(k, a);
      placeArmy(k, a.id, hk);
    }
    expect(armiesAt(k, hk)).toHaveLength(6);
    resizeSide(k, 'left', 2);
    expect(armiesAt(k, key(9, 5))).toHaveLength(6);
    marchArmy(k, k.armies![0].id, key(9, 7));
    expect(armiesAt(k, key(9, 7)).map((a) => a.name)).toEqual(['Greyford Guard']);
  });

  it('a 12-mile hex covers about 125 square miles', () => {
    expect(hexArea(12)).toBe(125);
  });
});
