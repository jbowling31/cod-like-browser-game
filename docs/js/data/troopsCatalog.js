// docs/js/data/troopsCatalog.js

export const TIERS = ["T1","T2","T3","T4"];

export const TIER_MULT = {
  T1: 1,
  T2: 2,
  T3: 4,
  T4: 8,
};

export const BARRACKS_TIER_UNLOCK = {
  T1: 1,
  T2: 5,
  T3: 10,
  T4: 15,
};

// Base troop types at T1 (stats are multiplied by tier)
export const TROOP_TYPES = {
  infantry: { label: "Infantry", hp: 100, atk: 10, def: 12, speed: 8, carry: 8 },
  archer:   { label: "Archers",  hp: 70,  atk: 16, def: 6,  speed: 9, carry: 6 },
  cavalry:  { label: "Cavalry",  hp: 85,  atk: 14, def: 8,  speed: 12,carry: 10 },
  // siege reserved for later (optional to include now)
  siege:    { label: "Siege",    hp: 120, atk: 22, def: 4,  speed: 6, carry: 4 },
};

const COST_MULT = { T1: 1, T2: 2.5, T3: 5, T4: 10 };
const TIME_MULT = { T1: 1, T2: 2.2, T3: 4.5, T4: 9 }; // seconds scale (for future queues)

export function troopId(type, tier) {
  return `${type}_${tier}`;
}

function roundCost(n) {
  return Math.max(1, Math.round(n));
}

function makeCost(type, tier) {
  // Baseline T1 costs per unit (tune anytime)
  const base = (() => {
    switch (type) {
      case "infantry": return { food: 30, wood: 15, stone: 0,  ore: 5 };
      case "archer":   return { food: 25, wood: 25, stone: 0,  ore: 5 };
      case "cavalry":  return { food: 40, wood: 10, stone: 0,  ore: 15 };
      case "siege":    return { food: 35, wood: 15, stone: 25, ore: 25 };
      default:         return { food: 30, wood: 15, stone: 0,  ore: 5 };
    }
  })();

  const m = COST_MULT[tier] ?? 1;
  return {
    food:  roundCost(base.food  * m),
    wood:  roundCost(base.wood  * m),
    stone: roundCost(base.stone * m),
    iron:  roundCost(base.iron  * m),
  };
}

function makeTrainSeconds(type, tier) {
  // Baseline T1 seconds per troop (for later queues)
  const base = (() => {
    switch (type) {
      case "infantry": return 8;
      case "archer":   return 10;
      case "cavalry":  return 12;
      case "siege":    return 18;
      default:         return 10;
    }
  })();
  const m = TIME_MULT[tier] ?? 1;
  return Math.round(base * m);
}

function makeStats(type, tier) {
  const base = TROOP_TYPES[type];
  const m = TIER_MULT[tier] ?? 1;
  return {
    hp:    Math.round(base.hp * m),
    atk:   Math.round(base.atk * m),
    def:   Math.round(base.def * m),
    speed: base.speed, // usually NOT tier-scaled (keeps feel consistent)
    carry: Math.round(base.carry * m),
  };
}

export const TROOPS = (() => {
  const out = {};
  for (const type of Object.keys(TROOP_TYPES)) {
    for (const tier of TIERS) {
      const id = troopId(type, tier);
      out[id] = {
        id,
        type,
        tier,
        label: `${TROOP_TYPES[type].label} ${tier}`,
        stats: makeStats(type, tier),
        cost: makeCost(type, tier),
        trainSeconds: makeTrainSeconds(type, tier),
      };
    }
  }
  return out;
})();

export function getTroop(id) {
  return TROOPS[id] ?? null;
}
