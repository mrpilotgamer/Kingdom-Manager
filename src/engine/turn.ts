// Kingdom turn resolution (Ultimate Campaign pg. 205-208).
import eventsData from '../rules/events.json';
import { ATTR_LABEL, ATTRS, type Attr } from '../rules/kingdom';
import type { ActiveEvent, Kingdom, Phase } from '../state/types';
import { uid } from '../state/util';
import { changeUnrest, log } from './actions';
import { defaultRng, die, type Rng } from './dice';
import { computeStats } from './stats';

export const PHASES: { id: Phase; label: string; summary: string }[] = [
  { id: 'upkeep', label: 'Upkeep', summary: 'Check Stability, pay Consumption, and deal with Unrest.' },
  { id: 'edict', label: 'Edict', summary: 'Assign leaders, claim hexes, build, and set edicts.' },
  { id: 'income', label: 'Income', summary: 'Withdraw or deposit funds, then collect taxes.' },
  { id: 'event', label: 'Event', summary: 'See whether something good or bad happens.' },
];

export interface CheckResult {
  attr: Attr;
  roll: number;
  total: number;
  dc: number;
  success: boolean;
  margin: number;
  parts: string;
}

/** 1d20 + attribute − Unrest (+ bonus) vs Control DC. Natural 1 fails, natural 20 succeeds. Anarchy treats results as 0. */
export function kingdomCheck(k: Kingdom, attr: Attr, roll: number, bonus = 0): CheckResult {
  const st = computeStats(k);
  const anarchy = k.unrest >= 20;
  const total = anarchy ? 0 : roll + st[attr] - k.unrest + bonus;
  const dc = st.controlDC;
  const success = roll === 20 || (roll !== 1 && total >= dc);
  const parts = anarchy
    ? 'Anarchy: all check results count as 0'
    : `${roll} (d20) ${st[attr] >= 0 ? '+' : '−'} ${Math.abs(st[attr])} ${ATTR_LABEL[attr]}${k.unrest ? ` − ${k.unrest} Unrest` : ''}${bonus ? ` ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)} bonus` : ''}`;
  return { attr, roll, total, dc, success, margin: total - dc, parts };
}

const done = (k: Kingdom, key: string, text: string) => {
  k.turnState.done[key] = text;
};

export function resolveStability(k: Kingdom, roll: number, rng: Rng = defaultRng) {
  const c = kingdomCheck(k, 'stability', roll);
  let text: string, unrest = 0, bp = 0;
  if (c.success) {
    if (k.unrest > 0) { unrest = changeUnrest(k, -1); text = 'Success: Unrest −1.'; }
    else { k.treasury += 1; bp = 1; text = 'Success with no Unrest: +1 BP instead.'; }
  } else if (c.margin >= -4) {
    unrest = changeUnrest(k, 1); text = 'Failed by 4 or less: Unrest +1.';
  } else {
    const d4 = die(4, rng);
    unrest = changeUnrest(k, d4); text = `Failed by 5 or more: Unrest +${d4} (1d4).`;
  }
  const summary = `Stability check ${c.total} vs DC ${c.dc}. ${text}`;
  log(k, summary, { bp, unrest });
  done(k, 'upkeep.stability', summary);
  return c;
}

export function payConsumption(k: Kingdom) {
  const st = computeStats(k);
  k.treasury -= st.consumption;
  let unrest = 0;
  let text = `Paid ${st.consumption} BP Consumption.`;
  if (k.treasury < 0) { unrest = changeUnrest(k, 2); text += ' Treasury is negative: Unrest +2.'; }
  log(k, text, { bp: -st.consumption, unrest });
  done(k, 'upkeep.consumption', text);
}

export function modifyUnrest(k: Kingdom) {
  const st = computeStats(k);
  const negative = ATTRS.filter((a) => st[a] < 0);
  const gain = negative.length + st.vacancyUnrest;
  const unrest = changeUnrest(k, gain);
  const bits = [];
  if (negative.length) bits.push(`${negative.map((a) => ATTR_LABEL[a]).join(', ')} negative (+${negative.length})`);
  if (st.vacancyUnrest) bits.push(`vacant roles (+${st.vacancyUnrest})`);
  const text = gain ? `Unrest +${gain}: ${bits.join('; ')}.` : 'No attribute is negative and no Unrest-causing roles are vacant.';
  log(k, text, { unrest });
  done(k, 'upkeep.unrest', text);
}

/** Royal Enforcer: Unrest −1, then a Loyalty check; failure costs 1 Loyalty (tracked as a modifier). */
export function royalEnforcer(k: Kingdom, roll: number) {
  const unrest = changeUnrest(k, -1);
  const c = kingdomCheck(k, 'loyalty', roll);
  let text = `Royal Enforcer cracked down: Unrest −1. Loyalty check ${c.total} vs DC ${c.dc}`;
  if (c.success) text += ': success.';
  else {
    text += ': failed, Loyalty −1.';
    const m = k.modifiers.find((x) => x.id === 'enforcer');
    if (m) m.loyalty -= 1;
    else k.modifiers.push({ id: 'enforcer', label: 'Royal Enforcer crackdowns', economy: 0, loyalty: -1, stability: 0, consumption: 0 });
  }
  log(k, text, { unrest });
  done(k, 'upkeep.enforcer', text);
}

export function withdraw(k: Kingdom, bp: number) {
  k.treasury -= bp;
  const unrest = changeUnrest(k, bp);
  const text = `Withdrew ${bp} BP for personal use (${(bp * 2000).toLocaleString()} gp). Unrest +${bp}.`;
  log(k, text, { bp: -bp, unrest });
  done(k, 'income.withdraw', text);
}

export function deposit(k: Kingdom, gp: number) {
  const bp = Math.floor(gp / 4000);
  k.treasury += bp;
  const text = `Deposited ${gp.toLocaleString()} gp: +${bp} BP.`;
  log(k, text, { bp });
  done(k, 'income.deposit', text);
}

export function collectTaxes(k: Kingdom, roll: number) {
  const st = computeStats(k);
  if (!st.canCollectTaxes) {
    const text = 'No Treasurer: the kingdom collects no taxes this turn.';
    log(k, text);
    done(k, 'income.taxes', text);
    return null;
  }
  const c = kingdomCheck(k, 'economy', roll);
  const taxes = c.success ? Math.floor(c.total / 3) : 0;
  const gained = taxes + st.incomeBonus;
  k.treasury += gained;
  const text = `Economy check ${c.total} vs DC ${c.dc}: ${c.success ? `${taxes} BP in taxes` : 'failed, no taxes'}${st.incomeBonus ? `, +${st.incomeBonus} BP from Mines, Quarries, and Sawmills` : ''}.`;
  log(k, text, { bp: gained });
  done(k, 'income.taxes', text);
  return c;
}

// ---------- events ----------
interface Row { min: number; max: number; event: string }
const TABLES = eventsData.tables as Record<string, { title: string; rows: Row[] }>;
const EVENTS = eventsData.events as Record<string, { name: string; tags: string; text: string }>;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface RolledEvent { id: string; name: string; tags: string; text: string; table: string; roll: number }

function fromTable(table: string, rng: Rng): RolledEvent {
  const roll = die(100, rng);
  const row = TABLES[table].rows.find((r) => roll >= r.min && roll <= r.max)!;
  const id = slug(row.event);
  const e = EVENTS[id];
  return { id, name: e?.name ?? row.event, tags: e?.tags ?? '', text: e?.text ?? '', table: TABLES[table].title, roll };
}

function specialEvent(id: string, roll: number): RolledEvent {
  const e = EVENTS[id];
  return { id, name: e.name, tags: e.tags, text: e.text, table: 'Table 4–7: Event Type', roll };
}

const ROLL_AGAIN_HIGH = ['bandit-activity', 'squatters', 'monster-attack', 'vandals'];
const BLESSINGS = ['natural-blessing', 'good-weather'];

/**
 * Table 4-7, then the matching sub-table.
 * 01-04: blessing/good weather and roll again (a duplicate is ignored and ends the rolling).
 * 97-100: bandits/squatters/monster/vandals and roll again (a duplicate happens elsewhere).
 */
export function rollEventType(rng: Rng): RolledEvent[] {
  const out: RolledEvent[] = [];
  for (let guard = 0; guard < 5; guard++) {
    const r = die(100, rng);
    if (r <= 4) {
      const id = BLESSINGS[r <= 2 ? 0 : 1];
      if (out.some((e) => e.id === id)) return out;
      out.push(specialEvent(id, r));
      continue;
    }
    if (r >= 97) {
      out.push(specialEvent(ROLL_AGAIN_HIGH[r - 97], r));
      continue;
    }
    const table = r <= 25 ? '4-8' : r <= 50 ? '4-9' : r <= 75 ? '4-10' : '4-11';
    const ev = fromTable(table, rng);
    if (!(BLESSINGS.includes(ev.id) && out.some((e) => e.id === ev.id))) out.push(ev);
    return out;
  }
  return out;
}

export function eventChance(k: Kingdom) {
  return k.eventLastTurn ? 25 : 75;
}

// ---------- ongoing events ----------
export const isContinuous = (tags: string) => /continuous/i.test(tags);
export const lastsUntilNextEvent = (text: string) => /until the next Event phase/i.test(text);

/** Start tracking an event. Settlement events land on a random settlement unless a location is given. */
export function trackEvent(
  k: Kingdom,
  e: { eventId?: string; name: string; tags: string; text: string },
  lasts: ActiveEvent['lasts'],
  location?: string,
  rng: Rng = defaultRng,
) {
  k.events ??= [];
  if (!location && /settlement/i.test(e.tags) && !/hex or settlement/i.test(e.tags) && k.settlements.length)
    location = k.settlements[Math.floor(rng() * k.settlements.length)].name;
  const ev: ActiveEvent = {
    id: uid(), eventId: e.eventId, name: e.name, tags: e.tags, text: e.text, startedTurn: k.turn, lasts, location,
    addressedTurn: k.turn, history: [{ turn: k.turn, text: lasts === 'resolved' ? 'Began.' : 'Began; lasts until the next Event phase.' }],
  };
  k.events.push(ev);
  log(k, `${ev.name}${location ? ` (${location})` : ''} ${lasts === 'resolved' ? 'is ongoing until resolved' : 'lasts until the next Event phase'}.`);
  return ev;
}

/** A kingdom check made for an ongoing event. Its effects are applied by hand; the result is recorded. */
export function eventCheck(k: Kingdom, id: string, attr: Attr, roll: number, bonus = 0) {
  const ev = k.events?.find((e) => e.id === id);
  if (!ev) return null;
  const c = kingdomCheck(k, attr, roll, bonus);
  const text = `${ATTR_LABEL[attr]} check ${c.total} vs DC ${c.dc}: ${c.success ? 'success' : 'failure'}.`;
  ev.history.push({ turn: k.turn, text });
  ev.addressedTurn = k.turn;
  log(k, `${ev.name}: ${text}`);
  return c;
}

export function continueEvent(k: Kingdom, id: string) {
  const ev = k.events?.find((e) => e.id === id);
  if (!ev) return;
  ev.addressedTurn = k.turn;
  ev.history.push({ turn: k.turn, text: 'Continues.' });
  log(k, `${ev.name}${ev.location ? ` (${ev.location})` : ''} continues.`);
}

export function resolveEvent(k: Kingdom, id: string) {
  const ev = k.events?.find((e) => e.id === id);
  if (!ev) return;
  k.events = k.events!.filter((e) => e.id !== id);
  log(k, `${ev.name}${ev.location ? ` (${ev.location})` : ''} resolved after ${k.turn - ev.startedTurn + 1} turn${k.turn === ev.startedTurn ? '' : 's'}.`);
}

/** Ongoing events still waiting to be dealt with this Event phase. */
export const pendingEvents = (k: Kingdom) =>
  (k.events ?? []).filter((e) => e.lasts === 'resolved' && e.startedTurn < k.turn && e.addressedTurn !== k.turn);

export function rollEvents(k: Kingdom, rng: Rng = defaultRng) {
  // Events that lasted "until the next Event phase" end now.
  for (const e of (k.events ?? []).filter((x) => x.lasts === 'next-event' && x.startedTurn < k.turn)) {
    log(k, `${e.name}${e.location ? ` (${e.location})` : ''} has ended.`);
  }
  k.events = (k.events ?? []).filter((x) => !(x.lasts === 'next-event' && x.startedTurn < k.turn));
  const chance = eventChance(k);
  const roll = die(100, rng);
  const occurs = roll <= chance;
  const events = occurs ? rollEventType(rng) : [];
  const text = occurs
    ? `Event roll ${roll} (≤ ${chance}%): ${events.map((e) => e.name).join(' + ')}.`
    : `Event roll ${roll} (needed ≤ ${chance}%): no event this turn.`;
  log(k, text);
  done(k, 'event.roll', text);
  k.turnState.done['event.occurred'] = occurs ? 'yes' : '';
  k.turnState.done['event.list'] = JSON.stringify(events);
  for (const e of events) {
    if (isContinuous(e.tags)) trackEvent(k, { eventId: e.id, name: e.name, tags: e.tags, text: e.text }, 'resolved', undefined, rng);
    else if (lastsUntilNextEvent(e.text)) trackEvent(k, { eventId: e.id, name: e.name, tags: e.tags, text: e.text }, 'next-event', undefined, rng);
  }
  return { roll, chance, occurs, events };
}

export function endTurn(k: Kingdom) {
  k.eventLastTurn = !!k.turnState.done['event.occurred'];
  log(k, `Turn ${k.turn} ended. Treasury ${k.treasury} BP, Unrest ${k.unrest}.`);
  k.turn += 1;
  k.turnState = { phase: 'upkeep', done: {}, buildings: 0, freeHousingUsed: false, hexClaims: 0, improvements: 0, settlements: 0 };
}

export const EVENT_INDEX = EVENTS;
