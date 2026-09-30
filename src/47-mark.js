/* BONEYARD PART · 08 · MARK
 * technique   glenz vectors: a low-poly solid whose faces are translucent, painter-sorted by depth and filled
 *             additively, so the back faces show through the front ones and pile up as light; edges stroked on top
 * lineage     Amiga demoscene glenz vectors (about 1989 to 1990), with the demo finale's sunburst behind the object
 * original    the solid is the Desert Data Labs chip mark from ddl-cactus-mark.svg: the rounded square as a thick
 *             glass slab, with the saguaro circuit (trunk, the two arms that close into a diamond, the node, the
 *             ground rail) extruded off its face; 57 faces; projected toward the shared vanishing point. On switch-on
 *             every face flies out of the vanishing point and locks into the chip in under a second (one amber lock
 *             ring, once); then it sways face-on (never edge-on), leans toward the pointer, dollies slowly in, and a
 *             specular band sweeps the glass every few seconds with the front edges running amber under it; drag to
 *             turn it, and it eases back to its sway
 * not         a textured logo render, a physics toy, a Boing ball. No lighting model beyond facing, no text.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.39 ms/frame @ 1440x900 x1 internal, 1.96 ms at 4x CPU; 390x844 at 4x CPU 1.82 ms; desktop Chromium on a
 *             real GPU (RX 5600M, D3D11), harness counter (2026-09-30); ride 59 to 60 fps incl. the arrival; phone device TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The mark is built once in the SVG's own units (a 96 unit box, centre 48,48, y flipped to point up): the rounded
 * square is a 16-sided slab with three segments per corner, and each stroke of the glyph is a box extruded a few
 * units off the slab's face (the node is an octagonal prism that stands a little proud). Every face keeps an outward
 * winding, so after the spin (yaw about Y, a fixed pitch about X) its normal says whether it faces the viewer.
 *
 * The arrival is pure projection: for the first moment after switch-on each face is pushed far down the camera's
 * depth axis, so perspective shrinks it onto the vanishing point, and it is pulled home on an ease-out with a small
 * per-face delay (slab first, glyph next, the node last) while the whole solid unwinds a half turn. When the last
 * face lands, one amber ring leaves the chip. After that the motion is a sway, not a spin: yaw is amp * sin(phase)
 * about the face-on pose plus a lean toward the pointer, so the chip never turns edge-on.
 *
 * Each frame the faces are sorted far to near by mean depth and filled with 'lighter' compositing at a low alpha,
 * so wherever faces overlap the light adds up. Behind the chip a slow sunburst turns on the vanishing point and
 * rings recede into it. Every few seconds a specular band crosses the chip: a screen-space linear gradient filled
 * inside the union of the lit faces (glass catching a light), and the same band, in amber, stroked over the front
 * edges. still() draws the finished 30 degree pose with the band held a third of the way across.
 */
(() => {
  'use strict';
  const PARAMS = {
    spin: 0.62,          /* sway phase, radians per second (Calm halves) */
    swayDeg: 42,         /* yaw sway amplitude about face-on, degrees */
    pitch: 0.2,          /* radians, base tilt toward the viewer */
    sway: 0.12,          /* pitch sway amplitude, radians (Calm: none) */
    size: 0.36,          /* half-width of the chip, as a share of the smaller canvas side (portrait: of the width) */
    drop: 0.1,           /* chip centre below the vanishing point, share of height (landscape; portrait 0.04) */
    camDist: 5.2,        /* camera distance in chip half-widths */
    slab: 8,             /* half thickness, SVG units: a thick glass block */
    relief: 6,           /* glyph height off the face, SVG units */
    frontAlpha: 0.12, backAlpha: 0.12, glyphAlpha: 0.3,
    edgeFront: 1, edgeBack: 0.34, edgeWidth: 1.6,
    glowWidth: 7, glowAlpha: 0.22,  /* the wide additive glow under the front edges */
    amber: 1,            /* peak alpha of the amber edge pass at face-on */
    backGlow: 0.26,      /* the soft light behind the chip, additive */
    arrive: 0.85,        /* seconds for the whole fly-in (Calm: 1.5x) */
    lean: 0.5,           /* radians of yaw toward the pointer across the full width */
    dolly: 0.12,         /* the slow push in: the chip grows by this share over the hold */
    sweepEvery: 4.2,     /* seconds between specular sweeps (Calm: none) */
    sweepDur: 1.2,       /* seconds for the band to cross */
    sweepAlpha: 0.5,     /* peak alpha of the band on the glass */
    rays: 20,            /* sunburst wedges on the vanishing point */
    rayAlpha: 0.075,
    rings: 3,            /* rings receding into the vanishing point */
    settle: 1.4,         /* seconds for a flicked spin to ease back */
    stillYaw: 30,        /* degrees */
  };

  /* ---------- geometry, built once in SVG units ---------- */
  function build(P) {
    const faces = [];
    const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
    const ccw = (pts) => (area(pts) < 0 ? pts.slice().reverse() : pts);
    /* extrude a 2-D polygon between z0 and z1; bottom cap optional; smooth = no seam strokes on the sides */
    function prism(poly, z0, z1, kind, opts) {
      const pts = ccw(poly), n = pts.length, o = opts || {};
      faces.push({ v: pts.map((p) => [p[0], p[1], z1]), kind, edges: true });
      if (o.bottom) faces.push({ v: pts.map((p) => [p[0], p[1], z0]).reverse(), kind, edges: true });
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        faces.push({ v: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], kind, edges: !o.smooth });
      }
    }
    const S = (x, y) => [x - 48, 48 - y];                 /* SVG -> model, y up */
    /* the slab: rect 5.5..90.5, rx 22, three segments per corner */
    const half = 42.5, r = 22, slab = [];
    const corners = [[half - r, half - r, 0], [-(half - r), half - r, 0.5], [-(half - r), -(half - r), 1], [half - r, -(half - r), 1.5]];
    for (const [cx, cy, q] of corners) for (let k = 0; k <= 3; k++) { const a = (q + k / 6) * Math.PI; slab.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    prism(slab, -P.slab, P.slab, 'slab', { bottom: true, smooth: true });
    /* a stroke of the glyph: a box of width wd from A to B, square-capped by cap units */
    const bar = (A, B, wd, cap) => {
      const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy * wd / 2, ny = ux * wd / 2;
      const a = [A[0] - ux * cap, A[1] - uy * cap], b = [B[0] + ux * cap, B[1] + uy * cap];
      return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
    };
    const z0 = P.slab, z1 = P.slab + P.relief;
    prism(bar(S(48, 22), S(48, 76), 4, 2), z0, z1, 'glyph');           /* trunk */
    const d = [S(48, 31), S(59, 41), S(48, 51), S(37, 41)];              /* the arms, closing into the diamond */
    for (let i = 0; i < 4; i++) prism(bar(d[i], d[(i + 1) % 4], 4, 1.2), z0, z1, 'glyph');
    prism(bar(S(36, 76), S(60, 76), 4, 2), z0, z1, 'glyph');           /* ground rail */
    const node = [], c = S(48, 41);                                       /* the node, standing proud */
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; node.push([c[0] + 3.8 * 1.08 * Math.cos(a), c[1] + 3.8 * 1.08 * Math.sin(a)]); }
    prism(node, z0, z1 + 2.2, 'node');
    /* arrival order: slab first, glyph next, node last; a per-face delay in 0..1 of the stagger window */
    const N = faces.length;
    faces.forEach((fc, i) => { fc.delay = fc.kind === 'slab' ? 0.35 * i / N : fc.kind === 'glyph' ? 0.25 + 0.55 * i / N : 0.85; });
    return faces;
  }

  const ease = (u) => 1 - Math.pow(1 - u, 3);
  const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1;
    let faces = build(params), yaw = params.stillYaw * Math.PI / 180, pitch = params.pitch;
    let ph = Math.asin(Math.min(1, params.stillYaw / params.swayDeg)), off = 0, offVel = 0, leanX = 0, leanY = 0;
    let tOn = 1e9, rayRot = 0.12, sweepU = 0.34, sweepA = 0.7, still = true, calm = false;
    let drag = null, lastText = '', curText = '', sentAt = -1e9, flushT = 0, dead = false;   /* sentAt: a still drawn in the first 150 ms of page life must still report */
    const out = [];

    function draw() {
      const T = ctx.tokens, TAU = Math.PI * 2;
      const cx = ctx.vp.x * w, cy = ctx.vp.y * h;
      const arrT = params.arrive * (calm ? 1.5 : 1);
      /* the slow push in: settles from (1 - dolly/2) to (1 + dolly/2) of the base size over the hold */
      const dolly = still ? 1 : 1 - params.dolly / 2 + params.dolly * (1 - Math.exp(-Math.max(0, tOn - arrT) / 5));
      const R = Math.min(w * params.size * 1.25, h * params.size) * dolly;
      const D = params.camDist * 42.5, f = R * (D - params.slab) / 42.5;   /* the front face plane projects at R */
      const fly = still ? 1 : clamp01(tOn / arrT);
      const spinIn = (1 - ease(fly)) * Math.PI * 0.9;                    /* the solid unwinds a half turn as it lands */
      const cyw = Math.cos(yaw - spinIn), syw = Math.sin(yaw - spinIn), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const oy = -h * (w > h ? params.drop : 0.04) * 42.5 / R;          /* below the eye line, in camera space */
      out.length = 0;
      let away = 0;
      for (const fc of faces) {
        const n = fc.v.length, sx = new Array(n), sy = new Array(n), cam = new Array(n);
        /* the fly-in: push the face far down the depth axis so perspective shrinks it onto the vanishing point */
        const u = fly >= 1 ? 1 : ease(clamp01((fly - fc.delay * 0.55) / 0.45));
        const push = D * (1 / Math.max(0.03, u) - 1);                     /* projected size grows as u: a visible flight, not a snap */
        let zs = 0;
        for (let i = 0; i < n; i++) {
          const [x, y, z] = fc.v[i];
          const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;          /* yaw about Y */
          const y2 = y * cp + z1 * sp + oy, z2 = -y * sp + z1 * cp - push; /* pitch about X: top leans away */
          cam[i] = [x1, y2, z2]; zs += z2;
          const k = f / (D - z2);
          sx[i] = cx + x1 * k; sy[i] = cy - y2 * k;
        }
        /* Newell normal in camera space; facing = normal toward the eye at (0, 0, D) */
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < n; i++) { const a = cam[i], b = cam[(i + 1) % n]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
        const p0 = cam[0], vx = -p0[0], vy = -p0[1], vz = D - p0[2];
        const nl = Math.hypot(nx, ny, nz) || 1, vl = Math.hypot(vx, vy, vz) || 1;
        const facing = (nx * vx + ny * vy + nz * vz) / (nl * vl);
        if (facing <= 0) away++;
        out.push({ sx, sy, z: zs / n, facing, kind: fc.kind, edges: fc.edges, u });
      }
      out.sort((a, b) => a.z - b.z);                                     /* painter: far first */
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.clearRect(0, 0, w, h); g.fillStyle = T.field; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const heat = Math.pow(Math.max(0, cyw * cp), 4) * params.amber * fly;
      const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      /* the finale backdrop: a slow sunburst on the vanishing point, and rings receding into it */
      const bloom = still ? 1 : ease(clamp01(tOn / (arrT * 1.4)));
      if (params.rays > 0) {
        const n = params.rays | 0, wedge = TAU / n * 0.34, rays = new Path2D();
        for (let i = 0; i < n; i++) {
          const a = rayRot + i * TAU / n;
          rays.moveTo(cx, cy); rays.arc(cx, cy, reach, a - wedge / 2, a + wedge / 2); rays.closePath();
        }
        const rg = g.createRadialGradient(cx, cy, R * 0.05, cx, cy, reach);
        rg.addColorStop(0, ctx.rgba(T.phosphor, params.rayAlpha * 2.2 * bloom));
        rg.addColorStop(0.35, ctx.rgba(T.phosphor, params.rayAlpha * bloom));
        rg.addColorStop(1, ctx.rgba(T.phosphor, 0));
        g.fillStyle = rg; g.fill(rays);
      }
      if (params.rings > 0) {
        g.lineWidth = 2 * px; g.strokeStyle = T.phosphor;
        const n = params.rings | 0, cyc = still ? 0.4 : (tOn * 0.22) % 1;
        for (let i = 0; i < n; i++) {
          const q = (cyc + i / n) % 1, depth = 1 - q;                     /* q: 0 near (large), 1 at the vanishing point */
          const rr = R * 0.1 + reach * 1.1 * depth * depth;
          g.globalAlpha = 0.16 * bloom * Math.sin(Math.PI * q);
          g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
        }
        g.globalAlpha = 1;
      }
      /* the chip's own light on the field behind it: phosphor, warming toward amber as the face squares up */
      const gy = cy - oy * R / 42.5, gl = g.createRadialGradient(cx, gy, R * 0.1, cx, gy, R * 1.5);
      gl.addColorStop(0, ctx.rgba(T.phosphor, params.backGlow * fly * (1 - 0.5 * heat)));
      gl.addColorStop(1, ctx.rgba(T.phosphor, 0));
      g.fillStyle = gl; g.fillRect(0, 0, w, h);
      if (heat > 0.01 && T.amber) {
        const ga = g.createRadialGradient(cx, gy, R * 0.1, cx, gy, R * 1.3);
        ga.addColorStop(0, ctx.rgba(T.amber, params.backGlow * 0.6 * heat)); ga.addColorStop(1, ctx.rgba(T.amber, 0));
        g.fillStyle = ga; g.fillRect(0, 0, w, h);
      }
      const front = new Path2D(), back = new Path2D(), lit = new Path2D();
      for (const o of out) {
        const p = new Path2D();
        p.moveTo(o.sx[0], o.sy[0]);
        for (let i = 1; i < o.sx.length; i++) p.lineTo(o.sx[i], o.sy[i]);
        p.closePath();
        const isLit = o.facing > 0;
        const base = o.kind === 'slab' ? (isLit ? params.frontAlpha : params.backAlpha) : (isLit ? params.glyphAlpha : params.backAlpha);
        g.globalAlpha = base * (0.45 + 0.55 * Math.abs(o.facing)) * (0.35 + 0.65 * o.u);
        g.fillStyle = isLit ? (o.kind === 'slab' ? T.phosphor : T.phosphorCore) : (T.phosphorDim || T.phosphor);
        g.fill(p);
        if (isLit) lit.addPath(p);
        if (o.edges) (isLit ? front : back).addPath(p);
      }
      g.lineJoin = 'round';
      g.lineWidth = params.edgeWidth * px;
      g.strokeStyle = T.phosphorDim || T.phosphor; g.globalAlpha = params.edgeBack; g.stroke(back);
      g.lineWidth = params.glowWidth * px; g.strokeStyle = T.phosphor; g.globalAlpha = params.glowAlpha * (1 - 0.8 * heat); g.stroke(front);
      if (heat > 0.01 && T.amber) { g.strokeStyle = T.amber; g.globalAlpha = heat * 0.45; g.stroke(front); }
      g.lineWidth = params.edgeWidth * px;
      g.strokeStyle = T.phosphorCore; g.globalAlpha = params.edgeFront * (1 - 0.85 * heat); g.stroke(front);
      if (heat > 0.01 && T.amber) { g.strokeStyle = T.amber; g.globalAlpha = heat; g.stroke(front); }
      /* the specular sweep: a diagonal band across the chip, filled inside the lit glass, amber on the edges under it */
      if (sweepA > 0.01) {
        const span = R * 1.5, bx = cx + (sweepU * 2 - 1) * span, by = gy + (sweepU * 2 - 1) * span * 0.35;
        const dx = R * 0.22, dy = R * 0.08;                                /* band half-width along its travel */
        const band = (col, a) => {
          const lg = g.createLinearGradient(bx - dx, by - dy, bx + dx, by + dy);
          lg.addColorStop(0, ctx.rgba(col, 0)); lg.addColorStop(0.5, ctx.rgba(col, a)); lg.addColorStop(1, ctx.rgba(col, 0));
          return lg;
        };
        g.save(); g.clip(lit);
        g.globalAlpha = 1; g.fillStyle = band(T.phosphorCore, params.sweepAlpha * sweepA);
        g.fillRect(bx - dx * 2, gy - R * 1.6, dx * 4, R * 3.2);
        g.restore();
        g.globalAlpha = 1; g.lineWidth = params.edgeWidth * 2.2 * px; g.strokeStyle = band(T.amber || T.phosphorCore, 0.95 * sweepA); g.stroke(front);
      }
      /* the lock: when the last face lands, one amber ring leaves the chip (once per switch-on; never in Calm) */
      const lockU = (tOn - arrT) / 0.7;
      if (!still && !calm && lockU >= 0 && lockU < 1 && T.amber) {
        const e = ease(lockU);
        g.globalAlpha = 0.7 * (1 - lockU); g.strokeStyle = T.amber; g.lineWidth = (5 - 3.5 * e) * px;
        g.beginPath(); g.arc(cx, gy, R * (1.05 + 1.1 * e), 0, TAU); g.stroke();
        g.globalAlpha = 0.5 * (1 - lockU); g.lineWidth = params.edgeWidth * 2 * px; g.stroke(front);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const deg = ((((yaw - spinIn) * 180 / Math.PI) + 180) % 360 + 360) % 360 - 180;   /* signed: 0 is face-on */
      const text = `yaw ${Math.round(deg)}° · ${faces.length} faces · ${away} facing away`;
      curText = text;
      const now = performance.now();   /* re-send twice a second: the HUD throttle drops, it does not defer */
      if (text !== lastText && now - sentAt > 150 || now - sentAt > 500) { lastText = text; sentAt = now; ctx.readout('mark', text); }
    }

    return {
      tick(dt, t, progress, pointer) {
        calm = ctx.dial === 'calm'; still = false;
        if (t < tOn) { off = 0; offVel = 0; ph = -params.spin * (calm ? 0.5 : 1) * (params.arrive * (calm ? 1.5 : 1) - t); }   /* a fresh switch-on: arrive again, and land face-on */
        tOn = t;
        const cssW = Math.max(1, w / px), TAU = Math.PI * 2;
        ph += params.spin * (calm ? 0.5 : 1) * dt;
        if (ph > TAU * 64) ph -= TAU * 64;
        rayRot = (rayRot + dt * (calm ? 0.03 : 0.07)) % TAU;
        /* the sweep: one pass every sweepEvery seconds, starting just after the lock */
        const sw = calm ? -1 : t - params.arrive - 0.5;
        if (sw >= 0) { const q = (sw % params.sweepEvery) / params.sweepDur; sweepU = q; sweepA = q < 1 ? Math.sin(Math.PI * q) : 0; } else sweepA = 0;
        const amp = params.swayDeg * Math.PI / 180;
        if (pointer && pointer.down) {
          if (!drag) drag = { x0: pointer.x, y0: pointer.y, last: pointer.x, armed: !pointer.coarse };
          if (!drag.armed) {
            const dx = pointer.x - drag.x0, dy = pointer.y - drag.y0;
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { drag.armed = true; drag.last = pointer.x; }
          }
          if (drag.armed) {
            const d = (pointer.x - drag.last) / cssW * Math.PI * 1.6;
            drag.last = pointer.x;
            off += d;
            const v = dt > 0 ? d / dt : 0;
            offVel += (v - offVel) * (1 - Math.exp(-dt / 0.06));
          }
        }
        if (!drag || !drag.armed) {
          if (!(pointer && pointer.down)) drag = null;
          /* a flick coasts, then the extra turn eases to the nearest whole turn, back into the sway */
          offVel = Math.max(-12, Math.min(12, offVel)) * Math.exp(-dt / 0.35);
          off += offVel * dt;
          const home = Math.round(off / TAU) * TAU;
          off += (home - off) * (1 - Math.exp(-dt / (params.settle / 3)));
          if (Math.abs(home - off) < 1e-4 && Math.abs(offVel) < 1e-3) { off = 0; offVel = 0; }
        }
        /* lean toward a fine pointer (not while dragging, not on touch) */
        const leanOn = pointer && pointer.present && !pointer.coarse && !(drag && drag.armed);
        const tx = leanOn ? (pointer.nx - 0.5) * params.lean : 0, ty = leanOn ? (0.5 - pointer.ny) * params.lean * 0.6 : 0;
        const kl = 1 - Math.exp(-dt / 0.25);
        leanX += (tx - leanX) * kl; leanY += (ty - leanY) * kl;
        yaw = amp * Math.sin(ph) + off + leanX;
        pitch = params.pitch + leanY + (calm ? 0 : params.sway * Math.sin(ph * 0.61 + 0.8));
        draw();
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); },
      still() {
        still = true; tOn = 1e9; calm = false;
        yaw = params.stillYaw * Math.PI / 180; pitch = params.pitch; off = 0; offVel = 0; leanX = 0; leanY = 0;
        ph = Math.asin(Math.max(-1, Math.min(1, params.stillYaw / params.swayDeg)));
        rayRot = 0.12; sweepU = 0.34; sweepA = 0.7;
        draw();
        /* the host throttles readouts on the leading edge; one trailing emit makes sure the Still line lands */
        clearTimeout(flushT); flushT = setTimeout(() => { if (!dead && curText) { lastText = curText; ctx.readout('mark', curText); } }, 400);
      },
      destroy() { dead = true; clearTimeout(flushT); g.clearRect(0, 0, w, h); faces = []; out.length = 0; },
      params(p) { params = p; faces = build(p); },
    };
  }
  BAYS.push({ slug: 'mark', title: 'Mark', order: 8, role: 'bay', params: PARAMS, mount });
})();
