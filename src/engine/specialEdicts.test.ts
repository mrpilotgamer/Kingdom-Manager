import { describe, expect, it } from 'vitest';
import { sampleKingdom } from '../state/factory';
import type { Kingdom } from '../state/types';
import {
  alignmentDifference, blankForeign, diplomacyDC, diplomaticEdict, resolveTrade, startExpedition, startTrade, subjugationCheck,
  tradeAllowed, tradeDC, vassalEdict,
} from './specialEdicts';
import { computeStats, deityBonus, kingdomSettlementModifiers } from './stats';
import { endTurn } from './turn';

const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
function withNeighbor(k: Kingdom) {
  const f = { ...blankForeign(), name: 'Brevoy', alignment: 'LN', size: 40, economy: 30, stability: 20 };
  k.foreign = [f];
  return f;
}

describe('diplomacy', () => {
  it('alignment difference: +5 per step, +15 for two steps, per axis', () => {
    expect(alignmentDifference('LG', 'LG')).toBe(0);
    expect(alignmentDifference('LG', 'LN')).toBe(5);
    expect(alignmentDifference('LG', 'CE')).toBe(30);
    expect(alignmentDifference('N', 'CG')).toBe(10);
  });

  it('works out the edict DC', () => {
    const k = sampleKingdom(); // LG, Size 7, Fame 1, Infamy 0
    const f = withNeighbor(k);
    // 10 + 0 + 40/5 + 7/5 + 5 (LG vs LN) + 10 (indifferent) − 1 Fame − 2 bribes
    expect(diplomacyDC(k, f, { bribes: 2 }).dc).toBe(10 + 8 + 1 + 5 + 10 - 1 - 2);
    expect(diplomacyDC(k, f, { intimidate: true }).dc).toBe(10 + 8 + 1 + 5 + 10);
  });

  it('an embassy, then a treaty that raises Economy by 10% of theirs', () => {
    const k = sampleKingdom();
    const f = withNeighbor(k);
    const eco = computeStats(k).economy;
    diplomaticEdict(k, { foreignId: f.id, goal: 'embassy', checks: [40] }, seq(0.5));
    expect(f.relation).toBe('embassy');
    expect(k.fame).toBe(2); // beat the DC by 5+
    expect(k.turnState.done['edict.special']).toMatch(/embassy established/);
    endTurn(k);
    diplomaticEdict(k, { foreignId: f.id, goal: 'treaty', checks: [40, 5, 40], advantage: 'us', balanced: true }, seq(0.5));
    expect(f.relation).toBe('treaty');
    expect(computeStats(k).economy).toBe(eco + 3);
    f.embassyBuilding = 'noble-villa';
    expect(computeStats(k).economy).toBe(eco + 3 + 3);
    expect(kingdomSettlementModifiers(k).values.society).toBe(1 + 2);
  });

  it('a failed embassy attempt can be costly', () => {
    const k = sampleKingdom();
    const f = withNeighbor(k);
    diplomaticEdict(k, { foreignId: f.id, goal: 'embassy', checks: [1] }, seq(0.5));
    expect(f.relation).toBe('none');
    expect(k.fame).toBe(0);
    expect(f.attitude).toBe('unfriendly');
    expect(f.cooldown?.embassy).toBe(k.turn + 12);
  });
});

describe('trade, exploration, vassals', () => {
  it('trade DC uses the settlement’s Corruption and Productivity; success lasts a year', () => {
    const k = sampleKingdom();
    const s = k.settlements[0];
    const { dc, rm, lm } = tradeDC(k, s.id, 4);
    expect(rm).toBe(0);
    expect(lm).toBe(3); // Size 7 − TRL 4
    expect(dc).toBe(computeStats(k).controlDC + 1 + 0 + 3 - 2); // Corruption 1, Productivity 2
    expect(tradeAllowed(k, s.id, 'goods').ok).toBe(false); // no Guildhall
    const t = k.treasury;
    const r = startTrade(k, { partner: 'Restov', settlementId: s.id, type: 'raw', trl: 4, invested: 5, travelTurns: 0 });
    expect(k.treasury).toBe(t - 5);
    resolveTrade(k, r.id, [20, 20, 20], seq(0.5));
    expect(r.status).toBe('active');
    expect(r.expiresTurn).toBe(k.turn + 12);
    expect(k.modifiers.some((m) => m.id === `trade-${r.id}` && m.economy === 2)).toBe(true);
    expect(tradeAllowed(k, s.id, 'raw').busy).toBe(true);
  });

  it('expeditions cost 1d4 BP per month up front', () => {
    const k = sampleKingdom();
    const t = k.treasury;
    const e = startExpedition(k, 3, 'south hills', seq(0.99));
    expect(e.cost).toBe(12);
    expect(k.treasury).toBe(t - 12);
    expect(e.returnsTurn).toBe(k.turn + 3);
  });

  it('a subjugated vassal needs three good Loyalty checks in a row', () => {
    const k = sampleKingdom();
    const f = vassalEdict(k, { name: 'Varnhold', viceroy: 'Maegar', alignment: 'CN', size: 10, grant: 2, mode: 'subjugated', relation: 'alliance', terms: 'ours' }, seq(0.5));
    expect(f.relation).toBe('embassy'); // subjugation starts with an embassy only
    expect(k.leaders.viceroy?.name).toBe('Maegar');
    subjugationCheck(k, f.id, 20);
    subjugationCheck(k, f.id, 20);
    expect(f.vassal!.settled).toBe(false);
    subjugationCheck(k, f.id, 20);
    expect(f.vassal!.settled).toBe(true);
  });
});

describe('optional rules', () => {
  it('holy sites follow their god’s alignment', () => {
    expect(deityBonus('temple', { alignment: 'LG' })).toEqual({ economy: 2, loyalty: 2, stability: 0 });
    expect(deityBonus('cathedral', { alignment: 'N' })).toEqual({ economy: 0, loyalty: 0, stability: 8 });
    expect(deityBonus('shrine', { alignment: 'CE', attr: 'economy' })).toEqual({ economy: 1, loyalty: 0, stability: 0 });
    const k = sampleKingdom();
    const before = computeStats(k);
    k.settings.deities = true;
    k.settlements[0].districts[0].buildings.find((b) => b.type === 'shrine')!.deity = { alignment: 'LN', attr: 'stability' };
    const after = computeStats(k);
    expect(after.loyalty).toBe(before.loyalty - 1);
    expect(after.stability).toBe(before.stability + 1);
  });

  it('leaders gain +1 per 5 skill ranks', () => {
    const k = sampleKingdom();
    const eco = computeStats(k).economy;
    k.leaders.treasurer!.skillRanks = 10;
    expect(computeStats(k).economy).toBe(eco);
    k.settings.roleSkills = true;
    expect(computeStats(k).economy).toBe(eco + 2);
  });
});
