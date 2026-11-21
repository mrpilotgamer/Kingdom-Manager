import { describe, expect, it } from 'vitest';
import { createKingdom, sampleKingdom } from '../state/factory';
import { awardRenown, placeBuilding } from './actions';
import { applyOnRoll, runAction } from './eventEffects';
import { computeStats, kingdomSettlementModifiers, renownDue, settlementModifiers } from './stats';
import { trackEvent } from './turn';
import eventsData from '../rules/events.json';

const EV = eventsData.events as Record<string, { name: string; tags: string; text: string }>;
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('settlement modifiers', () => {
  it('add up buildings, government, and settlement size', () => {
    const k = sampleKingdom();
    const s = k.settlements[0];
    // Inn (Society +1), Tavern (Corruption +1), Mill and Shop (Productivity +1 each), Town Hall (Law +1); 12 lots = Large town (+0)
    expect(settlementModifiers(k, s).values).toEqual({ corruption: 1, crime: 0, law: 1, lore: 0, productivity: 2, society: 1 });
    k.government = 'overlord';
    expect(settlementModifiers(k, s).values).toMatchObject({ corruption: 2, crime: -1, law: 2, society: 0 });
    const tiny = createKingdom({ name: 'T', alignment: { law: 'lawful', moral: 'good' }, startingBP: 50, settlementName: 'Hut', terrain: 'plains' }, 1);
    placeBuilding(tiny, tiny.settlements[0].id, tiny.settlements[0].districts[0].id, 'shrine', [[0, 0]]);
    expect(settlementModifiers(tiny, tiny.settlements[0]).values.law).toBe(-4); // a 1-lot village
    tiny.settings.settlementSizeMods = false;
    expect(settlementModifiers(tiny, tiny.settlements[0]).values.law).toBe(0);
  });

  it('kingdom-wide values add alignment', () => {
    const k = sampleKingdom(); // lawful good
    expect(kingdomSettlementModifiers(k).values).toMatchObject({ law: 1, society: 1, lore: 0 });
  });

  it('Lore + Society raise Fame and Corruption + Crime raise Infamy, per 10 points', () => {
    const k = sampleKingdom();
    expect(computeStats(k).fame).toBe(1);
    k.settlementAdjustments = [{ id: 'a', label: 'Scholars', settlementId: k.settlements[0].id, mods: { lore: 12 } }];
    expect(computeStats(k).fame).toBe(2); // 12 Lore + 1 Society = 13 → +1
    k.settlementAdjustments.push({ id: 'b', label: 'Thieves', settlementId: k.settlements[0].id, mods: { crime: 9 } });
    expect(computeStats(k).infamy).toBe(1); // 1 Corruption + 9 Crime
  });

  it('Size milestones offer +1 Fame or Infamy', () => {
    const k = sampleKingdom();
    expect(renownDue(k)).toEqual([]);
    k.size = 30;
    expect(renownDue(k)).toEqual([11, 26]);
    awardRenown(k, 11, 'infamy');
    expect(renownDue(k)).toEqual([26]);
    expect(k.infamy).toBe(1);
  });
});

describe('events change settlement modifiers and Infamy', () => {
  it('a failed Feud check raises Corruption in that settlement while the feud lasts', () => {
    const k = sampleKingdom();
    const ev = trackEvent(k, { eventId: 'feud', ...EV.feud }, 'resolved', 'Greyford');
    runAction(k, ev.id, 'check', [1], 0, 0, seq(0.5));
    expect(settlementModifiers(k, k.settlements[0]).values.corruption).toBe(2);
    runAction(k, ev.id, 'check', [1], 0, 0, seq(0.5));
    expect(settlementModifiers(k, k.settlements[0]).values.corruption).toBe(2); // replaced, not stacked
    runAction(k, ev.id, 'check', [20]);
    expect(settlementModifiers(k, k.settlements[0]).values.corruption).toBe(1);
  });

  it('Public Scandal adds Infamy; Sensational Crime checks use Law minus Crime', () => {
    const k = sampleKingdom();
    const ps = trackEvent(k, { eventId: 'public-scandal', ...EV['public-scandal'] }, 'once');
    applyOnRoll(k, ps);
    expect(computeStats(k).infamy).toBe(1);
    const sc = trackEvent(k, { eventId: 'sensational-crime', ...EV['sensational-crime'] }, 'resolved', 'Greyford');
    const base = 10 + computeStats(k).stability - k.unrest;
    const r = runAction(k, sc.id, 'check', [10, 10])!;
    expect(r[0].total).toBe(base + 1); // Law 1 − Crime 0
  });
});
