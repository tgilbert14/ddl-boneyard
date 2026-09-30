/* BONEYARD PART · 00 · TUBE IDLE (PLACEHOLDER)
 * technique   the designed idle of a switched-on vector tube: a centre bloom on the vanishing point, one horizontal
 *             hairline that breathes, an inset bezel; nothing else
 * lineage     the idle screen of a vector CRT with no program loaded (the oscilloscope at rest; Vectrex, 1982, between games)
 * original    the placeholder the core mounts for any bay whose module has not landed yet, so
 *             the ride works end to end and a bay with no module still reads as a machine on the row. Builders replace
 *             it by registering role 'bay' with the bay's slug (docs/CONTRACT.md); the core prefers a real module.
 * not         a loading spinner, a "coming soon" card, text of any kind. Its nameplate below is the bay's real copy.
 * deps        none · Canvas 2D · 2026-09
 * budget      see docs/BUILD-LOG.md for the measured number @ 1440x900 x1.5 internal, desktop Chromium (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * A radial gradient in the phosphor colour sits on the shared vanishing point and breathes by breathe around its
 * base alpha over period seconds. A hairline crosses the frame at the vanishing point's height, double-stroked. A
 * bezel rectangle is inset by bezel of the shorter side. still() draws the same frame at mid-breath.
 */
(() => {
  'use strict';
  const PARAMS = {
    bloomR: 0.42,        /* radius as a fraction of the shorter side */
    bloomAlpha: 0.22,
    breathe: 0.07,
    period: 4.2,
    bezel: 0.035,
    hairlineAlpha: 0.7,
  };
  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1;
    function draw(phase) {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h, m = Math.min(w, h);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      const r = params.bloomR * m;
      const gr = g.createRadialGradient(vpX, vpY, 0, vpX, vpY, r);
      gr.addColorStop(0, ctx.rgba(T.phosphor, params.bloomAlpha + params.breathe * phase));
      gr.addColorStop(0.5, ctx.rgba(T.phosphor, (params.bloomAlpha + params.breathe * phase) * 0.35));
      gr.addColorStop(1, ctx.rgba(T.phosphor, 0));
      g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(vpX - r, vpY - r, r * 2, r * 2);
      /* the hairline */
      g.lineCap = 'round';
      g.strokeStyle = T.phosphor; g.globalAlpha = params.hairlineAlpha * 0.3; g.lineWidth = 4 * px;
      g.beginPath(); g.moveTo(w * 0.08, vpY); g.lineTo(w * 0.92, vpY); g.stroke();
      g.strokeStyle = T.phosphorCore; g.globalAlpha = params.hairlineAlpha; g.lineWidth = 1 * px; g.stroke();
      /* the dot on the point */
      g.fillStyle = T.phosphorCore; g.globalAlpha = 0.9; g.beginPath(); g.arc(vpX, vpY, 1.6 * px, 0, Math.PI * 2); g.fill();
      /* the bezel */
      const b = params.bezel * m;
      g.strokeStyle = T.phosphorDim; g.globalAlpha = 1; g.lineWidth = 1 * px;
      g.strokeRect(b + 0.5, b + 0.5, w - 2 * b - 1, h - 2 * b - 1);
      g.globalAlpha = 1;
    }
    return {
      tick(dt, t) { draw(Math.sin(t / params.period * Math.PI * 2)); },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); },
      still() { draw(0); },
      destroy() { g.clearRect(0, 0, w, h); },
      params(p) { params = p; },
    };
  }
  BAYS.push({ slug: 'placeholder', title: 'Tube idle (placeholder)', order: 99, role: 'placeholder', params: PARAMS, mount });
})();
