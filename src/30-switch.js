/* BONEYARD PART · C1 · SWITCH
 * technique   the CRT switch-off as compositor-only transforms on a room's wrapper: scaleY to a 2 px line (200 ms),
 *             scaleX to a dot (150 ms), the dot recedes to the vanishing point (600 ms); switch-on is the reverse
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
    lineMs: 200,      /* scaleY to the line */
    dotMs: 150,       /* scaleX to the dot */
    recedeMs: 600,    /* the dot to the vanishing point */
    onMs: 380,        /* switch-on total */
    stillMs: 200,     /* the crossfade under Still */
    flashMs: 34,      /* two frames of afterglow at most */
    lineScale: 0.004,
  };
  function mount(container, params, ctx) {
    const live = new Map();   /* room -> Animation[] */
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
      if (opts.still) {
        main = tube.animate([{ opacity: dir === 'on' ? 0 : 1 }, { opacity: dir === 'on' ? 1 : 0 }], { duration: params.stillMs, easing: 'linear', fill: dir === 'off' ? 'forwards' : 'none' });
        list.push(main);
      } else if (dir === 'on') {
        const from = Math.max(0.02, Math.min(1, opts.from || 0.02));
        list.push(outer.animate([{ transform: `translate3d(0,0,0) scale(${from})` }, { transform: 'translate3d(0,0,0) scale(1)' }], { duration: params.onMs, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'none' }));
        main = tube.animate([
          { transform: `scale(0.6, ${params.lineScale})`, easing: 'cubic-bezier(.3,.7,.4,1)' },
          { transform: `scale(1, ${params.lineScale})`, offset: 0.4, easing: 'cubic-bezier(.2,.8,.2,1)' },
          { transform: 'scale(1, 1)' },
        ], { duration: params.onMs, fill: 'none' });
        list.push(main);
      } else {
        const total = params.lineMs + params.dotMs + params.recedeMs;
        const dx = (ctx.vp.x - 0.5) * innerWidth, dy = (ctx.vp.y - 0.5) * innerHeight;
        main = tube.animate([
          { transform: 'translate(0px, 0px) scale(1, 1)', easing: 'cubic-bezier(.4,0,.6,1)' },
          { transform: `translate(0px, 0px) scale(1, ${params.lineScale})`, offset: params.lineMs / total, easing: 'cubic-bezier(.4,0,.8,1)' },
          { transform: `translate(0px, 0px) scale(${params.lineScale}, ${params.lineScale})`, offset: (params.lineMs + params.dotMs) / total, easing: 'cubic-bezier(.3,0,.7,1)' },
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.0001, 0.0001)` },
        ], { duration: total, fill: 'forwards' });
        list.push(main);
        if (opts.flash && flash) list.push(flash.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: params.flashMs, easing: 'ease-out', fill: 'none' }));
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
