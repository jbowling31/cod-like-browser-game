// js/cityScene.js — Canvas base renderer w/ pixel-perfect pan/zoom + plot picking

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function createCityScene(canvas, { baseMapSrc }) {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  ctx.imageSmoothingEnabled = false;

  let buildingsSystem = null;
  let onPlotClick = null;

  let baseImg = null;
  let baseW = 512,
    baseH = 512;

  const cam = {
    x: baseW / 2,
    y: baseH / 2,
    zoom: 2,
    minZoom: 1,
    maxZoom: 6,
  };

  const state = {
    plots: [],
    selectedPlotId: null,
    buildings: { townhall: null },
  };

  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
  }

  function worldToScreen(wx, wy) {
    const cx = canvas.width / 2,
      cy = canvas.height / 2;
    return { x: (wx - cam.x) * cam.zoom + cx, y: (wy - cam.y) * cam.zoom + cy };
  }

  function screenToWorld(sx, sy) {
    const cx = canvas.width / 2,
      cy = canvas.height / 2;
    return { x: (sx - cx) / cam.zoom + cam.x, y: (sy - cy) / cam.zoom + cam.y };
  }

  function clampCameraToMap() {
    const viewW = canvas.width / cam.zoom;
    const viewH = canvas.height / cam.zoom;

    if (viewW >= baseW) cam.x = baseW / 2;
    else {
      const half = viewW / 2;
      cam.x = clamp(cam.x, half, baseW - half);
    }

    if (viewH >= baseH) cam.y = baseH / 2;
    else {
      const half = viewH / 2;
      cam.y = clamp(cam.y, half, baseH - half);
    }
  }

  function computeMinZoomToFit() {
    const zX = canvas.width / baseW;
    const zY = canvas.height / baseH;
    return Math.max(zX, zY);
  }

  function zoomAt(delta, sx, sy) {
    const before = screenToWorld(sx, sy);

    cam.minZoom = computeMinZoomToFit();
    cam.zoom = clamp(cam.zoom * delta, cam.minZoom, cam.maxZoom);

    const after = screenToWorld(sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;

    clampCameraToMap();
  }

  function eventToScreenXY(e) {
    const rect = canvas.getBoundingClientRect();
    const sxScale = canvas.width / rect.width;
    const syScale = canvas.height / rect.height;

    const clientX =
      (e.touches && e.touches[0]?.clientX) ??
      (e.changedTouches && e.changedTouches[0]?.clientX) ??
      e.clientX;
    const clientY =
      (e.touches && e.touches[0]?.clientY) ??
      (e.changedTouches && e.changedTouches[0]?.clientY) ??
      e.clientY;

    return {
      x: (clientX - rect.left) * sxScale,
      y: (clientY - rect.top) * syScale,
    };
  }

  // Plot picking + selection
  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  function pickPlot(wx, wy) {
    for (let i = state.plots.length - 1; i >= 0; i--) {
      const p = state.plots[i];
      if (pointInRect(wx, wy, p)) return p;
    }
    return null;
  }

  function firePlotPickAtScreen(sx, sy) {
    const w = screenToWorld(sx, sy);
    const hit = pickPlot(w.x, w.y);

    state.selectedPlotId = hit ? hit.id : null;

    if (hit && typeof onPlotClick === "function") {
      const anchorW = { x: hit.x + hit.w / 2, y: hit.y + hit.h };
      const anchorS = worldToScreen(anchorW.x, anchorW.y);
      onPlotClick(hit, sx, sy, anchorW, anchorS);
    }
  }

  // -------------------------
  // Mouse pan/zoom (desktop)
  // -------------------------
  let isPanning = false;
  let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
  let downPos = null;

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = eventToScreenXY(e);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(factor, p.x, p.y);
    },
    { passive: false }
  );

  canvas.addEventListener("mousedown", (e) => {
    isPanning = true;
    const p = eventToScreenXY(e);
    downPos = { x: p.x, y: p.y };
    panStart = { x: p.x, y: p.y, camX: cam.x, camY: cam.y };
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    const p = eventToScreenXY(e);
    cam.x = panStart.camX - (p.x - panStart.x) / cam.zoom;
    cam.y = panStart.camY - (p.y - panStart.y) / cam.zoom;
    clampCameraToMap();
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
  });

  // Keep click for desktop (works fine there)
  canvas.addEventListener("click", (e) => {
    const p = eventToScreenXY(e);
    firePlotPickAtScreen(p.x, p.y);
  });

  // -------------------------
  // Touch pan/pinch + TAP (iOS-safe)
  // -------------------------
  let touchMode = null;
  let pinch = { startDist: 0, startZoom: 1, mid: { x: 0, y: 0 } };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function getTouches(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return Array.from(e.touches).map((t) => ({
      x: (t.clientX - rect.left) * sx,
      y: (t.clientY - rect.top) * sy,
    }));
  }

  // Tap detection: treat a 1-finger gesture as tap if it didn't move much
  const TAP_MOVE_PX = 10; // in canvas pixels (DPR-scaled), forgiving for mobile
  let tapCandidate = false;
  let tapStart = { x: 0, y: 0 };
  let tapMoved = false;

  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const ts = getTouches(e);

      if (ts.length === 1) {
        touchMode = "pan";
        panStart = { x: ts[0].x, y: ts[0].y, camX: cam.x, camY: cam.y };

        tapCandidate = true;
        tapMoved = false;
        tapStart = { x: ts[0].x, y: ts[0].y };
      } else if (ts.length >= 2) {
        touchMode = "pinch";
        tapCandidate = false;

        pinch.startDist = dist(ts[0], ts[1]);
        pinch.startZoom = cam.zoom;
        pinch.mid = mid(ts[0], ts[1]);
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      const ts = getTouches(e);

      if (touchMode === "pan" && ts.length === 1) {
        cam.x = panStart.camX - (ts[0].x - panStart.x) / cam.zoom;
        cam.y = panStart.camY - (ts[0].y - panStart.y) / cam.zoom;
        clampCameraToMap();

        if (tapCandidate && !tapMoved) {
          if (Math.hypot(ts[0].x - tapStart.x, ts[0].y - tapStart.y) > TAP_MOVE_PX) {
            tapMoved = true;
          }
        }
      } else if (touchMode === "pinch" && ts.length >= 2 && pinch.startDist) {
        const d = dist(ts[0], ts[1]);
        const scale = d / pinch.startDist;

        const before = screenToWorld(pinch.mid.x, pinch.mid.y);

        cam.minZoom = computeMinZoomToFit();
        cam.zoom = clamp(pinch.startZoom * scale, cam.minZoom, cam.maxZoom);

        const after = screenToWorld(pinch.mid.x, pinch.mid.y);
        cam.x += before.x - after.x;
        cam.y += before.y - after.y;

        clampCameraToMap();
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();

      // If a single-finger gesture ended and it didn't move, treat as TAP
      if (tapCandidate && !tapMoved && touchMode === "pan") {
        // Use changedTouches (the finger that lifted)
        const p = eventToScreenXY(e);
        firePlotPickAtScreen(p.x, p.y);
      }

      const ts = getTouches(e);
      if (ts.length === 0) {
        touchMode = null;
        tapCandidate = false;
      } else if (ts.length === 1) {
        touchMode = "pan";
        panStart = { x: ts[0].x, y: ts[0].y, camX: cam.x, camY: cam.y };

        // If user lifted one finger from a multi-touch gesture, don't treat next as tap automatically
        tapCandidate = false;
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchcancel",
    (e) => {
      e.preventDefault();
      touchMode = null;
      tapCandidate = false;
    },
    { passive: false }
  );

  async function init() {
    resizeCanvas();
    baseImg = await loadImage(baseMapSrc);
    baseW = baseImg.width;
    baseH = baseImg.height;

    cam.x = baseW / 2;
    cam.y = baseH / 2;

    cam.minZoom = computeMinZoomToFit();
    cam.zoom = Math.max(cam.zoom, cam.minZoom);

    clampCameraToMap();
  }
  init().catch((err) => console.error("City init failed:", err));

  function drawBase() {
    const cx = canvas.width / 2,
      cy = canvas.height / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0f1220";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cx - cam.x * cam.zoom, cy - cam.y * cam.zoom);
    ctx.imageSmoothingEnabled = false;

    if (baseImg) ctx.drawImage(baseImg, 0, 0);
  }

  function drawPlacedBuildings() {
    if (!buildingsSystem) return;
    const placed = buildingsSystem.getAllPlaced();
    if (!placed.length) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cx - cam.x * cam.zoom, cy - cam.y * cam.zoom);
    ctx.imageSmoothingEnabled = false;

    for (const b of placed) {
      const plot = state.plots.find((p) => p.id === b.plotId);
      if (!plot) continue;

      const ax = plot.x + plot.w / 2;
      const ay = plot.y + plot.h;

      ctx.drawImage(b.img, Math.round(ax - b.w / 2), Math.round(ay - b.h), b.w, b.h);
    }
  }

  function drawPlotsOverlay() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    for (const p of state.plots) {
      const a = worldToScreen(p.x, p.y);
      const b = worldToScreen(p.x + p.w, p.y + p.h);

      const x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x),
        h = Math.abs(b.y - a.y);

      const sel = p.id === state.selectedPlotId;
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = sel ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)";
      ctx.strokeRect(x, y, w, h);

      if (sel) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  return {
    setPlots(plots) {
      state.plots = plots;
    },

    setBuildingsSystem(sys) {
      buildingsSystem = sys;
    },
    setOnPlotClick(fn) {
      onPlotClick = fn;
    },

    update() {
      resizeCanvas();
      cam.minZoom = computeMinZoomToFit();
      clampCameraToMap();
    },

    render() {
      drawBase();
      drawPlacedBuildings();
      drawPlotsOverlay();
    },

    worldToScreen,
    getMapWidth() {
      return baseW;
    },
    getMapHeight() {
      return baseH;
    },
    getCamera() {
      return { ...cam };
    },
  };
}
