// docs/js/state.js (or wherever your state.js lives)

export const state = {
  selectedPlot: null,
  selectedBuilding: null,

  // ===== RESOURCES =====
  resources: {
    food: 0,
    wood: 0,
    stone: 0,
    ore: 0,
    gold: 0,
  },

  // ===== BUILDINGS =====
  buildings: {
    townhallLevel: 1,

    // one-of-each building system:
    // keep these keys consistent with your building ids
    levels: {
      farm: 0,
      lumber: 0,
      quarry: 0,
      mine: 0,
      academy: 0,
      barracks: 0,
      // add more later
    }
  },
};
