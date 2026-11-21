import type { Alignment, Attr, Terrain, TerrainFeature } from '../rules/kingdom';
import type { RoleId } from '../rules/leadership';
import type { GenParams } from '../engine/mapgen';

export type Side = 'n' | 'e' | 's' | 'w';
export type Lot = [row: number, col: number];

export interface PlacedBuilding {
  id: string;
  type: string;
  lots: Lot[];
  /** Id of the placed building whose discount paid for this one. */
  discountedBy?: string;
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
  leaders: Partial<Record<RoleId, Leader>>;
  edicts: { holiday: number; promotion: number; taxation: number };
  features: Partial<Record<TerrainFeature, number>>;
  settlements: Settlement[];
  map?: HexMap;
  modifiers: Modifier[];
  log: LogEntry[];
  turnState: TurnState;
  eventLastTurn: boolean;
  settings: { districtsAddConsumption: boolean; diagonalAdjacency: boolean; setupMode: boolean };
  createdAt: number;
  updatedAt: number;
}
