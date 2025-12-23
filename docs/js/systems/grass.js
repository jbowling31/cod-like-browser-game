// docs/js/systems/grass.js
// FAST cached-chunk grass renderer.
// - Builds each chunk once into an offscreen canvas.
// - Per-frame is just drawImage() per visible chunk.
// - Adds simple "clumping" by skipping blades based on deterministic noise.
// - No per-blade gradients / quadratic curves per frame.

export class GrassLayer {
  constructor(opts = {}) {
    this.seed = Number.isFinite(opts.seed) ? (opts.seed | 0) : 1337;
    this.chunkSize = Math.max(32, (opts.chunkSize | 0) || 96);

    this.density = Math.max(0, (opts.density | 0) || 220);
    this.minBlade = Math.max(2, (opts.minBlade | 0) || 6);
    this.maxBlade = Math.max(this.minBlade, (opts.maxBlade | 0) || 14);

    // kept for API compatibility (not used in cached mode)
    this.swayAmp = Number.isFinite(opts.swayAmp) ? opts.swayAmp : 0;
    this.swayFreq = Number.isFinite(opts.swayFreq) ? opts.swayFreq : 0.8;

    this.colorA = opts.colorA || "#2f7b2a";
    this.colorB = opts.colorB || "#1e5b1b";

    this.satJitter = Math.min(0.45, Math.max(0, opts.satJitter ?? 0.18));
    this.valueJitter = Math.min(0.45, Math.max(0, opts.valueJitter ?? 0.12));

    this.lineWidth = Math.max(1, (opts.lineWidth | 0) || 1);
    this.maxDrawDistance = Math.max(this.chunkSize * 2, opts.maxDrawDistance || 1400);
    this.debug = !!opts.debug;

    // clumping controls
    // Higher clumpSkip -> fewer blades drawn (more gaps). 0..0.6 typical.
    this.clumpSkip = Math.min(0.75, Math.max(0, opts.clumpSkip ?? 0.25));
    // Clump variation inside chunk (0..1). Higher = more patchy.
    this.clumpVar = Math.min(1, Math.max(0, opts.clumpVar ?? 0.45));

    this.time = 0;
    this.visible = true;

    // chunks: key -> { cx, cy, wx, wy, canvas, bladesCount, _mark }
    this.chunks = new Map();
    this._scratch = { camera: null, viewport: null };
    this._lastStats = { chunks: 0, blades: 0 };
  }

  setDensity(n) { this.density = Math.max(0, n | 0); this.clear(); }
  setSeed(s) { this.seed = s | 0; this.clear(); }
  setClumpSkip(v) { this.clumpSkip = Math.min(0.75, Math.max(0, +v || 0)); this.clear(); }
  clear() { this.chunks.clear(); }

  update(dt, camera, viewport) {
    this.time += Math.max(0, dt || 0);
    this._scratch.camera = camera;
    this._scratch.viewport = viewport;
    this._ensureChunks();
  }

  draw(ctx, camera, viewport) {
    if (!this.visible || !ctx) return;

    const cam = camera ?? this._scratch.camera;
    const vp  = viewport ?? this._scratch.viewport;
    if (!cam || !vp) return;

    const halfW = vp.width * 0.5;
    const halfH = vp.height * 0.5;

    const maxD2 = this.maxDrawDistance * this.maxDrawDistance;

    let approxBlades = 0;

    ctx.save();
    ctx.imageSmoothingEnabled = true;

    if (this.debug) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "#00aaff";
      for (const [, chunk] of this.chunks) {
        const x = (chunk.wx - cam.x) * cam.zoom + halfW;
        const y = (chunk.wy - cam.y) * cam.zoom + halfH;
        const s = this.chunkSize * cam.zoom;
        ctx.strokeRect(x, y, s, s);
      }
      ctx.restore();
    }

    for (const [, chunk] of this.chunks) {
      const cxWorld = chunk.wx + this.chunkSize * 0.5;
      const cyWorld = chunk.wy + this.chunkSize * 0.5;

      const sx = (cxWorld - cam.x) * cam.zoom + halfW;
      const sy = (cyWorld - cam.y) * cam.zoom + halfH;

      const dx = sx - halfW;
      const dy = sy - halfH;
      if ((dx * dx + dy * dy) > maxD2) continue;

      const x0 = (chunk.wx - cam.x) * cam.zoom + halfW;
      const y0 = (chunk.wy - cam.y) * cam.zoom + halfH;
      const s  = this.chunkSize * cam.zoom;

      ctx.drawImage(chunk.canvas, x0, y0, s, s);
      approxBlades += chunk.bladesCount;
    }

    ctx.restore();

    this._lastStats = { chunks: this.chunks.size, blades: approxBlades };
  }

  stats() { return this._lastStats; }

  _ensureChunks() {
    const cam = this._scratch.camera;
    const vp  = this._scratch.viewport;
    if (!cam || !vp) return;

    const padPx = 96;

    const tlx = (-padPx - vp.width * 0.5) / cam.zoom + cam.x;
    const tly = (-padPx - vp.height * 0.5) / cam.zoom + cam.y;
    const brx = (vp.width + padPx - vp.width * 0.5) / cam.zoom + cam.x;
    const bry = (vp.height + padPx - vp.height * 0.5) / cam.zoom + cam.y;

    const cxs = Math.floor(tlx / this.chunkSize);
    const cxe = Math.floor(brx / this.chunkSize);
    const cys = Math.floor(tly / this.chunkSize);
    const cye = Math.floor(bry / this.chunkSize);

    for (const k of this.chunks.keys()) this.chunks.get(k)._mark = false;

    for (let cy = cys; cy <= cye; cy++) {
      for (let cx = cxs; cx <= cxe; cx++) {
        const key = `${cx},${cy}`;
        let ch = this.chunks.get(key);
        if (!ch) {
          ch = this._buildChunk(cx, cy);
          this.chunks.set(key, ch);
        }
        ch._mark = true;
      }
    }

    for (const [k, ch] of this.chunks) {
      if (!ch._mark) this.chunks.delete(k);
    }
  }

  _buildChunk(cx, cy) {
    const wx = cx * this.chunkSize;
    const wy = cy * this.chunkSize;

    const c = document.createElement("canvas");
    c.width = this.chunkSize;
    c.height = this.chunkSize;
    const g = c.getContext("2d");

    g.save();
    g.lineCap = "round";
    g.lineWidth = this.lineWidth;

    const baseA = this._hsl(this.colorA);
    const baseB = this._hsl(this.colorB);

    // Chunk-level clump bias: makes some chunks more/less dense (natural variation)
    const chunkBias = (this._randN(cx, cy, 9999) - 0.5) * 2 * this.clumpVar; // -var..+var
    const skipBase = this.clumpSkip + chunkBias; // varies per chunk

    let drawn = 0;

    for (let i = 0; i < this.density; i++) {
      const r1 = this._randN(cx, cy, i * 3 + 0);
      const r2 = this._randN(cx, cy, i * 3 + 1);
      const r3 = this._randN(cx, cy, i * 3 + 2);
      const r4 = this._randN(cx, cy, i * 7 + 5);
      const r5 = this._randN(cx, cy, i * 11 + 9);

      // clumping: skip some blades deterministically
      // skip threshold varies per chunk
      const skipThresh = Math.max(0, Math.min(0.75, skipBase));
      if (r5 < skipThresh) continue;

      const x = r1 * this.chunkSize;
      const y = r2 * this.chunkSize;

      const h = this.minBlade + (this.maxBlade - this.minBlade) * r3;
      const side = r4 > 0.66;

      const jitterS = (r1 - 0.5) * 2 * this.satJitter;
      const jitterV = (r2 - 0.5) * 2 * this.valueJitter;

      const c0 = this._toCss(this._clampHsl([baseA[0], baseA[1] + jitterS, baseA[2] + jitterV]));
      const c1 = this._toCss(this._clampHsl([baseB[0], baseB[1] + jitterS * 0.5, baseB[2] + jitterV * 0.5]));

      // simple 2-segment blade (cheap, still blade-like)
      const lean = (r1 - 0.5) * 1.2; // px lean at tip
      const midx = x + lean * 0.45;
      const midy = y - h * 0.55;
      const tipx = x + lean;
      const tipy = y - h;

      g.strokeStyle = c0;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(midx, midy);
      g.stroke();

      g.strokeStyle = c1;
      g.beginPath();
      g.moveTo(midx, midy);
      g.lineTo(tipx, tipy);
      g.stroke();

      if (side) {
        const sx = x - lean * 0.35;
        const sy = y - h * 0.6;
        g.globalAlpha = 0.75;
        g.strokeStyle = c0;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(sx, sy);
        g.stroke();
        g.globalAlpha = 1;
      }

      drawn++;
    }

    g.restore();

    return { cx, cy, wx, wy, canvas: c, bladesCount: drawn, _mark: true };
  }

  _randN(cx, cy, i) {
    let h = (cx * 374761393) ^ (cy * 668265263) ^ (i * 1442695041) ^ (this.seed | 0);
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return (h >>> 0) / 4294967296;
  }

  _hsl(css) {
    if (css && css[0] === "#") {
      const r = parseInt(css.slice(1, 3), 16) / 255;
      const g = parseInt(css.slice(3, 5), 16) / 255;
      const b = parseInt(css.slice(5, 7), 16) / 255;
      return this._rgbToHsl(r, g, b);
    }
    return [120, 0.45, 0.40];
  }

  _clampHsl([h, s, l]) {
    return [((h % 360) + 360) % 360, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))];
  }
  _toCss([h, s, l]) {
    return `hsl(${h.toFixed(0)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
  }

  _rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = 0; s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return [h, s, l];
  }
}
