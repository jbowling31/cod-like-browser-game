// docs/js/systems/cityEconomy.js
import { state } from "../state.js";

/**
 * Production model:
 * - Each building produces its resource based on its level.
 * - Town Hall can optionally add a small gold trickle (or do nothing).
 * - All values are "per second".
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function levelOf(id) {
  const lvl = state.buildings?.levels?.[id] ?? 0;
  return clamp(lvl, 0, 20);
}

// Simple, readable curves (tweak later)
function farmRate(level) {
  // food / sec
  if (level <= 0) return 0;
  return 1.5 * level;          // L1=1.5/s, L10=15/s, L20=30/s
}

function lumberRate(level) {
  if (level <= 0) return 0;
  return 1.2 * level;          // L20=24/s
}

function quarryRate(level) {
  if (level <= 0) return 0;
  return 1.0 * level;          // L20=20/s
}

function mineRate(level) {
  if (level <= 0) return 0;
  return 0.8 * level;          // L20=16/s
}

function townhallGoldRate(townhallLevel) {
  // optional small passive gold. set to 0 if you don’t want it yet.
  if (townhallLevel <= 0) return 0;
  return 0.2 * townhallLevel;  // L1=0.2/s, L20=4/s
}

function houseGoldRate(level) {
  // small passive gold per sec from house level
  if (level <= 0) return 0;
  return 0.5 * level; // L1=0.5/s, L10=5/s, L20=10/s (tweak if too spicy)
}


export function getProductionPerSecond() {
  const th = clamp(state.buildings?.townhallLevel ?? 0, 0, 20);

  const farm = farmRate(levelOf("farm"));
  const lumber = lumberRate(levelOf("lumber"));
  const quarry = quarryRate(levelOf("quarry"));
  const mine = mineRate(levelOf("mine"));
  const gold = townhallGoldRate(th) + houseGoldRate(levelOf("house"));


  return {
    food: farm,
    wood: lumber,
    stone: quarry,
    ore: mine,
    gold,
  };
}

export function updateEconomy(dtSeconds) {
  // dtSeconds is float seconds since last frame
  const dt = Math.max(0, dtSeconds || 0);
  if (dt <= 0) return;

  const p = getProductionPerSecond();

  // Accumulate resources
  state.resources.food += p.food * dt;
  state.resources.wood += p.wood * dt;
  state.resources.stone += p.stone * dt;
  state.resources.ore += p.ore * dt;
  state.resources.gold += p.gold * dt;

  // Keep them clean (optional: floor here, or keep decimals internally)
  // We'll keep decimals internally and round for HUD display.
}
