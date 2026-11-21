import { describe, expect, it } from 'vitest';
import { sampleKingdom } from '../state/factory';
import type { Kingdom } from '../state/types';
import { actionsFor, applyOnRoll, runAction } from './eventEffects';
import { computeStats, settlementStats } from './stats';
import { endTurn, kingdomCheck, payConsumption, rollEvents, trackEvent } from './turn';
import eventsData from '../rules/events.json';

const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const EV = eventsData.events as Record<string, { name: string; tags: string; text: string }>;

/** Start a rulebook event as the roll would, with fixed dice. */
function start(k: Kingdom, id: string, rng = seq(0.5)) {
  const e = EV[id];
  const lasts = /continuous/i.test(e.tags) ? 'resolved' : /until the next Event phase/i.test(e.text) ? 'next-event' : 'once';
  const ev = trackEvent(k, { eventId: id, ...e }, lasts, undefined, rng);
  applyOnRoll(k, ev, rng);
  return ev;
}

describe('event effects', () => {
  it('every rulebook event has rules', () => {
    const k = sampleKingdom();
    for (const id of Object.keys(EV)) {
      const ev = start(k, id);
      expect(ev.history.length + actionsFor(k, ev).length, id).toBeGreaterThan(0);
    }
  });

  it('Economic Boom adds exploding d6 BP; Good Weather lasts until the next Event phase', () => {
    const k = sampleKingdom();
    const t = k.treasury;
    start(k, 'economic-boom', seq(0.99, 0.99, 0.2)); // 6, 6, 2 → 14
    expect(k.treasury).toBe(t + 14);
    const eco = computeStats(k).economy;
    start(k, 'good-weather');
    expect(computeStats(k).economy).toBe(eco + 2);
    endTurn(k);
    rollEvents(k, seq(0.99));
    expect(computeStats(k).economy).toBe(eco);
  });

  it('Natural Blessing gives +4 on Stability checks until the next Event phase', () => {
    const k = sampleKingdom();
    const before = kingdomCheck(k, 'stability', 10).total;
    start(k, 'natural-blessing');
    expect(kingdomCheck(k, 'stability', 10).total).toBe(before + 4);
    expect(kingdomCheck(k, 'loyalty', 10).total).toBe(kingdomCheck(sampleKingdom(), 'loyalty', 10).total);
  });

  it('Feud: success ends it with Unrest +1; failure adds 1d6 Unrest and continues', () => {
    const k = sampleKingdom();
    k.unrest = 0;
    const ev = start(k, 'feud');
    runAction(k, ev.id, 'check', [1], 0, 0, seq(0.5)); // natural 1 fails; 1d6 → 4
    expect(k.unrest).toBe(4);
    expect(k.events!.some((e) => e.id === ev.id)).toBe(true);
    runAction(k, ev.id, 'check', [20]);
    expect(k.unrest).toBe(5);
    expect(k.events!.some((e) => e.id === ev.id)).toBe(false);
  });

  it('Plague: penalties come from the buildings in the settlement, and the Stability loss lasts while it does', () => {
    const k = sampleKingdom();
    const stab = computeStats(k).stability;
    const ev = start(k, 'plague');
    runAction(k, ev.id, 'check', [1, 1], 0, 0, seq(0.5));
    expect(computeStats(k).stability).toBe(stab - 4);
    runAction(k, ev.id, 'check', [1, 1], 0, 0, seq(0.5));
    expect(computeStats(k).stability).toBe(stab - 4); // replaced, not stacked
    runAction(k, ev.id, 'check', [20, 20], 0, 0, seq(0.5));
    expect(computeStats(k).stability).toBe(stab - 2); // ends; −2 until next Event phase
    expect(k.events!.some((e) => e.id === ev.id)).toBe(false);
  });

  it('Food Shortage changes the next Upkeep only', () => {
    const k = sampleKingdom();
    const ev = start(k, 'food-shortage');
    runAction(k, ev.id, 'check', [1]);
    const cons = computeStats(k).consumption;
    const t = k.treasury;
    payConsumption(k);
    expect(k.treasury).toBe(t - cons * 2);
    expect(k.nextUpkeep).toBeUndefined();
  });

  it('Vandals damage buildings, which stop giving benefits', () => {
    const k = sampleKingdom();
    const before = computeStats(k);
    const ev = start(k, 'vandals');
    runAction(k, ev.id, 'check', [20, 1], 0, 0, seq(0.1));
    const damaged = k.settlements[0].districts[0].buildings.filter((b) => b.damaged);
    expect(damaged).toHaveLength(1);
    const after = computeStats(k);
    expect(after.economy + after.loyalty + after.stability).toBeLessThanOrEqual(before.economy + before.loyalty + before.stability);
    expect(settlementStats(k.settlements[0]).lots).toBe(settlementStats(sampleKingdom().settlements[0]).lots);
  });

  it('a failed assassination check takes the leader off duty', () => {
    const k = sampleKingdom();
    const ev = start(k, 'assassination-attempt', seq(0.0));
    const role = ev.state!.role as keyof Kingdom['leaders'];
    runAction(k, ev.id, 'npc', [1]);
    expect(k.leaders[role]!.active).toBe(false);
  });

  it('Building Demand picks a demand; leaving it unmet adds Unrest on later turns', () => {
    const k = sampleKingdom();
    const ev = start(k, 'building-demand');
    expect(String(ev.state!.demand)).toMatch(/^(build|demolish) a /);
    expect(actionsFor(k, ev).map((a) => a.id)).toEqual(['met', 'suppress']);
    endTurn(k);
    const u = k.unrest;
    runAction(k, ev.id, 'wait');
    expect(k.unrest).toBe(u + 1);
    runAction(k, ev.id, 'met');
    expect(k.events!.some((e) => e.id === ev.id)).toBe(false);
  });

  it('the permanent-effects option keeps event changes', () => {
    const k = sampleKingdom();
    k.settings.permanentEventEffects = true;
    const eco = computeStats(k).economy;
    start(k, 'good-weather');
    endTurn(k);
    rollEvents(k, seq(0.99));
    expect(computeStats(k).economy).toBe(eco + 2);
  });
});
