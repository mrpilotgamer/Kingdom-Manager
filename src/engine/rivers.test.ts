import { describe, expect, it } from 'vitest';
import { sampleKingdom } from '../state/factory';
import type { HexMap } from '../state/types';
import { attachRiver, drawRiverPath, editHex, eraseRiver, key, neighborKeys, newMap, regenerate, riverLinks } from './map';
import { DEFAULT_GEN, generateMap } from './mapgen';

/** Every river edge leads to a river that links back, to water, or off the map; and no three river hexes link in a loop. */
function checkCourse(m: HexMap, links = riverLinks(m)) {
  for (const [hk, edges] of links) {
    const nb = neighborKeys(m, hk);
    for (const i of edges) {
      const n = nb[i];
      if (!n) continue; // flows off the map
      const nh = m.hexes[n];
      if (nh?.terrain === 'water') continue;
      expect(links.get(n), `${hk} → ${n}`).toContain((i + 3) % 6);
    }
    const linked = edges.map((i) => nb[i]).filter((n): n is string => !!n && links.has(n));
    for (const a of linked) for (const b of linked) {
      if (a < b) expect(links.get(a)!.map((i) => neighborKeys(m, a)[i]), `triangle at ${hk}`).not.toContain(b);
    }
  }
}

describe('river courses', () => {
  it('generated rivers are consistent chains without triangles', () => {
    for (const seed of ['ember-ford-42', 'frost-glen-17', 'ash-mere-11', 'raven-reach-63', 'moss-vale-20']) {
      for (const water of ['inland', 'lakes', 'coast'] as const) {
        const { map } = generateMap({ ...DEFAULT_GEN, seed, water }, 24, 18);
        checkCourse(map);
        for (const h of Object.values(map.hexes)) if (h.river) expect(h.riverEdges?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('works out a single course for older maps that only marked river hexes', () => {
    const m = newMap(10, 10);
    // A bend where the first and third hexes also touch: drawing every neighbor link would make a triangle.
    for (const hk of ['3,2', '3,3', '4,3', '4,4', '4,5']) editHex(m, hk).river = true;
    const links = riverLinks(m);
    checkCourse(m, links);
    const ends = [...links.values()].filter((e) => e.length === 1).length;
    expect(ends).toBe(2);
  });

  it('drawing, attaching and erasing keep both sides of each edge in sync', () => {
    const m = newMap(10, 10);
    drawRiverPath(m, ['1,1', '1,2', '2,2', '2,3', '3,3']);
    checkCourse(m);
    expect(m.hexes['1,2'].riverEdges).toHaveLength(2);
    attachRiver(m, '4,3');
    checkCourse(m);
    expect(m.hexes['3,3'].riverEdges).toHaveLength(2);
    eraseRiver(m, '2,2');
    checkCourse(m);
    expect(m.hexes['1,2'].riverEdges).toHaveLength(1);
  });

  it('regenerating around claimed hexes leaves no dangling river ends', () => {
    for (const seed of ['frost-glen-17', 'raven-reach-63', 'amber-dale-50']) {
      const k = sampleKingdom();
      regenerate(k, { ...DEFAULT_GEN, seed, ruggedness: 'rugged' });
      checkCourse(k.map!);
      for (const [hk, edges] of riverLinks(k.map!)) {
        for (const i of edges) {
          const n = neighborKeys(k.map!, hk)[i];
          if (n) expect(k.map!.hexes[n].river || k.map!.hexes[n].terrain === 'water', `${hk} edge ${i}`).toBe(true);
        }
      }
    }
  });

  it('the example kingdom river is one stored course', () => {
    const m = sampleKingdom().map!;
    checkCourse(m);
    expect(m.hexes[key(7, 5)].riverEdges).toHaveLength(2);
  });
});
