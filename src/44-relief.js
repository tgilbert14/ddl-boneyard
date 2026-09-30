/* BONEYARD PART · 05 · RELIEF
 * technique   scan-processor relief: 96 scanlines of the real Santa Catalina elevation grid, each lifted by height and
 *             drawn as double-stroked phosphor wire; hidden lines removed by filling each line's curtain (the vertical
 *             strip from the wire down to the base) with the field colour, far to near, the Unknown Pleasures way
 * lineage     the Rutt/Etra scan processor (Steve Rutt and Bill Etra, 1973), which bent each video scanline by its
 *             brightness; the CP 1919 pulsar stack (Harold Craft, 1970) that became the Unknown Pleasures cover (1979)
 * original    the scanlines are a real terrain grid (AWS Terrain Tiles, 768 x 768 at about 64 m), block-averaged to
 *             96 lines by 192 samples and held as an object in perspective on the site's one vanishing point; the
 *             curtains are parallel planes, so sorting them by distance along their normal makes the painter's
 *             order exact from every orbit angle; a low flyover camera (orbit plus a slow swell in height and distance)
 *             that a horizontal drag takes over and that comes back to the three-quarter view from the
 *             southwest (the Tucson side)
 * not         true scale: height is exaggerated (the factor is in the readout, never hidden) and the base sits at the
 *             grid's lowest cell, not sea level; block means soften the peaks, so the summit figure comes from the
 *             full-resolution grid, not from the drawn lines
 * deps        none · Canvas 2D · 2026-09
 * budget      1.6 to 2.0 ms/frame on the parts counter @ 1440x900 x1 internal, headless Chromium (2026-09-30); 390x844 at
 *             4x CPU (lite path): 8.0 to 8.4 ms JS, part page 44 to 47 fps; JS time only, not a real-GPU frame time
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The elevation grid arrives once through ctx.dem(). On arrival it is averaged into lines x samples blocks (each
 * block the mean of every cell inside it), and each sample becomes a 3D point: x east and z south in a box two units
 * across (the real 49.6 by 49.3 km footprint), y the height above the lowest cell times the vertical factor.
 *
 * A camera circles the box low, like a flyover of the scan: its elevation and distance swell slowly on two
 * unrelated periods while it orbits, and it always looks at a point just above the range, so the look point lands
 * on the shared vanishing point and the range fills the frame below the horizon line. Every frame the
 * 18,432 points are projected (one 3x3 rotation and a divide each). Lines are drawn from the farthest to the nearest:
 * first the curtain under the wire is filled with the field colour, which erases any farther wire it covers, then
 * the wire is stroked three times with additive light (a wide phosphor halo, a mid glow, a thin white-hot core),
 * dimmer with distance (on a phone-sized screen: fewer samples per line and two plain strokes, which keeps the
 * frame rate). The grid is rebuilt only when lines, samples or the vertical factor actually change, and
 * the readout always prints the factor the drawn mesh was built with.
 *
 * Horizontal drag (a touch drag only once it is clearly sideways, so vertical scrolling is never stolen) turns the
 * range. Let go and it waits, eases to the nearest three-quarter view, rests there, then resumes the slow orbit.
 */
(() => {
  'use strict';
  const PARAMS = {
    lines: 64,           /* scanlines, north to south (96 measured 26 fps; 64 x 128 holds the frame budget) */
    samples: 128,        /* samples along each line, west to east */
    exaggeration: 4,     /* vertical factor, printed in the readout */
    elevationDeg: 21,    /* camera elevation above the base plane (the middle of the swell) */
    elevSwing: 6,        /* +- degrees of the slow elevation swell, Full and Calm */
    distance: 2.55,      /* camera distance, box half-widths (the middle of the swell) */
    distSwing: 0.22,     /* +- box half-widths of the slow distance swell */
    lookY: 0.34,         /* height of the look point, which projects onto the vanishing point */
    fit: 0.98,           /* focal length as a fraction of min(1.7 x width, 1.5 x height) */
    orbitDegPerSec: 7,   /* slow auto-orbit (Calm halves) */
    homeDeg: -45,        /* the three-quarter view: camera to the southwest */
    returnAfter: 2.5,    /* seconds after a drag before it eases home */
    restAt: 7,           /* seconds resting at the three-quarter view before orbiting again */
    dragDegPerPx: 0.35,
    haloWidth: 5, glowWidth: 2.2, coreWidth: 1.1,
    haloAlpha: 0.2, glowAlpha: 0.45, coreAlpha: 1,
    farAlpha: 0.3,       /* alpha of the farthest line relative to the nearest */
    maxBackingWidth: 760,
    orbitFps: 30,        /* redraw rate while the camera drifts on its own; drags draw every frame */   /* px; above this the canvas renders smaller and CSS scales it up */
    liteSamples: 112,    /* samples per line when the smaller side is under 600 css px (phones) */
  };
  const COMPASS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];   /* camera bearing from the centre, yaw 0 = south, +90 = east */

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1, dead = false, sinceDraw = 1;
    let grid = null, pts = null, scr = null, L = 0, S = 0, vScale = 1, summitFt = 0, dem = null;
    let yaw = params.homeDeg, mode = 'orbit', idle = 0, drag = null, lastReadout = '', sinceReadout = 0;
    let swell = 0, built = null, lite = false;   /* lite: a small screen, fewer samples per line and two plain strokes */   /* built: the lines, samples and factor the current mesh was made with */

    function build() {
      if (!dem) return;
      built = { lines: params.lines, samples: params.samples, exaggeration: params.exaggeration };
      L = Math.max(8, Math.round(params.lines)); S = Math.max(16, Math.round(lite ? Math.min(params.samples, params.liteSamples) : params.samples));
      const W = dem.width, H = dem.height, e = dem.elev;
      /* the real footprint from catalinas-meta.json: 64.59 m per column, 64.16 m per row */
      const spanX = W * 64.5925, spanZ = H * 64.1593, half = spanX / 2;
      vScale = params.exaggeration / half;               /* metres -> box units, times the factor */
      grid = new Float32Array(L * S);
      for (let i = 0; i < L; i++) {
        const r0 = Math.floor(i * H / L), r1 = Math.max(r0 + 1, Math.floor((i + 1) * H / L));
        for (let j = 0; j < S; j++) {
          const c0 = Math.floor(j * W / S), c1 = Math.max(c0 + 1, Math.floor((j + 1) * W / S));
          let sum = 0, n = 0;
          for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) { sum += e[r * W + c]; n++; }
          grid[i * S + j] = sum / n - dem.min;
        }
      }
      pts = new Float32Array(L * S * 3);
      const zHalf = spanZ / spanX;
      for (let i = 0; i < L; i++) {
        const z = ((i + 0.5) / L * 2 - 1) * zHalf;
        for (let j = 0; j < S; j++) {
          const k = (i * S + j) * 3;
          pts[k] = (j + 0.5) / S * 2 - 1; pts[k + 1] = grid[i * S + j] * vScale; pts[k + 2] = z;
        }
      }
      scr = new Float32Array(L * S * 2);
      summitFt = Math.round(dem.max * 3.28084);
    }

    function view() {
      const A = yaw * Math.PI / 180;
      const E = (params.elevationDeg + params.elevSwing * Math.sin(swell * 0.27)) * Math.PI / 180;
      const D = params.distance + params.distSwing * Math.sin(swell * 0.19 + 1.3);
      const tx = 0, ty = params.lookY, tz = 0;
      const cx = tx + D * Math.cos(E) * Math.sin(A), cy = ty + D * Math.sin(E), cz = tz + D * Math.cos(E) * Math.cos(A);
      let fx = tx - cx, fy = ty - cy, fz = tz - cz; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;   /* right = forward x up (y up) */
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                  /* up = right x forward */
      return { cx, cy, cz, fx, fy, fz, rx, rz, ux, uy, uz };
    }

    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!pts) return;
      const T = ctx.tokens, V = view();
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      const f = Math.min(w * 1.7, h * 1.5) * params.fit;
      /* project every sample */
      for (let n = 0, m = L * S; n < m; n++) {
        const k = n * 3, dx = pts[k] - V.cx, dy = pts[k + 1] - V.cy, dz = pts[k + 2] - V.cz;
        const zc = dx * V.fx + dy * V.fy + dz * V.fz;
        const xc = dx * V.rx + dz * V.rz, yc = dx * V.ux + dy * V.uy + dz * V.uz;
        scr[n * 2] = vpX + f * xc / zc; scr[n * 2 + 1] = vpY - f * yc / zc;
      }
      const base = (x, z) => {
        const dx = x - V.cx, dy = -V.cy, dz = z - V.cz;
        const zc = dx * V.fx + dy * V.fy + dz * V.fz;
        return [vpX + f * (dx * V.rx + dz * V.rz) / zc, vpY - f * (dx * V.ux + dy * V.uy + dz * V.uz) / zc];
      };
      /* the curtains are the planes z = const; the camera's z decides the painter's order (farthest first) */
      const order = [];
      for (let i = 0; i < L; i++) order.push(i);
      const zOf = (i) => pts[(i * S) * 3 + 2];
      order.sort((a, b) => Math.abs(zOf(b) - V.cz) - Math.abs(zOf(a) - V.cz));
      const dNear = Math.abs(zOf(order[L - 1]) - V.cz), dFar = Math.max(dNear + 1e-3, Math.abs(zOf(order[0]) - V.cz));
      g.lineJoin = 'round'; g.lineCap = 'round';
      const halo = params.haloWidth * px, glow = params.glowWidth * px, core = params.coreWidth * px;
      for (let o = 0; o < L; o++) {
        const i = order[o], z = zOf(i), row = i * S * 2;
        const line = new Path2D();
        line.moveTo(scr[row], scr[row + 1]);
        for (let j = 1; j < S; j++) line.lineTo(scr[row + j * 2], scr[row + j * 2 + 1]);
        /* the curtain: the wire, then down to the base at the east end, across, and up at the west end */
        const curtain = new Path2D(line);
        const bE = base(pts[(i * S + S - 1) * 3], z), bW = base(pts[(i * S) * 3], z);
        curtain.lineTo(bE[0], bE[1]); curtain.lineTo(bW[0], bW[1]); curtain.closePath();
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = T.field; g.fill(curtain);
        const q = (Math.abs(z - V.cz) - dNear) / (dFar - dNear);           /* 0 near, 1 far */
        const a = 1 - (1 - params.farAlpha) * q;
        if (!lite) g.globalCompositeOperation = 'lighter';
        g.strokeStyle = T.phosphor; g.lineWidth = halo; g.globalAlpha = a * params.haloAlpha; g.stroke(line);
        if (!lite) { g.lineWidth = glow; g.globalAlpha = a * params.glowAlpha; g.stroke(line); }
        g.strokeStyle = T.phosphorCore; g.lineWidth = core; g.globalAlpha = a * params.coreAlpha; g.stroke(line);
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }

    function readout() {
      if (!dem || !built) return;
      const a = ((yaw % 360) + 360 + 22.5) % 360;
      const text = `${L} scanlines · ${dem.width} x ${dem.height} grid · summit ${summitFt.toLocaleString('en-US')} ft · ${built.exaggeration}x vertical · seen from the ${COMPASS[Math.floor(a / 45)]}`;
      if (text !== lastReadout || sinceReadout > 0.5) { lastReadout = text; sinceReadout = 0; ctx.readout('relief', text); }
    }

    /* the host throttles readouts on the leading edge; one trailing emit makes sure the Still frame's line lands */
    let flushT = 0;
    const flushLater = () => { clearTimeout(flushT); flushT = setTimeout(() => { if (!dead) { lastReadout = ''; readout(); } }, 400); };
    ctx.dem().then((d) => { if (dead) return; dem = d; build(); readout(); draw(); flushLater(); }).catch(() => {});

    const nearestHome = () => params.homeDeg + Math.round((yaw - params.homeDeg) / 360) * 360;

    return {
      tick(dt, t, progress, pointer) {
        const calm = ctx.dial === 'calm' ? 0.5 : 1;
        swell += dt * calm;
        /* drag: arms only when the move is clearly sideways (|dx| > 8 and |dx| > |dy|) */
        if (pointer.down) {
          if (!drag) drag = { x0: pointer.x, y0: pointer.y, yaw0: yaw, armed: false, dead: false };
          const dx = pointer.x - drag.x0, dy = pointer.y - drag.y0;
          if (!drag.armed && !drag.dead) {
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { drag.armed = true; drag.x0 = pointer.x; drag.yaw0 = yaw; }
            else if (Math.abs(dy) > 8) drag.dead = true;                 /* a vertical gesture belongs to the page */
          }
          if (drag.armed) { yaw = drag.yaw0 - (pointer.x - drag.x0) * params.dragDegPerPx; mode = 'held'; idle = 0; }
        } else if (drag) { drag = null; }
        if (!drag || !drag.armed) {
          idle += dt;
          if (mode === 'held' && idle > params.returnAfter) mode = 'return';
          if (mode === 'return') {
            const target = nearestHome(), k = 1 - Math.exp(-dt / 0.6);
            yaw += (target - yaw) * k;
            if (Math.abs(target - yaw) < 0.05) { yaw = target; mode = 'rest'; idle = 0; }
          } else if (mode === 'rest') {
            if (idle > params.restAt) mode = 'orbit';
          } else if (mode === 'orbit') {
            yaw += params.orbitDegPerSec * calm * dt;
          }
        }
        sinceReadout += dt; sinceDraw += dt;
        const moving = pointer && pointer.down;
        if (moving || sinceDraw >= 1 / params.orbitFps) { sinceDraw = 0; draw(); }
        readout();
      },
      resize(nw, nh, ndpr) {
        /* cap the backing store: the wide glow strokes are raster-bound (measured 10 fps at 1440x900 on a real
           GPU with JS at 2 ms); CSS scales the canvas back up smoothly, and the glow tolerates the softness */
        const k = Math.min(1, params.maxBackingWidth / Math.max(1, nw));
        if (k < 1) { canvas.width = Math.round(nw * k); canvas.height = Math.round(nh * k); }
        w = canvas.width; h = canvas.height; px = Math.max(0.5, ndpr * k);
        const was = lite; lite = Math.min(w, h) / px < 600;
        if (was !== lite && dem) build();
      },
      still() { yaw = params.homeDeg; mode = 'rest'; idle = 0; swell = 0; draw(); readout(); flushLater(); },
      destroy() { dead = true; clearTimeout(flushT); g.clearRect(0, 0, w, h); grid = pts = scr = null; dem = null; },
      params(p) {
        /* compare against what the mesh was BUILT with: the harness and ?dev=1 mutate the params object in place */
        params = p;
        if (!built || p.lines !== built.lines || p.samples !== built.samples || p.exaggeration !== built.exaggeration) build();
        lastReadout = ''; readout(); draw();
      },
    };
  }
  BAYS.push({ slug: 'relief', title: 'Relief', order: 5, role: 'bay', params: PARAMS, mount, dem: true });
})();
