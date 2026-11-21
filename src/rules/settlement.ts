// Settlement modifiers, governments, Fame and Infamy (Ultimate Campaign pg. 230-232, Archives of Nethys 1550-1557).
export type SettlementStat = 'corruption' | 'crime' | 'law' | 'lore' | 'productivity' | 'society';
export const SETTLEMENT_STATS: SettlementStat[] = ['corruption', 'crime', 'law', 'lore', 'productivity', 'society'];
export const STAT_LABEL: Record<SettlementStat, string> = {
  corruption: 'Corruption', crime: 'Crime', law: 'Law', lore: 'Lore', productivity: 'Productivity', society: 'Society',
};
export const STAT_HINT: Record<SettlementStat, string> = {
  corruption: 'Bluff and Sense Motive against officials; makes trade routes harder',
  crime: 'Sense Motive and Sleight of Hand; criminals and smugglers',
  law: 'Intimidate, Diplomacy with officials; helps catch criminals',
  lore: 'Diplomacy and Knowledge to gather information',
  productivity: 'Craft, Perform, and Profession to earn money; trade routes',
  society: 'Disguise; Diplomacy to change attitudes',
};

export type Government = 'autocracy' | 'magocracy' | 'oligarchy' | 'overlord' | 'republic' | 'secretSyndicate' | 'theocracy';
export const GOVERNMENTS: Record<Government, { label: string; mods: Partial<Record<SettlementStat, number>>; text: string }> = {
  autocracy: { label: 'Autocracy (feudal monarchy)', mods: {}, text: 'A single ruler by popular acclaim, election, or a light-handed hereditary rule.' },
  magocracy: { label: 'Magocracy', mods: { lore: 2, productivity: -1, society: -1 }, text: 'Ruled by those with potent magic, promoting learning.' },
  oligarchy: { label: 'Oligarchy', mods: { corruption: 1, law: -1, lore: -1, society: 1 }, text: 'A council of guild masters, aristocrats, and the wealthy.' },
  overlord: { label: 'Overlord', mods: { corruption: 1, crime: -1, law: 1, society: -1 }, text: 'One ruler who seized or inherited power and holds it tightly.' },
  republic: { label: 'Republic', mods: { crime: -1, law: -1, productivity: 1, society: 1 }, text: 'An elected or appointed parliament.' },
  secretSyndicate: { label: 'Secret Syndicate', mods: { corruption: 1, crime: 1, law: -3, productivity: 1 }, text: 'A thieves’ guild or similar group pulling the strings.' },
  theocracy: { label: 'Theocracy', mods: { corruption: -1, law: 1, lore: 1, society: -1 }, text: 'Led by the head of the most popular religion.' },
};

/** Table 4-14: Settlement Sizes and Modifiers (optional). "Per district" for the two largest sizes. */
export function sizeModifier(lots: number, districts: number) {
  if (lots <= 1) return { label: 'Village', mod: -4 };
  if (lots <= 8) return { label: 'Small town', mod: -2 };
  if (lots <= 20) return { label: 'Large town', mod: 0 };
  if (lots <= 40) return { label: 'Small city', mod: 1 };
  return { label: lots <= 100 ? 'Large city' : 'Metropolis', mod: districts };
}

/** When Size reaches these, Fame or Infamy (Ruler's choice) increases by 1. */
export const RENOWN_SIZES = [11, 26, 51, 101, 201];
