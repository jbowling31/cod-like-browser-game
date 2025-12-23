// ============================================================================
// File: docs/js/proceduralCityRenderer.js
// Desc: 16-bit tile renderer using Kenney "Tiny Town" separated PNG tiles.
//       - Grass base (random variants)
//       - Square dirt plot pads (tile fill)
//       - Tile-roads between buildable plots (with rotated straight/corner tiles)
//       - Procedural river (pixel-art style) with subtle shimmer
//
// REQUIREMENTS (your choices):
// - Separated PNG tiles (Tiles/tile_0000.png ...)
// - Tile size: 16x16
//
// Notes:
// - We rotate tiles in-canvas to get horizontal road pieces from the vertical straight.
// - We keep this renderer independent from DOM buildings layer (you can still use both).
// ============================================================================

import { plots } from "./plots.js";

const TAU = Math.PI * 2;

// -------------------- helpers --------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function getCurrentZoom() {
  const z = window.__cityCamera?.zoom;
  if (typeof z === "number" && z > 0) return z;

  const content = document.getElementById("cityContent");
  if (content) {
    const tr = getComputedStyle(content).transform;
    const m = tr && tr.match(/matrix\(([^)]+)\)/);
    if (m) {
      const a = parseFloat(m[1].split(",")[0]);
      if (a && isFinite(a) && a > 0) return a;
    }
  }
  return 1;
}

function hash2(i) {
  let x = (i | 0) + 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
function rand01(i) {
  return (hash2(i) % 100000) / 100000;
}

// plots are in percent center coords
function plotToPx(p, w, h) {
  const cx = (p.x / 100) * w;
  const cy = (p.y / 100) * h;
  return { cx, cy };
}

function isBuildablePlot(p) {
  if (!p) return false;
  if (p.buildable === false) return false;
  const id = String(p.id ?? "").toLowerCase();
  if (id === "townhall") return false;
  if (p.isTownhall === true) return false;
  return true;
}

// -------------------- tile loading --------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadTiles(basePath = "./assets/kenney_tiny-town/Tiles") {
  // YOU CAN CHANGE THESE TILE IDs if you prefer different ones.
  // From the pack preview (common usable terrain tiles):
  const TILE_GRASS_A = 0;  // nice grass
  const TILE_GRASS_B = 1;  // grass variant
  const TILE_GRASS_C = 2;  // grass variant
  const TILE_DIRT     = 25; // dirt/ground fill

  // Road/path tiles (we rotate these)
  const TILE_PATH_STRAIGHT = 47; // straight (vertical) -> rotate 90 for horizontal
  const TILE_PATH_CORNER   = 44; // corner -> rotate per corner
  const TILE_PATH_CROSS    = 45; // intersection

  // If you want: stones/pebbles for detail (optional)
  const TILE_STONE_PATCH = 43;

  // Build a lookup table of the tiles we’ll actually draw:
  const needed = [
    TILE_GRASS_A,
    TILE_GRASS_B,
    TILE_GRASS_C,
    TILE_DIRT,
    TILE_PATH_STRAIGHT,
    TILE_PATH_CORNER,
    TILE_PATH_CROSS,
    TILE_STONE_PATCH
  ];

  const imgs = {};
  await Promise.all(
    needed.map(async (id) => {
      const fn = `tile_${String(id).padStart(4, "0")}.png`;
      imgs[id] = await loadImage(`${basePath}/${fn}`);
    })
  );

  return {
    imgs,
    ids: {
      GRASS: [TILE_GRASS_A, TILE_GRASS_B, TILE_GRASS_C],
      DIRT: TILE_DIRT,
      PATH_STRAIGHT: TILE_PATH_STRAIGHT,
      PATH_CORNER: TILE_PATH_CORNER,
      PATH_CROSS: TILE_PATH_CROSS,
      STONE_PATCH: TILE_STONE_PATCH
    }
  };
}

// -------------------- tile draw --------------------
function drawTile(ctx, img, x, y, rot = 0) {
  // img is 16x16
  if (!img) return;
  if (!rot) {
    ctx.drawImage(img, x, y);
    return;
  }
  ctx.save();
  ctx.translate(x + 8, y + 8);
  ctx.rotate(rot);
  ctx.drawImage(img, -8, -8);
  ctx.restore();
}

// -------------------- road building in tile space --------------------
function toTileCoord(px, py) {
  return { tx: Math.floor(px / 16), ty: Math.floor(py / 16) };
}

function bresenhamLine(a, b) {
  const pts = [];
  let x0 = a.tx, y0 = a.ty;
  const x1 = b.tx, y1 = b.ty;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    pts.push({ tx: x0, ty: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 <  dx) { err += dx; y0 += sy; }
  }
  return pts;
}

function neighborsMask(roadSet, tx, ty) {
  const N = roadSet.has(`${tx},${ty - 1}`);
  const E = roadSet.has(`${tx + 1},${ty}`);
  const S = roadSet.has(`${tx},${ty + 1}`);
  const W = roadSet.has(`${tx - 1},${ty}`);
  return { N, E, S, W };
}

function roadTypeFromMask(m) {
  const c = (m.N?1:0)+(m.E?1:0)+(m.S?1:0)+(m.W?1:0);

  if (c >= 4) return { kind: "cross", rot: 0 };
  if (c === 3) {
    // T-junction (we'll draw CROSS too; looks fine in 16-bit)
    return { kind: "cross", rot: 0 };
  }
  if (c === 2) {
    // straight or corner
    if ((m.N && m.S) || (m.E && m.W)) {
      // straight
      return { kind: "straight", rot: (m.E && m.W) ? Math.PI / 2 : 0 };
    }
    // corner
    // Base corner tile we assume connects "up + right" when rot=0 (we’ll test by visuals)
    // We rotate to match:
    // up+right: 0
    // right+down: 90
    // down+left: 180
    // left+up: 270
    if (m.N && m.E) return { kind: "corner", rot: 0 };
    if (m.E && m.S) return { kind: "corner", rot: Math.PI / 2 };
    if (m.S && m.W) return { kind: "corner", rot: Math.PI };
    if (m.W && m.N) return { kind: "corner", rot: (Math.PI * 3) / 2 };
  }
  if (c === 1) {
    // dead-end: just draw straight oriented toward the neighbor
    if (m.N || m.S) return { kind: "straight", rot: 0 };
    return { kind: "straight", rot: Math.PI / 2 };
  }
  return null;
}

// -------------------- river (procedural pixel-art) --------------------
function riverCenterX(y, w, h) {
  const t = y / h;
  return w * (0.86 + 0.05 * Math.sin(t * TAU * 0.85 + 0.4) + 0.03 * Math.sin(t * TAU * 2.1 + 1.1));
}

function drawRiverPixel(ctx, ms, w, h) {
  // 16-bit-ish colors
  const riverW = Math.max(40, Math.min(w, h) * 0.11);
  const edgeW  = Math.max(3, riverW * 0.18);

  // Water fill
  ctx.save();
  ctx.globalAlpha = 1;

  // Main body
  ctx.fillStyle = "#2b6fb3";
  ctx.beginPath();
  ctx.moveTo(riverCenterX(0, w, h), -h * 0.05);
  const steps = 18;
  for (let i = 1; i <= steps; i++) {
    const y = (i / steps) * (h * 1.05);
    const x = riverCenterX(y, w, h);
    ctx.lineTo(x, y);
  }
  // make a strip (stroke -> expand -> fill)
  ctx.lineWidth = riverW;
  ctx.strokeStyle = "#2b6fb3";
  ctx.stroke();

  // Edge darker
  ctx.lineWidth = riverW + edgeW;
  ctx.strokeStyle = "#1e4f82";
  ctx.stroke();

  // Inner lighter band
  ctx.lineWidth = riverW - edgeW * 1.2;
  ctx.strokeStyle = "#3a87d7";
  ctx.stroke();

  // Shimmer stripes (animated)
  const t = ms / 1000;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = Math.max(1, edgeW * 0.6);
  ctx.strokeStyle = "#bfe6ff";
  for (let i = 0; i < 10; i++) {
    const yy = (i / 10) * h;
    const cx = riverCenterX(yy, w, h);
    const wob = Math.sin(t * 2 + i) * 6;
    ctx.beginPath();
    ctx.moveTo(cx - riverW * 0.18 + wob, yy);
    ctx.lineTo(cx + riverW * 0.18 + wob, yy + 6);
    ctx.stroke();
  }

  ctx.restore();
}

// -------------------- renderer --------------------
export function createProceduralCityRenderer({ canvas, getState }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D ctx missing");

  // DPR cap (keeps it crisp)
  const DPR_CAP = 1.25;
  const getDPR = () => Math.min(DPR_CAP, window.devicePixelRatio || 1);

  // 16-bit pixel mode
  let pixelSize = 3;     // 3 feels SNES-ish; 4 chunkier
  let pixelMode = true;

  // Low-res pixel buffer
  const pix = document.createElement("canvas");
  const pixCtx = pix.getContext("2d");
  if (!pixCtx) throw new Error("pix ctx missing");

  // Tile state
  const TILE = 16;
  let tiles = null; // { imgs, ids }
  let tileBasePath = "./assets/kenney_tiny-town/Tiles";

  // cached sizes
  let cssW = 0, cssH = 0, dpr = getDPR();

  // map
  let mapW = 0, mapH = 0;
  let cols = 0, rows = 0;
  let baseGrass = null;   // Uint16Array tileId per cell
  let dirtMask = null;    // 0/1 for plot pads
  let roadSet = new Set();// "x,y"

  // dev hooks
  window.setPixelSize = (n) => { pixelSize = clamp(n|0, 2, 8); console.log("pixelSize =", pixelSize); };
  window.togglePixelMode = () => { pixelMode = !pixelMode; console.log("pixelMode =", pixelMode); };
  window.setTilePath = (p) => { tileBasePath = p; console.log("tileBasePath =", tileBasePath, "(reload page to apply)"); };

  function resizeToCss() {
    const r = canvas.getBoundingClientRect();
    const newCssW = Math.max(1, Math.floor(r.width));
    const newCssH = Math.max(1, Math.floor(r.height));
    const newDpr = getDPR();

    const changed = (newCssW !== cssW) || (newCssH !== cssH) || (newDpr !== dpr);
    if (!changed) return false;

    cssW = newCssW; cssH = newCssH; dpr = newDpr;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // pixel buffer (low-res)
    let pw = Math.max(1, Math.floor(cssW / pixelSize));
    let ph = Math.max(1, Math.floor(cssH / pixelSize));

    // snap to 16px tile grid
    pw = Math.max(TILE, Math.floor(pw / TILE) * TILE);
    ph = Math.max(TILE, Math.floor(ph / TILE) * TILE);

    pix.width = pw;
    pix.height = ph;

    ctx.imageSmoothingEnabled = false;
    pixCtx.imageSmoothingEnabled = false;

    mapW = pw; mapH = ph;
    cols = Math.floor(mapW / TILE);
    rows = Math.floor(mapH / TILE);

    rebuildMap();

    return true;
  }

  function rebuildMap() {
    if (!tiles) return;

    baseGrass = new Uint16Array(cols * rows);
    dirtMask  = new Uint8Array(cols * rows);
    roadSet   = new Set();

    // 1) grass base
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = rand01(x * 733 + y * 1999);
        const gIds = tiles.ids.GRASS;
        const pick = r < 0.70 ? gIds[0] : r < 0.88 ? gIds[1] : gIds[2];
        baseGrass[y * cols + x] = pick;
      }
    }

    // 2) square dirt pads for buildable plots
    const padHalf = 3; // half-size in tiles (square will be (2*padHalf+1)^2)
    for (const p of plots.filter(isBuildablePlot)) {
      const { cx, cy } = plotToPx(p, mapW, mapH);
      const { tx, ty } = toTileCoord(cx, cy);

      for (let yy = ty - padHalf; yy <= ty + padHalf; yy++) {
        for (let xx = tx - padHalf; xx <= tx + padHalf; xx++) {
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          dirtMask[yy * cols + xx] = 1;
        }
      }
    }

    // 3) roads between buildable plots (simple “hub-ish” connectivity)
    const buildables = plots.filter(isBuildablePlot);
    if (buildables.length >= 2) {
      // pick a center-ish plot as hub (closest to average)
      let ax = 0, ay = 0;
      for (const p of buildables) { ax += p.x; ay += p.y; }
      ax /= buildables.length; ay /= buildables.length;

      let hub = buildables[0];
      let best = 1e9;
      for (const p of buildables) {
        const d = (p.x - ax) ** 2 + (p.y - ay) ** 2;
        if (d < best) { best = d; hub = p; }
      }

      const hubPx = plotToPx(hub, mapW, mapH);
      const hubT  = toTileCoord(hubPx.cx, hubPx.cy);

      for (const p of buildables) {
        if (p === hub) continue;
        const pp = plotToPx(p, mapW, mapH);
        const pt = toTileCoord(pp.cx, pp.cy);

        const line = bresenhamLine(hubT, pt);
        for (const q of line) roadSet.add(`${q.tx},${q.ty}`);
      }

      // thicken roads slightly (2-tile width vibe)
      const extra = new Set();
      for (const key of roadSet) {
        const [x, y] = key.split(",").map(Number);
        extra.add(`${x + 1},${y}`);
        extra.add(`${x},${y + 1}`);
      }
      for (const k of extra) roadSet.add(k);
    }
  }

  function drawMap(ms) {
    const W = mapW, H = mapH;
    pixCtx.clearRect(0, 0, W, H);

    // draw grass + dirt pads (tile fill)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;

        // base grass
        const grassId = baseGrass[idx];
        drawTile(pixCtx, tiles.imgs[grassId], x * TILE, y * TILE, 0);

        // optional subtle stone patches on grass
        if (!dirtMask[idx] && rand01(idx * 77) < 0.02) {
          pixCtx.globalAlpha = 0.35;
          drawTile(pixCtx, tiles.imgs[tiles.ids.STONE_PATCH], x * TILE, y * TILE, 0);
          pixCtx.globalAlpha = 1;
        }

        // dirt pad
        if (dirtMask[idx]) {
          drawTile(pixCtx, tiles.imgs[tiles.ids.DIRT], x * TILE, y * TILE, 0);
        }
      }
    }

    // draw roads (tile pieces based on neighbors)
    // (roads overwrite grass/dirt visually — works fine)
    for (const key of roadSet) {
      const [tx, ty] = key.split(",").map(Number);
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;

      const m = neighborsMask(roadSet, tx, ty);
      const info = roadTypeFromMask(m);
      if (!info) continue;

      const px = tx * TILE;
      const py = ty * TILE;

      if (info.kind === "cross") {
        drawTile(pixCtx, tiles.imgs[tiles.ids.PATH_CROSS], px, py, 0);
      } else if (info.kind === "straight") {
        drawTile(pixCtx, tiles.imgs[tiles.ids.PATH_STRAIGHT], px, py, info.rot);
      } else if (info.kind === "corner") {
        drawTile(pixCtx, tiles.imgs[tiles.ids.PATH_CORNER], px, py, info.rot);
      }
    }

    // draw river on top (pixel-art procedural)
    drawRiverPixel(pixCtx, ms, W, H);

    // simple “selection highlight” square (optional)
    const selId = getState?.().selectedPlot;
    if (selId) {
      const p = plots.find(x => x.id === selId);
      if (p) {
        const { cx, cy } = plotToPx(p, W, H);
        const { tx, ty } = toTileCoord(cx, cy);
        pixCtx.save();
        pixCtx.globalAlpha = 0.9;
        pixCtx.strokeStyle = "#ffffff";
        pixCtx.lineWidth = 2;
        pixCtx.strokeRect((tx - 3) * TILE + 1, (ty - 3) * TILE + 1, 7 * TILE - 2, 7 * TILE - 2);
        pixCtx.restore();
      }
    }
  }

  // -------------------- loop --------------------
  let raf = 0, running = false;

  function frame(ms) {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    // resize if needed (or if pixelSize changed)
    resizeToCss();

    // draw into pix buffer
    drawMap(ms);

    // present to real canvas
    ctx.clearRect(0, 0, cssW, cssH);
    if (pixelMode) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pix, 0, 0, cssW, cssH);
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pix, 0, 0, cssW, cssH);
    }
  }

  // -------------------- start/stop --------------------
  return {
    start() {
      if (running) return;

      // preload tiles once
      if (!tiles) {
        // draw a quick “loading” frame
        resizeToCss();
        pixCtx.fillStyle = "#113015";
        pixCtx.fillRect(0, 0, pix.width, pix.height);
        pixCtx.fillStyle = "#ffffff";
        pixCtx.font = "12px ui-sans-serif, system-ui";
        pixCtx.fillText("Loading tiles...", 8, 16);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pix, 0, 0, cssW, cssH);

        loadTiles(tileBasePath)
          .then((t) => {
            tiles = t;
            rebuildMap();
            running = true;
            raf = requestAnimationFrame(frame);
          })
          .catch((err) => {
            console.error("Tile load failed:", err);
          });

        return;
      }

      running = true;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    }
  };
}
