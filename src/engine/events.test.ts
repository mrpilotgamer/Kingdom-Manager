import { describe, expect, it } from 'vitest';
import { sampleKingdom } from '../state/factory';
import { continueEvent, endTurn, eventCheck, pendingEvents, resolveEvent, rollEvents, trackEvent } from './turn';

const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('ongoing events', () => {
  it('a rolled continuous event is remembered and comes back each turn until resolved', () => {
    const k = sampleKingdom();
    k.eventLastTurn = false;
    // d% 1 → event happens; 0.80 → 81 dangerous settlement event; 0.38 → 39 Feud (settlement, continuous)
    rollEvents(k, seq(0.0, 0.80, 0.38, 0.0));
    expect(k.events).toHaveLength(1);
    expect(k.events![0]).toMatchObject({ name: 'Feud', lasts: 'resolved', location: 'Greyford', startedTurn: 5 });
    expect(pendingEvents(k)).toHaveLength(0); // dealt with the turn it began

    endTurn(k);
    expect(pendingEvents(k).map((e) => e.name)).toEqual(['Feud']);
    eventCheck(k, k.events![0].id, 'loyalty', 2);
    expect(pendingEvents(k)).toHaveLength(0);
    expect(k.events![0].history.slice(-1)[0].text).toMatch(/Loyalty check .* failure/);

    endTurn(k);
    continueEvent(k, k.events![0].id);
    endTurn(k);
    expect(pendingEvents(k)).toHaveLength(1);
    resolveEvent(k, k.events![0].id);
    expect(k.events).toHaveLength(0);
    expect(k.log[0].text).toMatch(/Feud \(Greyford\) resolved after 4 turns/);
  });

  it('"until the next Event phase" events end at the next event roll', () => {
    const k = sampleKingdom();
    // 0.0 → event; 0.10 → beneficial kingdom; 0.60 → 61 Good Weather
    rollEvents(k, seq(0.0, 0.10, 0.60));
    expect(k.events!.map((e) => [e.name, e.lasts])).toEqual([['Good Weather', 'next-event']]);
    endTurn(k);
    rollEvents(k, seq(0.99));
    expect(k.events).toHaveLength(0);
  });

  it('campaign events can be added by hand', () => {
    const k = sampleKingdom();
    trackEvent(k, { name: 'Troll raids', tags: 'Hex, Continuous', text: 'Trolls from the Hooktongue.' }, 'resolved', 'Hex J7');
    endTurn(k);
    expect(pendingEvents(k)[0]).toMatchObject({ name: 'Troll raids', location: 'Hex J7' });
  });
});
