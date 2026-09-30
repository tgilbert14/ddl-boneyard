/* BONEYARD PART · L3 · THE SKY
 * technique   two-plane 1/z starfield drifting with camera z, plus a 24-stop horizon band tinted by the visitor's local hour
 * lineage     Star Raiders (Atari, 1979) and Galaga (Namco, 1981) multi-plane stars
 * original    the stars share the row's vanishing point and camera, so they stream outward at cruise and are the SAME
 *             points HYPERSPACE streaks (published on ctx.share.stars); the horizon band is a clock, not weather: 24
 *             colour stops indexed by the real local hour (pre-dawn indigo, dawn amber, day pale, dusk orange, night
 *             blue-black). The ground stays black at every hour and the band's alpha caps at bandAlpha, so daytime
 *             reads as a pale grey-blue line on the horizon, never as daylight; the ramp is NOT clamped to dusk-night
 *             (clampDay: false) because at this alpha the day stops read as "a bright horizon at noon", which is honest.
 *             Flip clampDay if arwen's retune disagrees.
 * not         twinkle (churn), a skybox, a moon, weather. No random flicker of any kind.
 * deps        none · Canvas 2D · 2026-09
 * budget      see docs/BUILD-LOG.md for the measured number @ 1440x900 x1.5 internal, desktop Chromium (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, cameraZ, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Each star is a camera-space point (x, y, z) with y above the ground plane and z between zNear and zFar. It projects
 * to (vpX + f * x / z, vpY - f * y / z), the same projection as the row. Each frame z decreases by the camera's
 * travel times the plane's factor (far plane slow, near plane fast); a star that passes zNear respawns at zFar, so
 * the field never thins. The buffers are published on ctx.share.stars so HYPERSPACE and JUMP can streak the very same
 * points, and ctx.share.warp (written by them) dims the dots as the streaks take over.
 *
 * The horizon band is a vertical gradient from transparent down to the hour's tint at the horizon line. The tint is a
 * linear blend between the two nearest of 24 stops (one per hour), so it drifts continuously through the evening.
 * The core also mirrors the tint to --horizon-tint for the CSS floor.
 */
(() => {
  'use strict';
  const PARAMS = {
    far: 300, near: 120,        /* stars per plane */
    farFactor: 0.12, nearFactor: 0.45,
    spread: 10,                 /* lateral half-width, world units */
    yMin: 0.12, yMax: 7.5,      /* height above the ground, world units */
    zNear: 1.2, zFar: 40,
    focalK: 0.62,               /* the row's focal, so the two agree */
    dotFar: 1.0, dotNear: 1.7,  /* px */
    alphaFar: 0.55, alphaNear: 0.9,
    band: 0.13,                 /* band height, fraction of canvas height */
    bandAlpha: 0.5,
    clampDay: false,
  };
  /* 24 hour stops, index = local hour (dim on purpose: the yard is a night place) */
  const HOURS = ['#0b1030', '#0a0f2e', '#090e2c', '#0a1030', '#101538', '#2a1e4a', '#7a4a3a', '#9a6a3c', '#6f6a5a', '#55606a', '#4a5f75', '#4a6078',
    '#4a6078', '#4a6078', '#4d5f74', '#5a5f6c', '#6e5a52', '#8a5a3c', '#a0522d', '#7a3550', '#3a2a5a', '#1a2050', '#0f1640', '#0c1236'];
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * params.focalK, px = 1;
    const seed = (n) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) spawn(a, i, true); return a; };
    function spawn(a, i, anyZ) {
      a[i * 3] = (Math.random() * 2 - 1) * params.spread;
      a[i * 3 + 1] = params.yMin + Math.random() * (params.yMax - params.yMin);
      a[i * 3 + 2] = anyZ ? params.zNear + Math.random() * (params.zFar - params.zNear) : params.zFar;
    }
    const far = seed(params.far), near = seed(params.near);
    ctx.share.stars = { far, near, get f() { return f; }, get w() { return w; }, get h() { return h; }, zNear: params.zNear, zFar: params.zFar };
    function tint(hour) {
      let hh = hour;
      if (params.clampDay && hh > 8 && hh < 17) hh = hh < 12.5 ? 8 : 17;
      const i0 = Math.floor(hh) % 24, i1 = (i0 + 1) % 24, k = hh - Math.floor(hh);
      const a = hex(HOURS[i0]), b = hex(HOURS[i1]);
      return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
    }
    function advance(a, n, dz) {
      const range = params.zFar - params.zNear;
      for (let i = 0; i < n; i++) {
        let z = a[i * 3 + 2] - dz;
        if (z < params.zNear) { spawn(a, i, false); z = params.zFar - (params.zNear - z) % range; }
        else if (z > params.zFar) z -= range;
        a[i * 3 + 2] = z;
      }
    }
    function drawPlane(a, n, dot, alpha, vpX, vpY) {
      g.globalAlpha = alpha;
      const s = dot * px;
      for (let i = 0; i < n; i++) {
        const z = a[i * 3 + 2];
        const sx = vpX + f * a[i * 3] / z, sy = vpY - f * a[i * 3 + 1] / z;
        if (sx < -2 || sx > w + 2 || sy < -2 || sy > vpY) continue;
        g.fillRect(sx, sy, s, s);
      }
    }
    function draw() {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.clearRect(0, 0, w, h);          /* the field gradient is CSS on the stage: zero fill cost here */
      const warp = ctx.share.warp || 0;
      g.fillStyle = T.phosphorCore;
      drawPlane(far, params.far, params.dotFar, params.alphaFar * (1 - warp * 0.85), vpX, vpY);
      g.fillStyle = T.phosphor;
      drawPlane(near, params.near, params.dotNear, params.alphaNear * (1 - warp * 0.85), vpX, vpY);
      /* the hour band */
      const c = tint(ctx.hour);
      ctx.share.horizonTint = `rgb(${c[0]},${c[1]},${c[2]})`;
      const bandH = params.band * h;
      const gr = g.createLinearGradient(0, vpY - bandH, 0, vpY);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},${params.bandAlpha})`);
      g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, vpY - bandH, w, bandH + 1);
    }
    return {
      tick(dt) {
        const dz = ctx.camera.v * dt;
        if (dz !== 0) { advance(far, params.far, dz * params.farFactor); advance(near, params.near, dz * params.nearFactor); }
        draw();
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); f = h * params.focalK; },
      still() { draw(); },
      destroy() { g.clearRect(0, 0, w, h); if (ctx.share.stars && ctx.share.stars.far === far) delete ctx.share.stars; },
      params(p) { params = p; f = h * params.focalK; },
    };
  }
  BAYS.push({ slug: 'sky', title: 'The sky', order: 0, role: 'layer', params: PARAMS, mount });
})();
