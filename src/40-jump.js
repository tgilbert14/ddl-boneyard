/* BONEYARD PART · 01 · JUMP
 * technique   deterministic 1/z star volume in three depth strata, with projected streaks and a compression plane
 * lineage     the Star Wars jump (1977); the demoscene 1/z starfields (early 1990s); Windows 3.1 Starfield Simulation (1992)
 * original    the hold room for HYPERSPACE: the same projection and shared vanishing point as the corridor and row;
 *             cruise is a clean field of short phosphor strokes, a hold draws the volume through nested compression
 *             rings, and release sends one amber wave through the plane while the streaks settle back in depth
 * not         random speed changes, a tunnel, a lens flare, a flash, autoplay warp. Cruise is quiet; only a hold raises it.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.40 ms/frame @ 1050x852 desktop; 0.30 @ 390x439 portrait, Local Chromium 149, parts average under
 *             4x CPU slowdown (2026-09-30); JS work only, not a real-GPU frame
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Stars live in a seeded camera-space volume. Each z decreases by cruise plus warp speed, and a star that crosses
 * the near plane respawns at the far plane from the same deterministic generator. Its head and tail are both 1/z
 * projections, so every mark points exactly at the shared vanishing point. Far, middle and near paths have separate
 * widths and persistence, which makes the field read as volume instead of one sheet of equally weighted lines.
 *
 * Warp follows a press-and-hold envelope. A hold first tightens three broken ellipses around the line of flight, then
 * heats only the near stars and the center. Releasing after a meaningful charge expands one amber compression wave,
 * gives the shared sound and camera state a short punch, and lets warp settle slowly to clean cruise. Calm caps the
 * charge, halves travel, removes shake and chromatic split, and suppresses the release wave. Field-changing parameters
 * are compared through a value snapshot because the workbench mutates its parameter object in place.
 */
(() => {
  'use strict';
  const PARAMS = {
    count: 420,
    spread: 9, ySpread: 6.5,
    zNear: 0.9, zFar: 42,
    focalK: 0.62,
    drift: 2.2,
    warpDrift: 38,
    cruiseWarp: 0.14,
    holdWarp: 1.0,
    riseTime: 0.78,
    settleTime: 1.05,
    streakLen: 11.5,
    trailAlpha: 0.68,
    trailHot: 0.25,
    haloWidth: 3.4, coreWidth: 1.25,
    haloAlpha: 0.2, coreAlpha: 0.96,
    hotZ: 8,
    coreGlow: 0.34,
    chromaK: 0.011,
    shakePx: 3.6,
    kickTau: 0.14,
    releaseTime: 0.62,
    planeAlpha: 0.3,
    stillWarp: 0.42,
  };
  const RGB = ['rgb(255,40,40)', 'rgb(40,255,90)', 'rgb(60,90,255)'];
  const FIELD_KEYS = ['count', 'spread', 'ySpread', 'zNear', 'zFar'];
  const clamp = (x, a, b, fallback) => Number.isFinite(Number(x)) ? Math.max(a, Math.min(b, Number(x))) : fallback;
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return u * u * (3 - 2 * u); };
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = 1, px = 1, bd = 1;
    let warp = clamp(params.cruiseWarp, 0, 1.5, 0.14), armed = true, clock = 0, kick = 0, wasDown = false;
    let release = 0, releaseAge = 0, n = 0, stars = null, kinds = null, snap = null, random = rng(0x4a554d50);

    function fieldValues(p) {
      const near = clamp(p.zNear, 0.15, 12, 0.9);
      return {
        count: Math.round(clamp(p.count, 24, 1400, 420)),
        spread: clamp(p.spread, 0.5, 40, 9),
        ySpread: clamp(p.ySpread, 0.5, 30, 6.5),
        zNear: near,
        zFar: Math.max(near + 0.5, clamp(p.zFar, 1, 160, 42)),
      };
    }
    function focal() { f = Math.max(1, Math.min(h * clamp(params.focalK, 0.12, 2, 0.62), w * 1.18)); }
    function spawn(i, anyZ) {
      stars[i * 3] = (random() * 2 - 1) * snap.spread;
      stars[i * 3 + 1] = (random() * 2 - 1) * snap.ySpread;
      stars[i * 3 + 2] = anyZ ? snap.zNear + random() * (snap.zFar - snap.zNear) : snap.zFar;
      const r = random(); kinds[i] = r < 0.18 ? 2 : r < 0.55 ? 1 : 0;
    }
    function build() {
      snap = fieldValues(params); n = snap.count; stars = new Float32Array(n * 3); kinds = new Uint8Array(n);
      random = rng(0x4a554d50);
      for (let i = 0; i < n; i++) spawn(i, true);
    }
    build(); focal();

    function compressionPlane(vpX, vpY, charge, pulse, clear) {
      if (charge < 0.025 && pulse < 0.01) return;
      const T = ctx.tokens, planeA = clamp(params.planeAlpha, 0, 1, 0.3);
      g.save(); g.translate(vpX, vpY); g.lineCap = 'round';
      if (charge > 0.025) {
        const base = h * (0.065 + 0.23 * (1 - charge));
        g.strokeStyle = charge > 0.7 ? T.amber : T.phosphor;
        for (let i = 0; i < 3; i++) {
          const r = base + i * h * 0.045;
          g.beginPath();
          g.setLineDash([Math.max(6, r * 0.3), Math.max(7, r * 0.14)]);
          g.lineDashOffset = i * 13 + charge * r * 0.45;
          g.ellipse(0, 0, r * 1.65, r * 0.34, 0, 0, Math.PI * 2);
          g.globalAlpha = planeA * (0.24 + 0.42 * charge) * (1 - i * 0.2);
          g.lineWidth = (1.4 + charge * 1.2) * px;
          g.stroke();
        }
      }
      if (pulse > 0.01) {
        const u = Math.min(1, releaseAge / Math.max(0.08, clamp(params.releaseTime, 0.08, 3, 0.62)));
        const r = h * (0.06 + 0.56 * smooth(0, 1, u));
        g.setLineDash([]); g.beginPath(); g.ellipse(0, 0, r * 1.55, r * 0.32, 0, 0, Math.PI * 2);
        g.strokeStyle = T.amber; g.globalAlpha = planeA * pulse * (clear ? 0.8 : 0.62);
        g.lineWidth = (1.5 + 3 * pulse) * px; g.stroke();
      }
      g.restore(); g.setLineDash([]); g.globalAlpha = 1;
    }

    function draw(clear, chroma, sx, sy) {
      const T = ctx.tokens, vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      const cruise = clamp(params.cruiseWarp, 0, 1.5, 0.14), hold = Math.max(cruise + 0.01, clamp(params.holdWarp, 0, 1.5, 1));
      const charge = smooth(cruise + 0.04, hold * 0.95, warp);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (clear) { g.globalAlpha = 1; g.clearRect(0, 0, w, h); }
      else {
        const coldWash = clamp(params.trailAlpha, 0.04, 1, 0.68), hotWash = clamp(params.trailHot, 0.03, 1, 0.25);
        g.globalAlpha = coldWash + (hotWash - coldWash) * charge * charge;
        g.fillStyle = T.field; g.fillRect(0, 0, w, h);
      }
      g.setTransform(1, 0, 0, 1, sx, sy);
      compressionPlane(vpX, vpY, charge, ctx.dial === 'full' ? release : 0, clear);

      const glow = clamp(params.coreGlow, 0, 1.5, 0.34) * smooth(0.58, 1, charge);
      if (glow > 0.01) {
        const r = h * (0.055 + 0.2 * charge * charge);
        const gr = g.createRadialGradient(vpX, vpY, 0, vpX, vpY, r);
        gr.addColorStop(0, ctx.rgba(T.amber, 0.9)); gr.addColorStop(0.22, ctx.rgba(T.amber, 0.36)); gr.addColorStop(1, ctx.rgba(T.amber, 0));
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = glow * (clear ? 0.75 : 0.42);
        g.fillStyle = gr; g.fillRect(vpX - r, vpY - r, 2 * r, 2 * r); g.globalCompositeOperation = 'source-over';
      }

      const paths = [new Path2D(), new Path2D(), new Path2D()], hot = [new Path2D(), new Path2D(), new Path2D()];
      const heads = [new Path2D(), new Path2D(), new Path2D()];
      const baseL = warp * clamp(params.streakLen, 0.2, 50, 11.5), heat = smooth(0.45, 0.94, charge);
      const zSpan = Math.max(0.5, snap.zFar - snap.zNear);
      for (let i = 0; i < n; i++) {
        const x = stars[i * 3], y = stars[i * 3 + 1], z = stars[i * 3 + 2];
        const hx = vpX + f * x / z, hy = vpY + f * y / z;
        if (hx < -8 || hx > w + 8 || hy < -8 || hy > h + 8) continue;
        const depth = 1 - (z - snap.zNear) / zSpan;
        const layer = depth > 0.73 ? 2 : depth > 0.34 ? 1 : 0;
        const L = baseL * (0.72 + depth * 0.72) + 0.1;
        const z2 = z + L, p = heat > 0 && z < clamp(params.hotZ, snap.zNear, snap.zFar, 8) ? hot[layer] : paths[layer];
        p.moveTo(vpX + f * x / z2, vpY + f * y / z2); p.lineTo(hx, hy);
        if (kinds[i] > 0 || layer === 2) {
          const d = (0.42 + layer * 0.32 + kinds[i] * 0.12) * px;
          heads[layer].rect(hx - d, hy - d, d * 2, d * 2);
        }
      }
      g.lineCap = 'round';
      const haloW = clamp(params.haloWidth, 0.2, 12, 3.4), coreW = clamp(params.coreWidth, 0.2, 8, 1.25);
      const haloA = clamp(params.haloAlpha, 0, 1, 0.2), coreA = clamp(params.coreAlpha, 0, 1, 0.96);
      for (let layer = 0; layer < 3; layer++) {
        const k = 0.48 + layer * 0.27;
        g.strokeStyle = T.phosphor; g.globalAlpha = haloA * k; g.lineWidth = haloW * (0.7 + layer * 0.2) * px; g.stroke(paths[layer]);
        g.strokeStyle = layer === 0 ? T.phosphorDim : T.phosphorCore; g.globalAlpha = coreA * k; g.lineWidth = coreW * (0.72 + layer * 0.18) * px; g.stroke(paths[layer]);
        g.fillStyle = layer === 2 ? T.phosphorCore : T.phosphor; g.globalAlpha = 0.38 * k; g.fill(heads[layer]);
        if (heat > 0) {
          g.strokeStyle = T.amber; g.globalAlpha = heat * (0.18 + layer * 0.2); g.lineWidth = haloW * (0.9 + layer * 0.3) * px; g.stroke(hot[layer]);
          g.strokeStyle = T.phosphorCore; g.globalAlpha = coreA * heat; g.lineWidth = coreW * (0.9 + layer * 0.35) * px; g.stroke(hot[layer]);
        }
      }
      if (chroma > 0.01 && heat > 0) {
        g.globalCompositeOperation = 'lighter'; g.lineWidth = coreW * 1.05 * px;
        for (let c = 0; c < 3; c++) {
          const s = 1 + (1 - c) * clamp(params.chromaK, 0, 0.08, 0.011) * chroma;
          g.setTransform(s, 0, 0, s, vpX * (1 - s) + sx, vpY * (1 - s) + sy);
          g.strokeStyle = RGB[c]; g.globalAlpha = 0.42 * chroma; g.stroke(hot[2]);
        }
        g.globalCompositeOperation = 'source-over';
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }

    return {
      tick(dt, t, progress, pointer) {
        dt = clamp(dt, 0, 0.05, 0.016);
        const S = ctx.share, full = ctx.dial === 'full', calm = ctx.dial === 'calm', down = !!(pointer && pointer.down);
        const cruise = clamp(params.cruiseWarp, 0, 1.5, 0.14), top = Math.max(cruise, clamp(params.holdWarp, 0, 1.5, 1));
        const target = down ? cruise + (top - cruise) * (calm ? 0.64 : 1) : cruise;
        kick *= Math.exp(-dt / clamp(params.kickTau, 0.03, 2, 0.14));
        if (down && !wasDown) kick = full ? 0.24 : 0;
        if (!down && wasDown && warp > cruise + (top - cruise) * 0.28) { release = full ? 1 : 0; releaseAge = 0; kick = full ? 1 : 0; }
        wasDown = down;
        const tau = (target > warp ? clamp(params.riseTime, 0.06, 6, 0.78) : clamp(params.settleTime, 0.06, 8, 1.05)) / 3;
        warp += (target - warp) * (1 - Math.exp(-dt / tau));
        if (release > 0) { releaseAge += dt; release *= Math.exp(-dt / clamp(params.releaseTime, 0.08, 3, 0.62)); if (release < 0.01) release = 0; }
        const now = performance.now(); S.warp = warp; S.warpAt = now;
        if (armed && warp > 0.62) { armed = false; kick = full ? Math.max(kick, 0.52) : 0; window.dispatchEvent(new CustomEvent('boneyard:warp', { detail: { level: warp } })); }
        else if (!armed && warp < 0.44) armed = true;
        const drift = clamp(params.drift, 0, 40, 2.2), warpDrift = clamp(params.warpDrift, 0, 180, 38);
        const dz = (drift + warp * warp * warpDrift) * dt * (calm ? 0.5 : 1);
        for (let i = 0; i < n; i++) {
          let z = stars[i * 3 + 2] - dz;
          if (z < snap.zNear) { spawn(i, false); z = snap.zFar - (snap.zNear - z) % (snap.zFar - snap.zNear); }
          stars[i * 3 + 2] = z;
        }
        const charge = full ? smooth(cruise + 0.14, top, warp) : 0;
        clock += dt; if (kick < 0.01) kick = 0;
        const punch = full ? Math.max(kick, release * 0.7) : 0;
        const amp = clamp(params.shakePx, 0, 16, 3.6) * Math.max(0.14 * charge, punch);
        const sh = amp > 0.05 ? { x: amp * (0.66 * Math.sin(clock * 47.1) + 0.34 * Math.sin(clock * 83.7 + 1.3)), y: amp * (0.66 * Math.sin(clock * 59.3 + 0.7) + 0.34 * Math.sin(clock * 79.9 + 2.1)) } : null;
        S.punch = punch; S.shake = sh; S.punchAt = now;
        draw(false, full ? Math.max(0.18 * charge, punch) : 0, sh ? sh.x * bd : 0, sh ? sh.y * bd : 0);
      },
      resize(nw, nh, ndpr) { w = Math.max(1, nw); h = Math.max(1, nh); bd = clamp(ndpr, 0.5, 4, 1); px = Math.max(0.75, bd); focal(); },
      still() { warp = clamp(params.stillWarp, 0, 1.5, 0.42); release = 0; releaseAge = 0; draw(true, 0, 0, 0); },
      destroy() { const S = ctx.share; if (S.punchAt) { S.punch = 0; S.shake = null; S.punchAt = 0; } g.clearRect(0, 0, w, h); },
      params(p) {
        params = p; focal(); const next = fieldValues(p);
        if (FIELD_KEYS.some((k) => next[k] !== snap[k])) build();
      },
    };
  }
  BAYS.push({ slug: 'jump', title: 'Jump', order: 1, role: 'bay', params: PARAMS, mount });
})();
