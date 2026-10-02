/* BONEYARD SOUND · the gesture-led engine room (PUNCH item 7)
 * what        one SOUND button in the header. Sound is enabled by default, but stays silent until a visitor scrolls,
 *             uses ride navigation, fires Gate or starts Auto-fly. An explicit on or off choice is remembered. When sounding: a low synth engine bed whose pitch and filter
 *             follow scroll speed, a CRT relay clunk plus a high-voltage whine tick on every tube switch, a rising
 *             filtered-noise whoosh with a pitch sweep when a hyperspace warp crosses 0.6 or Gate begins a Full traversal.
 *             Gate's charge also raises the existing engine bed. SCOPE keeps its own tone.
 * law         no playback before real ride intent. Pointer, touch and keyboard gestures may unlock a silent context;
 *             a scroll, navigation action, Fire gate or active Auto-fly request starts the bed. A wheel alone cannot unlock audio
 *             in every browser, so a blocked request is shown as pending and the SOUND button completes it. An explicit
 *             stored off always wins. Sound is independent of the motion dial. Hidden tabs suspend the context.
 *             The bed ducks to near zero while SCOPE is current and held.
 * wiring      no BAYS registration and no core edit: a self-starting IIFE that reads window.BONEYARD_RIDE
 *             (camera.v, share.warp, share.gateEnergy, pointer.down, current) on its own rAF while running, and listens for
 *             the window CustomEvents boneyard:switch {dir, slug}, boneyard:warp {level} and boneyard:gate {phase:'transit'}. Until those events exist,
 *             a change of the current bay is the fallback switch trigger and share.warp the fallback warp.
 * mix         voices -> master gain 0.25 -> DynamicsCompressor (brick-wall limiter, -3 dB) -> destination.
 *             Measured offline (OfflineAudioContext, 10 s script, 2026-09-29): idle bed -27 LUFS, full-speed bed -16.5
 *             LUFS, switch clunk peak -8.4 dBFS, first-gesture clunk -20 dBFS, whoosh peak -5.5 dBFS, whole script -21 LUFS.
 *             Gate graph check (2026-10-01, 6 s mono 48 kHz offline charge + 0.48 s / 0.85 whoosh): -23.0 LUFS,
 *             -9.8 dBFS true peak. Script-specific measurements, not acoustic or hardware-phone levels.
 * deps        none · Web Audio · 2026-09
 * license     MIT, Desert Data Labs LLC
 */
(() => {
  'use strict';
  const ACtx = window.AudioContext || window.webkitAudioContext;
  const KEY = 'boneyard_sound';
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (_) {} },
  };

  /* ---------- the mix: every number in one place ---------- */
  const MIX = {
    master: 0.25,
    limitDb: -3,
    bedIdle: 0.62, bedTop: 0.85,       /* bed gain across speed 0..1 */
    duck: 0.04,                        /* bed gain multiplier while SCOPE sings */
    root: 55,                          /* Hz, A1: idle engine pitch */
    octaves: 1.0,                      /* pitch rise at full speed */
    cutIdle: 170, cutTop: 2600,        /* lowpass Hz across speed */
    saw: 0.9, sub: 1.1,
    clunk: 1.0, whine: 0.10,
    whoosh: 1.0,
    speedRef: 12,                      /* camera units/s: s = 1 - exp(-|v| / speedRef) */
    clunkGap: 0.09, whooshGap: 1.5,    /* seconds between repeats */
  };

  /* ---------- the graph: pure Web Audio, works on a live or an Offline context ---------- */
  function graph(ac, dest) {
    const out = dest || ac.destination;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = MIX.limitDb; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.2;
    const master = ac.createGain(); master.gain.value = 0;
    master.connect(limiter); limiter.connect(out);

    /* white-noise buffer, shared by every noise voice (2 s, mono) */
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    { const d = nb.getChannelData(0); let seed = 1234567; for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; d[i] = seed / 2147483648 - 1; } }
    const noise = (when, dur) => { const s = ac.createBufferSource(); s.buffer = nb; s.start(when, Math.random() * 0.5, dur + 0.05); return s; };

    /* bed: two detuned saws -> resonant lowpass (slow breath LFO) + a sub sine, all tracking speed */
    const rise = ac.createGain(); rise.gain.value = 0; rise.connect(master);   /* the bed's fade-in, apart from the fx */
    const duck = ac.createGain(); duck.gain.value = 1; duck.connect(rise);
    const bed = ac.createGain(); bed.gain.value = MIX.bedIdle; bed.connect(duck);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5; lp.frequency.value = MIX.cutIdle;
    const sawG = ac.createGain(); sawG.gain.value = MIX.saw * 0.5;
    lp.connect(sawG); sawG.connect(bed);
    const saws = [-9, 9].map((cents) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = MIX.root; o.detune.value = cents; o.connect(lp); return o; });
    const sub = ac.createOscillator(); sub.type = 'sine'; sub.frequency.value = MIX.root;
    const subG = ac.createGain(); subG.gain.value = MIX.sub * 0.5; sub.connect(subG); subG.connect(bed);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.11;
    const lfoG = ac.createGain(); lfoG.gain.value = 45; lfo.connect(lfoG); lfoG.connect(lp.frequency);
    const t0 = ac.currentTime;
    for (const o of [...saws, sub, lfo]) o.start(t0);

    const fx = ac.createGain(); fx.gain.value = 1; fx.connect(master);

    function speed(s, when) {
      const w = when == null ? ac.currentTime : when;
      s = Math.max(0, Math.min(1, s));
      const f = MIX.root * Math.pow(2, s * MIX.octaves);
      for (const o of saws) o.frequency.setTargetAtTime(f, w, 0.09);
      sub.frequency.setTargetAtTime(f, w, 0.09);
      lp.frequency.setTargetAtTime(MIX.cutIdle + (MIX.cutTop - MIX.cutIdle) * Math.pow(s, 1.6), w, 0.08);
      bed.gain.setTargetAtTime(MIX.bedIdle + (MIX.bedTop - MIX.bedIdle) * s, w, 0.12);
      return f;
    }
    function ducked(on, when) { duck.gain.setTargetAtTime(on ? MIX.duck : 1, when == null ? ac.currentTime : when, on ? 0.04 : 0.25); }
    /* master: up fast, down in a straight 150 ms line (off must feel instant) */
    function level(on, when) {
      const w = when == null ? ac.currentTime : when, p = master.gain;
      p.cancelScheduledValues(w); p.setValueAtTime(p.value, w);
      p.linearRampToValueAtTime(on ? MIX.master : 0, w + (on ? 0.03 : 0.15));
    }
    /* the bed rising from nothing over dur seconds */
    function bedIn(dur, when) {
      const w = when == null ? ac.currentTime : when, p = rise.gain;
      p.cancelScheduledValues(w); p.setValueAtTime(0, w); p.linearRampToValueAtTime(1, w + dur);
    }

    /* power-up: the tube spins up, pitch and filter swing from the floor to idle (only on a press) */
    function ignite(when, soft) {
      const w = when == null ? ac.currentTime : when;
      for (const o of [...saws, sub]) { o.frequency.cancelScheduledValues(w); o.frequency.setValueAtTime(MIX.root * 0.35, w); o.frequency.exponentialRampToValueAtTime(MIX.root, w + 0.7); }
      lp.frequency.cancelScheduledValues(w); lp.frequency.setValueAtTime(60, w); lp.frequency.setTargetAtTime(MIX.cutIdle * 2.2, w, 0.12); lp.frequency.setTargetAtTime(MIX.cutIdle, w + 0.45, 0.25);
      bedIn(soft ? 1.5 : 0.6, w);
      clunk(1, w + 0.04, soft ? 0.55 : 1);   /* after the 30 ms master ramp, or the ramp eats the transient */
    }

    /* the clunk: relay contact + bounce, a chassis thump, a panel ring, and the 15.7 kHz flyback whine tick */
    function clunk(dir, when, amt, quiet) {
      const w = when == null ? ac.currentTime : when, g = MIX.clunk * (amt == null ? 1 : amt);
      /* contacts: two short bright noise clicks, the second a bounce */
      for (const [dt, amp] of [[0, 0.9], [0.011, 0.35]]) {
        const n = noise(w + dt, 0.012), hp = ac.createBiquadFilter(), e = ac.createGain();
        hp.type = 'highpass'; hp.frequency.value = 1400;
        e.gain.setValueAtTime(0, w + dt); e.gain.linearRampToValueAtTime(amp * g, w + dt + 0.0008); e.gain.exponentialRampToValueAtTime(0.001, w + dt + 0.012);
        n.connect(hp); hp.connect(e); e.connect(fx);
      }
      /* thump: a sine that falls, the armature hitting the frame */
      const th = ac.createOscillator(), te = ac.createGain();
      th.frequency.setValueAtTime(dir < 0 ? 96 : 124, w); th.frequency.exponentialRampToValueAtTime(42, w + 0.09);
      te.gain.setValueAtTime(0, w); te.gain.linearRampToValueAtTime(0.95 * g, w + 0.003); te.gain.exponentialRampToValueAtTime(0.001, w + 0.16);
      th.connect(te); te.connect(fx); th.start(w); th.stop(w + 0.18);
      /* panel ring: resonant noise, the steel box answering */
      const rn = noise(w, 0.1), bp = ac.createBiquadFilter(), re = ac.createGain();
      bp.type = 'bandpass'; bp.frequency.value = dir < 0 ? 290 : 340; bp.Q.value = 9;
      re.gain.setValueAtTime(0, w); re.gain.linearRampToValueAtTime(1.6 * g, w + 0.002); re.gain.exponentialRampToValueAtTime(0.001, w + 0.09);
      rn.connect(bp); bp.connect(re); re.connect(fx);
      /* whine tick: the horizontal-output transformer, 15734 Hz and its half, 120 ms */
      if (!quiet) for (const [f, a] of [[15734, 1], [7867, 0.6]]) {
        const o = ac.createOscillator(), e = ac.createGain();
        o.frequency.value = f;
        e.gain.setValueAtTime(0, w + 0.006); e.gain.linearRampToValueAtTime(MIX.whine * a, w + 0.012); e.gain.exponentialRampToValueAtTime(0.0005, w + 0.13);
        o.connect(e); e.connect(fx); o.start(w + 0.006); o.stop(w + 0.14);
      }
    }

    /* the whoosh: bandpassed noise rising 250 Hz to 5 kHz, a filtered saw sweeping up, a sub boom at the top */
    function whoosh(amt, when, riseSeconds) {
      const rise = Number.isFinite(riseSeconds) ? Math.max(0.35, Math.min(1.1, riseSeconds)) : 1.1;
      const w = when == null ? ac.currentTime : when, g = MIX.whoosh * (amt == null ? 1 : amt);
      const n = noise(w, rise + 0.5), bp = ac.createBiquadFilter(), ne = ac.createGain();
      bp.type = 'bandpass'; bp.Q.value = 1.3;
      bp.frequency.setValueAtTime(250, w); bp.frequency.exponentialRampToValueAtTime(5000, w + rise);
      ne.gain.setValueAtTime(0.0001, w); ne.gain.exponentialRampToValueAtTime(1.3 * g, w + rise * 0.85); ne.gain.exponentialRampToValueAtTime(0.001, w + rise + 0.45);
      n.connect(bp); bp.connect(ne); ne.connect(fx);
      const sw = ac.createOscillator(), sl = ac.createBiquadFilter(), se = ac.createGain();
      sw.type = 'sawtooth'; sl.type = 'lowpass'; sl.frequency.value = 1800; sl.Q.value = 3;
      sw.frequency.setValueAtTime(70, w); sw.frequency.exponentialRampToValueAtTime(880, w + rise);
      se.gain.setValueAtTime(0.0001, w); se.gain.exponentialRampToValueAtTime(0.22 * g, w + rise * 0.9); se.gain.exponentialRampToValueAtTime(0.001, w + rise + 0.25);
      sw.connect(sl); sl.connect(se); se.connect(fx); sw.start(w); sw.stop(w + rise + 0.3);
      const bm = ac.createOscillator(), be = ac.createGain(), bt = w + rise;
      bm.frequency.setValueAtTime(90, bt); bm.frequency.exponentialRampToValueAtTime(34, bt + 0.4);
      be.gain.setValueAtTime(0, bt); be.gain.linearRampToValueAtTime(0.9 * g, bt + 0.01); be.gain.exponentialRampToValueAtTime(0.001, bt + 0.55);
      bm.connect(be); be.connect(fx); bm.start(bt); bm.stop(bt + 0.6);
    }

    return { speed, ducked, level, bedIn, ignite, clunk, whoosh, master, limiter };
  }

  /* ---------- the live rig ---------- */
  let ac = null, g = null, raf = 0;
  const saved = store.get();
  let pref = saved !== 'off';              /* fresh visits and remembered on both begin enabled */
  let requested = false;                   /* a ride action has asked for audible playback */
  let outputLive = false;                  /* the graph's master has been raised */
  let igniteOnStart = true, pressOnStart = false;
  let resumeFlight = null, resumeToken = 0, sleepT = 0;
  let lastClunk = { on: -1, off: -1 }, lastWhoosh = -1, warpHigh = false, sawSwitchEvent = false, prevBay = null;
  let sm = 0, lastY = window.scrollY, yMovedAt = 0;
  const stats = { clunks: 0, whooshes: 0, freq: 0, speed: 0, ducked: false };

  const ride = () => window.BONEYARD_RIDE || null;
  const dial = () => { const r = ride(); return (r && r.ctx.dial) || document.documentElement.dataset.dial || 'full'; };
  const running = () => !!ac && ac.state === 'running';
  const audible = () => pref && requested && outputLive && running() && !document.hidden;
  const outputLevel = () => g ? g.master.gain.value : 0;
  const playing = () => audible() && outputLevel() > 0;
  const pending = () => pref && requested && !document.hidden && (!ACtx || !running() || !outputLive);
  const btn = () => document.getElementById('sound');

  function paint() {
    const b = btn(); if (!b) return;
    const wait = pending(), state = !pref ? 'off' : wait ? 'pending' : 'on';
    b.setAttribute('aria-pressed', pref ? 'true' : 'false');
    b.dataset.state = state;
    if (!pref) {
      b.setAttribute('aria-label', 'Sound off');
      b.title = 'Turn on sound';
    } else if (wait) {
      b.setAttribute('aria-label', 'Sound pending. Tap to start sound');
      b.title = ACtx ? 'Tap to start sound' : 'Sound is unavailable in this browser';
    } else if (audible()) {
      b.setAttribute('aria-label', 'Sound on');
      b.title = 'Mute sound';
    } else {
      b.setAttribute('aria-label', 'Sound on');
      b.title = 'Mute sound';
    }
    const label = b.querySelector('[data-label]') || (b.children.length ? null : b);
    if (label) label.textContent = state === 'pending' ? 'Sound pending' : state === 'on' ? 'Sound on' : 'Sound off';
  }

  function engage() {
    if (!g || !pref || !requested || document.hidden || !running()) { paint(); return; }
    clearTimeout(sleepT);
    if (!outputLive) {
      outputLive = true;
      g.level(true);
      if (igniteOnStart) {
        g.ignite(ac.currentTime, !pressOnStart);   /* explicit SOUND is quick; ride intent gets the softer 1.5 s rise */
        igniteOnStart = false;
      }
      pressOnStart = false;
    }
    loop();
    paint();
  }

  function ensureContext() {
    if (ac || !ACtx) return ac;
    try {
      ac = new ACtx(); g = graph(ac);
      if (ac.addEventListener) ac.addEventListener('statechange', () => {
        if (running() && pref && requested && !document.hidden) engage();
        else paint();
      });
    } catch (_) { ac = null; g = null; }
    return ac;
  }

  /* A wheel-started resume can remain pending indefinitely. Normal input shares one in-flight resume, while a
     later trusted gesture may force a fresh call. engage() is idempotent, so racing resolutions never re-ignite. */
  function resumeAudio(force) {
    const ctx = ensureContext();
    if (!ctx) { paint(); return Promise.resolve(false); }
    if (ctx.state === 'running') { if (requested) engage(); else paint(); return Promise.resolve(true); }
    if (resumeFlight && !force) { paint(); return resumeFlight.promise; }
    const token = ++resumeToken;
    let attempt;
    try { attempt = ctx.resume ? ctx.resume() : null; } catch (_) { attempt = Promise.reject(_); }
    const promise = Promise.resolve(attempt).catch(() => false).then(() => {
      if (ac === ctx && ctx.state === 'running') {
        if (pref && requested && !document.hidden) engage(); else paint();
        return true;
      }
      paint();
      return false;
    }).then((ok) => {
      if (resumeFlight && resumeFlight.token === token) resumeFlight = null;
      return ok;
    });
    resumeFlight = { token, promise };
    paint();
    return promise;
  }

  function requestSound(press, forceResume) {
    if (!pref) return;
    requested = true;
    pressOnStart = pressOnStart || !!press;
    if (document.hidden) { paint(); return; }
    resumeAudio(!!forceResume);
  }

  function silence() {
    outputLive = false;
    cancelAnimationFrame(raf); raf = 0;
    if (g && running()) g.level(false);
    clearTimeout(sleepT);
    sleepT = setTimeout(() => {
      if (ac && !outputLive && ac.state === 'running' && ac.suspend) Promise.resolve(ac.suspend()).catch(() => {});
    }, 180);
    paint();
  }

  /* the ticker: speed, warp, SCOPE duck, fallback bay switch */
  function loop() {
    cancelAnimationFrame(raf);
    let last = performance.now();
    const step = (now) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!ac || ac.state !== 'running') return;
      const r = ride(), c = r && r.ctx;
      const y = window.scrollY; if (y !== lastY) { lastY = y; yMovedAt = now; }
      let v = c ? Math.abs(c.camera.v || 0) : 0;
      if (now - yMovedAt > 600) v = Math.min(v, 0.5);             /* the ride's loop may have stopped with a stale v */
      if (now - yMovedAt > 1500) v = 0;                          /* parked: let the flywheel settle so the loop can rest */
      const warp = c ? (c.share.warp || 0) : 0;
      const cur = r ? r.bays[Math.max(0, r.current)] : null;
      const gateValue = cur?.slug === 'gate' && cur.m?.state === 'on' && c ? Number(c.share.gateEnergy) : 0;
      const gate = Number.isFinite(gateValue) ? Math.max(0, Math.min(1, gateValue)) : 0;
      const target = Math.max(1 - Math.exp(-v / MIX.speedRef), warp * 0.9, gate * 0.75);
      sm += (target - sm) * (1 - Math.exp(-dt / (target > sm ? 0.12 : 0.6)));   /* flywheel: spins up fast, runs down slow */
      stats.speed = sm; stats.freq = g.speed(sm);
      /* SCOPE duck */
      const duck = !!(cur && cur.slug === 'scope' && c && c.pointer.down);
      if (duck !== stats.ducked) { stats.ducked = duck; g.ducked(duck); }
      /* fallback switch: the current bay changed and no boneyard:switch event has been seen */
      if (r && r.current >= 0) {
        if (prevBay !== null && r.current !== prevBay && !sawSwitchEvent) onSwitch('on');
        prevBay = r.current;
      }
      /* fallback warp */
      if (!sawWarpEvent) onWarp(cur?.slug === 'gate' ? 0 : warp);
      /* rest: nothing moving, no warp, no duck, the flywheel spun down: stop asking for frames (Smaug W1) */
      if (sm < 0.01 && warp < 0.01 && gate < 0.01 && !duck && now - yMovedAt > 1500) { cancelAnimationFrame(raf); raf = 0; }
    };
    raf = requestAnimationFrame(step);
  }

  /* a relay has two sounds: pull-in (the tube coming on: full clunk plus the whine) and drop-out (a lighter,
     lower release, no whine). 30-switch sends dir 'on' / 'off'; the fallback sends 'on' only. */
  function onSwitch(dir) {
    if (!audible() || !ac || ac.state !== 'running') return;
    const kind = dir === 'off' ? 'off' : 'on', now = ac.currentTime;
    if (now - lastClunk[kind] < MIX.clunkGap) return;
    lastClunk[kind] = now; stats.clunks++;
    if (kind === 'on') g.clunk(1, now); else g.clunk(-1, now, 0.4, true);
  }
  let sawWarpEvent = false;
  function onWarp(level, fromEvent, riseSeconds, amount) {
    if (!fromEvent) {                   /* polled share.warp: our own hysteresis; the event already has one */
      if (level < 0.3) warpHigh = false;
      if (level < 0.6 || warpHigh) return;
      warpHigh = true;
    }
    if (!audible() || !ac || ac.state !== 'running') return;
    const now = ac.currentTime; if (now - lastWhoosh < MIX.whooshGap) return;
    lastWhoosh = now; stats.whooshes++; g.whoosh(amount == null ? (dial() === 'calm' ? 0.6 : 1) : amount, undefined, riseSeconds);
  }
  const rouse = () => { if (!raf && running() && audible()) loop(); };
  addEventListener('boneyard:switch', (e) => { rouse(); sawSwitchEvent = true; onSwitch(e.detail && e.detail.dir); });
  addEventListener('boneyard:warp', (e) => {
    const r = ride(), cur = r && r.bays[Math.max(0, r.current)];
    if (cur?.slug === 'gate') return;  /* Gate's own traversal event owns its synchronized voice. */
    rouse(); sawWarpEvent = true; onWarp(+(e.detail && e.detail.level) || 1, true);
  });
  addEventListener('boneyard:gate', (e) => {
    const r = ride(), cur = r && r.bays[Math.max(0, r.current)];
    if (e.detail?.phase !== 'transit' || dial() !== 'full' || cur?.slug !== 'gate') return;
    rouse(); onWarp(1, true, 0.48, 0.85);
  });

  /* ---------- intent and browser activation ---------- */
  let pointerActive = false, touchActive = false, scrollIntentUntil = 0, lastTrustedResume = -Infinity;
  let autoflyClick = false, pendingSoundUntil = 0, completesPendingSound = false;
  const now = () => performance.now();
  const trusted = (e) => e && e.isTrusted === true;
  const navKey = (e) => !e.altKey && !e.ctrlKey && !e.metaKey &&
    ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar'].includes(e.key) &&
    !(e.target && e.target.closest && e.target.closest('input, select, textarea, [contenteditable="true"]'));

  /* Pointer and touch starts can unlock Web Audio while the graph is still at zero. De-duplicate the paired
     pointerdown/touchstart that mobile browsers often send for one finger. */
  function unlockFromGesture() {
    if (!pref || document.hidden) return;
    const t = now(), force = t - lastTrustedResume > 80;
    lastTrustedResume = t;
    resumeAudio(force);
  }
  addEventListener('pointerdown', (e) => {
    if (!trusted(e)) return;
    if (e.target && e.target.closest && e.target.closest('#sound') && pending()) {
      pendingSoundUntil = now() + 1500; pressOnStart = true;
    }
    pointerActive = true; scrollIntentUntil = now() + (e.pointerType === 'touch' ? 4000 : 800);
    unlockFromGesture(); rouse();
  }, { capture: true, passive: true });
  addEventListener('pointerup', (e) => {
    if (!trusted(e)) return;
    pointerActive = false; scrollIntentUntil = now() + (e.pointerType === 'touch' ? 1800 : 700);
  }, { capture: true, passive: true });
  addEventListener('pointercancel', () => { pointerActive = false; scrollIntentUntil = now() + 700; }, { passive: true });
  addEventListener('touchstart', (e) => {
    if (!trusted(e)) return;
    touchActive = true; scrollIntentUntil = now() + 4000; unlockFromGesture();
  }, { capture: true, passive: true });
  addEventListener('touchend', (e) => {
    if (!trusted(e)) return;
    touchActive = false; scrollIntentUntil = now() + 1800;
  }, { capture: true, passive: true });
  addEventListener('touchcancel', () => { touchActive = false; scrollIntentUntil = now() + 700; }, { passive: true });
  addEventListener('wheel', (e) => {
    if (!trusted(e)) return;
    requestSound(false, false); rouse();
  }, { capture: true, passive: true });
  addEventListener('scroll', () => {
    if (pointerActive || touchActive || now() < scrollIntentUntil) requestSound(false, false);
    rouse();
  }, { passive: true });
  addEventListener('keydown', (e) => {
    if (!trusted(e) || e.altKey || e.ctrlKey || e.metaKey || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    if (e.target && e.target.closest && e.target.closest('#sound') && pending()) {
      pendingSoundUntil = now() + 1500; pressOnStart = true;
    }
    unlockFromGesture();
    if (navKey(e)) { scrollIntentUntil = now() + 1200; requestSound(false, false); }
  }, true);

  /* Capture proves that the app's synthetic boneyard:autofly event was dispatched synchronously by a real click. */
  document.addEventListener('click', (e) => {
    if (!trusted(e) || !e.target || !e.target.closest) return;
    if (e.target.closest('#sound')) {
      completesPendingSound = pending() || now() < pendingSoundUntil;
      if (completesPendingSound) { pressOnStart = true; unlockFromGesture(); }
      return;
    }
    const auto = e.target.closest('#autofly');
    if (auto) {
      autoflyClick = true; unlockFromGesture();
      /* Clear in the next task. Some browsers run a microtask checkpoint between capture and target listeners. */
      setTimeout(() => { autoflyClick = false; }, 0);
      return;
    }
    if (e.target.closest('a[href^="#"], .nav-step, .bay-launch')) {
      scrollIntentUntil = now() + 1200; unlockFromGesture(); requestSound(false, false);
    }
  }, true);
  addEventListener('boneyard:autofly', (e) => {
    if (autoflyClick && e.detail && e.detail.active === true) requestSound(false, false);
  });

  /* ---------- the button (delegated, so markup that lands late still works) ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#sound'); if (!b) return;
    if (!trusted(e)) return;
    if (completesPendingSound || pending()) {
      completesPendingSound = false; pendingSoundUntil = 0;
      if (!audible()) { pressOnStart = !outputLive; resumeAudio(true); } else paint();
      return;
    }
    if (pref) {
      pref = false; requested = false; pressOnStart = false; igniteOnStart = true;
      store.set('off'); silence(); return;
    }
    pref = true; requested = true; pressOnStart = true; igniteOnStart = true;
    store.set('on'); paint(); resumeAudio(true);
  });

  /* Hidden tab: suspend. A visible tab resumes an already requested mix without another ignition clunk. */
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) {
      cancelAnimationFrame(raf); raf = 0;
      if (ac.state === 'running' && ac.suspend) Promise.resolve(ac.suspend()).catch(() => {});
      paint();
    } else if (pref && requested) resumeAudio(false);
    else paint();
  });

  const boot = () => paint();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  /* dev and test surface: the graph builder (for an OfflineAudioContext render) and live numbers */
  window.BONEYARD_SOUND = {
    graph, MIX, stats,
    get context() { return ac; },
    get on() { return pref; },
    get pending() { return pending(); },
    get playing() { return playing(); },
    get outputLevel() { return outputLevel(); },
  };
})();
