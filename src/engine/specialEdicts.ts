// Optional special edicts (Ultimate Campaign pg. 228-233): Diplomatic, Exploration, Trade, and Vassalage.
// One special edict may be issued each turn, in the Edict phase.
import type { Attr } from '../rules/kingdom';
import type { Expedition, ForeignKingdom, Kingdom, TradeRoute } from '../state/types';
import { uid } from '../state/util';
import { changeUnrest, log } from './actions';
import { activeArmies } from './armies';
import { defaultRng, die, type Rng } from './dice';
import { allBuildings, computeStats, settlementModifiers } from './stats';
import { kingdomCheck } from './turn';

export const ATTITUDES = ['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful'] as const;
export type Attitude = (typeof ATTITUDES)[number];
const ALIGN = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'];

export const specialEdictUsed = (k: Kingdom) => k.turnState.done['edict.special'];
function useSpecialEdict(k: Kingdom, text: string) {
  k.turnState.done['edict.special'] = text;
}
const roll = (n: number, sides: number, rng: Rng) => { let t = 0; for (let i = 0; i < n; i++) t += die(sides, rng); return t; };

// ---------- diplomacy ----------
function axes(a: string) {
  const al = a === 'N' ? 'NN' : a;
  return [{ L: 0, N: 1, C: 2 }[al[0] as 'L' | 'N' | 'C'], { G: 0, N: 1, E: 2 }[al[1] as 'G' | 'N' | 'E']];
}
/** Table 4-12: +5 for one step apart on an axis, +15 for two, per axis. */
export function alignmentDifference(a: string, b: string) {
  const [x, y] = [axes(a), axes(b)];
  return [0, 1].reduce((n, i) => n + [0, 5, 15][Math.abs(x[i] - y[i])], 0);
}
export const kingdomAlignmentAbbr = (k: Kingdom) => {
  const l = { lawful: 'L', neutral: 'N', chaotic: 'C' }[k.alignment.law];
  const m = { good: 'G', neutral: 'N', evil: 'E' }[k.alignment.moral];
  return l === 'N' && m === 'N' ? 'N' : `${l}${m}`;
};
/** +5 for every attitude step worse than helpful. */
export const attitudeModifier = (a: Attitude) => (4 - ATTITUDES.indexOf(a)) * 5;

export interface DcParts { dc: number; lines: [string, number][] }
/** DC = 10 + Infamy + both Size/5 + alignment difference + relationships + attitude − Fame − bribes (Intimidate ignores Fame and Infamy). */
export function diplomacyDC(k: Kingdom, f: ForeignKingdom, opts: { intimidate?: boolean; bribes?: number; relationship?: number }): DcParts {
  const st = computeStats(k);
  const lines: [string, number][] = [['Base', 10]];
  if (!opts.intimidate) lines.push(['Your Infamy', st.infamy]);
  lines.push([`${f.name}’s Size ÷ 5`, Math.floor(f.size / 5)]);
  lines.push(['Your Size ÷ 5', Math.floor(k.size / 5)]);
  lines.push([`Alignment (${kingdomAlignmentAbbr(k)} vs ${f.alignment})`, alignmentDifference(kingdomAlignmentAbbr(k), f.alignment)]);
  if (opts.relationship) lines.push(['Relationships with third parties', opts.relationship]);
  lines.push([`Attitude (${f.attitude})`, attitudeModifier(f.attitude)]);
  if (!opts.intimidate) lines.push(['Your Fame', -st.fame]);
  if (opts.bribes) lines.push(['Bribes and gifts (BP)', -opts.bribes]);
  return { dc: lines.reduce((n, [, v]) => n + v, 0), lines: lines.filter(([, v], i) => v || i === 0) };
}

export const CHECKS_NEEDED = { embassy: [1, 1], treaty: [3, 2], alliance: [6, 4] } as const;
const shift = (f: ForeignKingdom, steps: number) => {
  const i = Math.max(0, Math.min(4, ATTITUDES.indexOf(f.attitude) + steps));
  f.attitude = ATTITUDES[i];
};

export interface DiplomacyInput {
  foreignId: string;
  goal: 'embassy' | 'treaty' | 'alliance';
  intimidate?: boolean;
  bribes?: number;
  relationship?: number;
  /** The envoy's Diplomacy or Intimidate check totals, in order. */
  checks: number[];
  /** Who won the negotiations (treaties and alliances), and the winner's choice of terms. */
  advantage?: 'us' | 'them';
  balanced?: boolean;
}

/** A Diplomatic edict. Costs 1d4 BP plus any bribes. */
export function diplomaticEdict(k: Kingdom, input: DiplomacyInput, rng: Rng = defaultRng) {
  const f = k.foreign!.find((x) => x.id === input.foreignId)!;
  const { dc } = diplomacyDC(k, f, input);
  const cost = die(4, rng) + (input.bribes ?? 0);
  k.treasury -= cost;
  const lines: string[] = [`${cost} BP spent`];
  const succ = input.checks.filter((c) => c >= dc).length;
  const [, need] = CHECKS_NEEDED[input.goal];
  const fail = (what: string) => { f.cooldown = { ...f.cooldown, [what]: k.turn + 12 }; };
  if (input.goal === 'embassy') {
    const c = input.checks[0];
    if (input.intimidate) {
      k.infamy = (k.infamy ?? 0) + 1;
      if (c >= dc) { f.relation = 'embassy'; lines.push(`Intimidate ${c} vs DC ${dc}: an embassy is agreed under threat. Infamy +1`); }
      else {
        const bad = c <= dc - 5;
        shift(f, bad ? -2 : -1);
        k.infamy += bad ? 2 : 1;
        fail('threat');
        lines.push(`Intimidate ${c} vs DC ${dc}: refused. Infamy +${bad ? 3 : 2}, attitude now ${f.attitude}`);
        if (bad && f.attitude === 'hostile') lines.push(`${f.name} declares war`);
      }
    } else if (c >= dc) {
      f.relation = 'embassy';
      if (c >= dc + 5) { shift(f, 1); k.fame += 1; }
      lines.push(`Diplomacy ${c} vs DC ${dc}: embassy established${c >= dc + 5 ? `; Fame +1, attitude now ${f.attitude}` : ''}`);
    } else {
      fail('embassy');
      if (c <= dc - 5) { k.fame -= 1; shift(f, -1); }
      lines.push(`Diplomacy ${c} vs DC ${dc}: rejected; can’t try again for a year${c <= dc - 5 ? `. Fame −1, attitude now ${f.attitude}` : ''}`);
    }
  } else {
    const what = input.goal;
    lines.push(`${succ} of ${input.checks.length} checks beat DC ${dc} (${need} needed)`);
    if (succ >= need) {
      const terms: ForeignKingdom['treaty'] = input.balanced !== false ? 'balanced' : input.advantage === 'them' ? 'theirs' : 'ours';
      if (what === 'treaty') { f.relation = 'treaty'; f.treaty = terms; }
      else { f.relation = 'alliance'; f.alliance = terms; }
      if (input.advantage === 'us') {
        if (terms === 'balanced') k.fame += 1;
        else k.infamy = (k.infamy ?? 0) + 1;
      }
      const attr = what === 'treaty' ? 'Economy' : 'Stability';
      lines.push(`${what === 'treaty' ? 'Treaty' : 'Alliance'} signed, ${terms === 'balanced' ? 'balanced' : terms === 'ours' ? 'in your favor' : `in ${f.name}’s favor`}: ${attr} +${terms === 'balanced' ? 10 : terms === 'ours' ? 15 : 5}% of theirs${input.advantage === 'us' ? (terms === 'balanced' ? '; Fame +1' : '; Infamy +1') : ''}`);
    } else {
      k.fame -= 1;
      fail(what);
      lines.push(`Negotiations failed: Fame −1; no new attempt for a year`);
    }
  }
  const text = `Diplomatic edict with ${f.name} (${input.goal}${input.intimidate ? ', by threats' : ''}): ${lines.join('. ')}.`;
  log(k, text, { bp: -cost });
  useSpecialEdict(k, text);
}

/** Treaty (Economy) and alliance (Stability) bonuses; each one after the first gives 1 less. */
export function foreignBonuses(k: Kingdom) {
  const out: { attr: Attr; label: string; value: number }[] = [];
  const pct = (t: ForeignKingdom['treaty']) => (t === 'ours' ? 0.15 : t === 'theirs' ? 0.05 : 0.1);
  let i = 0;
  for (const f of (k.foreign ?? []).filter((x) => x.relation === 'treaty' || x.relation === 'alliance')) {
    out.push({ attr: 'economy', label: `Treaty with ${f.name}`, value: Math.max(0, Math.floor(pct(f.treaty ?? 'balanced') * f.economy) - i) });
    i++;
  }
  i = 0;
  for (const f of (k.foreign ?? []).filter((x) => x.relation === 'alliance')) {
    out.push({ attr: 'stability', label: `Alliance with ${f.name}`, value: Math.max(0, Math.floor(pct(f.alliance ?? 'balanced') * f.stability) - i) });
    i++;
  }
  return out;
}

/** An embassy building abroad: Economy +2, Consumption +1, Society +2, plus the building's own bonuses. */
export function embassyBonuses(k: Kingdom) {
  const r = { economy: 0, loyalty: 0, stability: 0, consumption: 0, society: 0, fame: 0 };
  for (const f of k.foreign ?? []) {
    if (!f.embassyBuilding || f.relation === 'none') continue;
    r.economy += 2; r.consumption += 1; r.society += 2;
    if (f.embassyBuilding === 'mansion') r.stability += 1;
    else { r.economy += 1; r.loyalty += 1; r.stability += 1; r.fame += 1; }
  }
  return r;
}

// ---------- exploration ----------
/** Commission explorers: 1d4 BP per month, paid in advance. */
export function startExpedition(k: Kingdom, months: number, note: string, rng: Rng = defaultRng) {
  const cost = roll(months, 4, rng);
  k.treasury -= cost;
  const e: Expedition = { id: uid(), months, cost, note, startedTurn: k.turn, returnsTurn: k.turn + months, status: 'out' };
  (k.expeditions ??= []).push(e);
  const text = `Exploration edict: explorers set out for ${months} month${months > 1 ? 's' : ''}${note ? ` (${note})` : ''}, costing ${cost} BP.`;
  log(k, text, { bp: -cost });
  useSpecialEdict(k, text);
  return e;
}

/** When explorers come back (or meet trouble). Lost explorers raise Unrest by 1. */
export function endExpedition(k: Kingdom, id: string, outcome: 'returned' | 'scattered' | 'lost') {
  const e = k.expeditions!.find((x) => x.id === id)!;
  e.status = outcome;
  const unrest = outcome === 'lost' ? changeUnrest(k, 1) : 0;
  log(k, outcome === 'returned' ? `The explorers${e.note ? ` (${e.note})` : ''} are back: mark the hexes they mapped as explored.`
    : outcome === 'scattered' ? 'The explorers were scattered and made no more progress this month.'
    : 'The explorers were killed: Unrest +1 and the rest of the investment is lost.', { unrest });
}

// ---------- trade ----------
export const TRADE_TYPES = {
  food: { label: 'Food', needs: ['granary', 'stockyard'], text: 'Needs a Granary and a Stockyard. Economy +1 per 10 Farms and Fisheries, only while they bring Consumption below 0.' },
  goods: { label: 'Goods', needs: ['guildhall'], text: 'Needs a Guildhall. Economy + (Guildhalls, Smithies, Shops, Trade Shops, and Tanneries in the settlement) ÷ 10.' },
  luxuries: { label: 'Luxuries', needs: ['luxury-store'], text: 'Needs a Luxury Store. Economy + (Alchemists, Caster’s Towers, Exotic Artisans, Herbalists, Luxury Stores, and Magic Shops) ÷ 10.' },
  raw: { label: 'Raw materials', needs: [], text: 'Economy +1 per 10 Mines (needs a Foundry), Quarries, and Sawmills.' },
} as const;
export type TradeType = keyof typeof TRADE_TYPES;

export function tradeTypeBonus(k: Kingdom, settlementId: string, type: TradeType) {
  const s = k.settlements.find((x) => x.id === settlementId);
  const b = s ? allBuildings(s) : [];
  const count = (ids: string[]) => b.filter((x) => ids.includes(x)).length;
  const f = k.features;
  if (type === 'food') return Math.floor(((f.farm ?? 0) + (f.fishery ?? 0)) / 10);
  if (type === 'goods') return Math.floor(count(['guildhall', 'smithy', 'shop', 'trade-shop', 'tannery']) / 10);
  if (type === 'luxuries') return Math.floor(count(['alchemist', 'casters-tower', 'exotic-artisan', 'herbalist', 'luxury-store', 'magic-shop']) / 10);
  return Math.floor(((b.includes('foundry') ? f.mine ?? 0 : 0) + (f.quarry ?? 0) + (f.sawmill ?? 0)) / 10);
}
export function tradeAllowed(k: Kingdom, settlementId: string, type: TradeType) {
  const s = k.settlements.find((x) => x.id === settlementId);
  const b = s ? allBuildings(s) : [];
  const missing = TRADE_TYPES[type].needs.filter((n) => !b.includes(n));
  const busy = (k.tradeRoutes ?? []).some((t) => t.type === type && (t.status === 'travelling' || (t.status === 'active' && (t.expiresTurn ?? 0) > k.turn)));
  return { ok: !missing.length && !busy, missing, busy };
}

/** Route Modifier = TRL ÷ 10; Length Modifier = Size − TRL (minimum 0); DC = Control DC + Corruption + RM + LM − Productivity. */
export function tradeDC(k: Kingdom, settlementId: string, trl: number) {
  const s = k.settlements.find((x) => x.id === settlementId)!;
  const v = settlementModifiers(k, s).values;
  const rm = Math.floor(trl / 10), lm = Math.max(0, k.size - trl);
  const dc = computeStats(k).controlDC + v.corruption + rm + lm - v.productivity;
  return { dc, rm, lm, corruption: v.corruption, productivity: v.productivity };
}

export function startTrade(k: Kingdom, t: Omit<TradeRoute, 'id' | 'status' | 'startedTurn' | 'arrivesTurn'> & { travelTurns: number }) {
  const r: TradeRoute = { id: uid(), partner: t.partner, settlementId: t.settlementId, type: t.type, trl: t.trl, invested: t.invested, startedTurn: k.turn, arrivesTurn: k.turn + t.travelTurns, status: 'travelling' };
  (k.tradeRoutes ??= []).push(r);
  k.treasury -= t.invested;
  const text = `Trade edict: a ${TRADE_TYPES[t.type].label.toLowerCase()} expedition to ${t.partner} (${t.invested} BP invested, route length ${t.trl})${t.travelTurns ? `, arriving in ${t.travelTurns} turn${t.travelTurns > 1 ? 's' : ''}` : ''}.`;
  log(k, text, { bp: -t.invested });
  useSpecialEdict(k, text);
  return r;
}

/** First arrival: Economy, Loyalty, and Stability checks against the trade DC decide the route's fate. */
export function resolveTrade(k: Kingdom, id: string, rolls: (number | undefined)[] = [], rng: Rng = defaultRng) {
  const r = k.tradeRoutes!.find((x) => x.id === id)!;
  const { dc, rm } = tradeDC(k, r.settlementId, r.trl);
  const offset = computeStats(k).controlDC - dc;
  const checks = (['economy', 'loyalty', 'stability'] as Attr[]).map((a, i) => kingdomCheck(k, a, rolls[i] ?? die(20, rng), offset));
  const succ = checks.filter((c) => c.success).length;
  const per5 = Math.floor(r.invested / 5);
  const lines = [`${succ} of 3 checks succeeded (DC ${dc})`];
  let bp = 0, unrest = 0;
  if (succ === 0) {
    r.status = 'failed';
    k.fame -= 1;
    unrest = changeUnrest(k, 1);
    lines.push('a total loss: Fame −1, Unrest +1');
  } else if (succ === 1) {
    r.status = 'failed';
    bp = roll(per5, 4, rng);
    lines.push(`the traders sold their goods elsewhere: +${bp} BP`);
  } else {
    r.status = 'active';
    r.establishedTurn = k.turn;
    r.expiresTurn = k.turn + 12;
    const eco = (succ === 3 ? 2 : 1) + tradeTypeBonus(k, r.settlementId, r.type);
    r.economy = eco;
    bp = rm + roll(per5 * 2, 4, rng);
    if (succ === 3) k.fame += 1;
    k.modifiers.push({ id: `trade-${r.id}`, label: `Trade route to ${r.partner} (${TRADE_TYPES[r.type].label})`, economy: eco, loyalty: 0, stability: 0, consumption: 0, expiresTurn: r.expiresTurn });
    lines.push(`route established for a year: Economy +${eco}, +${bp} BP${succ === 3 ? ', Fame +1' : ''}`);
  }
  k.treasury += bp;
  log(k, `Trade route to ${r.partner}: ${lines.join('; ')}.`, { bp: bp || undefined, unrest: unrest || undefined });
  return checks;
}

// ---------- vassals ----------
export interface VassalInput {
  name: string;
  viceroy: string;
  alignment: string;
  size: number;
  grant: number;
  mode: 'colony' | 'subjugated';
  relation: 'embassy' | 'treaty' | 'alliance';
  terms: 'balanced' | 'ours';
}

/** Vassalage edict: 1d4 BP plus a grant of up to a quarter of the Treasury; a Viceroy governs it. */
export function vassalEdict(k: Kingdom, v: VassalInput, rng: Rng = defaultRng) {
  const cost = die(4, rng);
  const grant = Math.max(0, Math.min(v.grant, Math.floor(Math.max(0, k.treasury) / 4)));
  k.treasury -= cost + grant;
  const relation = v.mode === 'subjugated' ? 'embassy' : v.relation;
  const f: ForeignKingdom = {
    id: uid(), name: v.name, alignment: v.alignment, size: v.size, economy: 2 + v.size, stability: 2 + v.size,
    attitude: v.mode === 'colony' ? 'helpful' : 'indifferent', relation,
    treaty: relation !== 'embassy' ? v.terms : undefined, alliance: relation === 'alliance' ? v.terms : undefined,
    vassal: { mode: v.mode, viceroy: v.viceroy, peaceStreak: 0, settled: v.mode === 'colony', grant },
  };
  (k.foreign ??= []).push(f);
  if (!k.leaders.viceroy?.name) k.leaders.viceroy = { name: v.viceroy, mod: 0, leadershipFeat: false, attrs: [], active: true };
  const text = `Vassalage edict: ${v.name} becomes a ${v.mode === 'colony' ? 'colony' : 'subjugated vassal'} under Viceroy ${v.viceroy}, with a ${relation}. ${cost} BP spent and ${grant} BP granted.`;
  log(k, text, { bp: -(cost + grant) });
  useSpecialEdict(k, text);
  return f;
}

/** Subjugated vassals need a Loyalty check each Upkeep (harder by their Size ÷ 5) until three successes in a row. */
export function subjugationCheck(k: Kingdom, id: string, roll: number, rng: Rng = defaultRng) {
  const f = k.foreign!.find((x) => x.id === id)!;
  const c = kingdomCheck(k, 'loyalty', roll, -Math.floor(f.size / 5));
  const v = f.vassal!;
  let unrest = 0;
  if (c.success) v.peaceStreak += 1;
  else { v.peaceStreak = 0; unrest = changeUnrest(k, die(4, rng)); }
  if (v.peaceStreak >= 3) v.settled = true;
  k.turnState.done[`subjugation.${id}`] = c.success ? 'ok' : 'fail';
  log(k, `Holding ${f.name}: Loyalty check ${c.total} vs DC ${c.dc + Math.floor(f.size / 5)}: ${c.success ? (v.settled ? 'three in a row, peace is established' : `success (${v.peaceStreak} in a row)`) : `failure, Unrest +${unrest}`}.`, { unrest: unrest || undefined });
  return c;
}

export function blankForeign(): ForeignKingdom {
  return { id: uid(), name: 'Neighboring kingdom', alignment: 'N', size: 20, economy: 22, stability: 22, attitude: 'indifferent', relation: 'none' };
}
export { ALIGN, activeArmies };
