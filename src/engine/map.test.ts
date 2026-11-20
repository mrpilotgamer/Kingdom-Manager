import { describe, expect, it } from 'vitest';
import { blankKingdom, createKingdom, sampleKingdom } from '../state/factory';
import { activateMap, build, checkClaim, checkImprovement, claim, coordLabel, editHex, key, neighborKeys, newMap, unclaim } from './map';
import { computeStats } from './stats';

describe('hex geometry', () => {
  it('finds six neighbors with odd columns shifted down', () => {
    const m = newMap(10, 10);
    expect(neighborKeys(m, key(2, 2)).sort()).toEqual(['1,1', '1,2', '2,1', '2,3', '3,1', '3,2'].sort());
    expect(neighborKeys(m, key(3, 2)).sort()).toEqual(['2,2', '2,3', '3,1', '3,3', '4,2', '4,3'].sort());
    expect(neighborKeys(m, key(0, 0)).filter(Boolean)).toHaveLength(2);
  });
  it('labels columns like a spreadsheet', () => {
    expect(coordLabel(0, 0)).toBe('A1');
    expect(coordLabel(27, 4)).toBe('AB5');
  });
});

describe('example kingdom map', () => {
  it('derives the same Size and improvements as before', () => {
    const k = sampleKingdom();
    expect(k.size).toBe(7);
    expect(k.features).toMatchObject({ farm: 2, road: 3, mine: 1 });
    expect(computeStats(k).consumption).toBe(6);
  });
});

describe('claiming and building', () => {
  it('warns about non-adjacent or unexplored claims and syncs Size', () => {
    const k = createKingdom({ name: 'K', alignment: { law: 'lawful', moral: 'good' }, startingBP: 50, settlementName: 'S', terrain: 'plains' }, 1);
    const m = k.map!;
    expect(k.size).toBe(1);
    expect(checkClaim(k, m, key(0, 0)).warnings.join()).toMatch(/next to one you already hold/);
    expect(checkClaim(k, m, key(7, 4)).warnings.join()).toMatch(/Explore it first/);
    editHex(m, key(7, 4)).status = 'cleared';
    expect(checkClaim(k, m, key(7, 4)).warnings.filter((w) => !w.includes('Ruler'))).toEqual([]);
    const bp = k.treasury;
    claim(k, key(7, 4));
    expect(k.size).toBe(2);
    expect(k.treasury).toBe(bp - 1);
    unclaim(k, key(7, 4), 'abandon');
    expect(k.size).toBe(1);
    expect(k.unrest).toBe(1);
  });

  it('checks terrain for improvements and prices roads by terrain and rivers', () => {
    const k = createKingdom({ name: 'K', alignment: { law: 'lawful', moral: 'good' }, startingBP: 50, settlementName: 'S', terrain: 'hills' }, 2);
    const m = k.map!;
    const home = key(7, 5);
    expect(checkImprovement(k, m, home, 'sawmill').errors.join()).toMatch(/forest or jungle/);
    expect(checkImprovement(k, m, home, 'mine').errors).toEqual([]);
    expect(checkImprovement(k, m, home, 'road').cost).toBe(3);
    editHex(m, home).river = true;
    expect(checkImprovement(k, m, home, 'road').cost).toBe(6);
    expect(checkImprovement(k, m, home, 'farm').warnings.join()).not.toMatch(/river, lake/);
    build(k, home, 'mine');
    expect(checkImprovement(k, m, home, 'quarry').errors.join()).toMatch(/only one Mine/);
    expect(k.features.mine).toBe(1);
    build(k, home, 'watchtower');
    expect(checkImprovement(k, m, home, 'fort').cost).toBe(12);
    build(k, home, 'fort');
    expect(m.hexes[home].improvements).toEqual(['mine', 'fort']);
    expect(k.features).toMatchObject({ fort: 1, watchtower: 0 });
  });

  it('switches an older kingdom from counts to the map', () => {
    const k = blankKingdom('Old', { law: 'neutral', moral: 'good' });
    k.size = 5;
    k.features = { farm: 3 };
    activateMap(k);
    expect(k.size).toBe(0);
    expect(k.features.farm).toBe(0);
  });
});

describe('example river', () => {
  it('is one connected chain of hexes', () => {
    const k = sampleKingdom();
    const m = k.map!;
    const river = Object.keys(m.hexes).filter((hk) => m.hexes[hk].river);
    const seen = new Set([river[0]]);
    const queue = [river[0]];
    while (queue.length) {
      for (const n of neighborKeys(m, queue.pop()!)) if (n && m.hexes[n]?.river && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
    expect(seen.size).toBe(river.length);
  });
});
