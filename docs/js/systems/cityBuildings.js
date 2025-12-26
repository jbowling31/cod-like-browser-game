// docs/js/systems/cityBuildings.js
import { state } from "../state.js";
import { CITY_PLOTS } from "../plots.city.js";
import { BUILDINGS } from "../data/buildingCatalog.js";

/**
 * City Buildings System
 *
 * Fixes:
 * - Timer completion requires tick() (called every frame in index.html)
 * - RTS-style gates:
 *   - build unlocks by Town Hall via minTownhallLevel
 *   - non-townhall upgrades capped at current Town Hall level
 *   - townhall upgrade requires all built buildings >= current TH level
 *
 * Adds:
 * - finishPlotTimersNow(plotId) (for per-plot speedups later)
 * - applySpeedupToPlot(plotId, pct) (reduces remaining time for active timer on that plot)
 *
 * RTS Timing (new):
 * - Exponential upgrade times (fast early, long late)
 * - Town Hall 1->5 ~ 1 hour
 * - Town Hall 1->20 ~ 14 days
 */

const DEFAULTS = Object.freeze({
  maxQueue: 2,
});

// ----- Timing model -----
const UPGRADE_GROWTH = 1.45;

// Town Hall target: total time for upgrades (1->2 ... 19->20) ~= 14 days
const TH_TOTAL_UPGRADE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const TH_UPGRADE_STEPS = 19;

// base such that: base * (g^steps - 1)/(g - 1) = target
const TH_BASE_UPGRADE_MS =
  TH_TOTAL_UPGRADE_MS * (UPGRADE_GROWTH - 1) / (Math.pow(UPGRADE_GROWTH, TH_UPGRADE_STEPS) - 1);

// Small “place/build” time at level 1 (keeps RTS feel; still uses queue if timers are ON)
const BASE_BUILD_MS = 90_000; // 1.5 minutes baseline

// Per-building speed multipliers (tweak any time)
const BUILDING_TIME_FACTOR = Object.freeze({
  townhall: 1.0,
  commandcenter: 0.75,
  academy: 0.75,
  barracks: 0.60,
  quarry: 0.50,
  mine: 0.50,
  farm: 0.45,
  lumber: 0.45,
  house: 0.40,
});

function factorFor(buildingId) {
  return Number.isFinite(BUILDING_TIME_FACTOR[buildingId])
    ? BUILDING_TIME_FACTOR[buildingId]
    : 0.55; // default for any future buildings
}

function nowMs() {
  return Date.now();
}

function ensureStateShape() {
  state.buildings ??= {};
  state.buildings.placedByPlotId ??= {};
  state.buildings.levels ??= {};
}

function getPlacedMap() {
  ensureStateShape();
  return state.buildings.placedByPlotId;
}

function validatePlotId(plotId) {
  return CITY_PLOTS.some((p) => p.id === plotId);
}

function getTownhallLevel() {
  const placed = getPlacedMap();
  for (const plotId in placed) {
    const p = placed[plotId];
    if (p?.buildingId === "townhall") return Number(p.level || 1);
  }
  return 0;
}

function countActiveQueues(placedMap) {
  let active = 0;
  for (const plotId in placedMap) {
    const p = placedMap[plotId];
    if (!p) continue;
    if ((p.buildEndAt ?? 0) > 0) active++;
    if ((p.upgradeEndAt ?? 0) > 0) active++;
  }
  return active;
}

function computeBuildDurationMs(buildingId, level) {
  void level;
  const f = factorFor(buildingId);
  return Math.max(5_000, Math.floor(BASE_BUILD_MS * f));
}

function computeUpgradeDurationMs(buildingId, fromLevel) {
  const lvl = Math.max(1, Number(fromLevel || 1));
  const f = factorFor(buildingId);

  // Exponential curve: base * g^(lvl-1)
  const ms = (TH_BASE_UPGRADE_MS * f) * Math.pow(UPGRADE_GROWTH, (lvl - 1));
  return Math.max(8_000, Math.floor(ms));
}

function hasResources(cost) {
  if (!cost) return true;
  state.resources ??= {};
  for (const k of Object.keys(cost)) {
    const need = Number(cost[k] || 0);
    if (need <= 0) continue;
    if (Number(state.resources[k] || 0) < need) return false;
  }
  return true;
}

function spendResources(cost) {
  if (!cost) return;
  state.resources ??= {};
  for (const k of Object.keys(cost)) {
    const need = Number(cost[k] || 0);
    if (need <= 0) continue;
    state.resources[k] = Number(state.resources[k] || 0) - need;
  }
}

function canBuildByTownhall(buildingId) {
  const th = getTownhallLevel() || 1;
  const def = BUILDINGS?.[buildingId];
  const min = Number(def?.minTownhallLevel || 1);
  if (th < min) return { ok: false, reason: `Requires Town Hall Lv ${min}` };
  return { ok: true };
}

// RTS uniqueness by default: only allow multiples if unique:false
function canPlaceUnique(buildingId, placedMap) {
  const def = BUILDINGS?.[buildingId];
  const isUnique = def?.unique !== false; // ✅ default unique
  if (!isUnique) return { ok: true };

  for (const pid in placedMap) {
    if (placedMap[pid]?.buildingId === buildingId) {
      return { ok: false, reason: `${def?.name || buildingId} is unique` };
    }
  }
  return { ok: true };
}

function canUpgradeByTownhall(buildingId, targetLevel) {
  const th = getTownhallLevel() || 1;
  if (buildingId !== "townhall" && targetLevel > th) {
    return { ok: false, reason: `Max level is Town Hall Lv ${th}` };
  }
  return { ok: true };
}

function townhallUpgradeRequiresAllBuildingsAtLeast(levelRequired, placedMap) {
  for (const pid in placedMap) {
    const p = placedMap[pid];
    if (!p) continue;
    if (p.buildingId === "townhall") continue;
    if (Number(p.level || 1) < levelRequired) return false;
  }
  return true;
}

function finishReadyTimers(placedMap, now) {
  for (const pid in placedMap) {
    const p = placedMap[pid];
    if (!p) continue;

    if ((p.buildEndAt ?? 0) > 0 && now >= p.buildEndAt) {
      p.buildStartedAt = 0;
      p.buildEndAt = 0;
    }

    if ((p.upgradeEndAt ?? 0) > 0 && now >= p.upgradeEndAt) {
      const to = Number(p.upgradingToLevel || (Number(p.level || 1) + 1));
      p.level = to;
      p.upgradeStartedAt = 0;
      p.upgradeEndAt = 0;
      p.upgradingToLevel = 0;
    }
  }
}

function reduceEndAt(endAt, pct) {
  const now = nowMs();
  const remaining = Math.max(0, Number(endAt) - now);
  const reduced = Math.floor(remaining * (1 - pct));
  return now + reduced;
}

export function createCityBuildingsSystem({ basePath } = {}) {
  void basePath;
  ensureStateShape();

  const api = {
    tick(now = nowMs()) {
      if (state.settings?.timersEnabled === false) return;
      finishReadyTimers(getPlacedMap(), now);
    },

    finishAllTimersNow() {
      const placed = getPlacedMap();
      for (const pid in placed) api.finishPlotTimersNow(pid);
    },

    finishPlotTimersNow(plotId) {
      const p = getPlacedMap()[plotId];
      if (!p) return { ok: false, reason: "No building on plot" };

      if ((p.buildEndAt ?? 0) > 0) {
        p.buildStartedAt = 0;
        p.buildEndAt = 0;
      }

      if ((p.upgradeEndAt ?? 0) > 0) {
        const to = Number(p.upgradingToLevel || (Number(p.level || 1) + 1));
        p.level = to;
        p.upgradeStartedAt = 0;
        p.upgradeEndAt = 0;
        p.upgradingToLevel = 0;
      }

      return { ok: true };
    },

    applySpeedupToPlot(plotId, pct) {
      const p = getPlacedMap()[plotId];
      if (!p) return { ok: false, reason: "No building on plot" };
      if (state.settings?.timersEnabled === false) return { ok: false, reason: "Timers are OFF" };

      const speed = Number(pct || 0);
      if (!(speed > 0 && speed < 1)) return { ok: false, reason: "Invalid speedup" };

      if ((p.upgradeEndAt ?? 0) > 0) {
        p.upgradeEndAt = reduceEndAt(p.upgradeEndAt, speed);
        return { ok: true };
      }

      if ((p.buildEndAt ?? 0) > 0) {
        p.buildEndAt = reduceEndAt(p.buildEndAt, speed);
        return { ok: true };
      }

      return { ok: false, reason: "No active timer on this plot" };
    },

    getBuildQueueInfo() {
      const placed = getPlacedMap();
      const active = countActiveQueues(placed);
      const max = DEFAULTS.maxQueue;
      return { active, max, full: active >= max };
    },

    getPlacedOnPlot(plotId) {
      const p = getPlacedMap()[plotId];
      return p ? { ...p } : null;
    },

    getByBuildingId(buildingId) {
      const placed = getPlacedMap();
      for (const pid in placed) {
        const p = placed[pid];
        if (p?.buildingId === buildingId) return { ...p };
      }
      return null;
    },

    getStatus(plotId) {
      const p = getPlacedMap()[plotId];
      if (!p) return null;

      const now = nowMs();
      const constructing = (p.buildEndAt ?? 0) > 0;
      const upgrading = (p.upgradeEndAt ?? 0) > 0;

      return {
        constructing,
        upgrading,
        buildRemainingMs: constructing ? Math.max(0, p.buildEndAt - now) : 0,
        upgradeRemainingMs: upgrading ? Math.max(0, p.upgradeEndAt - now) : 0,
      };
    },

    canBuildBuilding(buildingId) {
      const placed = getPlacedMap();

      if (!BUILDINGS?.[buildingId]) return { ok: false, reason: "Unknown building" };
      if (buildingId === "townhall") return { ok: false, reason: "Town Hall is placed automatically" };

      const thGate = canBuildByTownhall(buildingId);
      if (!thGate.ok) return thGate;

      const uniq = canPlaceUnique(buildingId, placed);
      if (!uniq.ok) return uniq;

      const q = api.getBuildQueueInfo();
      if (state.settings?.timersEnabled !== false && q.full) {
        return { ok: false, reason: `All ${q.max} builder queues are busy.` };
      }

      const cost = BUILDINGS[buildingId]?.cost || null;
      if (!hasResources(cost)) return { ok: false, reason: "Not enough resources" };

      return { ok: true };
    },

    canUpgradePlot(plotId) {
      const placed = getPlacedMap()[plotId];
      if (!placed) return { ok: false, reason: "Nothing built here" };

      const st = api.getStatus(plotId);
      if (st?.constructing) return { ok: false, reason: "Under construction" };
      if (st?.upgrading) return { ok: false, reason: "Already upgrading" };

      const q = api.getBuildQueueInfo();
      if (state.settings?.timersEnabled !== false && q.full) {
        return { ok: false, reason: `All ${q.max} builder queues are busy.` };
      }

      const def = BUILDINGS?.[placed.buildingId];
      if (!def) return { ok: false, reason: "Unknown building" };

      const from = Number(placed.level || 1);
      const to = from + 1;

      const gate = canUpgradeByTownhall(placed.buildingId, to);
      if (!gate.ok) return gate;

      if (placed.buildingId === "townhall") {
        const ok = townhallUpgradeRequiresAllBuildingsAtLeast(from, getPlacedMap());
        if (!ok) return { ok: false, reason: `Upgrade all buildings to Lv ${from} first` };
      }

      const cost = def?.upgradeCost ? def.upgradeCost(from) : null;
      if (!cost) return { ok: false, reason: "No upgradeCost defined" };
      if (!hasResources(cost)) return { ok: false, reason: "Not enough resources" };

      return { ok: true };
    },

    async placeBuildingOnPlot(plotId, buildingId, level = 1) {
      ensureStateShape();
      if (!validatePlotId(plotId)) return { ok: false, reason: "Invalid plot" };

      const placed = getPlacedMap();
      if (placed[plotId]) return { ok: false, reason: "Plot already occupied" };

      const chk = api.canBuildBuilding(buildingId);
      if (!chk.ok) return chk;

      const def = BUILDINGS[buildingId];
      spendResources(def?.cost || null);

      const lv = Math.max(1, Number(level || 1));
      const p = {
        plotId,
        buildingId,
        level: lv,
        buildStartedAt: 0,
        buildEndAt: 0,
        upgradeStartedAt: 0,
        upgradeEndAt: 0,
        upgradingToLevel: 0,
      };

      if (state.settings?.timersEnabled === false) {
        placed[plotId] = p;
        return { ok: true };
      }

      const dur = computeBuildDurationMs(buildingId, lv);
      const n = nowMs();
      p.buildStartedAt = n;
      p.buildEndAt = n + dur;

      placed[plotId] = p;
      return { ok: true };
    },

    async upgradePlot(plotId) {
      const placedMap = getPlacedMap();
      const p = placedMap[plotId];
      if (!p) return { ok: false, reason: "Nothing built here" };

      const chk = api.canUpgradePlot(plotId);
      if (!chk.ok) return chk;

      const def = BUILDINGS[p.buildingId];
      const from = Number(p.level || 1);
      const to = from + 1;
      const cost = def?.upgradeCost ? def.upgradeCost(from) : null;

      spendResources(cost);

      if (state.settings?.timersEnabled === false) {
        p.level = to;
        return { ok: true };
      }

      const n = nowMs();
      const dur = computeUpgradeDurationMs(p.buildingId, from);

      p.upgradeStartedAt = n;
      p.upgradeEndAt = n + dur;
      p.upgradingToLevel = to;

      return { ok: true };
    },

    async ensureTownhall() {
      ensureStateShape();
      const placed = getPlacedMap();

      for (const pid in placed) {
        if (placed[pid]?.buildingId === "townhall") return { ok: true };
      }

      const thPlotId = CITY_PLOTS.find((p) => p.id === "plot_4")?.id ?? CITY_PLOTS[0]?.id;

      placed[thPlotId] = {
        plotId: thPlotId,
        buildingId: "townhall",
        level: 1,
        buildStartedAt: 0,
        buildEndAt: 0,
        upgradeStartedAt: 0,
        upgradeEndAt: 0,
        upgradingToLevel: 0,
      };

      return { ok: true };
    },

    resetAllPlaced() {
      ensureStateShape();
      state.buildings.placedByPlotId = {};
    },

    async hydrateFromSave(placedList) {
      ensureStateShape();
      state.buildings.placedByPlotId = {};
      const placedMap = getPlacedMap();

      if (!Array.isArray(placedList)) return;

      for (const item of placedList) {
        if (!item?.plotId || !validatePlotId(item.plotId)) continue;
        if (!BUILDINGS?.[item.buildingId]) continue;

        placedMap[item.plotId] = {
          plotId: item.plotId,
          buildingId: item.buildingId,
          level: Number(item.level || 1),

          buildStartedAt: Number(item.buildStartedAt || 0),
          buildEndAt: Number(item.buildEndAt || 0),

          upgradeStartedAt: Number(item.upgradeStartedAt || 0),
          upgradeEndAt: Number(item.upgradeEndAt || 0),
          upgradingToLevel: Number(item.upgradingToLevel || 0),
        };
      }

      finishReadyTimers(getPlacedMap(), nowMs());
    },
  };

  return api;
}

export default createCityBuildingsSystem;
