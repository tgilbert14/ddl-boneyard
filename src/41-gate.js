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
 * not         a film recreation, a video, a photo. No hue is invented: every lit texel is a strip colour, fogged toward
 *             a core mixed from the strip's own brightest tones and the tube's phosphor core.
 * deps        none · Canvas 2D ImageData · 2026-09
 * budget      1.2 to 2.0 ms/frame @ 320x200 internal (pixel 320), headless desktop Chromium, parts page counter
 *             (2026-09-30); 390x844 at 4x CPU: 8.0 ms JS, part page holds 60 fps; JS time only, not a real-GPU frame
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
 * Depth fog does not fade to black: it fades each row toward a hot band, the saturated brightest quarter of the
 * strip, which turns white-hot near the vanishing point (a core mixed from the strip's top 3% by brightness and
 * the phosphor core). Two separable Gaussians centred on the vanishing point shape it: a tight one for the core,
 * a wide one for the bloom that spills over the nearest lanes. Where a lane gets narrower than about two pixels
 * the row blends toward the strip's mean colour instead of aliasing. Dolly speed eases toward cruise times a
 * gain on how far past the hold you have scrolled; Calm halves it, drops the pointer shove and the core's slow
 * breathing. The still is the dolly frozen mid-corridor, core lit.
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
    gain: 1.5,           /* exposure on the strip colours */
    sat: 2.0,            /* saturation lift about each texel's own luma (1 = the photo's own) */
    edge: 0.85,          /* lane edge darkening: 0 flat, 1 black seams */
    shove: 0.9,          /* lateral world units of shove at the pointer's edge */
    haze: 1.05,          /* brightness of the fog band the corridor fades into */
    coreW: 0.11, coreH: 0.05,   /* the white-hot core: Gaussian sigma as a share of width and height */
    bloomW: 0.26, bloomH: 0.14, /* the bloom: a wider Gaussian added over the lanes */
    bloom: 0.32,
    stillDolly: 23.5,
  };
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
    let dolly = params.stillDolly, speed = params.cruise, shove = 0;
    let laneOff, lanePace, laneLit;
    const edgeLut = new Float32Array(64);
    let hotR = 255, hotG = 240, hotB = 220, bandR = 255, bandG = 140, bandB = 90, breath = 1;
    let gxT = null, gxW = null;

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
      const y = 0.2126 * r + 0.7152 * gg + 0.0722 * b, sat = params.sat * 1.2;
      r = Math.max(0, y + (r - y) * sat); gg = Math.max(0, y + (gg - y) * sat); b = Math.max(0, y + (b - y) * sat);
      m = Math.max(r, gg, b, 1); bandR = r * 235 / m; bandG = gg * 235 / m; bandB = b * 235 / m;
    }
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
      gxT = new Float32Array(w); gxW = new Float32Array(w);
    }
    alloc();

    function draw() {
      const [fr, fg, fb] = BONEYARD.toRgb(ctx.tokens.field);
      const field = (255 << 24) | (fb << 16) | (fg << 8) | fr;
      if (!ready || !mips.length) { buf.fill(field); g.putImageData(img, 0, 0); return; }
      const f = w * params.focalK, vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      const nl = laneOff.length, mask = nl - 1, K = params.lanes, spu = params.stripPerUnit, fogZ = Math.max(0.5, params.fog), gn = params.gain;
      const off = laneOff, pace = lanePace, lit = laneLit, E = edgeLut;
      /* separable Gaussians about the vanishing point: x factors once per frame, y factors once per row */
      const sxT = Math.max(1, params.coreW * w), sxW = Math.max(1, params.bloomW * w);
      for (let x = 0; x < w; x++) { const d = x + 0.5 - vpX; gxT[x] = Math.exp(-(d * d) / (2 * sxT * sxT)); gxW[x] = Math.exp(-(d * d) / (2 * sxW * sxW)); }
      const syT = Math.max(1, params.coreH * h), syW = Math.max(1, params.bloomH * h);
      const hz = params.haze, bl = params.bloom * breath;
      const cR = hotR - bandR, cG = hotG - bandG, cB = hotB - bandB;
      for (let y = 0; y < h; y++) {
        const dy = y + 0.5 - vpY, row = y * w;
        const below = dy > 0, ady = Math.abs(dy);
        const z = f * (below ? params.floorH : params.ceilH) / Math.max(0.35, ady);
        const vis = Math.exp(-z / fogZ), fog = vis * gn, haze = (1 - vis) * hz;
        const gyT = Math.exp(-(dy * dy) / (2 * syT * syT)) * breath, gyW = Math.exp(-(dy * dy) / (2 * syW * syW)) * bl;
        const lanePx = f / (z * K);                                  /* on-screen lane width at this row */
        const sharp = Math.max(0, Math.min(1, (lanePx - 2.5) / 3.5));
        const ew = Math.max(0, Math.min(1, (lanePx - 4) / 6));        /* lane seams only where a lane is wide enough to hold one */
        const mix = 1 - sharp;
        const mr = meanR * 0.62 * fog * mix + fr, mg = meanG * 0.62 * fog * mix + fg, mb = meanB * 0.62 * fog * mix + fb;
        const kf = sharp * fog;
        const du = z / f * K, zs = z * spu + 2048 * 64, ds = dolly * spu;
        const step = spu * z / Math.max(0.35, ady) * 1.5;           /* strip texels crossed between this row and the next */
        const S = mips[Math.max(0, Math.min(9, Math.ceil(Math.log2(Math.max(1, step)))))];
        const laneBias = below ? 0 : nl >> 1;                       /* the ceiling gets a different set of lanes */
        let lu = (0.5 - vpX) * du + shove * K;
        for (let x = 0; x < w; x++, lu += du) {
          const lf = Math.floor(lu), fr2 = lu - lf;
          const li = (lf + laneBias) & mask;
          const s = ((off[li] + zs + ds * pace[li]) & 2047) * 3, a = kf * lit[li] * (1 - ew + ew * E[(fr2 * 64) | 0]);
          /* the fog colour: band at the sides, white-hot core at the vanishing point; then the bloom on top */
          const kc = gxT[x] * gyT, kb = gxW[x] * gyW, hs = haze * (0.3 + 0.7 * gxW[x]);
          let r = S[s] * a + mr + (bandR + cR * kc) * hs + hotR * kb;
          let gg = S[s + 1] * a + mg + (bandG + cG * kc) * hs + hotG * kb;
          let b = S[s + 2] * a + mb + (bandB + cB * kc) * hs + hotB * kb;
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
        breath = calm ? 1 : 1 + 0.07 * Math.sin((t || 0) * 1.2);    /* about 0.19 Hz: a slow swell, never a flash */
        draw();
        if (ready) ctx.readout('gate', stripLine());
      },
      resize(nw, nh) { w = nw; h = nh; alloc(); },
      still() { dolly = params.stillDolly; shove = 0; speed = params.cruise; breath = 1; draw(); if (ready) ctx.readout('gate', 'strip 2025-03-01 sunset · still'); },
      destroy() { dead = true; pic.onload = null; pic.onerror = null; img = null; buf = null; raw = null; mips = []; },
      params(p) { params = p; lanesFrom(p); if (raw) heat(); buildMips(); if (ctx.dial === 'still' || !lastTick) draw(); },
    };
  }
  BAYS.push({ slug: 'gate', title: 'Gate', order: 2, role: 'bay', params: PARAMS, mount, pixel: 320 });
})();
