/* BONEYARD PART · C2 · HYPERSPACE
 * technique   the sky's own stars streaked along their 1/z rays: each star drawn as a line from its projection at z to
 *             its projection at z + warp * streakLen, scrubbed by scroll position through the gap between two bays
 * lineage     the Star Wars jump (1977); the demoscene 1/z starfields (early 1990s); Windows 3.1 Starfield Simulation (1992)
 * original    it draws the SAME points THE SKY publishes on ctx.share.stars, so the jump is continuous with the sky you
 *             were resting under; warp is a function of scroll progress through the corridor (scroll is the only clock,
 *             and warp is exactly zero at rest and at the room's threshold),
 *             eased 350 ms so a stopped scroll holds a designed mid-warp instead of freezing mid-frame; writes
 *             ctx.share.warp so the sky dims its dots as the streaks take over; clipped above the horizon
 * not         a random speed loop, a tunnel, a lens flare. It never moves unless you do.
 * deps        none · Canvas 2D · 2026-09
 * budget      see docs/BUILD-LOG.md for the measured number @ 1440x900 x1.5 internal, desktop Chromium (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Progress runs 0 to 1 across the gap between the bay you are leaving and the one you are entering. Warp follows a
 * raised sine over that range (quiet at both ends, full in the middle) with a floor so the first scroll already
 * stretches the stars. For each star (x, y, z) the head is (vpX + f x / z, vpY - f y / z) and the tail is the same
 * projection at z + warp * streakLen: the tail sits closer to the vanishing point, so every streak points at it.
 * Two passes per plane, a wide dim halo under a thin bright core, batched into one Path2D each. If no sky has
 * published stars (the parts page), the module seeds its own field with the same distribution.
 */
(() => {
  'use strict';
  const PARAMS = {
    streakLen: 5.5,     /* world units at full warp */
    warpFloor: 0.12,
    warpPeak: 1.0,
    rampIn: 0.1,        /* fraction of the gap over which warp rises from zero (and falls back to zero) */
    settle: 0.35,       /* seconds to ease toward the scroll-driven warp */
    haloWidth: 3.2, coreWidth: 1.1,
    haloAlpha: 0.22, coreAlpha: 0.9,
    focalK: 0.62,
    stillWarp: 0.45,
    ownStars: 360,      /* only when no sky is present (parts page) */
  };
  function seedOwn(n) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = (Math.random() * 2 - 1) * 10; a[i * 3 + 1] = (Math.random() * 2 - 1) * 7; a[i * 3 + 2] = 1.2 + Math.random() * 38; }
    return a;
  }
  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * params.focalK, px = 1, warp = 0, own = null;
    function planes() {
      const s = ctx.share.stars;
      if (s) return [[s.far, s.far.length / 3, 0.6], [s.near, s.near.length / 3, 1]];
      if (!own) own = seedOwn(params.ownStars);
      return [[own, params.ownStars, 1]];
    }
    function draw(wv) {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      if (wv <= 0.001) return;
      g.save();
      if (ctx.share.stars) { g.beginPath(); g.rect(0, 0, w, Math.ceil(vpY)); g.clip(); }
      g.lineCap = 'round';
      for (const [a, n, k] of planes()) {
        const path = new Path2D();
        const L = wv * params.streakLen * k;
        for (let i = 0; i < n; i++) {
          const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
          const hx = vpX + f * x / z, hy = vpY - f * y / z;
          if (hx < -4 || hx > w + 4 || hy < -4 || hy > h + 4) continue;
          const z2 = z + L;
          path.moveTo(vpX + f * x / z2, vpY - f * y / z2); path.lineTo(hx, hy);
        }
        g.strokeStyle = T.phosphor; g.globalAlpha = params.haloAlpha * k; g.lineWidth = params.haloWidth * px; g.stroke(path);
        g.strokeStyle = T.phosphorCore; g.globalAlpha = params.coreAlpha * k; g.lineWidth = params.coreWidth * px; g.stroke(path);
      }
      g.restore();
      g.globalAlpha = 1;
    }
    return {
      tick(dt, t, progress) {
        const p = Math.max(0, Math.min(1, progress));
        const ends = Math.min(1, p / params.rampIn) * Math.min(1, (1 - p) / params.rampIn);   /* zero at rest and at the threshold */
        const target = ends * (params.warpFloor + (params.warpPeak - params.warpFloor) * Math.pow(Math.sin(Math.PI * p), 0.8));
        warp += (target - warp) * (1 - Math.exp(-dt / Math.max(0.02, params.settle)));
        ctx.share.warp = warp;
        draw(warp);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); f = h * params.focalK; },
      still() { warp = params.stillWarp; ctx.share.warp = warp; draw(warp); },
      destroy() { ctx.share.warp = 0; g.clearRect(0, 0, w, h); },
      params(p) { params = p; f = h * params.focalK; },
    };
  }
  BAYS.push({ slug: 'hyperspace', title: 'Hyperspace', order: 1, role: 'corridor', params: PARAMS, mount });
})();
