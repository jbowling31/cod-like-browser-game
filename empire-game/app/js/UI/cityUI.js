// file: app/js/cityUI.js
import { state } from "./state.js";
import { renderBuildings } from "./city.js"; // make sure city.js exports renderBuildings

function ensureModalRoot() {
  let root = document.getElementById("modalRoot");
  if (root) return root;

  root = document.createElement("div");
  root.id = "modalRoot";
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "9999";
  root.style.pointerEvents = "none"; // enable only when opened
  document.body.appendChild(root);
  return root;
}

function closeModal() {
  const root = ensureModalRoot();
  root.replaceChildren();
  root.style.pointerEvents = "none";
}

function openModal(title, bodyEl) {
  const root = ensureModalRoot();
  root.replaceChildren();
  root.style.pointerEvents = "auto";

  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.45)";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  const card = document.createElement("div");
  card.style.position = "absolute";
  card.style.left = "50%";
  card.style.top = "70%";
  card.style.transform = "translate(-50%, -50%)";
  card.style.width = "min(420px, calc(100vw - 32px))";
  card.style.background = "#121827";
  card.style.border = "1px solid rgba(255,255,255,0.12)";
  card.style.borderRadius = "14px";
  card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.45)";
  card.style.padding = "14px";
  card.style.color = "#fff";
  card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.marginBottom = "10px";

  const h = document.createElement("div");
  h.textContent = title;
  h.style.fontWeight = "800";
  h.style.fontSize = "16px";

  const x = document.createElement("button");
  x.textContent = "✕";
  x.style.background = "transparent";
  x.style.color = "#fff";
  x.style.border = "0";
  x.style.cursor = "pointer";
  x.style.fontSize = "16px";
  x.addEventListener("click", closeModal);

  header.appendChild(h);
  header.appendChild(x);

  card.appendChild(header);
  card.appendChild(bodyEl);

  overlay.appendChild(card);
  root.appendChild(overlay);
}

function findPlacedOnPlot(plotId) {
  return state.buildings.placed.find(b => b.plotId === plotId) || null;
}

function prettyType(t) {
  if (!t) return "Building";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Determine what building type belongs on this plot.
 * Uses plot.buildType if present, otherwise guesses from id prefix.
 */
function getPlotBuildType(plot) {
  if (plot?.buildType) return plot.buildType;

  const id = String(plot?.id || "").toLowerCase();
  if (id.includes("farm")) return "farm";
  if (id.includes("lumber")) return "lumber";
  if (id.includes("wood")) return "lumber";
  if (id.includes("quarry")) return "quarry";
  if (id.includes("mine")) return "mine";
  if (id.includes("townhall")) return "townhall";

  // fallback (lets you still build something)
  return "farm";
}

export function showPlotPopup(plot) {
  if (!plot) return;

  const existing = findPlacedOnPlot(plot.id);
  const type = getPlotBuildType(plot);

  // ======== EMPTY PLOT → BUILD UI ========
  if (!existing) {
    const body = document.createElement("div");

    const sub = document.createElement("div");
    sub.textContent = `Empty plot • Ready to build: ${prettyType(type)}`;
    sub.style.opacity = "0.85";
    sub.style.fontSize = "13px";
    sub.style.marginBottom = "12px";
    body.appendChild(sub);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "10px";

    const buildBtn = document.createElement("button");
    buildBtn.textContent = `Build ${prettyType(type)}`;
    buildBtn.style.flex = "1";
    buildBtn.style.padding = "10px 12px";
    buildBtn.style.borderRadius = "12px";
    buildBtn.style.border = "1px solid rgba(255,255,255,0.18)";
    buildBtn.style.background = "rgba(255,255,255,0.08)";
    buildBtn.style.color = "#fff";
    buildBtn.style.cursor = "pointer";
    buildBtn.style.fontWeight = "700";

    buildBtn.addEventListener("click", () => {
      // Place L1 building
      state.buildings.placed.push({
        plotId: plot.id,
        type,
        level: 1
      });

      state.selectedBuilding = plot.id;
      closeModal();
      renderBuildings(true); // animate pop
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "10px 12px";
    cancelBtn.style.borderRadius = "12px";
    cancelBtn.style.border = "1px solid rgba(255,255,255,0.18)";
    cancelBtn.style.background = "transparent";
    cancelBtn.style.color = "#fff";
    cancelBtn.style.cursor = "pointer";

    cancelBtn.addEventListener("click", closeModal);

    btnRow.appendChild(buildBtn);
    btnRow.appendChild(cancelBtn);

    body.appendChild(btnRow);

    openModal("Build", body);
    return;
  }

  // ======== PLACED BUILDING → (SIMPLE) UPGRADE UI ========
  const body = document.createElement("div");

  const info = document.createElement("div");
  info.textContent = `${prettyType(existing.type)} • Level ${existing.level}`;
  info.style.opacity = "0.9";
  info.style.fontSize = "14px";
  info.style.marginBottom = "12px";
  body.appendChild(info);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";

  const upBtn = document.createElement("button");
  upBtn.textContent = existing.level >= 20 ? "Max Level" : "Upgrade";
  upBtn.disabled = existing.level >= 20;
  upBtn.style.flex = "1";
  upBtn.style.padding = "10px 12px";
  upBtn.style.borderRadius = "12px";
  upBtn.style.border = "1px solid rgba(255,255,255,0.18)";
  upBtn.style.background = existing.level >= 20 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)";
  upBtn.style.color = "#fff";
  upBtn.style.cursor = existing.level >= 20 ? "not-allowed" : "pointer";
  upBtn.style.fontWeight = "800";
  upBtn.style.opacity = existing.level >= 20 ? "0.5" : "1";

  upBtn.addEventListener("click", () => {
    if (existing.level >= 20) return;
    existing.level += 1;
    state.selectedBuilding = plot.id;
    closeModal();
    renderBuildings(true);
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.padding = "10px 12px";
  closeBtn.style.borderRadius = "12px";
  closeBtn.style.border = "1px solid rgba(255,255,255,0.18)";
  closeBtn.style.background = "transparent";
  closeBtn.style.color = "#fff";
  closeBtn.style.cursor = "pointer";
  closeBtn.addEventListener("click", closeModal);

  row.appendChild(upBtn);
  row.appendChild(closeBtn);

  body.appendChild(row);

  openModal("Building", body);
}
