// Leadership roles from Ultimate Campaign pg. 200-204 (Archives of Nethys, Rules ID 1494).
import type { Attr } from './kingdom';

export type RoleId =
  | 'ruler' | 'consort' | 'councilor' | 'general' | 'grandDiplomat' | 'heir' | 'highPriest' | 'magister'
  | 'marshal' | 'royalEnforcer' | 'spymaster' | 'treasurer' | 'viceroy' | 'warden';

export interface RoleDef {
  id: RoleId;
  name: string;
  /** Which ability modifier the player enters (use whichever is higher). */
  ability: string;
  /** Fixed attribute this role boosts, or 'choice' (Ruler, Spymaster). */
  attr: Attr | 'choice';
  half?: boolean;
  benefit: string;
  vacancy: Partial<Record<Attr, number>>;
  /** Unrest gained each Upkeep phase while vacant. */
  vacancyUnrest?: number;
  vacancyText: string;
  optional?: boolean;
  /** Skill for the optional Leadership Role Skills rule. */
  skill: string;
}

export const ROLES: RoleDef[] = [
  { id: 'ruler', skill: 'Knowledge (nobility)', name: 'Ruler', ability: 'Cha', attr: 'choice',
    benefit: 'Add Cha modifier to one attribute (two at Size 26–100, three at Size 101+).',
    vacancy: {}, vacancyUnrest: 4,
    vacancyText: 'Cannot claim hexes, create Farms, build Roads, or buy districts. Unrest +4 each Upkeep.' },
  { id: 'consort', skill: 'Knowledge (nobility)', name: 'Consort', ability: 'Cha', attr: 'loyalty', half: true, optional: true,
    benefit: 'Add half Cha modifier to Loyalty. May stand in for an absent Ruler.', vacancy: {}, vacancyText: 'None.' },
  { id: 'councilor', skill: 'Knowledge (local)', name: 'Councilor', ability: 'Cha or Wis', attr: 'loyalty',
    benefit: 'Add Cha or Wis modifier to Loyalty.', vacancy: { loyalty: -2 }, vacancyUnrest: 1,
    vacancyText: 'Loyalty −2, no benefit from Holiday edicts, Unrest +1 each Upkeep.' },
  { id: 'general', skill: 'Profession (soldier)', name: 'General', ability: 'Cha or Str', attr: 'stability',
    benefit: 'Add Cha or Str modifier to Stability.', vacancy: { loyalty: -4 }, vacancyText: 'Loyalty −4.' },
  { id: 'grandDiplomat', skill: 'Diplomacy', name: 'Grand Diplomat', ability: 'Cha or Int', attr: 'stability',
    benefit: 'Add Cha or Int modifier to Stability.', vacancy: { stability: -2 },
    vacancyText: 'Stability −2; no Diplomatic or Exploration edicts.' },
  { id: 'heir', skill: 'Knowledge (nobility)', name: 'Heir', ability: 'Cha', attr: 'loyalty', half: true, optional: true,
    benefit: 'Add half Cha modifier to Loyalty. May stand in for an absent Ruler.', vacancy: {}, vacancyText: 'None.' },
  { id: 'highPriest', skill: 'Knowledge (religion)', name: 'High Priest', ability: 'Cha or Wis', attr: 'stability',
    benefit: 'Add Cha or Wis modifier to Stability.', vacancy: { stability: -2, loyalty: -2 }, vacancyUnrest: 1,
    vacancyText: 'Stability and Loyalty −2, Unrest +1 each Upkeep.' },
  { id: 'magister', skill: 'Knowledge (arcana)', name: 'Magister', ability: 'Cha or Int', attr: 'economy',
    benefit: 'Add Cha or Int modifier to Economy.', vacancy: { economy: -4 }, vacancyText: 'Economy −4.' },
  { id: 'marshal', skill: 'Survival', name: 'Marshal', ability: 'Dex or Wis', attr: 'economy',
    benefit: 'Add Dex or Wis modifier to Economy.', vacancy: { economy: -4 }, vacancyText: 'Economy −4.' },
  { id: 'royalEnforcer', skill: 'Intimidate', name: 'Royal Enforcer', ability: 'Dex or Str', attr: 'loyalty', optional: true,
    benefit: 'Add Dex or Str modifier to Loyalty. May reduce Unrest by 1 each Upkeep (Loyalty check or Loyalty −1).',
    vacancy: {}, vacancyText: 'None.' },
  { id: 'spymaster', skill: 'Sense Motive', name: 'Spymaster', ability: 'Dex or Int', attr: 'choice',
    benefit: 'Add Dex or Int modifier to one attribute of your choice.', vacancy: { economy: -4 }, vacancyUnrest: 1,
    vacancyText: 'Economy −4, Unrest +1 each Upkeep.' },
  { id: 'treasurer', skill: 'Profession (merchant)', name: 'Treasurer', ability: 'Int or Wis', attr: 'economy',
    benefit: 'Add Int or Wis modifier to Economy.', vacancy: { economy: -4 },
    vacancyText: 'Economy −4; the kingdom cannot collect taxes.' },
  { id: 'viceroy', skill: 'Knowledge (geography)', name: 'Viceroy', ability: 'Int or Wis', attr: 'economy', half: true, optional: true,
    benefit: 'Add half Int or Wis modifier to Economy. Governs a colony or vassal state.', vacancy: {},
    vacancyText: 'Only matters if you have a vassal state.' },
  { id: 'warden', skill: 'Knowledge (engineering)', name: 'Warden', ability: 'Con or Str', attr: 'loyalty',
    benefit: 'Add Con or Str modifier to Loyalty.', vacancy: { loyalty: -2, stability: -2 },
    vacancyText: 'Loyalty and Stability −2.' },
];

export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<RoleId, RoleDef>;
