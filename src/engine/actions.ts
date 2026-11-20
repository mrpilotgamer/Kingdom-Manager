// Kingdom operations. Each mutates the kingdom passed in (the store hands over a fresh copy).
import { building } from '../rules/buildings';
import { TERRAIN, type Terrain, type TerrainFeature } from '../rules/kingdom';
import type { District, Kingdom, LogEntry, Lot, Settlement, Side } from '../state/types';
import { uid } from '../state/util';
import { buildCost, upgradeCost } from './costs';

export function log(k: Kingdom, text: string, extra: Partial<LogEntry> = {}) {
  k.log.unshift({ id: uid(), turn: k.turn, phase: k.settings.setupMode ? 'setup' : k.turnState.phase, text, ...extra });
}

export function changeUnrest(k: Kingdom, delta: number) {
  const before = k.unrest;
  k.unrest = Math.max(0, k.unrest + delta);
  return k.unrest - before;
}

export function spend(k: Kingdom, bp: number) {
  if (k.settings.setupMode) return 0;
  k.treasury -= bp;
  return -bp;
}

export function newDistrict(name: string): District {
  return {
    id: uid(), name, borders: { n: 'land', e: 'land', s: 'land', w: 'land' },
    buildings: [], improvements: [], addons: {}, walls: {},
  };
}

function find(k: Kingdom, sId: string, dId: string) {
  const s = k.settlements.find((x) => x.id === sId)!;
  const d = s.districts.find((x) => x.id === dId)!;
  return { s, d };
}

function countBuild(k: Kingdom, type: string) {
  if (k.settings.setupMode) return;
  if (building(type).housing && !k.turnState.freeHousingUsed) k.turnState.freeHousingUsed = true;
  else k.turnState.buildings += 1;
}

function completionUnrest(k: Kingdom, s: Settlement, type: string) {
  const def = building(type);
  if (k.settings.setupMode || !def.unrest) return 0;
  if (def.unrestOncePerSettlement) {
    const already = s.districts.some((d) => Object.values(d.walls).includes(type as 'city-wall' | 'moat'));
    if (already) return 0;
  }
  return changeUnrest(k, def.unrest);
}

export function placeBuilding(k: Kingdom, sId: string, dId: string, type: string, lots: Lot[]) {
  const { s, d } = find(k, sId, dId);
  const def = building(type);
  const { cost, discountedBy, sourceName } = buildCost(s, type);
  const unrest = completionUnrest(k, s, type);
  const bp = spend(k, cost);
  d.buildings.push({ id: uid(), type, lots, discountedBy: k.settings.setupMode ? undefined : discountedBy });
  countBuild(k, type);
  log(k, `Built ${def.name} in ${s.name}${discountedBy && !k.settings.setupMode ? ` (half price from ${sourceName})` : ''}.`, { bp, unrest });
}

export function upgradeBuilding(k: Kingdom, sId: string, dId: string, placedId: string, toType: string, lots: Lot[]) {
  const { s, d } = find(k, sId, dId);
  const old = d.buildings.find((b) => b.id === placedId)!;
  const cost = upgradeCost(old.type, toType);
  const unrest = completionUnrest(k, s, toType);
  const bp = spend(k, cost);
  old.type = toType;
  old.lots = lots;
  old.discountedBy = undefined;
  countBuild(k, toType);
  log(k, `Upgraded to ${building(toType).name} in ${s.name}.`, { bp, unrest });
}

export function demolish(k: Kingdom, sId: string, dId: string, placedId: string) {
  const { s, d } = find(k, sId, dId);
  const b = d.buildings.find((x) => x.id === placedId)!;
  d.buildings = d.buildings.filter((x) => x.id !== placedId);
  if (k.settings.setupMode) {
    log(k, `Removed ${building(b.type).name} from ${s.name}.`);
    return;
  }
  const bp = spend(k, 1);
  k.turnState.buildings += 1;
  log(k, `Demolished ${building(b.type).name} in ${s.name}.`, { bp });
}

export function toggleImprovement(k: Kingdom, sId: string, dId: string, type: string) {
  const { s, d } = find(k, sId, dId);
  const def = building(type);
  if (d.improvements.includes(type)) {
    d.improvements = d.improvements.filter((x) => x !== type);
    log(k, `Removed ${def.name} from ${s.name} (${d.name}).`);
    return;
  }
  const bp = spend(k, buildCost(s, type).cost);
  d.improvements.push(type);
  countBuild(k, type);
  log(k, `Built ${def.name} in ${s.name} (${d.name}).`, { bp });
}

export function setWall(k: Kingdom, sId: string, dId: string, side: Side, type: 'city-wall' | 'moat' | null) {
  const { s, d } = find(k, sId, dId);
  if (!type) {
    delete d.walls[side];
    log(k, `Removed fortification from the ${side.toUpperCase()} border of ${s.name}.`);
    return;
  }
  const unrest = completionUnrest(k, s, type);
  const bp = spend(k, buildCost(s, type).cost);
  d.walls[side] = type;
  countBuild(k, type);
  log(k, `Built ${building(type).name} on the ${side.toUpperCase()} border of ${s.name}.`, { bp, unrest });
}

export function changeAddon(k: Kingdom, sId: string, dId: string, type: string, delta: 1 | -1) {
  const { s, d } = find(k, sId, dId);
  const n = (d.addons[type] ?? 0) + delta;
  if (n < 0) return;
  d.addons[type] = n;
  if (delta > 0) {
    const bp = spend(k, building(type).cost);
    countBuild(k, type);
    log(k, `Added ${building(type).name} in ${s.name}.`, { bp });
  } else log(k, `Removed ${building(type).name} from ${s.name}.`);
}

export function addDistrict(k: Kingdom, sId: string) {
  const s = k.settlements.find((x) => x.id === sId)!;
  const bp = spend(k, TERRAIN[s.terrain].prepCost);
  s.districts.push(newDistrict(`District ${s.districts.length + 1}`));
  log(k, `Prepared a new district in ${s.name} (${TERRAIN[s.terrain].label}).`, { bp });
}

export function foundSettlement(k: Kingdom, name: string, terrain: Terrain) {
  const bp = spend(k, TERRAIN[terrain].prepCost);
  const s: Settlement = { id: uid(), name, terrain, districts: [newDistrict('District 1')] };
  k.settlements.push(s);
  if (!k.settings.setupMode) k.turnState.settlements += 1;
  log(k, `Founded ${name} on ${TERRAIN[terrain].label.toLowerCase()} (site preparation).`, { bp });
  return s;
}

export function removeSettlement(k: Kingdom, sId: string) {
  const s = k.settlements.find((x) => x.id === sId)!;
  k.settlements = k.settlements.filter((x) => x.id !== sId);
  log(k, `Removed settlement ${s.name}.`);
}

export function claimHex(k: Kingdom) {
  const bp = spend(k, 1);
  k.size += 1;
  if (!k.settings.setupMode) k.turnState.hexClaims += 1;
  log(k, `Claimed a hex. Size is now ${k.size}.`, { bp });
}

export function abandonHex(k: Kingdom, hadSettlement = false) {
  if (k.size <= 0) return;
  k.size -= 1;
  const unrest = k.settings.setupMode ? 0 : changeUnrest(k, hadSettlement ? 4 : 1);
  log(k, `Abandoned a hex. Size is now ${k.size}.`, { unrest });
}

export function loseHex(k: Kingdom) {
  if (k.size <= 0) return;
  k.size -= 1;
  log(k, `Lost control of a hex to Unrest. Size is now ${k.size}.`);
}

export function addFeature(k: Kingdom, f: TerrainFeature, cost: number, label: string) {
  k.features[f] = (k.features[f] ?? 0) + 1;
  const bp = spend(k, cost);
  let unrest = 0;
  const isImprovement = !['lair', 'landmark', 'landmarkRoad', 'resource', 'river'].includes(f);
  if (!k.settings.setupMode && isImprovement) k.turnState.improvements += 1;
  if ((f === 'fort' || f === 'watchtower') && !k.settings.setupMode) unrest = changeUnrest(k, -1);
  log(k, `Added ${label}.`, { bp, unrest });
}

export function removeFeature(k: Kingdom, f: TerrainFeature, label: string) {
  const n = k.features[f] ?? 0;
  if (!n) return;
  k.features[f] = n - 1;
  log(k, `Removed ${label}.`);
}

export function adjust(k: Kingdom, what: 'treasury' | 'unrest' | 'fame', delta: number, reason: string) {
  if (what === 'treasury') {
    k.treasury += delta;
    log(k, reason, { bp: delta });
  } else if (what === 'unrest') {
    log(k, reason, { unrest: changeUnrest(k, delta) });
  } else {
    k.fame += delta;
    log(k, reason);
  }
}
