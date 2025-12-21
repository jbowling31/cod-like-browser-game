import { plots } from "./plots.js";
import { state } from "./state.js";
import { fallbackTierKeys } from "./data/buildingcatalog.js";

const camera = {
  x: 0,
  y: 0,
  zoom: 1,
  minZoom: 1,
  maxZoom: 3,
};

let rafPending = false;
let showGrid = true;
const TOWNHALL_MAX_LEVEL = 20;

export function initCity() {
  const buildingsLayer = document.getElementById("buildingsLayer");
  if (!buildingsLayer) throw new Error("buildingsLayer missing");

  const viewport = document.getElementById("cityViewport");
  const content = document.getElementById("cityContent");
  const layer = document.getElementById("plotsLayer");
  const base = document.getElementById("cityBase");
  const grid = document.getElementById("gridCanvas");
debugDrawPlots();

  if (!viewport || !content || !layer || !base || !grid) {
    throw new Error("City DOM missing required elements");
  }

  // ---------- interaction state ----------
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0;
  let camStartX = 0, camStartY = 0;
  let downAtX = 0, downAtY = 0;
  const CLICK_DRAG_THRESHOLD = 6;

  // ---------- disable browser image drag ----------
  base.setAttribute("draggable", "false");
  viewport.addEventListener("dragstart", e => e.preventDefault());
  viewport.addEventListener("selectstart", e => e.preventDefault());

  // ---------- render plots ----------
  layer.replaceChildren();
  for (const p of plots) {
    const el = document.createElement("div");
    el.className = "plot";
    el.dataset.plotId = p.id;

    el.style.left = `${p.x}%`;
    el.style.top = `${p.y}%`;
    el.style.width = `${p.w}px`;
    el.style.height = `${p.h}px`;
    el.style.transform = "translate(-50%, -50%)";

    el.addEventListener("pointerdown", e => {
      e.stopPropagation();
    });

    el.addEventListener("pointerup", (e) => {
  e.stopPropagation();
  if (moved) return;

  const thBuilt = state.buildings.townhallLevel > 0;

  // ✅ Plot locking:
  if (!thBuilt && p.id !== "townhall") {
    console.log("Locked plot (build Town Hall first):", p.id);
    return;
  }

  selectPlot(p.id);
});


    layer.appendChild(el);
  }

  // ---------- pointer pan ----------
  viewport.addEventListener("pointerdown", e => {
    dragging = true;
    moved = false;
    downAtX = e.clientX;
    downAtY = e.clientY;

    viewport.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    camStartX = camera.x;
    camStartY = camera.y;
  });

  viewport.addEventListener("pointermove", e => {
    if (!dragging) return;

    const dx = e.clientX - downAtX;
    const dy = e.clientY - downAtY;
    if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) moved = true;

    camera.x = camStartX + (e.clientX - startX);
    camera.y = camStartY + (e.clientY - startY);

    clampCameraToBounds(viewport, base);
    requestApplyTransform(content);
  });

  viewport.addEventListener("pointerup", () => {
    dragging = false;
    if (!moved) selectPlot(null);
  });

  viewport.addEventListener("pointercancel", () => {
    dragging = false;
  });

  // ---------- zoom ----------
  viewport.addEventListener("wheel", e => {
    e.preventDefault();

    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldX = (mx - camera.x) / camera.zoom;
    const worldY = (my - camera.y) / camera.zoom;

    const zoomFactor = Math.exp(-e.deltaY * 0.0015);
    camera.zoom = clamp(camera.zoom * zoomFactor, camera.minZoom, camera.maxZoom);

    camera.x = mx - worldX * camera.zoom;
    camera.y = my - worldY * camera.zoom;

    clampCameraToBounds(viewport, base);
    requestApplyTransform(content);
  }, { passive: false });

  // ---------- grid + sizing ----------
  function sync() {
    buildingsLayer.style.width = `${base.offsetWidth}px`;
    buildingsLayer.style.height = `${base.offsetHeight}px`;
    renderBuildings();
    renderPlotsLockState();


    layer.style.width = `${base.offsetWidth}px`;
    layer.style.height = `${base.offsetHeight}px`;

    grid.width = base.offsetWidth;
    grid.height = base.offsetHeight;
    grid.style.width = `${base.offsetWidth}px`;
    grid.style.height = `${base.offsetHeight}px`;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    camera.minZoom = Math.min(vw / base.offsetWidth, vh / base.offsetHeight);
    camera.zoom = clamp(camera.zoom, camera.minZoom, camera.maxZoom);

    drawGrid(grid);
    centerCamera(viewport, base);
    clampCameraToBounds(viewport, base);
    requestApplyTransform(content);
  }

  if (base.complete) requestAnimationFrame(sync);
  base.addEventListener("load", () => requestAnimationFrame(sync), { once: true });
  window.addEventListener("resize", () => requestAnimationFrame(sync));
}

function renderPlotsLockState() {
  const layer = document.getElementById("plotsLayer");
  if (!layer) return;

  const thBuilt = (state.buildings.townhallLevel ?? 0) > 0;

  layer.querySelectorAll(".plot").forEach(el => {
    const id = el.dataset.plotId;
    if (!thBuilt && id !== "townhall") el.classList.add("locked");
    else el.classList.remove("locked");
  });
}





function tierForLevel(level) {
  const lv = Math.max(1, Math.min(20, level | 0));
  if (lv >= 20) return 20;
  if (lv >= 15) return 15;
  if (lv >= 10) return 10;
  if (lv >= 5) return 5;
  return 1;
}

function getTierSpritePath(type, level) {
  const tier = tierForLevel(level);

  // Townhall keeps your naming convention:
  if (type === "townhall") return `./assets/city/L${tier}townhall.png`;

  // New buildings naming convention:
  // ./assets/city/farm_L1.png, farm_L5.png, ...
  return `./assets/city/${type}_L${tier}.png`;
}

function fallbackTierList(level) {
  const tier = tierForLevel(level);
  return [tier, 15, 10, 5, 1].filter((v, i, a) => a.indexOf(v) === i);
}

function seedResourceBuildingsIfMissing() {
  // if already seeded, do nothing
  if (state.buildings.placed && state.buildings.placed.length) return;

  state.buildings.placed = [
    { id: "farm",   type: "farm",   level: 1, plotId: "farm" },
    { id: "quarry", type: "quarry", level: 1, plotId: "quarry" },
    { id: "lumber", type: "lumber", level: 1, plotId: "lumber" },
    { id: "mine",   type: "mine",   level: 1, plotId: "mine" },
  ];
}


function renderBuildings(animate = false) {
  const buildingsLayer = document.getElementById("buildingsLayer");
  if (!buildingsLayer) return;

  buildingsLayer.replaceChildren();

  // ---------- Helper to create a building sprite ----------
  function addBuildingSprite({ buildingId, type, level, plotId, onClick }) {
    const plot = plots.find(p => p.id === plotId);
    if (!plot) return;

    const wrap = document.createElement("div");
    wrap.className = "building-wrap";
    wrap.dataset.level = String(level);
    wrap.dataset.type = type;
    wrap.dataset.buildingId = buildingId;
    wrap.style.left = `${plot.x}%`;
    wrap.style.top = `${plot.y}%`;

    const img = document.createElement("img");
    img.className = "building-sprite";
    img.dataset.level = String(level);
    img.alt = `${type} L${level}`;
    img.src = getTierSpritePath(type, level);

    img.onerror = () => {
      const fallbacks = fallbackTierList(level);
      for (const t of fallbacks) {
        const p =
          type === "townhall"
            ? `./assets/city/L${t}townhall.png`
            : `./assets/city/${type}_L${t}.png`;

        // prevent loop
        if (img.src.endsWith(p)) continue;

        console.warn(`Missing ${type} sprite tier L${tierForLevel(level)}; falling back to L${t}`);
        img.onerror = null;
        img.src = p;
        return;
      }
    };

    if (state.selectedBuilding === buildingId) {
      img.classList.add("selected");
    }

    img.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedBuilding = buildingId;
      renderBuildings(false);
      onClick?.();
    });

    if (animate) {
      img.classList.add("pop");
      img.addEventListener("animationend", () => img.classList.remove("pop"), { once: true });
    }

    wrap.appendChild(img);
    buildingsLayer.appendChild(wrap);
  }

  // ---------- 1) Town Hall ----------
  const thLevel = state.buildings.townhallLevel ?? 0;
  if (thLevel > 0) {
    addBuildingSprite({
      buildingId: "townhall",
      type: "townhall",
      level: thLevel,
      plotId: "townhall",
      onClick: () => openTownHallModal?.(),
    });
  }


    // ===== RESOURCE BUILDINGS =====
  for (const b of (state.buildings.placed ?? [])) {
    const plot = plots.find(p => p.id === b.plotId);
    if (!plot) continue;

    const wrap2 = document.createElement("div");
    wrap2.className = "building-wrap";
    wrap2.style.left = `${plot.x}%`;
    wrap2.style.top = `${plot.y}%`;

    const img2 = document.createElement("img");
    img2.className = "building-sprite";
    img2.alt = `${b.type} L${b.level}`;

    // expects: ./assets/city/farm_L1.png etc (tiered)
    const tier = tierForLevel(b.level);
    img2.src = `./assets/city/${b.type}_L${tier}.png`;

    img2.onerror = () => {
      // fallback tiers: 20/15/10/5/1
      const tierList = [tier, 15, 10, 5, 1].filter((v, i, a) => a.indexOf(v) === i);
      for (const t of tierList) {
        const p = `./assets/city/${b.type}_L${t}.png`;
        if (img2.src.endsWith(p)) continue;
        img2.onerror = null;
        img2.src = p;
        return;
      }
    };

    if (state.selectedBuilding === b.id) img2.classList.add("selected");

    img2.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedBuilding = b.id;
      renderBuildings(false);
      // later: openBuildingModal(b)
    });

    wrap2.appendChild(img2);
    buildingsLayer.appendChild(wrap2);
  }

  // ---------- 2) Other buildings ----------
  const placed = state.buildings.placed ?? [];
  for (const b of placed) {
    addBuildingSprite({
      buildingId: b.id,
      type: b.type,
      level: b.level,
      plotId: b.plotId,
      onClick: () => {
        // You can swap this to open a generic modal later.
        // For now: just select + show something small
        openBuildingModal?.(b);
      },
    });
  }
}




function openTownHallModal() {
  const backdrop = document.getElementById("modalBackdrop");
  const title = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");
  const cancel = document.getElementById("modalCancel");
  const confirm = document.getElementById("modalConfirm");

  if (!backdrop || !title || !body || !cancel || !confirm) return;

  const lvl = state.buildings.townhallLevel ?? 0;
  const max = TOWNHALL_MAX_LEVEL;

  title.textContent = (lvl === 0) ? "Town Hall" : `Town Hall (Level ${lvl})`;

  if (lvl === 0) {
    body.textContent = `Build the Town Hall? (Free for now)`;
    confirm.textContent = "Build (Level 1)";
    confirm.disabled = false;
    confirm.onclick = () => {
      state.buildings.townhallLevel = 1;
      state.selectedBuilding = "townhall";
      closeModal();
      renderPlotsLockState();    // unlock plots
      renderBuildings(true);     // animate
      console.log("Town Hall built: L1");
    };
  } else if (lvl < max) {
    const next = lvl + 1;
    body.textContent = `Upgrade Town Hall to Level ${next}? (Free for now)`;
    confirm.textContent = `Upgrade to Level ${next}`;
    confirm.disabled = false;
    confirm.onclick = () => {
      state.buildings.townhallLevel = next;
      state.selectedBuilding = "townhall";
      closeModal();
      renderBuildings(true);     // animate
      console.log(`Town Hall upgraded: L${next}`);
    };
  } else {
    body.textContent = `Town Hall is max level (Level ${max}).`;
    confirm.textContent = "Max Level";
    confirm.disabled = true;
    confirm.onclick = null;
  }

  cancel.onclick = () => closeModal();

  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeModal();
  };

  backdrop.classList.remove("hidden");
}



function closeModal() {
  const backdrop = document.getElementById("modalBackdrop");
  if (!backdrop) return;
  backdrop.classList.add("hidden");
}


function selectPlot(id) {
  state.selectedPlot = id;

  // 🔥 CLEAR building selection by default
  state.selectedBuilding = null;

  const hud = document.getElementById("hudSelected");
  if (hud) hud.textContent = `Selected: ${id ?? "none"}`;

  if (id === "townhall") {
    state.selectedBuilding = "townhall";
    renderBuildings(false); // refresh highlight
    openTownHallModal();
  } else {
    renderBuildings(false); // remove highlight
  }

  console.log("Selected plot:", id);
}



function requestApplyTransform(contentEl) {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    contentEl.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
  });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function clampCameraToBounds(viewport, base) {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const imgW = base.offsetWidth * camera.zoom;
  const imgH = base.offsetHeight * camera.zoom;

  if (imgW <= vw) camera.x = (vw - imgW) / 2;
  else camera.x = clamp(camera.x, vw - imgW, 0);

  if (imgH <= vh) camera.y = (vh - imgH) / 2;
  else camera.y = clamp(camera.y, vh - imgH, 0);
}

function centerCamera(viewport, base) {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const imgW = base.offsetWidth * camera.zoom;
  const imgH = base.offsetHeight * camera.zoom;
  camera.x = (vw - imgW) / 2;
  camera.y = (vh - imgH) / 2;
}

/**
 * Convert screen coords to image-space coords.
 * Returns:
 *  - ix/iy: pixel coords within the image (0..imgW, 0..imgH)
 *  - px/py: percent coords (0..100)
 */
function screenToImage(clientX, clientY, viewport, base) {
  const rect = viewport.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;

  const localX = (sx - camera.x) / camera.zoom;
  const localY = (sy - camera.y) / camera.zoom;

  const imgW = base.offsetWidth;
  const imgH = base.offsetHeight;

  // Only log if inside the image bounds
  if (localX < 0 || localY < 0 || localX > imgW || localY > imgH) return null;

  return {
    ix: localX,
    iy: localY,
    px: (localX / imgW) * 100,
    py: (localY / imgH) * 100,
  };
}

function drawGrid(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Visual style
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textBaseline = "top";

  const step = 100;
  const heavy = 500;

  for (let x = 0; x <= w; x += step) {
    const isHeavy = x % heavy === 0;
    ctx.strokeStyle = isHeavy ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = isHeavy ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();

    if (isHeavy) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(String(x), x + 4, 4);
    }
  }

  for (let y = 0; y <= h; y += step) {
    const isHeavy = y % heavy === 0;
    ctx.strokeStyle = isHeavy ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = isHeavy ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();

    if (isHeavy) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(String(y), 4, y + 4);
    }
  }
}
function debugDrawPlots() {
  const layer = document.getElementById("plotsLayer");
  if (!layer) return;

  layer.querySelectorAll(".plot-debug").forEach(n => n.remove());

  for (const p of plots) {
    const d = document.createElement("div");
    d.className = "plot-debug";
    d.style.left = `${p.x}%`;
    d.style.top = `${p.y}%`;
    d.textContent = p.id;
    layer.appendChild(d);
  }
}
