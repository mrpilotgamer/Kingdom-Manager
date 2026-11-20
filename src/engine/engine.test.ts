import { describe, expect, it } from 'vitest';
import { blankKingdom, createKingdom, sampleKingdom } from '../state/factory';
import type { Kingdom } from '../state/types';
import { claimHex, newDistrict, placeBuilding, setWall } from './actions';
import { buildCost } from './costs';
import { checkPlacement, districtIssues, footprint } from './grid';
import { computeStats } from './stats';
import { collectTaxes, kingdomCheck, payConsumption, resolveStability, rollEventType } from './turn';
import { building } from '../rules/buildings';

function withSettlement(): Kingdom {
  const k = blankKingdom('Test', { law: 'neutral', moral: 'neutral' });
  k.treasury = 100;
  k.settlements.push({ id: 's1', name: 'Town', terrain: 'plains', districts: [{ ...newDistrict('D1'), id: 'd1' }] });
  return k;
}
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('stats', () => {
  it('true neutral gets +4 Stability; empty roles give vacancy penalties', () => {
    const k = blankKingdom('N', { law: 'neutral', moral: 'neutral' });
    const s = computeStats(k);
    // Vacant: councilor -2 loy, general -4 loy, diplomat -2 stab, high priest -2/-2, magister/marshal/spymaster/treasurer -4 eco each, warden -2/-2
    expect(s.economy).toBe(-16);
    expect(s.loyalty).toBe(-2 - 4 - 2 - 2 - 1 + 1); // holiday "none" −1, tax "none" +1 (no Treasurer)
    expect(s.stability).toBe(4 - 2 - 2 - 2 - 1); // promotion none −1
    expect(s.vacancyUnrest).toBe(4 + 1 + 1 + 1);
    expect(s.controlDC).toBe(21);
  });

  it('matches the example kingdom numbers', () => {
    const k = sampleKingdom();
    const s = computeStats(k);
    expect(s.controlDC).toBe(20 + 7 + 1);
    // Consumption: size 7 + 1 district + holiday 1 + promotion 1 − 2 farms×2
    expect(s.consumption).toBe(7 + 1 + 1 + 1 - 4);
    expect(s.incomeBonus).toBe(1);
    expect(s.vacancies).toEqual([]);
  });

  it('ruler picks more attributes as the kingdom grows', () => {
    const k = sampleKingdom();
    k.leaders.ruler!.attrs = ['loyalty', 'economy', 'stability'];
    const small = computeStats(k);
    k.size = 30;
    const mid = computeStats(k);
    expect(mid.economy - small.economy).toBe(4);
    expect(mid.stability - small.stability).toBe(0);
  });
});

describe('district grid', () => {
  it('requires a distinct adjacent House for each dependent building', () => {
    const k = withSettlement();
    const s = k.settlements[0], d = s.districts[0];
    placeBuilding(k, 's1', 'd1', 'house', [[0, 0]]);
    placeBuilding(k, 's1', 'd1', 'inn', [[0, 1]]);
    expect(districtIssues(d, false)).toEqual([]);
    const check = checkPlacement(s, d, building('tavern'), [[1, 0]], false);
    expect(check.warnings.join()).toMatch(/Tavern needs 1 more adjacent House/);
  });

  it('finds a valid assignment when one exists (matching, not greedy)', () => {
    const k = withSettlement();
    const d = k.settlements[0].districts[0];
    // Inn at (0,1) touches houses (0,0) and (0,2); Shop at (1,0) touches only (0,0).
    placeBuilding(k, 's1', 'd1', 'house', [[0, 0]]);
    placeBuilding(k, 's1', 'd1', 'house', [[0, 2]]);
    placeBuilding(k, 's1', 'd1', 'inn', [[0, 1]]);
    placeBuilding(k, 's1', 'd1', 'shop', [[1, 0]]);
    expect(districtIssues(d, false)).toEqual([]);
  });

  it('blocks overlaps and second Castles, warns about water and bad neighbors', () => {
    const k = withSettlement();
    const s = k.settlements[0], d = s.districts[0];
    placeBuilding(k, 's1', 'd1', 'castle', footprint(4, [0, 0]));
    expect(checkPlacement(s, d, building('house'), [[1, 1]], false).errors).toHaveLength(1);
    expect(checkPlacement(s, d, building('castle'), footprint(4, [3, 3]), false).errors.join()).toMatch(/Only 1/);
    expect(checkPlacement(s, d, building('mill'), [[3, 3]], false).warnings.join()).toMatch(/water/);
    placeBuilding(k, 's1', 'd1', 'house', [[4, 4]]);
    expect(checkPlacement(s, d, building('tannery'), [[4, 5]], false).warnings.join()).toMatch(/cannot be adjacent/);
  });
});

describe('costs and limits', () => {
  it('a discount halves only the first building of that type', () => {
    const k = withSettlement();
    placeBuilding(k, 's1', 'd1', 'house', [[0, 0]]);
    placeBuilding(k, 's1', 'd1', 'house', [[0, 2]]);
    placeBuilding(k, 's1', 'd1', 'market', [[1, 0], [1, 1]]);
    const s = k.settlements[0];
    expect(buildCost(s, 'inn').cost).toBe(5);
    placeBuilding(k, 's1', 'd1', 'inn', [[0, 1]]);
    expect(buildCost(s, 'inn').cost).toBe(10);
  });

  it('first House each turn is free of the building limit; City Wall Unrest once per settlement', () => {
    const k = withSettlement();
    k.unrest = 5;
    placeBuilding(k, 's1', 'd1', 'house', [[0, 0]]);
    placeBuilding(k, 's1', 'd1', 'house', [[0, 1]]);
    expect(k.turnState.buildings).toBe(1);
    expect(k.unrest).toBe(3);
    setWall(k, 's1', 'd1', 'n', 'city-wall');
    setWall(k, 's1', 'd1', 'w', 'city-wall');
    expect(k.unrest).toBe(1);
    claimHex(k);
    expect(k.size).toBe(2);
  });

  it('new kingdoms pay for the first hex and site preparation', () => {
    const k = createKingdom({ name: 'X', alignment: { law: 'lawful', moral: 'good' }, startingBP: 50, settlementName: 'Y', terrain: 'hills' }, 2);
    expect(k.treasury).toBe(47);
  });
});

describe('turn', () => {
  it('resolves the Upkeep and Income phases like the rulebook example', () => {
    const k = sampleKingdom();
    const st = computeStats(k);
    const c = kingdomCheck(k, 'stability', 20);
    expect(c.success).toBe(true);
    expect(kingdomCheck(k, 'stability', 1).success).toBe(false);
    resolveStability(k, 20);
    expect(k.unrest).toBe(0);
    const before = k.treasury;
    payConsumption(k);
    expect(k.treasury).toBe(before - st.consumption);
    const t = k.treasury;
    const tax = collectTaxes(k, 15)!;
    expect(k.treasury).toBe(t + (tax.success ? Math.floor(tax.total / 3) : 0) + 1);
  });

  it('fails by 5+ adds 1d4 Unrest', () => {
    const k = blankKingdom('Low', { law: 'chaotic', moral: 'evil' });
    resolveStability(k, 2, seq(0.99));
    expect(k.unrest).toBe(4);
  });

  it('rolls events, including roll-again results', () => {
    // 0.98 → d% 99 (monster attack, roll again), then 0.10 → 11 (beneficial kingdom), then 0.20 → 21 (economic boom)
    const ev = rollEventType(seq(0.98, 0.10, 0.20));
    expect(ev.map((e) => e.id)).toEqual(['monster-attack', 'economic-boom']);
    expect(ev[1].text).toMatch(/Treasury increases/);
  });
});
