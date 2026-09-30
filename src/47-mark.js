/* BONEYARD PART · 08 · MARK
 * technique   glenz vectors: a low-poly solid whose faces are translucent, painter-sorted by depth and filled
 *             additively, so the back faces show through the front ones and pile up as light; edges stroked on top
 * lineage     Amiga demoscene glenz vectors (about 1989 to 1990)
 * original    the solid is the Desert Data Labs chip mark from ddl-cactus-mark.svg: the rounded square as a slab,
 *             with the saguaro circuit (trunk, the two arms that close into a diamond, the node, the ground rail)
 *             extruded off its face; 57 faces; projected toward the shared vanishing point so the keepsake sits in
 *             the same space as every pylon on the way in; it sways face-on (yaw within about 55 degrees of
 *             square, never edge-on) and its front edges flare amber as it swings through facing you; drag to
 *             turn it, and it eases back to its sway
 * not         a textured logo render, a physics toy, a Boing ball. No lighting model beyond facing, no text.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.29 to 0.45 ms/frame @ 1440x900 x1 internal, headless desktop Chromium, harness counter (2026-09-30);
 *             390x844 at 4x CPU: 1.9 ms JS, part page 60 fps; phone device TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The mark is built once in the SVG's own units (a 96 unit box, centre 48,48, y flipped to point up): the rounded
 * square is a 16-sided slab with three segments per corner, and each stroke of the glyph is a box extruded a few
 * units off the slab's face (the node is an octagonal prism that stands a little proud). Every face keeps an outward
 * winding, so after the spin (yaw about Y, a fixed pitch about X) its normal says whether it faces the viewer.
 *
 * The motion is a sway, not a spin: yaw is amp * sin(phase) about the face-on pose, with a gentle pitch on a
 * second, slower sine, so the chip never turns edge-on. The object sits a little below the vanishing point (a
 * translation in camera space, so its perspective still converges there) and spans about two thirds of the
 * smaller side.
 *
 * Each frame the faces are sorted far to near by mean depth and filled with 'lighter' compositing at a low alpha:
 * front faces in phosphor, back faces dimmer, so wherever faces overlap the light adds up. Hard edges are then
 * stroked, back edges faint, front edges with a wide glow under a bright core, and an amber pass whose strength
 * is (cos yaw x cos pitch)^4, so the edges run hot exactly when the face is squarest to you; the slab's rounded
 * rim gets no seam lines. Horizontal drag turns the solid freely (on touch only once the finger has moved more
 * than 8 px and more sideways than down, so scrolling still scrolls); on release the extra turn coasts, then eases
 * to the nearest whole turn, back into the sway. still() draws the 30 degree pose.
 */
(() => {
  'use strict';
  const PARAMS = {
    spin: 0.62,          /* sway phase, radians per second (Calm halves) */
    swayDeg: 55,         /* yaw sway amplitude about face-on, degrees */
    pitch: 0.2,          /* radians, base tilt toward the viewer */
    sway: 0.12,          /* pitch sway amplitude, radians (Calm: none) */
    size: 0.33,          /* half-width of the chip, as a share of the smaller canvas side (portrait: of the width) */
    drop: 0.12,          /* chip centre below the vanishing point, share of height (landscape; portrait 0.04) */
    camDist: 5.2,        /* camera distance in chip half-widths */
    slab: 5,             /* half thickness, SVG units */
    relief: 4.5,         /* glyph height off the face, SVG units */
    frontAlpha: 0.13, backAlpha: 0.07, glyphAlpha: 0.55,
    edgeFront: 1, edgeBack: 0.26, edgeWidth: 1.4,
    glowWidth: 6, glowAlpha: 0.2,   /* the wide additive glow under the front edges */
    amber: 1,            /* peak alpha of the amber edge pass at face-on */
    backGlow: 0.22,      /* the soft light behind the chip, additive */
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
    return faces;
  }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1;
    let faces = build(params), yaw = params.stillYaw * Math.PI / 180, pitch = params.pitch;
    let ph = Math.asin(Math.min(1, params.stillYaw / params.swayDeg)), off = 0, offVel = 0;
    let drag = null, lastText = '', curText = '', sentAt = -1e9, flushT = 0, dead = false;   /* sentAt: a still drawn in the first 150 ms of page life must still report */
    const out = [];

    function draw() {
      const T = ctx.tokens;
      const cx = ctx.vp.x * w, cy = ctx.vp.y * h;
      const R = Math.min(w * params.size * 1.25, h * params.size), D = params.camDist * 42.5, f = R * (D - params.slab) / 42.5;   /* the front face plane projects at R */
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const oy = -h * (w > h ? params.drop : 0.04) * 42.5 / R;          /* below the eye line, in camera space */
      out.length = 0;
      let away = 0;
      for (const fc of faces) {
        const n = fc.v.length, sx = new Array(n), sy = new Array(n), cam = new Array(n);
        let zs = 0;
        for (let i = 0; i < n; i++) {
          const [x, y, z] = fc.v[i];
          const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;          /* yaw about Y */
          const y2 = y * cp + z1 * sp + oy, z2 = -y * sp + z1 * cp;       /* pitch about X: top leans away */
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
        out.push({ sx, sy, z: zs / n, facing, kind: fc.kind, edges: fc.edges });
      }
      out.sort((a, b) => a.z - b.z);                                     /* painter: far first */
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.clearRect(0, 0, w, h); g.fillStyle = T.field; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const heat = Math.pow(Math.max(0, cyw * cp), 4) * params.amber;
      /* the chip's own light on the field behind it: phosphor, warming toward amber as the face squares up */
      const gy = cy - oy * R / 42.5, gl = g.createRadialGradient(cx, gy, R * 0.1, cx, gy, R * 1.45);
      gl.addColorStop(0, ctx.rgba(T.phosphor, params.backGlow * (1 - 0.5 * heat)));
      gl.addColorStop(1, ctx.rgba(T.phosphor, 0));
      g.fillStyle = gl; g.fillRect(0, 0, w, h);
      if (heat > 0.01 && T.amber) {
        const ga = g.createRadialGradient(cx, gy, R * 0.1, cx, gy, R * 1.3);
        ga.addColorStop(0, ctx.rgba(T.amber, params.backGlow * 0.6 * heat)); ga.addColorStop(1, ctx.rgba(T.amber, 0));
        g.fillStyle = ga; g.fillRect(0, 0, w, h);
      }
      const front = new Path2D(), back = new Path2D();
      for (const o of out) {
        const p = new Path2D();
        p.moveTo(o.sx[0], o.sy[0]);
        for (let i = 1; i < o.sx.length; i++) p.lineTo(o.sx[i], o.sy[i]);
        p.closePath();
        const lit = o.facing > 0;
        const base = o.kind === 'slab' ? (lit ? params.frontAlpha : params.backAlpha) : (lit ? params.glyphAlpha : params.backAlpha);
        g.globalAlpha = base * (0.45 + 0.55 * Math.abs(o.facing));
        g.fillStyle = lit ? (o.kind === 'slab' ? T.phosphor : T.phosphorCore) : (T.phosphorDim || T.phosphor);
        g.fill(p);
        if (o.edges) (lit ? front : back).addPath(p);
      }
      g.lineJoin = 'round';
      g.lineWidth = params.edgeWidth * px;
      g.strokeStyle = T.phosphorDim || T.phosphor; g.globalAlpha = params.edgeBack; g.stroke(back);
      g.lineWidth = params.glowWidth * px; g.strokeStyle = T.phosphor; g.globalAlpha = params.glowAlpha * (1 - 0.8 * heat); g.stroke(front);
      if (heat > 0.01 && T.amber) { g.strokeStyle = T.amber; g.globalAlpha = heat * 0.45; g.stroke(front); }
      g.lineWidth = params.edgeWidth * px;
      g.strokeStyle = T.phosphorCore; g.globalAlpha = params.edgeFront * (1 - 0.85 * heat); g.stroke(front);
      if (heat > 0.01 && T.amber) { g.strokeStyle = T.amber; g.globalAlpha = heat; g.stroke(front); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const deg = (((yaw * 180 / Math.PI) + 180) % 360 + 360) % 360 - 180;   /* signed: 0 is face-on */
      const text = `yaw ${Math.round(deg)}° · ${faces.length} faces · ${away} facing away`;
      curText = text;
      const now = performance.now();   /* re-send twice a second: the HUD throttle drops, it does not defer */
      if (text !== lastText && now - sentAt > 150 || now - sentAt > 500) { lastText = text; sentAt = now; ctx.readout('mark', text); }
    }

    return {
      tick(dt, t, progress, pointer) {
        const calm = ctx.dial === 'calm';
        const cssW = Math.max(1, w / px), TAU = Math.PI * 2;
        ph += params.spin * (calm ? 0.5 : 1) * dt;
        if (ph > TAU * 64) ph -= TAU * 64;
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
        yaw = amp * Math.sin(ph) + off;
        pitch = params.pitch + (calm ? 0 : params.sway * Math.sin(ph * 0.61 + 0.8));
        draw();
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); },
      still() {
        yaw = params.stillYaw * Math.PI / 180; pitch = params.pitch; off = 0; offVel = 0;
        ph = Math.asin(Math.max(-1, Math.min(1, params.stillYaw / params.swayDeg)));
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
