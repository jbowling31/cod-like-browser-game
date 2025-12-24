// docs/js/data/buildingCatalog.js

export const LEVEL_KEYS = ["L1", "L5", "L10", "L15", "L20"];

/**
 * Notes:
 * - `cost` is the cost to PLACE at level 1.
 * - `upgradeCost(currentLevel)` returns the cost to go from currentLevel -> currentLevel+1.
 *
 * Progression rule:
 * - Do NOT require stone/ore until Quarry/Mine are realistically available.
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
  },

  farm: {
    id: "farm",
    name: "Farm",
    fileBase: "farm",
    cost: { wood: 60, gold: 10 },
    upgradeCost: (level) => ({
      wood: 40 * level,
      gold: 10 * level,
    }),
  },

  lumber: {
    id: "lumber",
    name: "Lumber Yard",
    fileBase: "lumber",
    cost: { wood: 40, gold: 10 },
    upgradeCost: (level) => ({
      wood: 30 * level,
      gold: 10 * level,
    }),
  },

  quarry: {
    id: "quarry",
    name: "Quarry",
    fileBase: "quarry",
    cost: { wood: 80, gold: 25 },

    // Quarry is the source of stone, so requiring stone for upgrades is OK.
    // First upgrade (L1->L2) will require stone, but by then it should have produced some.
    upgradeCost: (level) => ({
      wood: 30 * level,
      stone: 20 * level,
      gold: 10 * level,
    }),
  },

  mine: {
    id: "mine",
    name: "Mine",
    fileBase: "mine",

    // IMPORTANT: Don't require stone to PLACE the mine if it appears soon after quarry unlock.
    // If you want it to require stone later, add it to upgradeCost (not placement).
    cost: { wood: 120, gold: 40 },

    upgradeCost: (level) => ({
      wood: 40 * level,
      stone: 30 * level,
      gold: 20 * level,
    }),
  },

  barracks: {
    id: "barracks",
    name: "Barracks",
    fileBase: "barracks",
    unique: true,

    // Barracks unlocks before Quarry (in your flow), so NO stone in costs.
    cost: { wood: 120, gold: 60 },
    upgradeCost: (level) => ({
      wood: 60 * level,
      gold: 30 * level,
    }),
  },

  academy: {
    id: "academy",
    name: "Academy",
    fileBase: "academy",
    unique: true,

    // Academy is later game — stone is fine here
    cost: { wood: 120, stone: 80, gold: 80 },
    upgradeCost: (level) => ({
      wood: 70 * level,
      stone: 60 * level,
      gold: 40 * level,
    }),
  },

  commandcenter: {
    id: "commandcenter",
    name: "Command Center",
    fileBase: "commandcenter",
    unique: true,

    // Late game — stone is fine
    cost: { wood: 150, stone: 120, gold: 120 },
    upgradeCost: (level) => ({
      wood: 90 * level,
      stone: 80 * level,
      gold: 60 * level,
    }),
  },

  house: {
    id: "house",
    name: "House",
    fileBase: "house",
    cost: { wood: 80, gold: 20 },

    // House unlocks after Quarry in your flow, so stone is fine here
    upgradeCost: (level) => ({
      wood: 50 * level,
      stone: 20 * level,
      gold: 20 * level,
    }),
  },
};
