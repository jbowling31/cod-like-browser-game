// docs/js/cityCanvasRenderer.js
import { plots } from "./plots.js";
import { GrassLayer } from "./systems/grass.js?v=8"; // cache-buster while iterating

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function createCityCanvasRenderer({ canvas, baseImgEl, getState, tierForLevel }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D ctx missing");

  // TEMP: make grass pop against a dark bg so you can see it easily.
  canvas.style.background = "#0b1d12";

  // --- GRASS (turn debug ON so you see cyan chunk boxes + center dot)
  const grass = new GrassLayer({
    density: 560,
minBlade: 7,
maxBlade: 18,
lineWidth: 1,
colorA: "#3a7a31",
colorB: "#2a5e23",
debug: false

  });

  // Sprite cache
  const spriteCache = new Map();
  function spriteKey(type, tier) { return `${type}|${tier}`; }

  async function getSprite(type, level) {
    const tier = tierForLevel(level);
    const key = spriteKey(type, tier);
    if (spriteCache.has(key)) return spriteCache.get(key);

    const src = (type === "townhall")
      ? `./assets/city/L${tier}townhall.png`
      : `./assets/city/${type}_L${tier}.png`;

    const img = await loadImage(src);
    if (!img) {
      const fallbacks = [20, 15, 10, 5, 1];
      for (const t of fallbacks) {
        const k2 = spriteKey(type, t);
        if (spriteCache.has(k2)) {
          const cached = spriteCache.get(k2);
          spriteCache.set(key, cached);
          return cached;
        }
        const src2 = (type === "townhall")
          ? `./assets/city/L${t}townhall.png`
          : `./assets/city/${type}_L${t}.png`;
        const img2 = await loadImage(src2);
        if (img2) {
          spriteCache.set(k2, img2);
          spriteCache.set(key, img2);
          return img2;
        }
      }
      spriteCache.set(key, null);
      return null;
    }
    spriteCache.set(key, img);
    return img;
  }

  // Sizes
  const baseWidthByType = {
    townhall: 240, farm: 210, lumber: 165, quarry: 185, mine: 185,
  };
  function townhallWidthForLevel(level) {
    const lvl = Number(level) || 1;
    let mult = 1.0;
    if (lvl < 5) mult = 0.55;
    else if (lvl < 10) mult = 0.70;
    else if (lvl < 15) mult = 0.85;
    else if (lvl < 20) mult = 0.95;
    return Math.round((baseWidthByType.townhall ?? 240) * mult);
  }

  // Grounding offsets
  const baseYPxByType = { townhall: 10, farm: 26, lumber: 30, quarry: 40, mine: 44 };
  function yOffsetPx(type, level) {
    const t = tierForLevel(level);
    const tierBonus = ({ 1:0, 5:4, 10:8, 15:12, 20:14 })[t] ?? 0;
    return (baseYPxByType[type] ?? 28) + tierBonus;
  }

  // Sun + water shimmer
  function sunDir(tSec){ const a = tSec * 0.15; return { x: Math.cos(a), y: Math.sin(a) }; }
  const waterRects = [ /* { x: 240, y: 520, w: 520, h: 170 }, */ ];
  function drawWaterShimmer(timeSec){
    if (!waterRects.length) return;
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (const r of waterRects) {
      const bands = 10;
      for (let i=0;i<bands;i++){
        const yy = r.y + (i / bands) * r.h;
        const phase = timeSec * 2 + i * 0.9;
        const offset = Math.sin(phase) * 6;
        ctx.beginPath();
        ctx.rect(r.x, yy + offset, r.w, r.h / bands * 0.45);
        ctx.fillStyle = "white";
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawShadowUnderBuilding(px, py, wPx, level, timeSec){
    const d = sunDir(timeSec);
    const tier = tierForLevel(level);
    const len = 30 * ({1:0.6, 5:0.8, 10:1.0, 15:1.15, 20:1.25}[tier] ?? 1.0);
    const sx = px + d.x * len, sy = py + d.y * len;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(sx, sy, wPx * 0.28, wPx * 0.14, Math.atan2(d.y, d.x), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Plots
  function plotToPx(plot){
    const x = (plot.x / 100) * canvas.width;
    const y = (plot.y / 100) * canvas.height;
    const w = ((plot.w ?? 10) / 100) * canvas.width;
    const h = ((plot.h ?? 6) / 100) * canvas.height;
    return { x, y, rx: w * 0.5, ry: h * 0.5 };
  }
  function pathEllipse(ctx, x, y, rx, ry, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.restore();
  }
  function drawEllipseFence(ctx, x, y, rx, ry, rot, tSec) {
    const postCount = Math.max(10, Math.floor((rx + ry) * 0.18));
    const ropeWobble = 0.8 + Math.sin(tSec * 1.7) * 0.15;
    let prev = null;
    for (let i = 0; i <= postCount; i++) {
      const a = (i / postCount) * Math.PI * 2;
      const px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const wx = x + (px * cr - py * sr), wy = y + (px * sr + py * cr);

      ctx.lineWidth = 2; ctx.strokeStyle = "#c9b28b";
      ctx.beginPath(); ctx.moveTo(wx, wy - 6); ctx.lineTo(wx, wy + 2); ctx.stroke();

      if (prev) {
        ctx.lineWidth = 1.5; ctx.strokeStyle = "#d8c7a6";
        ctx.beginPath();
        const mx = (prev.x + wx) * 0.5, my = (prev.y + wy) * 0.5 + (1.2 * ropeWobble);
        ctx.moveTo(prev.x, prev.y); ctx.quadraticCurveTo(mx, my, wx, wy); ctx.stroke();
      }
      prev = { x: wx, y: wy };
    }
  }
  function drawEmptyPlot(ctx, plot, tSec, { selected=false } = {}) {
    const { x, y, rx, ry } = plotToPx(plot);
    const rot = -0.12;
    ctx.save();
    ctx.globalAlpha = 0.22; pathEllipse(ctx, x, y, rx, ry, rot); ctx.fillStyle = "#3b2a18"; ctx.fill();
    ctx.globalAlpha = 0.10; ctx.lineWidth = 6; ctx.strokeStyle = "#000"; ctx.stroke();
    ctx.globalAlpha = 0.65; ctx.lineWidth = selected ? 3 : 2; ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -(tSec * 18); ctx.strokeStyle = selected ? "#ffffff" : "#f2f2f2"; ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 0.85; drawEllipseFence(ctx, x, y, rx, ry, rot, tSec);
    if (selected) { ctx.globalAlpha = 0.14; ctx.lineWidth = 10; ctx.strokeStyle = "#ffffff"; pathEllipse(ctx, x, y, rx, ry, rot); ctx.stroke(); }
    ctx.restore();
  }
  function renderEmptyPlots(ctx, timeSec, selectedPlotId) {
    const sorted = [...plots].sort((a,b) => (a.y - b.y));
    for (const p of sorted) drawEmptyPlot(ctx, p, timeSec, { selected: p.id === selectedPlotId });
  }

  // Main loop
  let lastMs = 0, raf = 0, running = false;

  async function renderFrame(timeMs){
    if (!running) return;
    raf = requestAnimationFrame(renderFrame);
    const dt = (timeMs - (lastMs || timeMs)) / 1000;
    lastMs = timeMs;
    const timeSec = timeMs / 1000;

    // Sync canvas to base image
    const w = baseImgEl.offsetWidth, h = baseImgEl.offsetHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Camera: world == canvas pixels; centered
    const camera = { x: canvas.width / 2, y: canvas.height / 2, zoom: 1 };
    const viewport = { width: canvas.width, height: canvas.height };

    // Draw your scene first
    // ctx.drawImage(baseImgEl, 0, 0, canvas.width, canvas.height); // optional
    drawWaterShimmer(timeSec);

    const state = getState();
    const selectedPlotId = state.selectedPlot?.id ?? null;
    renderEmptyPlots(ctx, timeSec, selectedPlotId);

    const buildings = [];
    const thLevel = state.buildings?.townhallLevel ?? 0;
    if (thLevel > 0) buildings.push({ id:"townhall", type:"townhall", level:thLevel, plotId:"townhall" });

    for (const b of buildings) {
      const plot = plots.find(p => p.id === b.plotId);
      if (!plot) continue;
      const x = (plot.x / 100) * canvas.width;
      const y = (plot.y / 100) * canvas.height;

      const sprite = await getSprite(b.type, b.level);
      if (!sprite) continue;

      let wPx = baseWidthByType[b.type] ?? 140;
      if (b.type === "townhall") wPx = townhallWidthForLevel(b.level);
      const hPx = wPx * (sprite.height / sprite.width);

      const yDrop = yOffsetPx(b.type, b.level);
      const drawX = Math.round(x - wPx/2);
      const drawY = Math.round(y - hPx + yDrop);

      drawShadowUnderBuilding(x, y + yDrop, wPx, b.level, timeSec);
      ctx.drawImage(sprite, drawX, drawY, wPx, hPx);
    }

    // *** Draw GRASS LAST so you can SEE it. Once verified, move this block above plots/buildings. ***
    grass.update(dt, camera, viewport);
    grass.draw(ctx, camera, viewport);
    const s = grass.stats();
    console.debug("[Grass] chunks:", s.chunks, "blades≈", s.blades);
  }

  return {
    setWaterRects(rects){ waterRects.length = 0; waterRects.push(...rects); },
    start(){ if (running) return; running = true; lastMs = 0; raf = requestAnimationFrame(renderFrame); },
    stop(){ running = false; cancelAnimationFrame(raf); }
  };
}
