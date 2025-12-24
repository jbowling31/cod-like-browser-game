// docs/js/systems/citybuildings.js
import { BUILDINGS } from "../data/buildingcatalog.js"; // ✅ correct casing
import { loadBuildingSprite } from "./assets.js";
import { state } from "../state.js";

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

export function createcitybuildingsSystem({ basePath }) {
  const placed = new Map(); // plotId -> instance

  // Building becomes placeable when Town Hall reaches this level.
  const BUILD_MIN_TOWNHALL_LEVEL = {
    farm: 1,           // needed to unlock TH2
    lumber: 2,         // unlock TH3
    barracks: 3,       // unlock TH4
    quarry: 4,         // unlock TH5
    house: 5,          // unlock TH6
    mine: 6,           // unlock TH7
    academy: 7,        // unlock TH8
    commandcenter: 9,  // unlock TH10
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

  // ---------- STATE LEVEL SYNC (UI reads this; keep it current) ----------
  function writeLevelToState(buildingId, level) {
    state.buildings ||= {};
    state.buildings.levels ||= {};
    state.buildings.levels[buildingId] = level;

    if (buildingId === "townhall") {
      state.buildings.townhallLevel = level;
    }
  }

  // ---------- QUERIES ----------
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
    return th ? (th.level || 1) : 0;
  }

  // ---------- COST HELPERS (authoritative gameplay rules live here) ----------
  function isResourceUnlocked(res) {
    // IMPORTANT: do NOT use state.buildings.placed (you don’t maintain it)
    // Use the real placed Map via getByBuildingId().
    if (res === "stone") return !!getByBuildingId("quarry");
    if (res === "ore") return !!getByBuildingId("mine");
    return true;
  }

  function canAfford(cost) {
    if (!cost) return true;

    for (const k in cost) {
      const need = Number(cost[k] ?? 0);

      // ✅ key fix: zero-cost keys must NOT gate anything
      if (need <= 0) continue;

      if (!isResourceUnlocked(k)) return false;
      if ((state.resources?.[k] ?? 0) < need) return false;
    }
    return true;
  }

  function spend(cost) {
    if (!cost) return;
    for (const k in cost) {
      const need = Number(cost[k] ?? 0);
      if (need <= 0) continue; // keep this consistent with canAfford
      state.resources[k] = (state.resources?.[k] ?? 0) - need;
    }
  }

  // ---------- BUILD GATING ----------
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

  async function placeBuildingOnPlot(plotId, buildingId, level = 1, { free = false } = {}) {
    const def = BUILDINGS[buildingId];
    if (!def) return { ok: false, reason: "Unknown building" };

    // Enforce unique + TH gating for non-townhall
    if (buildingId !== "townhall") {
      const gate = canBuildBuilding(buildingId);
      if (!gate.ok) return gate;
    }

    // Plot already occupied?
    if (placed.has(plotId)) {
      return { ok: false, reason: "Plot already occupied." };
    }

    // COST CHECK + SPEND (unless free)
    if (!free && def.cost) {
      if (!canAfford(def.cost)) return { ok: false, reason: "Not enough resources" };
      spend(def.cost);
    }

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

    // ✅ keep UI-consumed levels in sync immediately
    writeLevelToState(buildingId, inst.level);

    return { ok: true, inst };
  }

  async function ensureTownhall(plotId = "townhall") {
    // If a townhall exists anywhere, do nothing
    if (getByBuildingId("townhall")) return { ok: true };

    // Townhall should be free when seeding
    return await placeBuildingOnPlot(plotId, "townhall", 1, { free: true });
  }

  // ---------- UPGRADE RULES ----------
  function canUpgradePlot(plotId) {
    const b = getPlacedOnPlot(plotId);
    if (!b) return { ok: false, reason: "No building on this plot." };

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
        return { ok: false, reason: `Build ${BUILDINGS[req]?.name || req} to unlock Town Hall level ${nextLevel}.` };
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
    if (!b) return { ok: false, reason: "No building on this plot." };

    const def = BUILDINGS[b.buildingId];

    // COST CHECK + SPEND
    const cost = def?.upgradeCost ? def.upgradeCost(b.level ?? 1) : null;
    if (cost && !canAfford(cost)) return { ok: false, reason: "Not enough resources" };
    if (cost) spend(cost);

    // ✅ bump immediately so UI can reflect instantly
    b.level = Math.min(MAX_LEVEL, (b.level || 1) + 1);

    // ✅ sync levels used by UI
    writeLevelToState(b.buildingId, b.level);

    // sprite can load async; level should already be correct
    await refreshSprite(b);

    return { ok: true, level: b.level, reason: "" };
  }

  // ---------- SAVE/LOAD HELPERS ----------
  function exportState() {
    return {
      placed: Array.from(placed.values()).map((p) => ({
        plotId: p.plotId,
        buildingId: p.buildingId,
        level: p.level ?? 1,
      })),
    };
  }

  function resetAllPlaced() {
    placed.clear();
  }

  async function importState(data) {
    resetAllPlaced();

    const arr = Array.isArray(data?.placed) ? data.placed : [];
    for (const rec of arr) {
      const plotId = String(rec.plotId);
      const buildingId = String(rec.buildingId);
      const lvl = Math.max(1, Number(rec.level ?? 1));

      // Place at level 1 (free), then upgrade up to target (free)
      await placeBuildingOnPlot(plotId, buildingId, 1, { free: true });

      for (let i = 1; i < lvl; i++) {
        const inst = getPlacedOnPlot(plotId);
        if (!inst) break;

        inst.level = Math.min(MAX_LEVEL, inst.level + 1);
        writeLevelToState(inst.buildingId, inst.level); // ✅ keep synced during load
        await refreshSprite(inst);
      }
    }

    // safety: ensure TH exists (free)
    await ensureTownhall("townhall");

    // final safety: ensure state levels reflect placed map
    for (const inst of placed.values()) {
      writeLevelToState(inst.buildingId, inst.level ?? 1);
    }
  }

  return {
    // placement
    placeBuildingOnPlot,
    ensureTownhall,

    // queries
    getPlacedOnPlot,
    getAllPlaced,
    getTownhallLevel,
    getByBuildingId,

    // build gating
    canBuildBuilding,

    // upgrades
    canUpgradePlot,
    upgradePlot,

    // sprite loading
    refreshSprite,

    // save/load
    exportState,
    importState,
    resetAllPlaced,

    // cost helpers (exposed)
    canAfford,
    spend,
  };
}
