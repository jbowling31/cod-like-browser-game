// docs/js/state.js (or wherever your state.js lives)
export const STARTING_RESOURCES = {
  food: 500,
  wood: 500,
  stone: 300,
  ore: 200,
  gold: 250,
};

export const state = {
  selectedPlot: null,
  selectedBuilding: null,

  // ===== RESOURCES =====
  resources: { ...STARTING_RESOURCES },

  buildings: {
    placed: [],
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
