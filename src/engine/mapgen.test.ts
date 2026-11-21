import { describe, expect, it } from 'vitest';
import { createKingdom, sampleKingdom } from '../state/factory';
import { getHex, key, neighborKeys, parse, regenerate, resizeSide, shrinkBlocked } from './map';
import { DEFAULT_GEN, generateMap, terrainAt } from './mapgen';

const opts = (seed: string, extra = {}) => ({ ...DEFAULT_GEN, seed, ...extra });

describe('map generator', () => {
  it('is deterministic per seed', () => {
    const a = generateMap(opts('ember-ford-42'), 16, 12);
    const b = generateMap(opts('ember-ford-42'), 16, 12);
    const c = generateMap(opts('frost-glen-17'), 16, 12);
    expect(a).toEqual(b);
    expect(a.map.hexes).not.toEqual(c.map.hexes);
  });

  it('uses more water for coastlines than inland maps, and fits the climate', () => {
    const share = (w: 'inland' | 'lakes' | 'coast', seed: string) => {
      const g = generateMap(opts(seed, { water: w }), 24, 18);
      return Object.values(g.map.hexes).filter((h) => h.terrain === 'water').length / (24 * 18);
    };
    for (const seed of ['a', 'b', 'c']) {
      expect(share('coast', seed)).toBeGreaterThan(share('inland', seed));
    }
    const arid = generateMap(opts('dune', { climate: 'arid' }), 20, 15);
    const cold = generateMap(opts('dune', { climate: 'cold' }), 20, 15);
    const count = (g: typeof arid, t: string) => Object.values(g.map.hexes).filter((h) => h.terrain === t).length;
    expect(count(arid, 'desert')).toBeGreaterThan(0);
    expect(count(cold, 'desert') + count(cold, 'jungle')).toBe(0);
  });

  it('places a buildable capital, connected rivers, and spaced-out special sites', () => {
    for (const seed of ['one', 'two', 'three', 'four', 'five']) {
      const g = generateMap(opts(seed), 16, 12);
      const m = g.map;
      expect(['plains', 'hills']).toContain(m.hexes[g.capital].terrain);
      expect(m.hexes[g.capital].status).toBe('cleared');
      const specials = Object.keys(m.hexes).filter((hk) => m.hexes[hk].special);
      expect(specials.length).toBeGreaterThan(2);
      expect(specials.every((hk) => m.hexes[hk].terrain !== 'water')).toBe(true);
      // every river hex touches another river hex or water
      for (const hk of Object.keys(m.hexes).filter((x) => m.hexes[x].river)) {
        const ok = neighborKeys(m, hk).some((n) => n && (m.hexes[n].river || m.hexes[n].terrain === 'water'));
        expect(ok).toBe(true);
      }
    }
  });
});

describe('resizing from any side', () => {
  it('adding columns on the left keeps the grid shape and settlement positions', () => {
    const k = sampleKingdom();
    const m = k.map!;
    const before = neighborKeys(m, key(7, 5)).map((n) => n && getHex(m, n));
    resizeSide(k, 'left', 1);
    expect(m.cols).toBe(17);
    expect(k.settlements[0].hexKey).toBe(key(8, 5));
    const after = neighborKeys(m, key(8, 5)).map((n) => n && getHex(m, n));
    expect(after).toEqual(before);
    expect(k.size).toBe(7);
    resizeSide(k, 'top', 3);
    expect(k.settlements[0].hexKey).toBe(key(8, 8));
    expect(m.rows).toBe(15);
  });

  it('refuses to cut off claimed hexes, and new hexes continue generated terrain', () => {
    const gen = generateMap(opts('ash-mere-11'), 12, 10);
    const k = createKingdom({ name: 'K', alignment: { law: 'lawful', moral: 'good' }, startingBP: 50, settlementName: 'S', terrain: 'plains' }, 1, gen);
    const [cc] = parse(gen.capital);
    expect(shrinkBlocked(k.map!, 'left', cc + 1)).toBe(true);
    resizeSide(k, 'left', -(cc + 1));
    expect(k.map!.cols).toBe(12);
    resizeSide(k, 'right', 2);
    const m = k.map!;
    for (let r = 0; r < m.rows; r++) expect(m.hexes[key(12, r)].terrain).toBe(terrainAt(m.gen!, 12 + (m.originC ?? 0), r));
  });

  it('regenerating keeps claimed hexes', () => {
    const k = sampleKingdom();
    const capital = structuredClone(k.map!.hexes[key(7, 5)]);
    regenerate(k, opts('new-seed-1'));
    expect(k.map!.hexes[key(7, 5)]).toEqual(capital);
    expect(k.size).toBe(7);
    expect(k.map!.gen?.seed).toBe('new-seed-1');
  });
});
