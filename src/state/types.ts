import type { Alignment, Attr, Terrain, TerrainFeature } from '../rules/kingdom';
import type { RoleId } from '../rules/leadership';
import type { GenParams } from '../engine/mapgen';
import type { Government, SettlementStat } from '../rules/settlement';
import type { ArmySize, BoonId, HitDie, SpecialId, TacticId } from '../rules/massCombat';
import type { Battle } from '../engine/battle';

export type Side = 'n' | 'e' | 's' | 'w';
export type Lot = [row: number, col: number];

export interface PlacedBuilding {
  id: string;
  type: string;
  lots: Lot[];
  /** Id of the placed building whose discount paid for this one. */
  discountedBy?: string;
  /** Damaged by an event: gives no benefits until half its cost is paid to repair it. */
  damaged?: boolean;
}

export interface District {
  id: string;
  name: string;
  borders: Record<Side, 'land' | 'water'>;
  buildings: PlacedBuilding[];
  /** District-wide improvements (Paved Streets, Sewer System). */
  improvements: string[];
  /** Add-ons that share lots (Everflowing Spring, Magical Streetlamps): count by type. */
  addons: Record<string, number>;
  walls: Partial<Record<Side, 'city-wall' | 'moat'>>;
}

export interface Settlement {
  id: string;
  name: string;
  terrain: Terrain;
  districts: District[];
  /** Map hex this settlement sits in ("col,row"), when the kingdom uses the hex map. */
  hexKey?: string;
}

export type HexTerrain = Exclude<Terrain, 'cavern'> | 'water';
export type HexStatus = 'unexplored' | 'explored' | 'cleared' | 'claimed';
export type HexImprovement = 'farm' | 'fishery' | 'mine' | 'quarry' | 'sawmill' | 'road' | 'highway' | 'canal' | 'fort' | 'watchtower';
export type HexSpecial = 'resource' | 'landmark' | 'lair' | 'ruin' | 'building' | 'freeCity' | 'bridge';

export interface Hex {
  terrain: HexTerrain;
  status: HexStatus;
  river?: boolean;
  /** Edges (0-5: SE, S, SW, NW, N, NE) the river crosses. Missing on older maps; worked out when drawn. */
  riverEdges?: number[];
  special?: HexSpecial;
  improvements: HexImprovement[];
  name?: string;
  notes?: string;
}

export interface HexMap {
  cols: number;
  rows: number;
  /** Keyed by "col,row" (offset coordinates, flat-top hexes, odd columns shifted down). Missing = unexplored plains. */
  hexes: Record<string, Hex>;
  /** When true, Size and terrain improvements come from the map instead of hand-entered counts. */
  active: boolean;
  /**
   * Absolute coordinate of column/row 0. Adding columns on the left lowers originC; odd absolute columns sit
   * half a hex lower, so the grid keeps its shape. Also lets generated terrain continue when the map grows.
   */
  originC?: number;
  originR?: number;
  /** Generator settings, if the map was generated. */
  gen?: GenParams;
}

export interface Leader {
  name: string;
  /** The ability modifier used for this role (the higher of the two listed). */
  mod: number;
  leadershipFeat: boolean;
  /** Ruler: up to three attributes; Spymaster: one. */
  attrs: Attr[];
  /** False if the leader skipped their 7 days of duty this month (counts as vacant). */
  active: boolean;
}

export interface Modifier {
  id: string;
  label: string;
  economy: number;
  loyalty: number;
  stability: number;
  consumption: number;
  /** Set by events: 'event' lasts while that event is ongoing; 'next-event' ends at the next Event phase. */
  until?: 'event' | 'next-event';
  /** ActiveEvent id that created it. */
  eventId?: string;
  /** Turn it was created. */
  turn?: number;
  /** Ends when the kingdom reaches this turn. */
  expiresTurn?: number;
}

/** A change to settlement modifiers (Corruption, Crime, ...) from an event or the GM. */
export interface SettlementAdjustment {
  id: string;
  label: string;
  /** Settlement it applies to; missing = the whole kingdom. */
  settlementId?: string;
  mods: Partial<Record<SettlementStat, number>>;
  until?: 'event' | 'next-event';
  eventId?: string;
  turn?: number;
  /** Ends when the kingdom reaches this turn (e.g. "for 1 year"). */
  expiresTurn?: number;
}

/** A bonus or penalty on kingdom checks, from an event, until the next Event phase. */
export interface CheckModifier {
  id: string;
  label: string;
  attr: Attr | 'all';
  value: number;
  /** Only applies to checks made to resolve events. */
  eventsOnly?: boolean;
  turn: number;
}

export type Phase = 'upkeep' | 'edict' | 'income' | 'event';

export interface LogEntry {
  id: string;
  turn: number;
  phase?: Phase | 'setup';
  text: string;
  /** Treasury / Unrest change, for the history view. */
  bp?: number;
  unrest?: number;
}

export interface Commander {
  name: string;
  /** Added to Morale checks. */
  cha: number;
  /** Ranks in Profession (soldier). */
  profession: number;
  /** Character level (or Hit Dice). */
  level: number;
  leadershipFeat: boolean;
  /** A kingdom leader commanding in person (gets that role's boons). */
  role?: RoleId;
  boons: BoonId[];
  /** Tactic granted by the Bonus Tactic boon. */
  bonusTactic?: TacticId;
}

export interface Army {
  id: string;
  name: string;
  side: 'kingdom' | 'enemy';
  /** e.g. "humans (fighter 2)" */
  type: string;
  alignment: string;
  size: ArmySize;
  /** CR of one unit (fractions allowed: 1/3 = 0.333...). */
  cr: number;
  /** CR of the mounts, if stronger than the riders. */
  mountCr?: number;
  hd: HitDie;
  /** Hexes per day. */
  speed: number;
  hp: number;
  tactics: TacticId[];
  resources: { armor?: 0 | 1 | 2; weapons?: 0 | 1 | 2; mounts?: boolean; ranged?: boolean; potions?: boolean; siege?: number };
  specials: { id: SpecialId; value?: number; note?: string }[];
  /** GM adjustments to OM and DV. */
  om: number;
  dv: number;
  morale: number;
  commander?: Commander;
  status: 'ready' | 'routed' | 'defeated' | 'disbanded';
  /** Settlement id when held in reserve (paid monthly instead of weekly). */
  reserve?: string;
  /** Behind on Consumption: Morale −2 until paid. */
  unpaid?: boolean;
  lastBattleTurn?: number;
  history: { turn: number; text: string }[];
}

/** An event that carries over between turns. */
export interface ActiveEvent {
  id: string;
  /** Rulebook event id (see rules/events.json), if it came from the event tables. */
  eventId?: string;
  name: string;
  /** e.g. "Settlement, Continuous" */
  tags: string;
  text: string;
  startedTurn: number;
  /**
   * 'resolved': continues every Event phase until resolved. 'next-event': ends at the next Event phase.
   * 'once': happens this turn only (it may still need checks); cleared at the next Event phase.
   */
  lasts: 'resolved' | 'next-event' | 'once';
  /** Event-specific memory, e.g. a run of successful checks or what the citizens demand. */
  state?: Record<string, string | number>;
  /** Turn the event's options were last carried out (once per Event phase). */
  handledTurn?: number;
  /** Settlement or hex it affects, if any. */
  location?: string;
  /** Turn it was last dealt with (checked, or let continue). */
  addressedTurn?: number;
  history: { turn: number; text: string }[];
}

export interface TurnState {
  phase: Phase;
  /** Steps already resolved this turn, by key (e.g. 'upkeep.stability'). */
  done: Record<string, string>;
  buildings: number;
  freeHousingUsed: boolean;
  hexClaims: number;
  improvements: number;
  settlements: number;
}

export interface Kingdom {
  id: string;
  name: string;
  alignment: Alignment;
  turn: number;
  treasury: number;
  unrest: number;
  size: number;
  fame: number;
  /** Missing on older saves (counts as 0). */
  infamy?: number;
  government?: Government;
  /** Size milestones (11, 26, ...) already rewarded with Fame or Infamy. */
  renownAwarded?: number[];
  settlementAdjustments?: SettlementAdjustment[];
  leaders: Partial<Record<RoleId, Leader>>;
  edicts: { holiday: number; promotion: number; taxation: number };
  features: Partial<Record<TerrainFeature, number>>;
  settlements: Settlement[];
  map?: HexMap;
  /** Missing on older saves. */
  armies?: Army[];
  /** The battle being fought, if any. */
  battle?: Battle;
  modifiers: Modifier[];
  log: LogEntry[];
  /** Ongoing events (continuous, or lasting until the next Event phase). Missing on older saves. */
  events?: ActiveEvent[];
  /** Temporary bonuses and penalties on kingdom checks from events. */
  checkMods?: CheckModifier[];
  /** Consumption change for the next Upkeep phase only (Food Surplus, Food Shortage, Crop Failure). */
  nextUpkeep?: { multiplier: number; add: number; labels: string[] };
  turnState: TurnState;
  eventLastTurn: boolean;
  settings: { districtsAddConsumption: boolean; diagonalAdjacency: boolean; setupMode: boolean; permanentEventEffects?: boolean; settlementSizeMods?: boolean };
  createdAt: number;
  updatedAt: number;
}
