// docs/js/data/buildingCatalog.js
import { upgradeCostFor } from "./costCurves.js";

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
    upgradeCost: (level) => upgradeCostFor("townhall", level),
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
    upgradeCost: (level) => upgradeCostFor("farm", level),
  },

  // Unlocks at TH3
  lumber: {
    id: "lumber",
    name: "Lumber Yard",
    fileBase: "lumber",
    minTownhallLevel: 1,
    cost: { wood: 40, gold: 10 },
    upgradeCost: (level) => upgradeCostFor("lumber", level),
  },

  // Unlocks at TH4
  barracks: {
    id: "barracks",
    name: "Barracks",
    fileBase: "barracks",
    unique: true,
    minTownhallLevel: 2,
    cost: { wood: 120, gold: 60 },
    upgradeCost: (level) => upgradeCostFor("barracks", level),
  },

  // Unlocks at TH5
  quarry: {
    id: "quarry",
    name: "Quarry",
    fileBase: "quarry",
    minTownhallLevel: 5,
    cost: { wood: 80, gold: 25 },
    upgradeCost: (level) => upgradeCostFor("quarry", level),
  },

  // Unlocks at TH6
  house: {
    id: "house",
    name: "House",
    fileBase: "house",
    minTownhallLevel: 1,
    cost: { wood: 80, gold: 20 },
    upgradeCost: (level) => upgradeCostFor("house", level),
  },

  // Unlocks at TH7
  mine: {
    id: "mine",
    name: "Mine",
    fileBase: "mine",
    minTownhallLevel: 6,
    cost: { wood: 120, gold: 40 },
    upgradeCost: (level) => upgradeCostFor("mine", level),
  },

  // Unlocks at TH8
  academy: {
    id: "academy",
    name: "Academy",
    fileBase: "academy",
    unique: true,
    minTownhallLevel: 8,
    cost: { wood: 120, stone: 80, gold: 80 },
    upgradeCost: (level) => upgradeCostFor("academy", level),
  },

  // Unlocks at TH10
  commandcenter: {
    id: "commandcenter",
    name: "Command Center",
    fileBase: "commandcenter",
    unique: true,
    minTownhallLevel: 5,
    cost: { wood: 150, stone: 120, gold: 120 },
    upgradeCost: (level) => upgradeCostFor("commandcenter", level),
  },
};
