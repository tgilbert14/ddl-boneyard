/* BONEYARD PART · 08 · MARK
 * technique   glenz vectors: a low-poly solid whose faces are translucent, painter-sorted by depth and filled
 *             additively, so the back faces show through the front ones and pile up as light; edges stroked on top
 * lineage     Amiga demoscene glenz vectors (about 1989 to 1990)
 * original    the solid is the Desert Data Labs chip mark from ddl-cactus-mark.svg: the rounded square as a slab,
 *             with the saguaro circuit (trunk, the two arms that close into a diamond, the node, the ground rail)
 *             extruded off its face; 57 faces; projected toward the shared vanishing point so the keepsake sits in
 *             the same space as every pylon on the way in; drag to turn it, and it eases back to its slow spin
 * not         a textured logo render, a physics toy, a Boing ball. No lighting model beyond facing, no text.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.30 ms/frame @ 1440x900 x1 internal; 0.37 @ 390x844; headless desktop Chromium (2026-09-29), harness counter;
 *             phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The mark is built once in the SVG's own units (a 96 unit box, centre 48,48, y flipped to point up): the rounded
 * square is a 16-sided slab with three segments per corner, and each stroke of the glyph is a box extruded a few
 * units off the slab's face (the node is an octagonal prism that stands a little proud). Every face keeps an outward
 * winding, so after the spin (yaw about Y, a fixed pitch about X) its normal says whether it faces the viewer.
 *
 * Each frame the faces are sorted far to near by mean depth and filled with 'lighter' compositing at a low alpha:
 * front faces in phosphor, back faces dimmer, so wherever faces overlap the light adds up. Hard edges are then
 * stroked, back edges faint and front edges bright; the slab's rounded rim gets no seam lines. Horizontal drag turns
 * the solid (on touch only once the finger has moved more than 8 px and more sideways than down, so scrolling
 * still scrolls); on release the spin eases back to the slow cruise. still() draws the 30 degree pose.
 */
(() => {
  'use strict';
  const PARAMS = {
    spin: 0.42,          /* radians per second at cruise (Calm halves) */
    pitch: 0.24,         /* radians, fixed tilt toward the viewer */
    sway: 0.05,          /* pitch sway amplitude, Full only */
    size: 0.24,          /* half-width of the chip, as a share of the smaller canvas side (portrait: of the width) */
    camDist: 5.2,        /* camera distance in chip half-widths */
    slab: 5,             /* half thickness, SVG units */
    relief: 4.5,         /* glyph height off the face, SVG units */
    frontAlpha: 0.17, backAlpha: 0.09, glyphAlpha: 0.34,
    edgeFront: 0.75, edgeBack: 0.22, edgeWidth: 1.1,
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
    let faces = build(params), yaw = params.stillYaw * Math.PI / 180, vel = params.spin, pitch = params.pitch;
    let drag = null, lastText = '', sentAt = 0;
    const out = [];

    function draw() {
      const T = ctx.tokens;
      const cx = ctx.vp.x * w, cy = ctx.vp.y * h;
      const R = Math.min(w * params.size * 1.25, h * params.size), D = params.camDist * 42.5, f = R * (D - params.slab) / 42.5;   /* the front face plane projects at R */
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      out.length = 0;
      let away = 0;
      for (const fc of faces) {
        const n = fc.v.length, sx = new Array(n), sy = new Array(n), cam = new Array(n);
        let zs = 0;
        for (let i = 0; i < n; i++) {
          const [x, y, z] = fc.v[i];
          const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;          /* yaw about Y */
          const y2 = y * cp + z1 * sp, z2 = -y * sp + z1 * cp;            /* pitch about X: top leans away */
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
      g.strokeStyle = T.phosphorCore; g.globalAlpha = params.edgeFront; g.stroke(front);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
      const text = `yaw ${Math.round(deg)}° · ${faces.length} faces · ${away} facing away`;
      const now = performance.now();   /* re-send twice a second: the HUD throttle drops, it does not defer */
      if (text !== lastText && now - sentAt > 150 || now - sentAt > 500) { lastText = text; sentAt = now; ctx.readout('mark', text); }
    }

    return {
      tick(dt, t, progress, pointer) {
        const calm = ctx.dial === 'calm';
        const cruise = params.spin * (calm ? 0.5 : 1);
        const cssW = Math.max(1, w / px);
        if (pointer && pointer.down) {
          if (!drag) drag = { x0: pointer.x, y0: pointer.y, last: pointer.x, armed: !pointer.coarse };
          if (!drag.armed) {
            const dx = pointer.x - drag.x0, dy = pointer.y - drag.y0;
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { drag.armed = true; drag.last = pointer.x; }
          }
          if (drag.armed) {
            const d = (pointer.x - drag.last) / cssW * Math.PI * 1.6;
            drag.last = pointer.x;
            yaw += d;
            const v = dt > 0 ? d / dt : 0;
            vel += (v - vel) * (1 - Math.exp(-dt / 0.06));
          } else {
            vel += (cruise - vel) * (1 - Math.exp(-dt / (params.settle / 3)));
            yaw += vel * dt;
          }
        } else {
          drag = null;
          vel = Math.max(-12, Math.min(12, vel));
          vel += (cruise - vel) * (1 - Math.exp(-dt / (params.settle / 3)));
          yaw += vel * dt;
        }
        pitch = params.pitch + (calm ? 0 : params.sway * Math.sin(t * 0.37));
        draw();
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); },
      still() { yaw = params.stillYaw * Math.PI / 180; pitch = params.pitch; vel = params.spin; draw(); },
      destroy() { g.clearRect(0, 0, w, h); faces = []; out.length = 0; },
      params(p) { params = p; faces = build(p); },
    };
  }
  BAYS.push({ slug: 'mark', title: 'Mark', order: 8, role: 'bay', params: PARAMS, mount });
})();
