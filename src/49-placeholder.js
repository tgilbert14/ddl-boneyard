/* BONEYARD PART · 00 · TUBE IDLE (PLACEHOLDER)
 * technique   a useful vector-tube calibration idle: shared-vanishing-point focus rosette, safe-frame brackets,
 *             perspective registration rays, concentric geometry and one deterministic beam probe
 * lineage     the idle screen of a vector CRT with no program loaded (the oscilloscope at rest; Vectrex, 1982, between games)
 * original    the placeholder the core mounts for any bay whose module has not landed yet, so the ride works end to
 *             end and a bay with no module still reads as a machine on the row. Its guides are also a practical starter:
 *             they expose the shared point, responsive safe bounds, DPR line weight and motion modes at a glance.
 * not         a loading spinner, a "coming soon" card, fake telemetry or text of any kind. Its nameplate below is the bay's real copy.
 * deps        none · Canvas 2D · 2026-09
 * budget      see docs/BUILD-LOG.md for the measured number @ 1440x900 x1.5 internal, desktop Chromium (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The safe frame, corner brackets and all perspective rays are recomputed from the current backing dimensions. Every
 * depth cue converges on ctx.vp, making a wrong host point immediately visible. Concentric ellipses and a small rosette
 * reveal aspect or DPR distortion. In motion, one probe travels around the outer ellipse and its radial beam crosses the
 * focus; Calm slows it, and still() chooses a deliberate fixed phase. The pattern uses no claims or numbers.
 */
(() => {
  'use strict';
  const PARAMS = {
    bloomR: 0.34,        /* radius as a fraction of the shorter side */
    bloomAlpha: 0.16,
    period: 5.6,
    bezel: 0.035,
    safeInset: 0.075,
    rings: 4,
    spokes: 12,
    probeAlpha: 0.72,
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, fallback) => Number.isFinite(+v) ? +v : fallback;
  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1;
    function stroke(path, colour, alpha, width) {
      g.strokeStyle = colour; g.globalAlpha = alpha * 0.2; g.lineWidth = width * px * 4; g.stroke(path);
      g.globalAlpha = alpha; g.lineWidth = width * px; g.stroke(path);
    }
    function draw(phase) {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h, m = Math.min(w, h);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      const r = clamp(finite(params.bloomR, 0.34), 0.05, 1.2) * m;
      const gr = g.createRadialGradient(vpX, vpY, 0, vpX, vpY, r);
      const bloom = clamp(finite(params.bloomAlpha, 0.16), 0, 0.8);
      gr.addColorStop(0, ctx.rgba(T.phosphor, bloom));
      gr.addColorStop(0.42, ctx.rgba(T.phosphor, bloom * 0.3));
      gr.addColorStop(1, ctx.rgba(T.phosphor, 0));
      g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(vpX - r, vpY - r, r * 2, r * 2);

      const b = clamp(finite(params.bezel, 0.035), 0.005, 0.2) * m;
      const safe = clamp(finite(params.safeInset, 0.075), 0.025, 0.3) * m;
      const x0 = safe, y0 = safe, x1 = w - safe, y1 = h - safe, corner = Math.max(8 * px, m * 0.035);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const frame = new Path2D();
      frame.moveTo(x0 + corner, y0); frame.lineTo(x1 - corner, y0); frame.lineTo(x1, y0 + corner);
      frame.moveTo(x1, y1 - corner); frame.lineTo(x1 - corner, y1); frame.lineTo(x0 + corner, y1); frame.lineTo(x0, y1 - corner);
      frame.moveTo(x0, y0 + corner); frame.lineTo(x0 + corner, y0);
      stroke(frame, T.phosphorDim, 0.72, 0.8);

      const rays = new Path2D();
      for (const q of [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [w * 0.5, y0], [w * 0.5, y1]]) { rays.moveTo(vpX, vpY); rays.lineTo(q[0], q[1]); }
      stroke(rays, T.phosphorDim, 0.28, 0.65);

      const axes = new Path2D();
      axes.moveTo(x0, vpY); axes.lineTo(x1, vpY); axes.moveTo(vpX, y0); axes.lineTo(vpX, y1);
      const ticks = 12;
      for (let i = 1; i < ticks; i++) {
        const x = x0 + (x1 - x0) * i / ticks, y = y0 + (y1 - y0) * i / ticks;
        axes.moveTo(x, vpY - 2.5 * px); axes.lineTo(x, vpY + 2.5 * px);
        axes.moveTo(vpX - 2.5 * px, y); axes.lineTo(vpX + 2.5 * px, y);
      }
      stroke(axes, T.phosphor, 0.44, 0.75);

      const rings = clamp(Math.round(finite(params.rings, 4)), 1, 12), ringPath = new Path2D();
      const maxR = Math.max(2 * px, Math.min(m * 0.31, Math.min(vpX - x0, x1 - vpX) * 0.9, Math.min(vpY - y0, y1 - vpY) * 1.35));
      for (let i = 1; i <= rings; i++) {
        const rr = maxR * i / rings;
        ringPath.ellipse(vpX, vpY, rr, rr * 0.62, 0, 0, Math.PI * 2);
      }
      stroke(ringPath, T.phosphor, 0.5, 0.72);

      const spokes = clamp(Math.round(finite(params.spokes, 12)), 4, 32), rosette = new Path2D(), sr = m * 0.045;
      for (let i = 0; i < spokes; i++) {
        const a = i / spokes * Math.PI * 2, r0 = sr * (i & 1 ? 0.28 : 0.48);
        rosette.moveTo(vpX + Math.cos(a) * r0, vpY + Math.sin(a) * r0);
        rosette.lineTo(vpX + Math.cos(a) * sr, vpY + Math.sin(a) * sr);
      }
      stroke(rosette, T.phosphorCore, 0.82, 0.78);

      const a = phase * Math.PI * 2, ex = vpX + Math.cos(a) * maxR, ey = vpY + Math.sin(a) * maxR * 0.62;
      const probe = new Path2D(); probe.moveTo(vpX, vpY); probe.lineTo(ex, ey);
      stroke(probe, T.amber, clamp(finite(params.probeAlpha, 0.72), 0, 1), 0.8);
      g.fillStyle = T.phosphorCore; g.globalAlpha = 0.95; g.beginPath(); g.arc(vpX, vpY, Math.max(1.25 * px, m * 0.002), 0, Math.PI * 2); g.fill();
      g.fillStyle = T.amber; g.globalAlpha = clamp(finite(params.probeAlpha, 0.72), 0, 1); g.beginPath(); g.arc(ex, ey, Math.max(1.4 * px, m * 0.0026), 0, Math.PI * 2); g.fill();

      g.strokeStyle = T.phosphorDim; g.globalAlpha = 0.8; g.lineWidth = Math.max(0.7, px);
      g.strokeRect(b + 0.5, b + 0.5, Math.max(1, w - 2 * b - 1), Math.max(1, h - 2 * b - 1));
      g.globalAlpha = 1;
    }
    return {
      tick(dt, t) { const period = clamp(finite(params.period, 5.6), 0.5, 60) * (ctx.dial === 'calm' ? 2 : 1); draw((finite(t, 0) / period) % 1); },
      resize(nw, nh, ndpr) { w = Math.max(1, finite(nw, canvas.width)); h = Math.max(1, finite(nh, canvas.height)); px = Math.max(0.75, finite(ndpr, 1)); },
      still() { draw(0.17); },
      destroy() { g.clearRect(0, 0, w, h); },
      params(p) { params = p || PARAMS; },
    };
  }
  BAYS.push({ slug: 'placeholder', title: 'Tube idle (placeholder)', order: 99, role: 'placeholder', params: PARAMS, mount });
})();
