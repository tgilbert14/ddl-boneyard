/* BONEYARD PART · 07 · SCOPE
 * technique   a recessed XY oscilloscope: X against Y traces a Lissajous figure in a chamfered phosphor well with
 *             harmonic ticks, two live phase rotors and envelope rails; persistence is five explicit recent traces;
 *             press-and-hold starts two WebAudio oscillators and draws the actual post-envelope analyser samples
 * lineage     Lissajous figures (Jules Antoine Lissajous, 1857); the oscilloscope's XY mode; oscilloscope music
 *             (the 2010s practice of composing stereo sound whose two channels draw pictures on an XY scope)
 * original    what you hear is exactly what you see: the held trace is the post-envelope signal on its way to your
 *             speakers, so the attack grows the figure and the release shrinks it to a dot; pointer X detunes the
 *             ratio and snaps gently toward 4:3, 3:2, 5:3 and 2:1; the top and side ticks show the nearest numerator
 *             and denominator, the rotors show both channel phases, and held energy closes the amber coupling braces
 *             while the two lower rails show the measured channel levels; the site's only voice is one you hold down
 * not         a synthesizer, a music player, an autoplay tone. No AudioContext exists until a hold; nothing sounds
 *             without one; peak gain 0.08. If audio is blocked the trace stays computed and says so.
 * deps        none · Canvas 2D + Web Audio · 2026-09
 * budget      0.60 ms/frame held live @ 720x450 capped backing in a 1440x900 stage; 0.60 ms/frame @ 390x844;
 *             fourfold CPU slowdown, local Chromium parts harness (2026-09-30); phone hardware TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Idle, the beam is computed: x = sin(2 pi r s + phase), y = sin(2 pi s), where r is the frequency ratio X:Y. Pointer X
 * maps to r = 1.5 * 2^((x - 0.5) * span), so the middle of the screen (or no pointer at all) is exactly 3:2; within
 * snapWidth of a simple ratio the value is pulled most of the way onto it, never all the way, so the figure still
 * turns. The canvas is cleared every frame (no 8-bit fade, so no ghost that never quite dies); persistence is a
 * short history of the trace, sampled every few hundredths of a second, redrawn oldest first at falling alpha with
 * additive light, so a moving figure leaves a real trail and a still one burns brighter. The newest copy gets a
 * wide halo, a mid glow and a thin white-hot core, and a bright beam head sweeps along it. The nearest simple ratio
 * sets real harmonic counts around the glass, while two small rotors reuse the exact X and Y phases at the beam head.
 *
 * Holding the pointer (or Space) creates or resumes an AudioContext inside that gesture (a mouse press or a key;
 * on touch, where only the release counts as a user gesture, the first release after a hold unlocks it), then
 * starts two OscillatorNodes at base * r and base Hz into a ChannelMerger (X left, Y right), through one GainNode
 * envelope (soft attack to about 0.08, soft release to zero), to the speakers. A ChannelSplitter after the envelope
 * feeds two AnalyserNodes; while the voice lives, the trace is their time-domain samples plotted X against Y. The
 * voice waits for a short hold before starting, so a scroll swipe never chirps. Release ramps the gain down and
 * stops the oscillators. A watchdog stops the voice if the ride stops ticking the room (switched off, hidden tab)
 * while a hold is still down. destroy() closes the context.
 */
(() => {
  'use strict';
  const PARAMS = {
    maxBackingWidth: 720,   /* px; above this the canvas renders smaller and CSS scales it up */
    base: 110,            /* Hz, the Y oscillator */
    span: 0.83,           /* pointer X across the screen = this many octaves of ratio, centred on 3:2 */
    snapWidth: 0.055,     /* ratio distance inside which the pull starts */
    snapPull: 0.88,       /* how far onto the simple ratio (1 would lock it) */
    drift: 0.5,           /* idle phase drift, radians per second (Calm halves) */
    sweep: 0.9,           /* idle beam head: full figures per second (Calm halves) */
    radius: 0.34,         /* trace radius; leaves room for the instrument well on phones */
    copies: 5,            /* persistent copies of the trace, newest included (3 to 5) */
    copyEvery: 0.05,      /* seconds between history samples */
    decay: 0.58,          /* alpha of each older copy relative to the next newer one */
    haloWidth: 16, glowWidth: 5, coreWidth: 1.8,
    haloAlpha: 0.13, glowAlpha: 0.42, coreAlpha: 1,
    gridAlpha: 0.07,
    bezelAlpha: 0.28,
    glassAlpha: 0.14,
    phaseAlpha: 0.62,
    holdBoost: 0.55,
    minHold: 0.06,        /* seconds a hold must last before the voice starts (touch: at least 0.18) */
    peak: 0.08, attack: 0.07, release: 0.28,
    fftSize: 2048,
  };
  const SIMPLE = [[4, 3], [3, 2], [5, 3], [2, 1]];
  const CYCLES = 6;       /* y cycles drawn: closes every ratio in SIMPLE */

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1;
    let phase = 0.35, sweepS = 0, ratio = 1.5, lastTick = -1e9, lastText = '', sentAt = -1e9;
    let lockK = 0, holdEnergy = 0, visualK = 1, histT = 0, heldFor = 0, heldAt = -1e9, displayS = 0;
    let signal = { rmsX: 0, rmsY: 0, corr: 0, headX: 0, headY: 0 };
    const hist = [];      /* newest last: { path } */
    const AC = window.AudioContext || window.webkitAudioContext;
    let ac = null, chain = null, voice = null, blocked = false, dog = 0, dead = false;
    let bufX = null, bufY = null;
    const inParts = /\/parts\//.test(location.pathname);

    /* ---------- ratio: pointer X, snapped gently ---------- */
    function nearest(r) {
      let best = SIMPLE[0], d = Infinity;
      for (const s of SIMPLE) { const e = Math.abs(r - s[0] / s[1]); if (e < d) { d = e; best = s; } }
      return best;
    }
    function ratioFrom(nx) {
      const raw = 1.5 * Math.pow(2, (Math.min(1, Math.max(0, nx)) - 0.5) * params.span);
      const s = nearest(raw), target = s[0] / s[1], d = Math.abs(raw - target);
      if (d >= params.snapWidth) return raw;
      const k = 1 - d / params.snapWidth;
      return raw + (target - raw) * params.snapPull * k * k * (3 - 2 * k);
    }
    const locked = (r) => { const s = nearest(r); return Math.abs(r - s[0] / s[1]) < 0.0045; };
    function label(r) { const s = nearest(r); return locked(r) ? `${s[0]}:${s[1]}` : r.toFixed(3); }

    /* ---------- audio: created only inside a hold gesture ---------- */
    function unlock() {
      if (!AC || dead) return;
      try { if (!ac) ac = new AC({ latencyHint: 'interactive' }); } catch (_) { blocked = true; return; }
      if (ac.state === 'suspended') ac.resume().then(() => { blocked = false; }, () => { blocked = true; });
    }
    function onGesture(e) {
      const now = performance.now();
      if (now - lastTick > 250 || ctx.dial === 'still') return;   /* only while this room is live */
      const tg = e.target && e.target.closest ? e.target : null;
      if (tg && tg.closest('.bay-hold')) {
        if ((e.type === 'keydown' && [' ', 'Enter'].includes(e.key) && !e.repeat) || e.type === 'pointerdown' || e.type === 'pointerup') unlock();
        return;
      }
      if (e.type === 'keydown') {
        if (e.key !== ' ' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
        if (tg && tg.closest('input, select, textarea, button, a')) return;
        unlock(); return;
      }
      if (tg && tg.closest(inParts ? 'main, a, button, input' : '#hud, #dev, a, button, input')) return;
      const touch = e.type === 'touchend' || (e.pointerType && e.pointerType !== 'mouse');
      if (e.type === 'pointerdown') {
        /* a mouse press is a user gesture; a touch press is not (the browser only counts the release) */
        if (!touch && e.button === 0) unlock();
        return;
      }
      /* pointerup / touchend: the release is the gesture on touch (iOS and the HTML spec). Only after a real hold,
         so a scroll swipe never creates a context; a context that already exists just gets resumed. */
      if (ac && ac.state === 'suspended') { unlock(); return; }
      if (!ac && now - heldAt < 800) unlock();
    }
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) addEventListener(type, onGesture, { capture: true, passive: true });

    function build() {
      const merger = ac.createChannelMerger(2);
      const env = ac.createGain(); env.gain.value = 0;
      const split = ac.createChannelSplitter(2);
      const ax = ac.createAnalyser(), ay = ac.createAnalyser();
      ax.fftSize = ay.fftSize = params.fftSize;
      merger.connect(env); env.connect(ac.destination); env.connect(split);
      split.connect(ax, 0); split.connect(ay, 1);
      bufX = new Float32Array(ax.fftSize); bufY = new Float32Array(ay.fftSize);
      chain = { merger, env, ax, ay };
    }
    function startVoice() {
      if (!ac || ac.state === 'closed') return;
      if (!chain) build();
      const now = ac.currentTime;
      const ox = ac.createOscillator(), oy = ac.createOscillator();
      ox.frequency.value = params.base * ratio; oy.frequency.value = params.base;
      ox.connect(chain.merger, 0, 0); oy.connect(chain.merger, 0, 1);
      const gn = chain.env.gain;
      gn.cancelScheduledValues(now); gn.setValueAtTime(gn.value, now);
      gn.setTargetAtTime(params.peak, now, params.attack / 3);
      ox.start(now); oy.start(now);
      voice = { ox, oy, releasedAt: 0, until: Infinity };
    }
    function releaseVoice() {
      if (!voice || voice.releasedAt) return;
      const now = ac.currentTime, gn = chain.env.gain;
      gn.cancelScheduledValues(now); gn.setValueAtTime(gn.value, now);
      gn.setTargetAtTime(0, now, params.release / 4);
      const end = now + params.release * 1.6;
      try { voice.ox.stop(end); voice.oy.stop(end); } catch (_) {}
      voice.releasedAt = performance.now(); voice.until = voice.releasedAt + params.release * 1600 + 60;
    }
    function watchdog() { clearTimeout(dog); if (voice && !voice.releasedAt) dog = setTimeout(releaseVoice, 300); }

    /* ---------- drawing ---------- */
    const geom = () => {
      const R = Math.min(w, h) * params.radius, portrait = w < h;
      const cx = ctx.vp.x * w, cy = ctx.vp.y * h + Math.min(h * (portrait ? 0.065 : 0.11), R * 0.34);
      const hw = Math.min(w * 0.475, R * 1.42), hh = Math.min(h * 0.46, R * 1.28);
      return { cx, cy, R, hw, hh, iw: hw * 0.87, ih: hh * 0.84, cut: Math.min(R * 0.15, hw * 0.13, hh * 0.13) };
    };
    function chamfer(cx, cy, hw, hh, cut) {
      const p = new Path2D();
      p.moveTo(cx - hw + cut, cy - hh); p.lineTo(cx + hw - cut, cy - hh);
      p.lineTo(cx + hw, cy - hh + cut); p.lineTo(cx + hw, cy + hh - cut);
      p.lineTo(cx + hw - cut, cy + hh); p.lineTo(cx - hw + cut, cy + hh);
      p.lineTo(cx - hw, cy + hh - cut); p.lineTo(cx - hw, cy - hh + cut); p.closePath();
      return p;
    }
    const glassPath = () => { const m = geom(); return chamfer(m.cx, m.cy, m.iw, m.ih, m.cut * 0.58); };
    function clear() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.fillStyle = ctx.tokens.field; g.fillRect(0, 0, w, h);
    }
    function instrumentBack(energy) {
      const m = geom(), T = ctx.tokens, vx = ctx.vp.x * w, vy = ctx.vp.y * h;
      const glow = g.createRadialGradient(m.cx, m.cy, m.R * 0.5, m.cx, m.cy, m.hw * 1.28);
      glow.addColorStop(0, ctx.rgba(T.phosphor, params.bezelAlpha * visualK * (0.24 + energy * 0.2)));
      glow.addColorStop(1, ctx.rgba(T.phosphor, 0));
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; g.fillStyle = glow;
      g.fillRect(m.cx - m.hw * 1.4, m.cy - m.hh * 1.4, m.hw * 2.8, m.hh * 2.8);
      g.globalCompositeOperation = 'source-over';
      /* Four shells recede toward the shared vanishing point, turning the flat graph into an instrument well. */
      for (let i = 3; i >= 0; i--) {
        const q = i / 3, ox = (vx - m.cx) * q * 0.11, oy = (vy - m.cy) * q * 0.11;
        const p = chamfer(m.cx + ox, m.cy + oy, m.hw * (1 + q * 0.045), m.hh * (1 + q * 0.045), m.cut * (1 + q * 0.2));
        g.fillStyle = i ? ctx.rgba(T.field2 || T.field, 0.88) : T.field2 || T.field; g.globalAlpha = 1; g.fill(p);
        g.strokeStyle = i === 0 ? T.phosphor : (T.phosphorDim || T.phosphor);
        g.globalAlpha = params.bezelAlpha * visualK * (i === 0 ? 1 : 0.42); g.lineWidth = (i === 0 ? 1.25 : 0.8) * px; g.stroke(p);
      }
      const gp = glassPath(), glass = g.createRadialGradient(m.cx - m.R * 0.22, m.cy - m.R * 0.26, 0, m.cx, m.cy, m.iw * 1.2);
      glass.addColorStop(0, ctx.rgba(T.phosphor, params.glassAlpha * (1 + energy * 0.3)));
      glass.addColorStop(0.55, ctx.rgba(T.field2 || T.field, 0.74));
      glass.addColorStop(1, ctx.rgba(T.field, 0.96));
      g.fillStyle = glass; g.globalAlpha = 1; g.fill(gp);
      /* Corner fasteners give the housing a readable scale on small screens. */
      const r = Math.max(1.5 * px, m.R * 0.012), pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      g.fillStyle = T.phosphorDim || T.phosphor;
      for (const [sx, sy] of pts) {
        const x = m.cx + sx * (m.hw - m.cut * 0.58), y = m.cy + sy * (m.hh - m.cut * 0.58);
        g.globalAlpha = 0.48 * visualK; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    function graticule(a) {
      const { cx, cy, R, iw, ih } = geom(), T = ctx.tokens, minor = new Path2D(), major = new Path2D();
      const step = R / 4, spanX = Math.min(iw * 0.94, R * 1.12), spanY = Math.min(ih * 0.94, R * 1.12);
      for (let i = -4; i <= 4; i++) {
        const o = i * step, p = i === 0 ? major : minor;
        p.moveTo(cx + o, cy - spanY); p.lineTo(cx + o, cy + spanY);
        p.moveTo(cx - spanX, cy + o); p.lineTo(cx + spanX, cy + o);
      }
      g.save(); g.clip(glassPath());
      g.globalAlpha = a; g.strokeStyle = T.phosphorDim || T.phosphor; g.lineWidth = Math.max(1, px * 0.72); g.stroke(minor);
      g.globalAlpha = a * 2.6; g.strokeStyle = T.phosphor; g.lineWidth = Math.max(1, px); g.stroke(major);
      const rings = new Path2D();
      for (let i = 1; i <= 3; i++) { rings.moveTo(cx + R * i / 4, cy); rings.arc(cx, cy, R * i / 4, 0, Math.PI * 2); }
      g.setLineDash([2 * px, 8 * px]); g.globalAlpha = a * 0.75; g.strokeStyle = T.phosphorDim || T.phosphor; g.stroke(rings); g.setLineDash([]);
      g.restore(); g.globalAlpha = 1;
    }
    /* one pass of light: k scales every layer; full adds the white-hot core */
    function beam(path, k, full) {
      const T = ctx.tokens;
      const boost = 1 + holdEnergy * params.holdBoost;
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = T.phosphor; g.globalAlpha = params.haloAlpha * k * boost * visualK * (1 - 0.56 * lockK); g.lineWidth = params.haloWidth * px * (1 + holdEnergy * 0.28); g.stroke(path);
      if (lockK > 0.01 && T.amber) { g.strokeStyle = T.amber; g.globalAlpha = params.haloAlpha * k * lockK * boost * visualK; g.stroke(path); }
      g.strokeStyle = T.phosphor; g.globalAlpha = Math.min(1, params.glowAlpha * k * boost * visualK); g.lineWidth = params.glowWidth * px * (1 + holdEnergy * 0.12); g.stroke(path);
      if (full) { g.strokeStyle = T.phosphorCore; g.globalAlpha = params.coreAlpha * Math.min(1, k) * visualK; g.lineWidth = params.coreWidth * px; g.stroke(path); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    function curve(r, ph, s0, s1, n) {
      const { cx, cy, R } = geom(), p = new Path2D(), TAU = Math.PI * 2;
      for (let i = 0; i <= n; i++) {
        const s = s0 + (s1 - s0) * i / n;
        const x = cx + R * Math.sin(TAU * r * s + ph), y = cy - R * Math.sin(TAU * s);
        if (i) p.lineTo(x, y); else p.moveTo(x, y);
      }
      return p;
    }
    function samples() {
      const { cx, cy, R } = geom(), p = new Path2D(), k = R / params.peak;
      chain.ax.getFloatTimeDomainData(bufX); chain.ay.getFloatTimeDomainData(bufY);
      /* the newest samples covering one period of the nearest simple figure (q cycles of Y), a little over */
      const q = nearest(ratio)[1], n = Math.min(bufX.length, Math.ceil(ac.sampleRate * q / params.base * 1.04));
      let xx = 0, yy = 0, xy = 0;
      for (let i = bufX.length - n; i < bufX.length; i++) {
        const vx = bufX[i], vy = bufY[i], x = cx + vx * k, y = cy - vy * k;
        xx += vx * vx; yy += vy * vy; xy += vx * vy;
        if (i > bufX.length - n) p.lineTo(x, y); else p.moveTo(x, y);
      }
      const lx = bufX[bufX.length - 1] || 0, ly = bufY[bufY.length - 1] || 0;
      signal = { rmsX: Math.sqrt(xx / n), rmsY: Math.sqrt(yy / n), corr: xy / Math.sqrt(Math.max(1e-12, xx * yy)), headX: lx / params.peak, headY: ly / params.peak };
      return p;
    }
    /* the persistence: every copy but the newest, oldest first, then the newest at full heat */
    function layers(newest) {
      const n = Math.max(1, Math.min(5, Math.round(params.copies)));
      const m = Math.min(hist.length, n - 1), ks = [];
      let k = 1;
      for (let i = 0; i < m; i++) { k *= params.decay; ks.push(k); }
      for (let i = m - 1; i >= 0; i--) beam(hist[hist.length - 1 - i].path, ks[i], false);
      beam(newest, 1, true);
    }
    function remember(path, dt) {
      histT += dt;
      if (histT < params.copyEvery && hist.length) return;
      histT = 0; hist.push({ path });
      while (hist.length > 4) hist.shift();
    }
    function headDetail() {
      const m = geom(), T = ctx.tokens;
      const hx = m.cx + m.R * Math.max(-1.08, Math.min(1.08, signal.headX));
      const hy = m.cy - m.R * Math.max(-1.08, Math.min(1.08, signal.headY));
      g.save(); g.clip(glassPath()); g.globalCompositeOperation = 'lighter';
      g.strokeStyle = T.phosphor; g.lineWidth = px; g.globalAlpha = 0.055 + holdEnergy * 0.08;
      g.setLineDash([2 * px, 8 * px]); g.beginPath();
      g.moveTo(hx, m.cy - m.ih); g.lineTo(hx, m.cy + m.ih);
      g.moveTo(m.cx - m.iw, hy); g.lineTo(m.cx + m.iw, hy); g.stroke(); g.setLineDash([]);
      g.fillStyle = lockK > 0.5 && T.amber ? T.amber : T.phosphorCore;
      g.globalAlpha = 0.12; g.beginPath(); g.arc(hx, hy, (7 + holdEnergy * 5) * px, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1; g.beginPath(); g.arc(hx, hy, 1.8 * px, 0, Math.PI * 2); g.fill();
      g.restore(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    function instrumentFront(live, calmK) {
      const m = geom(), T = ctx.tokens, simple = nearest(ratio), p = simple[0], q = simple[1], TAU = Math.PI * 2;
      const lockedK = lockK, topY = m.cy - m.ih - 5 * px, rightX = m.cx + m.iw + 5 * px;
      /* Numerator ticks across the crown, denominator ticks down the right rail. */
      const ticks = new Path2D();
      for (let i = 0; i < p; i++) {
        const x = m.cx - m.iw * 0.66 + (i + 0.5) / p * m.iw * 1.32;
        ticks.moveTo(x, topY - 4 * px); ticks.lineTo(x, topY + 4 * px);
      }
      for (let i = 0; i < q; i++) {
        const y = m.cy - m.ih * 0.62 + (i + 0.5) / q * m.ih * 1.24;
        ticks.moveTo(rightX - 4 * px, y); ticks.lineTo(rightX + 4 * px, y);
      }
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = T.phosphor; g.globalAlpha = params.phaseAlpha * calmK * (0.42 + 0.38 * holdEnergy);
      g.lineWidth = 5 * px; g.stroke(ticks);
      g.strokeStyle = T.amber || T.phosphorCore; g.globalAlpha = params.phaseAlpha * lockedK * calmK; g.lineWidth = 1.25 * px; g.stroke(ticks);

      /* Two phase rotors use the same arguments as X and Y in the Lissajous equation. */
      const rr = Math.max(5 * px, m.R * 0.068), ry = m.cy + m.hh * 0.735;
      const rotors = [
        { x: m.cx - m.hw * 0.72, a: TAU * ratio * displayS + phase, col: T.amber || T.phosphorCore },
        { x: m.cx + m.hw * 0.72, a: TAU * displayS, col: T.phosphorCore },
      ];
      for (const r of rotors) {
        g.strokeStyle = T.phosphorDim || T.phosphor; g.globalAlpha = params.phaseAlpha * 0.45 * calmK; g.lineWidth = px;
        g.beginPath(); g.arc(r.x, ry, rr, 0, TAU); g.stroke();
        const ex = r.x + Math.sin(r.a) * rr * 0.78, ey = ry - Math.cos(r.a) * rr * 0.78;
        g.strokeStyle = r.col; g.globalAlpha = params.phaseAlpha * calmK * (0.75 + holdEnergy * 0.25); g.lineWidth = 1.4 * px;
        g.beginPath(); g.moveTo(r.x, ry); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = r.col; g.globalAlpha = 0.9 * calmK; g.beginPath(); g.arc(ex, ey, 1.7 * px, 0, TAU); g.fill();
      }

      /* These are measured post-envelope levels, so they rise and fall with the audible hold. */
      const trackY = m.cy + m.hh * 0.91, track = m.hw * 0.25;
      const lx = live ? Math.min(1, signal.rmsX / Math.max(0.0001, params.peak * 0.72)) : 0;
      const ly = live ? Math.min(1, signal.rmsY / Math.max(0.0001, params.peak * 0.72)) : 0;
      g.lineCap = 'round'; g.lineWidth = 2.2 * px; g.strokeStyle = T.phosphorDim || T.phosphor; g.globalAlpha = 0.32;
      g.beginPath(); g.moveTo(m.cx - track, trackY); g.lineTo(m.cx - 6 * px, trackY); g.moveTo(m.cx + 6 * px, trackY); g.lineTo(m.cx + track, trackY); g.stroke();
      g.strokeStyle = T.amber || T.phosphorCore; g.globalAlpha = 0.84 * calmK; g.beginPath(); g.moveTo(m.cx - 6 * px, trackY); g.lineTo(m.cx - 6 * px - (track - 6 * px) * lx, trackY); g.stroke();
      g.strokeStyle = T.phosphorCore; g.beginPath(); g.moveTo(m.cx + 6 * px, trackY); g.lineTo(m.cx + 6 * px + (track - 6 * px) * ly, trackY); g.stroke();

      /* The coupling braces close smoothly while held. They never flash and Calm keeps them quieter. */
      const inset = holdEnergy * m.R * 0.045, x0 = m.cx - m.iw + inset, x1 = m.cx + m.iw - inset;
      const y0 = m.cy - m.ih + inset, y1 = m.cy + m.ih - inset, L = m.R * (0.1 + holdEnergy * 0.035);
      const braces = new Path2D();
      braces.moveTo(x0 + L, y0); braces.lineTo(x0, y0); braces.lineTo(x0, y0 + L);
      braces.moveTo(x1 - L, y0); braces.lineTo(x1, y0); braces.lineTo(x1, y0 + L);
      braces.moveTo(x1, y1 - L); braces.lineTo(x1, y1); braces.lineTo(x1 - L, y1);
      braces.moveTo(x0 + L, y1); braces.lineTo(x0, y1); braces.lineTo(x0, y1 - L);
      g.strokeStyle = holdEnergy > 0.12 && T.amber ? T.amber : T.phosphor;
      g.globalAlpha = params.bezelAlpha * (0.8 + holdEnergy * 1.4) * calmK; g.lineWidth = (1.2 + holdEnergy * 1.1) * px; g.stroke(braces);

      /* A single glass reflection clarifies the front plane without competing with the trace. */
      const sheen = g.createLinearGradient(m.cx - m.iw, m.cy - m.ih, m.cx + m.iw, m.cy + m.ih);
      sheen.addColorStop(0, ctx.rgba(T.phosphorCore, 0.045)); sheen.addColorStop(0.28, ctx.rgba(T.phosphorCore, 0));
      sheen.addColorStop(0.7, ctx.rgba(T.phosphorCore, 0)); sheen.addColorStop(1, ctx.rgba(T.phosphorCore, 0.025));
      g.globalCompositeOperation = 'source-over'; g.fillStyle = sheen; g.globalAlpha = 1; g.fill(glassPath());
      g.strokeStyle = T.phosphor; g.globalAlpha = params.bezelAlpha * (0.85 + holdEnergy * 0.3); g.lineWidth = 1.1 * px; g.stroke(glassPath());
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    function say(held) {
      const r = ratio, fx = params.base * r;
      let tail = 'hold to hear it';
      if (held && voice && ac && ac.state === 'running') tail = 'sounding, trace is the live signal';
      else if (held && !ac && AC && ctx.pointer && ctx.pointer.coarse) tail = 'lift and hold again to hear it';
      else if (held && (!AC || blocked || (ac && ac.state !== 'running'))) tail = 'audio blocked, trace is computed';
      const text = `ratio ${label(r)} · X ${fx.toFixed(1)} Hz · Y ${params.base} Hz · ${tail}`;
      const now = performance.now();   /* re-send twice a second: the HUD throttle drops, it does not defer */
      if (text !== lastText || now - sentAt > 500) { lastText = text; sentAt = now; ctx.readout('scope', text); }
    }

    return {
      tick(dt, t, progress, pointer) {
        lastTick = performance.now();
        const calm = ctx.dial === 'calm' ? 0.5 : 1, calmVisual = ctx.dial === 'calm' ? 0.62 : 1;
        const held = !!(pointer && pointer.down);
        const target = ratioFrom(pointer && pointer.present ? pointer.nx : 0.5);
        ratio += (target - ratio) * (1 - Math.exp(-dt / 0.12));
        lockK += ((locked(ratio) ? 1 : 0) - lockK) * (1 - Math.exp(-dt / 0.25));   /* a crossfade, never a flash */
        const holdTarget = held ? calmVisual : 0;
        holdEnergy += (holdTarget - holdEnergy) * (1 - Math.exp(-dt / (held ? 0.085 : 0.22)));
        /* audio follows the hold, and only a hold that has lasted a moment */
        heldFor = held ? heldFor + dt : 0;
        if (held) heldAt = lastTick;
        const minHold = pointer && pointer.coarse ? Math.max(0.18, params.minHold) : params.minHold;
        if (held && heldFor >= minHold && !voice && ac && ac.state !== 'closed') startVoice();
        if (!held && voice) releaseVoice();
        if (voice && !voice.releasedAt) voice.ox.frequency.setTargetAtTime(params.base * ratio, ac.currentTime, 0.04);
        if (voice && voice.releasedAt && performance.now() > voice.until) voice = null;
        watchdog();
        /* idle phase: a slow drift, plus the residual detune off the nearest simple ratio */
        const s = nearest(ratio);
        phase += (params.drift * calm + (ratio - s[0] / s[1]) * 2.2) * dt;
        visualK = calmVisual;
        clear();
        const live = voice && ac && ac.state === 'running';
        instrumentBack(holdEnergy);
        graticule(params.gridAlpha * visualK * (1 + holdEnergy * 0.35));
        let path, headSweep = null;
        if (live) {
          displayS = (ac.currentTime * params.base) % CYCLES;
          path = samples();
        } else {
          const s0 = sweepS, s1 = sweepS + params.sweep * calm * CYCLES * dt;
          sweepS = s1 % CYCLES;
          displayS = sweepS;
          signal = {
            rmsX: 0, rmsY: 0, corr: 0,
            headX: Math.sin(Math.PI * 2 * ratio * displayS + phase),
            headY: Math.sin(Math.PI * 2 * displayS),
          };
          path = curve(ratio, phase, 0, CYCLES, 360);   /* the capped backing size keeps 360 points smooth */
          headSweep = curve(ratio, phase, s0 - 0.05, s1, 40);
        }
        g.save(); g.clip(glassPath());
        layers(path);
        remember(path, dt);
        if (headSweep) beam(headSweep, 1.6, true);
        g.restore();
        headDetail();
        instrumentFront(!!live, calmVisual);
        say(held);
      },
      resize(nw, nh, ndpr) {
        /* cap the backing store: five wide glow passes are raster-bound (measured 31 fps at 1440x900 on a real GPU) */
        const k = Math.min(1, params.maxBackingWidth / Math.max(1, nw));
        if (k < 1) { canvas.width = Math.round(nw * k); canvas.height = Math.round(nh * k); }
        w = canvas.width; h = canvas.height; px = Math.max(0.5, ndpr * k); hist.length = 0;
      },
      still() {
        /* the designed frame: a 3:2 figure at full heat with its four older copies trailing */
        ratio = 1.5; phase = 0.35; lockK = 1; holdEnergy = 0; visualK = 1; displayS = 0.18; hist.length = 0;
        signal = {
          rmsX: 0, rmsY: 0, corr: 0,
          headX: Math.sin(Math.PI * 2 * ratio * displayS + phase),
          headY: Math.sin(Math.PI * 2 * displayS),
        };
        clear();
        instrumentBack(0);
        graticule(params.gridAlpha * 1.6);
        for (let i = 4; i >= 1; i--) hist.push({ path: curve(1.5, 0.35 - i * 0.07, 0, 2, 480) });
        g.save(); g.clip(glassPath()); layers(curve(1.5, 0.35, 0, 2, 480)); g.restore();
        headDetail(); instrumentFront(false, 1);
        hist.length = 0;
        const text = `ratio 3:2 · X ${(params.base * 1.5).toFixed(1)} Hz · Y ${params.base} Hz · still frame`;
        lastText = text; ctx.readout('scope', text);
      },
      destroy() {
        dead = true;
        clearTimeout(dog);
        for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) removeEventListener(type, onGesture, { capture: true });
        if (voice) { try { voice.ox.stop(); voice.oy.stop(); } catch (_) {} voice = null; }
        if (ac) { try { ac.close(); } catch (_) {} ac = null; }
        chain = null; bufX = bufY = null; hist.length = 0;
        g.clearRect(0, 0, w, h);
      },
      params(p) { params = p; if (chain) { try { chain.ax.fftSize = chain.ay.fftSize = p.fftSize; } catch (_) { return; } bufX = new Float32Array(p.fftSize); bufY = new Float32Array(p.fftSize); } },
    };
  }
  BAYS.push({ slug: 'scope', title: 'Scope', order: 7, role: 'bay', params: PARAMS, mount });
})();
