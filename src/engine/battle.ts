// Mass combat battles (Ultimate Campaign pg. 236-239): Tactics phase, one Ranged phase, then Melee phases
// until one side is defeated, routs, or withdraws. Attacks within a phase are simultaneous.
import { SIZE_INFO, SPECIALS, STRATEGIES, TACTICS, WIND, type BoonId, type TacticId } from '../rules/massCombat';
import type { Army, Kingdom } from '../state/types';
import { uid } from '../state/util';
import { log } from './actions';
import { applyDefeatPenalty, armyStats, changeMorale, hasBoon, leadership, moraleCheckMod } from './armies';
import { defaultRng, die, type Rng } from './dice';
import { kingdomCheck } from './turn';

export type Side = 'kingdom' | 'enemy';

export interface BattleArmy {
  armyId: string;
  side: Side;
  hp: number;
  tactic: TacticId;
  /** Index into STRATEGIES (2 = standard). */
  strategy: number;
  target?: string;
  state: 'fighting' | 'routed' | 'defeated' | 'withdrawn';
  /** Can't attack next phase (natural 1 or fear). */
  skipNext?: boolean;
  afraid?: boolean;
  /** Cumulative DV loss from paralysis-type attacks. */
  dvPenalty: number;
  /** Bleed hits waiting to deal 1d6 each at the start of the next phase. */
  bleed: number;
  potionsUsed: number;
  triageUsed?: boolean;
  dirtyUsed?: boolean;
  falseRetreatUsed?: boolean;
  /** Phase number in which the false-retreat bonus applies. */
  falseRetreatBonus?: number;
  tauntSuccesses: number;
  tauntedBy?: string;
  fortification: number;
  siege: number;
  ferocityUsed?: boolean;
  onFerocity?: boolean;
  /** Phase in which ferocity kicked in; it fights through the next Melee phase. */
  ferocityPhase?: number;
}

export interface Conditions {
  light: 'bright' | 'dim' | 'dark';
  fog: boolean;
  sandstorm: boolean;
  /** Index into WIND. */
  wind: number;
  advTerrain?: Side;
  advantage?: Side;
  pcs?: { side: Side; value: number };
}

export interface Battle {
  id: string;
  name: string;
  turn: number;
  phase: 'tactics' | 'ranged' | 'melee' | 'over';
  phaseNo: number;
  meleeRound: number;
  conditions: Conditions;
  armies: BattleArmy[];
  log: { title: string; lines: string[] }[];
  winner?: Side | 'none';
  /** Kingdom armies that won and may attempt their victory Loyalty checks. */
  victors?: { armyId: string; tactic?: string; boon?: string }[];
  xp?: number;
}

export interface Order {
  action?: 'attack' | 'potions' | 'falseRetreat' | 'triage' | 'hold';
  target?: string;
  tactic?: TacticId;
  strategy?: number;
  /** Natural d20 for the Offense check; blank = the app rolls. */
  roll?: number;
}

// ---------- helpers ----------
export const armyOf = (k: Kingdom, id: string) => k.armies!.find((a) => a.id === id)!;
const has = (a: Army, id: string) => a.specials.some((s) => s.id === id);
const specialValue = (a: Army, id: string) => a.specials.filter((s) => s.id === id).reduce((n, s) => n + (s.value ?? 0), 0);
const enemies = (b: Battle, ba: BattleArmy) => b.armies.filter((x) => x.side !== ba.side && x.state === 'fighting');
export const fighting = (b: Battle) => b.armies.filter((x) => x.state === 'fighting');
const acrOf = (a: Army) => armyStats(a).acr ?? 0;

function condPenalty(a: Army, value: number, ignore: boolean) {
  if (ignore || !value) return 0;
  return a.specials.some((s) => SPECIALS[s.id]?.halveConditions) ? Math.trunc(value / 2) : value;
}

/** Offense Modifier of `ba` attacking `t` this phase. */
export function effOM(k: Kingdom, b: Battle, ba: BattleArmy, t: BattleArmy | undefined, phase: 'ranged' | 'melee') {
  const a = armyOf(k, ba.armyId);
  const st = armyStats(a);
  const tac = TACTICS[ba.tactic];
  let om = st.om + (tac.om ?? 0);
  const ta = t ? armyOf(k, t.armyId) : undefined;
  if (ba.tactic === 'cavalryExperts' && ta && !armyStats(ta).mounted) om += 2;
  if (ba.tactic === 'dirtyFighters' && phase === 'melee' && !ba.dirtyUsed) om += 6;
  if (ba.falseRetreatBonus === b.phaseNo) om += 6;
  if (ba.tactic === 'withdraw') om -= 2;
  if (phase === 'melee') om += STRATEGIES[ba.strategy].om;
  const c = b.conditions;
  const sp = (id: string) => a.specials.some((s) => s.id === id || (id === 'dark' && SPECIALS[s.id]?.ignoreDark) || (id === 'dim' && SPECIALS[s.id]?.ignoreDim));
  if (c.light === 'dim') om += condPenalty(a, -1, sp('dim'));
  if (c.light === 'dark') om += condPenalty(a, -2, sp('dark'));
  if (phase === 'ranged') om += condPenalty(a, Math.max(-4, WIND[c.wind].ranged), has(a, 'blindsight'));
  if (c.advantage === ba.side) om += 2;
  if (c.pcs?.side === ba.side) om += c.pcs.value;
  if (has(a, 'flurry') && phase === 'melee') om += b.meleeRound <= 1 ? 1 : 2;
  if (hasBoon(a, 'bloodied') && ba.hp <= st.hpMax / 2) om += leadership(a.commander!) >= 10 ? 2 : 1;
  if (hasBoon(a, 'sharpshooter') && st.ranged && t && t.fortification > 0) om += 2;
  if (t && ba.tauntedBy === t.armyId) om -= 2;
  if (ta && has(ta, 'invisibility')) om -= 2;
  if (ba.onFerocity) om -= 4;
  return om;
}

/** Defense Value of `t` against attacker `ba` this phase. */
export function effDV(k: Kingdom, b: Battle, t: BattleArmy, ba: BattleArmy | undefined, phase: 'ranged' | 'melee') {
  const a = armyOf(k, t.armyId);
  const st = armyStats(a);
  let dv = st.dv + (TACTICS[t.tactic].dv ?? 0);
  if (phase === 'melee') dv += STRATEGIES[t.strategy].dv;
  const c = b.conditions;
  const ignoreDark = a.specials.some((s) => SPECIALS[s.id]?.ignoreDark);
  if (c.light === 'dark') dv += condPenalty(a, -3, ignoreDark);
  if (c.advTerrain === t.side) dv += 2;
  if (c.advantage === t.side) dv += 2;
  if (c.pcs?.side === t.side) dv += c.pcs.value;
  dv += t.fortification;
  const atk = ba ? armyOf(k, ba.armyId) : undefined;
  const atkSpells = atk ? armyStats(atk).spellcasting > 0 : false;
  if (t.tactic === 'spellbreaker' && atkSpells) dv += 4;
  if (has(a, 'spellResistance') && atkSpells) dv += 6;
  dv -= t.dvPenalty;
  if (atk && phase === 'melee' && has(atk, 'trip')) dv -= 1;
  if (atk && has(atk, 'invisibility')) dv -= 2;
  if (t.falseRetreatBonus === b.phaseNo) dv += 6;
  if (t.tactic === 'withdraw') dv -= 2;
  if (ba && t.tauntedBy === ba.armyId) dv -= 2;
  if (t.onFerocity) dv -= 4;
  return dv;
}

/** d20 + Morale + commander, plus situational bonuses. Mindless armies never fail. */
function moraleCheck(k: Kingdom, ba: BattleArmy, dc: number, extra: number, rng: Rng, why: string, L: string[]) {
  const a = armyOf(k, ba.armyId);
  if (has(a, 'mindless')) { L.push(`${a.name} is mindless and holds (${why}).`); return true; }
  const r = die(20, rng);
  const total = r + moraleCheckMod(a) + (ba.tactic === 'cautiousCombat' ? 2 : 0) + extra;
  const ok = total >= dc;
  L.push(`${a.name} Morale check ${total} vs DC ${dc} (${why}): ${ok ? 'success' : 'failure'}.`);
  return ok;
}

function opposedMorale(k: Kingdom, x: BattleArmy, xExtra: number, y: BattleArmy, yExtra: number, rng: Rng) {
  const ax = armyOf(k, x.armyId), ay = armyOf(k, y.armyId);
  const rx = has(ax, 'mindless') ? 99 : die(20, rng) + moraleCheckMod(ax) + xExtra;
  const ry = has(ay, 'mindless') ? 99 : die(20, rng) + moraleCheckMod(ay) + yExtra;
  return { x: rx, y: ry, xWins: rx > ry };
}

// ---------- starting ----------
export interface BattleSetup {
  name: string;
  kingdom: string[];
  enemy: string[];
  conditions: Conditions;
  /** Fortification DV for each side (a settlement's Defense, a Fort, ...). */
  fortification?: Partial<Record<Side, number>>;
}

export function startBattle(k: Kingdom, s: BattleSetup) {
  const make = (id: string, side: Side): BattleArmy => {
    const a = armyOf(k, id);
    const usable = armyStats(a).usableTactics;
    return {
      armyId: id, side, hp: a.hp, tactic: usable.find((t) => t !== 'standard' && t !== 'withdraw') ?? 'standard', strategy: 2,
      state: 'fighting', dvPenalty: 0, bleed: 0, potionsUsed: 0, tauntSuccesses: 0,
      fortification: s.fortification?.[side] ?? 0, siege: a.resources.siege ?? 0,
    };
  };
  k.battle = {
    id: uid(), name: s.name || 'Battle', turn: k.turn, phase: 'tactics', phaseNo: 0, meleeRound: 0, conditions: s.conditions,
    armies: [...s.kingdom.map((id) => make(id, 'kingdom')), ...s.enemy.map((id) => make(id, 'enemy'))], log: [],
  };
  log(k, `Battle begins: ${s.name || 'Battle'}.`);
}

/** Tactics phase: commanders pick a tactic (no check needed) and the opening strategy. */
export function setTactics(k: Kingdom, orders: Record<string, Order>) {
  const b = k.battle!;
  const L: string[] = [];
  for (const ba of b.armies) {
    const o = orders[ba.armyId] ?? {};
    const a = armyOf(k, ba.armyId);
    const usable = armyStats(a).usableTactics;
    if (o.tactic && usable.includes(o.tactic)) ba.tactic = o.tactic;
    if (o.strategy !== undefined && !has(a, 'mindless')) ba.strategy = o.strategy;
    if (o.target) ba.target = o.target;
    L.push(`${a.name}: ${TACTICS[ba.tactic].label} tactic.`);
  }
  b.log.push({ title: 'Tactics phase', lines: L });
  const anyRanged = fighting(b).some((ba) => armyStats(armyOf(k, ba.armyId)).ranged) && WIND[b.conditions.wind].ranged > -99;
  b.phase = anyRanged ? 'ranged' : 'melee';
  if (!anyRanged) b.log.push({ title: 'Ranged phase', lines: ['No army can make ranged attacks; the armies close to melee.'] });
}

// ---------- one Ranged or Melee phase ----------
export function resolvePhase(k: Kingdom, orders: Record<string, Order>, rng: Rng = defaultRng) {
  const b = k.battle!;
  const phase = b.phase as 'ranged' | 'melee';
  b.phaseNo += 1;
  if (phase === 'melee') b.meleeRound += 1;
  const L: string[] = [];
  const name = (ba: BattleArmy) => armyOf(k, ba.armyId).name;
  const hurt = (ba: BattleArmy, n: number) => { ba.hp -= n; };

  // Start of phase: bleeding, sandstorms, regeneration.
  for (const ba of fighting(b)) {
    const a = armyOf(k, ba.armyId);
    if (ba.bleed) {
      let d = 0;
      for (let i = 0; i < ba.bleed; i++) d += die(6, rng);
      hurt(ba, d);
      L.push(`${name(ba)} takes ${d} bleeding damage.`);
      ba.bleed = 0;
    }
    if (b.conditions.sandstorm) { hurt(ba, 1); L.push(`${name(ba)} takes 1 damage from the sandstorm.`); }
    const regen = Math.floor((specialValue(a, 'regeneration') + specialValue(a, 'fastHealing')) / 2);
    if (regen) {
      const max = armyStats(a).hpMax;
      const before = ba.hp;
      ba.hp = Math.min(max, ba.hp + regen);
      if (ba.hp > before) L.push(`${name(ba)} regenerates ${ba.hp - before} hp.`);
    }
  }

  // Changing tactics (DC 15 Morale check; withdraw needs no check) and strategy (melee: 1 step free, more needs DC 20).
  for (const ba of fighting(b)) {
    const a = armyOf(k, ba.armyId);
    const o = orders[ba.armyId] ?? {};
    if (o.target) ba.target = o.target;
    if (has(a, 'mindless')) continue;
    if (o.tactic && o.tactic !== ba.tactic && armyStats(a).usableTactics.includes(o.tactic)) {
      const flex = hasBoon(a, 'flexibleTactics') ? (leadership(a.commander!) >= 12 ? 10 : 5) : 0;
      if (o.tactic === 'withdraw' || moraleCheck(k, ba, 15, flex, rng, `switch to ${TACTICS[o.tactic].label}`, L)) {
        ba.tactic = o.tactic;
        L.push(`${name(ba)} switches to ${TACTICS[o.tactic].label}.`);
      }
    }
    if (phase === 'melee' && o.strategy !== undefined && o.strategy !== ba.strategy) {
      const steps = Math.abs(o.strategy - ba.strategy);
      if (b.meleeRound === 1 || steps <= 1 || moraleCheck(k, ba, 20, 0, rng, `change strategy to ${STRATEGIES[o.strategy].label}`, L)) {
        ba.strategy = o.strategy;
        if (b.meleeRound > 1) L.push(`${name(ba)} shifts to a ${STRATEGIES[o.strategy].label.toLowerCase()} strategy.`);
      }
    }
  }

  const targetOf = (ba: BattleArmy) => {
    const foes = enemies(b, ba);
    return foes.find((f) => f.armyId === ba.target) ?? foes[0];
  };

  // Taunts.
  for (const ba of fighting(b)) {
    if (ba.tactic !== 'taunt') continue;
    const t = targetOf(ba);
    if (!t || t.tauntSuccesses >= 2) continue;
    const ok = moraleCheck(k, t, 10 + acrOf(armyOf(k, ba.armyId)), 0, rng, `resist ${name(ba)}’s taunts`, L);
    if (ok) t.tauntSuccesses += 1;
    else t.tauntedBy = ba.armyId;
  }

  // Withdrawing: an opposed Morale check against each army attacking it.
  for (const ba of fighting(b)) {
    if (ba.tactic !== 'withdraw') continue;
    const a = armyOf(k, ba.armyId);
    const attackers = enemies(b, ba).filter((e) => targetOf(e)?.armyId === ba.armyId);
    const auto = has(a, 'incorporeal') || has(a, 'swarm');
    let all = true;
    for (const e of attackers) {
      if (auto) continue;
      const ea = armyOf(k, e.armyId);
      const mine = (b.conditions.fog ? 2 : 0) + (hasBoon(a, 'hitAndRun') ? (leadership(a.commander!) >= 10 ? 4 : 2) : 0);
      const theirs = (hasBoon(ea, 'merciless') ? 1 : 0);
      const r = opposedMorale(k, ba, mine, e, theirs, rng);
      L.push(`${name(ba)} tries to withdraw from ${name(e)}: ${r.x} vs ${r.y}, ${r.xWins ? 'breaks away' : 'is held'}.`);
      if (!r.xWins) all = false;
    }
    if (all) { ba.state = 'withdrawn'; L.push(`${name(ba)} withdraws from the battle.`); }
  }

  // Attacks, all at once.
  interface Hit { from: BattleArmy; to: BattleArmy; dmg: number; roll: number; total: number; dv: number }
  const hits: Hit[] = [];
  const heals: [BattleArmy, number, string][] = [];
  const routNow: BattleArmy[] = [];
  for (const ba of fighting(b)) {
    const a = armyOf(k, ba.armyId);
    const st = armyStats(a);
    const o = orders[ba.armyId] ?? {};
    if (ba.skipNext) {
      ba.skipNext = false;
      L.push(`${name(ba)} can’t attack this phase${ba.afraid ? ' (afraid)' : ' (setback)'}.`);
      continue;
    }
    if (phase === 'ranged' && !st.ranged) continue;
    if (o.action === 'hold') { L.push(`${name(ba)} holds back.`); continue; }
    if (o.action === 'potions' && a.resources.potions && ba.potionsUsed < 2) {
      ba.potionsUsed += 1;
      let h = 2 * Math.max(1, Math.floor(st.acr ?? 1));
      if (hasBoon(a, 'triage')) h += Math.floor((st.acr ?? 0) / 2);
      heals.push([ba, h, 'drinks healing potions']);
      if (a.side === 'kingdom') a.history.push({ turn: k.turn, text: 'Used healing potions (+3 Consumption this week).' });
      continue;
    }
    if (o.action === 'falseRetreat' && ba.tactic === 'falseRetreat' && !ba.falseRetreatUsed) {
      ba.falseRetreatUsed = true;
      ba.falseRetreatBonus = b.phaseNo + 1;
      L.push(`${name(ba)} feigns a retreat.`);
      continue;
    }
    const t = targetOf(ba);
    if (!t) continue;
    const triage = o.action === 'triage' && hasBoon(a, 'triage') && !ba.triageUsed;
    if (triage) { ba.triageUsed = true; heals.push([ba, Math.max(1, Math.floor((st.acr ?? 0) / 2)), 'tends its wounded']); }
    const om = effOM(k, b, ba, t, phase) - (triage ? 4 : 0);
    const dv = effDV(k, b, t, ba, phase);
    const roll = o.roll && o.roll >= 1 && o.roll <= 20 ? o.roll : die(20, rng);
    const total = roll + om;
    let dmg = total > dv ? total - dv : roll === 20 ? 1 : 0;
    if (roll === 1) ba.skipNext = true;
    if (ba.tactic === 'dirtyFighters' && phase === 'melee') ba.dirtyUsed = true;
    if (dmg > 0) {
      if (phase === 'melee') dmg += STRATEGIES[ba.strategy].dmg;
      for (const s of a.specials) {
        const d = SPECIALS[s.id];
        dmg += d?.dmg ?? 0;
        if (phase === 'ranged' && d?.dmgDice?.rangedFlat) dmg += d.dmgDice.rangedFlat;
        const dice = phase === 'ranged' ? d?.dmgDice?.ranged : d?.dmgDice?.melee;
        if (dice) dmg += die(4, rng);
      }
      if (phase === 'melee' && ba.tactic === 'sniperSupport' && st.ranged) dmg += 2;
      dmg = Math.max(1, dmg);
      if (b.conditions.fog || b.conditions.sandstorm) dmg = Math.max(1, Math.floor(dmg / 2));
      const ta = armyOf(k, t.armyId);
      if (ta.specials.some((s) => SPECIALS[s.id]?.halfDamageTaken)) dmg = Math.max(1, Math.floor(dmg / 2));
    }
    hits.push({ from: ba, to: t, dmg, roll, total, dv });
  }

  for (const h of hits) {
    const a = armyOf(k, h.from.armyId);
    L.push(`${a.name} ${phase === 'ranged' ? 'fires on' : 'attacks'} ${name(h.to)}: ${h.roll} + ${h.total - h.roll} = ${h.total} vs DV ${h.dv}${h.dmg ? `, ${h.dmg} damage` : ', no damage'}${h.roll === 1 ? ' (natural 1: setback next phase)' : ''}.`);
    if (!h.dmg) continue;
    hurt(h.to, h.dmg);
    for (const s of a.specials) {
      const on = SPECIALS[s.id]?.onHit;
      const ta = armyOf(k, h.to.armyId);
      if (on === 'bleed' && phase === 'melee') h.to.bleed += 1;
      if (on === 'paralysis' && !has(ta, 'undead') && !has(ta, 'construct')) h.to.dvPenalty += 1;
      if (on === 'fear' && !ta.specials.some((x) => SPECIALS[x.id]?.immuneFear)) {
        if (!moraleCheck(k, h.to, 10 + acrOf(a), 0, rng, `resist fear of ${a.name}`, L)) {
          if (h.to.afraid && h.to.state === 'fighting') { h.to.state = 'routed'; routNow.push(h.to); L.push(`${name(h.to)} is already afraid and routs!`); }
          else { h.to.afraid = true; h.to.skipNext = true; }
        }
      }
    }
    if (h.from.tactic === 'siegebreaker' && h.to.siege > 0) {
      const second = die(20, rng) + effOM(k, b, h.from, h.to, phase);
      if (second > effDV(k, b, h.to, h.from, phase)) { h.to.siege -= 1; L.push(`${a.name} destroys one of ${name(h.to)}’s siege engines.`); }
    }
  }
  for (const [ba, n, what] of heals) {
    const max = armyStats(armyOf(k, ba.armyId)).hpMax;
    const before = ba.hp;
    ba.hp = Math.min(max, ba.hp + n);
    L.push(`${name(ba)} ${what}: +${ba.hp - before} hp.`);
  }

  // Siege engines batter fortifications each Melee phase.
  if (phase === 'melee') {
    for (const ba of fighting(b)) {
      if (!ba.siege) continue;
      for (const e of enemies(b, ba)) {
        if (e.fortification <= 0) continue;
        let r = 0;
        for (let i = 0; i < ba.siege; i++) r += die(4, rng);
        e.fortification = Math.max(0, e.fortification - r);
        L.push(`${name(ba)}’s siege engines reduce ${name(e)}’s fortifications by ${r} (now +${e.fortification}).`);
      }
    }
  }

  // Defeat and rout.
  for (const ba of fighting(b)) {
    const a = armyOf(k, ba.armyId);
    if (ba.onFerocity && phase === 'melee' && ba.ferocityPhase !== b.phaseNo) {
      ba.state = ba.hp <= 0 ? 'defeated' : 'routed';
      ba.onFerocity = false;
      L.push(`${a.name}’s ferocity is spent; it ${ba.state === 'defeated' ? 'falls' : 'flees'}.`);
      continue;
    }
    if (ba.hp <= 0) {
      if (has(a, 'ferocity') && !ba.ferocityUsed) { ba.ferocityUsed = true; ba.onFerocity = true; ba.ferocityPhase = b.phaseNo; ba.hp = 0; L.push(`${a.name} is beaten but fights on with ferocity for one more Melee phase.`); continue; }
      ba.state = 'defeated';
      L.push(`${a.name} is defeated.`);
      continue;
    }
    const tookDamage = hits.some((h) => h.to === ba && h.dmg > 0);
    if (tookDamage && ba.hp <= acrOf(a)) {
      if (a.specials.some((s) => SPECIALS[s.id]?.neverRouts)) { L.push(`${a.name} stands firm (aura of courage).`); continue; }
      const vsRout = a.specials.reduce((n, s) => n + (SPECIALS[s.id]?.moraleVsRout ? (s.value ?? SPECIALS[s.id].moraleVsRout!) : 0), 0);
      let ok = moraleCheck(k, ba, 15, vsRout, rng, 'avoid a rout', L);
      if (!ok && hasBoon(a, 'holdTheLine')) ok = moraleCheck(k, ba, 15, vsRout, rng, 'hold the line (reroll)', L);
      if (!ok) {
        if (has(a, 'ferocity') && !ba.ferocityUsed) { ba.ferocityUsed = true; ba.onFerocity = true; ba.ferocityPhase = b.phaseNo; L.push(`${a.name} breaks but fights on with ferocity for one more Melee phase.`); continue; }
        ba.state = 'routed';
        routNow.push(ba);
        L.push(`${a.name} routs!`);
      }
    }
  }
  // Parting shots at armies that just routed.
  for (const r of routNow) {
    for (const e of fighting(b).filter((x) => x.side !== r.side)) {
      const ea = armyOf(k, e.armyId);
      const om = effOM(k, b, e, r, 'melee') + (hasBoon(ea, 'merciless') ? 1 : 0);
      const dv = effDV(k, b, r, e, 'melee');
      const total = die(20, rng) + om;
      const dmg = total > dv ? total - dv : 0;
      r.hp -= dmg;
      L.push(`${ea.name} takes a parting shot at the fleeing ${name(r)}: ${total} vs DV ${dv}${dmg ? `, ${dmg} damage` : ', misses'}.`);
    }
    if (r.hp <= 0) { r.state = 'defeated'; L.push(`${name(r)} is destroyed as it flees.`); }
  }

  // End of phase.
  for (const ba of b.armies) {
    ba.tauntedBy = undefined;
    if (ba.afraid && !ba.skipNext) ba.afraid = false;
  }
  b.log.push({ title: `${phase === 'ranged' ? 'Ranged phase' : `Melee phase ${b.meleeRound}`}`, lines: L });
  if (phase === 'ranged') b.phase = 'melee';
  const sideLeft = (s: Side) => b.armies.some((x) => x.side === s && x.state === 'fighting');
  if (!sideLeft('kingdom') || !sideLeft('enemy')) finishBattle(k);
}

/** Stop the battle early (the GM calls it, or both sides disengage). */
export function finishBattle(k: Kingdom) {
  const b = k.battle!;
  const left = (s: Side) => b.armies.some((x) => x.side === s && x.state === 'fighting');
  b.winner = left('kingdom') && !left('enemy') ? 'kingdom' : left('enemy') && !left('kingdom') ? 'enemy' : 'none';
  b.phase = 'over';
  const L: string[] = [];
  b.victors = [];
  let xp = 0;
  for (const ba of b.armies) {
    const a = armyOf(k, ba.armyId);
    const st = armyStats(a);
    const A = st.acr ?? 0;
    a.lastBattleTurn = k.turn;
    a.hp = Math.max(0, Math.min(st.hpMax, ba.hp));
    a.resources.siege = a.resources.siege ? ba.siege : a.resources.siege;
    if (ba.state === 'defeated') {
      a.status = 'defeated';
      a.hp = 0;
      a.history.push({ turn: k.turn, text: `Destroyed in ${b.name}.` });
      if (a.side === 'kingdom') {
        const p = applyDefeatPenalty(k, a);
        L.push(`${a.name} was destroyed. Kingdom: Economy ${p.economy}, Loyalty ${p.loyalty}, Stability ${p.stability}.`);
        if (a.commander && !a.commander.role) {
          const d = die(100);
          const fate = d <= 20 ? 'was killed' : d <= 70 ? `was captured (ransom: ${armyStats(a).consumption} BP)` : 'escaped';
          L.push(`Its commander ${a.commander.name} ${fate} (d% ${d}).`);
        } else if (a.commander?.role) L.push(`${a.commander.name} must escape badly hurt (25% hp or less) or be captured and held for ransom.`);
      } else { xp += st.xp; L.push(`${a.name} was destroyed.`); }
    } else if (ba.state === 'routed') {
      a.history.push({ turn: k.turn, text: `Routed in ${b.name}.` });
      if (a.hp < A) a.hp = Math.ceil(A);
      if (a.side === 'kingdom') {
        a.status = 'routed';
        changeMorale(k, a, -1, 'Routed');
        L.push(`${a.name} routed: Morale −1. It won’t fight again until it rallies (Loyalty check in the Upkeep phase).`);
      } else { a.status = 'routed'; xp += st.xp; L.push(`${a.name} fled the field.`); }
    } else if (ba.state === 'withdrawn') {
      a.history.push({ turn: k.turn, text: `Withdrew from ${b.name}.` });
      L.push(`${a.name} withdrew.`);
    } else if (b.winner === ba.side) {
      a.history.push({ turn: k.turn, text: `Victorious in ${b.name}.` });
      if (a.hp < A) a.hp = Math.ceil(A);
      if (a.side === 'kingdom') b.victors.push({ armyId: a.id });
      L.push(`${a.name} is victorious.`);
    }
  }
  b.xp = b.winner === 'kingdom' ? xp : 0;
  if (b.xp) L.push(`The PCs earn ${b.xp.toLocaleString()} XP for the defeated armies.`);
  b.log.push({ title: 'Aftermath', lines: L });
  log(k, `${b.name} ended: ${b.winner === 'kingdom' ? 'victory' : b.winner === 'enemy' ? 'defeat' : 'no clear winner'}. ${L.join(' ')}`);
}

/** After a victory: Loyalty check to learn a tactic (and +1 Morale), and another for the commander to learn a boon. */
export function victoryCheck(k: Kingdom, armyId: string, kind: 'tactic' | 'boon', roll: number, choice?: TacticId | BoonId) {
  const b = k.battle!;
  const v = b.victors?.find((x) => x.armyId === armyId);
  const a = armyOf(k, armyId);
  if (!v) return null;
  const c = kingdomCheck(k, 'loyalty', roll);
  let text = `Loyalty check ${c.total} vs DC ${c.dc}: `;
  if (kind === 'tactic') {
    if (c.success) {
      if (choice && !a.tactics.includes(choice as TacticId) && a.tactics.length < armyStats(a).maxTactics) a.tactics.push(choice as TacticId);
      changeMorale(k, a, 1, 'Victory');
      text += `learned ${choice ? TACTICS[choice as TacticId]?.label ?? 'nothing new' : 'no new tactic'}; Morale +1.`;
    } else text += 'no lesson learned.';
    v.tactic = text;
  } else {
    if (c.success && a.commander && choice) {
      a.commander.boons = [...new Set([...a.commander.boons, choice as BoonId])];
      text += `${a.commander.name} learned a boon.`;
    } else text += c.success ? 'no commander to learn a boon.' : 'no new boon.';
    v.boon = text;
  }
  a.history.push({ turn: k.turn, text: `After ${b.name}: ${text}` });
  log(k, `${a.name}: ${text}`);
  return c;
}

export function closeBattle(k: Kingdom) {
  delete k.battle;
}

export const sizeLabel = (a: Army) => SIZE_INFO[a.size].label;
