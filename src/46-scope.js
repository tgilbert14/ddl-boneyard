/* BONEYARD PART · 07 · SCOPE
 * technique   an oscilloscope in XY mode: X against Y traces a Lissajous figure on a phosphor that is faded, never
 *             cleared; press-and-hold starts two WebAudio oscillators (left = X, right = Y) and the trace switches to
 *             the actual samples read back from two AnalyserNodes
 * lineage     Lissajous figures (Jules Antoine Lissajous, 1857); the oscilloscope's XY mode; oscilloscope music
 *             (the 2010s practice of composing stereo sound whose two channels draw pictures on an XY scope)
 * original    what you hear is exactly what you see: the held trace is the post-envelope signal on its way to your
 *             speakers, so the attack grows the figure and the release shrinks it to a dot; pointer X detunes the
 *             ratio and snaps gently toward 4:3, 3:2, 5:3 and 2:1; the site's only voice is one you are holding down
 * not         a synthesizer, a music player, an autoplay tone. No AudioContext exists until a hold; nothing sounds
 *             without one; peak gain 0.08. If audio is blocked the trace stays computed and says so.
 * deps        none · Canvas 2D + Web Audio · 2026-09
 * budget      0.16 ms/frame idle, 0.24 held (one-period sample trace) @ 1440x900 x1 internal; 0.14 / 0.17 @ 390x844; headless desktop
 *             Chromium (2026-09-29), harness counter; phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Idle, the beam is computed: x = sin(2 pi r s + phase), y = sin(2 pi s), where r is the frequency ratio X:Y. Pointer X
 * maps to r = 1.5 * 2^((x - 0.5) * span), so the middle of the screen (or no pointer at all) is exactly 3:2; within snapWidth of a simple ratio the value is pulled most of the way onto it,
 * never all the way, so the figure still turns slowly. Each frame the canvas is washed with the field colour at a
 * low alpha instead of cleared, the whole figure is laid down faintly, and a bright beam sweeps along it: the wash is
 * the phosphor's persistence.
 *
 * Holding the pointer (or Space) creates or resumes an AudioContext inside that gesture, then starts two
 * OscillatorNodes at base * r and base Hz into a ChannelMerger (X left, Y right), through one GainNode envelope
 * (soft attack to about 0.08, soft release to zero), to the speakers. A ChannelSplitter after the envelope feeds two
 * AnalyserNodes; while the voice lives, the trace is their time-domain samples plotted X against Y. Release ramps
 * the gain down and stops the oscillators. A watchdog stops the voice if the ride stops ticking the room (switched
 * off, hidden tab) while a hold is still down. destroy() closes the context.
 */
(() => {
  'use strict';
  const PARAMS = {
    base: 110,            /* Hz, the Y oscillator */
    span: 0.83,           /* pointer X across the screen = this many octaves of ratio, centred on 3:2 */
    snapWidth: 0.055,     /* ratio distance inside which the pull starts */
    snapPull: 0.88,       /* how far onto the simple ratio (1 would lock it) */
    drift: 0.16,          /* idle phase drift, radians per second (Calm halves) */
    sweep: 0.9,           /* idle beam: full figures per second (Calm halves) */
    fade: 0.085,          /* field wash per frame: lower = longer persistence, but an 8-bit wash stalls about 0.5 / fade levels above the field */
    radius: 0.3,          /* of the smaller canvas side */
    haloWidth: 3.2, coreWidth: 1.1,
    haloAlpha: 0.14, coreAlpha: 0.7,
    ghostAlpha: 0.05,     /* the whole figure, laid down every frame */
    gridAlpha: 0.03,
    peak: 0.08, attack: 0.07, release: 0.28,
    fftSize: 2048,
  };
  const SIMPLE = [[4, 3], [3, 2], [5, 3], [2, 1]];
  const CYCLES = 6;       /* y cycles drawn: closes every ratio in SIMPLE */

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1;
    let phase = 0.35, sweepS = 0, ratio = 1.5, lastTick = -1e9, lastText = '', sentAt = 0;
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
    function label(r) {
      const s = nearest(r);
      return Math.abs(r - s[0] / s[1]) < 0.0045 ? `${s[0]}:${s[1]}` : r.toFixed(3);
    }

    /* ---------- audio: created only inside the hold gesture ---------- */
    function unlock() {
      if (!AC || dead) return;
      try { if (!ac) ac = new AC({ latencyHint: 'interactive' }); } catch (_) { blocked = true; return; }
      if (ac.state === 'suspended') ac.resume().then(() => { blocked = false; }, () => { blocked = true; });
    }
    function onGesture(e) {
      if (performance.now() - lastTick > 250 || ctx.dial === 'still') return;   /* only while this room is live */
      const tg = e.target && e.target.closest ? e.target : null;
      if (e.type === 'keydown') {
        if (e.key !== ' ' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
        if (tg && tg.closest('input, select, textarea, button, a')) return;
      } else {
        if (e.button !== 0) return;
        if (tg && tg.closest(inParts ? 'main, a, button, input' : '#hud, #dev, a, button, input')) return;
      }
      unlock();
    }
    addEventListener('pointerdown', onGesture, { capture: true, passive: true });
    addEventListener('keydown', onGesture, { capture: true, passive: true });

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
    const geom = () => ({ cx: w / 2, cy: h * 0.46, R: Math.min(w, h) * params.radius });
    function wash(a) {
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = a; g.fillStyle = ctx.tokens.field; g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
    function graticule(a) {
      const { cx, cy, R } = geom(), T = ctx.tokens, p = new Path2D(), step = R / 4, span = R * 1.25;
      for (let i = -5; i <= 5; i++) { const o = i * step; p.moveTo(cx + o, cy - span); p.lineTo(cx + o, cy + span); }
      for (let i = -5; i <= 5; i++) { const o = i * step; if (Math.abs(o) > span) continue; p.moveTo(cx - R * 1.25, cy + o); p.lineTo(cx + R * 1.25, cy + o); }
      g.globalAlpha = a; g.strokeStyle = T.phosphorDim || T.phosphor; g.lineWidth = Math.max(1, px * 0.8); g.stroke(p);
      g.globalAlpha = 1;
    }
    function beam(path, halo, core) {
      const T = ctx.tokens;
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = T.phosphor; g.globalAlpha = halo; g.lineWidth = params.haloWidth * px; g.stroke(path);
      g.strokeStyle = T.phosphorCore; g.globalAlpha = core; g.lineWidth = params.coreWidth * px; g.stroke(path);
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
      let amp = 0;
      for (let i = bufX.length - n; i < bufX.length; i++) {
        const x = cx + bufX[i] * k, y = cy - bufY[i] * k;
        if (i > bufX.length - n) p.lineTo(x, y); else p.moveTo(x, y);
        amp = Math.max(amp, Math.abs(bufX[i]), Math.abs(bufY[i]));
      }
      return { p, amp };
    }
    function say(held) {
      const r = ratio, fx = params.base * r;
      let tail = 'hold to hear it';
      if (held && voice && ac && ac.state === 'running') tail = 'sounding, trace is the live signal';
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
        /* audio follows the hold, and only the hold */
        if (held && !voice && ac && ac.state !== 'closed') startVoice();
        if (!held && voice) releaseVoice();
        if (voice && !voice.releasedAt) {
          const now = ac.currentTime;
          voice.ox.frequency.setTargetAtTime(params.base * ratio, now, 0.04);
        }
        if (voice && voice.releasedAt && performance.now() > voice.until) voice = null;
        watchdog();
        /* idle phase: a slow drift, plus the residual detune off the nearest simple ratio */
        const s = nearest(ratio);
        phase += (params.drift * calm + (ratio - s[0] / s[1]) * 2.2) * dt;
        wash(params.fade);
        graticule(params.gridAlpha);
        const live = voice && ac && ac.state === 'running';
        if (live) {
          const { p } = samples();
          beam(p, params.haloAlpha * 1.2, params.coreAlpha);
        } else {
          beam(curve(ratio, phase, 0, CYCLES, 900), params.ghostAlpha * 0.4, params.ghostAlpha);
          const s0 = sweepS, s1 = sweepS + params.sweep * calm * CYCLES * dt;
          sweepS = s1 % CYCLES;
          beam(curve(ratio, phase, s0, s1, 48), params.haloAlpha, params.coreAlpha);
        }
        say(held);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); },
      still() {
        /* the designed frame: a 3:2 figure at full persistence, older passes fainter */
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, w, h); g.fillStyle = ctx.tokens.field; g.fillRect(0, 0, w, h);
        graticule(0.16);
        const N = 14;
        for (let i = N; i >= 1; i--) { const a = Math.pow(1 - i / (N + 1), 2); beam(curve(1.5, 0.35 - i * 0.012, 0, 2, 480), params.haloAlpha * a * 0.6, params.coreAlpha * a * 0.35); }
        beam(curve(1.5, 0.35, 0, 2, 480), params.haloAlpha * 1.3, params.coreAlpha);
        ratio = 1.5; phase = 0.35;
        const text = `ratio 3:2 · X ${(params.base * 1.5).toFixed(1)} Hz · Y ${params.base} Hz · still frame`;
        lastText = text; ctx.readout('scope', text);
      },
      destroy() {
        dead = true;
        clearTimeout(dog);
        removeEventListener('pointerdown', onGesture, { capture: true });
        removeEventListener('keydown', onGesture, { capture: true });
        if (voice) { try { voice.ox.stop(); voice.oy.stop(); } catch (_) {} voice = null; }
        if (ac) { try { ac.close(); } catch (_) {} ac = null; }
        chain = null; bufX = bufY = null;
        g.clearRect(0, 0, w, h);
      },
      params(p) { params = p; if (chain) { try { chain.ax.fftSize = chain.ay.fftSize = p.fftSize; } catch (_) { return; } bufX = new Float32Array(p.fftSize); bufY = new Float32Array(p.fftSize); } },
    };
  }
  BAYS.push({ slug: 'scope', title: 'Scope', order: 7, role: 'bay', params: PARAMS, mount });
})();
