// Mass combat rules from Ultimate Campaign pg. 234-251 (Archives of Nethys, Rules IDs 1565-1595).
import type { Attr } from './kingdom';
import type { RoleId } from './leadership';

export type ArmySize = 'fine' | 'diminutive' | 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan' | 'colossal';
export const ARMY_SIZES: ArmySize[] = ['fine', 'diminutive', 'tiny', 'small', 'medium', 'large', 'huge', 'gargantuan', 'colossal'];

/** Table 4-15 (units, CR steps), Table 4-16 (resource cost multiplier), and defeat penalties. */
export const SIZE_INFO: Record<ArmySize, { label: string; units: number; steps: number; resourceMult: number; defeat: Record<Attr, number> }> = {
  fine: { label: 'Fine', units: 1, steps: -8, resourceMult: 1 / 8, defeat: { economy: 0, loyalty: 0, stability: 0 } },
  diminutive: { label: 'Diminutive', units: 10, steps: -6, resourceMult: 1 / 6, defeat: { economy: 0, loyalty: -1, stability: 0 } },
  tiny: { label: 'Tiny', units: 25, steps: -4, resourceMult: 1 / 4, defeat: { economy: -1, loyalty: -1, stability: 0 } },
  small: { label: 'Small', units: 50, steps: -2, resourceMult: 1 / 2, defeat: { economy: -1, loyalty: -1, stability: -1 } },
  medium: { label: 'Medium', units: 100, steps: 0, resourceMult: 1, defeat: { economy: -2, loyalty: -2, stability: -2 } },
  large: { label: 'Large', units: 200, steps: 2, resourceMult: 2, defeat: { economy: -3, loyalty: -2, stability: -2 } },
  huge: { label: 'Huge', units: 500, steps: 4, resourceMult: 4, defeat: { economy: -4, loyalty: -2, stability: -2 } },
  gargantuan: { label: 'Gargantuan', units: 1000, steps: 6, resourceMult: 10, defeat: { economy: -4, loyalty: -2, stability: -3 } },
  colossal: { label: 'Colossal', units: 2000, steps: 8, resourceMult: 20, defeat: { economy: -4, loyalty: -3, stability: -3 } },
};

/** Challenge ratings in order; ACR moves along this ladder by the size's steps. */
export const CR_LADDER = [1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, ...Array.from({ length: 40 }, (_, i) => i + 1)];
export const crLabel = (cr: number) => (cr >= 1 ? String(cr) : `1/${Math.round(1 / cr)}`);

export type HitDie = 'd6' | 'd8' | 'd10' | 'd12';
export const HD_AVG: Record<HitDie, number> = { d6: 3.5, d8: 4.5, d10: 5.5, d12: 6.5 };

// ---------- tactics ----------
export type TacticId =
  | 'standard' | 'withdraw' | 'cautiousCombat' | 'cavalryExperts' | 'defensiveWall' | 'dirtyFighters' | 'expertFlankers'
  | 'falseRetreat' | 'fullDefense' | 'relentlessBrutality' | 'siegebreaker' | 'sniperSupport' | 'spellbreaker' | 'taunt';

export const TACTICS: Record<TacticId, { label: string; text: string; om?: number; dv?: number; morale?: number; always?: boolean; needs?: 'mounts' | 'ranged' }> = {
  standard: { label: 'Standard', always: true, text: 'No modifiers.' },
  withdraw: { label: 'Withdraw', always: true, text: 'Try to escape: an opposed Morale check against each attacking army; OM and DV −2 this phase. No check needed to switch to it.' },
  cautiousCombat: { label: 'Cautious combat', om: -2, morale: 2, text: 'OM −2, +2 on all Morale checks.' },
  cavalryExperts: { label: 'Cavalry experts', needs: 'mounts', text: 'OM +2 against armies that aren’t mounted. Needs the mounts resource.' },
  defensiveWall: { label: 'Defensive wall', om: -2, dv: 2, text: 'OM −2, DV +2.' },
  dirtyFighters: { label: 'Dirty fighters', text: 'OM +6 for the first Melee phase of the battle.' },
  expertFlankers: { label: 'Expert flankers', om: 2, dv: -2, text: 'OM +2, DV −2.' },
  falseRetreat: { label: 'False retreat', text: 'Once per battle: no attack this phase, then OM and DV +6 against the target next phase.' },
  fullDefense: { label: 'Full defense', om: -4, dv: 4, text: 'OM −4, DV +4.' },
  relentlessBrutality: { label: 'Relentless brutality', om: 4, dv: -4, text: 'OM +4, DV −4.' },
  siegebreaker: { label: 'Siegebreaker', text: 'When it damages an army with siege engines, a second Offense check destroys one.' },
  sniperSupport: { label: 'Sniper support', needs: 'ranged', text: '+2 damage when it damages its target in the Melee phase. Needs ranged attacks.' },
  spellbreaker: { label: 'Spellbreaker', text: 'DV +4 against armies with spellcasting.' },
  taunt: { label: 'Taunt', text: 'The target makes a Morale check (DC 10 + ACR) each phase or takes OM and DV −2 against this army; two successes make it immune.' },
};
export const LEARNABLE_TACTICS = (Object.keys(TACTICS) as TacticId[]).filter((t) => !TACTICS[t].always);

// ---------- strategy track ----------
export const STRATEGIES = [
  { label: 'Defensive', dv: 4, om: -4, dmg: -6 },
  { label: 'Cautious', dv: 2, om: -2, dmg: -3 },
  { label: 'Standard', dv: 0, om: 0, dmg: 0 },
  { label: 'Aggressive', dv: -2, om: 2, dmg: 3 },
  { label: 'Reckless', dv: -4, om: 4, dmg: 6 },
];

// ---------- commanders ----------
export type BoonId =
  | 'bloodied' | 'bonusTactic' | 'defensiveTactics' | 'flexibleTactics' | 'hitAndRun' | 'holdTheLine' | 'liveOffLand'
  | 'loyalty' | 'merciless' | 'sharpshooter' | 'triage';

export const BOONS: Record<BoonId, { label: string; minLeadership: number; text: string }> = {
  bloodied: { label: 'Bloodied but unbroken', minLeadership: 4, text: '+1 Offense at half hp or less (+2 at Leadership 10).' },
  bonusTactic: { label: 'Bonus tactic', minLeadership: 0, text: 'The army can use one extra tactic the commander knows.' },
  defensiveTactics: { label: 'Defensive tactics', minLeadership: 5, text: 'DV +2.' },
  flexibleTactics: { label: 'Flexible tactics', minLeadership: 6, text: '+5 on Morale checks to change tactics (+10 at Leadership 12).' },
  hitAndRun: { label: 'Hit and run', minLeadership: 5, text: 'May withdraw after the Ranged or first Melee phase with +2 on the Morale checks (+4 at Leadership 10).' },
  holdTheLine: { label: 'Hold the line', minLeadership: 0, text: 'Reroll a failed Morale check to avoid a rout.' },
  liveOffLand: { label: 'Live off the land', minLeadership: 0, text: 'Halve Consumption and speed for any week it’s used.' },
  loyalty: { label: 'Loyalty', minLeadership: 6, text: '+2 on all Morale checks (+4 at Leadership 12).' },
  merciless: { label: 'Merciless', minLeadership: 0, text: '+1 to stop an enemy withdrawing and on parting shots at routed or withdrawing armies.' },
  sharpshooter: { label: 'Sharpshooter', minLeadership: 0, text: '+2 Offense against fortified armies, if it has ranged attacks.' },
  triage: { label: 'Triage', minLeadership: 0, text: 'Once per battle, take −4 on an Offense check to heal half the ACR.' },
};

/** Boons a kingdom leader knows automatically when commanding (choose one if several). */
export const ROLE_BOONS: Record<RoleId, BoonId[]> = {
  ruler: ['bloodied', 'loyalty'], consort: ['loyalty'], councilor: ['loyalty'],
  general: ['bonusTactic', 'flexibleTactics', 'merciless', 'sharpshooter'], grandDiplomat: ['defensiveTactics', 'merciless'],
  heir: ['loyalty'], highPriest: ['holdTheLine', 'liveOffLand', 'triage'], magister: ['flexibleTactics', 'loyalty'],
  marshal: ['liveOffLand', 'hitAndRun', 'sharpshooter', 'triage'], royalEnforcer: ['bonusTactic', 'merciless', 'sharpshooter'],
  spymaster: ['hitAndRun', 'merciless', 'sharpshooter'], treasurer: ['loyalty'], viceroy: ['loyalty'],
  warden: ['defensiveTactics', 'holdTheLine', 'loyalty'],
};

// ---------- resources ----------
export type ResourceId = 'armor' | 'magicArmor' | 'weapons' | 'magicWeapons' | 'mounts' | 'ranged' | 'potions' | 'siege';
export const RESOURCES: Record<ResourceId, { label: string; cost: number; consumption: number; text: string; needs?: string[]; scales: boolean }> = {
  armor: { label: 'Improved armor (masterwork)', cost: 3, consumption: 1, scales: true, text: 'DV +1.', needs: ['foreign-quarter', 'military-academy', 'smithy'] },
  magicArmor: { label: 'Improved armor (magic)', cost: 15, consumption: 2, scales: true, text: 'DV +2 (replaces masterwork).', needs: ['foreign-quarter', 'military-academy', 'smithy'] },
  weapons: { label: 'Improved weapons (masterwork)', cost: 5, consumption: 1, scales: true, text: 'OM +1.', needs: ['foreign-quarter', 'military-academy', 'smithy'] },
  magicWeapons: { label: 'Improved weapons (magic)', cost: 50, consumption: 2, scales: true, text: 'OM +2 (replaces masterwork).', needs: ['foreign-quarter', 'military-academy', 'smithy'] },
  mounts: { label: 'Mounts', cost: 0, consumption: 1, scales: true, text: 'OM and DV +2. Costs BP equal to the mounts’ ACR.', needs: ['foreign-quarter', 'stable', 'stockyard'] },
  ranged: { label: 'Ranged weapons', cost: 2, consumption: 1, scales: true, text: 'Can make ranged attacks.' },
  potions: { label: 'Healing potions', cost: 10, consumption: 0, scales: true, text: 'Twice per battle, skip an attack to heal twice the ACR (+3 Consumption that week each time).', needs: ['alchemist', 'casters-tower', 'cathedral', 'herbalist', 'magic-shop', 'magical-academy', 'temple'] },
  siege: { label: 'Siege engine', cost: 15, consumption: 3, scales: false, text: 'OM +2 (total); each Melee phase lowers enemy fortification DV by 1d4 per engine.', needs: ['academy', 'foreign-quarter', 'military-academy', 'university'] },
};

// ---------- special abilities (the ones with effects the app can apply) ----------
export interface SpecialDef {
  label: string;
  text: string;
  /** Takes a number (bravery +N, spellcasting level, regeneration N, ...). */
  value?: string;
  om?: number; dv?: number; dmg?: number;
  ranged?: boolean;
  /** Extra damage dice in Ranged/Melee phases. */
  dmgDice?: { ranged?: string; melee?: string; rangedFlat?: number };
  moraleVsRout?: number;
  neverRouts?: boolean;
  neverFailsMorale?: boolean;
  ignoreDark?: boolean; ignoreDim?: boolean; halveConditions?: boolean;
  halfDamageTaken?: boolean;
  /** Effects on the target when this army damages it. */
  onHit?: 'bleed' | 'fear' | 'paralysis';
  immuneFear?: boolean;
  healPerPhase?: 'half-value';
  attackersOm?: number;
}

export type SpecialId =
  | 'bravery' | 'auraOfCourage' | 'darkvision' | 'lowLight' | 'scent' | 'blindsight' | 'spellcasting' | 'spellResistance'
  | 'undead' | 'construct' | 'mindless' | 'regeneration' | 'fastHealing' | 'breathWeapon' | 'rockThrowing' | 'pounce'
  | 'trample' | 'animalCompanion' | 'rake' | 'bleed' | 'fear' | 'paralysis' | 'significantDefense' | 'incorporeal'
  | 'swarm' | 'invisibility' | 'inspireCourage' | 'rage' | 'flurry' | 'shieldAlly' | 'cavalierMount' | 'ferocity'
  | 'flight' | 'lightSensitivity' | 'trip' | 'other';

export const SPECIALS: Record<SpecialId, SpecialDef> = {
  bravery: { label: 'Bravery', value: 'bonus', text: 'Adds its bonus to Morale checks against routs.', moraleVsRout: 1 },
  auraOfCourage: { label: 'Aura of courage', text: 'Immune to fear; never routs.', neverRouts: true, immuneFear: true },
  darkvision: { label: 'Darkvision', text: 'No penalties in dim light or darkness.', ignoreDark: true, ignoreDim: true },
  lowLight: { label: 'Low-light vision', text: 'No penalties in dim light.', ignoreDim: true },
  scent: { label: 'Scent / blindsense / tremorsense', text: 'Halves penalties from darkness and weather.', halveConditions: true },
  blindsight: { label: 'Blindsight', text: 'No penalties from darkness or weather.', ignoreDark: true, ignoreDim: true },
  spellcasting: { label: 'Spellcasting', value: 'highest spell level', text: 'OM and DV + the highest spell level its units can cast.' },
  spellResistance: { label: 'Spell resistance', text: 'DV +6 against armies with spellcasting.' },
  undead: { label: 'Undead', text: 'Immune to disease, fear, paralysis, and poison. DV +2.', dv: 2, immuneFear: true },
  construct: { label: 'Construct / plant', text: 'Immune to disease, fear, paralysis, and poison.', immuneFear: true },
  mindless: { label: 'Mindless', text: 'Never fails Morale checks; always uses the standard tactic and strategy.', neverFailsMorale: true },
  regeneration: { label: 'Regeneration', value: 'regeneration', text: 'Heals half its regeneration each Ranged or Melee phase.', healPerPhase: 'half-value' },
  fastHealing: { label: 'Fast healing', value: 'fast healing', text: 'Heals half its fast healing each Ranged or Melee phase.', healPerPhase: 'half-value' },
  breathWeapon: { label: 'Breath weapon / bombs', text: 'Ranged attacks; +1d4 damage in Ranged and Melee phases.', ranged: true, dmgDice: { ranged: '1d4', melee: '1d4' } },
  rockThrowing: { label: 'Rock throwing', text: 'Ranged attacks; +4 damage in the Ranged phase.', ranged: true, dmgDice: { rangedFlat: 4 } },
  pounce: { label: 'Pounce / powerful charge', text: 'OM +1.', om: 1 },
  trample: { label: 'Trample', text: 'OM +1.', om: 1 },
  animalCompanion: { label: 'Animal companions / eidolons', text: 'OM +1.', om: 1 },
  rake: { label: 'Rake / rend', text: '+1 damage.', dmg: 1 },
  bleed: { label: 'Bleed / poison / burn', text: 'When it deals melee damage, the target takes 1d6 more at the start of the next phase.', onHit: 'bleed' },
  fear: { label: 'Fear', text: 'An army it damages makes a Morale check (DC 10 + ACR) or can’t attack next phase; failing again while afraid routs it.', onHit: 'fear' },
  paralysis: { label: 'Paralysis / petrification / stunning', text: 'Each time it damages an army, that army’s DV drops by 1 for the battle.', onHit: 'paralysis' },
  significantDefense: { label: 'Significant defense', text: 'DV +10 against armies that can’t overcome its defenses.', dv: 10 },
  incorporeal: { label: 'Incorporeal', text: 'Takes half damage (none from nonmagical attacks).', halfDamageTaken: true },
  swarm: { label: 'Swarm', text: 'Takes half damage from nonmagical attacks.', halfDamageTaken: true },
  invisibility: { label: 'Invisibility', text: 'Armies attacking it take OM −2; armies it attacks take DV −2.', attackersOm: -2 },
  inspireCourage: { label: 'Inspire courage', text: 'OM +1, +2 on Morale checks against routs.', om: 1, moraleVsRout: 2 },
  rage: { label: 'Rage', text: 'OM +2, DV −1, +1 on Morale checks against routs (for the whole battle).', om: 2, dv: -1, moraleVsRout: 1 },
  flurry: { label: 'Flurry of blows', text: 'OM +1 in the first Melee phase, +2 after.' },
  shieldAlly: { label: 'Shield ally', text: 'DV +1.', dv: 1 },
  cavalierMount: { label: 'Cavalier mounts', text: 'OM and DV +1.', om: 1, dv: 1 },
  ferocity: { label: 'Ferocity', text: 'Fights one more Melee phase after being defeated or routed, at OM and DV −4.' },
  flight: { label: 'Flight', text: 'Ignores City Walls. If it doesn’t attack in melee, only flying armies can attack it in melee.' },
  lightSensitivity: { label: 'Light sensitivity / blindness', text: 'OM and DV −1 (−2 for blindness) in bright light.' },
  trip: { label: 'Trip', text: 'Each Melee phase, its target’s DV drops by 1 for that phase.' },
  other: { label: 'Other ability', value: 'note', text: 'Described for the GM; add any effect with the army’s OM/DV adjustments.' },
};

// ---------- battlefield ----------
export const WIND = [
  { label: 'None or light', ranged: 0 },
  { label: 'Strong wind', ranged: -2 },
  { label: 'Severe wind, rain, or snow', ranged: -4 },
  { label: 'Windstorm (no ranged attacks)', ranged: -99 },
];

// ---------- sample armies (Ultimate Campaign pg. 247-250) ----------
export interface ArmyPreset {
  name: string;
  type: string;
  alignment: string;
  size: ArmySize;
  cr: number;
  hd: HitDie;
  speed: number;
  tactics?: TacticId[];
  resources?: ResourceId[];
  specials?: { id: SpecialId; value?: number; note?: string }[];
  om?: number;
  dv?: number;
  /** Mostly enemies; shown in the enemy list first. */
  foe?: boolean;
}

export const PRESETS: ArmyPreset[] = [
  { name: 'Soldiers', type: 'humans (fighter 2)', alignment: 'N', size: 'medium', cr: 1, hd: 'd10', speed: 1, specials: [{ id: 'bravery', value: 1 }] },
  { name: 'Militia', type: 'humans (warrior 1)', alignment: 'N', size: 'large', cr: 1 / 3, hd: 'd10', speed: 2 },
  { name: 'Elite mounted knights', type: 'humans (fighter 3)', alignment: 'N', size: 'medium', cr: 2, hd: 'd10', speed: 1, resources: ['armor', 'weapons', 'mounts'] },
  { name: 'Elite commandos', type: 'humans (fighter 4)', alignment: 'N', size: 'medium', cr: 3, hd: 'd10', speed: 2, tactics: ['expertFlankers', 'siegebreaker'], resources: ['potions', 'armor', 'weapons', 'ranged'], specials: [{ id: 'bravery', value: 1 }] },
  { name: 'Dwarven defenders', type: 'dwarves (fighter 2)', alignment: 'LN', size: 'medium', cr: 1, hd: 'd10', speed: 1, tactics: ['defensiveWall'], specials: [{ id: 'bravery', value: 1 }, { id: 'darkvision' }] },
  { name: 'Elven wardens', type: 'elves (ranger 2)', alignment: 'N', size: 'medium', cr: 1, hd: 'd10', speed: 1, tactics: ['sniperSupport'], specials: [{ id: 'other', note: 'combat style, favored enemy (orc), track' }] },
  { name: 'Gnome stalkers', type: 'gnomes (fighter 2)', alignment: 'N', size: 'medium', cr: 1, hd: 'd10', speed: 1, tactics: ['taunt'], specials: [{ id: 'bravery', value: 1 }], om: 1 },
  { name: 'Half-orc berserkers', type: 'half-orcs (barbarian 2)', alignment: 'CN', size: 'medium', cr: 1, hd: 'd12', speed: 2, tactics: ['relentlessBrutality'], specials: [{ id: 'rage' }] },
  { name: 'Halfling scouts', type: 'halflings (rogue 2)', alignment: 'LN', size: 'medium', cr: 1, hd: 'd8', speed: 1, specials: [{ id: 'bleed' }, { id: 'other', note: 'evasion, sneak attack' }] },
  { name: 'Boggards', type: 'boggards', alignment: 'CE', size: 'medium', cr: 2, hd: 'd8', speed: 1, foe: true, specials: [{ id: 'darkvision' }, { id: 'other', note: 'mobility advantage in swamps (OM +1)' }] },
  { name: 'Centaurs', type: 'centaurs', alignment: 'N', size: 'medium', cr: 3, hd: 'd10', speed: 2, foe: true, tactics: ['cavalryExperts'], resources: ['ranged'], specials: [{ id: 'darkvision' }], om: 2, dv: 2 },
  { name: 'Drow', type: 'drow (warrior 3)', alignment: 'CE', size: 'medium', cr: 1, hd: 'd6', speed: 2, foe: true, tactics: ['dirtyFighters', 'falseRetreat', 'sniperSupport', 'spellbreaker'], resources: ['ranged'], specials: [{ id: 'darkvision' }, { id: 'bleed' }, { id: 'spellResistance' }, { id: 'lightSensitivity' }], om: 2 },
  { name: 'Ghouls', type: 'ghouls', alignment: 'CE', size: 'medium', cr: 1, hd: 'd8', speed: 2, foe: true, specials: [{ id: 'darkvision' }, { id: 'paralysis' }, { id: 'undead' }, { id: 'other', note: 'disease, cannibalize' }] },
  { name: 'Gnolls', type: 'gnolls', alignment: 'CE', size: 'medium', cr: 1, hd: 'd8', speed: 2, foe: true, specials: [{ id: 'darkvision' }] },
  { name: 'Goblin horde', type: 'goblins (warrior 1)', alignment: 'CE', size: 'huge', cr: 1 / 3, hd: 'd10', speed: 1, foe: true, resources: ['ranged'], specials: [{ id: 'darkvision' }] },
  { name: 'Hobgoblins', type: 'hobgoblins (fighter 2)', alignment: 'LE', size: 'medium', cr: 1, hd: 'd10', speed: 2, foe: true, tactics: ['siegebreaker'], resources: ['armor', 'weapons', 'ranged'], specials: [{ id: 'bravery', value: 1 }, { id: 'darkvision' }] },
  { name: 'Kobolds', type: 'kobolds (warrior 1)', alignment: 'LE', size: 'huge', cr: 1 / 4, hd: 'd10', speed: 2, foe: true, tactics: ['dirtyFighters'], specials: [{ id: 'darkvision' }, { id: 'lightSensitivity' }] },
  { name: 'Lizardfolk', type: 'lizardfolk', alignment: 'N', size: 'medium', cr: 1, hd: 'd8', speed: 2, foe: true, resources: ['ranged'], specials: [{ id: 'other', note: 'amphibious, aquatic, cannibalize' }] },
  { name: 'Orc horde', type: 'orcs (warrior 3)', alignment: 'CE', size: 'medium', cr: 1, hd: 'd10', speed: 2, foe: true, resources: ['ranged'], specials: [{ id: 'ferocity' }, { id: 'lightSensitivity' }] },
  { name: 'Orc army', type: 'orcs (fighter 3)', alignment: 'CE', size: 'medium', cr: 2, hd: 'd10', speed: 2, foe: true, resources: ['armor', 'ranged'], specials: [{ id: 'bravery', value: 1 }, { id: 'ferocity' }, { id: 'lightSensitivity' }] },
  { name: 'Skeleton horde', type: 'human skeletons', alignment: 'NE', size: 'large', cr: 1 / 3, hd: 'd8', speed: 2, foe: true, specials: [{ id: 'darkvision' }, { id: 'mindless' }, { id: 'undead' }] },
  { name: 'Troglodytes', type: 'troglodytes', alignment: 'CE', size: 'medium', cr: 1, hd: 'd8', speed: 2, foe: true, resources: ['ranged'], specials: [{ id: 'darkvision' }, { id: 'paralysis' }] },
  { name: 'Worgs', type: 'worgs', alignment: 'NE', size: 'medium', cr: 2, hd: 'd10', speed: 3, foe: true, specials: [{ id: 'darkvision' }, { id: 'scent' }, { id: 'trip' }] },
  { name: 'Yeti pack', type: 'yetis', alignment: 'N', size: 'medium', cr: 4, hd: 'd10', speed: 2, foe: true, specials: [{ id: 'bleed' }, { id: 'darkvision' }, { id: 'fear' }, { id: 'scent' }] },
  { name: 'Zombie horde', type: 'human zombies', alignment: 'NE', size: 'large', cr: 1 / 2, hd: 'd8', speed: 1, foe: true, specials: [{ id: 'darkvision' }, { id: 'mindless' }, { id: 'undead' }] },
  { name: 'Tarrasque', type: 'one tarrasque', alignment: 'N', size: 'fine', cr: 25, hd: 'd10', speed: 2, foe: true, tactics: ['defensiveWall', 'relentlessBrutality', 'siegebreaker', 'spellbreaker'], resources: ['ranged'], specials: [{ id: 'fear' }, { id: 'other', note: 'grab; immune to ability damage, bleed, disease, energy drain, fear, paralysis, petrification, and poison' }], om: 4 },
];
