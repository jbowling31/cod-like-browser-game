// docs/js/data/upgradeTimes.js

// seconds per upgrade FROM level -> level+1
export const UPGRADE_TIME_BY_LEVEL = {
  1: 30,
  2: 60,
  3: 120,
  4: 300,
  5: 600,

  6: 1200,
  7: 1800,
  8: 2700,
  9: 3600,

  10: 7200,
  11: 10800,
  12: 14400,
  13: 21600,
  14: 28800,

  15: 43200,
  16: 64800,
  17: 86400,
  18: 129600,
  19: 172800,
};

export const BUILDING_TIME_MULT = {
  townhall: 1.0,
  barracks: 0.8,
  farm: 0.5,
  lumber: 0.5,
  quarry: 0.6,
  mine: 0.6,
  house: 0.4,
  academy: 0.9,
  commandcenter: 1.1,
};
