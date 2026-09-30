/* BONEYARD PART · C2 · HYPERSPACE
 * technique   the sky's own stars separated into depth strata and stretched along their 1/z rays through a scroll-shaped warp
 * lineage     the Star Wars jump (1977); the demoscene 1/z starfields (early 1990s); Windows 3.1 Starfield Simulation (1992)
 * original    it draws the SAME points THE SKY publishes on ctx.share.stars, so the room and corridor stay continuous;
 *             launch expands one broken compression plane, cruise holds a deep layered wake, and arrival gathers that
 *             wake back into the shared vanishing point, all from scroll position rather than an independent time loop
 * not         a random speed loop, a tunnel, a lens flare, a flash. It never advances unless the visitor advances.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.24 ms/frame @ 1050x852 desktop; 0.10 @ 390x439 portrait, Local Chromium 149, parts average under
 *             4x CPU slowdown (2026-09-30); JS work only, not a real-GPU frame
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Progress drives a fast eased launch, a broad cruise plateau and a longer eased arrival. Each sky star is projected
 * twice, at z and at z plus the current warp length. Near stars get longer strokes, brighter heads and a faint second
 * wake segment; middle and far stars stay finer, so stopping mid-gap holds a legible volume instead of a flat burst.
 * A broken amber ellipse expands during launch and two phosphor ellipses contract during arrival. Their geometry is
 * centered on the same vanishing point, making the end states visually hand off to the rooms on either side.
 *
 * Full motion adds a brief shared punch when warp crosses the launch threshold, restrained RGB separation on the hot
 * near path, and camera shake proportional to actual ride speed. Calm uses the same scroll choreography at half force,
 * removes the punch, split and shake, and drops the echo wake. Standalone pages use a seeded copy of the same volume.
 */
(() => {
  'use strict';
  const PARAMS = {
    streakLen: 11.5,
    warpFloor: 0.2,
    warpPeak: 1.0,
    rampIn: 0.16,
    settle: 0.26,
    haloWidth: 3.0, coreWidth: 1.25,
    haloAlpha: 0.24, coreAlpha: 0.94,
    focalK: 0.62,
    hotZ: 7,
    hotFrom: 0.48,
    echoGap: 3.4,
    echoFrom: 0.58,
    planeAlpha: 0.34,
    chromaK: 0.01,
    shakePx: 3.1,
    kickTau: 0.13,
    speedRef: 16,
    stillWarp: 0.68,
    ownStars: 360,
  };
  const RGB = ['rgb(255,40,40)', 'rgb(40,255,90)', 'rgb(60,90,255)'];
  const clamp = (x, a, b, fallback) => Number.isFinite(Number(x)) ? Math.max(a, Math.min(b, Number(x))) : fallback;
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return u * u * (3 - 2 * u); };
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function seedOwn(n) {
    const a = new Float32Array(n * 3), r = rng(0x48595045);
    for (let i = 0; i < n; i++) { a[i * 3] = (r() * 2 - 1) * 10; a[i * 3 + 1] = (r() * 2 - 1) * 7; a[i * 3 + 2] = 1.2 + r() * 38; }
    return a;
  }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = 1, px = 1, bd = 1, warp = 0, own = null, ownN = 0;
    let speed = 0, armed = true, kick = 0, clock = 0, phase = 0.5;
    function focal() { f = Math.max(1, Math.min(h * clamp(params.focalK, 0.12, 2, 0.62), w * 1.18)); }
    function planes() {
      const s = ctx.share.stars;
      if (s && s.far && s.near) return [[s.far, Math.floor(s.far.length / 3), 0.62], [s.near, Math.floor(s.near.length / 3), 1]];
      const wanted = Math.round(clamp(params.ownStars, 24, 1600, 360));
      if (!own || wanted !== ownN) { ownN = wanted; own = seedOwn(wanted); }
      return [[own, ownN, 1]];
    }
    focal();

    function rhythmAt(p) {
      const r = clamp(params.rampIn, 0.03, 0.45, 0.16);
      const launch = smooth(0, r, p), arrival = 1 - smooth(1 - r * 1.45, 1, p);
      const body = 0.78 + 0.22 * Math.pow(Math.max(0, Math.sin(Math.PI * p)), 0.65);
      const floor = clamp(params.warpFloor, 0, 1.4, 0.2), peak = Math.max(floor, clamp(params.warpPeak, 0, 1.5, 1));
      return launch * arrival * (floor + (peak - floor) * body);
    }

    function phasePlanes(vpX, vpY, p, strength) {
      if (strength < 0.02) return;
      const launch = 1 - smooth(0.02, 0.24, p), arrival = smooth(0.72, 0.98, p);
      const alpha = clamp(params.planeAlpha, 0, 1, 0.34);
      g.save(); g.translate(vpX, vpY); g.lineCap = 'round';
      if (launch > 0.01) {
        const r = h * (0.055 + 0.44 * smooth(0, 1, 1 - launch));
        g.beginPath(); g.setLineDash([Math.max(6, r * 0.3), Math.max(6, r * 0.12)]); g.lineDashOffset = r * p;
        g.ellipse(0, 0, r * 1.6, r * 0.32, 0, 0, Math.PI * 2);
        g.strokeStyle = ctx.tokens.amber; g.globalAlpha = alpha * launch * strength; g.lineWidth = (1.4 + strength * 1.5) * px; g.stroke();
      }
      if (arrival > 0.01) {
        g.strokeStyle = ctx.tokens.phosphor; g.setLineDash([]);
        for (let i = 0; i < 2; i++) {
          const r = h * (0.3 * (1 - arrival) + 0.045 + i * 0.05);
          g.beginPath(); g.ellipse(0, 0, r * 1.55, r * 0.31, 0, 0, Math.PI * 2);
          g.globalAlpha = alpha * arrival * strength * (0.78 - i * 0.22); g.lineWidth = (1.2 + arrival) * px; g.stroke();
        }
      }
      g.restore(); g.setLineDash([]); g.globalAlpha = 1;
    }

    function draw(wv, chroma, sx, sy, p, calm) {
      const T = ctx.tokens, vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      if (wv <= 0.001) return;
      g.save(); g.setTransform(1, 0, 0, 1, sx, sy);
      if (ctx.share.stars) { g.beginPath(); g.rect(-16, -16, w + 32, Math.ceil(vpY) + 18); g.clip(); }
      phasePlanes(vpX, vpY, p, Math.min(1, wv * 1.4));
      const paths = [new Path2D(), new Path2D(), new Path2D()], hot = [new Path2D(), new Path2D(), new Path2D()];
      const heads = [new Path2D(), new Path2D(), new Path2D()], echo = new Path2D();
      const heat = smooth(clamp(params.hotFrom, 0, 1, 0.48), 1, wv);
      const streak = clamp(params.streakLen, 0.2, 60, 11.5), echoFrom = clamp(params.echoFrom, 0, 1, 0.58);
      for (const [a, n, planeK] of planes()) {
        for (let i = 0; i < n; i++) {
          const x = a[i * 3], y = a[i * 3 + 1], z = Math.max(0.2, a[i * 3 + 2]);
          const hx = vpX + f * x / z, hy = vpY - f * y / z;
          if (hx < -10 || hx > w + 10 || hy < -10 || hy > h + 10) continue;
          const layer = z < 6 ? 2 : z < 16 ? 1 : 0;
          const depthK = layer === 2 ? 1.38 : layer === 1 ? 1 : 0.72;
          const L = wv * streak * planeK * depthK, z2 = z + L;
          const path = heat > 0 && z < clamp(params.hotZ, 0.3, 60, 7) ? hot[layer] : paths[layer];
          path.moveTo(vpX + f * x / z2, vpY - f * y / z2); path.lineTo(hx, hy);
          const hs = (0.34 + layer * 0.28) * px; heads[layer].rect(hx - hs, hy - hs, hs * 2, hs * 2);
          if (!calm && wv > echoFrom && layer > 0) {
            const eg = clamp(params.echoGap, 0.1, 20, 3.4), za = z2 + eg, zb = za + Math.max(0.4, L * 0.16);
            echo.moveTo(vpX + f * x / zb, vpY - f * y / zb); echo.lineTo(vpX + f * x / za, vpY - f * y / za);
          }
        }
      }
      g.lineCap = 'round';
      const haloW = clamp(params.haloWidth, 0.2, 12, 3), coreW = clamp(params.coreWidth, 0.2, 8, 1.25);
      const haloA = clamp(params.haloAlpha, 0, 1, 0.24), coreA = clamp(params.coreAlpha, 0, 1, 0.94);
      for (let layer = 0; layer < 3; layer++) {
        const k = 0.46 + layer * 0.27;
        g.strokeStyle = T.phosphor; g.globalAlpha = haloA * k; g.lineWidth = haloW * (0.72 + layer * 0.2) * px; g.stroke(paths[layer]);
        g.strokeStyle = layer ? T.phosphorCore : T.phosphorDim; g.globalAlpha = coreA * k; g.lineWidth = coreW * (0.72 + layer * 0.18) * px; g.stroke(paths[layer]);
        g.fillStyle = layer === 2 ? T.phosphorCore : T.phosphor; g.globalAlpha = 0.34 * k; g.fill(heads[layer]);
        if (heat > 0) {
          g.strokeStyle = T.amber; g.globalAlpha = heat * (0.14 + layer * 0.2); g.lineWidth = haloW * (0.85 + layer * 0.32) * px; g.stroke(hot[layer]);
          g.strokeStyle = T.phosphorCore; g.globalAlpha = coreA * heat; g.lineWidth = coreW * (0.8 + layer * 0.36) * px; g.stroke(hot[layer]);
        }
      }
      if (!calm) { g.strokeStyle = T.phosphorDim; g.globalAlpha = 0.2 * smooth(echoFrom, 1, wv); g.lineWidth = coreW * 0.75 * px; g.stroke(echo); }
      if (chroma > 0.01) {
        g.globalCompositeOperation = 'lighter'; g.lineWidth = coreW * px;
        for (let c = 0; c < 3; c++) {
          const s = 1 + (1 - c) * clamp(params.chromaK, 0, 0.08, 0.01) * chroma;
          g.setTransform(s, 0, 0, s, vpX * (1 - s) + sx, vpY * (1 - s) + sy);
          g.strokeStyle = RGB[c]; g.globalAlpha = 0.36 * chroma; g.stroke(hot[2]);
        }
        g.globalCompositeOperation = 'source-over';
      }
      g.restore(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }

    return {
      tick(dt, t, progress) {
        dt = clamp(dt, 0, 0.05, 0.016);
        const S = ctx.share, full = ctx.dial === 'full', calm = ctx.dial === 'calm';
        phase = clamp(progress, 0, 1, 0); const target = rhythmAt(phase) * (calm ? 0.62 : 1);
        const settle = clamp(params.settle, 0.04, 3, 0.26), tau = target > warp ? settle * 0.34 : settle * 0.72;
        warp += (target - warp) * (1 - Math.exp(-dt / tau));
        const now = performance.now(); S.warp = warp; S.warpAt = now;
        kick *= Math.exp(-dt / clamp(params.kickTau, 0.03, 2, 0.13));
        if (armed && warp > 0.56) { armed = false; kick = full ? 1 : 0; window.dispatchEvent(new CustomEvent('boneyard:warp', { detail: { level: warp } })); }
        else if (!armed && warp < 0.34) armed = true;
        if (kick < 0.01) kick = 0;
        const sp = Math.min(1, Math.abs((ctx.camera && ctx.camera.v) || 0) / clamp(params.speedRef, 1, 100, 16));
        speed += (sp - speed) * (1 - Math.exp(-dt / (sp > speed ? 0.06 : 0.32)));
        const cruise = smooth(0.48, 0.9, warp), rumble = cruise * speed, punch = full ? kick : 0;
        const chroma = full ? Math.max(0.2 * rumble, kick) : 0;
        clock += dt; const amp = full ? clamp(params.shakePx, 0, 16, 3.1) * Math.max(0.18 * rumble, kick) : 0;
        const sh = amp > 0.05 ? { x: amp * (0.64 * Math.sin(clock * 49.1) + 0.36 * Math.sin(clock * 87.7 + 1.3)), y: amp * (0.64 * Math.sin(clock * 57.3 + 0.7) + 0.36 * Math.sin(clock * 81.9 + 2.1)) } : null;
        S.punch = punch; S.shake = sh; S.punchAt = now;
        draw(warp, chroma, sh ? sh.x * bd : 0, sh ? sh.y * bd : 0, phase, calm);
      },
      resize(nw, nh, ndpr) { w = Math.max(1, nw); h = Math.max(1, nh); bd = clamp(ndpr, 0.5, 4, 1); px = Math.max(0.75, bd); focal(); },
      still() { phase = 0.5; warp = clamp(params.stillWarp, 0, 1.5, 0.68); ctx.share.warp = warp; draw(warp, 0, 0, 0, phase, true); },
      destroy() { const S = ctx.share; S.warp = 0; S.punch = 0; S.shake = null; S.punchAt = 0; S.warpAt = 0; g.clearRect(0, 0, w, h); },
      params(p) { params = p; focal(); if (Math.round(clamp(p.ownStars, 24, 1600, 360)) !== ownN) own = null; },
    };
  }
  BAYS.push({ slug: 'hyperspace', title: 'Hyperspace', order: 1, role: 'corridor', params: PARAMS, mount });
})();
