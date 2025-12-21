// app/js/data/buildingCatalog.js

export const BUILDING_TYPES = Object.freeze({
  TOWNHALL: "townhall",
  FARM: "farm",
  LUMBER: "lumber",
  QUARRY: "quarry",
  MINE: "mine",
});

// We only need tier art every 5 levels.
export const TIERS = Object.freeze([1, 5, 10, 15, 20]);

export function clampLevel(level, max = 20) {
  return Math.max(1, Math.min(max, level | 0));
}

export function tierForLevel(level) {
  const lv = clampLevel(level, 20);
  if (lv >= 20) return 20;
  if (lv >= 15) return 15;
  if (lv >= 10) return 10;
  if (lv >= 5) return 5;
  return 1;
}

// Asset key format: `${type}_L${tier}`
// Example: "farm_L10"
export function spriteKeyFor(type, level) {
  return `${type}_L${tierForLevel(level)}`;
}

export function fallbackTierKeys(type, level) {
  // Try current tier, then step down.
  const t = tierForLevel(level);
  const idx = TIERS.indexOf(t);
  const keys = [];
  for (let i = idx; i >= 0; i--) keys.push(`${type}_L${TIERS[i]}`);
  return keys;
}

/**
 * Catalog: you can tweak numbers later without touching systems/UI.
 * - maxLevel is 20 for all (matches your Town Hall progression)
 * - footprint uses the same "diamond plot" assumption (1 plot)
 */
export const BUILDING_CATALOG = Object.freeze({
  [BUILDING_TYPES.TOWNHALL]: {
    name: "Town Hall",
    maxLevel: 20,
    footprint: { w: 1, h: 1 },
  },

  [BUILDING_TYPES.FARM]: {
    name: "Farm",
    maxLevel: 20,
    footprint: { w: 1, h: 1 },
    produces: "food",
  },

  [BUILDING_TYPES.LUMBER]: {
    name: "Lumber Camp",
    maxLevel: 20,
    footprint: { w: 1, h: 1 },
    produces: "wood",
  },

  [BUILDING_TYPES.QUARRY]: {
    name: "Quarry",
    maxLevel: 20,
    footprint: { w: 1, h: 1 },
    produces: "stone",
  },

  [BUILDING_TYPES.MINE]: {
    name: "Mine",
    maxLevel: 20,
    footprint: { w: 1, h: 1 },
    produces: "ore",
  },
});
