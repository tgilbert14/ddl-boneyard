/* BONEYARD PART · 02 · GATE
 * technique   slit-scan corridor: two planes (floor and ceiling) receding to the shared vanishing point, cut into
 *             lanes that run along the line of flight; every texel samples a 1-D strip of artwork at an index
 *             that slides with the dolly, so colour rushes down each lane toward the viewer
 * lineage     Douglas Trumbull's slit-scan for 2001: A Space Odyssey (1968), itself after John Whitney's slit-scan
 *             experiments (1950s and 1960s); the polar variant is the stargate
 * original    the "artwork" is ONE column of Tim Gilbert's own 2025-03-01 Sonoran sunset photograph, resampled to
 *             1 x 1024 (assets/sunset-strip.png, provenance in sunset-strip.json); the photo itself never ships.
 *             Scroll past the hold sets the dolly speed, the pointer shoves the lanes, and every lane keeps its
 *             own phase and pace, so the corridor is the one real sky smeared into many moments
 * not         a film recreation, a video, a photo. No hue is invented: every lit texel is a strip colour times fog.
 * deps        none · Canvas 2D ImageData · 2026-09
 * budget      1.1 to 1.5 ms/frame @ 320x200 internal (pixel 320), headless desktop Chromium, parts page counter
 *             (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The camera sits between two infinite planes, one below and one above the eye. A screen row at distance dy from
 * the vanishing point lies on a plane at depth z = f * height / |dy|, and a pixel on that row sits at lateral
 * position u = (x - vpX) * z / f. The planes are cut into lanes of constant u, so every lane is a ray to the
 * vanishing point. Each lane has a start offset, a pace and a brightness drawn once from a seeded hash, and its
 * texel colour is the strip sampled at offset + (z + dolly * pace) * stripPerUnit, mirrored so the strip never
 * seams. As the dolly advances, colour travels down every lane toward you: that is the slit-scan smear.
 *
 * Depth fog fades each row toward the field colour; where a lane gets narrower than about two pixels the row
 * blends toward the strip's mean colour instead of aliasing. Dolly speed eases toward cruise times a gain on
 * how far past the hold you have scrolled; Calm halves it and drops the pointer shove. The still is the dolly
 * frozen mid-corridor.
 */
(() => {
  'use strict';
  const PARAMS = {
    cruise: 5,           /* world units per second at the hold */
    scrollGain: 9,       /* extra speed factor per bay length scrolled past the hold (progress 0..0.3) */
    settle: 0.45,        /* seconds to ease toward the target speed */
    lanes: 5,            /* lanes per world unit */
    lanePool: 64,        /* distinct lane personalities before the pattern repeats (rounded to a power of two) */
    stripPerUnit: 44,    /* strip texels per world unit of depth: the length of a colour run down a lane */
    paceSpread: 0.35,    /* lane pace varies by +- this fraction */
    floorH: 1, ceilH: 1.15,
    focalK: 0.62,        /* focal length as a fraction of internal width */
    fog: 20,             /* depth (world units) where fog reaches about 63% */
    gain: 1.45,          /* exposure on the strip colours */
    sat: 1.3,            /* saturation lift about each texel's own luma (1 = the photo's own) */
    edge: 0.78,          /* lane edge darkening: 0 flat, 1 black seams */
    shove: 0.9,          /* lateral world units of shove at the pointer's edge */
    stillDolly: 23.5,
  };
  /* one small seeded hash, so the lane personalities are the same on every visit */
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function assetUrl(name) { return new URL((location.pathname.includes('/parts/') ? '../assets/' : 'assets/') + name, document.baseURI).href; }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: false });
    let w = canvas.width, h = canvas.height, img = null, buf = null;
    let raw = null, mips = [], meanR = 0, meanG = 0, meanB = 0, ready = false, dead = false;
    let dolly = params.stillDolly, speed = params.cruise, shove = 0;
    let laneOff, lanePace, laneLit;
    const edgeLut = new Float32Array(64);

    function lanesFrom(p) {
      const r = rng(20250301), n = 1 << Math.max(2, Math.min(10, Math.round(Math.log2(Math.max(4, p.lanePool)))));
      laneOff = new Float32Array(n); lanePace = new Float32Array(n); laneLit = new Float32Array(n);
      for (let i = 0; i < n; i++) { laneOff[i] = r() * 2048; lanePace[i] = 1 + (r() * 2 - 1) * p.paceSpread; laneLit[i] = 0.55 + 0.45 * r(); }
      for (let i = 0; i < 64; i++) { const s = Math.sin(Math.PI * (i + 0.5) / 64); edgeLut[i] = 1 - p.edge + p.edge * Math.pow(s, 0.6); }
    }
    lanesFrom(params);

    /* the strip: 1 x 1024 RGB, read once into three float arrays of 2048 (mirrored, so index wraps seamlessly) */
    const pic = new Image();
    pic.decoding = 'async';
    pic.onload = () => {
      if (dead) return;
      const c = document.createElement('canvas'); c.width = 1; c.height = pic.naturalHeight || 1024;
      const cg = c.getContext('2d', { willReadFrequently: true }); cg.drawImage(pic, 0, 0);
      const d = cg.getImageData(0, 0, 1, c.height).data, n = c.height;
      raw = new Float32Array(2048 * 3);
      for (let i = 0; i < 2048; i++) {
        const k = i < 1024 ? i : 2047 - i, s = Math.min(n - 1, Math.floor(k * n / 1024)) * 4;
        raw[i * 3] = d[s]; raw[i * 3 + 1] = d[s + 1]; raw[i * 3 + 2] = d[s + 2];
      }
      meanR = meanG = meanB = 0;
      for (let i = 0; i < 1024; i++) { meanR += raw[i * 3]; meanG += raw[i * 3 + 1]; meanB += raw[i * 3 + 2]; }
      meanR /= 1024; meanG /= 1024; meanB /= 1024;
      buildMips();
      ready = true;
      if (ctx.dial === 'still' || !lastTick) { draw(); ctx.readout('gate', 'strip 2025-03-01 sunset · still'); }
    };
    pic.src = assetUrl('sunset-strip.png');
    let lastTick = 0;

    /* mip levels of the mirrored strip: level L is a circular box blur 2^L texels wide, with the saturation lift
       baked in. A row whose depth step covers many strip texels samples a blurred level instead of aliasing. */
    function buildMips() {
      if (!raw) return;
      mips = [];
      const sat = params.sat;
      for (let L = 0; L <= 9; L++) {
        const wdt = 1 << L, m = new Float32Array(2048 * 3);
        for (let i = 0; i < 2048; i++) {
          let r = 0, gg = 0, b = 0;
          for (let j = 0; j < wdt; j++) { const q = ((i - (wdt >> 1) + j) & 2047) * 3; r += raw[q]; gg += raw[q + 1]; b += raw[q + 2]; }
          r /= wdt; gg /= wdt; b /= wdt;
          const y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
          m[i * 3] = Math.max(0, y + (r - y) * sat); m[i * 3 + 1] = Math.max(0, y + (gg - y) * sat); m[i * 3 + 2] = Math.max(0, y + (b - y) * sat);
        }
        mips.push(m);
      }
    }
    function alloc() {
      img = g.createImageData(w, h);
      buf = new Uint32Array(img.data.buffer);
    }
    alloc();

    function draw() {
      const [fr, fg, fb] = BONEYARD.toRgb(ctx.tokens.field);
      const field = (255 << 24) | (fb << 16) | (fg << 8) | fr;
      if (!ready || !mips.length) { buf.fill(field); g.putImageData(img, 0, 0); return; }
      const f = w * params.focalK, vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      const nl = laneOff.length, mask = nl - 1, K = params.lanes, spu = params.stripPerUnit, fogZ = Math.max(0.5, params.fog), gn = params.gain;
      const off = laneOff, pace = lanePace, lit = laneLit, E = edgeLut;
      for (let y = 0; y < h; y++) {
        const dy = y + 0.5 - vpY, row = y * w;
        const below = dy > 0, ady = Math.abs(dy);
        const z = f * (below ? params.floorH : params.ceilH) / Math.max(0.35, ady);
        const fog = Math.exp(-z / fogZ) * gn;
        const lanePx = f / (z * K);                                  /* on-screen lane width at this row */
        const sharp = Math.max(0, Math.min(1, (lanePx - 2.5) / 3.5));
        const ew = Math.max(0, Math.min(1, (lanePx - 4) / 6));        /* lane seams only where a lane is wide enough to hold one */
        const mix = 1 - sharp;
        const mr = meanR * 0.62 * fog * mix, mg = meanG * 0.62 * fog * mix, mb = meanB * 0.62 * fog * mix;
        const kf = sharp * fog;
        if (kf < 0.004 && mr < 1 && mg < 1 && mb < 1) { buf.fill(field, row, row + w); continue; }
        const du = z / f * K, zs = z * spu + 2048 * 64, ds = dolly * spu;
        const step = spu * z / Math.max(0.35, ady) * 1.5;           /* strip texels crossed between this row and the next */
        const S = mips[Math.max(0, Math.min(9, Math.ceil(Math.log2(Math.max(1, step)))))];
        const laneBias = below ? 0 : nl >> 1;                       /* the ceiling gets a different set of lanes */
        let lu = (0.5 - vpX) * du + shove * K;
        for (let x = 0; x < w; x++, lu += du) {
          const lf = Math.floor(lu), fr2 = lu - lf;
          const li = (lf + laneBias) & mask;
          const s = ((off[li] + zs + ds * pace[li]) & 2047) * 3, a = kf * lit[li] * (1 - ew + ew * E[(fr2 * 64) | 0]);
          let r = S[s] * a + mr + fr, gg = S[s + 1] * a + mg + fg, b = S[s + 2] * a + mb + fb;
          r = r > 255 ? 255 : r; gg = gg > 255 ? 255 : gg; b = b > 255 ? 255 : b;
          buf[row + x] = (255 << 24) | ((b | 0) << 16) | ((gg | 0) << 8) | (r | 0);
        }
      }
      g.putImageData(img, 0, 0);
    }

    function stripLine() { return 'strip 2025-03-01 sunset · dolly ' + (speed / params.cruise).toFixed(1) + 'x'; }

    return {
      tick(dt, t, progress, pointer) {
        lastTick = t || 1e-3;
        const calm = ctx.dial === 'calm';
        const past = Math.max(0, Math.min(0.3, progress || 0));
        const target = params.cruise * (1 + params.scrollGain * past) * (calm ? 0.5 : 1);
        speed += (target - speed) * (1 - Math.exp(-dt / Math.max(0.02, params.settle)));
        dolly += speed * dt;
        if (dolly > 4096) dolly -= 4096;          /* keeps the strip index small and exact; the pattern repeats long before that */
        const p = pointer || ctx.pointer;
        const want = !calm && p && p.present && !p.coarse ? (p.nx - 0.5) * 2 * params.shove : 0;
        shove += (want - shove) * (1 - Math.exp(-dt / 0.25));
        draw();
        if (ready) ctx.readout('gate', stripLine());
      },
      resize(nw, nh) { w = nw; h = nh; alloc(); },
      still() { dolly = params.stillDolly; shove = 0; speed = params.cruise; draw(); if (ready) ctx.readout('gate', 'strip 2025-03-01 sunset · still'); },
      destroy() { dead = true; pic.onload = null; img = null; buf = null; raw = null; mips = []; },
      params(p) { params = p; lanesFrom(p); buildMips(); },
    };
  }
  BAYS.push({ slug: 'gate', title: 'Gate', order: 2, role: 'bay', params: PARAMS, mount, pixel: 320 });
})();
