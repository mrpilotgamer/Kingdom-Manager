import { describe, expect, it } from 'vitest';
import { sampleKingdom } from '../state/factory';
import { emptySlot, fillSlots, itemsForSale, rollForSlot, rollItem, sellToNpc, settlementSlots, slotKey, slotsFor, unexpectedFind } from './magicItems';
import { computeStats, settlementStats } from './stats';
import { endTurn, rollEvents } from './turn';
import { BUILDINGS } from '../rules/buildings';
import { NAMED } from '../rules/magicItemTables';

const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('magic item slots', () => {
  it('reads every building’s Magic Items line', () => {
    expect(slotsFor('academy')).toEqual([
      ...Array(3).fill({ grade: 'minor', kinds: ['scroll', 'wondrous'] }),
      ...Array(2).fill({ grade: 'medium', kinds: ['scroll', 'wondrous'] }),
    ]);
    expect(slotsFor('military-academy')).toEqual([{ grade: 'minor', kinds: ['armor', 'shield', 'weapon'] }, { grade: 'medium', kinds: ['armor', 'shield', 'weapon'] }]);
    expect(slotsFor('temple')).toEqual([{ grade: 'minor', kinds: ['any'] }, { grade: 'minor', kinds: ['any'] }]);
    expect(slotsFor('magic-shop')).toHaveLength(7);
    for (const b of BUILDINGS.filter((x) => x.magicItems)) expect(slotsFor(b.id).length, b.id).toBeGreaterThan(0);
  });

  it('prices potions, scrolls, and wands by the Core Rulebook formulas', () => {
    for (let i = 0; i < 50; i++) {
      const p = rollItem('potion', 'minor', 1000, Math.random)!;
      expect([25, 50, 300]).toContain(p.price);
      const w = rollItem('wand', 'medium', 20000, Math.random)!;
      expect([750, 4500, 11250]).toContain(w.price);
    }
    expect(rollItem('wand', 'major', 1000)).toBeNull();
    expect(rollItem('weapon', 'minor', 2315)!.name).toMatch(/^\+1 /);
  });

  it('rolls only Core Rulebook named items when asked', () => {
    for (let i = 0; i < 100; i++) {
      const it = rollItem('wondrous', 'minor', 5000, Math.random, true);
      expect(it).not.toBeNull();
      expect(NAMED.wondrous.find((x) => x.n === it!.name)?.c).toBe(1);
    }
  });

  it('never stocks an item pricier than the base value', () => {
    for (let i = 0; i < 200; i++) {
      const it = rollForSlot({ grade: 'minor', kinds: ['any'] }, 500, Math.random);
      if (it) expect(it.price).toBeLessThanOrEqual(500);
    }
  });

  it('fills one open slot per district on 51+, leaving others open', () => {
    const k = sampleKingdom();
    const s = k.settlements[0];
    expect(settlementSlots(s).length).toBe(1); // the Shrine
    fillSlots(k, seq(0.3)); // d% 31: nothing
    expect(itemsForSale(s)).toHaveLength(0);
    fillSlots(k, seq(0.9, 0.0, 0.5, 0.0, 0.0));
    const sold = itemsForSale(s);
    expect(sold).toHaveLength(1);
    expect(sold[0].item!.price).toBeLessThanOrEqual(settlementStats(s).baseValue);
    expect(k.turnState.done['upkeep.items']).toMatch(/for sale at the Shrine/);
  });

  it('buying with BP for personal use counts as a withdrawal', () => {
    const k = sampleKingdom();
    const s = k.settlements[0];
    fillSlots(k, seq(0.9, 0.0, 0.99, 0.0, 0.0));
    const ref = itemsForSale(s)[0];
    const t = k.treasury, u = k.unrest;
    emptySlot(k, s.id, slotKey(ref), 'personal');
    const bp = Math.ceil(ref.item!.price / 2000);
    expect(k.treasury).toBe(t - bp);
    expect(k.unrest).toBe(u + bp);
    expect(itemsForSale(s)).toHaveLength(0);
  });

  it('selling to NPCs costs 1 Economy for each check after the first in a turn', () => {
    const k = sampleKingdom();
    const s = k.settlements[0];
    s.districts[0].buildings.push({ id: 'ct', type: 'casters-tower', lots: [[0, 0]] });
    for (const r of settlementSlots(s)) { if (r.building) { r.building.items ??= []; r.building.items[r.index] = { id: `i${r.index}${r.building.id}`, name: 'Thing', price: 50, kind: 'potion', grade: 'minor' }; } }
    const eco = computeStats(k).economy;
    const refs = itemsForSale(s).map(slotKey);
    sellToNpc(k, s.id, refs[0], 20);
    expect(computeStats(k).economy).toBe(eco);
    sellToNpc(k, s.id, refs[1], 20);
    expect(computeStats(k).economy).toBe(eco - 1);
    endTurn(k);
    expect(computeStats(k).economy).toBe(eco);
  });

  it('an Unexpected Find slot fills at the next Upkeep and goes away at the next Event phase', () => {
    const k = sampleKingdom();
    const s = k.settlements[0];
    s.districts[0].buildings = s.districts[0].buildings.filter((b) => b.type !== 'shrine');
    unexpectedFind(k, s, seq(0.1));
    endTurn(k);
    fillSlots(k, seq(0.1, 0.0, 0.5));
    expect(itemsForSale(s).length).toBe(1);
    rollEvents(k, seq(0.99));
    expect(settlementSlots(s)).toHaveLength(0);
  });
});
