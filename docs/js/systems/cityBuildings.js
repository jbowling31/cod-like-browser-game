// docs/js/systems/cityBuildings.js
import { BUILDINGS } from "../data/buildingCatalog.js";
import { CITY_PLOTS } from "../plots.city.js";
import { state } from "../state.js";
import { loadBuildingSprite } from "./assets.js";

const MAX_LEVEL = 20;

// How many simultaneous build/upgrade timers may run at once
const BUILD_QUEUE_LIMIT = 2;

/**
 * "Old rules" intent:
 * - Buildings unlock as TH increases.
 * - To upgrade TH further, you must have built + kept up with the unlocked buildings.
 *
 * IMPORTANT: This map represents the building that becomes relevant AFTER reaching that TH level.
 * With the "old rules", the requirement applies when upgrading FROM that level to the next.
 *
 * Example:
 * - When TH becomes level 2, Farm is now in your "required set".
 * - So to upgrade TH 2 -> 3, you must have Farm built (and kept up).
 */
const TOWNHALL_UNLOCKS = {
  2: "farm",
  3: "lumber",
  4: "barracks",
  5: "quarry",
  6: "house",
  7: "mine",
  8: "academy",
  10: "commandcenter",
};

function ensureState() {
  state.resources ??= {};
  state.resources.food ??= 0;
  state.resources.wood ??= 0;
  state.resources.stone ??= 0;
  state.resources.ore ??= 0;
  state.resources.gold ??= 0;

  state.settings ??= {};
  if (typeof state.settings.timersEnabled !== "boolean") state.settings.timersEnabled = true;

  state.buildings ??= {};
  state.buildings.levels ??= {};
  state.buildings.townhallLevel ??= 0;
}

function timersEnabled() {
  ensureState();
  return !!state.settings.timersEnabled;
}

function canAfford(cost) {
  ensureState();
  if (!cost) return true;
  return (
    state.resources.food >= (cost.food || 0) &&
    state.resources.wood >= (cost.wood || 0) &&
    state.resources.stone >= (cost.stone || 0) &&
    state.resources.ore >= (cost.ore || 0) &&
    state.resources.gold >= (cost.gold || 0)
  );
}

function spend(cost) {
  ensureState();
  if (!cost) return;
  state.resources.food -= cost.food || 0;
  state.resources.wood -= cost.wood || 0;
  state.resources.stone -= cost.stone || 0;
  state.resources.ore -= cost.ore || 0;
  state.resources.gold -= cost.gold || 0;
}

function isComplete(inst) {
  const now = Date.now();
  const constructing = !!inst.buildEndAt && inst.buildEndAt > now;
  const upgrading = !!inst.upgradeEndAt && inst.upgradeEndAt > now;
  return !constructing && !upgrading;
}

/**
 * L20 targets:
 * - townhall: 14 days
 * - barracks/academy: 9 days
 * - commandcenter: 7 days
 * - others: 4 days
 *
 * (You can tweak curve by adjusting secondsForTargetLevel; leaving base targets here.)
 */
function maxSecondsAt20(buildingId) {
  if (buildingId === "townhall") return 14 * 24 * 3600;
  if (buildingId === "barracks" || buildingId === "academy") return 9 * 24 * 3600;
  if (buildingId === "commandcenter") return 7 * 24 * 3600;
  return 4 * 24 * 3600;
}

function secondsForTargetLevel(buildingId, targetLevel) {
  const L = Math.max(1, Math.min(MAX_LEVEL, Number(targetLevel) || 1));

  // --- helper: log-space interpolation between anchor points ---
  function interpLogSeconds(level, anchors) {
    // exact match
    for (const [lv, s] of anchors) if (lv === level) return s;

    // clamp ends
    if (level <= anchors[0][0]) return anchors[0][1];
    if (level >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];

    // find surrounding segment
    for (let i = 0; i < anchors.length - 1; i++) {
      const [l1, s1] = anchors[i];
      const [l2, s2] = anchors[i + 1];
      if (level > l1 && level < l2) {
        const t = (level - l1) / (l2 - l1);
        const a = Math.log(s1);
        const b = Math.log(s2);
        return Math.round(Math.exp(a + (b - a) * t));
      }
    }
    return anchors[0][1];
  }

  // --- Town Hall anchors (your current "feel") ---
  const TH20 = 14 * 24 * 3600; // 14 days, fixed
  const TH_ANCHORS = [
    [1, 5],           // TH1 basically instant
    [2, 6 * 60],      // 6 minutes
    [3, 12 * 60],     // 12 minutes
    [4, 20 * 60],     // 20 minutes
    [5, 35 * 60],     // 35 minutes
    [10, 3 * 3600],   // ~3 hours
    [15, 24 * 3600],  // ~1 day
    [20, TH20],       // 14 days
  ];

  // Town Hall keeps its exact anchors
  if (buildingId === "townhall") {
    return Math.max(5, interpLogSeconds(L, TH_ANCHORS));
  }

  // --- Non-TH buildings: SAME SHAPE as TH, scaled to their L20 cap ---
  const maxS = maxSecondsAt20(buildingId); // 9d / 7d / 4d buckets you already have

  // Scale TH anchors into this building's timeline using ratios vs TH20
  const scaledAnchors = [];
  let prev = 0;

  for (const [lv, thSec] of TH_ANCHORS) {
    let sec;
    if (lv === 20) sec = maxS; // enforce exact cap at 20
    else sec = Math.round((thSec / TH20) * maxS);

    // keep early levels visible + strictly increasing
    sec = Math.max(5, sec);
    if (sec <= prev) sec = prev + 1;

    scaledAnchors.push([lv, sec]);
    prev = sec;
  }

  return interpLogSeconds(L, scaledAnchors);
}




function pickTownhallPlotId() {
  const th = CITY_PLOTS.find((p) => String(p.id).toLowerCase().includes("townhall"));
  if (th) return th.id;
  return CITY_PLOTS[0]?.id || "plot_0";
}

function unlockedBuildingsUpTo(thLevel) {
  const unlocked = [];
  for (const [lvlStr, bId] of Object.entries(TOWNHALL_UNLOCKS)) {
    const lvl = Number(lvlStr);
    if (lvl <= thLevel) unlocked.push(bId);
  }
  return unlocked;
}

/**
 * @typedef {Object} PlaceOpts
 * @property {boolean=} instant - if true, no timer fields are started
 * @property {boolean=} free - if true, skip costs + requirements (used for load/hydrate)
 */

export function createCityBuildingsSystem({ basePath } = {}) {
  ensureState();

  /** plotId -> instance */
  const placed = new Map();
  /** buildingId -> instance */
  const byId = new Map();

  function activeTimerCount() {
    const now = Date.now();
    let n = 0;
    for (const inst of placed.values()) {
      if (inst.buildEndAt && inst.buildEndAt > now) n++;
      if (inst.upgradeEndAt && inst.upgradeEndAt > now) n++;
    }
    return n;
  }

  function canStartAnotherTimer() {
    return activeTimerCount() < BUILD_QUEUE_LIMIT;
  }

  function getQueueInfoSafe() {
    const now = Date.now();
    let active = 0;

    for (const inst of placed.values()) {
      if (inst.buildEndAt && inst.buildEndAt > now) active++;
      if (inst.upgradeEndAt && inst.upgradeEndAt > now) active++;
    }

    const max = BUILD_QUEUE_LIMIT;
    return { active, max, full: active >= max };
  }

  // Backwards-compatible alias (if your index calls getBuildQueueInfo)
  function getBuildQueueInfo() {
    return getQueueInfoSafe();
  }

  async function refreshSprite(inst) {
    const buildingId = inst?.buildingId;
    const level = Number(inst?.level || 1);

    if (!basePath) {
      console.error("[cityBuildings] basePath is missing. createCityBuildingsSystem({ basePath }) was not passed.");
      throw new Error("Missing basePath for building sprites");
    }
    if (!buildingId) {
      console.error("[cityBuildings] buildingId missing on instance:", inst);
      throw new Error("Missing buildingId for building sprites");
    }

    // assets.js signature: loadBuildingSprite({ basePath, fileBase, level })
    const sprite = await loadBuildingSprite({
      basePath,
      fileBase: buildingId,
      level,
    });

    inst.img = sprite.img;
    inst.spriteSrc = sprite.src;
    inst.spriteTier = sprite.keyUsed;

    const def = BUILDINGS?.[buildingId] || {};
    inst.w = def.w ?? 48;
    inst.h = def.h ?? 48;
  }

  function getPlacedOnPlot(plotId) {
    return placed.get(plotId) || null;
  }

  function getByBuildingId(buildingId) {
    const inst = byId.get(buildingId) || null;
    return inst && isComplete(inst) ? inst : null;
  }

  function getAllPlaced() {
    return Array.from(placed.values()).filter((b) => !!b.img);
  }

  function resetAllPlaced() {
    placed.clear();
    byId.clear();
  }

  function getStatus(plotId) {
    const inst = getPlacedOnPlot(plotId);
    if (!inst) return null;

    const now = Date.now();
    const constructing = !!inst.buildEndAt && inst.buildEndAt > now;
    const upgrading = !!inst.upgradeEndAt && inst.upgradeEndAt > now;

    return {
      constructing,
      buildRemainingMs: constructing ? inst.buildEndAt - now : 0,
      upgrading,
      upgradeRemainingMs: upgrading ? inst.upgradeEndAt - now : 0,
      upgradingToLevel: upgrading ? (inst.upgradingToLevel || (inst.level + 1)) : 0,
    };
  }

  function canBuildBuilding(buildingId) {
    const def = BUILDINGS?.[buildingId];
    if (!def) return { ok: false, reason: "Unknown building." };

    if (byId.has(buildingId)) return { ok: false, reason: "Already built." };

    // Uses per-building TH requirement fields (minTownhallLevel/minTH) if you set them.
    const thLevel = Number(state.buildings?.levels?.townhall || 0);
    const req = Number(def.minTownhallLevel ?? def.minTH ?? 0);
    if (req > 0 && thLevel < req) return { ok: false, reason: `Requires Town Hall Lv ${req}.` };

    // Optional: block starting timed builds if builder queues full
    if (timersEnabled() && !canStartAnotherTimer()) {
      return { ok: false, reason: `All builders busy (${BUILD_QUEUE_LIMIT}/${BUILD_QUEUE_LIMIT}).` };
    }

    return { ok: true };
  }

  function canUpgradePlot(plotId) {
    const inst = getPlacedOnPlot(plotId);
    if (!inst) return { ok: false, reason: "No building here." };

    const st = getStatus(plotId);
    if (st?.constructing) return { ok: false, reason: "Construction in progress." };
    if (st?.upgrading) return { ok: false, reason: "Already upgrading." };

    if ((inst.level || 1) >= MAX_LEVEL) return { ok: false, reason: "Max level reached." };

    // GLOBAL QUEUE LIMIT (only when timers are ON)
    if (timersEnabled() && !canStartAnotherTimer()) {
      return { ok: false, reason: `All builders busy (${BUILD_QUEUE_LIMIT}/${BUILD_QUEUE_LIMIT}).` };
    }

    if (inst.buildingId === "townhall") {
      const currentTH = inst.level || 1;

      // OLD RULE: To upgrade TH current->current+1, must have built the building unlocked AT currentTH
      // TH1->2 requires none; TH2->3 requires farm; TH3->4 requires lumber; etc.
      const reqBuilding = TOWNHALL_UNLOCKS[currentTH];
      if (reqBuilding && !getByBuildingId(reqBuilding)) {
        return { ok: false, reason: `Requires ${reqBuilding} built.` };
      }

      // Also enforce: all unlocked buildings up to currentTH must exist AND be at least currentTH.
      // This prevents "TH20 with no other buildings".
      const requiredSet = unlockedBuildingsUpTo(currentTH);
      for (const bId of requiredSet) {
        const bInst = getByBuildingId(bId);
        if (!bInst) return { ok: false, reason: `Build ${bId} (unlocked by TH ${currentTH}).` };
        if ((bInst.level || 1) < currentTH) {
          return { ok: false, reason: `Upgrade ${bId} to Lv ${currentTH} first.` };
        }
      }

      // Keep original rule: all existing buildings must be >= currentTH
      for (const [bId, other] of byId.entries()) {
        if (bId === "townhall") continue;
        if (!isComplete(other)) continue;
        if ((other.level || 1) < currentTH) {
          return { ok: false, reason: `Upgrade all buildings to Lv ${currentTH} first.` };
        }
      }
    }

    return { ok: true };
  }

  async function placeBuildingOnPlot(plotId, buildingId, level = 1, opts = /** @type {PlaceOpts} */ ({}) ) {
    ensureState();

    if (placed.has(plotId)) return { ok: false, reason: "Plot already occupied." };

    const def = BUILDINGS?.[buildingId];
    if (!def) return { ok: false, reason: "Unknown building." };

    if (!opts.free) {
      const gate = canBuildBuilding(buildingId);
      if (!gate.ok) return gate;

      const cost = def?.cost || null;
      if (cost && !canAfford(cost)) return { ok: false, reason: "Not enough resources." };
      if (cost) spend(cost);
    }

    // GLOBAL QUEUE LIMIT when starting a timed build
    if (timersEnabled() && !opts.instant && !opts.free && !canStartAnotherTimer()) {
      return { ok: false, reason: `All builders busy (${BUILD_QUEUE_LIMIT}/${BUILD_QUEUE_LIMIT}).` };
    }

    const inst = {
      plotId,
      buildingId,
      level: Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1)),
      img: null,
      w: def?.w ?? 48,
      h: def?.h ?? 48,

      buildStartedAt: 0,
      buildEndAt: 0,

      upgradeStartedAt: 0,
      upgradeEndAt: 0,
      upgradingToLevel: 0,
    };

    if (timersEnabled() && !opts.instant && !opts.free) {
      const now = Date.now();
      const durS = secondsForTargetLevel(buildingId, inst.level);
      inst.buildStartedAt = now;
      inst.buildEndAt = now + durS * 1000;
    }

    await refreshSprite(inst);

    placed.set(plotId, inst);
    byId.set(buildingId, inst);

    state.buildings.levels[buildingId] = inst.level;
    if (buildingId === "townhall") state.buildings.townhallLevel = inst.level;

    if (!timersEnabled()) {
      inst.buildStartedAt = 0;
      inst.buildEndAt = 0;
      inst.upgradeStartedAt = 0;
      inst.upgradeEndAt = 0;
      inst.upgradingToLevel = 0;
    }

    return { ok: true };
  }

  async function upgradePlot(plotId) {
    ensureState();

    const inst = getPlacedOnPlot(plotId);
    if (!inst) return { ok: false, reason: "Nothing to upgrade." };

    const chk = canUpgradePlot(plotId);
    if (!chk.ok) return chk;

    const def = BUILDINGS?.[inst.buildingId];
    const current = inst.level || 1;
    const target = current + 1;

    const upgradeCost = def?.upgradeCost ? def.upgradeCost(current) : null;
    if (upgradeCost && !canAfford(upgradeCost)) return { ok: false, reason: "Not enough resources." };
    if (upgradeCost) spend(upgradeCost);

    if (!timersEnabled()) {
      inst.level = target;
      inst.upgradeStartedAt = 0;
      inst.upgradeEndAt = 0;
      inst.upgradingToLevel = 0;

      await refreshSprite(inst);

      state.buildings.levels[inst.buildingId] = inst.level;
      if (inst.buildingId === "townhall") state.buildings.townhallLevel = inst.level;

      return { ok: true, instant: true };
    }

    // GLOBAL QUEUE LIMIT when starting a timed upgrade
    if (!canStartAnotherTimer()) {
      return { ok: false, reason: `All builders busy (${BUILD_QUEUE_LIMIT}/${BUILD_QUEUE_LIMIT}).` };
    }

    const now = Date.now();
    const durS = secondsForTargetLevel(inst.buildingId, target);
    inst.upgradeStartedAt = now;
    inst.upgradeEndAt = now + durS * 1000;
    inst.upgradingToLevel = target;

    return { ok: true, started: true };
  }

  async function ensureTownhall() {
    if (byId.has("townhall")) return { ok: true, existed: true };

    const plotId = pickTownhallPlotId();
    const def = BUILDINGS?.townhall || { w: 64, h: 64 };

    const inst = {
      plotId,
      buildingId: "townhall",
      level: 1,
      img: null,
      w: def.w ?? 64,
      h: def.h ?? 64,
      buildStartedAt: 0,
      buildEndAt: 0,
      upgradeStartedAt: 0,
      upgradeEndAt: 0,
      upgradingToLevel: 0,
    };

    await refreshSprite(inst);

    placed.set(plotId, inst);
    byId.set("townhall", inst);

    state.buildings.levels.townhall = 1;
    state.buildings.townhallLevel = 1;

    return { ok: true, seeded: true, plotId };
  }

  async function hydrateFromSave(records = []) {
    resetAllPlaced();

    for (const rec of records) {
      const plotId = String(rec.plotId);
      const buildingId = String(rec.buildingId);
      const level = Math.max(1, Math.min(MAX_LEVEL, Number(rec.level ?? 1)));

      const r = await placeBuildingOnPlot(plotId, buildingId, level, { free: true, instant: true });
      if (!r?.ok) continue;

      const inst = getPlacedOnPlot(plotId);
      if (!inst) continue;

      inst.buildStartedAt = Number(rec.buildStartedAt ?? 0) || 0;
      inst.buildEndAt = Number(rec.buildEndAt ?? 0) || 0;
      inst.upgradeStartedAt = Number(rec.upgradeStartedAt ?? 0) || 0;
      inst.upgradeEndAt = Number(rec.upgradeEndAt ?? 0) || 0;
      inst.upgradingToLevel = Number(rec.upgradingToLevel ?? 0) || 0;

      state.buildings.levels[buildingId] = inst.level;
      if (buildingId === "townhall") state.buildings.townhallLevel = inst.level;
    }
  }

  function tick() {
    const now = Date.now();
    let changed = false;

    for (const inst of placed.values()) {
      if (inst.buildEndAt && inst.buildEndAt <= now) {
        inst.buildEndAt = 0;
        inst.buildStartedAt = 0;
        changed = true;
      }

      if (inst.upgradeEndAt && inst.upgradeEndAt <= now) {
        inst.upgradeEndAt = 0;
        inst.upgradeStartedAt = 0;

        const target = inst.upgradingToLevel || (inst.level || 1) + 1;
        inst.level = Math.max(inst.level || 1, target);
        inst.upgradingToLevel = 0;

        state.buildings.levels[inst.buildingId] = inst.level;
        if (inst.buildingId === "townhall") state.buildings.townhallLevel = inst.level;

        refreshSprite(inst).catch(() => {});
        changed = true;
      }
    }

    return changed;
  }

  function finishAllTimersNow() {
    const now = Date.now();
    let changed = false;

    for (const inst of placed.values()) {
      if (inst.buildEndAt && inst.buildEndAt > now) {
        inst.buildEndAt = 0;
        inst.buildStartedAt = 0;
        changed = true;
      }

      if (inst.upgradeEndAt && inst.upgradeEndAt > now) {
        inst.upgradeEndAt = 0;
        inst.upgradeStartedAt = 0;

        const target = inst.upgradingToLevel || (inst.level || 1) + 1;
        inst.level = Math.max(inst.level || 1, target);
        inst.upgradingToLevel = 0;

        state.buildings.levels[inst.buildingId] = inst.level;
        if (inst.buildingId === "townhall") state.buildings.townhallLevel = inst.level;

        refreshSprite(inst).catch(() => {});
        changed = true;
      }
    }

    return changed;
  }

  return {
    getPlacedOnPlot,
    getByBuildingId,
    getAllPlaced,
    resetAllPlaced,

    canBuildBuilding,
    canUpgradePlot,
    placeBuildingOnPlot,
    upgradePlot,
    ensureTownhall,

    hydrateFromSave,
    tick,
    getStatus,
    finishAllTimersNow,

    // queue helpers (both names so nothing breaks)
    getQueueInfoSafe,
    getBuildQueueInfo,
  };
}

// alias export so your index can import either name safely
export const createcitybuildingsSystem = createCityBuildingsSystem;
