/* BONEYARD PART · 07 · SCOPE
 * technique   an oscilloscope in XY mode: X against Y traces a Lissajous figure; the phosphor's persistence is drawn
 *             as five explicit copies of the recent trace at falling brightness, each a wide phosphor halo under a
 *             white-hot core; press-and-hold starts two WebAudio oscillators (left = X, right = Y) and the trace
 *             switches to the actual samples read back from two AnalyserNodes
 * lineage     Lissajous figures (Jules Antoine Lissajous, 1857); the oscilloscope's XY mode; oscilloscope music
 *             (the 2010s practice of composing stereo sound whose two channels draw pictures on an XY scope)
 * original    what you hear is exactly what you see: the held trace is the post-envelope signal on its way to your
 *             speakers, so the attack grows the figure and the release shrinks it to a dot; pointer X detunes the
 *             ratio and snaps gently toward 4:3, 3:2, 5:3 and 2:1, and the halo warms to amber while the ratio sits
 *             on one; the site's only voice is one you are holding down
 * not         a synthesizer, a music player, an autoplay tone. No AudioContext exists until a hold; nothing sounds
 *             without one; peak gain 0.08. If audio is blocked the trace stays computed and says so.
 * deps        none · Canvas 2D + Web Audio · 2026-09
 * budget      0.21 to 0.27 ms/frame idle @ 1440x900 x1 internal, headless desktop Chromium, harness counter (2026-09-30);
 *             390x844 at 4x CPU: 1.1 ms JS, part page 60 fps; JS time only, the additive strokes raster on the GPU
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
 * wide halo, a mid glow and a thin white-hot core, and a bright beam head sweeps along it.
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
    radius: 0.39,         /* of the smaller canvas side */
    copies: 5,            /* persistent copies of the trace, newest included (3 to 5) */
    copyEvery: 0.05,      /* seconds between history samples */
    decay: 0.58,          /* alpha of each older copy relative to the next newer one */
    haloWidth: 16, glowWidth: 5, coreWidth: 1.8,
    haloAlpha: 0.13, glowAlpha: 0.42, coreAlpha: 1,
    gridAlpha: 0.07,
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
    let lockK = 0, histT = 0, heldFor = 0, heldAt = -1e9;
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
    const geom = () => ({ cx: w / 2, cy: h * (w > h ? 0.5 : 0.45), R: Math.min(w, h) * params.radius });
    function clear() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.fillStyle = ctx.tokens.field; g.fillRect(0, 0, w, h);
    }
    function graticule(a) {
      const { cx, cy, R } = geom(), T = ctx.tokens, p = new Path2D(), step = R / 4, span = R * 1.12;
      for (let i = -4; i <= 4; i++) { const o = i * step; p.moveTo(cx + o, cy - span); p.lineTo(cx + o, cy + span); p.moveTo(cx - span, cy + o); p.lineTo(cx + span, cy + o); }
      g.globalAlpha = a; g.strokeStyle = T.phosphorDim || T.phosphor; g.lineWidth = Math.max(1, px * 0.8); g.stroke(p);
      g.globalAlpha = 1;
    }
    /* one pass of light: k scales every layer; full adds the white-hot core */
    function beam(path, k, full) {
      const T = ctx.tokens;
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = T.phosphor; g.globalAlpha = params.haloAlpha * k * (1 - 0.6 * lockK); g.lineWidth = params.haloWidth * px; g.stroke(path);
      if (lockK > 0.01 && T.amber) { g.strokeStyle = T.amber; g.globalAlpha = params.haloAlpha * k * lockK; g.stroke(path); }
      g.strokeStyle = T.phosphor; g.globalAlpha = Math.min(1, params.glowAlpha * k); g.lineWidth = params.glowWidth * px; g.stroke(path);
      if (full) { g.strokeStyle = T.phosphorCore; g.globalAlpha = params.coreAlpha * Math.min(1, k); g.lineWidth = params.coreWidth * px; g.stroke(path); }
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
      for (let i = bufX.length - n; i < bufX.length; i++) {
        const x = cx + bufX[i] * k, y = cy - bufY[i] * k;
        if (i > bufX.length - n) p.lineTo(x, y); else p.moveTo(x, y);
      }
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
        const calm = ctx.dial === 'calm' ? 0.5 : 1;
        const held = !!(pointer && pointer.down);
        const target = ratioFrom(pointer && pointer.present ? pointer.nx : 0.5);
        ratio += (target - ratio) * (1 - Math.exp(-dt / 0.12));
        lockK += ((locked(ratio) ? 1 : 0) - lockK) * (1 - Math.exp(-dt / 0.25));   /* a crossfade, never a flash */
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
        clear();
        graticule(params.gridAlpha);
        const live = voice && ac && ac.state === 'running';
        const path = live ? samples() : curve(ratio, phase, 0, CYCLES, 360);   /* 720 points cost frames; 360 is smooth at the capped backing size */
        layers(path);
        remember(path, dt);
        if (!live) {
          const s0 = sweepS, s1 = sweepS + params.sweep * calm * CYCLES * dt;
          sweepS = s1 % CYCLES;
          beam(curve(ratio, phase, s0 - 0.05, s1, 40), 1.6, true);
        }
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
        ratio = 1.5; phase = 0.35; lockK = 1; hist.length = 0;
        clear();
        graticule(params.gridAlpha * 1.6);
        for (let i = 4; i >= 1; i--) hist.push({ path: curve(1.5, 0.35 - i * 0.07, 0, 2, 480) });
        layers(curve(1.5, 0.35, 0, 2, 480));
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
