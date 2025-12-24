// docs/js/systems/trainingsystem.js
import { state } from "../state.js";
import { TROOPS, BARRACKS_TIER_UNLOCK } from "../data/troopsCatalog.js";

function nowMs() { return Date.now(); }

// -------------------- RESOURCES --------------------
function ensureResKeys() {
  state.resources ??= {};
  state.resources.food  ??= 0;
  state.resources.wood  ??= 0;
  state.resources.stone ??= 0;
  state.resources.ore   ??= 0;
  state.resources.gold  ??= 0;
}

function canAfford(cost) {
  ensureResKeys();
  return (state.resources.food  >= (cost.food  || 0)) &&
         (state.resources.wood  >= (cost.wood  || 0)) &&
         (state.resources.stone >= (cost.stone || 0)) &&
         (state.resources.ore   >= (cost.ore   || 0)) &&
         (state.resources.gold  >= (cost.gold  || 0));
}

function spend(cost) {
  ensureResKeys();
  state.resources.food  -= (cost.food  || 0);
  state.resources.wood  -= (cost.wood  || 0);
  state.resources.stone -= (cost.stone || 0);
  state.resources.ore   -= (cost.ore   || 0);
  state.resources.gold  -= (cost.gold  || 0);
}

// -------------------- STATE --------------------
export function ensureTrainingState() {
  state.training ??= {};
  state.training.barracks ??= { slots: [], version: 1 };
  state.troops ??= {};
}

function getPlacedBuildingLevel(type) {
  const arr = state?.buildings?.placed;
  if (!Array.isArray(arr)) return 0;
  const b = arr.find(x => x?.type === type);
  return b?.level ?? 0;
}

function getBarracksLevel() {
  // If you prefer levels map instead of placed, swap this to state.buildings.levels.barracks
  return getPlacedBuildingLevel("barracks") || Number(state?.buildings?.levels?.barracks || 0);
}

// -------------------- SLOTS + UNLOCKS --------------------
export function getBarracksTrainingSlots(barracksLevel) {
  if (barracksLevel >= 15) return 4;
  if (barracksLevel >= 10) return 3;
  if (barracksLevel >= 5) return 2;
  return 1;
}

export function canTrainTier(barracksLevel, tier) {
  const req = BARRACKS_TIER_UNLOCK?.[tier] ?? 999;
  return barracksLevel >= req;
}

function ensureSlotsCount(targetCount) {
  const slots = state.training.barracks.slots;

  while (slots.length < targetCount) slots.push({ active: null });

  // Only shrink trailing empty slots (don’t delete active jobs)
  while (slots.length > targetCount) {
    const last = slots[slots.length - 1];
    if (last?.active) break;
    slots.pop();
  }
}

export function syncBarracksSlots(barracksLevel) {
  ensureTrainingState();
  ensureSlotsCount(getBarracksTrainingSlots(barracksLevel));
}

// -------------------- START / CANCEL --------------------
export function startTrainingInSlot({ barracksLevel, slotIndex, troopId, amount }) {
  ensureTrainingState();

  // Always keep slot count correct (no onUpgrade hook needed)
  syncBarracksSlots(barracksLevel);

  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= state.training.barracks.slots.length) {
    return { ok: false, reason: "Invalid slot." };
  }

  const slot = state.training.barracks.slots[slotIndex];
  if (slot.active) return { ok: false, reason: "Slot is busy." };

  const troop = TROOPS[troopId];
  if (!troop) return { ok: false, reason: "Unknown troop." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Invalid amount." };

  if (!canTrainTier(barracksLevel, troop.tier)) {
    return { ok: false, reason: `Tier ${troop.tier} locked. Upgrade Barracks.` };
  }

  const totalCost = {
    food:  (troop.cost.food  || 0) * amount,
    wood:  (troop.cost.wood  || 0) * amount,
    stone: (troop.cost.stone || 0) * amount,
    ore:   (troop.cost.ore   || 0) * amount,
    gold:  (troop.cost.gold  || 0) * amount,
  };

  if (!canAfford(totalCost)) return { ok: false, reason: "Not enough resources." };
  spend(totalCost);

  const startAt = nowMs();
  const durationMs = (troop.trainSeconds || 1) * 1000 * amount;
  const endAt = startAt + durationMs;

  slot.active = { troopId, amount, startAt, endAt, totalMs: durationMs, cost: totalCost };
  return { ok: true };
}

export function cancelTraining({ slotIndex, refundPercent = 0.5 }) {
  ensureTrainingState();

  const slot = state.training.barracks.slots[slotIndex];
  if (!slot?.active) return { ok: false, reason: "No active training." };

  const job = slot.active;
  slot.active = null;

  const refund = {
    food:  Math.floor((job.cost.food  || 0) * refundPercent),
    wood:  Math.floor((job.cost.wood  || 0) * refundPercent),
    stone: Math.floor((job.cost.stone || 0) * refundPercent),
    ore:   Math.floor((job.cost.ore   || 0) * refundPercent),
    gold:  Math.floor((job.cost.gold  || 0) * refundPercent),
  };

  ensureResKeys();
  state.resources.food  += refund.food;
  state.resources.wood  += refund.wood;
  state.resources.stone += refund.stone;
  state.resources.ore   += refund.ore;
  state.resources.gold  += refund.gold;

  return { ok: true, refund };
}

// -------------------- TICK --------------------
export function processTrainingQueues() {
  ensureTrainingState();

  // Keep slot count synced to current barracks level automatically
  const barracksLevel = getBarracksLevel();
  syncBarracksSlots(barracksLevel);

  const t = nowMs();
  for (const slot of state.training.barracks.slots) {
    const job = slot.active;
    if (!job) continue;

    if (t >= job.endAt) {
      state.troops[job.troopId] = (state.troops[job.troopId] || 0) + job.amount;
      slot.active = null;
    }
  }
}

// docs/js/systems/trainingSystem.js

export function getTrainingSnapshot(buildingId = "barracks") {
  ensureTrainingState();
  const now = nowMs();

  // Right now only barracks uses training slots
  const slotsRaw = state.training?.barracks?.slots ?? [];
  const slots = slotsRaw.map((s) => {
    const job = s?.active;

    if (!job) {
      return { status: "idle" };
    }

    const remainingMs = Math.max(0, (job.endAt ?? now) - now);
    const totalMs = Math.max(1, job.totalMs ?? ((job.endAt ?? now) - (job.startAt ?? now)));

    return {
      status: "training",
      troopId: job.troopId,
      amount: job.amount,
      startAt: job.startAt,
      endAt: job.endAt,
      remainingMs,
      totalMs,
    };
  });

  return {
    buildingId,
    now,
    slots,
    troops: state.troops || {}, // your trained troop counts live here
  };
}


  

