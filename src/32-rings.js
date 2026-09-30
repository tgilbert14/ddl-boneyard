/* BONEYARD PART · C3 · RINGS
 * technique   a 1/z corridor of articulated polygonal portals: front and back rims, inset apertures, panel faces and rails
 * lineage     the demoscene dot tunnel (Amiga and PC intros, about 1991); the 1/z projection it shares with every
 *             starfield of the era; faceted vector portals in early 3-D arcade flight displays
 * original    each old dot ring is treated as a physical portal with depth, individually pitched, yawed and rolled;
 *             four longitudinal rails join the frames, panel gaps and hinge nodes reveal assembly, and each portal
 *             grows past the camera before wrapping to the far end, all scrubbed only by scroll progress
 * not         a time-looping screensaver, a raster tunnel, a texture-mapped tube, or a stack of flat concentric circles.
 * deps        none · Canvas 2D · 2026-09
 * budget      1.14 ms/frame @ 1050x852 desktop; 0.77 @ 390x439 portrait, Local Chromium 149, parts average under
 *             4x CPU slowdown (2026-09-30); JS work only, not a real-GPU frame
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Each portal is a shallow 3-D object. A faceted outer rim and inset aperture are built on front and back planes,
 * rotated around all three axes, then projected through the shared vanishing point. The quadrilateral between outer
 * and inner vertices is a panel; front-to-back quads make the frame's thickness. Alternating panel values, small gaps
 * and hinge nodes keep the construction readable when a portal fills the phone screen. Four rails join matching
 * vertices down the ordered corridor, which supplies the spatial evidence missing from repeated flat rings.
 *
 * Progress moves the camera through a wrapped depth span. Frames fade only as they cross the near plane, then reappear
 * at the far end. Full motion warms the nearest frame and adds restrained shared shake in proportion to real ride
 * speed. Calm travels less distance, removes heat and shake, reduces panel faces and rails, and keeps every portal.
 * Every count, facet and depth input is bounded before allocation or projection.
 */
(() => {
  'use strict';
  const PARAMS = {
    rings: 15,
    dotsPerSide: 12,       /* facets per portal; kept under the original parameter name for compatible saved URLs */
    radius: 1.42,
    spacing: 1.08,
    travel: 44,
    calmTravel: 0.56,
    twist: 0.075,
    zNear: 0.56,
    focalK: 0.62,
    dotPx: 2.1,            /* hinge node size */
    settle: 0.24,
    rampIn: 0.13,
    mouth: 1.75,
    stillProgress: 0.47,
    shakePx: 1.5,
    speedRef: 16,
    frameWidth: 0.22,
    frameDepth: 0.3,
    pitch: 0.1,
    yaw: 0.13,
    railAlpha: 0.22,
    panelAlpha: 0.17,
  };
  const clamp = (x, a, b, fallback) => Number.isFinite(Number(x)) ? Math.max(a, Math.min(b, Number(x))) : fallback;
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return u * u * (3 - 2 * u); };
  const mod = (x, n) => ((x % n) + n) % n;

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = 1, px = 1, bd = 1, cam = -1, env = 0, speed = 0, clock = 0;
    function focal() { f = Math.max(1, Math.min(h * clamp(params.focalK, 0.12, 2, 0.62), w * 1.02)); }
    focal();

    function portalPoint(theta, radius, localZ, portal, facets) {
      const gear = 1 + 0.055 * Math.cos(theta * (facets / 2) + portal.slot * 0.71);
      let x = Math.cos(theta) * radius * gear, y = Math.sin(theta) * radius * gear, z = localZ;
      const cr = Math.cos(portal.roll), sr = Math.sin(portal.roll), xr = x * cr - y * sr, yr = x * sr + y * cr;
      const cp = Math.cos(portal.pitch), sp = Math.sin(portal.pitch), yp = yr * cp - z * sp, zp = yr * sp + z * cp;
      const cy = Math.cos(portal.yaw), sy = Math.sin(portal.yaw), xp = xr * cy + zp * sy, zz = -xr * sy + zp * cy;
      const depth = Math.max(0.08, portal.z + zz), k = f / depth;
      return { x: portal.vpX + (portal.cx + xp) * k, y: portal.vpY + (portal.cy + yp) * k, z: depth };
    }

    function makePortal(slot, z, span, facets, radius, frameWidth, frameDepth, envelope) {
      const d = (z - clamp(params.zNear, 0.16, 8, 0.56)) / span;
      const near = smooth(clamp(params.zNear, 0.16, 8, 0.56), clamp(params.zNear, 0.16, 8, 0.56) + clamp(params.mouth, 0.1, 12, 1.75), z);
      const portal = {
        slot, z, vpX: ctx.vp.x * w, vpY: ctx.vp.y * h,
        cx: Math.sin(slot * 1.71) * 0.075, cy: Math.cos(slot * 2.13) * 0.045,
        roll: clamp(params.twist, -1, 1, 0.075) * (slot * clamp(params.spacing, 0.12, 8, 1.08) + cam * 0.24) + Math.sin(slot * 0.93) * 0.11,
        pitch: Math.sin(slot * 1.37 + 0.4) * clamp(params.pitch, 0, 0.7, 0.1),
        yaw: Math.cos(slot * 1.11 + 0.8) * clamp(params.yaw, 0, 0.7, 0.13),
        alpha: envelope * near * (0.38 + 0.62 * (1 - Math.max(0, Math.min(1, d)))),
        outerF: [], innerF: [], outerB: [], innerB: [],
      };
      const inner = Math.max(0.08, radius - frameWidth), halfD = frameDepth * 0.5;
      for (let j = 0; j < facets; j++) {
        const theta = -Math.PI / 2 + j * Math.PI * 2 / facets;
        portal.outerF.push(portalPoint(theta, radius, -halfD, portal, facets));
        portal.innerF.push(portalPoint(theta, inner, -halfD, portal, facets));
        portal.outerB.push(portalPoint(theta, radius, halfD, portal, facets));
        portal.innerB.push(portalPoint(theta, inner, halfD, portal, facets));
      }
      return portal;
    }

    function polygon(points) {
      const p = new Path2D(); if (!points.length) return p;
      p.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) p.lineTo(points[i].x, points[i].y); p.closePath(); return p;
    }
    function quad(a, b, c, d) { const p = new Path2D(); p.moveTo(a.x, a.y); p.lineTo(b.x, b.y); p.lineTo(c.x, c.y); p.lineTo(d.x, d.y); p.closePath(); return p; }

    function draw(camZ, envelope, hot, sx, sy, calm) {
      const T = ctx.tokens;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      if (envelope <= 0.002) return;
      g.save(); g.setTransform(1, 0, 0, 1, sx || 0, sy || 0); g.lineJoin = 'round'; g.lineCap = 'round';
      const n = Math.round(clamp(params.rings, 4, 32, 15));
      let facets = Math.round(clamp(params.dotsPerSide, 8, 24, 12)); if (facets & 1) facets++;
      const radius = clamp(params.radius, 0.25, 6, 1.42), spacing = clamp(params.spacing, 0.12, 8, 1.08), span = n * spacing;
      const width = Math.min(radius * 0.72, clamp(params.frameWidth, 0.03, 2, 0.22));
      const depth = clamp(params.frameDepth, 0.02, 1.5, 0.3), near = clamp(params.zNear, 0.16, 8, 0.56);
      const portals = [];
      for (let i = 0; i < n; i++) portals.push(makePortal(i, mod(i * spacing - camZ, span) + near, span, facets, radius, width, depth, envelope));
      portals.sort((a, b) => b.z - a.z);

      const railPath = new Path2D();
      for (let rail = 0; rail < 4; rail++) {
        const q = Math.round(rail * facets / 4) % facets;
        let started = false;
        for (const portal of portals) {
          const p = portal.outerB[q];
          if (!started) { railPath.moveTo(p.x, p.y); started = true; } else railPath.lineTo(p.x, p.y);
        }
      }
      g.strokeStyle = T.phosphorDim; g.globalAlpha = clamp(params.railAlpha, 0, 1, 0.22) * envelope * (calm ? 0.48 : 1);
      g.lineWidth = 1.05 * px; g.stroke(railPath);

      const panelAlpha = clamp(params.panelAlpha, 0, 1, 0.17) * (calm ? 0.5 : 1);
      for (const portal of portals) {
        if (portal.alpha < 0.015) continue;
        const warm = hot * (1 - smooth(0.7, 4.2, portal.z));
        const joints = new Path2D();
        for (let j = 0; j < facets; j++) {
          const q = (j + 1) % facets, gap = (j + portal.slot * 3) % 7 === 0;
          const front = quad(portal.outerF[j], portal.outerF[q], portal.innerF[q], portal.innerF[j]);
          const outerSide = quad(portal.outerF[j], portal.outerB[j], portal.outerB[q], portal.outerF[q]);
          const innerSide = quad(portal.innerF[j], portal.innerF[q], portal.innerB[q], portal.innerB[j]);
          g.fillStyle = warm > 0.08 && (j + portal.slot) % 3 === 0 ? T.amber : ((j + portal.slot) & 1 ? T.phosphor : T.phosphorDim);
          g.globalAlpha = portal.alpha * panelAlpha * (gap ? 0.12 : 0.72 + 0.28 * Math.sin((j + 1) * 1.7)); g.fill(front);
          g.fillStyle = T.field2; g.globalAlpha = portal.alpha * panelAlpha * (gap ? 0.1 : 0.55); g.fill(outerSide);
          g.fillStyle = warm > 0.12 ? T.amber : T.phosphorDim; g.globalAlpha = portal.alpha * panelAlpha * 0.34; g.fill(innerSide);
          if (!gap) {
            g.strokeStyle = warm > 0.1 ? T.amber : T.phosphor; g.globalAlpha = portal.alpha * (0.22 + 0.2 * warm);
            g.lineWidth = (0.65 + warm * 0.7) * px; g.stroke(front);
          }
          if ((j & 1) === 0) {
            const p = portal.outerF[j], size = clamp(params.dotPx, 0.4, 8, 2.1) * px * Math.min(1.7, 0.52 + 1.5 / Math.max(0.4, portal.z));
            joints.rect(p.x - size * 0.5, p.y - size * 0.5, size, size);
          }
        }
        const outerFront = polygon(portal.outerF), innerFront = polygon(portal.innerF), innerBack = polygon(portal.innerB);
        g.strokeStyle = warm > 0.1 ? T.amber : T.phosphor; g.globalAlpha = portal.alpha * (0.2 + 0.34 * warm);
        g.lineWidth = (3.2 + warm * 2) * px; g.stroke(outerFront); g.stroke(innerFront);
        g.strokeStyle = T.phosphorCore; g.globalAlpha = portal.alpha * (0.62 + warm * 0.3);
        g.lineWidth = (0.8 + warm * 0.8) * px; g.stroke(outerFront); g.stroke(innerFront);
        g.strokeStyle = T.phosphorDim; g.globalAlpha = portal.alpha * 0.3; g.lineWidth = 0.75 * px; g.stroke(innerBack);
        g.fillStyle = warm > 0.08 ? T.amber : T.phosphorCore;
        g.globalAlpha = portal.alpha * (calm ? 0.38 : 0.72); g.fill(joints);
      }
      g.restore(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }

    function envelopeAt(p) {
      const r = clamp(params.rampIn, 0.03, 0.45, 0.13), e = Math.min(1, p / r) * Math.min(1, (1 - p) / r);
      return smooth(0, 1, e);
    }

    return {
      tick(dt, t, progress) {
        dt = clamp(dt, 0, 0.05, 0.016);
        const S = ctx.share, full = ctx.dial === 'full', calm = ctx.dial === 'calm', p = clamp(progress, 0, 1, 0);
        const travel = clamp(params.travel, 0, 200, 44) * (full ? 1 : clamp(params.calmTravel, 0, 1, 0.56));
        const target = p * travel, k = 1 - Math.exp(-dt / clamp(params.settle, 0.04, 3, 0.24));
        if (cam < 0) cam = target; else cam += (target - cam) * k;
        env += (envelopeAt(p) - env) * k;
        const now = performance.now(); S.warp = env * 0.42; S.warpAt = now;
        const sp = full ? Math.min(1, Math.abs((ctx.camera && ctx.camera.v) || 0) / clamp(params.speedRef, 1, 100, 16)) : 0;
        speed += (sp - speed) * (1 - Math.exp(-dt / (sp > speed ? 0.06 : 0.34)));
        clock += dt; const amp = clamp(params.shakePx, 0, 12, 1.5) * env * speed;
        const sh = amp > 0.05 ? { x: amp * Math.sin(clock * 53.3), y: amp * Math.sin(clock * 67.9 + 1.1) } : null;
        S.punch = 0; S.shake = sh; S.punchAt = now;
        draw(cam, env, env * speed, sh ? sh.x * bd : 0, sh ? sh.y * bd : 0, calm);
      },
      resize(nw, nh, ndpr) { w = Math.max(1, nw); h = Math.max(1, nh); bd = clamp(ndpr, 0.5, 4, 1); px = Math.max(0.75, bd); focal(); },
      still() { const p = clamp(params.stillProgress, 0, 1, 0.47); cam = p * clamp(params.travel, 0, 200, 44); env = envelopeAt(p); draw(cam, env, 0, 0, 0, false); },
      destroy() { const S = ctx.share; S.warp = 0; S.warpAt = 0; S.punch = 0; S.shake = null; S.punchAt = 0; g.clearRect(0, 0, w, h); },
      params(p) { params = p; focal(); },
    };
  }
  BAYS.push({ slug: 'rings', title: 'Rings', order: 3, role: 'corridor', params: PARAMS, mount });
})();
