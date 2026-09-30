/* BONEYARD PART · L3 · THE YARD
 * technique   layered Canvas 2D industrial matte: cached vector chassis paths, local effect captures clipped into
 *             shaped CRT glass, and three console silhouettes staged in one-point perspective
 * lineage     the black-and-cyan light world of Tron (Steven Lisberger, 1982); the Tektronix 4014 storage terminal
 *             (1974); Syd Mead's painted production designs for electronic landscapes and working machines
 * original    a Desert Data Labs salvage observatory built from new vector shapes; its three live screens are actual
 *             captures of BONEYARD's own JUMP, RELIEF and SCOPE parts, with hand-drawn fallbacks from the same ideas
 * not         a film prop, a copied vehicle or a geographic view. The distant ridge is an illustrative desert profile,
 *             and every cabinet, control deck, vent, foot, dish and service light was drawn for this scene
 * deps        three local BONEYARD stills · Canvas 2D · 2026-09
 * budget      0.10 ms/frame @ 1440x900 dpr 1; 0.13 ms/frame @ 390x844 dpr 1, standalone headless Chromium harness
 *             (2026-09-30); JavaScript time only
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy(), params(p) }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * This layer is the establishing shot before BAY 01. A broad RELIEF console fills the lower frame while a tall JUMP
 * cabinet and a low SCOPE station sit farther up the floor. Their bases, service rails and scale all point back to
 * the shared vanishing point. The bodies use broad dark faces, silver edge planes, recessed vents, feet, controls
 * and a small amount of cyan screen spill, so they read as heavy stored hardware instead of glowing wire boxes.
 * Landscape keeps the centre console low beneath the title. Portrait gives it a taller chassis and a wider screen,
 * with both side machines cropped at the edges like a close camera placement.
 *
 * The host publishes ctx.share.yardProgress as scrollY / bayHeight. At zero the yard holds; after the visitor leaves,
 * the consoles drift toward the lens and dissolve before JUMP takes the frame. A standalone part has no published
 * progress and therefore stays at zero. Full motion breathes the tubes and service lamps, Calm slows and reduces that
 * motion, and still() chooses one fixed phase. Image loading is optional: each CRT has a vector fallback and redraws
 * synchronously when a local capture arrives. All geometry paths are built once and the blank post-yard path clears
 * only once, so the layer allocates almost nothing while idle or after it has left the screen.
 */
(() => {
  'use strict';

  const PARAMS = {
    consoleScale: 1,
    beamGlow: 0.72,
    sceneryDensity: 1,
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

  /* Main console, drawn in a one-unit box centred on x = 0. */
  const MAIN_SHADOW = new Path2D('M-.43 .08 L-.35 .015 Q-.32 -.015 -.27 -.015 L.27 -.015 Q.33 -.005 .39 .08 L.46 .64 L.39 .72 L.35 .93 L.24 .99 L.17 .82 L-.16 .82 L-.22 1 L-.36 .98 L-.39 .72 L-.47 .64 Z');
  const MAIN_FACE = new Path2D('M-.39 .075 L.36 .075 L.415 .625 L-.425 .625 Z');
  const MAIN_RIGHT = new Path2D('M.36 .075 L.415 .11 L.468 .645 L.415 .625 Z');
  const MAIN_TOP = new Path2D('M-.39 .075 L-.35 .025 L.31 .025 L.36 .075 Z');
  const MAIN_DECK = new Path2D('M-.425 .625 L.415 .625 L.325 .815 L-.34 .815 Z');
  const MAIN_LOWER = new Path2D('M-.34 .815 L.325 .815 L.35 .93 L.24 .99 L.17 .82 L-.16 .82 L-.22 1 L-.36 .98 Z');
  const MAIN_SCREEN = new Path2D('M-.315 .105 Q-.315 .075 -.278 .075 L.278 .075 Q.315 .075 .32 .112 L.347 .535 Q.35 .575 .305 .58 L-.302 .58 Q-.345 .575 -.342 .535 Z');
  const MAIN_GLASS = new Path2D('M-.287 .125 Q-.287 .102 -.26 .102 L.255 .102 Q.282 .102 .286 .13 L.311 .514 Q.314 .544 .281 .548 L-.275 .548 Q-.307 .544 -.304 .514 Z');
  const MAIN_SCREEN_P = new Path2D('M-.39 .115 Q-.39 .085 -.35 .085 L.35 .085 Q.39 .085 .392 .118 L.405 .405 Q.407 .438 .368 .442 L-.365 .442 Q-.405 .438 -.403 .405 Z');
  const MAIN_GLASS_P = new Path2D('M-.365 .132 Q-.365 .11 -.336 .11 L.335 .11 Q.365 .11 .368 .136 L.378 .385 Q.38 .414 .349 .417 L-.347 .417 Q-.378 .414 -.377 .385 Z');
  const MAIN_VENTS = new Path2D('M-.285 .86 L-.08 .86 L-.07 .93 L-.29 .93 Z');
  const MAIN_PANEL = new Path2D('M.04 .855 L.275 .855 L.29 .93 L.055 .93 Z');
  const MAIN_FOOT_L = new Path2D('M-.32 .92 L-.2 .925 L-.22 1 L-.36 .98 Z');
  const MAIN_FOOT_R = new Path2D('M.19 .925 L.31 .92 L.35 .98 L.23 1 Z');

  /* The left cabinet is tall and hooded; the right station is a low wedge. */
  const LEFT_BACK = new Path2D('M-.39 .09 L-.25 .01 L.25 .01 L.37 .1 L.42 .77 L.29 .88 L.23 1 L-.26 1 L-.32 .88 L-.43 .78 Z');
  const LEFT_FACE = new Path2D('M-.34 .1 L.27 .1 L.32 .75 L-.36 .75 Z');
  const LEFT_SIDE = new Path2D('M.27 .1 L.37 .14 L.42 .77 L.32 .75 Z');
  const LEFT_SCREEN = new Path2D('M-.27 .17 Q-.27 .13 -.23 .13 L.2 .13 Q.24 .13 .245 .17 L.27 .59 Q.272 .63 .23 .635 L-.235 .635 Q-.275 .63 -.273 .59 Z');
  const LEFT_GLASS = new Path2D('M-.238 .19 L.205 .19 L.225 .57 L-.242 .57 Z');
  const LEFT_BASE = new Path2D('M-.36 .75 L.32 .75 L.27 .91 L-.28 .91 Z');

  const RIGHT_BACK = new Path2D('M-.46 .27 L-.33 .11 L.29 .11 L.43 .27 L.46 .75 L.31 .9 L.25 1 L-.28 1 L-.34 .9 L-.47 .76 Z');
  const RIGHT_FACE = new Path2D('M-.4 .29 L-.28 .15 L.25 .15 L.37 .29 L.39 .72 L-.42 .72 Z');
  const RIGHT_SIDE = new Path2D('M.25 .15 L.34 .2 L.46 .75 L.39 .72 L.37 .29 Z');
  const RIGHT_SCREEN = new Path2D('M-.3 .25 L-.2 .18 L.18 .18 L.28 .25 L.29 .57 L-.32 .57 Z');
  const RIGHT_GLASS = new Path2D('M-.265 .27 L-.18 .215 L.16 .215 L.245 .27 L.252 .535 L-.282 .535 Z');
  const RIGHT_DECK = new Path2D('M-.42 .72 L.39 .72 L.29 .9 L-.34 .9 Z');

  const RIVETS = new Float32Array([-.365, .1, .335, .1, -.395, .605, .385, .605]);
  const RIDGE = new Float32Array([-.08, .01, .05, -.018, .12, .006, .2, -.044, .29, -.005, .37, -.026, .46, .008, .55, -.056, .64, -.014, .73, -.035, .82, .005, .91, -.025, 1.08, .012]);

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    const T = ctx.tokens;
    const C = {
      field: T.field,
      field2: T.field2,
      phosphor: T.phosphor,
      core: T.phosphorCore,
      dim: T.phosphorDim,
      amber: T.amber,
      ink: T.ink,
      inkDim: T.inkDim,
      line: T.line,
      black92: ctx.rgba(T.field, 0.92),
      black76: ctx.rgba(T.field, 0.76),
      black52: ctx.rgba(T.field, 0.52),
      blue96: ctx.rgba(T.field2, 0.96),
      blue82: ctx.rgba(T.field2, 0.82),
      blue52: ctx.rgba(T.field2, 0.52),
      silver30: ctx.rgba(T.inkDim, 0.3),
      silver20: ctx.rgba(T.inkDim, 0.2),
      silver12: ctx.rgba(T.ink, 0.12),
      silver07: ctx.rgba(T.ink, 0.07),
      line72: ctx.rgba(T.line, 0.72),
      line45: ctx.rgba(T.line, 0.45),
      cyan50: ctx.rgba(T.phosphor, 0.5),
      cyan40: ctx.rgba(T.phosphor, 0.4),
      cyan28: ctx.rgba(T.phosphor, 0.28),
      cyan15: ctx.rgba(T.phosphor, 0.15),
      cyan07: ctx.rgba(T.phosphor, 0.07),
      core70: ctx.rgba(T.phosphorCore, 0.7),
      core16: ctx.rgba(T.phosphorCore, 0.16),
      amber85: ctx.rgba(T.amber, 0.85),
      amber35: ctx.rgba(T.amber, 0.35),
      amber12: ctx.rgba(T.amber, 0.12),
    };

    let w = canvas.width, h = canvas.height, bd = 1, dead = false, blank = false, lastT = 0;
    const pics = [null, null, null];
    const pending = [null, null, null];
    const names = ['machine-jump.webp', 'machine-relief.webp', 'machine-scope.webp'];

    function assetUrls(name) {
      const bases = (ctx.assetBases && ctx.assetBases.length) ? ctx.assetBases : ['assets/', '../assets/'];
      const urls = new Array(bases.length);
      for (let i = 0; i < bases.length; i++) urls[i] = new URL(bases[i] + name, document.baseURI).href;
      return urls;
    }

    function load(slot) {
      const urls = assetUrls(names[slot]);
      const pic = new Image();
      pending[slot] = pic;
      pic.decoding = 'async';
      let n = 0;
      pic.onload = () => {
        if (dead) return;
        pics[slot] = pic;
        pending[slot] = null;
        render(lastT, ctx.dial === 'still');
        ctx.wake();
      };
      pic.onerror = () => {
        if (dead) return;
        n++;
        if (n < urls.length) pic.src = urls[n];
        else pending[slot] = null;
      };
      pic.src = urls[0];
    }

    function line(path, color, width, alpha) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.globalAlpha *= alpha;
      g.stroke(path);
      g.globalAlpha /= alpha;
    }

    function fillPath(path, color) {
      g.fillStyle = color;
      g.fill(path);
    }

    function cover(pic, x, y, rw, rh, sx, sy) {
      const ir = (pic.naturalWidth || 16) / Math.max(1, pic.naturalHeight || 9);
      const rr = rw * sx / Math.max(0.0001, rh * sy);
      let dx = x, dy = y, dw = rw, dh = rh;
      if (ir > rr) { dw = rh * sy * ir / sx; dx = x + (rw - dw) * 0.5; }
      else { dh = rw * sx / ir / sy; dy = y + (rh - dh) * 0.5; }
      g.drawImage(pic, dx, dy, dw, dh);
    }

    function fallback(kind, x, y, rw, rh, time) {
      g.fillStyle = C.black92;
      g.fillRect(x, y, rw, rh);
      g.strokeStyle = C.phosphor;
      g.lineCap = 'round';
      if (kind === 0) {
        const cx = x + rw * 0.52, cy = y + rh * 0.48;
        for (let i = 0; i < 18; i++) {
          const a = i * 2.39996 + 0.12;
          const k = 0.25 + ((i * 37) % 71) / 90;
          const r0 = Math.min(rw, rh) * (0.06 + 0.025 * Math.sin(time * 0.35 + i));
          const r1 = Math.min(rw, rh) * k;
          g.globalAlpha *= 0.35 + 0.55 * k;
          g.lineWidth = 0.005;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          g.stroke();
          g.globalAlpha /= 0.35 + 0.55 * k;
        }
        g.fillStyle = C.core;
        g.beginPath(); g.arc(cx, cy, Math.min(rw, rh) * 0.02, 0, Math.PI * 2); g.fill();
      } else if (kind === 1) {
        g.lineJoin = 'round';
        for (let j = 0; j < 10; j++) {
          const yy = y + rh * (0.26 + j * 0.062);
          g.globalAlpha *= 0.18 + j * 0.055;
          g.lineWidth = 0.0045;
          g.beginPath();
          for (let i = 0; i <= 40; i++) {
            const u = i / 40;
            const lift = (Math.sin(u * 11 + j * 0.48) + Math.sin(u * 23 - j) * 0.38 + Math.sin(u * 5 + 1.7) * 0.55) * rh * (0.018 + j * 0.001);
            const xx = x + rw * (0.06 + u * 0.88), py = yy - lift;
            if (i) g.lineTo(xx, py); else g.moveTo(xx, py);
          }
          g.stroke();
          g.globalAlpha /= 0.18 + j * 0.055;
        }
      } else {
        g.lineWidth = 0.006;
        g.globalAlpha *= 0.8;
        g.beginPath();
        for (let i = 0; i <= 120; i++) {
          const a = i / 120 * Math.PI * 2;
          const xx = x + rw * (0.5 + Math.sin(a * 3 + 0.32) * 0.36);
          const yy = y + rh * (0.5 + Math.sin(a * 2) * 0.36);
          if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy);
        }
        g.stroke();
        g.globalAlpha /= 0.8;
      }
    }

    function screen(pic, path, x, y, rw, rh, sx, sy, kind, time, pulse) {
      g.save();
      g.clip(path);
      g.fillStyle = C.field;
      g.fillRect(x, y, rw, rh);
      if (pic) {
        g.globalAlpha *= 0.82 + pulse * 0.12;
        cover(pic, x, y, rw, rh, sx, sy);
        g.globalAlpha /= 0.82 + pulse * 0.12;
        /* A second additive pass lifts only the capture's lit marks. Black stays black. */
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha *= 0.2 + pulse * 0.13;
        cover(pic, x, y, rw, rh, sx, sy);
        g.globalAlpha /= 0.2 + pulse * 0.13;
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha *= 0.035;
        g.fillStyle = C.phosphor;
        g.fillRect(x, y, rw, rh);
        g.globalAlpha /= 0.035;
      } else fallback(kind, x, y, rw, rh, time);
      /* One narrow glass sweep. The old full-panel wedge read as a dark mask over the capture. */
      g.globalAlpha *= 0.065;
      g.fillStyle = C.core;
      g.beginPath();
      g.moveTo(x + rw * 0.18, y);
      g.lineTo(x + rw * 0.34, y);
      g.lineTo(x - rw * 0.08, y + rh);
      g.lineTo(x - rw * 0.23, y + rh);
      g.closePath();
      g.fill();
      g.globalAlpha /= 0.065;
      g.restore();
    }

    function screenHalo(path, alpha, px) {
      g.save();
      g.fillStyle = C.cyan07;
      g.shadowColor = C.cyan50;
      g.shadowBlur = Math.max(2, params.beamGlow * px * bd);
      g.globalAlpha *= alpha;
      g.fill(path);
      g.globalAlpha /= alpha;
      g.restore();
    }

    function drawRidge(vpX, vpY, alpha, density) {
      if (density <= 0.02) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = alpha * clamp(0.45 + density * 0.3, 0, 1);
      g.fillStyle = C.blue82;
      g.strokeStyle = C.line72;
      g.lineWidth = Math.max(0.65, bd * 0.8);
      g.beginPath();
      g.moveTo(-w * 0.08, vpY + h * 0.012);
      for (let i = 0; i < RIDGE.length; i += 2) g.lineTo(w * RIDGE[i], vpY + h * RIDGE[i + 1]);
      g.lineTo(w * 1.08, vpY + h * 0.04);
      g.lineTo(w * 1.08, vpY + h * 0.08);
      g.lineTo(-w * 0.08, vpY + h * 0.08);
      g.closePath();
      g.fill();
      g.stroke();

      const count = Math.min(8, Math.max(0, Math.round(density * 4)));
      g.strokeStyle = C.cyan28;
      g.fillStyle = C.blue96;
      g.lineWidth = Math.max(0.6, bd * 0.72);
      for (let i = 0; i < count; i++) {
        const side = i & 1 ? 1 : -1;
        const d = 0.08 + (i + 1) * 0.048;
        const x = vpX + side * w * (0.08 + i * 0.045);
        const y = vpY + h * d;
        const hh = h * (0.025 + 0.007 * (count - i));
        g.fillRect(x - hh * 0.18, y - hh, hh * 0.36, hh);
        g.beginPath(); g.moveTo(vpX, vpY); g.lineTo(x, y); g.stroke();
        g.fillStyle = i % 3 === 0 ? C.amber35 : C.line72;
        g.beginPath(); g.arc(x, y - hh, Math.max(0.7, bd * 1.15), 0, Math.PI * 2); g.fill();
        g.fillStyle = C.blue96;
      }
      g.globalAlpha = 1;
    }

    function drawGround(vpX, vpY, cx, baseY, cw, alpha, ride) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = alpha;
      g.fillStyle = C.black52;
      g.beginPath();
      g.ellipse(cx, baseY - h * 0.008, cw * (0.48 + ride * 0.03), h * 0.026, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = C.cyan15;
      g.lineWidth = Math.max(0.55, bd * 0.75);
      g.beginPath();
      g.moveTo(vpX, vpY);
      g.lineTo(cx - cw * 0.36, baseY);
      g.moveTo(vpX, vpY);
      g.lineTo(cx + cw * 0.36, baseY);
      g.stroke();
      g.globalAlpha = 1;
    }

    function drawLeft(cx, baseY, mh, alpha, time, pulse) {
      const mw = mh * 0.72;
      g.setTransform(mw, 0, 0, mh, cx, baseY - mh);
      g.globalAlpha = alpha;
      g.lineJoin = 'round';
      fillPath(LEFT_BACK, C.black92);
      line(LEFT_BACK, C.line72, 0.008, 1);
      fillPath(LEFT_SIDE, C.silver12);
      fillPath(LEFT_FACE, C.blue96);
      fillPath(LEFT_FACE, C.silver07);
      line(LEFT_FACE, C.cyan28, 0.009, 1);
      line(LEFT_FACE, C.silver30, 0.0035, 1);
      screenHalo(LEFT_SCREEN, 0.6, 8);
      fillPath(LEFT_SCREEN, C.cyan15);
      screen(pics[0], LEFT_GLASS, -.238, .19, .467, .38, mw, mh, 0, time, pulse);
      line(LEFT_GLASS, C.cyan50, 0.009, 1);
      line(LEFT_GLASS, C.core70, 0.0025, 1);
      fillPath(LEFT_BASE, C.black76);
      line(LEFT_BASE, C.line72, 0.006, 1);

      g.fillStyle = C.silver12;
      for (let i = 0; i < 5; i++) g.fillRect(-.225 + i * .095, .79, .058, .018);
      g.fillStyle = C.amber;
      g.globalAlpha = alpha * (0.55 + pulse * 0.4);
      g.beginPath(); g.arc(-.265, .835, .025, 0, Math.PI * 2); g.fill();
      g.globalAlpha = alpha;
      g.strokeStyle = C.cyan28;
      g.lineWidth = 0.007;
      g.beginPath(); g.moveTo(-.03, .015); g.lineTo(-.03, -.13); g.lineTo(.075, -.2); g.stroke();
      g.fillStyle = C.core;
      g.beginPath(); g.arc(.075, -.2, .016, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }

    function drawRight(cx, baseY, mh, alpha, time, pulse) {
      const mw = mh * 0.9;
      g.setTransform(mw, 0, 0, mh, cx, baseY - mh);
      g.globalAlpha = alpha;
      g.lineJoin = 'round';
      fillPath(RIGHT_BACK, C.black92);
      line(RIGHT_BACK, C.line72, 0.008, 1);
      fillPath(RIGHT_SIDE, C.silver12);
      fillPath(RIGHT_FACE, C.blue96);
      fillPath(RIGHT_FACE, C.silver07);
      line(RIGHT_FACE, C.cyan28, 0.009, 1);
      line(RIGHT_FACE, C.silver30, 0.0035, 1);
      screenHalo(RIGHT_SCREEN, 0.55, 8);
      fillPath(RIGHT_SCREEN, C.cyan15);
      screen(pics[2], RIGHT_GLASS, -.282, .215, .534, .32, mw, mh, 2, time, pulse);
      line(RIGHT_GLASS, C.cyan50, 0.009, 1);
      line(RIGHT_GLASS, C.core70, 0.0025, 1);
      fillPath(RIGHT_DECK, C.black76);
      line(RIGHT_DECK, C.line72, 0.006, 1);

      g.fillStyle = C.silver20;
      g.beginPath(); g.arc(-.22, .8, .055, 0, Math.PI * 2); g.fill();
      g.strokeStyle = C.inkDim; g.lineWidth = .01;
      g.beginPath(); g.moveTo(-.22, .8); g.lineTo(-.19, .77); g.stroke();
      g.fillStyle = C.amber;
      g.globalAlpha = alpha * (0.6 + pulse * 0.35);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-.03 + i * .09, .81, .016, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = alpha;
      g.fillStyle = C.black76;
      g.fillRect(-.3, .91, .16, .09); g.fillRect(.14, .91, .16, .09);
      g.globalAlpha = 1;
    }

    function drawCentral(cx, baseY, cw, ch, alpha, time, pulse, portrait) {
      const screenOuter = portrait ? MAIN_SCREEN_P : MAIN_SCREEN;
      const glass = portrait ? MAIN_GLASS_P : MAIN_GLASS;
      const gx = portrait ? -.377 : -.304;
      const gy = portrait ? .11 : .102;
      const gw = portrait ? .755 : .615;
      const gh = portrait ? .307 : .446;

      g.setTransform(cw, 0, 0, ch, cx, baseY - ch);
      g.globalAlpha = alpha;
      g.lineJoin = 'round';
      g.lineCap = 'round';

      /* Articulated observation dish and mast, behind the cabinet. */
      g.strokeStyle = C.silver20;
      g.lineWidth = 0.008;
      g.beginPath();
      g.moveTo(.19, .03); g.lineTo(.24, -.105);
      g.moveTo(.24, -.105); g.quadraticCurveTo(.34, -.165, .39, -.055);
      g.quadraticCurveTo(.31, -.015, .24, -.105);
      g.moveTo(-.22, .035); g.lineTo(-.245, -.105);
      g.stroke();
      g.fillStyle = C.amber;
      g.globalAlpha = alpha * (0.58 + pulse * 0.38);
      g.beginPath(); g.arc(-.245, -.105, .011, 0, Math.PI * 2); g.fill();
      g.globalAlpha = alpha;

      fillPath(MAIN_SHADOW, C.black92);
      line(MAIN_SHADOW, C.line72, 0.007, 1);
      fillPath(MAIN_RIGHT, C.silver12);
      fillPath(MAIN_FACE, C.blue96);
      fillPath(MAIN_FACE, C.silver07);
      line(MAIN_FACE, C.cyan28, 0.009, 1);
      line(MAIN_FACE, C.silver30, 0.0035, 1);
      fillPath(MAIN_TOP, C.silver12);
      line(MAIN_TOP, C.line72, 0.005, 1);

      screenHalo(screenOuter, 0.78, 14);
      fillPath(screenOuter, C.cyan15);
      line(screenOuter, C.cyan50, 0.012, 1);
      line(screenOuter, C.core70, 0.003, 1);
      screen(pics[1], glass, gx, gy, gw, gh, cw, ch, 1, time, pulse);
      line(glass, C.cyan40, 0.0065, 1);
      line(glass, C.core70, 0.002, 1);

      /* A cyan reflection from the tube skims the sloped control deck. */
      fillPath(MAIN_DECK, C.black76);
      g.globalAlpha = alpha * (0.055 + pulse * 0.025);
      g.fillStyle = C.phosphor;
      g.beginPath();
      g.moveTo(-.2, .635); g.lineTo(.2, .635); g.lineTo(.11, .68); g.lineTo(-.12, .68); g.closePath(); g.fill();
      g.globalAlpha = alpha;
      line(MAIN_DECK, C.line72, 0.006, 1);
      fillPath(MAIN_LOWER, C.blue96);
      line(MAIN_LOWER, C.line72, 0.006, 1);
      fillPath(MAIN_FOOT_L, C.black92);
      fillPath(MAIN_FOOT_R, C.black92);

      /* Controls are physical, sparse and asymmetric. */
      g.fillStyle = C.silver20;
      g.beginPath(); g.arc(-.24, .715, .052, 0, Math.PI * 2); g.fill();
      g.strokeStyle = C.inkDim; g.lineWidth = 0.009;
      g.beginPath(); g.moveTo(-.24, .715); g.lineTo(-.205, .682); g.stroke();
      g.fillStyle = C.amber;
      g.globalAlpha = alpha * (0.56 + pulse * 0.4);
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-.06 + i * .082, .715 + (i & 1) * .012, .015, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = alpha;
      g.fillStyle = C.line72;
      g.fillRect(.23, .675, .075, .075);
      g.fillStyle = C.core;
      g.globalAlpha = alpha * (0.22 + pulse * 0.25);
      g.fillRect(.244, .69, .047, .045);
      g.globalAlpha = alpha;

      fillPath(MAIN_VENTS, C.black76);
      line(MAIN_VENTS, C.line72, 0.004, 1);
      g.strokeStyle = C.silver20;
      g.lineWidth = 0.005;
      for (let i = 0; i < 7; i++) {
        const xx = -.265 + i * .027;
        g.beginPath(); g.moveTo(xx, .875); g.lineTo(xx + .006, .916); g.stroke();
      }
      fillPath(MAIN_PANEL, C.black76);
      line(MAIN_PANEL, C.line72, 0.004, 1);
      g.fillStyle = C.amber35;
      for (let i = 0; i < 3; i++) g.fillRect(.075 + i * .06, .878, .032, .012);

      g.fillStyle = C.silver20;
      for (let i = 0; i < RIVETS.length; i += 2) { g.beginPath(); g.arc(RIVETS[i], RIVETS[i + 1], .008, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }

    function render(t, fixed) {
      if (dead) return;
      const raw = ctx.share && Number.isFinite(ctx.share.yardProgress) ? ctx.share.yardProgress : 0;
      const p = clamp(raw, 0, 1.2);
      const fade = 1 - smooth(0.56, 0.94, p);
      if (fade <= 0.001) {
        if (!blank) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); blank = true; }
        return;
      }
      blank = false;
      const portrait = h > w * 1.16;
      const calm = ctx.dial === 'calm';
      const mt = fixed ? 3.85 : t * (calm ? 0.28 : 1);
      const pulse = fixed ? 0.52 : (calm ? 0.52 + Math.sin(mt * 0.55) * 0.025 : 0.54 + Math.sin(mt * 0.85) * 0.085);
      const ride = smooth(0.04, 0.9, p);
      const density = clamp(params.sceneryDensity, 0, 3);
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      const centreX = w * 0.5 + (vpX - w * 0.5) * 0.24;

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, w, h);

      drawRidge(vpX, vpY, fade, density);

      const sideAlpha = fade * clamp(0.72 + density * 0.18, 0.72, 1);
      if (portrait) {
        const lh = h * 0.255 * (1 + ride * 0.05);
        const rh = h * 0.235 * (1 + ride * 0.05);
        const lx = centreX - w * (0.47 + ride * 0.025);
        const rx = centreX + w * (0.49 + ride * 0.03);
        const ly = h * (0.715 + ride * 0.04);
        const ry = h * (0.675 + ride * 0.045);
        drawGround(vpX, vpY, lx, ly, lh * 0.72, sideAlpha * 0.72, ride);
        drawGround(vpX, vpY, rx, ry, rh * 0.9, sideAlpha * 0.68, ride);
        drawLeft(lx, ly, lh, sideAlpha, mt, pulse);
        drawRight(rx, ry, rh, sideAlpha * 0.94, mt, pulse);
      } else {
        const lh = h * 0.34 * (1 + ride * 0.06);
        const rh = h * 0.29 * (1 + ride * 0.07);
        const lx = centreX - w * (0.285 + ride * 0.025);
        const rx = centreX + w * (0.31 + ride * 0.03);
        const ly = h * (0.76 + ride * 0.045);
        const ry = h * (0.705 + ride * 0.05);
        drawGround(vpX, vpY, lx, ly, lh * 0.72, sideAlpha * 0.72, ride);
        drawGround(vpX, vpY, rx, ry, rh * 0.9, sideAlpha * 0.68, ride);
        drawLeft(lx, ly, lh, sideAlpha, mt, pulse);
        drawRight(rx, ry, rh, sideAlpha * 0.94, mt, pulse);
      }

      const cs = clamp(params.consoleScale, 0.55, 1.7) * (1 + ride * 0.15);
      let cw, ch, baseY;
      if (portrait) {
        cw = Math.min(w * 0.96, h * 0.54) * cs;
        ch = h * 0.59 * cs;
        baseY = h * (0.965 + ride * 0.12);
      } else {
        cw = Math.min(w * 0.58, h * 0.86) * cs;
        ch = cw * 0.66;
        baseY = h * (0.95 + ride * 0.105);
      }
      drawGround(vpX, vpY, centreX, baseY, cw, fade * 0.92, ride);
      drawCentral(centreX, baseY, cw, ch, fade, mt, pulse, portrait);
    }

    load(0); load(1); load(2);

    return {
      tick(dt, t, progress, pointer) {
        lastT = t;
        render(t, false);
      },
      resize(nw, nh, ndpr) {
        w = nw;
        h = nh;
        bd = ndpr || 1;
        blank = false;
      },
      still(t) {
        lastT = t || 0;
        render(lastT, true);
      },
      destroy() {
        dead = true;
        for (let i = 0; i < pending.length; i++) if (pending[i]) { pending[i].onload = null; pending[i].onerror = null; }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, w, h);
      },
      params(p) {
        params = p;
      },
    };
  }

  BAYS.push({ slug: 'yard-scene', title: 'The yard', order: 3, role: 'layer', params: PARAMS, mount });
})();
