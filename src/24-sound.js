/* BONEYARD SOUND · the opt-in engine room (PUNCH item 7)
 * what        one SOUND button in settings. Off until a visitor opts in; an explicit choice is remembered. When on: a low synth engine bed whose pitch and filter
 *             follow scroll speed, a CRT relay clunk plus a high-voltage whine tick on every tube switch, a rising
 *             filtered-noise whoosh with a pitch sweep when a hyperspace warp crosses 0.6. SCOPE keeps its own tone.
 * law         no autoplay before a real gesture. No AudioContext exists until the visitor's first pointerup /
 *             keydown / touchend (scroll and wheel are not activation), and then the bed rises over 1.5 s behind one
 *             soft switch-on clunk. No gate, no overlay: the page runs silent until then. An explicit off is stored
 *             and wins. Default OFF under the dial's Still or prefers-reduced-motion.
 *             Hidden tab suspends the context. The dial's Still mutes it unless SOUND is pressed while in Still,
 *             and even then no whooshes. The bed ducks to near zero while SCOPE is current and held.
 * wiring      no BAYS registration and no core edit: a self-starting IIFE that reads window.BONEYARD_RIDE
 *             (camera.v, share.warp, pointer.down, current) on its own rAF while running, and listens for the
 *             window CustomEvents boneyard:switch {dir, slug} and boneyard:warp {level}. Until those events exist,
 *             a change of the current bay is the fallback switch trigger and share.warp the fallback warp.
 * mix         voices -> master gain 0.25 -> DynamicsCompressor (brick-wall limiter, -3 dB) -> destination.
 *             Measured offline (OfflineAudioContext, 10 s script, 2026-09-29): idle bed -27 LUFS, full-speed bed -16.5
 *             LUFS, switch clunk peak -8.4 dBFS, first-gesture clunk -20 dBFS, whoosh peak -5.5 dBFS, whole script -21 LUFS.
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
    function whoosh(amt, when) {
      const w = when == null ? ac.currentTime : when, g = MIX.whoosh * (amt == null ? 1 : amt), rise = 1.1;
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
  /* the choice: an explicit 'off' wins; 'on' is on; nothing stored = on, unless Still or reduced motion */
  const quiet = () => (window.BONEYARD_RIDE ? window.BONEYARD_RIDE.ctx.dial : document.documentElement.dataset.dial) === 'still' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saved = store.get();
  let pref = saved === 'on';              /* resolved at boot, once the core has set the dial */
  let explicit = saved === 'on' || saved === 'off';
  let stillOk = false;                    /* SOUND pressed while the dial sits on Still */
  let armed = false;                      /* remembered "on" waiting for this visit's first gesture */
  let lastClunk = { on: -1, off: -1 }, lastWhoosh = -1, warpHigh = false, sawSwitchEvent = false, prevBay = null;
  let sm = 0, lastY = window.scrollY, yMovedAt = 0;
  const stats = { clunks: 0, whooshes: 0, freq: 0, speed: 0, ducked: false };

  const ride = () => window.BONEYARD_RIDE || null;
  const dial = () => { const r = ride(); return (r && r.ctx.dial) || document.documentElement.dataset.dial || 'full'; };
  const allowed = () => pref && (dial() !== 'still' || stillOk);
  const audible = () => allowed() && !!ac && !document.hidden;
  const btn = () => document.getElementById('sound');

  function paint() {
    const b = btn(); if (!b) return;
    const on = allowed();
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.dataset.state = on ? 'on' : 'off';
    const label = b.querySelector('[data-label]') || (b.children.length ? null : b);
    if (label) label.textContent = on ? 'Sound on' : 'Sound off';
  }

  /* create or resume the context: only ever called from inside a user gesture */
  function wake(press) {
    if (!ACtx) return;
    if (!ac) { ac = new ACtx(); g = graph(ac); }
    const p = ac.state !== 'running' && ac.resume ? ac.resume() : null;
    /* armed stays true until the context is really running: without activation Chrome leaves resume() pending
       forever, so clearing it here left the default-on sound silent for the whole visit (Smaug round 2, KILL 2) */
    Promise.resolve(p).catch(() => {}).then(() => {
      if (ac.state !== 'running') { armed = allowed(); return; }   /* blocked: try again on the next gesture */
      armed = false;
      if (!audible()) { sleep(); return; }
      g.level(true);
      g.ignite(ac.currentTime, !press);   /* switch-on clunk + bed rise: 0.6 s on a press, 1.5 s and soft on the first gesture */
      loop();
    });
  }
  let sleepT = 0;
  function sleep() {
    if (!ac) return;
    cancelAnimationFrame(raf); raf = 0;
    g.level(false);
    clearTimeout(sleepT);
    sleepT = setTimeout(() => { if (ac && !audible() && ac.state === 'running') ac.suspend(); }, 180);
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
      const target = Math.max(1 - Math.exp(-v / MIX.speedRef), warp * 0.9);
      sm += (target - sm) * (1 - Math.exp(-dt / (target > sm ? 0.12 : 0.6)));   /* flywheel: spins up fast, runs down slow */
      stats.speed = sm; stats.freq = g.speed(sm);
      /* SCOPE duck */
      const cur = r ? r.bays[Math.max(0, r.current)] : null;
      const duck = !!(cur && cur.slug === 'scope' && c && c.pointer.down);
      if (duck !== stats.ducked) { stats.ducked = duck; g.ducked(duck); }
      /* fallback switch: the current bay changed and no boneyard:switch event has been seen */
      if (r && r.current >= 0) {
        if (prevBay !== null && r.current !== prevBay && !sawSwitchEvent) onSwitch('on');
        prevBay = r.current;
      }
      /* fallback warp */
      if (!sawWarpEvent) onWarp(warp);
      /* rest: nothing moving, no warp, no duck, the flywheel spun down: stop asking for frames (Smaug W1) */
      if (sm < 0.01 && warp < 0.01 && !duck && now - yMovedAt > 1500) { cancelAnimationFrame(raf); raf = 0; }
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
  function onWarp(level, fromEvent) {
    if (!fromEvent) {                   /* polled share.warp: our own hysteresis; the event already has one */
      if (level < 0.3) warpHigh = false;
      if (level < 0.6 || warpHigh) return;
      warpHigh = true;
    }
    if (!audible() || !ac || ac.state !== 'running' || dial() === 'still') return;
    const now = ac.currentTime; if (now - lastWhoosh < MIX.whooshGap) return;
    lastWhoosh = now; stats.whooshes++; g.whoosh(dial() === 'calm' ? 0.6 : 1);
  }
  const rouse = () => { if (!raf && ac && ac.state === 'running' && audible() && !document.hidden) loop(); };
  addEventListener('scroll', rouse, { passive: true });
  addEventListener('pointerdown', rouse, { passive: true });
  addEventListener('keydown', rouse);
  addEventListener('boneyard:switch', (e) => { rouse(); sawSwitchEvent = true; onSwitch(e.detail && e.detail.dir); });
  addEventListener('boneyard:warp', (e) => { rouse(); sawWarpEvent = true; onWarp(+(e.detail && e.detail.level) || 1, true); });

  /* ---------- the button (delegated, so markup that lands late still works) ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#sound'); if (!b) return;
    explicit = true; armed = false;
    if (allowed()) { pref = false; stillOk = false; store.set('off'); paint(); sleep(); return; }
    pref = true; if (dial() === 'still') stillOk = true; store.set('on'); paint();
    wake(true);
  });
  /* default or remembered "on": the first real gesture of the visit starts it (a press on SOUND is the click's business) */
  const QUIET_KEYS = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
  const gesture = (e) => {
    if (!armed || (e.target && e.target.closest && e.target.closest('#sound'))) return;
    if (e.type === 'keydown' && (QUIET_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey)) return;   /* a keyboard user reaches the control first */
    if (navigator.userActivation && !navigator.userActivation.isActive) return;   /* a scroll swipe's touchend is not a gesture */
    if (allowed()) wake(false);
  };
  addEventListener('pointerup', gesture, true);
  addEventListener('keydown', gesture, true);
  addEventListener('touchend', gesture, { capture: true, passive: true });

  /* hidden tab: suspend; back: resume if still wanted (the tab was already unlocked by a gesture) */
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; if (ac.state === 'running') ac.suspend(); }
    else if (audible()) { ac.resume().then(() => { g.level(true); loop(); }).catch(() => {}); }
  });
  /* the dial: entering Still revokes the in-session consent (press SOUND again to have it back, no whooshes) */
  document.addEventListener('change', (e) => {
    if (!e.target || e.target.name !== 'dial') return;
    if (e.target.value === 'still') stillOk = false;
    if (!explicit) pref = false;   /* an untouched default follows the dial */
    paint();
    if (!allowed() || document.hidden) { sleep(); return; }
    if (ac && ac.state === 'running') { g.level(true); loop(); } else wake(false);   /* the dial change is itself a gesture */
  });

  const boot = () => { if (!explicit) pref = false; armed = allowed(); paint(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  /* dev and test surface: the graph builder (for an OfflineAudioContext render) and live numbers */
  window.BONEYARD_SOUND = { graph, MIX, stats, get context() { return ac; }, get on() { return allowed(); } };
})();
