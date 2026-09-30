/* BONEYARD PART · 04 · WASH
 * technique   particle advection through a vector field: each drop steps along the downslope gradient of a real
 *             elevation grid plus a weak divergence-free curl noise, and leaves a decaying phosphor trail
 * lineage     vector-field particle advection and streakline plots in 1990s scientific visualization; the
 *             generative flow-field sketches that grew out of them
 * original    the field is the Santa Catalina Mountains (the same 768 x 768 grid RANGE flies), so Sabino, Bear,
 *             Ventana and Pima canyons draw themselves out of the front range in a few seconds; the pointer is a
 *             rain cloud; the trail buffer never fades by rewriting pixels (a growing deposit weight does the
 *             decay), so the twenty-second still is the same buffer the live bay keeps drawing into
 * not         hydrology: no flow accumulation, infiltration, channels, rainfall or discharge. It shows where water
 *             would run downhill on a 64 m surface, not where it does run
 * deps        none · Canvas 2D · 2026-09
 * budget      1.18 ms/tick in a 1440x900 workbench; 1.50 ms/tick at 390x844 touch emulation, 2,400 drops;
 *             one-second local Chromium CPU samples, 2026-09-30, normal CPU rate; excludes GPU, raster and hardware phones
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), rain(nx, ny), destroy() }
 * license     MIT, Desert Data Labs LLC · elevation: Mapzen terrain tiles; data from SRTM, NED, and others
 */
/* HOW IT WORKS
 * When the grid arrives it is smoothed once with a 3 x 3 box and differenced (central differences, metres per
 * metre) into a slope field. A drop moves opposite the slope, at a speed that grows with steepness up to a cap, plus
 * a small curl-noise drift (the curl of a sum of sines, so it neither piles drops up nor spreads them out) that
 * keeps the nearly flat basin from freezing. Drops live a few seconds and are reborn at random places in the view,
 * or under the pointer, which is the rain cloud.
 *
 * Trails live in a density grid the size of the elevation grid. Each step a drop adds weight equal to the distance
 * it moved (so a drop stalled in a pit does not glow) times a factor S that grows every frame; dividing by S when
 * drawing makes every older deposit fade exponentially without touching the buffer. On mount the model runs twenty
 * seconds at a fixed step with a seeded random source, so the still is already full of canyons and the live bay
 * continues from that exact state. Each frame maps the view window of the grid onto a buffer whose long side is 480 pixels: a
 * faint hillshade in the tube's line colour, plus phosphor where the density is.
 * Warm contour accents are derived from sampled elevation. A bounded set of bright moving heads follows the
 * actual drops, with short tails from each last step. The explicit rain() action seeds drops in a cloud, draws
 * its location immediately, and in Still advances a small deterministic batch without starting a ticker.
 */
(() => {
  'use strict';
  const PARAMS = {
    drops: 2400,         /* 1,500 to 3,000; Calm uses half */
    speed: 34,           /* top speed on steep ground, cells per second */
    steep: 0.22,         /* slope (m/m) at which a drop reaches top speed */
    curl: 0.06,          /* curl-noise drift as a fraction of top speed */
    life: 5,             /* mean lifetime, seconds */
    fade: 1.6,           /* trail half-life, seconds */
    glow: 0.35,          /* phosphor gain */
    shade: 1,            /* hillshade strength */
    cloud: 26,           /* rain-cloud radius, cells */
    stillSeconds: 20,
    buffer: 480,         /* long side of the internal buffer, pixels */
    contours: 0.3,       /* illustrative elevation accents behind the live slope flow */
    contourM: 180,
    heads: 0.8,          /* moving phosphor heads, distinct from the accumulated trail */
  };

  const MPP_X = 64.59248259040142, MPP_Y = 64.15933123256292;
  /* the view window: the front range and its canyons, in grid cells (row 0 = north) */
  const FOCUS = { col: 400, row: 392, span: 520 };

  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  function mount(canvas, params, ctx) {
    let P = Object.assign({}, PARAMS, params);
    const g = canvas.getContext('2d', { alpha: false });
    let buf = document.createElement('canvas'), bctx = buf.getContext('2d');   /* the low-res buffer, upscaled pixelated */
    let W = 768, H = 768, elev = null, gx = null, gy = null, shadeG = null, dens = null, ready = false, dead = false;
    let BW = 0, BH = 0, img = null, px = null, map = null, base = null, baseKey = '';
    let view = { x0: 0, y0: 0, cw: 1 };               /* grid cell at buffer pixel 0,0 and cells per pixel */
    let N = 0, pxs = null, pys = null, age = null, lifeA = null, sx0 = null, sy0 = null, prevX = null, prevY = null;
    let tone = null, toneKey = '';                  /* the tone LUT: density -> packed phosphor add, rebuilt when tokens change */
    let S = 1, simT = 0, rand = rng(1947), readAt = 0, wantStill = true, cloudFt = null;
    let rainCloud = null, cloudPulse = 0;

    function allocDrops(n) {
      N = n; pxs = new Float32Array(n); pys = new Float32Array(n); age = new Float32Array(n); lifeA = new Float32Array(n); sx0 = new Float32Array(n); sy0 = new Float32Array(n); prevX = new Float32Array(n); prevY = new Float32Array(n);
      for (let i = 0; i < n; i++) { spawn(i, null); age[i] = rand() * lifeA[i]; }
    }
    function spawn(i, at) {
      if (at) {
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * P.cloud;
        pxs[i] = at.x + Math.cos(a) * r; pys[i] = at.y + Math.sin(a) * r;
      } else {
        /* anywhere in the view window, with a margin so drops flow in from the edges too */
        const vw = BW * view.cw, vh = BH * view.cw;
        pxs[i] = view.x0 - vw * 0.08 + rand() * vw * 1.16; pys[i] = view.y0 - vh * 0.08 + rand() * vh * 1.16;
      }
      age[i] = 0; lifeA[i] = P.life * (0.4 + rand() * 1.2); sx0[i] = pxs[i]; sy0[i] = pys[i];
      prevX[i] = pxs[i]; prevY[i] = pys[i];
    }

    /* slope field from the smoothed grid, and a hillshade for the backdrop */
    function prepare() {
      const n = W * H, sm = new Float32Array(n);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; s += elev[yy * W + xx]; c++; } }
        sm[y * W + x] = s / c;
      }
      gx = new Float32Array(n); gy = new Float32Array(n); shadeG = new Float32Array(n);
      let lx = -0.62, ly = -0.55, lz = 0.56; const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;   /* light from the northwest, cartographic convention */
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const xe = Math.min(W - 1, x + 1), xw = Math.max(0, x - 1), ys = Math.min(H - 1, y + 1), yn = Math.max(0, y - 1);
        const sx = (sm[y * W + xe] - sm[y * W + xw]) / ((xe - xw) * MPP_X);
        const sy = (sm[ys * W + x] - sm[yn * W + x]) / ((ys - yn) * MPP_Y);
        gx[i] = sx; gy[i] = sy;
        /* normal of z = elev with +x east, +y south (row down): n = (-sx, -sy, 1) */
        const k = 2.2, nx = -sx * k, ny = -sy * k, nl = Math.hypot(nx, ny, 1);
        shadeG[i] = Math.max(0, (nx * lx + ny * ly + lz) / nl);
      }
      dens = new Float32Array(n);
    }

    /* bilinear slope at a fractional cell */
    function slopeAt(x, y, out) {
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * W + x0;
      const a = 1 - fx, b = 1 - fy;
      out[0] = (gx[i] * a + gx[i + 1] * fx) * b + (gx[i + W] * a + gx[i + W + 1] * fx) * fy;
      out[1] = (gy[i] * a + gy[i + 1] * fx) * b + (gy[i + W] * a + gy[i + W + 1] * fx) * fy;
    }
    const sl = new Float32Array(2);
    function advance(dt, count, cloud) {
      const vmax = P.speed, steep = P.steep, curl = P.curl * vmax, t = simT;
      const decay = Math.pow(0.5, dt / P.fade);
      S /= decay;
      if (S > 1e24) { const k = 1 / S; for (let i = 0; i < dens.length; i++) dens[i] *= k; S = 1; }
      for (let i = 0; i < count; i++) {
        let x = pxs[i], y = pys[i];
        prevX[i] = x; prevY[i] = y;
        age[i] += dt;
        /* reborn when old, off the grid, or stalled in a pit (a drop that has not left a 3-cell circle in a second and a half) */
        const stalled = age[i] > 1.5 && Math.abs(x - sx0[i]) + Math.abs(y - sy0[i]) < 3;
        if (stalled || age[i] > lifeA[i] || x < 1 || y < 1 || x >= W - 2 || y >= H - 2) { spawn(i, cloud && rand() < 0.3 ? cloud : null); continue; }
        slopeAt(x, y, sl);
        const m = Math.hypot(sl[0], sl[1]) + 1e-9, sp = vmax * Math.min(1, m / steep);
        /* curl of psi = sin(ax + t) cos(by - 0.7t) + 0.6 sin(c(x + y) + 1.3t): v = (dpsi/dy, -dpsi/dx) */
        const ax = 0.021 * x + 0.6 * t, by = 0.017 * y - 0.42 * t, cx = 0.037 * (x + y) + 0.78 * t;
        const dpx = 0.021 * Math.cos(ax) * Math.cos(by) + 0.6 * 0.037 * Math.cos(cx);
        const dpy = -0.017 * Math.sin(ax) * Math.sin(by) + 0.6 * 0.037 * Math.cos(cx);
        const vx = -sl[0] / m * sp + dpy * 30 * curl, vy = -sl[1] / m * sp - dpx * 30 * curl;
        const nx = x + vx * dt, ny = y + vy * dt;
        const d = Math.hypot(nx - x, ny - y);
        pxs[i] = nx; pys[i] = ny;
        /* deposit along the step: weight = distance moved, spread over the cells it crossed */
        const steps = d > 1 ? Math.ceil(d) : 1, w = (d / steps) * S;
        for (let s = 1; s <= steps; s++) {
          const qx = (x + (nx - x) * s / steps) | 0, qy = (y + (ny - y) * s / steps) | 0;
          if (qx >= 0 && qy >= 0 && qx < W && qy < H) dens[qy * W + qx] += w;
        }
      }
      simT += dt;
    }

    /* the view window for this aspect, and the per-pixel grid index table */
    function layout() {
      const aspect = BW / BH;
      let vw = FOCUS.span, vh = vw / aspect;
      if (vh > H * 0.96) { vh = H * 0.96; vw = vh * aspect; }
      if (aspect < 1) { vw = Math.max(300, Math.min(vw, 380)); vh = Math.min(H * 0.96, vw / aspect); vw = vh * aspect; }
      const x0 = clamp(FOCUS.col - vw / 2, 0, W - vw), y0 = clamp(FOCUS.row - vh / 2, 0, H - vh);
      view = { x0, y0, cw: vw / BW };
      map = new Int32Array(BW * BH);
      for (let y = 0; y < BH; y++) {
        const gyC = clamp((y0 + (y + 0.5) * view.cw) | 0, 0, H - 1);
        for (let x = 0; x < BW; x++) map[y * BW + x] = gyC * W + clamp((x0 + (x + 0.5) * view.cw) | 0, 0, W - 1);
      }
      baseKey = '';
    }
    /* the backdrop: the field lifted toward the line colour by the hillshade, more on high ground, so the basin
       stays dark and the range reads as relief; packed as one 32-bit word per pixel */
    let base32 = null, px32 = null;
    function backdrop() {
      const tok = ctx.tokens, key = BW + 'x' + BH + tok.field + tok.line + tok.phosphorDim + tok.amber + P.shade + P.contours + P.contourM + view.x0 + view.y0;
      if (key === baseKey) return;
      baseKey = key;
      const f = BONEYARD.toRgb(tok.field), l = BONEYARD.toRgb(tok.line), d = BONEYARD.toRgb(tok.phosphorDim), amber = BONEYARD.toRgb(tok.amber);
      const lo = 625, hi = 2791;
      base = new Uint8ClampedArray(BW * BH * 3); base32 = new Uint32Array(BW * BH);
      for (let p = 0; p < BW * BH; p++) {
        const i = map[p], h = shadeG[i], e = Math.sqrt(clamp((elev[i] - lo) / (hi - lo), 0, 1));
        const a = clamp((0.1 + 1.25 * h) * (0.3 + 0.7 * e) * P.shade, 0, 1.4), b = clamp(e * 0.22 * P.shade, 0, 0.4);
        base[p * 3] = f[0] + (l[0] - f[0]) * a + (d[0] - f[0]) * b;
        base[p * 3 + 1] = f[1] + (l[1] - f[1]) * a + (d[1] - f[1]) * b;
        base[p * 3 + 2] = f[2] + (l[2] - f[2]) * a + (d[2] - f[2]) * b;
        const level = elev[i] / clamp(P.contourM, 40, 600);
        const accent = Math.max(0, 1 - Math.abs(level - Math.round(level)) * 24) * clamp(P.contours, 0, 0.7) * (0.22 + 0.4 * e);
        for (let c = 0; c < 3; c++) base[p * 3 + c] += (amber[c] - base[p * 3 + c]) * accent;
        base32[p] = (255 << 24) | (base[p * 3 + 2] << 16) | (base[p * 3 + 1] << 8) | base[p * 3];
      }
    }
    /* tone: v / (1 + v) to the 0.75, phosphor rising to the core colour in the brightest channels; 1,024 steps of v in [0, 8) */
    function toneTable(tok) {
      const key = tok.phosphor + tok.phosphorCore;
      if (key === toneKey) return;
      toneKey = key; tone = new Float32Array(1024 * 3);
      const ph = BONEYARD.toRgb(tok.phosphor), core = BONEYARD.toRgb(tok.phosphorCore);
      for (let i = 0; i < 1024; i++) {
        const v = (i + 0.5) / 128, a = Math.pow(v / (1 + v), 0.75), c = a > 0.72 ? (a - 0.72) * 3.2 : 0;
        for (let ch = 0; ch < 3; ch++) tone[i * 3 + ch] = ph[ch] * a + (core[ch] - ph[ch]) * c * a;
      }
    }
    function draw() {
      if (!ready || !px) return;
      backdrop(); toneTable(ctx.tokens);
      const k = (P.glow / (S * view.cw)) * 128;       /* density -> LUT index, normalised for how many cells a pixel spans */
      const floor = 0.75 / k;                          /* below LUT step 0.75 a pixel is plain backdrop: the fast path */
      const n = BW * BH;
      for (let p = 0; p < n; p++) {
        const raw = dens[map[p]];
        if (raw < floor) { px32[p] = base32[p]; continue; }
        let i = (raw * k) | 0; if (i > 1023) i = 1023; i *= 3;
        const q = p * 3, o = p * 4;
        px[o] = base[q] + tone[i]; px[o + 1] = base[q + 1] + tone[i + 1]; px[o + 2] = base[q + 2] + tone[i + 2]; px[o + 3] = 255;
      }
      bctx.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(buf, 0, 0, canvas.width, canvas.height);
      drawHeads();
      drawCloud();
    }
    function drawHeads() {
      if (!(P.heads > 0)) return;
      const count = ctx.dial === 'calm' ? N >> 1 : N;
      const limit = ctx.dial === 'calm' ? 90 : 220, stride = Math.max(1, Math.ceil(count / limit));
      const kx = canvas.width / (BW * view.cw), ky = canvas.height / (BH * view.cw);
      const streaks = new Path2D(), heads = new Path2D();
      const radius = Math.max(0.7, Math.min(canvas.width, canvas.height) / 720);
      for (let i = 0; i < count; i += stride) {
        const x = (pxs[i] - view.x0) * kx, y = (pys[i] - view.y0) * ky;
        if (x < 0 || y < 0 || x > canvas.width || y > canvas.height || age[i] < 0.04) continue;
        const dx = (pxs[i] - prevX[i]) * kx, dy = (pys[i] - prevY[i]) * ky;
        const length = Math.hypot(dx, dy);
        if (length < 0.04) continue;
        const tail = Math.min(5, 2.2 / Math.max(0.1, length));
        streaks.moveTo(x - dx * tail, y - dy * tail); streaks.lineTo(x, y);
        heads.moveTo(x + radius, y); heads.arc(x, y, radius, 0, Math.PI * 2);
      }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = clamp(P.heads, 0, 1) * 0.55;
      g.strokeStyle = ctx.tokens.phosphor; g.lineWidth = radius * 2.5; g.stroke(streaks);
      g.globalAlpha = clamp(P.heads, 0, 1) * 0.85; g.fillStyle = ctx.tokens.phosphorCore; g.fill(heads);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    function drawCloud() {
      if (!rainCloud || cloudPulse < 0.02) return;
      const x = (rainCloud.x - view.x0) / (BW * view.cw) * canvas.width;
      const y = (rainCloud.y - view.y0) / (BH * view.cw) * canvas.height;
      const r = P.cloud / (BW * view.cw) * canvas.width * (1 + (1 - cloudPulse) * 0.3);
      g.globalAlpha = cloudPulse * 0.72; g.strokeStyle = ctx.tokens.amber;
      g.lineWidth = Math.max(1, canvas.width / 1100); g.setLineDash([4, 6]);
      g.beginPath(); g.arc(x, y, Math.max(4, r), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.stroke();
      g.globalAlpha = 1;
    }
    function rain(nx = 0.5, ny = 0.46) {
      if (!ready || dead) return false;
      rainCloud = { x: view.x0 + clamp(nx, 0.05, 0.95) * BW * view.cw, y: view.y0 + clamp(ny, 0.05, 0.95) * BH * view.cw };
      cloudPulse = 1;
      const count = Math.min(N, ctx.dial === 'calm' ? 180 : 320);
      for (let i = 0; i < count; i++) spawn(i, rainCloud);
      if (ctx.dial === 'still') for (let i = 0; i < 24; i++) advance(1 / 30, count, rainCloud);
      cloudFt = elev[clamp(rainCloud.y | 0, 0, H - 1) * W + clamp(rainCloud.x | 0, 0, W - 1)] * 3.28084;
      draw(); readout(ctx.dial === 'calm' ? N >> 1 : N, true);
      return true;
    }
    function readout(active, force) {
      const now = performance.now();
      if (!force && now - readAt < 140) return;
      readAt = now;
      ctx.readout('wash', 'slope model, not hydrology · ' + fmt(active) + ' drops' + (cloudFt != null ? ' · rain at ' + fmt(cloudFt) + ' ft' : ''));
    }
    function precompute() {
      rand = rng(1947); S = 1; simT = 0; dens.fill(0); allocDrops(Math.round(clamp(P.drops, 100, 6000)));
      const n = ctx.dial === 'calm' ? N >> 1 : N;
      for (let s = 0; s < P.stillSeconds; s += 1 / 30) advance(1 / 30, n, null);
    }
    /* the pointer as a grid cell, when it is over the canvas */
    function cloudAt(pointer) {
      if (!pointer || !pointer.present || (pointer.coarse && !pointer.down)) return null;
      const r = canvas.getBoundingClientRect();
      if (pointer.x < r.left || pointer.x > r.right || pointer.y < r.top || pointer.y > r.bottom) return null;
      const bx = (pointer.x - r.left) / r.width * BW, by = (pointer.y - r.top) / r.height * BH;
      return { x: view.x0 + bx * view.cw, y: view.y0 + by * view.cw };
    }

    ctx.dem().then((dem) => {
      if (dead) return;
      W = dem.width; H = dem.height; elev = dem.elev;
      setTimeout(() => {
        if (dead) return;
        prepare();
        if (BW) layout();
        ready = !!BW;
        if (ready) { precompute(); if (wantStill || ctx.dial === 'still') { draw(); readout(ctx.dial === 'calm' ? N >> 1 : N, true); } }
      }, 0);
    }).catch(() => { ctx.readout('wash', 'elevation grid unavailable'); });

    return {
      tick(dt, t, progress, pointer) {
        if (!ready) return;
        wantStill = false;
        const count = ctx.dial === 'calm' ? N >> 1 : N;
        const cloud = cloudAt(pointer || ctx.pointer);
        cloudPulse *= Math.exp(-dt / 0.65);
        if (cloud) { rainCloud = cloud; cloudPulse = Math.max(cloudPulse, pointer?.down ? 0.85 : 0.4); }
        cloudFt = cloud && cloud.x >= 0 && cloud.y >= 0 && cloud.x < W && cloud.y < H ? elev[(cloud.y | 0) * W + (cloud.x | 0)] * 3.28084 : null;
        if (cloud) for (let j = 0; j < 6; j++) spawn((rand() * count) | 0, cloud);   /* the cloud rains: recycle a few drops under it */
        advance(Math.min(0.05, dt), count, cloud);
        draw();
        readout(count, false);
      },
      resize(w, h) {
        /* the long side of the buffer is P.buffer pixels, whatever the aspect: a phone costs what a desktop costs */
        const aspect = Math.max(1, w) / Math.max(1, h), L = Math.round(clamp(P.buffer, 240, 640));
        const bw = aspect >= 1 ? L : Math.max(120, Math.round(L * aspect)), bh = aspect >= 1 ? Math.max(90, Math.round(L / aspect)) : L;
        if (bw !== BW || bh !== BH || !img) { BW = bw; BH = bh; buf.width = bw; buf.height = bh; img = bctx.createImageData(bw, bh); px = img.data; px32 = new Uint32Array(px.buffer); baseKey = ''; }
        if (gx) { layout(); if (!ready) { ready = true; precompute(); } }
        if (ready) draw();
      },
      still() {
        wantStill = true;
        if (!ready) return;
        cloudFt = null;
        draw(); readout(ctx.dial === 'calm' ? N >> 1 : N, true);
      },
      params(p) {
        const old = P; P = Object.assign({}, PARAMS, p);
        if (!ready) return;
        if (p.buffer !== old.buffer) { BW = 0; this.resize(canvas.width, canvas.height); }
        if (p.drops !== old.drops || p.stillSeconds !== old.stillSeconds) precompute();
        baseKey = ''; draw();
      },
      rain,
      destroy() {
        dead = true; ready = false;
        elev = gx = gy = shadeG = dens = tone = null; buf = bctx = null; pxs = pys = age = lifeA = sx0 = sy0 = prevX = prevY = null; img = px = px32 = map = base = base32 = null; rainCloud = null;
      },
    };
  }

  BAYS.push({ slug: 'wash', title: 'Wash', order: 4, role: 'bay', params: PARAMS, mount, dem: true });
})();
