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
    if (pixel) {   /* cap the AREA, not the width: a portrait phone would otherwise get 3.5x the pixels */
      const aspect = cssH / Math.max(1, cssW), area = pixel * pixel * 0.5625 * 1.5;
      bw = aspect > 0.5625 * 1.5 ? Math.max(1, Math.round(Math.sqrt(area / aspect))) : pixel;
      bh = Math.max(1, Math.round(bw * aspect)); canvas.dataset.pixel = '1';
    }
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
      /* keys: held keys a bay may read. The ride routes only keys it does not use itself
         (ArrowLeft, ArrowRight and single lowercase letters); Space arrives as pointer.down on holding bays. */
      keys: new Set(),
      /* readout(slug, text): a bay's one live line of real numbers, shown by the ride in the HUD while that
         bay is current, and by the parts harness under the canvas. Plain text only, never invented values. */
      readouts: {},
      readout(slug, text) { this.readouts[slug] = String(text || ''); if (this.onReadout) this.onReadout(slug); },
      /* overlayFor(canvas): an aria-hidden, pointer-transparent layer exactly over the bay's canvas, for
         decorative labels that track the scene (landmark tags). Anything a reader needs goes in the nameplate
         or the readout, never only here. Created on demand; removed with the room. */
      overlayFor(canvas) {
        const host = canvas.parentElement;
        let o = host.querySelector(':scope > .part-overlay');
        if (!o) {
          o = document.createElement('div'); o.className = 'part-overlay'; o.setAttribute('aria-hidden', 'true');
          o.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
          host.appendChild(o);
        }
        return o;
      },
    };
    return ctx;
  }

  /* ---------- PARAM controls: one coercion path for UI, configured URLs and exports ---------- */
  function paramRule(key, value, override) {
    if (typeof value !== 'number') return Object.assign({ maxLength: 512 }, override || {});
    const mag = Math.abs(value) || 1;
    return Object.assign({
      min: value < 0 ? -mag * 4 : 0,
      max: mag * 4 || 4,
      step: Number.isInteger(value) && mag >= 4 ? 1 : mag / 100,
    }, override || {});
  }
  function coerceParam(key, raw, fallback, override) {
    const rule = paramRule(key, fallback, override);
    if (typeof fallback === 'boolean') {
      if (raw === true || raw === 1 || raw === '1' || raw === 'true') return { value: true, accepted: true, adjusted: raw !== true };
      if (raw === false || raw === 0 || raw === '0' || raw === 'false') return { value: false, accepted: true, adjusted: raw !== false };
      return { value: fallback, accepted: false, adjusted: false };
    }
    if (typeof fallback === 'number') {
      if (typeof raw === 'string' && !raw.trim()) return { value: fallback, accepted: false, adjusted: false };
      let value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) return { value: fallback, accepted: false, adjusted: false };
      const before = value;
      if (Array.isArray(rule.values) && rule.values.length) {
        value = rule.values.reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best, rule.values[0]);
      } else {
        const min = Number.isFinite(rule.min) ? rule.min : -Number.MAX_VALUE;
        const max = Number.isFinite(rule.max) ? rule.max : Number.MAX_VALUE;
        value = Math.max(min, Math.min(max, value));
        if (Number.isFinite(rule.step) && rule.step > 0) {
          const base = Number.isFinite(rule.min) ? rule.min : 0;
          value = base + Math.round((value - base) / rule.step) * rule.step;
          value = Math.max(min, Math.min(max, value));
          value = Number(value.toPrecision(12));
        }
      }
      return { value, accepted: true, adjusted: value !== before };
    }
    if (typeof fallback === 'string') {
      if (typeof raw !== 'string') return { value: fallback, accepted: false, adjusted: false };
      const clean = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
      const value = clean.slice(0, Math.max(1, rule.maxLength || 512));
      return { value, accepted: true, adjusted: value !== raw };
    }
    return { value: fallback, accepted: false, adjusted: false };
  }

  /* ---------- the tweak row: PARAMS -> inputs; the harness and ?dev=1 share it ---------- */
  function buildTweakRow(container, params, onChange, options) {
    options = options || {};
    const defaults = options.defaults || params, rules = options.rules || {};
    container.textContent = '';
    const keys = Object.keys(params).filter((k) => ['number', 'boolean', 'string'].includes(typeof params[k]));
    for (const k of keys) {
      const v = params[k], base = defaults[k], rule = paramRule(k, base, rules[k]);
      const wrap = document.createElement('label'); wrap.className = 'tweak';
      const name = document.createElement('span'); name.textContent = k; wrap.appendChild(name);
      let input;
      if (typeof v === 'boolean') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = v; }
      else if (typeof v === 'number') {
        if (Array.isArray(rule.values) && rule.values.length) {
          input = document.createElement('select');
          for (const n of rule.values) { const o = document.createElement('option'); o.value = String(n); o.textContent = String(n); input.appendChild(o); }
        } else {
          input = document.createElement('input'); input.type = 'range';
          input.min = String(rule.min); input.max = String(rule.max); input.step = String(rule.step);
        }
        input.value = String(v);
      } else { input = document.createElement('input'); input.type = 'text'; input.value = v; input.size = Math.min(24, v.length + 2); }
      input.name = 'p.' + k; input.dataset.param = k;
      const out = document.createElement('output'); out.textContent = typeof v === 'boolean' ? '' : String(v);
      input.addEventListener(typeof v === 'string' ? 'change' : 'input', () => {
        const raw = typeof v === 'boolean' ? input.checked : input.value;
        const result = coerceParam(k, raw, base, rules[k]);
        if (!result.accepted) return;
        if (typeof v === 'number' && String(result.value) !== input.value) input.value = String(result.value);
        out.textContent = typeof v === 'boolean' ? '' : String(result.value);
        onChange(k, result.value, result);
      });
      wrap.appendChild(input); wrap.appendChild(out); container.appendChild(wrap);
    }
    return keys.length;
  }

  return { Ticker, keep, readTokens, toRgb, rgba, dprCap, sizeCanvas, demLoader, makeCtx, paramRule, coerceParam, buildTweakRow, coarse };
})();
