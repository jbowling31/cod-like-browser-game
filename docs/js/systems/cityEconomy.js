// docs/js/systems/cityEconomy.js
import { state } from "../state.js";

/**
 * Production model (authoritative):
 * - Reads from state.buildings.placedByPlotId (used by cityBuildings.js).
 * - Sums levels across placed buildings (supports multiple farms, etc).
 *
 * API:
 * - getProductionPerSecond(buildings?)  // buildings arg optional; we don't need it now
 * - updateEconomy(dtSeconds, buildings?)
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function ensureRes() {
  state.resources ??= {};
  state.resources.food ??= 0;
  state.resources.wood ??= 0;
  state.resources.stone ??= 0;
  state.resources.ore ??= 0;
  state.resources.gold ??= 0;
}

function ensureBuildingsShape() {
  state.buildings ??= {};
  state.buildings.placedByPlotId ??= {};
}

function farmRate(totalLevel) {
  if (totalLevel <= 0) return 0;
  return 1.5 * totalLevel;
}

function lumberRate(totalLevel) {
  if (totalLevel <= 0) return 0;
  return 1.2 * totalLevel;
}

function quarryRate(totalLevel) {
  if (totalLevel <= 0) return 0;
  return 1.0 * totalLevel;
}

function mineRate(totalLevel) {
  if (totalLevel <= 0) return 0;
  return 0.8 * totalLevel;
}

function townhallGoldRate(townhallLevel) {
  if (townhallLevel <= 0) return 0;
  return 0.2 * townhallLevel;
}

function houseGoldRate(totalLevel) {
  if (totalLevel <= 0) return 0;
  return 0.5 * totalLevel;
}

/**
 * Returns a map of buildingId -> summedLevel across all placed plots.
 * Also excludes buildings still "under construction" (buildEndAt active).
 * (Upgrading buildings still produce at their current level; change later if you want.)
 */
function sumLevelsFromPlaced() {
  ensureBuildingsShape();
  const placed = state.buildings.placedByPlotId;

  const levelsById = {};
  for (const plotId in placed) {
    const p = placed[plotId];
    if (!p?.buildingId) continue;

    // If it's still constructing, do not produce yet.
    if ((p.buildEndAt ?? 0) > 0) continue;

    const id = p.buildingId;
    const lvl = clamp(Number(p.level ?? 1) || 1, 1, 20);
    levelsById[id] = (levelsById[id] || 0) + lvl;
  }
  return levelsById;
}

export function getProductionPerSecond(/* buildings optional */) {
  const levels = sumLevelsFromPlaced();

  const th = clamp(Number(levels.townhall ?? 0) || 0, 0, 20);

  const farmLvl = clamp(Number(levels.farm ?? 0) || 0, 0, 999);
  const lumberLvl = clamp(Number(levels.lumber ?? 0) || 0, 0, 999);
  const quarryLvl = clamp(Number(levels.quarry ?? 0) || 0, 0, 999);
  const mineLvl = clamp(Number(levels.mine ?? 0) || 0, 0, 999);
  const houseLvl = clamp(Number(levels.house ?? 0) || 0, 0, 999);

  return {
    food: farmRate(farmLvl),
    wood: lumberRate(lumberLvl),
    stone: quarryRate(quarryLvl),
    ore: mineRate(mineLvl),
    gold: townhallGoldRate(th) + houseGoldRate(houseLvl),
  };
}

export function updateEconomy(dtSeconds /*, buildings optional */) {
  ensureRes();

  const dt = Math.max(0, Number(dtSeconds) || 0);
  if (dt <= 0) return;

  const p = getProductionPerSecond();

  state.resources.food += p.food * dt;
  state.resources.wood += p.wood * dt;
  state.resources.stone += p.stone * dt;
  state.resources.ore += p.ore * dt;
  state.resources.gold += p.gold * dt;
}
