// docs/js/city.js
import { plots } from "./plots.js";
import { state } from "./state.js";
import { showPlotPopup } from "./UI/cityUI.js";
import { createProceduralCityRenderer } from "./proceduralCityRenderer.js";
import { updateEconomy, getProductionPerSecond } from "./systems/cityeconomy.js";



const camera = {
  x: 0,
  y: 0,
  zoom: 1,
  minZoom: 1,
  maxZoom: 3,
};

let rafPending = false;
let showGrid = false;
const TOWNHALL_MAX_LEVEL = 20;

// ✅ IMPORTANT: your UI imports this. We’re tile-only right now, so it’s a safe stub.
// If/when we bring buildings back, we’ll replace this with your real DOM building renderer.
export function renderBuildings() {
  // no-op for now (tile scene handles visuals)
}

// =========================
// INIT
// =========================
export function initCity() {
  const viewport = document.getElementById("cityViewport");
  const content = document.getElementById("cityContent");
  const plotsLayer = document.getElementById("plotsLayer");
  const buildingsLayer = document.getElementById("buildingsLayer");
  const base = document.getElementById("cityBase");
  const grid = document.getElementById("gridCanvas");

  if (!viewport || !content || !plotsLayer || !buildingsLayer || !base || !grid) {
    throw new Error("City DOM missing required elements");
  }

  // Make camera available to renderer (for zoom reading)
  window.__cityCamera = camera;

  // ---- CANVAS TILE RENDERER ----
  let renderer = null;
  const cityCanvas = document.getElementById("cityCanvas");
  if (cityCanvas) {
    renderer = createProceduralCityRenderer({
      canvas: cityCanvas,
      getState: () => state,
    });

    if (!renderer || typeof renderer.start !== "function" || typeof renderer.stop !== "function") {
      console.error("Renderer factory did not return {start, stop}. Got:", renderer);
    } else {
      renderer.start();
      window.renderer = renderer;
    }// ---- ECONOMY TICK LOOP (debug heartbeat) ----
let econLastT = 0;

function econFrame(t) {
  const now = t || performance.now();
  const dt = econLastT ? (now - econLastT) / 1000 : 0;
  econLastT = now;

  // DEBUG: prove loop runs
  state.resources.gold = (state.resources.gold ?? 0) + dt * 1;

  renderResourceHud();
  requestAnimationFrame(econFrame);
}

requestAnimationFrame(econFrame);


  }

  // ---------- interaction state ----------
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0;
  let camStartX = 0, camStartY = 0;
  let downAtX = 0, downAtY = 0;

  const CLICK_DRAG_THRESHOLD = 6;

  base.setAttribute("draggable", "false");
  viewport.addEventListener("dragstart", (e) => e.preventDefault());
  viewport.addEventListener("selectstart", (e) => e.preventDefault());

  function buildPlotHitboxes() {
    plotsLayer.replaceChildren();

    for (const p of plots) {
      const el = document.createElement("div");
      el.className = "plot plotHitbox";
      el.dataset.plotId = p.id;

      el.style.left = `${p.x}%`;
      el.style.top = `${p.y}%`;

      // plot hitbox size (percent-based)
      el.style.width = `${p.w}%`;
      el.style.height = `${p.h}%`;

      // center around x/y
      el.style.transform = "translate(-50%, -50%)";

      // don’t let clicking plots start a pan
      el.addEventListener("pointerdown", (e) => e.stopPropagation());

      el.addEventListener("pointerup", (e) => {
        e.stopPropagation();
        if (moved) return;

        const thBuilt = (state.buildings.townhallLevel ?? 0) > 0;
        if (!thBuilt && p.id !== "townhall") return;

        selectPlot(p.id);
        if (hit && typeof onPlotClick === "function") onPlotClick(hit);

        if (p.id !== "townhall") showPlotPopup(p);
      });

      plotsLayer.appendChild(el);
    }

    renderPlotsLockState();
  }

  // ---------- pointer pan ----------
  viewport.addEventListener("pointerdown", (e) => {
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

  viewport.addEventListener("pointermove", (e) => {
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
  viewport.addEventListener(
    "wheel",
    (e) => {
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
    },
    { passive: false }
  );

  // ---------- sizing + grid ----------
  function sync() {
    syncLayerSizes();

    grid.width = base.offsetWidth;
    grid.height = base.offsetHeight;
    grid.style.width = `${base.offsetWidth}px`;
    grid.style.height = `${base.offsetHeight}px`;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    camera.minZoom = Math.min(vw / base.offsetWidth, vh / base.offsetHeight);
    camera.zoom = clamp(camera.zoom, camera.minZoom, camera.maxZoom);

    if (showGrid) drawGrid(grid);
    else grid.getContext("2d")?.clearRect(0, 0, grid.width, grid.height);

    buildPlotHitboxes();

    centerCamera(viewport, base);
    clampCameraToBounds(viewport, base);
    requestApplyTransform(content);
  }

  if (base.complete) requestAnimationFrame(sync);
  base.addEventListener("load", () => requestAnimationFrame(sync), { once: true });
  window.addEventListener("resize", () => requestAnimationFrame(sync));
}

// =========================
// PLOT LOCK VISUALS
// =========================
function renderPlotsLockState() {
  const layer = document.getElementById("plotsLayer");
  if (!layer) return;

  const thBuilt = (state.buildings.townhallLevel ?? 0) > 0;

  layer.querySelectorAll(".plot").forEach((el) => {
    const id = el.dataset.plotId;
    if (!thBuilt && id !== "townhall") el.classList.add("locked");
    else el.classList.remove("locked");
  });
}

// =========================
// SELECTION
// =========================
function selectPlot(id) {
  state.selectedPlot = id;
  state.selectedBuilding = null;

  const hud = document.getElementById("hudSelected");
  if (hud) hud.textContent = `Selected: ${id ?? "none"}`;

  console.log("Selected plot:", id);
}

// =========================
// CAMERA / TRANSFORMS
// =========================
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

// =========================
// GRID
// =========================
function drawGrid(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

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
function fmt(n) {
  return Math.floor(n).toLocaleString();
}
function fmtRate(n) {
  return (Math.round(n * 10) / 10).toLocaleString();
}

function fmt(n) { return Math.floor(n || 0).toLocaleString(); }

function renderResourceHud() {
  let hud = document.getElementById("hud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "hud";
    hud.style.position = "fixed";
    hud.style.left = "10px";
    hud.style.top = "10px";
    hud.style.zIndex = "9999";
    hud.style.color = "#e5e7eb";
    hud.style.background = "rgba(0,0,0,.45)";
    hud.style.padding = "8px 10px";
    hud.style.borderRadius = "10px";
    hud.style.font = "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial";
    hud.style.pointerEvents = "none";
    document.body.appendChild(hud);
  }

  const r = state.resources || {};
  hud.innerHTML = `
    <div><b>Food:</b> ${fmt(r.food)}</div>
    <div><b>Wood:</b> ${fmt(r.wood)}</div>
    <div><b>Stone:</b> ${fmt(r.stone)}</div>
    <div><b>Ore:</b> ${fmt(r.ore)}</div>
    <div><b>Gold:</b> ${fmt(r.gold)}</div>
    <div style="opacity:.7;margin-top:6px">HUD OK ✅</div>
  `;
}


// =========================
// LAYER SIZES
// =========================
function syncLayerSizes() {
  const base = document.getElementById("cityBase");
  const plotsLayer = document.getElementById("plotsLayer");
  const buildingsLayer = document.getElementById("buildingsLayer");
  const grid = document.getElementById("gridCanvas");
  const cityCanvas = document.getElementById("cityCanvas");

  if (!base || !plotsLayer || !buildingsLayer || !grid) return;

  const w = base.offsetWidth;
  const h = base.offsetHeight;

  plotsLayer.style.width = `${w}px`;
  plotsLayer.style.height = `${h}px`;

  buildingsLayer.style.width = `${w}px`;
  buildingsLayer.style.height = `${h}px`;

  grid.style.width = `${w}px`;
  grid.style.height = `${h}px`;

  if (cityCanvas) {
    cityCanvas.style.width = `${w}px`;
    cityCanvas.style.height = `${h}px`;
  }
}
