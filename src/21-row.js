/* BONEYARD PART · L2 · THE ROW
 * technique   1/z perspective light-grid with billboard vector pylons, all projected to one shared vanishing point
 * lineage     the Tron light-grid (Disney, 1982); the Battlezone horizon (Atari, 1980); the per-scanline perspective
 *             floor (Sega, Space Harrier, 1985; Super Nintendo Mode 7, 1990)
 * original    the pylons are the Desert Data Labs saguaro-circuit mark (site/assets/ddl-cactus-mark.svg) drawn as a
 *             1/z vector object at x = +-3 world units every 6 units; the grid's rate IS the ride's one clock
 *             (camera z comes from scroll plus a 0.4 unit/s idle cruise); every stroke is double-stroked (wide dim
 *             halo under a thin bright core) so the row glows without the tube post-pass
 * not         a raster floor: no scanlines, no texture, no fog sprite; lines only. Not a texture-mapped Mode 7 plane.
 * deps        none · Canvas 2D · 2026-09
 * budget      see docs/BUILD-LOG.md for the measured number @ 1440x900 x1.5 internal, desktop Chromium (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, cameraZ, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The camera sits camH world units above a ground plane and looks down the row. A ground point at lateral offset x
 * and distance d projects to (vpX + f * x / d, vpY + f * camH / d) with f = focalK * canvas height: the same 1/z the
 * whole site shares. Depth lines sit at every whole world unit; only their fractional offset from the camera changes
 * each frame, so the floor scrolls without ever running out of lines. Lateral lines are rays from the vanishing point.
 *
 * Pylons stand at x = +-pylonX every pylonEvery units. Each is the DDL mark as a set of polylines in a 96x96 box,
 * scaled by (f / d) * pylonH / 96 and planted at its projected foot. Everything fades with distance and the ground
 * below the horizon is painted opaque so the sky's stars end where the desert begins.
 */
(() => {
  'use strict';
  const PARAMS = {
    camH: 1.0,          /* camera height in world units */
    focalK: 0.62,       /* focal length as a fraction of canvas height */
    zLines: 44,         /* depth lines drawn ahead */
    xLines: 7,          /* lateral lines each side of centre */
    xSpacing: 1,        /* world units between lateral lines */
    pylonX: 3,          /* pylons at +- this x */
    pylonEvery: 6,      /* units between pylons */
    pylonH: 1.7,        /* pylon height, world units */
    haloWidth: 5,       /* px, the wide dim stroke */
    coreWidth: 1.1,     /* px, the bright stroke */
    haloAlpha: 0.16,
    coreAlpha: 0.85,
    nearBoost: 1.6,     /* alpha ~ nearBoost / d */
  };
  /* the mark: polylines in a 96-box, from site/assets/ddl-cactus-mark.svg (trunk, node-tipped arms, rail, chip) */
  const GLYPH = (() => {
    const chip = [];
    const x0 = 5.5, y0 = 5.5, x1 = 90.5, y1 = 90.5, r = 22, N = 5;
    const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; chip.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
    arc(x1 - r, y0 + r, -Math.PI / 2, 0); arc(x1 - r, y1 - r, 0, Math.PI / 2); arc(x0 + r, y1 - r, Math.PI / 2, Math.PI); arc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);
    chip.push(chip[0]);
    return [chip, [[48, 22], [48, 76]], [[48, 31], [59, 41], [48, 51], [37, 41], [48, 31]], [[36, 76], [60, 76]]];
  })();
  const NODE = [48, 41, 3.8];

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * params.focalK, px = 1;
    function stroke(path, alpha, wide) {
      g.lineWidth = wide ? params.haloWidth * px : params.coreWidth * px;
      g.globalAlpha = alpha * (wide ? params.haloAlpha : params.coreAlpha);
      g.stroke(path);
    }
    function draw(z) {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      /* the ground: opaque, so stars stop at the horizon */
      g.globalAlpha = 1; g.fillStyle = T.field; g.fillRect(0, Math.floor(vpY), w, h - Math.floor(vpY) + 1);
      g.lineCap = 'butt'; g.lineJoin = 'round';          /* butt caps on full-width lines: cheaper, invisible */
      const frac = z - Math.floor(z);
      /* depth lines, binned by alpha so each bin is one path */
      const bins = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const binA = [1, 0.55, 0.28, 0.12];
      for (let i = 0; i < params.zLines; i++) {
        const d = (1 - frac) + i;
        const y = vpY + f * params.camH / d;
        if (y > h + 2) continue;
        const a = Math.min(1, params.nearBoost / d) * (1 - d / params.zLines);
        const bi = a > 0.7 ? 0 : a > 0.4 ? 1 : a > 0.18 ? 2 : 3;
        bins[bi].moveTo(0, y); bins[bi].lineTo(w, y);
      }
      /* lateral rays from the vanishing point to below the frame */
      const rays = new Path2D();
      for (let i = -params.xLines; i <= params.xLines; i++) {
        const x = i * params.xSpacing;
        const dFar = params.zLines, dNear = 0.22;
        rays.moveTo(vpX + f * x / dFar, vpY + f * params.camH / dFar);
        rays.lineTo(vpX + f * x / dNear, vpY + f * params.camH / dNear);
      }
      for (const wide of [true, false]) {
        g.strokeStyle = wide ? T.phosphor : T.phosphorCore;
        for (let b = 0; b < 4; b++) stroke(bins[b], binA[b], wide);
        stroke(rays, 0.5, wide);
      }
      /* the horizon hairline */
      g.globalAlpha = 0.9; g.strokeStyle = T.phosphor; g.lineWidth = 1 * px;
      g.beginPath(); g.moveTo(0, vpY + 0.5); g.lineTo(w, vpY + 0.5); g.stroke();
      /* pylons: the mark at x = +-pylonX every pylonEvery units, nearest first is fine (no overlap in x) */
      g.lineCap = 'round';
      const first = Math.ceil((z + 0.35) / params.pylonEvery) * params.pylonEvery;
      const kBox = params.pylonH / 96;
      for (let zp = first; zp - z < params.zLines; zp += params.pylonEvery) {
        const d = zp - z;
        const s = f / d, k = s * kBox;
        const footY = vpY + f * params.camH / d;
        const a = Math.min(1, params.nearBoost / d) * (1 - d / params.zLines);
        if (a <= 0.02) continue;
        for (const side of [-1, 1]) {
          const footX = vpX + f * (side * params.pylonX) / d;
          const path = new Path2D();
          for (const poly of GLYPH) {
            path.moveTo(footX + (poly[0][0] - 48) * k, footY + (poly[0][1] - 96) * k);
            for (let i = 1; i < poly.length; i++) path.lineTo(footX + (poly[i][0] - 48) * k, footY + (poly[i][1] - 96) * k);
          }
          g.strokeStyle = T.phosphor; stroke(path, a, true);
          g.strokeStyle = T.phosphorCore; stroke(path, a, false);
          if (k * 96 > 14) { g.globalAlpha = a * params.coreAlpha; g.fillStyle = T.phosphorCore; g.beginPath(); g.arc(footX + (NODE[0] - 48) * k, footY + (NODE[1] - 96) * k, Math.max(0.6, NODE[2] * k), 0, Math.PI * 2); g.fill(); }
        }
      }
      g.globalAlpha = 1;
    }
    return {
      tick(dt, t, cameraZ) { draw(cameraZ); },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); f = h * params.focalK; },
      still() { draw(ctx.camera.z); },
      destroy() { g.clearRect(0, 0, w, h); },
      params(p) { params = p; f = h * params.focalK; },
    };
  }
  BAYS.push({ slug: 'row', title: 'The row', order: 2, role: 'layer', params: PARAMS, mount });
})();
