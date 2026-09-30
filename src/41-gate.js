/* BONEYARD PART · 02 · GATE
 * technique   authored slit-scan corridor: sunset-sampled floor and ceiling lanes, structural depth ribs, grouped
 *             wall panels and a dark central aperture, all converging on the shared vanishing point
 * lineage     Douglas Trumbull's slit-scan for 2001: A Space Odyssey (1968), itself after John Whitney's slit-scan
 *             experiments (1950s and 1960s); the polar variant is the stargate
 * original    the "artwork" is ONE column of Tim Gilbert's own 2025-03-01 Sonoran sunset photograph, resampled to
 *             1 x 1024 (assets/sunset-strip.png, provenance in sunset-strip.json); the photo itself never ships.
 *             Scroll past the hold sets the dolly speed, the pointer shoves the lanes, and deterministic panel groups
 *             turn the one real sky into floor, ceiling and side architecture around a readable center
 * not         a film recreation, a video, a photo. No hue is invented: every lit texel, rim and haze comes from the
 *             strip or the supplied tube tokens, with a soft shoulder that preserves sunset colour instead of clipping white.
 * deps        none · Canvas 2D ImageData · 2026-09
 * budget      2.20 ms/frame @ 320x260 internal desktop; 2.25 @ 277x312 portrait, Local Chromium 149, parts average
 *             under 4x CPU slowdown (2026-09-30); JS work only, not a real-GPU frame
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
 * Depth fog fades toward a saturated band computed from the strip. A tight separable Gaussian cuts a dark aperture
 * at the vanishing point while the difference between tight and broad Gaussians draws its coloured rim. Repeating
 * world-depth ribs cross floor and ceiling, and every fourth lane is a dimmer structural panel, so the planes read as
 * built surfaces rather than one radial fan. A soft highlight shoulder keeps the hottest source colours distinct.
 * Where lanes get narrower than about two pixels the row blends toward the strip mean instead of aliasing. Calm halves
 * dolly speed, removes pointer shove and breathing, and reduces the rim. The still freezes an authored mid-corridor view.
 */
(() => {
  'use strict';
  const PARAMS = {
    cruise: 9,           /* world units per second at the hold */
    scrollGain: 12,      /* extra speed factor per bay length scrolled past the hold (progress 0..0.3) */
    settle: 0.45,        /* seconds to ease toward the target speed */
    lanes: 5,            /* lanes per world unit */
    lanePool: 64,        /* distinct lane personalities before the pattern repeats (rounded to a power of two) */
    stripPerUnit: 44,    /* strip texels per world unit of depth: the length of a colour run down a lane */
    paceSpread: 0.35,    /* lane pace varies by +- this fraction */
    floorH: 1, ceilH: 1.15,
    focalK: 0.62,        /* focal length as a fraction of internal width */
    fog: 20,             /* depth (world units) where fog reaches about 63% */
    gain: 1.28,          /* exposure on the strip colours */
    sat: 1.72,           /* saturation lift about each texel's own luma (1 = the photo's own) */
    edge: 0.78,          /* lane edge darkening: 0 flat, 1 black seams */
    shove: 0.9,          /* lateral world units of shove at the pointer's edge */
    haze: 0.38,          /* brightness of the distant sunset band */
    coreW: 0.05, coreH: 0.012,  /* the dark eye: Gaussian sigma as a share of width and height */
    bloomW: 0.22, bloomH: 0.065, /* the coloured rim around the eye */
    bloom: 0.2,
    eyeDark: 0.9,
    rim: 0.54,
    ribSpacing: 1.65, ribWidth: 0.075, ribShade: 0.58,
    sideShade: 0.28,
    toneKnee: 214,
    stillDolly: 23.5,
  };
  const clamp = (x, a, b, fallback) => Number.isFinite(Number(x)) ? Math.max(a, Math.min(b, Number(x))) : fallback;
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return u * u * (3 - 2 * u); };
  const modPositive = (x, n) => ((x % n) + n) % n;
  /* one small seeded hash, so the lane personalities are the same on every visit */
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* asset bases in order: the harness passes ctx.assetBases; otherwise try both, likelier first, and fall back on error */
  function assetUrls(ctx, name) {
    const bases = (ctx.assetBases && ctx.assetBases.length) ? ctx.assetBases.slice()
      : (location.pathname.includes('/parts/') ? ['../assets/', 'assets/'] : ['assets/', '../assets/']);
    return bases.map((b) => new URL(b + name, document.baseURI).href);
  }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: false });
    let w = canvas.width, h = canvas.height, img = null, buf = null;
    let raw = null, mips = [], meanR = 0, meanG = 0, meanB = 0, ready = false, dead = false;
    let dolly = clamp(params.stillDolly, -4096, 4096, 23.5), speed = clamp(params.cruise, 0, 100, 9), shove = 0;
    let laneOff, lanePace, laneLit;
    const edgeLut = new Float32Array(64);
    let hotR = 255, hotG = 240, hotB = 220, bandR = 255, bandG = 140, bandB = 90, breath = 1;
    let gxT = null, gxW = null;

    function lanesFrom(p) {
      const r = rng(20250301), pool = clamp(p.lanePool, 4, 1024, 64);
      const n = 1 << Math.max(2, Math.min(10, Math.round(Math.log2(pool))));
      laneOff = new Float32Array(n); lanePace = new Float32Array(n); laneLit = new Float32Array(n);
      const spread = clamp(p.paceSpread, 0, 0.95, 0.35), edge = clamp(p.edge, 0, 1, 0.78);
      for (let i = 0; i < n; i++) { laneOff[i] = r() * 2048; lanePace[i] = 1 + (r() * 2 - 1) * spread; laneLit[i] = 0.55 + 0.45 * r(); }
      for (let i = 0; i < 64; i++) { const s = Math.sin(Math.PI * (i + 0.5) / 64); edgeLut[i] = 1 - edge + edge * Math.pow(s, 0.6); }
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
      heat();
      buildMips();
      ready = true;
      if (ctx.dial === 'still' || !lastTick) { draw(); ctx.readout('gate', 'strip 2025-03-01 sunset · still'); }
    };
    const urls = assetUrls(ctx, 'sunset-strip.png');
    let tryAt = 0;
    pic.onerror = () => { if (!dead && ++tryAt < urls.length) pic.src = urls[tryAt]; };
    pic.src = urls[0];

    /* the hot colours, both from the strip: the band is the brightest quarter weighted toward saturation, the core
       is the top 3% by brightness mixed half and half with the phosphor core, then scaled up to white-hot */
    function heat() {
      const idx = [];
      for (let i = 0; i < 1024; i++) idx.push(i);
      const lum = (i) => 0.2126 * raw[i * 3] + 0.7152 * raw[i * 3 + 1] + 0.0722 * raw[i * 3 + 2];
      idx.sort((a, b) => lum(b) - lum(a));
      let r = 0, gg = 0, b = 0;
      const n = Math.max(1, Math.round(1024 * 0.03));
      for (let k = 0; k < n; k++) { const q = idx[k] * 3; r += raw[q]; gg += raw[q + 1]; b += raw[q + 2]; }
      const [pr, pg, pb] = BONEYARD.toRgb(ctx.tokens.phosphorCore);
      r = 0.5 * r / n + 0.5 * pr; gg = 0.5 * gg / n + 0.5 * pg; b = 0.5 * b / n + 0.5 * pb;
      let m = Math.max(r, gg, b, 1); hotR = r * 255 / m; hotG = gg * 255 / m; hotB = b * 255 / m;
      r = gg = b = 0; let wsum = 0;
      for (let k = 0; k < 256; k++) {
        const q = idx[k] * 3, R = raw[q], G = raw[q + 1], B = raw[q + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const wt = Math.pow((mx - mn) / Math.max(1, mx), 2) + 1e-3; r += R * wt; gg += G * wt; b += B * wt; wsum += wt;
      }
      r /= wsum; gg /= wsum; b /= wsum;
      const y = 0.2126 * r + 0.7152 * gg + 0.0722 * b, sat = clamp(params.sat, 0, 4, 1.72) * 1.12;
      r = Math.max(0, y + (r - y) * sat); gg = Math.max(0, y + (gg - y) * sat); b = Math.max(0, y + (b - y) * sat);
      m = Math.max(r, gg, b, 1); bandR = r * 235 / m; bandG = gg * 235 / m; bandB = b * 235 / m;
    }
    let lastTick = 0;

    /* mip levels of the mirrored strip: level L is a circular box blur 2^L texels wide, with the saturation lift
       baked in. A row whose depth step covers many strip texels samples a blurred level instead of aliasing. */
    function buildMips() {
      if (!raw) return;
      mips = [];
      const sat = clamp(params.sat, 0, 4, 1.72);
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
      gxT = new Float32Array(w); gxW = new Float32Array(w);
    }
    alloc();

    function draw() {
      const [fr, fg, fb] = BONEYARD.toRgb(ctx.tokens.field);
      const field = (255 << 24) | (fb << 16) | (fg << 8) | fr;
      if (!ready || !mips.length) { buf.fill(field); g.putImageData(img, 0, 0); return; }
      const f = w * clamp(params.focalK, 0.12, 2, 0.62), vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      const nl = laneOff.length, mask = nl - 1, K = clamp(params.lanes, 0.25, 40, 5);
      const spu = clamp(params.stripPerUnit, 0.1, 300, 44), fogZ = clamp(params.fog, 0.5, 200, 20), gn = clamp(params.gain, 0, 5, 1.28);
      const off = laneOff, pace = lanePace, lit = laneLit, E = edgeLut;
      /* Two separable Gaussians: the tight one cuts the eye; their difference lights the coloured rim. */
      const sxT = Math.max(1, clamp(params.coreW, 0.004, 0.5, 0.05) * w), sxW = Math.max(1, clamp(params.bloomW, 0.01, 1, 0.22) * w);
      for (let x = 0; x < w; x++) { const d = x + 0.5 - vpX; gxT[x] = Math.exp(-(d * d) / (2 * sxT * sxT)); gxW[x] = Math.exp(-(d * d) / (2 * sxW * sxW)); }
      const syT = Math.max(1, clamp(params.coreH, 0.003, 0.5, 0.012) * h), syW = Math.max(1, clamp(params.bloomH, 0.006, 1, 0.065) * h);
      const hz = clamp(params.haze, 0, 3, 0.38), bl = clamp(params.bloom, 0, 2, 0.2) * breath;
      const eyeDark = clamp(params.eyeDark, 0, 1, 0.9), rimGain = clamp(params.rim, 0, 2, 0.54);
      const ribSpacing = clamp(params.ribSpacing, 0.12, 20, 1.65), ribWidth = clamp(params.ribWidth, 0.005, 0.45, 0.075);
      const ribShade = clamp(params.ribShade, 0, 1, 0.58), sideShade = clamp(params.sideShade, 0, 0.9, 0.28);
      const knee = clamp(params.toneKnee, 96, 248, 214), shoulder = 255 - knee;
      for (let y = 0; y < h; y++) {
        const dy = y + 0.5 - vpY, row = y * w;
        const below = dy > 0, ady = Math.abs(dy);
        const planeH = below ? clamp(params.floorH, 0.1, 8, 1) : clamp(params.ceilH, 0.1, 8, 1.15);
        const z = f * planeH / Math.max(0.35, ady), vis = Math.exp(-z / fogZ), fog = vis * gn, haze = (1 - vis) * hz;
        const gyT = Math.exp(-(dy * dy) / (2 * syT * syT)) * breath, gyW = Math.exp(-(dy * dy) / (2 * syW * syW)) * bl;
        const lanePx = f / (z * K);                                  /* on-screen lane width at this row */
        const sharp = Math.max(0, Math.min(1, (lanePx - 2.5) / 3.5));
        const ew = Math.max(0, Math.min(1, (lanePx - 4) / 6));        /* lane seams only where a lane is wide enough to hold one */
        const mix = 1 - sharp;
        const mr = meanR * 0.28 * fog * mix + fr, mg = meanG * 0.28 * fog * mix + fg, mb = meanB * 0.28 * fog * mix + fb;
        const rp = modPositive((z + dolly * (below ? 0.34 : 0.26)) / ribSpacing, 1);
        const rd = Math.min(rp, 1 - rp), rib = 1 - smooth(0, ribWidth, rd);
        const planeShade = (below ? 1 : 0.74) * (1 - rib * ribShade);
        const kf = sharp * fog * planeShade;
        const du = z / f * K, zs = z * spu + 2048 * 64, ds = dolly * spu;
        const step = spu * z / Math.max(0.35, ady) * 1.5;           /* strip texels crossed between this row and the next */
        const S = mips[Math.max(0, Math.min(9, Math.ceil(Math.log2(Math.max(1, step)))))];
        const laneBias = below ? 0 : nl >> 1;                       /* the ceiling gets a different set of lanes */
        let lu = (0.5 - vpX) * du + shove * K;
        for (let x = 0; x < w; x++, lu += du) {
          const lf = Math.floor(lu), fr2 = lu - lf;
          const li = (lf + laneBias) & mask;
          const s = ((off[li] + zs + ds * pace[li]) & 2047) * 3;
          const nx = Math.abs(x + 0.5 - vpX) / Math.max(1, w * 0.5), side = 1 - sideShade * smooth(0.34, 1, nx);
          const group = ((lf & 3) === 0 ? 0.68 : 1) * ((li & 7) === 3 ? 0.82 : 1);
          const a = kf * side * group * lit[li] * (1 - ew + ew * E[(fr2 * 64) | 0]);
          const eye = Math.min(1, gxT[x] * gyT), broad = Math.min(1, gxW[x] * gyW / Math.max(0.2, bl));
          const rim = Math.max(0, broad - eye * 0.72), dark = 1 - eye * eyeDark;
          const hs = haze * (0.08 + 0.3 * broad), rl = rim * rimGain * (0.82 + 0.18 * breath);
          let r = (S[s] * a + mr + bandR * hs + (bandR * 0.76 + hotR * 0.24) * rl) * dark;
          let gg = (S[s + 1] * a + mg + bandG * hs + (bandG * 0.76 + hotG * 0.24) * rl) * dark;
          let b = (S[s + 2] * a + mb + bandB * hs + (bandB * 0.76 + hotB * 0.24) * rl) * dark;
          if (r > knee) r = knee + shoulder * (r - knee) / (r - knee + shoulder);
          if (gg > knee) gg = knee + shoulder * (gg - knee) / (gg - knee + shoulder);
          if (b > knee) b = knee + shoulder * (b - knee) / (b - knee + shoulder);
          r = r < 0 ? 0 : r; gg = gg < 0 ? 0 : gg; b = b < 0 ? 0 : b;
          buf[row + x] = (255 << 24) | ((b | 0) << 16) | ((gg | 0) << 8) | (r | 0);
        }
      }
      g.putImageData(img, 0, 0);
    }

    function stripLine() { return 'strip 2025-03-01 sunset · dolly ' + (speed / clamp(params.cruise, 0.1, 100, 9)).toFixed(1) + 'x'; }

    return {
      tick(dt, t, progress, pointer) {
        dt = clamp(dt, 0, 0.05, 0.016);
        lastTick = t || 1e-3;
        const calm = ctx.dial === 'calm';
        const past = clamp(progress, 0, 0.3, 0), cruise = clamp(params.cruise, 0, 100, 9);
        const target = cruise * (1 + clamp(params.scrollGain, 0, 60, 12) * past) * (calm ? 0.5 : 1);
        speed += (target - speed) * (1 - Math.exp(-dt / clamp(params.settle, 0.02, 6, 0.45)));
        dolly += speed * dt;
        if (dolly > 4096) dolly -= 4096;          /* keeps the strip index small and exact; the pattern repeats long before that */
        const p = pointer || ctx.pointer;
        const want = !calm && p && p.present && !p.coarse ? (clamp(p.nx, 0, 1, 0.5) - 0.5) * 2 * clamp(params.shove, 0, 8, 0.9) : 0;
        shove += (want - shove) * (1 - Math.exp(-dt / 0.25));
        breath = calm ? 1 : 1 + 0.07 * Math.sin((t || 0) * 1.2);    /* about 0.19 Hz: a slow swell, never a flash */
        draw();
        if (ready) ctx.readout('gate', stripLine());
      },
      resize(nw, nh) { w = Math.max(1, Math.round(nw)); h = Math.max(1, Math.round(nh)); alloc(); },
      still() { dolly = clamp(params.stillDolly, -4096, 4096, 23.5); shove = 0; speed = clamp(params.cruise, 0, 100, 9); breath = 1; draw(); if (ready) ctx.readout('gate', 'strip 2025-03-01 sunset · still'); },
      destroy() { dead = true; pic.onload = null; pic.onerror = null; img = null; buf = null; raw = null; mips = []; },
      params(p) { params = p; lanesFrom(p); if (raw) heat(); buildMips(); if (ctx.dial === 'still' || !lastTick) draw(); },
    };
  }
  BAYS.push({ slug: 'gate', title: 'Gate', order: 2, role: 'bay', params: PARAMS, mount, pixel: 320 });
})();
