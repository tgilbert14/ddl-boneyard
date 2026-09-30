/* BONEYARD PART · C3 · RINGS
 * technique   the dot tunnel: concentric squares of dots at fixed depths, projected by 1/z onto the shared vanishing
 *             point, each ring rotated by an angle that grows with its depth, so the far end of the tunnel twists
 * lineage     the demoscene dot tunnel (Amiga and PC intros, about 1991); the 1/z projection it shares with every
 *             starfield of the era
 * original    scroll is the only clock: the camera's depth is a function of progress through the gap, eased so a
 *             stopped scroll holds a still tunnel; the tunnel fades in and out at the gap's ends, so it says "a
 *             machine bay is next" and never covers the bays themselves; it converges on the one vanishing point;
 *             in Full the camera covers the tunnel faster, the front rings burn amber in proportion to scroll speed,
 *             and a light shake rides ctx.share.shake (punch stays 0: the tunnel has no loud moment; Calm travels slower, no shake)
 * not         a time-looping screensaver, a raster tunnel, a texture-mapped tube. It never moves unless you do.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.17 to 0.24 ms/frame @ 1440x900 internal (dpr 1), headless desktop Chromium, parts page counter
 *             (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * rings squares sit at depths spacing apart. The camera travels travel units down the tunnel as progress goes from
 * 0 to 1; a ring's depth is its slot minus the camera, wrapped, so rings stream past and new ones appear at the far
 * end. Each ring is a square of half-size radius with dotsPerSide dots per side, turned by twist times its depth.
 * A dot at (x, y, z) lands at (vpX + f x / z, vpY + f y / z). Each ring's brightness falls with depth and rises
 * from zero over the last few units before the camera (the
 * mouth), so the nearest rings fade out instead of scattering past the screen edge like stars. Dots are sorted into
 * six brightness bins; each bin is one Path2D of small squares, stroked once for a halo and filled once for the core.
 * The tunnel's opacity is zero at both ends of the gap and full in the middle. Speed is the ride camera's eased
 * velocity; in Full it tints the two brightest bins' halos toward amber and drives a shake of up to shakePx.
 */
(() => {
  'use strict';
  const PARAMS = {
    rings: 20,
    dotsPerSide: 14,
    radius: 1.35,         /* square half-size, world units */
    spacing: 0.8,         /* depth between rings */
    travel: 42,           /* depth the camera covers across the whole gap (Full; Calm takes calmTravel of it) */
    calmTravel: 0.6,
    twist: 0.09,          /* radians of turn per unit of depth */
    zNear: 0.55,
    focalK: 0.62,
    dotPx: 2.4,           /* dot size in css px: dotPx * (0.55 + 1.6 / z) */
    settle: 0.3,
    rampIn: 0.12,
    mouth: 1.8,           /* depth over which a ring fades in as it nears the camera, so the tunnel has a clean mouth */
    stillProgress: 0.5,
    shakePx: 2,           /* css px at full speed, Full only */
    speedRef: 16,
  };
  const BINS = 6;
  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * params.focalK, px = 1, bd = 1, cam = -1, env = 0, speed = 0, clock = 0;
    function draw(camZ, envelope, hot, sx, sy) {
      const T = ctx.tokens;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      if (envelope <= 0.002) return;
      g.setTransform(1, 0, 0, 1, sx || 0, sy || 0);
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      const n = params.rings | 0, m = Math.max(2, params.dotsPerSide | 0), R = params.radius, sp = params.spacing;
      const span = n * sp;
      const paths = []; for (let b = 0; b < BINS; b++) paths.push(new Path2D());
      for (let i = 0; i < n; i++) {
        let z = (i * sp - camZ) % span; if (z < 0) z += span;
        z += params.zNear;
        const d = (z - params.zNear) / span;                              /* 0 near .. 1 far */
        const nearA = Math.min(1, (z - params.zNear) / Math.max(0.01, params.mouth));
        const al = (1 - 0.75 * d) * nearA * nearA * (3 - 2 * nearA);
        if (al < 0.04) continue;
        const bin = Math.min(BINS - 1, Math.round(al * (BINS - 1)));
        const ang = params.twist * (z + camZ * 0.35), c = Math.cos(ang), s = Math.sin(ang);
        const k = f / z, size = Math.max(1, params.dotPx * px * (0.55 + 1.6 / z)), hs = size / 2;
        const p = paths[bin];
        for (let side = 0; side < 4; side++) {
          for (let j = 0; j < m; j++) {
            const q = -R + (2 * R * j) / m;
            const lx = side === 0 ? q : side === 1 ? R : side === 2 ? -q : -R;
            const ly = side === 0 ? -R : side === 1 ? q : side === 2 ? R : -q;
            const x = lx * c - ly * s, y = lx * s + ly * c;
            const sx = vpX + x * k, sy = vpY + y * k;
            if (sx < -hs || sx > w + hs || sy < -hs || sy > h + hs) continue;
            p.rect(sx - hs, sy - hs, size, size);
          }
        }
      }
      for (let b = BINS - 1; b >= 0; b--) {
        const a = envelope * (b / (BINS - 1));
        const amber = hot > 0.02 && b >= BINS - 2;
        g.globalAlpha = a * (amber ? 0.3 + 0.35 * hot : 0.3); g.lineWidth = (amber ? 3 + 2 * hot : 3) * px; g.strokeStyle = amber ? T.amber : T.phosphor; g.stroke(paths[b]);
        g.globalAlpha = a; g.fillStyle = b === BINS - 1 ? T.phosphorCore : T.phosphor; g.fill(paths[b]);
      }
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    function envelopeAt(p) {
      const r = Math.max(0.01, params.rampIn);
      const e = Math.min(1, p / r) * Math.min(1, (1 - p) / r);
      return e * e * (3 - 2 * e);
    }
    return {
      tick(dt, t, progress) {
        const S = ctx.share, full = ctx.dial === 'full';
        const p = Math.max(0, Math.min(1, progress));
        const target = p * params.travel * (full ? 1 : params.calmTravel), k = 1 - Math.exp(-dt / Math.max(0.02, params.settle));
        if (cam < 0) cam = target; else cam += (target - cam) * k;
        env += (envelopeAt(p) - env) * k;
        const now = performance.now();
        S.warp = env * 0.5; S.warpAt = now;                               /* the sky dims its dots a little under the tunnel */
        const sp = full ? Math.min(1, Math.abs((ctx.camera && ctx.camera.v) || 0) / params.speedRef) : 0;
        speed += (sp - speed) * (1 - Math.exp(-dt / (sp > speed ? 0.06 : 0.35)));
        clock += dt;
        const amp = params.shakePx * env * speed;
        const sh = amp > 0.05 ? { x: amp * Math.sin(clock * 57.3), y: amp * Math.sin(clock * 71.9 + 1.1) } : null;
        S.punch = 0; S.shake = sh; S.punchAt = now;
        draw(cam, env, env * speed, sh ? sh.x * bd : 0, sh ? sh.y * bd : 0);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; bd = ndpr; px = Math.max(0.75, ndpr); f = h * params.focalK; },
      still() { const p = params.stillProgress; draw(p * params.travel, envelopeAt(p), 0, 0, 0); },
      destroy() { const S = ctx.share; S.warp = 0; S.warpAt = 0; S.punch = 0; S.shake = null; S.punchAt = 0; g.clearRect(0, 0, w, h); },
      params(p) { params = p; f = h * params.focalK; },
    };
  }
  BAYS.push({ slug: 'rings', title: 'Rings', order: 3, role: 'corridor', params: PARAMS, mount });
})();
