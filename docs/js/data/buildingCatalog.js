// docs/js/data/buildingCatalog.js

export const LEVEL_KEYS = ["L1", "L5", "L10", "L15", "L20"];

/**
 * Old rules (restored):
 * - Buildings unlock by Town Hall level via `minTownhallLevel`.
 * - Town Hall upgrade requires all built buildings upgraded to current TH level (handled in cityBuildings.js).
 *
 * Notes:
 * - `cost` is the cost to PLACE at level 1.
 * - `upgradeCost(level)` returns the cost to go from level -> level+1.
 */
export const BUILDINGS = {
  townhall: {
    id: "townhall",
    name: "Town Hall",
    fileBase: "townhall",
    cost: { wood: 0, gold: 0 },
    // No stone required until upgrading TH5 -> TH6 (upgradeCost(5))
    upgradeCost: (level) => ({
      wood: 100 * level,
      gold: 60 * level,
      stone: level >= 5 ? 80 * level : 0,
    }),
    // Optional art sizing defaults (can be overridden in cityBuildings.js too)
    w: 64,
    h: 64,
  },

  // Unlocks at TH2
  farm: {
    id: "farm",
    name: "Farm",
    fileBase: "farm",
    minTownhallLevel: 1,
    cost: { wood: 60, gold: 10 },
    upgradeCost: (level) => ({
      wood: 40 * level,
      gold: 10 * level,
    }),
  },

  // Unlocks at TH3
  lumber: {
    id: "lumber",
    name: "Lumber Yard",
    fileBase: "lumber",
    minTownhallLevel: 1,
    cost: { wood: 40, gold: 10 },
    upgradeCost: (level) => ({
      wood: 30 * level,
      gold: 10 * level,
    }),
  },

  // Unlocks at TH4
  barracks: {
    id: "barracks",
    name: "Barracks",
    fileBase: "barracks",
    unique: true,
    minTownhallLevel: 2,
    cost: { wood: 120, gold: 60 },
    upgradeCost: (level) => ({
      wood: 60 * level,
      gold: 30 * level,
    }),
  },

  // Unlocks at TH5
  quarry: {
    id: "quarry",
    name: "Quarry",
    fileBase: "quarry",
    minTownhallLevel: 5,
    cost: { wood: 80, gold: 25 },
    upgradeCost: (level) => ({
      wood: 30 * level,
      stone: 20 * level,
      gold: 10 * level,
    }),
  },

  // Unlocks at TH6
  house: {
    id: "house",
    name: "House",
    fileBase: "house",
    minTownhallLevel: 1,
    cost: { wood: 80, gold: 20 },
    upgradeCost: (level) => ({
      wood: 50 * level,
      stone: 20 * level,
      gold: 20 * level,
    }),
  },

  // Unlocks at TH7
  mine: {
    id: "mine",
    name: "Mine",
    fileBase: "mine",
    minTownhallLevel: 6,
    cost: { wood: 120, gold: 40 },
    upgradeCost: (level) => ({
      wood: 40 * level,
      stone: 30 * level,
      gold: 20 * level,
    }),
  },

  // Unlocks at TH8
  academy: {
    id: "academy",
    name: "Academy",
    fileBase: "academy",
    unique: true,
    minTownhallLevel: 8,
    cost: { wood: 120, stone: 80, gold: 80 },
    upgradeCost: (level) => ({
      wood: 70 * level,
      stone: 60 * level,
      gold: 40 * level,
    }),
  },

  // Unlocks at TH10
  commandcenter: {
    id: "commandcenter",
    name: "Command Center",
    fileBase: "commandcenter",
    unique: true,
    minTownhallLevel: 5,
    cost: { wood: 150, stone: 120, gold: 120 },
    upgradeCost: (level) => ({
      wood: 90 * level,
      stone: 80 * level,
      gold: 60 * level,
    }),
  },
};
