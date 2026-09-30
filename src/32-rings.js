/* BONEYARD PART · C3 · RINGS
 * technique   the dot tunnel: concentric squares of dots at fixed depths, projected by 1/z onto the shared vanishing
 *             point, each ring rotated by an angle that grows with its depth, so the far end of the tunnel twists
 * lineage     the demoscene dot tunnel (Amiga and PC intros, about 1991); the 1/z projection it shares with every
 *             starfield of the era
 * original    scroll is the only clock: the camera's depth is a function of progress through the gap, eased so a
 *             stopped scroll holds a still tunnel; the tunnel fades in and out at the gap's ends, so it says "a
 *             machine bay is next" and never covers the bays themselves; it converges on the one vanishing point
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
 * The tunnel's opacity is zero at both ends of the gap and full in the middle.
 */
(() => {
  'use strict';
  const PARAMS = {
    rings: 20,
    dotsPerSide: 14,
    radius: 1.35,         /* square half-size, world units */
    spacing: 0.8,         /* depth between rings */
    travel: 26,           /* depth the camera covers across the whole gap */
    twist: 0.09,          /* radians of turn per unit of depth */
    zNear: 0.55,
    focalK: 0.62,
    dotPx: 2.4,           /* dot size in css px: dotPx * (0.55 + 1.6 / z) */
    settle: 0.3,
    rampIn: 0.12,
    mouth: 1.8,           /* depth over which a ring fades in as it nears the camera, so the tunnel has a clean mouth */
    stillProgress: 0.5,
  };
  const BINS = 6;
  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * params.focalK, px = 1, cam = -1, env = 0;
    function draw(camZ, envelope) {
      const T = ctx.tokens;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      if (envelope <= 0.002) return;
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
        g.globalAlpha = a * 0.3; g.fillStyle = T.phosphor; g.lineWidth = 3 * px; g.strokeStyle = T.phosphor; g.stroke(paths[b]);
        g.globalAlpha = a; g.fillStyle = b === BINS - 1 ? T.phosphorCore : T.phosphor; g.fill(paths[b]);
      }
      g.globalAlpha = 1;
    }
    function envelopeAt(p) {
      const r = Math.max(0.01, params.rampIn);
      const e = Math.min(1, p / r) * Math.min(1, (1 - p) / r);
      return e * e * (3 - 2 * e);
    }
    return {
      tick(dt, t, progress) {
        const p = Math.max(0, Math.min(1, progress));
        const target = p * params.travel, k = 1 - Math.exp(-dt / Math.max(0.02, params.settle));
        if (cam < 0) cam = target; else cam += (target - cam) * k;
        env += (envelopeAt(p) - env) * k;
        ctx.share.warp = env * 0.5;                                       /* the sky dims its dots a little under the tunnel */
        draw(cam, env);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); f = h * params.focalK; },
      still() { const p = params.stillProgress; draw(p * params.travel, envelopeAt(p)); },
      destroy() { ctx.share.warp = 0; g.clearRect(0, 0, w, h); },
      params(p) { params = p; f = h * params.focalK; },
    };
  }
  BAYS.push({ slug: 'rings', title: 'Rings', order: 3, role: 'corridor', params: PARAMS, mount });
})();
