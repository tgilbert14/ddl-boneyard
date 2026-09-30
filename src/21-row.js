/* BONEYARD PART · L2 · THE ROW
 * technique   1/z perspective survey-grid with major traverses, registration crosses, DDL pylons and three original salvage-observatory markers, all projected to one shared vanishing point
 * lineage     the Tron light-grid (Disney, 1982); the Battlezone horizon (Atari, 1980); the per-scanline perspective
 *             floor (Sega, Space Harrier, 1985; Super Nintendo Mode 7, 1990)
 * original    the pylons are the Desert Data Labs saguaro-circuit mark (site/assets/ddl-cactus-mark.svg), joined by
 *             new survey stakes, dish tripods and low equipment sleds drawn for this yard. All are 1/z vector objects
 *             close beside the line of flight, so they establish scale and whip past the lens; the floor's rate IS the
 *             ride's one clock (camera velocity from scroll), multiplied in Full so the cruise flies; scroll speed
 *             kicks the camera (it drops toward the deck and the lens widens, eased); every stroke is double-stroked
 *             (wide dim halo under a thin bright core) so the row glows without the tube post-pass
 * not         a raster floor: no scanlines, no texture, no fog sprite; lines only. Not a texture-mapped Mode 7 plane.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.09 ms/frame JS avg (1.4 max) @ 1440x900 dpr 1, headless desktop Chromium (2026-09-30); raster not in this number; phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, cameraZ, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The camera sits camH world units above a ground plane and looks down the row. A ground point at lateral offset x
 * and distance d projects to (vpX + f * x / d, vpY + f * camH / d) with f = focalK * canvas height: the same 1/z the
 * whole site shares. Depth lines sit at every whole world unit; only their fractional offset from the camera changes
 * each frame, so the floor scrolls without ever running out of lines. Lateral lines are rays from the vanishing point.
 *
 * The row integrates the ride camera's velocity: in Full times speedGain plus a cruise, in Calm at the ride's own
 * rate, so scrolling back always runs the floor backward. The eased speed (fast attack, slow release) is the kick:
 * the camera drops by kickDrop of its height and the focal shortens by kickFov, the two cues a racing game uses for
 * speed. Pylons stand at x = +-pylonX every pylonEvery units, each the DDL mark as polylines in a 96x96 box scaled
 * by (f / d) * pylonH / 96; at speed each leaves one dim smear copy a little further down the row. Every fourth
 * ground traverse is a restrained amber survey line with registration crosses, while the sparse salvage markers
 * alternate sides and silhouettes on their own interval. If a corridor
 * publishes a camera shake (ctx.share.shake, css px) the whole layer draws at that offset.
 */
(() => {
  'use strict';
  const PARAMS = {
    camH: 1.0,          /* camera height in world units */
    focalK: 0.62,       /* focal length as a fraction of canvas height */
    zLines: 32,         /* depth lines drawn ahead */
    xLines: 7,          /* lateral lines each side of centre */
    xSpacing: 1,        /* world units between lateral lines */
    majorEvery: 4,      /* every nth depth traverse is a survey major */
    pylonX: 3.8,        /* pylons at +- this x: close to the line of flight, so they whip past */
    pylonEvery: 6,      /* units between pylons */
    pylonH: 1.3,        /* pylon height, world units */
    propEvery: 11,      /* sparse original salvage markers */
    propX: 3.05,
    propH: 0.72,
    haloWidth: 5,       /* px, the wide dim stroke */
    coreWidth: 1.1,     /* px, the bright stroke */
    haloAlpha: 0.09,
    coreAlpha: 0.6,
    nearBoost: 1.6,     /* alpha ~ nearBoost / d */
    speedGain: 2.2,     /* Full: floor travel per unit of ride camera travel */
    cruiseFull: 3.2,    /* Full: extra idle flight, units per second */
    kickRef: 14,        /* units per second of ride camera speed that reads as a full kick */
    kickDrop: 0.32,     /* fraction of camH the camera drops at full kick */
    kickFov: 0.2,       /* fraction the focal shortens at full kick */
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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, fallback) => Number.isFinite(+v) ? +v : fallback;

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1, bd = 1;
    let z = null, speed = 0;
    function stroke(path, alpha, wide, mul) {
      g.lineWidth = clamp(finite(wide ? params.haloWidth : params.coreWidth, wide ? 5 : 1.1), 0.1, 30) * px * clamp(finite(mul, 1), 0.1, 8);
      g.globalAlpha = clamp(finite(alpha, 0), 0, 1) * clamp(finite(wide ? params.haloAlpha : params.coreAlpha, wide ? 0.09 : 0.6), 0, 1);
      g.stroke(path);
    }
    function glyphPath(footX, footY, k) {
      const path = new Path2D();
      for (const poly of GLYPH) {
        path.moveTo(footX + (poly[0][0] - 48) * k, footY + (poly[0][1] - 96) * k);
        for (let i = 1; i < poly.length; i++) path.lineTo(footX + (poly[i][0] - 48) * k, footY + (poly[i][1] - 96) * k);
      }
      return path;
    }
    function propPath(kind, footX, footY, k, side) {
      const p = new Path2D(), s = side || 1;
      if (kind === 0) {                         /* survey stake with a sighting bar and two braced feet */
        p.moveTo(footX, footY); p.lineTo(footX, footY - k * 0.72);
        p.moveTo(footX - k * 0.18, footY - k * 0.58); p.lineTo(footX + k * 0.18, footY - k * 0.58);
        p.moveTo(footX, footY - k * 0.18); p.lineTo(footX - k * 0.2, footY);
        p.moveTo(footX, footY - k * 0.18); p.lineTo(footX + k * 0.2, footY);
      } else if (kind === 1) {                  /* a dish on a low desert tripod */
        const top = footY - k * 0.53;
        p.moveTo(footX, footY); p.lineTo(footX, top);
        p.moveTo(footX, footY - k * 0.2); p.lineTo(footX - k * 0.24, footY);
        p.moveTo(footX, footY - k * 0.2); p.lineTo(footX + k * 0.24, footY);
        p.moveTo(footX - s * k * 0.02, top);
        p.quadraticCurveTo(footX + s * k * 0.24, top - k * 0.22, footX + s * k * 0.35, top + k * 0.04);
        p.quadraticCurveTo(footX + s * k * 0.17, top + k * 0.12, footX - s * k * 0.02, top);
        p.moveTo(footX + s * k * 0.17, top - k * 0.04); p.lineTo(footX + s * k * 0.3, top - k * 0.16);
      } else {                                  /* a low equipment sled with an upright service loop */
        p.moveTo(footX - k * 0.34, footY); p.lineTo(footX - k * 0.28, footY - k * 0.3);
        p.lineTo(footX + k * 0.25, footY - k * 0.3); p.lineTo(footX + k * 0.34, footY); p.closePath();
        p.moveTo(footX - k * 0.2, footY - k * 0.3); p.quadraticCurveTo(footX, footY - k * 0.63, footX + k * 0.2, footY - k * 0.3);
        p.moveTo(footX - k * 0.27, footY); p.lineTo(footX - k * 0.34, footY + k * 0.07);
        p.moveTo(footX + k * 0.27, footY); p.lineTo(footX + k * 0.34, footY + k * 0.07);
      }
      return p;
    }
    function draw(zz, kk, sx, sy) {
      const T = ctx.tokens;
      const zLines = clamp(Math.round(finite(params.zLines, 32)), 4, 96);
      const xLines = clamp(Math.round(finite(params.xLines, 7)), 1, 24);
      const xSpacing = clamp(finite(params.xSpacing, 1), 0.1, 8);
      const majorEvery = clamp(Math.round(finite(params.majorEvery, 4)), 2, 24);
      const f = h * clamp(finite(params.focalK, 0.62), 0.12, 2) * (1 - clamp(finite(params.kickFov, 0.2), 0, 0.7) * kk);
      const camH = clamp(finite(params.camH, 1), 0.15, 5) * (1 - clamp(finite(params.kickDrop, 0.32), 0, 0.8) * kk);
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.setTransform(1, 0, 0, 1, sx, sy);
      /* the ground: opaque, so stars stop at the horizon (over-filled so a shake never shows a gap) */
      g.globalAlpha = 1; g.fillStyle = T.field; g.fillRect(-16, Math.floor(vpY), w + 32, h - Math.floor(vpY) + 32);
      g.lineCap = 'butt'; g.lineJoin = 'round';
      const frac = zz - Math.floor(zz);
      const bins = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], majors = new Path2D(), marks = new Path2D();
      const binA = [1, 0.55, 0.28, 0.12];
      const baseWorld = Math.floor(zz);
      for (let i = 0; i < zLines; i++) {
        const d = (1 - frac) + i;
        const y = vpY + f * camH / d;
        if (y > h + 20) continue;
        const a = Math.min(1, finite(params.nearBoost, 1.6) / d) * (1 - d / zLines);
        const bi = a > 0.7 ? 0 : a > 0.4 ? 1 : a > 0.18 ? 2 : 3;
        const major = ((baseWorld + i + 1) % majorEvery + majorEvery) % majorEvery === 0;
        const p = major ? majors : bins[bi]; p.moveTo(-16, y); p.lineTo(w + 16, y);
        if (major) {
          for (const mx of [-2, 0, 2]) {
            const xx = vpX + f * mx / d, r = clamp(f / d * 0.025, 1.2 * px, 7 * px);
            marks.moveTo(xx - r, y); marks.lineTo(xx + r, y); marks.moveTo(xx, y - r * 0.55); marks.lineTo(xx, y + r * 0.55);
          }
        }
      }
      const rays = new Path2D();
      for (let i = -xLines; i <= xLines; i++) {
        const x = i * xSpacing;
        const dFar = zLines, dNear = 0.22;
        rays.moveTo(vpX + f * x / dFar, vpY + f * camH / dFar);
        rays.lineTo(vpX + f * x / dNear, vpY + f * camH / dNear);
      }
      for (const wide of [true, false]) {
        g.strokeStyle = wide ? T.phosphor : T.phosphorCore;
        for (let b = 0; b < 4; b++) stroke(bins[b], binA[b], wide);
        stroke(rays, 0.5 + 0.3 * kk, wide);
      }
      g.strokeStyle = T.amber;
      g.globalAlpha = 0.12 + kk * 0.05; g.lineWidth = Math.max(0.65 * px, finite(params.coreWidth, 1.1) * px * 0.7); g.stroke(majors);
      g.globalAlpha = 0.32 + kk * 0.08; g.lineWidth = Math.max(0.7 * px, finite(params.coreWidth, 1.1) * px * 0.75); g.stroke(marks);
      g.globalAlpha = 0.9; g.strokeStyle = T.phosphor; g.lineWidth = 1 * px;
      g.beginPath(); g.moveTo(-16, vpY + 0.5); g.lineTo(w + 16, vpY + 0.5); g.stroke();
      /* pylons */
      g.lineCap = 'round';
      const pylonEvery = clamp(finite(params.pylonEvery, 6), 0.5, 64);
      const pylonX = clamp(finite(params.pylonX, 3.8), 0.5, 12);
      const first = Math.ceil((zz + 0.3) / pylonEvery) * pylonEvery;
      const kBox = clamp(finite(params.pylonH, 1.3), 0.1, 5) / 96;
      const smear = kk > 0.2 ? 0.35 + 1.2 * kk : 0;              /* the speed smear, world units down the row */
      for (let zp = first; zp - zz < zLines; zp += pylonEvery) {
        const d = zp - zz;
        const k = (f / d) * kBox;
        const footY = vpY + f * camH / d;
        const a = Math.min(1, finite(params.nearBoost, 1.6) / d) * (1 - d / zLines);
        if (a <= 0.02) continue;
        const heft = Math.min(3, 1 + k * 96 / 260);            /* near pylons get fatter strokes */
        for (const side of [-1, 1]) {
          const footX = vpX + f * (side * pylonX) / d;
          const half = 48 * k;
          if (footX + half < -20 || footX - half > w + 20) continue;   /* off the frame: no path */
          if (smear) {
            const d2 = d + smear, k2 = (f / d2) * kBox;
            const ghost = glyphPath(vpX + f * (side * pylonX) / d2, vpY + f * camH / d2, k2);
            g.strokeStyle = T.phosphor; stroke(ghost, a * 0.55 * kk, true, heft);
          }
          const path = glyphPath(footX, footY, k);
          g.strokeStyle = T.phosphor; stroke(path, a, true, heft);
          g.strokeStyle = T.phosphorCore; stroke(path, a, false, heft);
          if (k * 96 > 14) { g.globalAlpha = a * clamp(finite(params.coreAlpha, 0.6), 0, 1); g.fillStyle = T.phosphorCore; g.beginPath(); g.arc(footX + (NODE[0] - 48) * k, footY + (NODE[1] - 96) * k, Math.max(0.6, NODE[2] * k), 0, Math.PI * 2); g.fill(); }
        }
      }
      /* Sparse field equipment breaks the perfect arcade symmetry and gives the survey deck a physical scale. */
      const propEvery = clamp(finite(params.propEvery, 11), 3, 64);
      const firstProp = Math.ceil((zz + 1.2) / propEvery) * propEvery;
      const propX = clamp(finite(params.propX, 3.05), 1, 10), propH = clamp(finite(params.propH, 0.72), 0.15, 3);
      for (let zp = firstProp; zp - zz < zLines; zp += propEvery) {
        const d = zp - zz, slot = Math.round(zp / propEvery), side = slot & 1 ? 1 : -1;
        const footX = vpX + f * side * propX / d, footY = vpY + f * camH / d;
        const k = f / d * propH, a = Math.min(0.82, finite(params.nearBoost, 1.6) / d) * (1 - d / zLines);
        if (a < 0.025 || footX < -k || footX > w + k) continue;
        const prop = propPath(((slot % 3) + 3) % 3, footX, footY, k, side);
        g.strokeStyle = T.phosphor; g.globalAlpha = a * 0.32; g.lineWidth = Math.max(1.2 * px, finite(params.haloWidth, 5) * px * 0.55); g.stroke(prop);
        g.strokeStyle = T.phosphorCore; g.globalAlpha = a * 0.82; g.lineWidth = Math.max(0.65 * px, finite(params.coreWidth, 1.1) * px * 0.8); g.stroke(prop);
        g.fillStyle = T.amber; g.globalAlpha = a * 0.75; g.beginPath(); g.arc(footX, footY - k * 0.72, clamp(k * 0.026, 0.65 * px, 2.4 * px), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    return {
      tick(dt, t, cameraZ) {
        const full = ctx.dial === 'full';
        const v = (ctx.camera && ctx.camera.v) || 0;
        if (z === null || !Number.isFinite(z)) z = finite(cameraZ, 0);
        const travel = full ? v * clamp(finite(params.speedGain, 2.2), -20, 20) + clamp(finite(params.cruiseFull, 3.2), -100, 100) : v;
        z += clamp(finite(travel, 0), -500, 500) * clamp(finite(dt, 0), 0, 0.25);
        /* eased speed: fast attack (80 ms), slow release (600 ms); Full only */
        const sp = full ? Math.min(1, Math.abs(v) / Math.max(0.1, finite(params.kickRef, 14))) : 0;
        speed += (sp - speed) * (1 - Math.exp(-dt / (sp > speed ? 0.08 : 0.6)));
        ctx.share.speed = speed;
        const kick = speed * speed * (3 - 2 * speed);
        const sh = ctx.share.shake;
        draw(z, kick, sh ? sh.x * bd : 0, sh ? sh.y * bd : 0);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; bd = ndpr; px = Math.max(0.75, ndpr); },
      still() { draw(z === null ? ctx.camera.z : z, 0, 0, 0); },
      destroy() { g.clearRect(0, 0, w, h); },
      params(p) { params = p || PARAMS; },
    };
  }
  BAYS.push({ slug: 'row', title: 'The row', order: 2, role: 'layer', params: PARAMS, mount });
})();
