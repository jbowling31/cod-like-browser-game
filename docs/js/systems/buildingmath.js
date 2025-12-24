// app/js/systems/buildingMath.js
import { BUILDING_TYPES, BUILDING_CATALOG, clampLevel } from "../data/buildingcatalog.js";

/**
 * Production curve:
 * - Base per building type
 * - Scales smoothly to L20 (no weird jumps)
 * - You can rebalance later easily
 */
const BASE_PROD = Object.freeze({
  food: 1.2,
  wood: 1.0,
  stone: 0.9,
  ore: 0.75,
});

const TYPE_TO_RESOURCE = Object.freeze({
  [BUILDING_TYPES.FARM]: "food",
  [BUILDING_TYPES.LUMBER]: "wood",
  [BUILDING_TYPES.QUARRY]: "stone",
  [BUILDING_TYPES.MINE]: "ore",
});

export function getProducedResource(type) {
  return TYPE_TO_RESOURCE[type] || null;
}

export function getProductionPerSecond(type, level) {
  const res = getProducedResource(type);
  if (!res) return 0;

  const lv = clampLevel(level, 20);
  const base = BASE_PROD[res] ?? 0;

  // mild curve: ~2.5x by L20
  const mult = 1 + 0.08 * (lv - 1); // L1=1.00 ... L20=2.52
  return +(base * mult).toFixed(3);
}

/**
 * Upgrade costs:
 * - Uses a "primary resource" + some generic scaling
 * - Town Hall stays special (if you already have TH math, keep it and skip TH here)
 */
export function getUpgradeCost(type, currentLevel) {
  const nextLevel = clampLevel((currentLevel | 0) + 1, 20);

  // quick multipliers per building type (tune later)
  const typeMult = ({
    [BUILDING_TYPES.FARM]: 1.0,
    [BUILDING_TYPES.LUMBER]: 1.05,
    [BUILDING_TYPES.QUARRY]: 1.1,
    [BUILDING_TYPES.MINE]: 1.15,
    [BUILDING_TYPES.TOWNHALL]: 1.25,
  }[type]) ?? 1.0;

  // scaling curve
  const base = 20;
  const scaled = Math.floor((base + nextLevel * nextLevel * 6) * typeMult);

  const primary = getProducedResource(type);

  // cost mix (simple + readable)
  const cost = {
    gold: Math.floor(scaled * 0.6),
    wood: Math.floor(scaled * 0.35),
    stone: Math.floor(scaled * 0.25),
    ore: Math.floor(scaled * 0.15),
    food: Math.floor(scaled * 0.15),
  };

  // If it produces a resource, bias cost slightly toward that resource.
  if (primary) cost[primary] = Math.floor(cost[primary] * 1.35);

  // Town Hall: heavier across the board
  if (type === BUILDING_TYPES.TOWNHALL) {
    cost.gold = Math.floor(scaled * 1.0);
    cost.wood = Math.floor(scaled * 0.8);
    cost.stone = Math.floor(scaled * 0.8);
    cost.ore = Math.floor(scaled * 0.45);
    cost.food = Math.floor(scaled * 0.45);
  }

  return cost;
}

export function getUpgradeTimeSeconds(type, currentLevel) {
  const nextLevel = clampLevel((currentLevel | 0) + 1, 20);

  const base = ({
    [BUILDING_TYPES.FARM]: 15,
    [BUILDING_TYPES.LUMBER]: 18,
    [BUILDING_TYPES.QUARRY]: 22,
    [BUILDING_TYPES.MINE]: 25,
    [BUILDING_TYPES.TOWNHALL]: 45,
  }[type]) ?? 20;

  // curve: ~3x by L20
  const t = Math.round(base * Math.pow(1.08, nextLevel - 1));
  return Math.max(5, t);
}

/**
 * Gating rule (simple, feels good):
 * - You cannot upgrade any building above Town Hall level.
 * - You can optionally require TH level milestones for upgrades (same thing basically).
 */
export function canUpgradeBuilding(type, currentLevel, townHallLevel) {
  const catalog = BUILDING_CATALOG[type];
  if (!catalog) return false;
  if (currentLevel >= catalog.maxLevel) return false;

  const nextLevel = currentLevel + 1;
  if (type !== BUILDING_TYPES.TOWNHALL && nextLevel > townHallLevel) return false;

  return true;
}
