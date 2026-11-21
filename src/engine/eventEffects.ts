// Automated effects for the Ultimate Campaign kingdom events (Table 4-7 to 4-11).
// Each event has optional effects applied when rolled, and actions the players choose between in the Event phase.
// Things only the GM can decide (which hex is lost, placing a gifted building) are logged as notes.
import { building } from '../rules/buildings';
import { ATTR_LABEL, type Attr } from '../rules/kingdom';
import { SETTLEMENT_STATS, STAT_LABEL, type SettlementStat } from '../rules/settlement';
import { ROLE_BY_ID, type RoleId } from '../rules/leadership';
import type { ActiveEvent, Kingdom, Settlement } from '../state/types';
import { uid } from '../state/util';
import { changeUnrest, log, loseHex } from './actions';
import { defaultRng, die, explodingD6, type Rng } from './dice';
import { getHex, neighborKeys } from './map';
import { leaderFilled, settlementModifiers } from './stats';
import { kingdomCheck, resolveEvent, type CheckResult } from './turn';

// ---------- context handed to each event's rules ----------
export class Ctx {
  lines: string[] = [];
  notes: string[] = [];
  ended = false;
  bp = 0;
  unrestDelta = 0;
  constructor(public k: Kingdom, public ev: ActiveEvent, public rng: Rng) {}

  /** "1d6", "2d4", or "1d6!" (roll again on a 6 and add). */
  roll(expr: string) {
    const m = /^(\d+)d(\d+)(!?)$/.exec(expr)!;
    const [n, sides, explode] = [Number(m[1]), Number(m[2]), m[3] === '!'];
    if (explode && sides === 6 && n === 1) return explodingD6(this.rng);
    let t = 0;
    for (let i = 0; i < n; i++) t += die(sides, this.rng);
    return t;
  }
  unrest(n: number) {
    if (!n) return;
    const d = changeUnrest(this.k, n);
    this.unrestDelta += d;
    this.lines.push(`Unrest ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  treasury(n: number) {
    if (!n) return;
    this.k.treasury += n;
    this.bp += n;
    this.lines.push(`Treasury ${n > 0 ? '+' : '−'}${Math.abs(n)} BP`);
  }
  fame(n: number) {
    this.k.fame += n;
    this.lines.push(`Fame ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  /**
   * Change Economy/Loyalty/Stability/Consumption. 'event' lasts while this event is ongoing (replaced, not stacked,
   * each turn); 'next-event' until the next Event phase; 'permanent' stays until removed by hand.
   */
  mod(ch: Partial<Record<Attr | 'consumption', number>>, until: 'event' | 'next-event' | 'permanent', label = this.ev.name) {
    if (this.k.settings.permanentEventEffects) until = 'permanent';
    if (until === 'event' && this.ev.lasts !== 'resolved') until = 'next-event';
    const m = {
      id: uid(), label: `${label}${this.ev.location ? ` (${this.ev.location})` : ''}`,
      economy: ch.economy ?? 0, loyalty: ch.loyalty ?? 0, stability: ch.stability ?? 0, consumption: ch.consumption ?? 0,
      ...(until === 'permanent' ? {} : { until, eventId: this.ev.id, turn: this.k.turn }),
    };
    if (until === 'event') this.k.modifiers = this.k.modifiers.filter((x) => !(x.eventId === this.ev.id && x.until === 'event'));
    this.k.modifiers.push(m);
    const parts = (['economy', 'loyalty', 'stability', 'consumption'] as const)
      .filter((a) => ch[a]).map((a) => `${a === 'consumption' ? 'Consumption' : ATTR_LABEL[a]} ${ch[a]! > 0 ? '+' : '−'}${Math.abs(ch[a]!)}`);
    this.lines.push(`${parts.join(', ')} (${until === 'permanent' ? 'lasting' : until === 'event' ? 'while this lasts' : 'until the next Event phase'})`);
  }
  infamy(n: number) {
    this.k.infamy = Math.max(0, (this.k.infamy ?? 0) + n);
    this.lines.push(`Infamy ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  /**
   * Change settlement modifiers. 'here' is the event's settlement, 'kingdom' the whole kingdom, 'each' every
   * settlement; by default an event localized to a settlement affects it, and other events the whole kingdom.
   * Durations work like mod(); a number lasts that many turns.
   */
  smod(ch: Partial<Record<SettlementStat, number>>, until: 'event' | 'next-event' | 'permanent' | number, scope?: 'here' | 'kingdom' | 'each', label = this.ev.name) {
    if (this.k.settings.permanentEventEffects && typeof until !== 'number') until = 'permanent';
    if (until === 'event' && this.ev.lasts !== 'resolved') until = 'next-event';
    const here = this.k.settlements.find((s) => s.name === this.ev.location);
    scope ??= here ? 'here' : 'kingdom';
    const targets = scope === 'each' ? this.k.settlements.map((s) => s.id) : scope === 'here' && here ? [here.id] : [undefined];
    const list = (this.k.settlementAdjustments ??= []);
    if (until === 'event') this.k.settlementAdjustments = list.filter((a) => !(a.eventId === this.ev.id && a.until === 'event'));
    for (const settlementId of targets) {
      this.k.settlementAdjustments!.push({
        id: uid(), label, settlementId, mods: ch,
        ...(typeof until === 'number' ? { expiresTurn: this.k.turn + until, eventId: this.ev.id }
          : until === 'permanent' ? {} : { until, eventId: this.ev.id, turn: this.k.turn }),
      });
    }
    const where = scope === 'each' ? 'in each settlement' : targets[0] ? `in ${here!.name}` : 'kingdom-wide';
    const parts = SETTLEMENT_STATS.filter((st) => ch[st]).map((st) => `${STAT_LABEL[st]} ${ch[st]! > 0 ? '+' : '−'}${Math.abs(ch[st]!)}`);
    const dur = typeof until === 'number' ? `for ${until} turns` : until === 'permanent' ? 'lasting' : until === 'event' ? 'while this lasts' : 'until the next Event phase';
    this.lines.push(`${parts.join(', ')} ${where} (${dur})`);
  }
  checkMod(attr: Attr | 'all', value: number, eventsOnly = false) {
    (this.k.checkMods ??= []).push({ id: uid(), label: this.ev.name, attr, value, eventsOnly, turn: this.k.turn });
    const what = attr === 'all' ? 'all kingdom checks' : `${ATTR_LABEL[attr]} checks`;
    this.lines.push(`${value > 0 ? '+' : '−'}${Math.abs(value)} on ${eventsOnly ? 'checks to resolve continuous events' : what} until the next Event phase`);
  }
  nextUpkeep(multiplier: number, add: number, label: string) {
    const nu = (this.k.nextUpkeep ??= { multiplier: 1, add: 0, labels: [] });
    nu.multiplier *= multiplier;
    nu.add += add;
    nu.labels.push(label);
    this.lines.push(`Next Upkeep: ${label}`);
  }
  note(text: string) { this.notes.push(text); }
  end() { this.ended = true; }
  check(attr: Attr, roll?: number, bonus = 0) {
    const c = kingdomCheck(this.k, attr, roll ?? die(20, this.rng), bonus, true);
    this.lines.push(`${ATTR_LABEL[attr]} check ${c.total} vs DC ${c.dc}: ${c.success ? 'success' : 'failure'}`);
    return c;
  }
  settlement(): Settlement | undefined {
    return this.k.settlements.find((s) => s.name === this.ev.location) ?? this.k.settlements[0];
  }
  /** Placed buildings in the event's settlement. */
  buildings() {
    const s = this.settlement();
    return s ? s.districts.flatMap((d) => d.buildings.map((b) => ({ d, b }))) : [];
  }
  damageRandom(n: number) {
    const pool = this.buildings().filter((x) => !x.b.damaged && x.b.type !== 'waterway');
    const hit: string[] = [];
    for (let i = 0; i < n && pool.length; i++) {
      const [x] = pool.splice(Math.floor(this.rng() * pool.length), 1);
      x.b.damaged = true;
      hit.push(building(x.b.type).name);
    }
    if (hit.length) this.lines.push(`Damaged: ${hit.join(', ')} (no benefits until repaired for half cost)`);
    return hit.length;
  }
  destroy(target: { d: { buildings: { id: string }[] }; b: { id: string; type: string; lots: unknown[] } }) {
    target.d.buildings = target.d.buildings.filter((x) => x.id !== target.b.id);
    const s = this.settlement()!;
    for (const d of s.districts) d.buildings = d.buildings.filter((x) => x.id !== target.b.id);
    this.lines.push(`Destroyed: ${building(target.b.type).name}`);
  }
  destroyRandom() {
    const pool = this.buildings().filter((x) => x.b.type !== 'waterway');
    if (!pool.length) return;
    const x = pool[Math.floor(this.rng() * pool.length)];
    this.destroy(x);
    this.unrest(x.b.lots.length);
  }
}

export interface CheckSpec {
  attr: Attr;
  /** Bonus or penalty from the situation, e.g. buildings in the settlement. */
  bonus?: (x: Ctx) => { value: number; why: string };
}
export interface EventAction {
  id: string;
  label: string;
  /** Checks to make, in order. Their results are handed to run(). */
  checks?: CheckSpec[];
  /** The app rolls a varying number of checks itself (disasters). */
  autoChecks?: string;
  /** Only offer this action when it applies. */
  when?: (k: Kingdom, ev: ActiveEvent) => boolean;
  run: (x: Ctx, r: CheckResult[]) => void;
}
interface Resolver {
  onRoll?: (x: Ctx) => void;
  actions?: EventAction[];
}

// ---------- helpers ----------
const successes = (r: CheckResult[]) => r.filter((c) => c.success).length;
const count = (x: Ctx, types: string[]) => x.buildings().filter(({ b }) => types.includes(b.type)).length;
const countKingdom = (k: Kingdom, types: string[]) =>
  k.settlements.flatMap((s) => s.districts.flatMap((d) => d.buildings)).filter((b) => types.includes(b.type)).length;
const squatterLots = (x: Ctx) =>
  (x.k.events ?? []).filter((e) => e.eventId === 'squatters' && e.location === x.ev.location).length;

/** Brothels, Tenements, Waterfronts, and squatted lots in the settlement (Drug Den, Slavers). */
const viceBonus = (x: Ctx) => {
  const n = count(x, ['brothel', 'tenement', 'waterfront']) + squatterLots(x);
  return { value: -n, why: n ? `−${n} for Tenements, Waterfronts, and squatters` : '' };
};

const plagueBonus = (x: Ctx) => {
  const bad = count(x, ['brothel', 'foreign-quarter', 'inn', 'pier', 'stable', 'stockyard', 'tenement', 'waterfront']);
  const good = count(x, ['alchemist', 'cathedral', 'herbalist', 'hospital', 'temple']);
  const hospital = count(x, ['hospital']) * 2;
  const value = good + hospital - bad;
  return { value, why: `${good ? `+${good} healers and temples` : ''}${hospital ? `, +${hospital} Hospitals` : ''}${bad ? `, −${bad} crowded or trading buildings` : ''}`.replace(/^, /, '') };
};

const smugglerBonus = (x: Ctx) => {
  const n = countKingdom(x.k, ['pier', 'waterfront']);
  return { value: -n, why: n ? `−${n} for Piers and Waterfronts` : '' };
};

/** Farms in the event settlement's hex and the hexes around it (all Farms without a map). */
function affectedFarms(x: Ctx) {
  const m = x.k.map;
  const s = x.settlement();
  if (m?.active && s?.hexKey) {
    const keys = [s.hexKey, ...neighborKeys(m, s.hexKey).filter((n): n is string => !!n)];
    return keys.filter((hk) => getHex(m, hk).status === 'claimed' && getHex(m, hk).improvements.includes('farm')).length;
  }
  return x.k.features.farm ?? 0;
}

/** Sensational Crime: add the settlement's Law and subtract its Crime. */
const lawCrime = (x: Ctx) => {
  const s = x.settlement();
  if (!s) return { value: 0, why: '' };
  const v = settlementModifiers(x.k, s).values;
  const value = v.law - v.crime;
  return { value, why: `${value >= 0 ? '+' : '−'}${Math.abs(value)} for ${s.name}’s Law ${v.law} and Crime ${v.crime}` };
};

const continuousCount = (k: Kingdom, exceptId: string) => (k.events ?? []).filter((e) => e.lasts === 'resolved' && e.id !== exceptId).length;

const feud: Resolver = {
  actions: [{
    id: 'check', label: 'Attempt a Loyalty check', checks: [{ attr: 'loyalty' }],
    run: (x, r) => {
      if (r[0].success) { x.unrest(1); x.end(); }
      else { x.smod({ corruption: 1 }, 'event'); x.unrest(x.roll('1d6')); }
    },
  }],
};

const inquisition: Resolver = {
  actions: [{
    id: 'check', label: 'Attempt a Loyalty check', checks: [{ attr: 'loyalty' }],
    run: (x, r) => {
      const st = (x.ev.state ??= {});
      if (r[0].success) {
        st.streak = Number(st.streak ?? 0) + 1;
        if (Number(st.streak) >= 2) { x.lines.push('Two successes in a row: the zealots disperse'); x.end(); return; }
        x.mod({ loyalty: -1, stability: -1 }, 'event');
        x.smod({ lore: -1, productivity: -1 }, 'event');
      } else {
        st.streak = 0;
        x.mod({ loyalty: -2, stability: -2 }, 'event');
        x.infamy(1);
        x.smod({ law: 1, lore: -2, productivity: -2 }, 'event');
      }
    },
  }],
};

const monster: Resolver = {
  actions: [
    { id: 'party', label: 'The party deals with the monster', run: (x) => { x.lines.push('The party defeated the monster'); x.end(); } },
    {
      id: 'check', label: 'Send the kingdom’s forces (Stability check)', checks: [{ attr: 'stability' }],
      run: (x, r) => {
        if (r[0].success) { x.end(); return; }
        x.unrest(4);
        if (x.k.unrest >= 5) {
          if (x.k.map?.active) x.note('Unrest is 5 or more: the monster’s hex becomes unclaimed. Abandon it on the map.');
          else { loseHex(x.k); x.lines.push('Unrest is 5 or more: lost the monster’s hex'); }
        }
      },
    },
  ],
};

const demand = (kind: 'building' | 'improvement'): Resolver => ({
  onRoll: (x) => {
    const st = (x.ev.state ??= {});
    const build = x.roll('1d100') <= 75;
    if (kind === 'building') {
      const existing = x.buildings();
      if (!build && existing.length) st.demand = `demolish a ${building(existing[Math.floor(x.rng() * existing.length)].b.type).name}`;
      else {
        const options = ['academy', 'alchemist', 'bank', 'brewery', 'garrison', 'granary', 'graveyard', 'herbalist', 'hospital', 'inn', 'jail', 'library', 'market', 'monument', 'park', 'shrine', 'smithy', 'tavern', 'theater', 'town-hall'];
        st.demand = `build a ${building(options[Math.floor(x.rng() * options.length)]).name}`;
      }
    } else {
      const imps = ['Farm', 'Road', 'Mine', 'Quarry', 'Sawmill', 'Watchtower', 'Fishery'];
      st.demand = `${build ? 'build' : 'tear down'} a ${imps[Math.floor(x.rng() * imps.length)]}`;
    }
    x.lines.push(`The citizens demand you ${st.demand}`);
  },
  actions: [
    { id: 'met', label: 'The demand has been met', run: (x) => { x.lines.push('Demand met'); x.end(); } },
    {
      id: 'suppress', label: 'Suppress it (Loyalty check)', checks: [{ attr: 'loyalty' }],
      run: (x, r) => {
        if (r[0].success) { x.mod({ loyalty: -2 }, 'permanent', 'Suppressed demand'); x.unrest(1); x.end(); }
        else x.lines.push('The demand still stands');
      },
    },
    {
      id: 'wait', label: 'Not met yet', when: (k, ev) => ev.startedTurn < k.turn,
      run: (x) => { x.unrest(1); x.lines.push('Still not met'); },
    },
  ],
});

const discovery: Resolver = { onRoll: (x) => { x.fame(1); x.smod({ lore: x.roll('1d4') }, 'permanent'); } };

// ---------- the events ----------
export const RESOLVERS: Record<string, Resolver> = {
  // Beneficial kingdom events
  'archaeological-find': {
    onRoll: (x) => {
      x.smod({ lore: 1 }, 'permanent', 'kingdom');
      if (countKingdom(x.k, ['museum'])) x.note('Your Museum receives 10,000 gp worth of historical artifacts');
    },
  },
  'diplomatic-overture': {
    onRoll: (x) => {
      const d = x.roll('1d100');
      x.treasury(x.roll('1d4'));
      x.note(`A neighboring kingdom proposes ${d <= 60 ? 'an embassy' : d <= 90 ? 'a treaty' : 'an alliance'}`);
    },
  },
  discovery,
  'economic-boom': { onRoll: (x) => x.treasury(x.roll('1d6!')) },
  'festive-invitation': {
    actions: [
      {
        id: 'attend', label: 'Attend and bring gifts (1d4 BP)',
        run: (x) => {
          x.treasury(-x.roll('1d4'));
          x.smod({ society: 1 }, 12, 'kingdom');
          x.note('For 1 year: Fame +1 and +2 on edict checks relating to that kingdom');
          x.end();
        },
      },
      { id: 'decline', label: 'Decline', run: (x) => { x.lines.push('Declined the invitation'); x.end(); } },
    ],
  },
  'food-surplus': { onRoll: (x) => x.nextUpkeep(0.5, 0, 'Consumption halved by Food Surplus') },
  'good-weather': { onRoll: (x) => { x.mod({ economy: 2, loyalty: 2 }, 'next-event'); x.smod({ productivity: 2 }, 'next-event', 'kingdom'); } },
  'land-rush': {
    actions: [{
      id: 'check', label: 'Attempt a Loyalty check', checks: [{ attr: 'loyalty' }],
      run: (x, r) => {
        x.mod({ stability: -1 }, 'permanent', 'Land rush (remove after building a matching improvement next to it)');
        x.smod({ productivity: -1, society: -1 }, 'permanent', 'kingdom', 'Land rush (remove after building a matching improvement next to it)');
        x.unrest(r[0].success ? 1 : x.roll('1d4'));
        x.end();
      },
    }],
  },
  'natural-blessing': { onRoll: (x) => x.checkMod('stability', 4) },
  'new-subjects': {
    onRoll: (x) => { x.mod({ stability: 1 }, 'permanent', 'New subjects'); x.smod({ society: 1 }, 'permanent', 'kingdom'); x.unrest(-1); x.treasury(x.roll('1d6!')); },
  },
  'political-calm': {
    onRoll: (x) => {
      x.unrest(-x.roll('1d6'));
      x.checkMod('all', 2, true);
      if (x.k.unrest === 0 && continuousCount(x.k, x.ev.id) === 0) {
        x.mod({ loyalty: 1, stability: 1 }, 'permanent', 'Political calm');
        x.smod({ law: 1 }, 'permanent', 'kingdom');
      }
    },
  },

  // Dangerous kingdom events
  'assassination-attempt': {
    onRoll: (x) => {
      const roles = (Object.keys(x.k.leaders) as RoleId[]).filter((r) => leaderFilled(x.k, r));
      if (!roles.length) return;
      const role = roles[Math.floor(x.rng() * roles.length)];
      x.ev.state = { role, name: x.k.leaders[role]!.name };
      x.ev.location = `${x.k.leaders[role]!.name}, ${ROLE_BY_ID[role].name}`;
      x.lines.push(`The target is ${x.ev.location}`);
    },
    actions: [
      { id: 'pc', label: 'The target is a PC: run the encounter', run: (x) => { x.note('Run an encounter with an assassin of CR equal to the target’s level'); x.end(); } },
      {
        id: 'npc', label: 'The target is an NPC (Stability check)', checks: [{ attr: 'stability' }],
        run: (x, r) => {
          if (!r[0].success) {
            x.unrest(x.roll('1d6'));
            const role = x.ev.state?.role as RoleId | undefined;
            if (role && x.k.leaders[role]) {
              x.k.leaders[role]!.active = false;
              x.lines.push(`${x.ev.state!.name} was killed; the ${ROLE_BY_ID[role].name} role is vacant until you appoint someone`);
            }
          } else x.lines.push('The assassin was stopped');
          x.end();
        },
      },
    ],
  },
  'bandit-activity': {
    actions: [{
      id: 'check', label: 'Attempt a Stability check', checks: [{ attr: 'stability' }],
      run: (x, r) => { if (!r[0].success) x.treasury(-x.roll('1d6!')); else x.lines.push('The bandits were stopped'); x.end(); },
    }],
  },
  feud,
  'food-shortage': {
    actions: [{
      id: 'check', label: 'Attempt a Stability check', checks: [{ attr: 'stability' }],
      run: (x, r) => {
        x.nextUpkeep(r[0].success ? 1.5 : 2, 0, r[0].success ? 'Consumption +50% from Food Shortage' : 'Consumption doubled by Food Shortage');
        x.end();
      },
    }],
  },
  'improvement-demand': demand('improvement'),
  inquisition,
  'large-disaster': {
    actions: [{
      id: 'check', label: 'Brace for it (Stability check per threatened hex)', autoChecks: '1 hex, or 1 + 1d6 if widespread',
      run: (x) => {
        const widespread = x.roll('1d6') === 6;
        const n = widespread ? 1 + x.roll('1d6') : 1;
        x.lines.push(`${n} improved hex${n > 1 ? 'es' : ''} threatened${widespread ? ' (widespread)' : ''}`);
        let failed = 0;
        for (let i = 0; i < n; i++) if (!x.check('stability').success) failed++;
        if (failed) { x.unrest(failed); x.note(`Remove ${failed} terrain improvement${failed > 1 ? 's' : ''} destroyed by the disaster (one per failed hex)`); }
        x.end();
      },
    }],
  },
  'monster-attack': monster,
  plague: {
    actions: [{
      id: 'check', label: 'Fight the plague (two Stability checks)', checks: [{ attr: 'stability', bonus: plagueBonus }, { attr: 'stability', bonus: plagueBonus }],
      run: (x, r) => {
        const s = successes(r);
        if (s === 2) { x.end(); x.mod({ stability: -2 }, 'next-event'); x.treasury(-x.roll('1d3')); return; }
        x.mod({ stability: -4 }, 'event');
        x.treasury(-x.roll('1d6'));
        x.unrest(x.roll(s === 1 ? '1d3' : '1d6'));
        if (s === 0) x.note('The plague spreads to an adjacent hex in the next Event phase');
      },
    }],
  },
  'public-scandal': {
    onRoll: (x) => x.infamy(1),
    actions: [{
      id: 'check', label: 'Attempt a Loyalty check', checks: [{ attr: 'loyalty' }],
      run: (x, r) => { if (!r[0].success) { x.unrest(2); x.checkMod('loyalty', -4); } x.end(); },
    }],
  },
  smugglers: {
    actions: [{
      id: 'check', label: 'Crack down (Loyalty and Stability checks)', checks: [{ attr: 'loyalty', bonus: smugglerBonus }, { attr: 'stability', bonus: smugglerBonus }],
      run: (x, r) => {
        const s = successes(r);
        if (s === 2) { x.lines.push('The smugglers were stopped'); x.end(); return; }
        const until = s === 1 ? 'next-event' : 'event';
        x.smod({ corruption: x.roll(s === 1 ? '1d2' : '1d4') }, until, 'each');
        x.smod({ crime: 1, productivity: -x.roll(s === 1 ? '1d3' : '1d6') }, until, 'kingdom');
        x.treasury(-x.roll(s === 1 ? '1d3' : '1d6'));
        if (s === 1) x.end();
      },
    }],
  },

  // Beneficial settlement events
  boomtown: {
    onRoll: (x) => {
      const s = x.settlement();
      const n = s ? s.districts.flatMap((d) => d.buildings).filter((b) => !b.damaged && (building(b.type).economy ?? 0) > 0).length : 0;
      if (n) x.mod({ economy: n }, 'next-event');
      x.smod({ corruption: x.roll('1d4') }, 'next-event');
    },
  },
  'justice-prevails': { onRoll: (x) => { x.mod({ loyalty: 1 }, 'permanent', 'Justice prevails'); x.smod({ law: 1, crime: -1 }, 'permanent'); x.unrest(-1); } },
  'noblesse-oblige': {
    onRoll: (x) => {
      const type = x.roll('1d100') <= 50 ? 'Monument' : 'Park';
      x.note(`A noble family builds a ${type} in ${x.settlement()?.name ?? 'the settlement'} at its own expense: turn on Setup mode and place it for free`);
    },
  },
  'outstanding-success': { onRoll: (x) => { x.fame(1); x.treasury(x.roll('1d6')); x.unrest(-2); x.checkMod('economy', 4); } },
  pilgrimage: { onRoll: (x) => x.note('Pilgrims hold a religious festival here at no cost to you') },
  'remarkable-treasure': { onRoll: (x) => x.note('Fill an open magic item slot with a better item than normal (base value counts as 50% higher)') },
  'unexpected-find': { onRoll: (x) => x.note('A temporary minor (01–70) or medium (71–100) magic item slot appears and fills next Upkeep') },
  'visiting-celebrity': { onRoll: (x) => { x.fame(1); x.treasury(x.roll('1d6!')); } },
  'wealthy-immigrant': {
    onRoll: (x) => { (x.ev.state ??= {}).offer = x.roll('1d100') <= 75 ? 'Mansion' : 'Noble Villa'; x.lines.push(`Offers to build a ${x.ev.state.offer}`); },
    actions: [
      { id: 'allow', label: 'Allow it', run: (x) => { x.note(`Turn on Setup mode and place the ${x.ev.state?.offer} for free`); x.end(); } },
      { id: 'refuse', label: 'Refuse', run: (x) => { x.lines.push('Refused the offer'); x.end(); } },
    ],
  },

  // Dangerous settlement events
  'building-demand': demand('building'),
  'crop-failure': {
    actions: [{
      id: 'check', label: 'Save the harvest (two Stability checks)', checks: [{ attr: 'stability' }, { attr: 'stability' }],
      run: (x, r) => {
        const s = successes(r);
        const farms = affectedFarms(x);
        if (s < 2 && farms) x.nextUpkeep(1, (2 - s) * farms, `${farms} Farm${farms > 1 ? 's' : ''} ${s ? 'reduce Consumption by only 1' : 'don’t reduce Consumption'} (Crop Failure)`);
        x.end();
      },
    }],
  },
  'cult-activity': {
    actions: [{
      id: 'check', label: 'Root out the cult (Loyalty and Stability checks)', checks: [{ attr: 'loyalty' }, { attr: 'stability' }],
      run: (x, r) => {
        const f = 2 - successes(r);
        if (!f) { x.lines.push('The cult was disbanded'); x.end(); return; }
        x.unrest(f);
        x.mod({ stability: -f }, f === 2 ? 'event' : 'next-event');
        x.smod({ productivity: -f, society: -f }, f === 2 ? 'event' : 'next-event');
        if (f < 2) x.end();
      },
    }],
  },
  'drug-den': {
    actions: [{
      id: 'check', label: 'Shut it down (Loyalty and Stability checks)', checks: [{ attr: 'loyalty', bonus: viceBonus }, { attr: 'stability', bonus: viceBonus }],
      run: (x, r) => {
        const s = successes(r);
        if (s === 2) { x.lines.push('The drug den was eliminated'); x.end(); return; }
        x.smod({ crime: 1 }, s === 1 ? 'next-event' : 'event');
        x.unrest(1);
        if (s === 1) { x.end(); return; }
        x.mod({ economy: -1, loyalty: -1, stability: -1 }, 'event');
        x.note('A second drug den appears next Event phase, here (01–50) or in the nearest settlement (51–100)');
      },
    }],
  },
  'localized-disaster': {
    actions: [{
      id: 'check', label: 'Brace for it (Stability check per threatened lot)', autoChecks: '1d6 lots, or 6 + 1d6 if widespread',
      run: (x) => {
        let n = x.roll('1d6');
        if (n === 6) n += x.roll('1d6');
        const pool = x.buildings().filter((b) => b.b.type !== 'waterway');
        const threatened = [];
        while (threatened.length < Math.min(n, pool.length)) threatened.push(pool.splice(Math.floor(x.rng() * pool.length), 1)[0]);
        x.lines.push(`${n} lot${n > 1 ? 's' : ''} threatened; ${threatened.length} with buildings`);
        for (const t of threatened) if (!x.check('stability').success) { x.destroy(t); x.unrest(1); }
        x.end();
      },
    }],
  },
  'sensational-crime': {
    actions: [{
      id: 'check', label: 'Catch the criminal (two Stability checks)', checks: [{ attr: 'stability', bonus: lawCrime }, { attr: 'stability', bonus: lawCrime }],
      run: (x, r) => {
        const s = successes(r);
        if (s === 2) { x.lines.push('The criminal was caught'); x.end(); return; }
        if (s === 1) { x.unrest(1); return; }
        x.smod({ law: -1 }, 'event');
        x.mod({ loyalty: -1 }, 'event');
        x.treasury(-x.roll('1d4'));
        x.unrest(2);
      },
    }],
  },
  slavers: {
    actions: [{
      id: 'check', label: 'Stop the slavers (Loyalty and Stability checks)', checks: [{ attr: 'loyalty', bonus: viceBonus }, { attr: 'stability', bonus: viceBonus }],
      run: (x, r) => {
        const s = successes(r);
        if (s === 2) { x.lines.push('The slavers were caught'); x.end(); return; }
        const n = 2 - s;
        // The printed rule says Unrest "decreases"; read as a typo and applied as an increase.
        x.mod({ loyalty: -n, stability: -n }, s === 1 ? 'next-event' : 'event');
        x.unrest(n);
        if (s === 1) x.end();
      },
    }],
  },
  squatters: {
    onRoll: (x) => { x.fame(-1); x.mod({ stability: -1 }, 'event'); x.unrest(2); },
    actions: [{
      id: 'check', label: 'Disperse them (Stability check)', checks: [{ attr: 'stability' }],
      run: (x, r) => {
        if (r[0].success) { x.note('Build a House or Tenement on that lot next turn, or Infamy +1 and Unrest +2'); x.end(); }
        else x.lines.push('The squatters stay; nothing can be built on that lot');
      },
    }],
  },
  vandals: {
    actions: [{
      id: 'check', label: 'Stop the vandals (Loyalty and Stability checks)', checks: [{ attr: 'loyalty' }, { attr: 'stability' }],
      run: (x, r) => {
        const s = successes(r);
        if (s === 1) { x.smod({ society: -1 }, 'next-event'); x.damageRandom(1); }
        if (s === 0) { x.destroyRandom(); x.damageRandom(x.roll('1d3')); }
        if (s === 2) x.lines.push('The vandals were stopped');
        x.end();
      },
    }],
  },
};

// ---------- running ----------
export const resolverFor = (ev: ActiveEvent) => (ev.eventId ? RESOLVERS[ev.eventId] : undefined);
export const hasActions = (ev: ActiveEvent) => !!resolverFor(ev)?.actions?.length;
export const actionsFor = (k: Kingdom, ev: ActiveEvent) => (resolverFor(ev)?.actions ?? []).filter((a) => !a.when || a.when(k, ev));

function finish(x: Ctx, title: string) {
  const { k, ev } = x;
  const summary = [...x.lines, ...x.notes.map((n) => `Note: ${n}`)].join('. ');
  if (summary) {
    ev.history.push({ turn: k.turn, text: summary + '.' });
    log(k, `${ev.name}${ev.location ? ` (${ev.location})` : ''}: ${title ? `${title}. ` : ''}${summary}.`, {
      bp: x.bp || undefined, unrest: x.unrestDelta || undefined,
    });
  }
  if (x.ended && ev.lasts === 'resolved') resolveEvent(k, ev.id);
  else if (x.ended) ev.handledTurn = k.turn;
}

/** Effects that happen as soon as the event is rolled. */
export function applyOnRoll(k: Kingdom, ev: ActiveEvent, rng: Rng = defaultRng) {
  const r = resolverFor(ev);
  if (!r) return;
  const x = new Ctx(k, ev, rng);
  r.onRoll?.(x);
  finish(x, '');
  if (!r.actions?.length) ev.handledTurn = k.turn;
}

export interface CheckBonus { value: number; why: string }
export function bonusesFor(k: Kingdom, ev: ActiveEvent, a: EventAction): CheckBonus[] {
  const x = new Ctx(k, ev, defaultRng);
  return (a.checks ?? []).map((c) => c.bonus?.(x) ?? { value: 0, why: '' });
}

/**
 * Carry out one of an event's actions. rolls[i] is the natural d20 for check i (blank: the app rolls).
 * `extra` applies to every check; `hired` (adventurers) applies to the first check only.
 */
export function runAction(
  k: Kingdom, eventId: string, actionId: string, rolls: (number | undefined)[] = [], extra = 0, hired = 0, rng: Rng = defaultRng,
) {
  const ev = k.events?.find((e) => e.id === eventId);
  if (!ev) return null;
  const a = actionsFor(k, ev).find((y) => y.id === actionId);
  if (!a) return null;
  const x = new Ctx(k, ev, rng);
  const results = (a.checks ?? []).map((c, i) => {
    const b = c.bonus?.(x).value ?? 0;
    return x.check(c.attr, rolls[i], b + extra + (i === 0 ? hired : 0));
  });
  a.run(x, results);
  ev.addressedTurn = k.turn;
  ev.handledTurn = k.turn; // once per Event phase
  finish(x, a.label);
  return results;
}
