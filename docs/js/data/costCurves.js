// docs/js/data/costCurves.js
import { UPGRADE_TIME_BY_LEVEL, BUILDING_TIME_MULT } from "./upgradeTimes.js";

/**
 * Convert upgrade time -> "total cost value"
 *
 * Why power 1.10?
 * - Keeps early levels cheap
 * - Lets late game cost balloon a bit faster than time
 *   (feels more RTS / “expensive endgame”)
 */
function totalValueFromTimeSeconds(timeSec) {
  const k = 6.0;            // global knob: bigger = more expensive everywhere
  const p = 1.10;           // curve knob
  return Math.floor(k * Math.pow(timeSec, p));
}

/**
 * Resource split profiles (must sum to ~1.0).
 * Tune these however you like—this is what makes buildings “feel” different.
 */
export const RESOURCE_PROFILES = {
  townhall:      { wood: 0.25, stone: 0.25, ore: 0.10, gold: 0.35, food: 0.05 },
  farm:          { wood: 0.55, stone: 0.05, ore: 0.00, gold: 0.10, food: 0.30 },
  lumber:        { wood: 0.60, stone: 0.05, ore: 0.00, gold: 0.10, food: 0.25 },
  quarry:        { wood: 0.20, stone: 0.55, ore: 0.05, gold: 0.15, food: 0.05 },
  mine:          { wood: 0.15, stone: 0.25, ore: 0.45, gold: 0.10, food: 0.05 },
  barracks:      { wood: 0.35, stone: 0.20, ore: 0.10, gold: 0.25, food: 0.10 },
  house:         { wood: 0.55, stone: 0.10, ore: 0.00, gold: 0.25, food: 0.10 },
  academy:       { wood: 0.20, stone: 0.20, ore: 0.15, gold: 0.40, food: 0.05 },
  commandcenter: { wood: 0.20, stone: 0.25, ore: 0.15, gold: 0.35, food: 0.05 },
};

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function normalizeProfile(profile) {
  const keys = ["food","wood","stone","ore","gold"];
  let sum = 0;
  for (const k of keys) sum += clamp01(profile?.[k] ?? 0);
  if (sum <= 0) return { food:0, wood:0, stone:0, ore:0, gold:1 };
  const out = {};
  for (const k of keys) out[k] = clamp01(profile?.[k] ?? 0) / sum;
  return out;
}

/**
 * Main helper:
 * upgrade cost FROM level -> level+1
 */
export function upgradeCostFor(buildingId, fromLevel) {
  const lvl = Math.max(1, Math.min(19, Number(fromLevel || 1)));

  const baseTime = UPGRADE_TIME_BY_LEVEL[lvl] ?? 0;
  const mult = BUILDING_TIME_MULT[buildingId] ?? 0.75;

  const timeSec = baseTime * mult;

  const totalValue = totalValueFromTimeSeconds(timeSec);

  const prof = normalizeProfile(RESOURCE_PROFILES[buildingId] || {});
  const cost = {
    food:  Math.floor(totalValue * prof.food),
    wood:  Math.floor(totalValue * prof.wood),
    stone: Math.floor(totalValue * prof.stone),
    ore:   Math.floor(totalValue * prof.ore),
    gold:  Math.floor(totalValue * prof.gold),
  };

  // keep it clean: remove zeros
  for (const k of Object.keys(cost)) {
    if (!cost[k]) delete cost[k];
  }

  return cost;
}
