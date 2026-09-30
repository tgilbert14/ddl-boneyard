/* BONEYARD PART · C2 · HYPERSPACE
 * technique   the sky's own stars streaked along their 1/z rays: each star drawn as a line from its projection at z to
 *             its projection at z + warp * streakLen, scrubbed by scroll position through the gap between two bays
 * lineage     the Star Wars jump (1977); the demoscene 1/z starfields (early 1990s); Windows 3.1 Starfield Simulation (1992)
 * original    it draws the SAME points THE SKY publishes on ctx.share.stars, so the jump is continuous with the sky you
 *             were resting under; warp is a function of scroll progress through the corridor (scroll is the only clock,
 *             and warp is exactly zero at rest and at the room's threshold), eased 350 ms so a stopped scroll holds a
 *             designed mid-warp; at peak warp in Full the nearest streaks burn amber, the cores split into red, green
 *             and blue about the vanishing point (drawn additively), and the camera shakes a few px in proportion to
 *             how fast you are scrolling (published as ctx.share.shake, so every layer shakes together, and as
 *             ctx.share.punch 0..1 for the sound); clipped above the horizon
 * not         a random speed loop, a tunnel, a lens flare, a flash. It never moves unless you do.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.13 ms/frame JS avg (0.7 max) @ 1440x900 dpr 1, headless desktop Chromium (2026-09-30); raster not in this number; phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Progress runs 0 to 1 across the gap between the bay you are leaving and the one you are entering. Warp follows a
 * raised sine over that range (quiet at both ends, full in the middle) with a floor so the first scroll already
 * stretches the stars. For each star (x, y, z) the head is (vpX + f x / z, vpY - f y / z) and the tail is the same
 * projection at z + warp * streakLen: the tail sits closer to the vanishing point, so every streak points at it.
 * Stars nearer than hotZ are the hot set once warp passes hotFrom: an amber halo under a white core.
 *
 * The punch is a transient: it jumps to 1 when warp climbs through 0.6 and to 0.7 when it climbs through 0.9, and
 * decays with a 110 ms time constant (gone in about 350 ms); ctx.share.warp is the sustained level. In Full the
 * punch drives three things over a small sustained rumble (peak warp times scroll speed): the
 * chromatic split (the hot set's core path stroked three more times in pure red, green and blue, scaled about the vanishing
 * point by 1 + c, 1 and 1 - c, composited with 'lighter' so they sum to white where they overlap), the camera shake
 * (a sum of two incommensurate sines, a few px), and ctx.share.punch. Calm and Still get none of it. When warp
 * climbs through 0.6 the module dispatches a window event 'boneyard:warp' with detail.level; it re-arms below 0.45.
 * If no sky has published stars (the parts page), the module seeds its own field with the same distribution.
 */
(() => {
  'use strict';
  const PARAMS = {
    streakLen: 10.5,    /* world units at full warp */
    warpFloor: 0.12,
    warpPeak: 1.0,
    rampIn: 0.1,        /* fraction of the gap over which warp rises from zero (and falls back to zero) */
    settle: 0.35,       /* seconds to ease toward the scroll-driven warp */
    haloWidth: 3.0, coreWidth: 1.3,
    haloAlpha: 0.26, coreAlpha: 0.95,
    focalK: 0.62,
    hotZ: 7,            /* stars nearer than this burn amber at peak */
    hotFrom: 0.45,      /* warp at which the hot set starts */
    chromaK: 0.012,     /* radial RGB split at full punch, fraction of the distance from the vanishing point */
    shakePx: 4,         /* css px of camera shake at full punch */
    kickTau: 0.11,      /* seconds: the punch transient's decay */
    speedRef: 16,       /* ride camera units per second that reads as full speed */
    stillWarp: 0.62,
    ownStars: 360,      /* only when no sky is present (parts page) */
  };
  const RGB = ['rgb(255,40,40)', 'rgb(40,255,90)', 'rgb(60,90,255)'];
  function seedOwn(n) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = (Math.random() * 2 - 1) * 10; a[i * 3 + 1] = (Math.random() * 2 - 1) * 7; a[i * 3 + 2] = 1.2 + Math.random() * 38; }
    return a;
  }
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * params.focalK, px = 1, bd = 1, warp = 0, own = null, speed = 0, armed = true, armed9 = true, kick = 0, clock = 0;
    function planes() {
      const s = ctx.share.stars;
      if (s) return [[s.far, s.far.length / 3, 0.6], [s.near, s.near.length / 3, 1]];
      if (!own) own = seedOwn(params.ownStars);
      return [[own, params.ownStars, 1]];
    }
    function draw(wv, chroma, sx, sy) {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      if (wv <= 0.001) return;
      g.save();
      g.setTransform(1, 0, 0, 1, sx, sy);
      if (ctx.share.stars) { g.beginPath(); g.rect(-16, -16, w + 32, Math.ceil(vpY) + 16); g.clip(); }
      g.lineCap = 'round';
      const hot = new Path2D(), cores = [];
      const heat = smooth(params.hotFrom, 1, wv);
      for (const [a, n, k] of planes()) {
        const path = new Path2D();
        const L = wv * params.streakLen * k;
        for (let i = 0; i < n; i++) {
          const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
          const hx = vpX + f * x / z, hy = vpY - f * y / z;
          if (hx < -4 || hx > w + 4 || hy < -4 || hy > h + 4) continue;
          const z2 = z + L;
          const p = heat > 0 && z < params.hotZ ? hot : path;
          p.moveTo(vpX + f * x / z2, vpY - f * y / z2); p.lineTo(hx, hy);
        }
        g.strokeStyle = T.phosphor; g.globalAlpha = params.haloAlpha * k; g.lineWidth = params.haloWidth * px; g.stroke(path);
        g.strokeStyle = T.phosphorCore; g.globalAlpha = params.coreAlpha * k; g.lineWidth = params.coreWidth * px; g.stroke(path);
      }
      if (heat > 0) {
        g.strokeStyle = T.amber; g.globalAlpha = 0.6 * heat; g.lineWidth = params.haloWidth * 1.7 * px; g.stroke(hot);
        g.strokeStyle = T.phosphorCore; g.globalAlpha = params.coreAlpha; g.lineWidth = params.coreWidth * 1.6 * px; g.stroke(hot);
        cores.push([hot, 1]);
      }
      if (chroma > 0.01) {
        g.globalCompositeOperation = 'lighter';
        g.lineWidth = params.coreWidth * 1.2 * px;
        for (let c = 0; c < 3; c++) {
          const s = 1 + (1 - c) * params.chromaK * chroma;
          g.setTransform(s, 0, 0, s, vpX * (1 - s) + sx, vpY * (1 - s) + sy);
          g.strokeStyle = RGB[c];
          for (const [p, k] of cores) { g.globalAlpha = 0.6 * chroma * k; g.stroke(p); }
        }
        g.globalCompositeOperation = 'source-over';
      }
      g.restore();
      g.globalAlpha = 1;
    }
    return {
      tick(dt, t, progress) {
        const S = ctx.share, full = ctx.dial === 'full';
        const p = Math.max(0, Math.min(1, progress));
        const ends = Math.min(1, p / params.rampIn) * Math.min(1, (1 - p) / params.rampIn);   /* zero at rest and at the threshold */
        const target = ends * (params.warpFloor + (params.warpPeak - params.warpFloor) * Math.pow(Math.sin(Math.PI * p), 0.8));
        warp += (target - warp) * (1 - Math.exp(-dt / Math.max(0.02, params.settle)));
        const now = performance.now();
        S.warp = warp; S.warpAt = now;
        kick *= Math.exp(-dt / Math.max(0.02, params.kickTau));
        if (armed && warp > 0.6) { armed = false; kick = 1; window.dispatchEvent(new CustomEvent('boneyard:warp', { detail: { level: warp } })); }
        else if (!armed && warp < 0.45) armed = true;
        if (armed9 && warp > 0.9) { armed9 = false; kick = Math.max(kick, 0.7); } else if (!armed9 && warp < 0.75) armed9 = true;
        if (kick < 0.01) kick = 0;
        /* speed: fast attack, slower release, so a flick lands and a stop settles */
        const sp = Math.min(1, Math.abs((ctx.camera && ctx.camera.v) || 0) / params.speedRef);
        speed += (sp - speed) * (1 - Math.exp(-dt / (sp > speed ? 0.06 : 0.35)));
        const peak = smooth(0.55, 0.95, warp);
        const rumble = peak * speed;
        const punch = full ? kick : 0;
        const chroma = full ? Math.max(0.3 * rumble, kick) : 0;
        clock += dt;
        const amp = full ? params.shakePx * Math.max(0.3 * rumble, kick) : 0;
        const sh = amp > 0.05 ? { x: amp * (0.62 * Math.sin(clock * 53.1) + 0.38 * Math.sin(clock * 91.7 + 1.3)), y: amp * (0.62 * Math.sin(clock * 61.3 + 0.7) + 0.38 * Math.sin(clock * 83.9 + 2.1)) } : null;
        S.punch = punch; S.shake = sh; S.punchAt = now;
        draw(warp, chroma, sh ? sh.x * bd : 0, sh ? sh.y * bd : 0);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; bd = ndpr; px = Math.max(0.75, ndpr); f = h * params.focalK; },
      still() { warp = params.stillWarp; ctx.share.warp = warp; draw(warp, 0, 0, 0); },
      destroy() { const S = ctx.share; S.warp = 0; S.punch = 0; S.shake = null; S.punchAt = 0; S.warpAt = 0; g.clearRect(0, 0, w, h); },
      params(p) { params = p; f = h * params.focalK; },
    };
  }
  BAYS.push({ slug: 'hyperspace', title: 'Hyperspace', order: 1, role: 'corridor', params: PARAMS, mount });
})();
