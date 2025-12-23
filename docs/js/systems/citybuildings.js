// docs/js/systems/cityBuildings.js
import { BUILDINGS } from "../data/buildingcatalog.js";
import { loadBuildingSprite } from "./assets.js";

const MAX_LEVEL = 20;

// Town Hall upgrade unlock requirements:
// To upgrade Town Hall to target level N, the required building must exist.
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

function tierKeyForLevel(level) {
  if (level >= 20) return "L20";
  if (level >= 15) return "L15";
  if (level >= 10) return "L10";
  if (level >= 5) return "L5";
  return "L1";
}

export function createCityBuildingsSystem({ basePath }) {
  const placed = new Map(); // plotId -> instance

  // Build placement gates (unique buildings only)
  // Building becomes placeable when Town Hall reaches this level.
  const BUILD_MIN_TOWNHALL_LEVEL = {
    farm: 1,           // needed to unlock TH2
    lumber: 2,         // unlock TH3
    barracks: 3,       // unlock TH4
    quarry: 4,         // unlock TH5
    house: 5,          // unlock TH6
    mine: 6,           // unlock TH7
    academy: 8,        // unlock TH8
    commandcenter: 10,  // unlock TH10
  };

  // Starter draw sizes (tweak later if needed)
  const SIZE = {
    townhall: { w: 80, h: 96 },
    farm: { w: 48, h: 48 },
    lumber: { w: 48, h: 48 },
    mine: { w: 48, h: 48 },
    quarry: { w: 48, h: 48 },
    barracks: { w: 64, h: 64 },
    academy: { w: 64, h: 64 },
    commandcenter: { w: 64, h: 64 },
    house: { w: 48, h: 48 },
  };

  function getAllPlaced() {
    return Array.from(placed.values());
  }

  function getPlacedOnPlot(plotId) {
    return placed.get(plotId) || null;
  }

  function getByBuildingId(buildingId) {
    return getAllPlaced().find((b) => b.buildingId === buildingId) || null;
  }

  function getTownhallLevel() {
    const th = getByBuildingId("townhall");
    return th ? th.level : 0;
  }

  function canBuildBuilding(buildingId) {
    if (buildingId === "townhall") {
      return { ok: false, reason: "Town Hall is already placed." };
    }

    // Unique rule: if it already exists anywhere, you can't build another
    const exists = getAllPlaced().some((b) => b.buildingId === buildingId);
    if (exists) return { ok: false, reason: "Already built." };

    const thLevel = getTownhallLevel();
    const req = BUILD_MIN_TOWNHALL_LEVEL[buildingId] ?? 1;

    if (thLevel < req) {
      return { ok: false, reason: `Requires Town Hall level ${req}. (Current: ${thLevel})` };
    }

    return { ok: true, reason: "" };
  }

  async function refreshSprite(inst) {
    const def = BUILDINGS[inst.buildingId];
    const levelKey = tierKeyForLevel(inst.level);
    inst.levelKey = levelKey;

    const sprite = await loadBuildingSprite({
      basePath,
      fileBase: def.fileBase,
      levelKey,
    });

    inst.img = sprite.img;
  }

  async function placeBuildingOnPlot(plotId, buildingId, level = 1) {
    const def = BUILDINGS[buildingId];
    if (!def) throw new Error(`Unknown building: ${buildingId}`);

    const sz = SIZE[buildingId] || { w: 48, h: 48 };

    const inst = {
      plotId,
      buildingId,
      level: Math.max(1, Math.min(MAX_LEVEL, level)), // 1..20
      levelKey: "L1",
      img: null,
      w: sz.w,
      h: sz.h,
      anchor: "bottom-center",
    };

    await refreshSprite(inst);
    placed.set(plotId, inst);
    return inst;
  }

  async function ensureTownhall(plotId = "townhall") {
    // If a townhall exists anywhere, do nothing
    if (getByBuildingId("townhall")) return;
    await placeBuildingOnPlot(plotId, "townhall", 1);
  }

  // ---------- UPGRADE RULES ----------
  // Other buildings:
  // - cannot be upgraded unless Town Hall level is STRICTLY higher than the building's current level.
  // Town Hall:
  // - cannot upgrade to next level until:
  //   (a) any required building for that target level exists (TOWNHALL_UNLOCKS)
  //   (b) every other placed building is at least the CURRENT Town Hall level

  function canUpgradePlot(plotId) {
    const b = getPlacedOnPlot(plotId);
    if (!b) return { ok: false, reason: "No building on this plot." };

    // Back-compat safety
    if (typeof b.level !== "number") b.level = 1;

    if (b.level >= MAX_LEVEL) return { ok: false, reason: "Max level reached." };

    const thLevel = getTownhallLevel();

    // Non-townhall upgrades require TH > building level
    if (b.buildingId !== "townhall") {
      if (thLevel <= b.level) {
        return { ok: false, reason: `Raise Town Hall above level ${b.level} first.` };
      }
      return { ok: true, reason: "" };
    }

    // Town Hall upgrade checks
    const nextLevel = b.level + 1;

    // Unlock requirement (only for listed levels)
    const req = TOWNHALL_UNLOCKS[nextLevel];
    if (req) {
      const reqBuilt = getByBuildingId(req);
      if (!reqBuilt) {
        return { ok: false, reason: `Build ${BUILDINGS[req].name} to unlock Town Hall level ${nextLevel}.` };
      }
    }

    // All other buildings must reach CURRENT townhall level before TH can go up
    const need = b.level;
    const others = getAllPlaced().filter((x) => x.buildingId !== "townhall");

    for (const ob of others) {
      if (typeof ob.level !== "number") ob.level = 1;
      if (ob.level < need) {
        return { ok: false, reason: `All buildings must reach level ${need} before Town Hall can go to ${nextLevel}.` };
      }
    }

    return { ok: true, reason: "" };
  }

  async function upgradePlot(plotId) {
    const chk = canUpgradePlot(plotId);
    if (!chk.ok) return chk;

    const b = getPlacedOnPlot(plotId);
    b.level = Math.min(MAX_LEVEL, (b.level || 1) + 1);
    await refreshSprite(b);

    return { ok: true, reason: "" };
  }

  return {
    // placement
    placeBuildingOnPlot,
    ensureTownhall,

    // queries
    getPlacedOnPlot,
    getAllPlaced,
    getTownhallLevel,

    // build gating
    canBuildBuilding,

    // upgrades
    canUpgradePlot,
    upgradePlot,
  };
}
