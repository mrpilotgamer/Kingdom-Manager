// Tables for rolling settlement magic items. Prices follow the Core Rulebook formulas:
// potion = spell level × caster level × 50 gp, scroll × 25 gp, wand × 750 gp (minimum caster level, 0-level spells count as ½).
// Named items (wondrous items, rings, staves) and spell names come from Archives of Nethys (scripts/parse-aon-items.py).
import raw from './magicItems.json';

export type Grade = 'minor' | 'medium' | 'major';
export type ItemKind = 'potion' | 'scroll' | 'wand' | 'ring' | 'wondrous' | 'armor' | 'shield' | 'weapon' | 'staff';
export const KIND_LABEL: Record<ItemKind | 'any', string> = {
  potion: 'potion', scroll: 'scroll', wand: 'wand', ring: 'ring', wondrous: 'wondrous item', armor: 'armor', shield: 'shield',
  weapon: 'weapon', staff: 'staff', any: 'item',
};

type Named = { n: string; p: number; c?: number; l?: number };
const data = raw as { wondrous: Named[]; rings: Named[]; staves: Named[]; spells: Record<'arcane' | 'divine', Record<string, string[]>> };
/** c = Core Rulebook item, l = Pathfinder Society legal. */
export const NAMED: Record<'wondrous' | 'ring' | 'staff', Named[]> = { wondrous: data.wondrous, ring: data.rings, staff: data.staves };
export const SPELLS = data.spells;

/** Price bands used to sort named items into grades (an approximation of the Core Rulebook's grade tables). */
export const GRADE_BANDS: Record<Grade, [number, number]> = { minor: [1, 5000], medium: [5001, 40000], major: [40001, Infinity] };

/** Potion-friendly spells (target creatures or objects, 3rd level or lower), from the Core Rulebook potion tables. */
export const POTION_SPELLS: Record<number, string[]> = {
  0: ['Guidance', 'Light', 'Mending (oil)', 'Purify Food and Drink (oil)', 'Resistance', 'Stabilize', 'Virtue'],
  1: ['Bless Weapon (oil)', 'Cure Light Wounds', 'Endure Elements', 'Enlarge Person', 'Jump', 'Mage Armor', 'Magic Fang',
    'Magic Stone (oil)', 'Magic Weapon (oil)', 'Pass without Trace', 'Protection from Chaos', 'Protection from Evil',
    'Protection from Good', 'Protection from Law', 'Reduce Person', 'Remove Fear', 'Sanctuary', 'Shield of Faith', 'Shillelagh (oil)'],
  2: ['Aid', 'Barkskin', "Bear's Endurance", 'Blur', "Bull's Strength", "Cat's Grace", 'Cure Moderate Wounds', 'Darkness (oil)',
    'Darkvision', 'Delay Poison', "Eagle's Splendor", "Fox's Cunning", 'Invisibility', 'Lesser Restoration', 'Levitate',
    "Owl's Wisdom", 'Protection from Arrows', 'Remove Paralysis', 'Resist Energy', 'Spider Climb', 'Undetectable Alignment'],
  3: ['Cure Serious Wounds', 'Daylight (oil)', 'Displacement', 'Fly', 'Gaseous Form', 'Good Hope', 'Greater Magic Fang',
    'Greater Magic Weapon (oil)', 'Haste', 'Heroism', 'Keen Edge (oil)', 'Magic Circle against Evil', 'Neutralize Poison',
    'Protection from Energy', 'Rage', 'Remove Blindness/Deafness', 'Remove Curse', 'Remove Disease', 'Tongues', 'Water Breathing', 'Water Walk'],
};

/** Chance of each spell level by grade. */
export const SPELL_LEVELS: Record<'potion' | 'scroll' | 'wand', Record<Grade, [number, number][]>> = {
  potion: { minor: [[0, 20], [1, 60], [2, 20]], medium: [[1, 20], [2, 50], [3, 30]], major: [[2, 30], [3, 70]] },
  scroll: { minor: [[0, 10], [1, 50], [2, 30], [3, 10]], medium: [[2, 20], [3, 30], [4, 30], [5, 20]], major: [[4, 10], [5, 20], [6, 25], [7, 20], [8, 15], [9, 10]] },
  wand: { minor: [[0, 20], [1, 80]], medium: [[1, 10], [2, 60], [3, 30]], major: [[3, 50], [4, 50]] },
};

/** "Any item" slots: chance of each kind by grade (close to the Core Rulebook's random magic item table). */
export const ANY_KIND: Record<Grade, [ItemKind, number][]> = {
  minor: [['armor', 3], ['shield', 1], ['weapon', 5], ['potion', 44], ['ring', 2], ['scroll', 32], ['wand', 6], ['wondrous', 7]],
  medium: [['armor', 7], ['shield', 3], ['weapon', 10], ['potion', 10], ['ring', 10], ['staff', 5], ['scroll', 15], ['wand', 15], ['wondrous', 25]],
  major: [['armor', 7], ['shield', 3], ['weapon', 10], ['potion', 5], ['ring', 10], ['staff', 10], ['scroll', 15], ['wand', 10], ['wondrous', 30]],
};

/** Enhancement bonuses by grade for armor, shields, and weapons. */
export const BONUSES: Record<Grade, number[]> = { minor: [1, 1, 1, 2], medium: [2, 2, 3, 3, 4], major: [3, 4, 4, 5, 5] };

/** Masterwork base items: price in gp before the enhancement bonus. */
export const BASE_WEAPONS: [string, number][] = [
  ['longsword', 15], ['battleaxe', 10], ['warhammer', 12], ['heavy mace', 12], ['rapier', 20], ['scimitar', 15], ['greatsword', 50],
  ['greataxe', 20], ['dagger', 2], ['short sword', 10], ['spear', 2], ['longspear', 5], ['morningstar', 8], ['flail', 8],
  ['light crossbow', 35], ['heavy crossbow', 50], ['shortbow', 30], ['longbow', 75], ['composite longbow', 100], ['quarterstaff', 0],
];
export const BASE_ARMOR: [string, number][] = [
  ['leather armor', 10], ['studded leather', 25], ['chain shirt', 100], ['hide armor', 15], ['scale mail', 50], ['chainmail', 150],
  ['breastplate', 200], ['banded mail', 250], ['half-plate', 600], ['full plate', 1500],
];
export const BASE_SHIELDS: [string, number][] = [['buckler', 5], ['light wooden shield', 3], ['light steel shield', 9], ['heavy wooden shield', 7], ['heavy steel shield', 20], ['tower shield', 30]];
