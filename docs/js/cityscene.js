// js/cityScene.js — Canvas base renderer w/ pixel-perfect pan/zoom + plot picking

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function loadImage(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let buildingsSystem = null;
let onPlotClick = null;

function setBuildingsSystem(sys) { buildingsSystem = sys; }
function setOnPlotClick(fn) { onPlotClick = fn; }

function drawPlacedBuildings() {
  if (!buildingsSystem) return;
  const placed = buildingsSystem.getAllPlaced();
  if (!placed.length) return;

  // world transform (same as base map)
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cx - cam.x * cam.zoom, cy - cam.y * cam.zoom);
  ctx.imageSmoothingEnabled = false;

  for (const b of placed) {
    const plot = state.plots.find(p => p.id === b.plotId);
    if (!plot) continue;

    const ax = plot.x + plot.w / 2;
    const ay = plot.y + plot.h;

    ctx.drawImage(b.img, Math.round(ax - b.w/2), Math.round(ay - b.h), b.w, b.h);
  }
}


export function createCityScene(canvas, { baseMapSrc }) {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  ctx.imageSmoothingEnabled = false;

    let buildingsSystem = null;
    let onPlotClick = null;

    function setBuildingsSystem(sys){ buildingsSystem = sys; }
    function setOnPlotClick(fn){ onPlotClick = fn; }

  let baseImg = null;
  let baseW = 512, baseH = 512;

  const cam = {
    x: baseW/2,
    y: baseH/2,
    zoom: 2,
    minZoom: 1,
    maxZoom: 6
  };

  const state = {
    plots: [],
    selectedPlotId: null,
    buildings: { townhall: null }
  };

  function resizeCanvas(){
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.imageSmoothingEnabled = false;
    }
  }

  function worldToScreen(wx, wy){
    const cx = canvas.width/2, cy = canvas.height/2;
    return { x:(wx-cam.x)*cam.zoom+cx, y:(wy-cam.y)*cam.zoom+cy };
  }

  function screenToWorld(sx, sy){
    const cx = canvas.width/2, cy = canvas.height/2;
    return { x:(sx-cx)/cam.zoom+cam.x, y:(sy-cy)/cam.zoom+cam.y };
  }

  function clampCamera(){
    const pad = 40;
    cam.x = clamp(cam.x, -pad, baseW + pad);
    cam.y = clamp(cam.y, -pad, baseH + pad);
  }

  function zoomAt(delta, sx, sy){
    const before = screenToWorld(sx, sy);
    cam.zoom = clamp(cam.zoom * delta, cam.minZoom, cam.maxZoom);
    const after = screenToWorld(sx, sy);
    cam.x += (before.x - after.x);
    cam.y += (before.y - after.y);
    clampCamera();
  }

  // Mouse pan/zoom
  let isPanning = false;
  let panStart = { x:0, y:0, camX:0, camY:0 };

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    zoomAt(factor, sx, sy);
  }, { passive:false });

  canvas.addEventListener("mousedown", (e) => {
    isPanning = true;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    panStart = { x:sx, y:sy, camX:cam.x, camY:cam.y };
  });
let downPos = null;

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    cam.x = panStart.camX - (sx - panStart.x) / cam.zoom;
    cam.y = panStart.camY - (sy - panStart.y) / cam.zoom;
    clampCamera();
  });

  window.addEventListener("mouseup", () => { isPanning = false; });
if (downPos) {
  const dx = Math.abs((panStart.x ?? downPos.x) - downPos.x);
  const dy = Math.abs((panStart.y ?? downPos.y) - downPos.y);
}
downPos = null;

  // Touch pan/pinch
  let touchMode = null;
  let pinch = { startDist:0, startZoom:1, mid:{x:0,y:0} };

  function getTouches(e){
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return Array.from(e.touches).map(t => ({
      x:(t.clientX-rect.left)*sx,
      y:(t.clientY-rect.top)*sy
    }));
  }
  const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
  const mid  = (a,b)=>({ x:(a.x+b.x)/2, y:(a.y+b.y)/2 });

  canvas.addEventListener("touchstart", (e)=>{
    e.preventDefault();
    const ts = getTouches(e);
    if (ts.length === 1) {
      touchMode = "pan";
      panStart = { x:ts[0].x, y:ts[0].y, camX:cam.x, camY:cam.y };
    } else if (ts.length >= 2) {
      touchMode = "pinch";
      pinch.startDist = dist(ts[0], ts[1]);
      pinch.startZoom = cam.zoom;
      pinch.mid = mid(ts[0], ts[1]);
    }
  }, { passive:false });

  canvas.addEventListener("touchmove", (e)=>{
    e.preventDefault();
    const ts = getTouches(e);
    if (touchMode === "pan" && ts.length === 1) {
      cam.x = panStart.camX - (ts[0].x - panStart.x) / cam.zoom;
      cam.y = panStart.camY - (ts[0].y - panStart.y) / cam.zoom;
      clampCamera();
    } else if (touchMode === "pinch" && ts.length >= 2 && pinch.startDist) {
      const d = dist(ts[0], ts[1]);
      const scale = d / pinch.startDist;
      const before = screenToWorld(pinch.mid.x, pinch.mid.y);
      cam.zoom = clamp(pinch.startZoom * scale, cam.minZoom, cam.maxZoom);
      const after = screenToWorld(pinch.mid.x, pinch.mid.y);
      cam.x += (before.x - after.x);
      cam.y += (before.y - after.y);
      clampCamera();
    }
  }, { passive:false });

  canvas.addEventListener("touchend", (e)=>{
    e.preventDefault();
    const ts = getTouches(e);
    if (ts.length === 0) touchMode = null;
    if (ts.length === 1) {
      touchMode = "pan";
      panStart = { x:ts[0].x, y:ts[0].y, camX:cam.x, camY:cam.y };
    }
  }, { passive:false });

  // Plot picking + selection
  function pointInRect(px, py, r){
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }
  function pickPlot(wx, wy){
    for (let i = state.plots.length - 1; i >= 0; i--) {
      const p = state.plots[i];
      if (pointInRect(wx, wy, p)) return p;
    }
    return null;
  }

  canvas.addEventListener("click", (e)=>{
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const w = screenToWorld(sx, sy);
    const hit = pickPlot(w.x, w.y);
    state.selectedPlotId = hit ? hit.id : null;
    if (hit && typeof onPlotClick === "function") onPlotClick(hit);

  });

  async function init(){
    resizeCanvas();
    baseImg = await loadImage(baseMapSrc);
    baseW = baseImg.width; baseH = baseImg.height;
    cam.x = baseW/2; cam.y = baseH/2;
    clampCamera();
  }
  init().catch(err => console.error("City init failed:", err));

  function drawBase(){
    const cx = canvas.width/2, cy = canvas.height/2;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = "#0f1220";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cx - cam.x*cam.zoom, cy - cam.y*cam.zoom);
    ctx.imageSmoothingEnabled = false;

    if (baseImg) ctx.drawImage(baseImg, 0, 0);
  }

  function drawTownhall(){
    const th = state.buildings.townhall;
    if (!th || !th.img) return;
    const plot = state.plots.find(p => p.id === "townhall");
    if (!plot) return;

    const ax = plot.x + plot.w/2;
    const ay = plot.y + plot.h; // bottom of plot

    const cx = canvas.width/2, cy = canvas.height/2;
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cx - cam.x*cam.zoom, cy - cam.y*cam.zoom);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(th.img, Math.round(ax - th.w/2), Math.round(ay - th.h), th.w, th.h);
  }

  function drawPlacedBuildings() {
  if (!buildingsSystem) return;
  const placed = buildingsSystem.getAllPlaced();
  if (!placed.length) return;

  // draw in WORLD SPACE (same transform as base map)
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cx - cam.x * cam.zoom, cy - cam.y * cam.zoom);
  ctx.imageSmoothingEnabled = false;

  for (const b of placed) {
    const plot = state.plots.find(p => p.id === b.plotId);
    if (!plot) continue;

    // bottom-center anchor on plot
    const ax = plot.x + plot.w / 2;
    const ay = plot.y + plot.h;

    ctx.drawImage(
      b.img,
      Math.round(ax - b.w / 2),
      Math.round(ay - b.h),
      b.w,
      b.h
    );
  }
}


  function drawPlotsOverlay(){
    ctx.setTransform(1,0,0,1,0,0);

    for (const p of state.plots) {
      const a = worldToScreen(p.x, p.y);
      const b = worldToScreen(p.x+p.w, p.y+p.h);

      const x = Math.min(a.x,b.x), y = Math.min(a.y,b.y);
      const w = Math.abs(b.x-a.x), h = Math.abs(b.y-a.y);

      const sel = p.id === state.selectedPlotId;
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = sel ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)";
      ctx.strokeRect(x,y,w,h);

      if (sel) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x,y,w,h);
      }
    }

    
  }

return {
  setPlots(plots){ state.plots = plots; },

  // NEW: plug-in systems
  setBuildingsSystem(sys){ buildingsSystem = sys; },
  setOnPlotClick(fn){ onPlotClick = fn; },

  // Keep this if you still want the old townhall test method (optional)
  async setTownhallSprite(src, w, h){
    const img = await loadImage(src);
    state.buildings.townhall = { img, w, h };
  },

  update(){ resizeCanvas(); },

  render(){
    drawBase();

    // NEW: draw any placed buildings from the buildings system
    drawPlacedBuildings();

    // Optional: if you still use the old single-townhall method, keep it
    // drawTownhall();

    drawPlotsOverlay();
  }
};
}
