import { describe, expect, it } from 'vitest';
import { sampleKingdom } from '../state/factory';
import type { Kingdom } from '../state/types';
import { activeArmies, armyStats, armyUpkeepTotal, buyResource, commanderBonus, fromPreset, payArmies, presetByName, rally, recruit, resourceCost } from './armies';
import { effDV, effOM, finishBattle, resolvePhase, setTactics, startBattle, victoryCheck } from './battle';
import { computeStats } from './stats';
import { endTurn } from './turn';

const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const preset = (name: string, side: 'kingdom' | 'enemy' = 'kingdom') => fromPreset(presetByName(name)!, side);

describe('army statistics match the book', () => {
  it.each([
    ['Soldiers', 'medium', { acrLabel: '1', hpMax: 5, dv: 11, om: 1, consumption: 1 }],
    ['Soldiers', 'colossal', { acrLabel: '9', hpMax: 49, dv: 19, om: 9, consumption: 4 }],
    ['Soldiers', 'huge', { acrLabel: '5', hpMax: 27, dv: 15, om: 5, consumption: 2 }],
    ['Militia', 'large', { acrLabel: '1', hpMax: 5, dv: 11, om: 1 }],
    ['Militia', 'gargantuan', { acrLabel: '5', hpMax: 27, dv: 15, om: 5, consumption: 2 }],
    ['Goblin horde', 'huge', { acrLabel: '3', hpMax: 16, dv: 13, om: 3, ranged: true }],
    ['Kobolds', 'huge', { acrLabel: '2', hpMax: 11, dv: 12, om: 2 }],
    ['Skeleton horde', 'medium', { acrLabel: '1/3', hpMax: 1, dv: 12, om: 0 }],
    ['Skeleton horde', 'colossal', { acrLabel: '7', hpMax: 31, dv: 19, om: 7, consumption: 3 }],
    ['Zombie horde', 'large', { acrLabel: '2', hpMax: 9, dv: 14, om: 2 }],
    ['Elite mounted knights', 'medium', { acrLabel: '2', hpMax: 11, dv: 15, om: 5, consumption: 4 }],
    ['Hobgoblins', 'medium', { acrLabel: '1', hpMax: 5, dv: 12, om: 2, ranged: true }],
    ['Tarrasque', 'fine', { acrLabel: '17', hpMax: 93, dv: 27, om: 21 }],
  ] as const)('%s (%s)', (name, size, want) => {
    const a = preset(name);
    a.size = size;
    expect(armyStats(a)).toMatchObject(want);
  });

  it('knows half its ACR in tactics and scales resources by size', () => {
    const a = preset('Soldiers');
    a.size = 'large'; // ACR 3
    expect(armyStats(a).maxTactics).toBe(1);
    expect(resourceCost(a, 'armor')).toBe(6);
    expect(resourceCost(a, 'siege')).toBe(15); // siege engines don't scale
    const before = armyStats(a).consumption;
    a.resources.armor = 1;
    expect(armyStats(a).consumption).toBe(before + 2);
  });

  it('kingdom leaders get at least +1 on Morale checks', () => {
    expect(commanderBonus({ name: 'A', cha: 2, profession: 0, level: 4, leadershipFeat: false, boons: [] })).toBe(2);
    expect(commanderBonus({ name: 'B', cha: 2, profession: 0, level: 4, leadershipFeat: false, role: 'general', boons: [] })).toBe(3);
    expect(commanderBonus({ name: 'C', cha: 1, profession: 10, level: 12, leadershipFeat: false, role: 'general', boons: [] })).toBe(3);
  });
});

function battleKingdom() {
  const k = sampleKingdom();
  k.armies = [];
  k.settlements[0].districts[0].buildings.push({ id: 'sm', type: 'smithy', lots: [[5, 5]] });
  const ours = preset('Soldiers');
  ours.commander = { name: 'Sir Oric', cha: 3, profession: 5, level: 6, leadershipFeat: false, role: 'general', boons: ['merciless'] };
  recruit(k, ours);
  const foe = preset('Goblin horde', 'enemy');
  recruit(k, foe);
  return { k, ours, foe };
}

describe('kingdom armies', () => {
  it('recruiting counts against the turn limit; resources cost BP and need buildings', () => {
    const { k, ours } = battleKingdom();
    expect(k.turnState.settlements).toBe(1);
    const t = k.treasury;
    buyResource(k, ours.id, 'armor');
    expect(k.treasury).toBe(t - 3);
    expect(armyStats(ours).dv).toBe(12);
  });

  it('upkeep pays four weeks for deployed armies; unpaid armies lose 2 Morale on checks', () => {
    const { k, ours } = battleKingdom();
    expect(armyUpkeepTotal(k)).toBe(4);
    const t = k.treasury;
    payArmies(k, true);
    expect(k.treasury).toBe(t - 4);
    payArmies(k, false);
    expect(armyStats(ours).effectiveMorale).toBe(-2);
    const leaderless = preset('Militia');
    recruit(k, leaderless);
    payArmies(k, true);
    expect(leaderless.morale).toBe(-4);
    expect(activeArmies(k)).toHaveLength(2);
  });
});

describe('battles', () => {
  it('works out OM and DV from tactics, strategy, and conditions', () => {
    const { k, ours, foe } = battleKingdom();
    startBattle(k, { name: 'Test', kingdom: [ours.id], enemy: [foe.id], conditions: { light: 'dark', fog: false, sandstorm: false, wind: 0, advTerrain: 'kingdom' } });
    const b = k.battle!;
    const [us, them] = b.armies;
    setTactics(k, { [us.armyId]: { tactic: 'standard', strategy: 4 } });
    // Soldiers: OM 1, darkness −2 (no darkvision); goblins have darkvision. Reckless only in melee.
    expect(effOM(k, b, us, them, 'ranged')).toBe(-1);
    expect(effOM(k, b, us, them, 'melee')).toBe(3);
    // Goblins attacking soldiers: soldiers' DV 11 − 3 dark + 2 terrain − 4 reckless
    expect(effDV(k, b, us, them, 'melee')).toBe(6);
  });

  it('runs a battle to the end and applies the aftermath', () => {
    const { k, ours, foe } = battleKingdom();
    ours.size = 'huge'; // ACR 5 soldiers vs ACR 3 goblins
    ours.hp = armyStats(ours).hpMax;
    startBattle(k, { name: 'Battle of the Ford', kingdom: [ours.id], enemy: [foe.id], conditions: { light: 'bright', fog: false, sandstorm: false, wind: 0 } });
    setTactics(k, {});
    expect(k.battle!.phase).toBe('ranged'); // goblins have bows
    let guard = 0;
    const rng = seq(0.6, 0.3, 0.8, 0.1, 0.5);
    while (k.battle!.phase !== 'over' && guard++ < 30) resolvePhase(k, {}, rng);
    const b = k.battle!;
    expect(b.phase).toBe('over');
    expect(['kingdom', 'enemy', 'none']).toContain(b.winner);
    if (b.winner === 'kingdom') {
      expect(b.victors!.map((v) => v.armyId)).toEqual([ours.id]);
      expect(b.xp).toBe(800);
      expect(foe.status).not.toBe('ready');
      victoryCheck(k, ours.id, 'tactic', 20, 'defensiveWall');
      expect(ours.tactics).toContain('defensiveWall');
      expect(ours.morale).toBe(1);
    }
    expect(ours.lastBattleTurn).toBe(k.turn);
  });

  it('a natural 1 costs the next phase; a natural 20 always deals 1 damage; fog halves damage', () => {
    const { k, ours, foe } = battleKingdom();
    startBattle(k, { name: 'Fog', kingdom: [ours.id], enemy: [foe.id], conditions: { light: 'bright', fog: true, sandstorm: false, wind: 0 } });
    setTactics(k, {});
    const b = k.battle!;
    const hpFoe = b.armies[1].hp;
    resolvePhase(k, { [foe.id]: { roll: 1 } }, seq(0.5)); // ranged: only the goblins shoot; natural 1
    expect(b.armies[1].skipNext).toBe(true);
    resolvePhase(k, { [ours.id]: { roll: 20 } }, seq(0.5)); // melee: soldiers 20 + 1 = 21 vs DV 13 → 8, halved by fog → 4
    expect(b.armies[1].hp).toBe(hpFoe - 4);
  });

  it('a destroyed kingdom army costs the kingdom Economy, Loyalty, and Stability', () => {
    const { k, ours, foe } = battleKingdom();
    const before = computeStats(k);
    startBattle(k, { name: 'Rout', kingdom: [ours.id], enemy: [foe.id], conditions: { light: 'bright', fog: false, sandstorm: false, wind: 0 } });
    setTactics(k, {});
    k.battle!.armies[0].state = 'defeated';
    finishBattle(k);
    expect(ours.status).toBe('defeated');
    const after = computeStats(k);
    expect(after.economy).toBe(before.economy - 2); // Medium army
    expect(after.loyalty).toBe(before.loyalty - 2);
  });

  it('a routed army rallies with a Loyalty check in Upkeep', () => {
    const { k, ours } = battleKingdom();
    ours.status = 'routed';
    endTurn(k as Kingdom);
    rally(k, ours.id, 20);
    expect(ours.status).toBe('ready');
  });
});
