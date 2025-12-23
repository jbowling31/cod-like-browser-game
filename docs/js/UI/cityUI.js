// docs/js/ui/cityUI.js
import { state } from "../state.js";
import { renderBuildings } from "../city.js"; // we'll export this in step 2

function closeModal() {
  const backdrop = document.getElementById("modalBackdrop");
  if (!backdrop) return;
  backdrop.classList.add("hidden");
}

function ensureModalWiring(backdrop, cancelBtn) {
  cancelBtn.onclick = () => closeModal();
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeModal();
  };
}

function prettyType(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// Plot id -> building type (matches your plot ids: farm, mine, quarry, lumber)
function typeFromPlotId(plotId) {
  const id = String(plotId || "").toLowerCase();
  if (id.includes("townhall")) return "townhall";
  if (id.includes("farm")) return "farm";
  if (id.includes("quarry")) return "quarry";
  if (id.includes("lumber") || id.includes("wood")) return "lumber";
  if (id.includes("mine")) return "mine";
  // fallback
  return id || "farm";
}

function findBuildingOnPlot(plotId) {
  return (state.buildings.placed ?? []).find(b => b.plotId === plotId) || null;
}

export function showPlotPopup(plot) {
  const backdrop = document.getElementById("modalBackdrop");
  const title = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");
  const cancel = document.getElementById("modalCancel");
  const confirm = document.getElementById("modalConfirm");

  if (!backdrop || !title || !body || !cancel || !confirm) {
    console.warn("Modal DOM missing (modalBackdrop/modalTitle/modalBody/modalCancel/modalConfirm).");
    return;
  }

  ensureModalWiring(backdrop, cancel);

  const plotId = plot.id;
  const existing = findBuildingOnPlot(plotId);

  // ===== EMPTY PLOT -> BUILD =====
  if (!existing) {
    const type = typeFromPlotId(plotId);

    title.textContent = `${prettyType(type)} Plot`;
    body.textContent = `Build ${prettyType(type)} here? (Free for now)`;

    confirm.textContent = `Build ${prettyType(type)} (Level 1)`;
    confirm.disabled = false;

    confirm.onclick = () => {
      // Use plotId as stable building id so selection/highlight works
      const newBuilding = {
        id: plotId,
        type,
        level: 1,
        plotId
      };

      state.buildings.placed = state.buildings.placed ?? [];
      state.buildings.placed.push(newBuilding);

      state.selectedBuilding = newBuilding.id;

      closeModal();
      renderBuildings(true); // animate pop
      console.log(`Built ${type} on ${plotId} (L1)`);
    };

    backdrop.classList.remove("hidden");
    return;
  }

  // ===== EXISTING BUILDING -> UPGRADE =====
  const max = 20;
  const lvl = existing.level ?? 1;

  title.textContent = `${prettyType(existing.type)} (Level ${lvl})`;

  if (lvl < max) {
    const next = lvl + 1;
    body.textContent = `Upgrade ${prettyType(existing.type)} to Level ${next}? (Free for now)`;

    confirm.textContent = `Upgrade to Level ${next}`;
    confirm.disabled = false;

    confirm.onclick = () => {
      existing.level = next;
      state.selectedBuilding = existing.id;

      closeModal();
      renderBuildings(true);
      console.log(`Upgraded ${existing.type} on ${existing.plotId} to L${next}`);
    };
  } else {
    body.textContent = `${prettyType(existing.type)} is max level (Level ${max}).`;
    confirm.textContent = "Max Level";
    confirm.disabled = true;
    confirm.onclick = null;
  }

  backdrop.classList.remove("hidden");
}
