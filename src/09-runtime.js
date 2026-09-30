/* ============================================================
   BONEYARD · 09-runtime.js · the substrate (legolas, 2026-09-29)
   Shared by the ride (10-core.js) and every parts page (90-parts-harness.html).
   One rAF ticker with self-removing tasks that STOPS when the queue is empty
   and while the tab is hidden (playbook 2.1, 2.2). The ctx factory every module
   receives. The DEM decoder (Terrarium). Canvas sizing under the DPR cap and the
   adaptive internal scale. The tweak-row builder the harness and ?dev=1 share.
   No DOM assumptions beyond documentElement; no module knowledge.
   ============================================================ */
'use strict';
window.BAYS = window.BAYS || [];

const BONEYARD = (() => {
  const html = document.documentElement;

  /* ---------- storage that never throws (blocked cookies, sandboxed frames) ---------- */
  const keep = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };

  /* ---------- the ticker ---------- */
  const Ticker = (() => {
    const tasks = new Set();
    let rafId = null, last = 0, fresh = true;
    const stats = { dt: 16.7, work: 0, slow: 0, frames: 0 };
    function frame(now) {
      rafId = null;
      if (document.hidden) { fresh = true; return; }      /* hidden tab: the loop dies here; visibilitychange restarts it */
      let dt = fresh ? 16.7 : now - last;                  /* first frame after a wake: no monster dt */
      fresh = false; last = now;
      stats.dt = dt;
      dt = Math.min(dt, 50);
      const t0 = performance.now();
      for (const task of tasks) {
        let r;
        try { r = task(dt / 1000, now / 1000); } catch (err) { console.error(err); r = false; }
        if (r === false) tasks.delete(task);
      }
      stats.work = performance.now() - t0;
      stats.frames++;
      if (tasks.size) rafId = requestAnimationFrame(frame);
    }
    function add(fn) { tasks.add(fn); if (rafId === null && !document.hidden) { fresh = true; rafId = requestAnimationFrame(frame); } return fn; }
    function remove(fn) { tasks.delete(fn); }
    function has(fn) { return tasks.has(fn); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && tasks.size && rafId === null) { fresh = true; rafId = requestAnimationFrame(frame); } });
    return { add, remove, has, stats, get size() { return tasks.size; } };
  })();

  /* ---------- tokens: resolved by the browser, handed to canvases as rgb strings ---------- */
  const TOKEN_NAMES = ['field', 'field-2', 'phosphor', 'phosphor-core', 'phosphor-dim', 'amber', 'ink', 'ink-dim', 'line', 'horizon-tint'];
  function readTokens() {
    const cs = getComputedStyle(html);
    const out = {};
    for (const n of TOKEN_NAMES) out[n.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = cs.getPropertyValue('--' + n).trim();
    return out;
  }
  /* rgb()/rgba()/#hex token -> [r,g,b] */
  function toRgb(c) {
    if (!c) return [142, 243, 255];
    const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    const h = c.replace('#', '');
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return [142, 243, 255];
  }
  const rgba = (c, a) => { const [r, g, b] = toRgb(c); return `rgba(${r},${g},${b},${a})`; };

  /* ---------- the DPR cap: 1.5 desktop, 1 mobile (brief, house constraints) ---------- */
  const coarse = matchMedia('(pointer: coarse)');
  function dprCap() {
    const mobile = coarse.matches || Math.min(innerWidth, innerHeight) < 720;
    return Math.min(devicePixelRatio || 1, mobile ? 1 : 1.5);
  }

  /* size a canvas's backing store: CSS box w x h, backing = w*dpr*scale, or a fixed low-res
     width for ImageData rooms (upscaled pixelated by CSS). Returns the backing size. */
  function sizeCanvas(canvas, cssW, cssH, dpr, scale, pixel) {
    let bw, bh;
    if (pixel) { bw = pixel; bh = Math.max(1, Math.round(pixel * cssH / Math.max(1, cssW))); canvas.dataset.pixel = '1'; }
    else { bw = Math.max(1, Math.round(cssW * dpr * scale)); bh = Math.max(1, Math.round(cssH * dpr * scale)); }
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    return { w: bw, h: bh, dpr: pixel ? bw / cssW : dpr * scale };
  }

  /* ---------- the shared elevation grid (Terrarium): decoded once, shared by every DEM room ---------- */
  function demLoader(url) {
    let promise = null;
    return () => promise || (promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        try {
          const W = img.naturalWidth, H = img.naturalHeight;
          const c = document.createElement('canvas'); c.width = W; c.height = H;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, W, H).data;
          const elev = new Float32Array(W * H);
          let min = Infinity, max = -Infinity;
          for (let i = 0; i < W * H; i++) {
            const e = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;   /* metres */
            elev[i] = e; if (e < min) min = e; if (e > max) max = e;
          }
          resolve({ width: W, height: H, elev, min, max, url });
        } catch (err) { promise = null; reject(err); }
      };
      img.onerror = () => { promise = null; reject(new Error('DEM failed to load: ' + url)); };
      img.src = url;
    }));
  }

  /* ---------- ctx: what every module is handed ---------- */
  function makeCtx(opts) {
    const ctx = {
      vp: { x: 0.5, y: 0.38 },                 /* the shared vanishing point, normalised, parallax applied */
      vpBase: { x: 0.5, y: 0.38 },
      dpr: 1, scale: 1,                        /* effective backing dpr, adaptive internal scale */
      pointer: { x: 0, y: 0, nx: 0.5, ny: 0.5, down: false, present: false, coarse: coarse.matches },
      dial: 'full',                            /* full | calm | still */
      get reduced() { return this.dial === 'still'; },
      tokens: readTokens(),
      rgba,
      hour: new Date().getHours() + new Date().getMinutes() / 60,
      camera: { z: 0, v: 0 },                  /* grid units along the row, units per second */
      share: {},                               /* the shared bag (22-sky.js publishes stars here) */
      dev: false,
      wake() {},
      dem: demLoader(opts && opts.demUrl || 'assets/catalinas-dem.png'),
    };
    return ctx;
  }

  /* ---------- the tweak row: PARAMS -> inputs; the harness and ?dev=1 share it ---------- */
  function buildTweakRow(container, params, onChange) {
    container.textContent = '';
    const keys = Object.keys(params).filter((k) => ['number', 'boolean', 'string'].includes(typeof params[k]));
    for (const k of keys) {
      const v = params[k];
      const wrap = document.createElement('label'); wrap.className = 'tweak';
      const name = document.createElement('span'); name.textContent = k; wrap.appendChild(name);
      let input;
      if (typeof v === 'boolean') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = v; }
      else if (typeof v === 'number') {
        input = document.createElement('input'); input.type = 'range';
        const mag = Math.abs(v) || 1;
        input.min = v < 0 ? String(-mag * 4) : '0'; input.max = String(mag * 4 || 4);
        input.step = Number.isInteger(v) && mag >= 4 ? '1' : String(mag / 100);
        input.value = String(v);
      } else { input = document.createElement('input'); input.type = 'text'; input.value = v; input.size = Math.min(24, v.length + 2); }
      const out = document.createElement('output'); out.textContent = typeof v === 'boolean' ? '' : String(v);
      input.addEventListener('input', () => {
        const nv = typeof v === 'boolean' ? input.checked : typeof v === 'number' ? Number(input.value) : input.value;
        out.textContent = typeof v === 'number' ? String(nv) : '';
        onChange(k, nv);
      });
      wrap.appendChild(input); wrap.appendChild(out); container.appendChild(wrap);
    }
    return keys.length;
  }

  return { Ticker, keep, readTokens, toRgb, rgba, dprCap, sizeCanvas, demLoader, makeCtx, buildTweakRow, coarse };
})();
