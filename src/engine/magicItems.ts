// Magic items in settlements (Ultimate Campaign pg. 213): buildings create item slots; each Upkeep phase every
// district with an open slot rolls d% (51-100) to fill one, with an item no pricier than the settlement's base value.
import { building } from '../rules/buildings';
import {
  ANY_KIND, BASE_ARMOR, BASE_SHIELDS, BASE_WEAPONS, BONUSES, GRADE_BANDS, KIND_LABEL, NAMED, POTION_SPELLS, SPELL_LEVELS, SPELLS,
  type Grade, type ItemKind,
} from '../rules/magicItemTables';
import type { District, Kingdom, MagicItem, PlacedBuilding, Settlement } from '../state/types';
import { uid } from '../state/util';
import { changeUnrest, log } from './actions';
import { defaultRng, die, type Rng } from './dice';
import { settlementStats } from './stats';
import { kingdomCheck } from './turn';

export interface SlotSpec { grade: Grade; kinds: (ItemKind | 'any')[] }

const cache = new Map<string, SlotSpec[]>();
/** Parse a building's "Magic Items" line, e.g. "3 minor scrolls or wondrous items, 2 medium scrolls or wondrous items". */
export function slotsFor(type: string): SlotSpec[] {
  if (cache.has(type)) return cache.get(type)!;
  const text = building(type).magicItems ?? '';
  const out: SlotSpec[] = [];
  const re = /(\d+) (minor|medium|major) (.+?)(?=[,;] \d+ (?:minor|medium|major)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const words = m[3].toLowerCase();
    const kinds: (ItemKind | 'any')[] = [];
    const add = (k: ItemKind | 'any', test: RegExp) => { if (test.test(words)) kinds.push(k); };
    add('potion', /potion/); add('scroll', /scroll/); add('wand', /wand/); add('ring', /ring/); add('wondrous', /wondrous/);
    add('armor', /armor/); add('shield', /shield/); add('weapon', /weapon/);
    if (!kinds.length) kinds.push('any');
    for (let i = 0; i < Number(m[1]); i++) out.push({ grade: m[2] as Grade, kinds });
  }
  cache.set(type, out);
  return out;
}

export const slotLabel = (s: SlotSpec) =>
  `${s.grade} ${s.kinds.map((k) => KIND_LABEL[k]).join(' or ')}`;

// ---------- rolling items ----------
function weighted<T>(rows: [T, number][], rng: Rng): T {
  const total = rows.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [v, w] of rows) { if ((r -= w) < 0) return v; }
  return rows[rows.length - 1][0];
}
const pick = <T,>(list: T[], rng: Rng) => list[Math.floor(rng() * list.length)];
const cl = (level: number) => (level === 0 ? 1 : 2 * level - 1);
const spellPrice = (level: number, per: number) => (level === 0 ? 0.5 : level) * cl(level) * per;

/** One item of a kind and grade no pricier than `cap`, or null if none can be. */
export function rollItem(kind: ItemKind, grade: Grade, cap: number, rng: Rng = defaultRng, coreOnly = false): MagicItem | null {
  if (kind === 'potion' || kind === 'scroll' || kind === 'wand') {
    const per = kind === 'potion' ? 50 : kind === 'scroll' ? 25 : 750;
    const levels = SPELL_LEVELS[kind][grade].filter(([lv]) => spellPrice(lv, per) <= cap);
    if (!levels.length) return null;
    const lv = weighted(levels, rng);
    const tradition = kind === 'potion' ? undefined : rng() < 0.7 ? 'arcane' : 'divine';
    const names = kind === 'potion' ? POTION_SPELLS[lv] : SPELLS[tradition!][String(lv)] ?? [];
    if (!names.length) return null;
    const spell = pick(names, rng);
    const label = kind === 'potion' ? (spell.includes('(oil)') ? `Oil of ${spell.replace(' (oil)', '')}` : `Potion of ${spell}`)
      : `${kind === 'scroll' ? `${tradition === 'arcane' ? 'Arcane' : 'Divine'} scroll` : 'Wand'} of ${spell}`;
    return { id: uid(), name: `${label} (CL ${cl(lv)})`, price: spellPrice(lv, per), kind, grade };
  }
  if (kind === 'armor' || kind === 'shield' || kind === 'weapon') {
    const bases = kind === 'weapon' ? BASE_WEAPONS : kind === 'armor' ? BASE_ARMOR : BASE_SHIELDS;
    const options: { name: string; price: number }[] = [];
    for (const bonus of BONUSES[grade]) for (const [n, cost] of bases) {
      const price = kind === 'weapon' ? 300 + cost + bonus * bonus * 2000 : 150 + cost + bonus * bonus * 1000;
      if (price <= cap) options.push({ name: `+${bonus} ${n}`, price });
    }
    if (!options.length) return null;
    const o = pick(options, rng);
    return { id: uid(), name: o.name, price: o.price, kind, grade };
  }
  const [lo, hi] = GRADE_BANDS[grade];
  const list = NAMED[kind].filter((x) => x.p >= lo && x.p <= Math.min(hi, cap) && (!coreOnly || x.c));
  if (!list.length) return null;
  const it = pick(list, rng);
  return { id: uid(), name: it.n, price: it.p, kind, grade };
}

/** Fill a slot: pick one of its kinds at random (equal chance), reroll other kinds if one can't fit the base value. */
export function rollForSlot(spec: SlotSpec, cap: number, rng: Rng = defaultRng, coreOnly = false): MagicItem | null {
  const order = [...spec.kinds].sort(() => rng() - 0.5);
  for (const k of order) {
    const kind = k === 'any' ? weighted(ANY_KIND[spec.grade], rng) : k;
    const item = rollItem(kind, spec.grade, cap, rng, coreOnly) ?? (k === 'any' ? rollItem('potion', spec.grade, cap, rng) : null);
    if (item) return item;
  }
  return null;
}

/** Roll only Core Rulebook wondrous items, rings, and staves unless the kingdom opts into every Pathfinder book. */
export const coreOnly = (k: Kingdom) => k.settings.itemSources !== 'all';

// ---------- slots in a settlement ----------
export interface SlotRef { district: District; building?: PlacedBuilding; index: number; spec: SlotSpec; item?: MagicItem | null; extraId?: string; label: string }

export function settlementSlots(s: Settlement): SlotRef[] {
  const out: SlotRef[] = [];
  for (const d of s.districts) {
    for (const b of d.buildings) {
      if (b.damaged) continue;
      slotsFor(b.type).forEach((spec, index) => out.push({ district: d, building: b, index, spec, item: b.items?.[index] ?? null, label: building(b.type).name }));
    }
  }
  for (const x of s.extraSlots ?? []) {
    out.push({ district: s.districts.find((d) => d.id === x.districtId) ?? s.districts[0], index: 0, spec: { grade: x.grade, kinds: x.kinds }, item: x.item ?? null, extraId: x.id, label: x.label });
  }
  return out;
}

function setItem(s: Settlement, ref: SlotRef, item: MagicItem | null) {
  if (ref.extraId) {
    const x = s.extraSlots!.find((e) => e.id === ref.extraId)!;
    x.item = item ?? undefined;
    return;
  }
  const b = ref.building!;
  b.items = [...(b.items ?? [])];
  b.items[ref.index] = item;
}

const find = (k: Kingdom, sId: string) => k.settlements.find((s) => s.id === sId)!;
const findRef = (s: Settlement, refKey: string) => settlementSlots(s).find((r) => slotKey(r) === refKey)!;
export const slotKey = (r: SlotRef) => r.extraId ?? `${r.building!.id}:${r.index}`;

/** Upkeep step 3: one d% per district with an open slot; 51-100 fills one of its open slots (chosen at random). */
export function fillSlots(k: Kingdom, rng: Rng = defaultRng) {
  const lines: string[] = [];
  for (const s of k.settlements) {
    const cap = settlementStats(s).baseValue;
    for (const d of s.districts) {
      const open = settlementSlots(s).filter((r) => r.district.id === d.id && !r.item);
      if (!open.length) continue;
      const extraFirst = open.find((r) => r.extraId && (s.extraSlots ?? []).find((e) => e.id === r.extraId)?.autoFill);
      const roll = extraFirst ? 100 : die(100, rng);
      const ref = extraFirst ?? open[Math.floor(rng() * open.length)];
      const where = `${s.name}${s.districts.length > 1 ? ` (${d.name})` : ''}`;
      if (roll <= 50) { lines.push(`${where}: d% ${roll}, no new item.`); continue; }
      const item = rollForSlot(ref.spec, cap, rng, coreOnly(k));
      if (!item) { lines.push(`${where}: d% ${roll}, but no ${slotLabel(ref.spec)} costs ${cap.toLocaleString()} gp or less (the base value); the slot stays open.`); continue; }
      setItem(s, ref, item);
      lines.push(`${where}: ${item.name} (${item.price.toLocaleString()} gp) for sale at the ${ref.label}.`);
    }
  }
  const text = lines.length ? lines.join(' ') : 'No settlement has an open magic item slot.';
  log(k, `Magic item slots: ${text}`);
  k.turnState.done['upkeep.items'] = text;
  return lines;
}

/** Fill one slot by hand (the GM picked an item), or roll one for it now. */
export function setSlotItem(k: Kingdom, sId: string, refKey: string, item: Omit<MagicItem, 'id'> | 'roll', rng: Rng = defaultRng) {
  const s = find(k, sId);
  const ref = findRef(s, refKey);
  const it = item === 'roll' ? rollForSlot(ref.spec, settlementStats(s).baseValue, rng, coreOnly(k)) : { id: uid(), ...item };
  if (!it) return null;
  setItem(s, ref, it);
  log(k, `${it.name} (${it.price.toLocaleString()} gp) is for sale in ${s.name}.`);
  return it;
}

/** Empty a slot. 'pc': a PC bought it with gp. 'kingdom' or 'personal': the kingdom paid BP (1 BP = 2,000 gp); a
 * purchase for a leader's own use counts as a withdrawal and raises Unrest. 'clear': just remove it. */
export function emptySlot(k: Kingdom, sId: string, refKey: string, how: 'pc' | 'kingdom' | 'personal' | 'clear') {
  const s = find(k, sId);
  const ref = findRef(s, refKey);
  const it = ref.item;
  if (!it) return;
  setItem(s, ref, null);
  const bp = Math.ceil(it.price / 2000);
  if (how === 'pc') log(k, `A PC bought ${it.name} in ${s.name} for ${it.price.toLocaleString()} gp.`);
  else if (how === 'clear') log(k, `Removed ${it.name} from ${s.name}.`);
  else {
    k.treasury -= bp;
    const unrest = how === 'personal' ? changeUnrest(k, bp) : 0;
    log(k, `The kingdom bought ${it.name} in ${s.name} for ${bp} BP${how === 'personal' ? ' for a leader’s own use (withdrawal: Unrest +' + bp + ')' : ''}.`, { bp: -bp, unrest });
  }
}

/** Income phase: an Economy check to have an NPC buy the item. Each check after the first in a turn costs 1 Economy. */
export function sellToNpc(k: Kingdom, sId: string, refKey: string, roll: number) {
  const s = find(k, sId);
  const ref = findRef(s, refKey);
  const it = ref.item;
  if (!it) return null;
  const n = Number(k.turnState.done['items.npcSales'] ?? 0);
  if (n >= 1) {
    const m = k.modifiers.find((x) => x.id === `npc-sales-${k.turn}`);
    if (m) m.economy -= 1;
    else k.modifiers.push({ id: `npc-sales-${k.turn}`, label: 'Pushing magic item sales', economy: -1, loyalty: 0, stability: 0, consumption: 0, expiresTurn: k.turn + 1 });
  }
  k.turnState.done['items.npcSales'] = String(n + 1);
  const c = kingdomCheck(k, 'economy', roll);
  if (c.success) setItem(s, ref, null);
  log(k, `Economy check ${c.total} vs DC ${c.dc} to sell ${it.name} in ${s.name} to a traveler: ${c.success ? 'sold, and the slot is open again' : 'no buyer'}${n >= 1 ? ' (Economy −1 this turn for pushing sales)' : ''}.`);
  return c;
}

/** Remarkable Treasure: fill an open slot with an item one grade better, with the base value counted 50% higher. */
export function remarkableTreasure(k: Kingdom, s: Settlement, rng: Rng = defaultRng) {
  const open = settlementSlots(s).filter((r) => !r.item && !r.extraId);
  if (!open.length) return null;
  const ref = open[Math.floor(rng() * open.length)];
  const better: Grade = ref.spec.grade === 'minor' ? 'medium' : 'major';
  const cap = Math.floor(settlementStats(s).baseValue * 1.5);
  const it = rollForSlot({ grade: better, kinds: ref.spec.kinds }, cap, rng, coreOnly(k)) ?? rollForSlot(ref.spec, cap, rng, coreOnly(k));
  if (it) setItem(s, ref, it);
  return it;
}

/** Unexpected Find: a temporary minor (01-70) or medium slot, filled next Upkeep, gone at the next Event phase. */
export function unexpectedFind(k: Kingdom, s: Settlement, rng: Rng = defaultRng) {
  const grade: Grade = die(100, rng) <= 70 ? 'minor' : 'medium';
  (s.extraSlots ??= []).push({ id: uid(), districtId: s.districts[0].id, grade, kinds: ['any'], label: 'Unexpected find', autoFill: true, untilTurn: k.turn + 1 });
  return grade;
}

/** Temporary slots end at the next Event phase. */
export function expireExtraSlots(k: Kingdom) {
  for (const s of k.settlements) s.extraSlots = (s.extraSlots ?? []).filter((x) => !x.untilTurn || x.untilTurn > k.turn);
}

export const itemsForSale = (s: Settlement) => settlementSlots(s).filter((r) => r.item);
export const openSlots = (s: Settlement) => settlementSlots(s).filter((r) => !r.item);
