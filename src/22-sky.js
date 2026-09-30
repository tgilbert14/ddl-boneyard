/* BONEYARD PART · L3 · THE SKY
 * technique   deterministic two-plane 1/z starfield with three fixed magnitude classes and a broad oblique stellar lane, drifting with camera z above a 24-stop horizon band tinted by the visitor's local hour
 * lineage     Star Raiders (Atari, 1979) and Galaga (Namco, 1981) multi-plane stars
 * original    the stars share the row's vanishing point and camera, so they stream outward at cruise and are the SAME
 *             points HYPERSPACE streaks (published on ctx.share.stars); the horizon band is a clock, not weather: 24
 *             colour stops indexed by the real local hour (pre-dawn indigo, dawn amber, day pale, dusk orange, night
 *             blue-black). The ground stays black at every hour and the band's alpha caps at bandAlpha, so daytime
 *             reads as a pale grey-blue line on the horizon, never as daylight; the ramp is NOT clamped to dusk-night
 *             (clampDay: false) because at this alpha the day stops read as "a bright horizon at noon", which is honest.
 *             The seeded composition has sparse bright anchors, a middle field and fine distant dust, with no random
 *             flicker; reloading or drawing a still produces the same sky. Set clampDay to hold the daytime tint near dawn or dusk. In Full the stars fly with the row (speedGain plus a
 *             cruise, and warp multiplies it through HYPERSPACE), and at speed the near plane draws as short streaks.
 *             The sky is also the housekeeper of the shared punch: a stale ctx.share.punch / shake (no writer this
 *             frame) is zeroed here, so a switched-off room never leaves the world shaking.
 * not         twinkle (churn), a skybox, a moon, weather. No random flicker of any kind.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.12 ms/frame JS avg (1.2 max) @ 1440x900 dpr 1, headless desktop Chromium (2026-09-30); raster not in this number; phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, cameraZ, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Each star is a camera-space point (x, y, z) with y above the ground plane and z between zNear and zFar. A fixed seeded
 * generator assigns one of three apparent magnitudes and places a restrained minority near an oblique broad lane; this
 * creates astronomical hierarchy and composition without claiming a real constellation or adding labels. It projects
 * to (vpX + f * x / z, vpY - f * y / z), the same projection as the row. Each frame z decreases by the camera's
 * travel times the plane's factor (far plane slow, near plane fast); a star that passes zNear respawns at zFar, so
 * the field never thins. The buffers are published on ctx.share.stars so HYPERSPACE and JUMP can streak the very same
 * points, and ctx.share.warp (written by them) dims the dots as the streaks take over.
 *
 * The horizon band is a vertical gradient from transparent down to the hour's tint at the horizon line. The tint is a
 * linear blend between the two nearest of 24 stops (one per hour), so it drifts continuously through the evening.
 * The core also mirrors the tint to --horizon-tint for the CSS floor.
 *
 * Shake: HYPERSPACE and JUMP write ctx.share.shake ({x, y} css px) with a timestamp; every layer draws at that
 * offset. The sky ticks first among the layers, and it clears any stamp older than 60 ms. ctx.share.punch is a
 * transient 0..1 (writers spike it and decay it); the sky also folds in the switch flash (ctx.share.flashAt).
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
    speedGain: 2.2,             /* Full: star travel per unit of ride camera travel (the row's number) */
    cruiseFull: 3.2,            /* Full: idle flight, units per second (the row's number) */
    warpGain: 5,                /* Full: travel multiplier at warp 1 */
    streakK: 1.6,               /* Full: near-plane streak length at full speed, world units */
  };
  /* 24 hour stops, index = local hour (dim on purpose: the yard is a night place) */
  const HOURS = ['#0b1030', '#0a0f2e', '#090e2c', '#0a1030', '#101538', '#2a1e4a', '#7a4a3a', '#9a6a3c', '#6f6a5a', '#55606a', '#4a5f75', '#4a6078',
    '#4a6078', '#4a6078', '#4d5f74', '#5a5f6c', '#6e5a52', '#8a5a3c', '#a0522d', '#7a3550', '#3a2a5a', '#1a2050', '#0f1640', '#0c1236'];
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, fallback) => Number.isFinite(+v) ? +v : fallback;
  const FIELD_KEYS = ['far', 'near', 'spread', 'yMin', 'yMax', 'zNear', 'zFar'];
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * finite(params.focalK, 0.62), px = 1, bd = 1;
    let far = null, near = null, farMag = null, nearMag = null, snap = null, field = null, random = seeded(0x51a7f00d);
    function fieldValues() {
      const zNear = clamp(finite(params.zNear, 1.2), 0.1, 20), zFar = Math.max(zNear + 1, clamp(finite(params.zFar, 40), 2, 160));
      const yMin = clamp(finite(params.yMin, 0.12), 0, 30), yMax = Math.max(yMin + 0.1, clamp(finite(params.yMax, 7.5), 0.1, 40));
      return {
        far: clamp(Math.round(finite(params.far, 300)), 0, 1200), near: clamp(Math.round(finite(params.near, 120)), 0, 800),
        spread: clamp(finite(params.spread, 10), 0.5, 40), yMin, yMax, zNear, zFar,
      };
    }
    function spawn(a, mag, i, anyZ) {
      const lane = random() < 0.27;
      const x = (random() * 2 - 1) * field.spread;
      let y = field.yMin + random() * (field.yMax - field.yMin);
      if (lane) {
        const mid = field.yMin + (field.yMax - field.yMin) * (0.52 + x / field.spread * 0.16);
        y = clamp(mid + (random() + random() - 1) * (field.yMax - field.yMin) * 0.13, field.yMin, field.yMax);
      }
      a[i * 3] = x;
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = anyZ ? field.zNear + random() * (field.zFar - field.zNear) : field.zFar;
      const q = random(); mag[i] = q > 0.965 ? 2 : q > 0.69 ? 1 : 0;
    }
    const shared = { get far() { return far; }, get near() { return near; }, get f() { return f; }, get w() { return w; }, get h() { return h; }, get zNear() { return field.zNear; }, get zFar() { return field.zFar; } };
    function rebuild(force) {
      const next = fieldValues();
      if (!force && snap && FIELD_KEYS.every((k) => next[k] === snap[k])) return false;
      field = next; snap = Object.assign({}, next); random = seeded(0x51a7f00d);
      far = new Float32Array(field.far * 3); near = new Float32Array(field.near * 3);
      farMag = new Uint8Array(field.far); nearMag = new Uint8Array(field.near);
      for (let i = 0; i < field.far; i++) spawn(far, farMag, i, true);
      for (let i = 0; i < field.near; i++) spawn(near, nearMag, i, true);
      if (ctx.share.stars !== shared) ctx.share.stars = shared;
      return true;
    }
    rebuild(true);
    function tint(hour) {
      let hh = hour;
      if (params.clampDay && hh > 8 && hh < 17) hh = hh < 12.5 ? 8 : 17;
      const i0 = Math.floor(hh) % 24, i1 = (i0 + 1) % 24, k = hh - Math.floor(hh);
      const a = hex(HOURS[i0]), b = hex(HOURS[i1]);
      return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
    }
    function advance(a, mag, dz) {
      const n = a.length / 3, range = field.zFar - field.zNear;
      for (let i = 0; i < n; i++) {
        let z = a[i * 3 + 2] - dz;
        if (z < field.zNear) { spawn(a, mag, i, false); z = field.zFar - (field.zNear - z) % range; }
        else if (z > field.zFar) z -= range;
        a[i * 3 + 2] = z;
      }
    }
    function drawPlane(a, mag, dot, alpha, colour, vpX, vpY, streak) {
      const n = a.length / 3, paths = [new Path2D(), new Path2D(), new Path2D()], crosses = new Path2D();
      if (streak > 0.02) {                                   /* speed streaks: head at z, tail at z + streak */
        for (let i = 0; i < n; i++) {
          const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
          const sx = vpX + f * x / z, sy = vpY - f * y / z;
          if (sx < -2 || sx > w + 2 || sy < -2 || sy > vpY) continue;
          const z2 = z + streak;
          const path = paths[mag[i]];
          path.moveTo(vpX + f * x / z2, vpY - f * y / z2); path.lineTo(sx, sy);
        }
        g.strokeStyle = colour; g.lineCap = 'round';
        for (let b = 0; b < 3; b++) { g.globalAlpha = alpha * [0.38, 0.7, 1][b]; g.lineWidth = dot * px * [0.65, 1, 1.45][b]; g.stroke(paths[b]); }
        return;
      }
      for (let i = 0; i < n; i++) {
        const z = a[i * 3 + 2], b = mag[i], depth = 1 - (z - field.zNear) / (field.zFar - field.zNear);
        const sx = vpX + f * a[i * 3] / z, sy = vpY - f * a[i * 3 + 1] / z;
        if (sx < -2 || sx > w + 2 || sy < -2 || sy > vpY) continue;
        const s = dot * px * [0.58, 0.95, 1.45][b] * (0.82 + depth * 0.28);
        paths[b].rect(sx - s * 0.5, sy - s * 0.5, s, s);
        if (b === 2 && s > 1.15 * px) { const r = s * 1.65; crosses.moveTo(sx - r, sy); crosses.lineTo(sx + r, sy); crosses.moveTo(sx, sy - r); crosses.lineTo(sx, sy + r); }
      }
      g.fillStyle = colour;
      for (let b = 0; b < 3; b++) { g.globalAlpha = alpha * [0.34, 0.68, 1][b]; g.fill(paths[b]); }
      g.strokeStyle = colour; g.globalAlpha = alpha * 0.34; g.lineWidth = Math.max(0.55, 0.55 * px); g.stroke(crosses);
    }
    function draw(streak, sx, sy) {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.clearRect(0, 0, w, h);          /* the field gradient is CSS on the stage: zero fill cost here */
      g.setTransform(1, 0, 0, 1, sx || 0, sy || 0);
      const warp = clamp(ctx.share.warp || 0, 0, 1), dim = 1 - warp * 0.85;
      drawPlane(far, farMag, clamp(finite(params.dotFar, 1), 0.1, 8), clamp(finite(params.alphaFar, 0.55), 0, 1) * dim, T.phosphorCore, vpX, vpY, 0);
      drawPlane(near, nearMag, clamp(finite(params.dotNear, 1.7), 0.1, 8), clamp(finite(params.alphaNear, 0.9), 0, 1) * dim, T.phosphor, vpX, vpY, streak || 0);
      /* the hour band */
      const c = tint(finite(ctx.hour, 0));
      ctx.share.horizonTint = `rgb(${c[0]},${c[1]},${c[2]})`;
      const bandH = clamp(finite(params.band, 0.13), 0, 0.8) * h;
      const bandAlpha = clamp(finite(params.bandAlpha, 0.5), 0, 1);
      const gr = g.createLinearGradient(0, vpY - bandH, 0, vpY);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},${bandAlpha})`);
      g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(-16, vpY - bandH, w + 32, bandH + 1);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    return {
      tick(dt) {
        rebuild(false);
        const S = ctx.share, now = performance.now(), full = ctx.dial === 'full';
        /* housekeeping: a punch or warp nobody wrote this frame is stale (its room switched off) */
        const fresh = S.punchAt && now - S.punchAt <= 60;
        if (!fresh) { S.punch = 0; S.shake = null; S.punchAt = 0; }
        if (S.warpAt && now - S.warpAt > 60) { S.warp = 0; S.warpAt = 0; }
        /* a switch flash (30-switch stamps flashAt) is a punch moment too: 1 at the flash, 120 ms decay */
        const fl = S.flashAt && now - S.flashAt < 450 ? Math.exp(-(now - S.flashAt) / 120) : 0;
        if (fl) S.punch = Math.max(fresh ? S.punch || 0 : 0, fl);
        const warp = clamp(S.warp || 0, 0, 1), speed = clamp(finite(S.speed, 0), 0, 1);
        const v = finite(ctx.camera && ctx.camera.v, 0);
        const base = full ? v * clamp(finite(params.speedGain, 2.2), -20, 20) + clamp(finite(params.cruiseFull, 3.2), -100, 100) : v;
        const dz = clamp(base, -500, 500) * (1 + warp * clamp(finite(params.warpGain, 5), 0, 20)) * clamp(finite(dt, 0), 0, 0.25);
        if (dz !== 0) { advance(far, farMag, dz * clamp(finite(params.farFactor, 0.12), 0, 4)); advance(near, nearMag, dz * clamp(finite(params.nearFactor, 0.45), 0, 4)); }
        const streak = full && warp < 0.3 ? speed * clamp(finite(params.streakK, 1.6), 0, 12) * (1 - warp / 0.3) : 0;
        const sh = S.shake;
        draw(streak, sh ? sh.x * bd : 0, sh ? sh.y * bd : 0);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; bd = ndpr; px = Math.max(0.75, ndpr); f = h * clamp(finite(params.focalK, 0.62), 0.1, 2); },
      still() { draw(0, 0, 0); },
      destroy() { g.clearRect(0, 0, w, h); if (ctx.share.stars === shared) delete ctx.share.stars; far = near = farMag = nearMag = null; },
      params(p) { params = p || PARAMS; rebuild(false); f = h * clamp(finite(params.focalK, 0.62), 0.1, 2); },
    };
  }
  BAYS.push({ slug: 'sky', title: 'The sky', order: 0, role: 'layer', params: PARAMS, mount });
})();
