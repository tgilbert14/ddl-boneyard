/* BONEYARD PART · C1 · SWITCH
 * technique   the CRT switch-off as compositor-only transforms on a room's wrapper: an accelerating slam of scaleY to
 *             a white-hot line (110 ms in Full, 200 in Calm), scaleX to a white dot (100 / 150 ms), the dot recedes to
 *             the vanishing point (420 / 600 ms); switch-on is the reverse with a small overshoot in Full
 * lineage     every CRT television's power-off, formalised by 1980s title sequences
 * original    driven by the Web Animations API on the room's inner wrapper (no per-frame JavaScript, no layout,
 *             no paint); the recede targets the SAME vanishing point every room shares; one flash frame at most and
 *             only in Full, rate-limited by the core to one per bay and never more than two a second; Still is a
 *             200 ms opacity crossfade
 * not         a shader, a fade-to-black cut, a flicker
 * deps        none · WAAPI (element.animate) · 2026-09
 * budget      0.0 ms/frame of JavaScript during the transition (compositor animations); measured in docs/BUILD-LOG.md, desktop Chromium, 2026-09-29
 * api         mount(container, params, ctx) -> { play(room, 'on'|'off', opts) -> Promise<boolean>, cancel(room), busy(room), anyBusy(), tick, resize, still, destroy }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Every play() also dispatches a window event 'boneyard:switch' with detail { dir: 'on' | 'off', slug, dial, flash }
 * so the sound module can clunk; nothing here listens for it. The white-hot line and dot are the room's flash layer
 * (a phosphor-core div inside the tube) brought to full opacity only while the tube is a sliver, so their light is a
 * line, never a frame. The one full-frame flash is the first 34 ms of a switch-off, only when the core grants it
 * (Full, rate-limited by the core to one each half second and here to one a second, because a bright bay arriving
 * is a luminance rise too: measured under WCAG 2.3.1's three a second), and only for a room that was on for
 * flashDwellMs.
 * A room is two nested wrappers around its canvas. The outer carries the 1/z approach scale the core writes each
 * frame (anchored on the vanishing point). This module animates the inner one. Switching off: three keyframe
 * segments on one transform animation, so the browser composites the whole thing without touching the main thread:
 * scale(1, 1) -> scale(1, .004) (the line) -> scale(.004, .004) (the dot) -> translate to the vanishing point at
 * scale 0. Switching on runs the same shape backward while the outer scale eases from the far-frame size to 1, so
 * the small frame on the horizon rushes up, flattens into a bright line, and opens. Under Still both directions
 * are a 200 ms opacity crossfade. play() resolves true on finish and false if cancelled by a faster scroll.
 */
(() => {
  'use strict';
  const PARAMS = {
    lineMs: 110,      /* Full: scaleY to the line (an accelerating slam) */
    dotMs: 100,       /* Full: scaleX to the dot */
    recedeMs: 420,    /* Full: the dot to the vanishing point */
    onMs: 320,        /* Full: switch-on total */
    calmLineMs: 200, calmDotMs: 150, calmRecedeMs: 600, calmOnMs: 380,
    overshoot: 0.05,  /* Full: switch-on opens this far past the frame, then settles */
    stillMs: 200,     /* the crossfade under Still */
    flashMs: 34,      /* two frames of afterglow at most */
    flashDwellMs: 700, /* only a room you actually watched earns the flash: a flick through the row never strobes */
    flashGapMs: 1000, /* this module's own floor between flashes, on top of the core's: bright bays arriving also count */
    lineScale: 0.004,
  };
  function mount(container, params, ctx) {
    const live = new Map();   /* room -> Animation[] */
    let lastFlash = -1e9;
    const onAt = new WeakMap();   /* room -> when it last switched on */
    const done = (room) => { live.delete(room); };
    function cancel(room) {
      const list = live.get(room); if (!list) return;
      for (const a of list) { try { a.cancel(); } catch (_) {} }
      live.delete(room);
    }
    function play(room, dir, opts) {
      opts = opts || {};
      cancel(room);
      const tube = room.tube, outer = room.room, flash = room.flash;
      const list = [];
      let main;
      const slug = (outer && outer.dataset && outer.dataset.slug) || '';
      const now = performance.now();
      if (dir === 'on') onAt.set(room, now);
      const flashNow = !!opts.flash && dir === 'off' && !opts.still && now - lastFlash > params.flashGapMs && now - (onAt.get(room) || 0) > params.flashDwellMs;
      if (flashNow) { lastFlash = now; ctx.share.flashAt = now; }
      try { window.dispatchEvent(new CustomEvent('boneyard:switch', { detail: { dir, slug, dial: ctx.dial, flash: flashNow } })); } catch (_) {}
      const calm = ctx.dial !== 'full';
      const lineMs = calm ? params.calmLineMs : params.lineMs, dotMs = calm ? params.calmDotMs : params.dotMs;
      const recedeMs = calm ? params.calmRecedeMs : params.recedeMs, onMs = calm ? params.calmOnMs : params.onMs;
      if (opts.still) {
        main = tube.animate([{ opacity: dir === 'on' ? 0 : 1 }, { opacity: dir === 'on' ? 1 : 0 }], { duration: params.stillMs, easing: 'linear', fill: dir === 'off' ? 'forwards' : 'none' });
        list.push(main);
      } else if (dir === 'on') {
        const from = Math.max(0.02, Math.min(1, opts.from || 0.02));
        list.push(outer.animate([{ transform: `translate3d(0,0,0) scale(${from})` }, { transform: 'translate3d(0,0,0) scale(1)' }], { duration: onMs, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'none' }));
        const ls = params.lineScale, os = calm ? 0 : params.overshoot;
        main = tube.animate(os ? [
          { transform: `scale(0.02, ${ls})`, easing: 'cubic-bezier(.2,.9,.3,1)' },
          { transform: `scale(${1 + os}, ${ls})`, offset: 0.3, easing: 'cubic-bezier(.4,0,.2,1)' },
          { transform: `scale(${1 + os * 0.4}, ${1 + os})`, offset: 0.72, easing: 'cubic-bezier(.4,0,.4,1)' },
          { transform: 'scale(1, 1)' },
        ] : [
          { transform: `scale(0.6, ${ls})`, easing: 'cubic-bezier(.3,.7,.4,1)' },
          { transform: `scale(1, ${ls})`, offset: 0.4, easing: 'cubic-bezier(.4,0,.2,1)' },
          { transform: 'scale(1, 1)' },
        ], { duration: onMs, fill: 'none' });
        list.push(main);
        /* the line opens white-hot and cools in the first few percent of its opening, while it is still a sliver */
        const lineAt = os ? 0.3 : 0.4;
        if (flash) list.push(flash.animate([{ opacity: 1 }, { opacity: 1, offset: lineAt }, { opacity: 0, offset: lineAt + 0.06 }, { opacity: 0 }], { duration: onMs, easing: 'linear', fill: 'none' }));
      } else {
        const total = lineMs + dotMs + recedeMs;
        const dx = (ctx.vp.x - 0.5) * innerWidth, dy = (ctx.vp.y - 0.5) * innerHeight;
        const oLine = lineMs / total, oDot = (lineMs + dotMs) / total;
        main = tube.animate([
          { transform: 'translate(0px, 0px) scale(1, 1)', easing: calm ? 'cubic-bezier(.4,0,.6,1)' : 'cubic-bezier(.6,0,1,.6)' },
          { transform: `translate(0px, 0px) scale(${calm ? 1 : 1.03}, ${params.lineScale})`, offset: oLine, easing: 'cubic-bezier(.5,0,.9,.5)' },
          { transform: `translate(0px, 0px) scale(${params.lineScale}, ${params.lineScale})`, offset: oDot, easing: 'cubic-bezier(.3,0,.7,1)' },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.0001, 0.0001)` },
        ], { duration: total, fill: 'forwards' });
        list.push(main);
        /* one keyframe list on the flash layer: the single flash frame (Full, core-granted), dark again within
           flashMs, then white-hot only once the tube is a sliver: through the line and the dot, out as it recedes */
        if (flash) {
          const oF = Math.min(oLine * 0.5, params.flashMs / total), oHeat = oLine * 0.86;
          list.push(flash.animate([
            { opacity: flashNow ? 0.9 : 0 },
            { opacity: 0, offset: oF },
            { opacity: 0, offset: oHeat },
            { opacity: 1, offset: oLine },
            { opacity: 1, offset: oDot + (1 - oDot) * 0.45 },
            { opacity: 0 },
          ], { duration: total, easing: 'linear', fill: 'none' }));
        }
      }
      live.set(room, list);
      return main.finished.then(() => { done(room); return true; }, () => { done(room); return false; });
    }
    return {
      play, cancel,
      busy(room) { return live.has(room); },
      anyBusy() { return live.size > 0; },
      tick() {}, resize() {}, still() {},
      destroy() { for (const room of [...live.keys()]) cancel(room); },
      params(p) { params = p; },
    };
  }
  BAYS.push({ slug: 'switch', title: 'Switch', order: 0, role: 'corridor', kind: 'dom', params: PARAMS, mount });
})();
