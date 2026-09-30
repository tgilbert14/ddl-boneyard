/* ============================================================
   BONEYARD · 10-core.js · the ride (legolas, 2026-09-29)
   Scroll is the only clock. One viewport height = one bay length. Native scroll
   only: no wheel handlers, no smooth-scroll library, no transform on body/html.
   The core owns: scroll -> camera z, the shared vanishing point (+-4% pointer
   parallax, off in Calm/Still), the bay lifecycle (mount current +-1, destroy the
   rest), the room frames (1/z from the vanishing point, compositor-only), the
   corridors, hash sync, the motion dial, Auto-fly, the HUD, keyboard parity,
   the adaptive internal scale, and the audio-unlock stub SCOPE will use.
   Modules never see the DOM; they see a canvas and ctx (docs/CONTRACT.md).
   The core boots on DOMContentLoaded so every module file (20 to 49, after this
   one in the manifest) has registered on BAYS before the registry is read.
   ============================================================ */
const bootBoneyardRide = () => {
  'use strict';
  const { Ticker, keep, readTokens, dprCap, sizeCanvas, makeCtx, buildTweakRow, coarse } = BONEYARD;
  const html = document.documentElement;
  html.classList.add('js');
  const query = new URLSearchParams(location.search);
  const DEV = query.get('dev') === '1';
  if (DEV) html.classList.add('dev');

  const CFG = {
    unitsPerBay: 12,          /* grid units of camera travel per bay length */
    cruise: 0.4,              /* idle drift, units per second, Full (Calm halves it) */
    ease: 0.12,               /* seconds: scroll -> camera easing */
    parallax: 0.04,           /* +-4% of the viewport, pointer -> vanishing point */
    liveZone: 0.3,            /* |p| < liveZone: the room is switched on */
    focal: 2.0,               /* units: far-frame scale = focal / (focal + d) */
    slowFrame: 20, slowCount: 30, scaleSteps: [1, 0.75, 0.5],
    autoflyBaysPerSecond: 1 / 9, autoflyDwell: 3,
    greetingsAt: 4, chevronAt: 8,
    /* which canvas corridor plays in the gap between two bays (SWITCH plays on every transition) */
    corridors: { 'yard>jump': 'hyperspace', 'relief>terminator': 'hyperspace', 'terminator>scope': 'rings', 'scope>mark': 'rings' },
  };

  /* ---------- DOM ---------- */
  const $ = (s) => document.querySelector(s);
  const field = $('#field'), roomsEl = $('#rooms'), cue = $('#cue');
  const canvases = { sky: $('#c-sky'), row: $('#c-row'), corridor: $('#c-corridor'), tube: $('#c-tube') };
  const hud = { clock: $('#hud-clock'), dev: $('#hud-dev'), readout: $('#hud-readout'), dial: $('#dial'), autofly: $('#autofly'), index: $('#index'), devRow: $('#dev') };
  const sections = [...document.querySelectorAll('main .bay')];
  const bays = sections.map((el, i) => ({ i, el, slug: el.dataset.slug, holds: el.dataset.holds === 'true', title: (el.querySelector('h1,h2') || {}).textContent || '', m: null, visible: false }));
  const LAST = bays.length - 1, BAY_COUNT = bays.filter((b) => b.i > 0 && b.i < LAST).length;
  const readoutName = (b) => b.i === 0 ? 'The yard' : b.i === LAST ? 'The shelf' : b.title.replace(/^\s*\d+\s*/, '').trim();

  /* ---------- ctx + registry ---------- */
  const ctx = makeCtx({ demUrl: 'assets/catalinas-dem.png' });
  ctx.dev = DEV;
  const reg = { layers: [], corridors: {}, bays: {}, placeholder: null, post: null, dom: {} };
  for (const m of window.BAYS) {
    if (m.kind === 'post') reg.post = m;
    else if (m.kind === 'dom') reg.dom[m.slug] = m;
    else if (m.role === 'layer') reg.layers.push(m);
    else if (m.role === 'corridor') reg.corridors[m.slug] = m;
    else if (m.role === 'placeholder') reg.placeholder = m;
    else if (m.role === 'bay') reg.bays[m.slug] = m;
  }
  reg.layers.sort((a, b) => a.order - b.order);

  /* the dial attribute goes on early so the CSS stills apply before first paint; the full wiring is below */
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  const storedDial = keep.get('boneyard_dial');
  html.dataset.dial = ['full', 'calm', 'still'].includes(storedDial) ? storedDial : (rmq.matches ? 'still' : 'full');
  ctx.dial = html.dataset.dial;

  /* ---------- geometry ---------- */
  let W = innerWidth, H = innerHeight, len = H, dpr = dprCap();
  let scaleIdx = 0;
  const cam = ctx.camera;
  let cruise = 0, t = 0, scrollY = window.scrollY, lastScrollY = -1, scrollStill = 0, current = -1, running = false;
  const visited = new Set();

  /* ---------- layers (sky, row) + DOM modules (greetings, switch) ---------- */
  const layers = [];
  for (const m of reg.layers) {
    const canvas = canvases[m.slug];
    if (!canvas) continue;
    const params = Object.assign({}, m.params);
    const handle = m.mount(canvas, params, ctx);
    layers.push({ m, canvas, params, handle });
  }
  const switcher = reg.dom.switch ? { m: reg.dom.switch, params: Object.assign({}, reg.dom.switch.params) } : null;
  if (switcher) switcher.handle = switcher.m.mount(roomsEl, switcher.params, ctx);
  const greetEl = $('#greetings');
  const greetings = reg.dom.greetings && greetEl ? { m: reg.dom.greetings, params: Object.assign({}, reg.dom.greetings.params) } : null;
  if (greetings) greetings.handle = greetings.m.mount(greetEl, greetings.params, ctx);
  let post = null;
  if (reg.post && canvases.tube) {
    const params = Object.assign({}, reg.post.params);
    const handle = reg.post.mount(canvases.tube, params, ctx);
    if (handle && handle.enabled) { canvases.tube.hidden = false; post = { m: reg.post, handle, params }; } else if (handle && handle.destroy) handle.destroy();
  }

  /* ---------- sizing ---------- */
  function resizeAll() {
    W = innerWidth; H = innerHeight; dpr = dprCap();
    len = bays[1] ? bays[1].el.offsetHeight || H : H;
    ctx.scale = CFG.scaleSteps[scaleIdx];
    ctx.dpr = dpr * ctx.scale;
    for (const L of layers) { const s = sizeCanvas(L.canvas, W, H, dpr, ctx.scale, L.m.pixel); L.handle.resize(s.w, s.h, s.dpr); if (ctx.dial === 'still') L.handle.still(t); }
    if (corridor) { const s = sizeCanvas(canvases.corridor, W, H, dpr, ctx.scale, corridor.m.pixel); corridor.handle.resize(s.w, s.h, s.dpr); }
    for (const b of bays) if (b.m) { const s = sizeCanvas(b.m.canvas, W, H, dpr, ctx.scale, b.m.mod.pixel); b.m.handle.resize(s.w, s.h, s.dpr); if (b.m.state !== 'on' || ctx.dial === 'still') b.m.handle.still(t); }
    if (post) { const s = sizeCanvas(canvases.tube, W, H, dpr, 1); post.handle.resize(s.w, s.h, s.dpr); }
    computeGaps();
    wake();
  }
  addEventListener('resize', resizeAll, { passive: true });

  /* ---------- adaptive internal scale: 30 consecutive slow frames drop one step ----------
     "slow" is measured against the display's own refresh interval (the median dt of the first 40 frames),
     so a 30 Hz panel or iOS Low Power Mode (rAF capped at 30 fps) does not read as a struggling page. */
  let slow = 0, refresh = 0; const dts = [];
  function adapt() {
    const dt = Ticker.stats.dt;
    if (!refresh) { if (dt > 4 && dt < 60) dts.push(dt); if (dts.length >= 40) { dts.sort((a, b) => a - b); refresh = dts[20]; } return; }
    if (dt > Math.max(CFG.slowFrame, refresh * 1.6)) { if (++slow >= CFG.slowCount && scaleIdx < CFG.scaleSteps.length - 1) { scaleIdx++; slow = 0; if (post) post.handle.bloom(false); resizeAll(); } }
    else slow = 0;
  }

  /* ---------- rooms: one wrapper per mounted bay ---------- */
  function mountBay(b) {
    if (b.m || b.i === 0 || b.i === LAST) return;
    const mod = reg.bays[b.slug] || reg.placeholder;
    if (!mod) return;
    const room = document.createElement('div'); room.className = 'room is-far'; room.dataset.slug = b.slug;
    room.style.zIndex = String(100 - b.i);            /* nearer bays stack above farther ones: a room hides the frames behind it */
    const tube = document.createElement('div'); tube.className = 'room__tube';
    const canvas = document.createElement('canvas');
    const flash = document.createElement('div'); flash.className = 'room__flash';
    tube.append(canvas, flash); room.append(tube); roomsEl.append(room);
    const params = Object.assign({}, mod.params);
    const s = sizeCanvas(canvas, W, H, dpr, ctx.scale, mod.pixel);
    const handle = mod.mount(canvas, params, ctx);
    handle.resize(s.w, s.h, s.dpr);
    handle.still(0);
    b.m = { mod, room, tube, canvas, flash, params, handle, state: 'far', t0: t, anim: null };
    if (mod.dem) ctx.dem().catch(() => {});
    room.style.setProperty('--room-s', '0.02');
    if (DEV && b.i === current) devRow(b);
  }
  function destroyBay(b) {
    if (!b.m) return;
    if (switcher) switcher.handle.cancel(b.m);
    try { b.m.handle.destroy(); } catch (err) { console.error(err); }
    b.m.room.remove(); b.m = null;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const b = bays[sections.indexOf(e.target)];
      b.visible = e.isIntersecting;
      if (e.isIntersecting) mountBay(b); else destroyBay(b);
    }
    wake();
  }, { rootMargin: '95% 0px 95% 0px', threshold: 0 });
  for (const b of bays) if (b.i > 0 && b.i < LAST) io.observe(b.el);

  /* the switch: on (a line opens into the room) / off (line, dot, recede) */
  let lastFlash = -1e9;
  function switchOn(b) {
    const m = b.m; m.state = 'on'; m.t0 = t;
    m.room.classList.remove('is-far', 'is-hidden');
    m.room.style.setProperty('--room-o', '1');
    const from = Number(m.room.style.getPropertyValue('--room-s')) || 0.02;
    m.room.style.setProperty('--room-s', '1');
    if (switcher) switcher.handle.play(m, 'on', { still: ctx.dial === 'still', from });
    if (ctx.dial === 'still') m.handle.still(t);
    if (DEV) devRow(b);
  }
  function switchOff(b, dir) {
    const m = b.m; m.state = 'off';
    const flash = ctx.dial === 'full' && t - lastFlash > 0.5;
    if (flash) lastFlash = t;
    const p = switcher ? switcher.handle.play(m, 'off', { still: ctx.dial === 'still', flash, dir }) : Promise.resolve(true);
    p.then((done) => { if (done && m.state === 'off') m.room.classList.add('is-hidden'); });
  }
  function updateBays(dt) {
    for (const b of bays) {
      const m = b.m; if (!m) continue;
      const p = (scrollY - b.el.offsetTop) / len;          /* bay lengths from the hold; + = passed */
      const d = -p * CFG.unitsPerBay;                      /* grid units ahead */
      const live = Math.abs(p) < CFG.liveZone;
      if (m.state === 'far') {
        if (live) { switchOn(b); continue; }
        if (p > 0) { m.state = 'off'; m.room.classList.add('is-hidden'); continue; }
        const s = CFG.focal / (CFG.focal + d);
        m.room.style.setProperty('--room-s', s.toFixed(4));
        m.room.style.setProperty('--room-o', (0.25 + 0.75 * s).toFixed(3));
      } else if (m.state === 'on') {
        if (!live) { switchOff(b, p > 0 ? 'forward' : 'back'); continue; }
        if (ctx.dial !== 'still') m.handle.tick(dt, t - m.t0, p, ctx.pointer);
      } else if (m.state === 'off') {
        if (live) { if (switcher) switcher.handle.cancel(m); switchOn(b); continue; }
        if (p < 0 && !(switcher && switcher.handle.busy(m))) { m.state = 'far'; m.room.classList.add('is-far'); m.room.classList.remove('is-hidden'); }
      }
    }
  }

  /* ---------- canvas corridors in the gaps ---------- */
  let gaps = [], corridor = null;
  function computeGaps() {
    gaps = [];
    for (let i = 0; i < LAST; i++) {
      const a = bays[i], b = bays[i + 1], slug = CFG.corridors[a.slug + '>' + b.slug];
      if (!slug || !reg.corridors[slug]) continue;
      gaps.push({ a, b, m: reg.corridors[slug], start: a.el.offsetTop + 0.02 * len, end: b.el.offsetTop - CFG.liveZone * len });
    }
  }
  function updateCorridor(dt) {
    const g = gaps.find((x) => scrollY > x.start && scrollY < x.end);   /* strictly inside the gap: at rest there is no corridor */
    if (!g) { if (corridor) { corridor.handle.destroy(); corridor = null; ctx.share.warp = 0; canvases.corridor.getContext('2d').clearRect(0, 0, canvases.corridor.width, canvases.corridor.height); } return; }
    if (!corridor || corridor.m !== g.m) {
      if (corridor) corridor.handle.destroy();
      const params = Object.assign({}, g.m.params);
      const handle = g.m.mount(canvases.corridor, params, ctx);
      const s = sizeCanvas(canvases.corridor, W, H, dpr, ctx.scale, g.m.pixel);
      handle.resize(s.w, s.h, s.dpr);
      corridor = { m: g.m, params, handle, t0: t };
      if (ctx.dial === 'still') handle.still(t);
    }
    const prog = Math.max(0, Math.min(1, (scrollY - g.start) / Math.max(1, g.end - g.start)));
    if (ctx.dial !== 'still') corridor.handle.tick(dt, t - corridor.t0, prog, ctx.pointer);
  }

  /* ---------- HUD: clock, readout, index, hash ---------- */
  const fmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  function clock() {
    const now = new Date();
    hud.clock.textContent = fmt.format(now);
    hud.clock.setAttribute('datetime', now.toTimeString().slice(0, 5));
    ctx.hour = now.getHours() + now.getMinutes() / 60;
    if (ctx.share.horizonTint) html.style.setProperty('--horizon-tint', ctx.share.horizonTint);
    setTimeout(clock, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20);
  }
  clock();
  const indexLinks = [...hud.index.querySelectorAll('a')];
  function setCurrent(i) {
    if (i === current) return;
    if (current > 0 && current < LAST) visited.add(current);
    current = i;
    const b = bays[i];
    hud.readout.innerHTML = `Bay ${String(Math.min(i, BAY_COUNT)).padStart(2, '0')} <span class="dot">/</span> ${String(BAY_COUNT).padStart(2, '0')} <span class="dot">·</span> ${readoutName(b)}`;
    for (const a of indexLinks) {
      const k = Number(a.dataset.bay);
      a.classList.toggle('is-visited', visited.has(k) && k !== i);
      if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    }
    const hash = i === 0 ? '' : '#' + b.slug;
    if (location.hash !== hash && !(i === 0 && !location.hash)) history.replaceState(null, '', location.pathname + location.search + hash);
    if (DEV) devRow(b);
  }

  /* ---------- pointer: store only; the loop reads ---------- */
  const ptr = ctx.pointer;
  let ptrTx = 0.5, ptrTy = 0.5;
  addEventListener('pointermove', (e) => { ptrTx = e.clientX / W; ptrTy = e.clientY / H; ptr.x = e.clientX; ptr.y = e.clientY; ptr.present = true; wake(); }, { passive: true });
  addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('#hud, a, button, input, #dev')) return; ptr.down = true; ptr.x = e.clientX; ptr.y = e.clientY; ptrTx = e.clientX / W; ptrTy = e.clientY / H; wake(); }, { passive: true });
  const up = () => { ptr.down = false; };
  addEventListener('pointerup', up, { passive: true });
  addEventListener('pointercancel', up, { passive: true });
  addEventListener('blur', up);
  document.addEventListener('pointerleave', () => { ptr.present = false; });

  /* ---------- keyboard parity: a bay at a time; Space holds where a bay asks for it ---------- */
  const scrollToBay = (i) => { i = Math.max(0, Math.min(LAST, i)); window.scrollTo({ top: bays[i].el.offsetTop, behavior: ctx.dial === 'still' ? 'auto' : 'smooth' }); };
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('input, select, textarea, button')) return;
    const b = bays[Math.max(0, current)];
    if (e.key === ' ' && b && b.holds && ctx.dial !== 'still' && !e.repeat) { ptr.down = true; wake(); e.preventDefault(); return; }
    if (e.key === ' ' && e.repeat && b && b.holds && ctx.dial !== 'still') { e.preventDefault(); return; }
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { setAutofly(false); scrollToBay(Math.round(scrollY / len) + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { setAutofly(false); scrollToBay(Math.round(scrollY / len) - 1); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { if (e.key === ' ') ptr.down = false; });

  /* ---------- Auto-fly: a visible button, reading pace, any input stops it ---------- */
  let autofly = false, dwell = 0, dwellAt = -1;
  function setAutofly(on) {
    if (on === autofly) return;
    if (on && ctx.dial === 'still') return;
    autofly = on;
    hud.autofly.setAttribute('aria-pressed', String(on));
    hud.autofly.textContent = on ? 'Stop' : 'Auto-fly';
    html.classList.toggle('autofly', on);
    if (on) { dwell = 0; dwellAt = -1; if (scrollY >= bays[LAST].el.offsetTop - 2) window.scrollTo({ top: 0, behavior: 'auto' }); }
    wake();
  }
  hud.autofly.addEventListener('click', () => setAutofly(!autofly));
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    addEventListener(type, (e) => { if (autofly && !(type === 'pointerdown' && e.target && e.target.closest && e.target.closest('#autofly'))) setAutofly(false); }, { passive: true, capture: true });
  }
  function flyStep(dt) {
    if (!autofly) return;
    const near = Math.round(scrollY / len);
    const p = (scrollY - bays[near].el.offsetTop) / len;
    if (Math.abs(p) < 0.012 && dwellAt !== near) { dwell += dt; if (dwell < CFG.autoflyDwell) return; dwellAt = near; dwell = 0; }
    const top = bays[LAST].el.offsetTop;
    if (scrollY >= top - 1) { setAutofly(false); return; }
    const next = Math.min(top, scrollY + len * CFG.autoflyBaysPerSecond * dt * (ctx.dial === 'calm' ? 0.5 : 1));
    const target = bays[Math.min(LAST, near + 1)].el.offsetTop;
    window.scrollTo({ top: (next > target - 0.5 && scrollY < target) ? target : next, behavior: 'auto' });
  }

  /* ---------- ?dev=1: the tweak row for the current bay's PARAMS ---------- */
  function devRow(b) {
    if (!DEV || !hud.devRow) return;
    const m = b && b.m;
    if (!m) { hud.devRow.textContent = ''; return; }
    const n = buildTweakRow(hud.devRow, m.params, (k, v) => { m.params[k] = v; if (m.handle.params) m.handle.params(m.params); wake(); });
    if (!n) hud.devRow.textContent = 'no tunables';
  }

  /* ---------- the audio-unlock stub (ACI 2.6): SCOPE will build on this ---------- */
  ctx.audio = (() => {
    let ac = null, wanted = false;
    const ACtx = window.AudioContext || window.webkitAudioContext;
    function unlock() {
      if (!ACtx) return Promise.resolve(null);
      if (!ac) ac = new ACtx();
      wanted = true;
      const p = ac.resume ? ac.resume() : Promise.resolve();
      return Promise.resolve(p).then(() => (ac.state === 'running' ? ac : null)).catch(() => null);
    }
    document.addEventListener('visibilitychange', () => { if (ac && document.hidden && ac.state === 'running') ac.suspend(); else if (ac && !document.hidden && wanted) ac.resume(); });
    return { unlock, get context() { return ac; }, get running() { return !!ac && ac.state === 'running'; } };
  })();

  /* ---------- the dial ---------- */
  const radios = [...hud.dial.querySelectorAll('input')];
  function applyDial(v, remember) {
    ctx.dial = v;
    html.dataset.dial = v;
    for (const r of radios) r.checked = r.value === v;
    if (remember) keep.set('boneyard_dial', v);
    hud.autofly.disabled = v === 'still';
    if (v === 'still' && autofly) setAutofly(false);
    if (v !== 'full') { ctx.vp.x = ctx.vpBase.x; ctx.vp.y = ctx.vpBase.y; }
    for (const b of bays) if (b.m) { if (v === 'still') { b.m.handle.still(t); } }
    for (const L of layers) { if (v === 'still') L.handle.still(t); }
    if (greetings) greetings.handle.setDial(v);
    wake();
  }
  applyDial(html.dataset.dial, false);
  rmq.addEventListener('change', () => { if (!keep.get('boneyard_dial')) applyDial(rmq.matches ? 'still' : 'full', false); });
  hud.dial.addEventListener('change', (e) => { if (e.target.checked) applyDial(e.target.value, true); });

  /* ---------- the world task ---------- */
  let frameN = 0, devAcc = 0, devN = 0, devAt = 0;
  function world(dt, now) {
    t += dt; frameN++;
    scrollY = window.scrollY;
    if (scrollY !== lastScrollY) { scrollStill = 0; lastScrollY = scrollY; } else scrollStill += dt;
    const still = ctx.dial === 'still';
    flyStep(dt);

    /* camera: scroll -> z, eased 120 ms; idle cruise is the powered-on hum */
    if (!still) cruise += CFG.cruise * (ctx.dial === 'calm' ? 0.5 : 1) * dt;
    const targetZ = scrollY / len * CFG.unitsPerBay + cruise;
    const k = 1 - Math.exp(-dt / CFG.ease);
    const prevZ = cam.z; cam.z += (targetZ - cam.z) * k; cam.v = (cam.z - prevZ) / Math.max(dt, 1e-3);

    /* the shared vanishing point */
    if (ctx.dial === 'full' && ptr.present && !ptr.coarse) {
      const kx = 1 - Math.exp(-dt / 0.14);
      ctx.vp.x += (ctx.vpBase.x + (ptrTx - 0.5) * 2 * CFG.parallax - ctx.vp.x) * kx;
      ctx.vp.y += (ctx.vpBase.y + (ptrTy - 0.5) * 2 * CFG.parallax - ctx.vp.y) * kx;
    } else { ctx.vp.x += (ctx.vpBase.x - ctx.vp.x) * 0.1; ctx.vp.y += (ctx.vpBase.y - ctx.vp.y) * 0.1; }
    ptr.nx = ptrTx; ptr.ny = ptrTy;
    if ((frameN & 1) === 0) { roomsEl.style.setProperty('--vp-x', (ctx.vp.x * 100).toFixed(2) + '%'); roomsEl.style.setProperty('--vp-y', (ctx.vp.y * 100).toFixed(2) + '%'); }

    setCurrent(Math.max(0, Math.min(LAST, Math.round(scrollY / len))));
    updateBays(dt);
    updateCorridor(dt);
    if (!still) {
      const t0 = DEV ? performance.now() : 0;
      for (const L of layers) L.handle.tick(dt, t, cam.z, ptr);
      if (DEV) { devAcc += performance.now() - t0; devN++; }
    }
    if (post) post.handle.tick(dt, t, { sky: canvases.sky, row: canvases.row, corridor: canvases.corridor, rooms: roomsEl });
    if (frameN > 10) adapt();
    if (DEV && now - devAt > 0.5) {
      devAt = now;
      hud.dev.hidden = false;
      hud.dev.textContent = `js ${Ticker.stats.work.toFixed(1)} ms/frame · scale ${ctx.scale} · layers js ${(devN ? devAcc / devN : 0).toFixed(2)} ms`;
      devAcc = 0; devN = 0;
    }
    /* idle stop: in Still, with nothing in flight and the scroll settled, the loop dies (0 CPU at rest) */
    if (still && !autofly && scrollStill > 0.4 && !(switcher && switcher.handle.anyBusy())) { running = false; return false; }
  }
  function wake() { if (!running) { running = true; Ticker.add(world); } else if (!Ticker.has(world)) { Ticker.add(world); } }
  ctx.wake = wake;
  addEventListener('scroll', wake, { passive: true });

  /* ---------- boot: size, mount what is visible, switch the tube on (the only auto-start, 500 ms) ---------- */
  resizeAll();
  const boot = () => {
    if (ctx.dial === 'still') { html.classList.add('tube-on'); }
    else {
      field.animate([{ transform: 'scaleY(0.004)' }, { transform: 'scaleY(1)' }], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'none' });
      html.classList.add('tube-on');
    }
    wake();
  };
  requestAnimationFrame(boot);
  setTimeout(() => { html.classList.add('greet-on'); if (greetings) greetings.handle.start(); }, CFG.greetingsAt * 1000);
  setTimeout(() => { if (window.scrollY < 4 && ctx.dial === 'full' && cue) { cue.classList.add('pulse'); } }, CFG.chevronAt * 1000);

  /* dev surface: the measured numbers, never the HUD's business unless ?dev=1 */
  window.BONEYARD_RIDE = { ctx, bays, layers, get corridor() { return corridor; }, stats: Ticker.stats, CFG, get current() { return current; } };
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootBoneyardRide, { once: true });
else bootBoneyardRide();
