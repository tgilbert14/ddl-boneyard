/* BONEYARD PART · 02 · GATE
 * technique   a high-resolution segmented reactor gate around a bounded low-resolution slit-scan energy texture,
 *             with beveled metal, deep aperture walls, mechanical clamps and a scroll-lit industrial hangar
 * lineage     Douglas Trumbull's slit-scan for 2001: A Space Odyssey (1968), after John Whitney's slit-scan
 *             experiments (1950s and 1960s); vector arcade display hardware and practical miniature lighting
 * original    the living aperture samples ONE column of Tim Gilbert's own 2025-03-01 Sonoran sunset photograph,
 *             resampled to 1 x 1024 (assets/sunset-strip.png, provenance in sunset-strip.json); reactor structure,
 *             barrel ribs and the cyan/amber channel accents use BONEYARD's supplied phosphor and amber tokens
 * not         a film recreation, a video, a photo, or a physical reactor simulation. The sunset supplies the energy
 *             texture while the original code-built machine supplies its structure, depth and launch choreography.
 * deps        none · Canvas 2D + bounded ImageData texture · 2026-10
 * budget      0.597 ms mean, 0.700 ms p95 in rAF-paced launch at 1050 x 852 DPR1, local Chromium; target <4 ms
 *             synchronous JS/Canvas API cost; async GPU/paint excluded. Stress conditions: docs/revamp/gate/review.md
 * api         mount(canvas, params, ctx) -> { tick, resize, still, deactivate, destroy, params, launch(), state }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Gate is a physical machine before it is a light effect. Three chamfered hangar frames establish far depth. A dark
 * extruded chassis, twelve separate face segments, paired highlight and shadow edges, four piston clamps and floor
 * anchors establish near and middle depth even with emissives removed. The center is a bounded aperture, not a full
 * screen carpet. Its small ImageData buffer maps the sunset strip into narrow longitudinal channels. Canvas 2D lays
 * those channels behind a dark barrel of occluding ribs, advancing shells, a tiny core and a thick inner bezel.
 *
 * launch() starts a bounded sequence advanced only by the host ticker: charge, traverse, settle, energized idle.
 * Charge scans the face segments and retracts the clamps. Traverse accelerates the sunset texture through the throat,
 * sends one amber pressure ring across the chassis and publishes a short shared punch. Settle closes the mechanism
 * onto a stronger energized hold. Calm keeps the charge response but removes the pressure ring and reduces travel.
 * Still draws one deterministic energized pose synchronously and starts no clock or loop.
 */
(() => {
  'use strict';
  const PARAMS = {
    cruise: 9,             /* inherited control: base sunset-flow rate */
    scrollGain: 12,        /* inherited control: extra flow from positive bay progress */
    settle: 0.45,          /* pointer shove response */
    lanes: 9,              /* energy arms inside the aperture */
    lanePool: 64,          /* deterministic phase family, retained for configured exports */
    stripPerUnit: 44,      /* sunset sample density through the throat */
    paceSpread: 0.35,      /* asymmetry of the energy folds */
    floorH: 1, ceilH: 1.15,
    focalK: 0.62,          /* hangar perspective strength */
    fog: 20,               /* far-hangar falloff */
    gain: 1.34,            /* sunset energy exposure */
    sat: 1.82,             /* sunset saturation about its own luma */
    edge: 0.82,            /* aperture edge falloff */
    shove: 0.65,           /* pointer parallax inside the fixed machine */
    haze: 0.42,            /* local energy halo behind the chassis */
    coreW: 0.12, coreH: 0.1, /* throat size inside the aperture */
    bloomW: 0.23, bloomH: 0.16,
    bloom: 0.28,
    eyeDark: 0.84,
    rim: 0.62,
    ribSpacing: 1.65, ribWidth: 0.075, ribShade: 0.58,
    sideShade: 0.32,
    toneKnee: 218,
    stillDolly: 23.5,
    segments: 12,
    aperture: 0.27,        /* width fraction before portrait fitting */
    apertureAspect: 0.78,
    frameWidth: 0.27,
    frameDepth: 0.11,
    segmentGap: 0.045,
    idleEnergy: 0.62,
    chargeTime: 1.05,
    travelTime: 0.82,
    recoveryTime: 1.15,
    scanRate: 0.24,
    burst: 0.72,
    shakePx: 2.4,
  };

  const TAU = Math.PI * 2;
  const clamp = (x, a, b, fallback) => Number.isFinite(Number(x)) ? Math.max(a, Math.min(b, Number(x))) : fallback;
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return u * u * (3 - 2 * u); };
  const mod = (x, n) => ((x % n) + n) % n;

  function assetUrls(ctx, name) {
    const bases = (ctx.assetBases && ctx.assetBases.length) ? ctx.assetBases.slice()
      : (location.pathname.includes('/parts/') ? ['../assets/', 'assets/'] : ['assets/', '../assets/']);
    return bases.map((b) => new URL(b + name, document.baseURI).href);
  }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: false });
    let w = canvas.width, h = canvas.height, bd = 1, px = 1, dead = false, ready = false, lastTick = 0;
    let raw = null, energyCanvas = null, energyCtx = null, energyImage = null, energy32 = null;
    let eRad = null, eAng = null, eNx = null, eNy = null;
    let state = 'idle', seqT = 0, energyPhase = 0, shove = 0, kick = 0, clock = 0, energized = 0.68;
    let stillFired = false;
    let lastPose = null, ownsShare = false;
    let bandR = 246, bandG = 116, bandB = 67, hotR = 255, hotG = 143, hotB = 76;
    let bandCss = 'rgb(246,116,67)', hotCss = 'rgb(255,143,76)', roseCss = 'rgb(245,121,103)';
    const EW = 192, EH = 128, LUTN = 2048, LUTMASK = LUTN - 1;
    const sinLut = new Float32Array(LUTN);
    ctx.share.gateEnergy = 0; ownsShare = true;
    for (let i = 0; i < LUTN; i++) sinLut[i] = Math.sin(i * TAU / LUTN);

    function initEnergy() {
      energyCanvas = document.createElement('canvas'); energyCanvas.width = EW; energyCanvas.height = EH;
      energyCtx = energyCanvas.getContext('2d', { alpha: false });
      energyImage = energyCtx.createImageData(EW, EH); energy32 = new Uint32Array(energyImage.data.buffer);
      const n = EW * EH; eRad = new Float32Array(n); eAng = new Float32Array(n); eNx = new Float32Array(n); eNy = new Float32Array(n);
      for (let y = 0, i = 0; y < EH; y++) for (let x = 0; x < EW; x++, i++) {
        const nx = (x + 0.5 - EW * 0.5) / (EW * 0.5), ny = (y + 0.5 - EH * 0.5) / (EH * 0.5);
        eNx[i] = nx; eNy[i] = ny; eRad[i] = Math.sqrt(nx * nx + ny * ny); eAng[i] = Math.atan2(ny, nx);
      }
    }
    initEnergy();

    function analyseStrip() {
      if (!raw) return;
      const ids = Array.from({ length: 1024 }, (_, i) => i);
      const sample = (i) => { const q = i * 3, R = raw[q], G = raw[q + 1], B = raw[q + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B); return { R, G, B, sat: (mx - mn) / Math.max(1, mx), y: (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255 }; };
      const vivid = ids.slice().sort((a, b) => { const A = sample(a), B = sample(b); return B.sat * (0.35 + B.y * 0.65) - A.sat * (0.35 + A.y * 0.65); });
      const rose = ids.slice().sort((a, b) => { const A = sample(a), B = sample(b); return (B.R + B.B - B.G * 2 + B.y * 36) - (A.R + A.B - A.G * 2 + A.y * 36); });
      const average = (order, count) => {
        let R = 0, G = 0, B = 0; for (let k = 0; k < count; k++) { const c = sample(order[k]); R += c.R; G += c.G; B += c.B; }
        return [R / count, G / count, B / count];
      };
      let [br, bg, bb] = average(vivid, 128), [hr, hg, hb] = average(vivid, 36), [rr, rg, rb] = average(rose, 72);
      const saturate = (R, G, B, top) => {
        const s = clamp(params.sat, 0, 4, 1.82), y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        R = Math.max(0, y + (R - y) * s); G = Math.max(0, y + (G - y) * s); B = Math.max(0, y + (B - y) * s);
        const m = Math.max(1, R, G, B); return [R * top / m, G * top / m, B * top / m];
      };
      [bandR, bandG, bandB] = saturate(br, bg, bb, 246); [hotR, hotG, hotB] = saturate(hr, hg, hb, 255);
      [rr, rg, rb] = saturate(rr, rg, rb, 245);
      bandCss = `rgb(${bandR | 0},${bandG | 0},${bandB | 0})`; hotCss = `rgb(${hotR | 0},${hotG | 0},${hotB | 0})`; roseCss = `rgb(${rr | 0},${rg | 0},${rb | 0})`;
    }

    const pic = new Image(); pic.decoding = 'async';
    const urls = assetUrls(ctx, 'sunset-strip.png'); let tryAt = 0;
    pic.onload = () => {
      if (dead) return;
      const c = document.createElement('canvas'); c.width = 1; c.height = pic.naturalHeight || 1024;
      const cg = c.getContext('2d', { willReadFrequently: true }); cg.drawImage(pic, 0, 0);
      const d = cg.getImageData(0, 0, 1, c.height).data, n = c.height;
      raw = new Float32Array(2048 * 3);
      for (let i = 0; i < 2048; i++) {
        const k = i < 1024 ? i : 2047 - i, q = Math.min(n - 1, Math.floor(k * n / 1024)) * 4;
        raw[i * 3] = d[q]; raw[i * 3 + 1] = d[q + 1]; raw[i * 3 + 2] = d[q + 2];
      }
      analyseStrip(); ready = true;
      draw(lastPose || stillPose()); ctx.readout('gate', stateLine());
    };
    pic.onerror = () => { if (!dead && ++tryAt < urls.length) pic.src = urls[tryAt]; };
    pic.src = urls[0];

    function stateLine() {
      const word = state === 'traverse' ? 'crossing' : state === 'still' ? 'still' : state;
      return 'strip 2025-03-01 sunset · reactor ' + word;
    }

    function renderEnergy(pose) {
      if (!energy32 || !energyCtx) return;
      const [fr, fg, fb] = BONEYARD.toRgb(ctx.tokens.field2);
      const [ar, ag, ab] = BONEYARD.toRgb(ctx.tokens.amber);
      const [cr, cg, cb] = BONEYARD.toRgb(ctx.tokens.phosphor);
      if (!raw) {
        const field = (255 << 24) | (fb << 16) | (fg << 8) | fr; energy32.fill(field); energyCtx.putImageData(energyImage, 0, 0); return;
      }
      const gain = clamp(params.gain, 0, 5, 1.34), sat = clamp(params.sat, 0, 4, 1.82);
      const edgePower = clamp(params.edge, 0, 1, 0.82), stripDensity = clamp(params.stripPerUnit, 1, 220, 44);
      const arms = Math.round(clamp(params.lanes, 3, 24, 9)), family = Math.round(clamp(params.lanePool, 4, 1024, 64));
      const spread = clamp(params.paceSpread, 0, 1, 0.35);
      const throatX = clamp(params.coreW, 0.035, 0.42, 0.12) * (1 + pose.travel * 0.45);
      const throatY = clamp(params.coreH, 0.035, 0.42, 0.1) * (1 + pose.travel * 0.4);
      const knee = clamp(params.toneKnee, 96, 248, 218), shoulder = 255 - knee;
      const eye = clamp(params.eyeDark, 0, 1, 0.84);
      const phase = energyPhase + clamp(params.stillDolly, -4096, 4096, 23.5) * 0.009;
      const zoom = 1 + pose.travel * 0.72, scanX = pose.scan * 2 - 1;
      for (let i = 0; i < energy32.length; i++) {
        const r0 = eRad[i];
        if (r0 > 1.04) { energy32[i] = (255 << 24) | (fb << 16) | (fg << 8) | fr; continue; }
        const nx = eNx[i], ny = eNy[i], a = eAng[i], r = mod(r0 * zoom - pose.travel * 0.1 + phase * 0.018, 1);
        const wi = (Math.floor((a * Math.max(3, arms - 3) + r0 * (5.5 + spread * 5.5) - phase * (2.1 + pose.travel * 4.4)) * LUTN / TAU)) & LUTMASK;
        const ci = (Math.floor((a * Math.max(2, arms - 5) - r0 * (7.5 + spread * 3.5) + phase * (1.35 + pose.travel * 3.2) + 1.7) * LUTN / TAU)) & LUTMASK;
        const ri = (Math.floor((r0 * (34 + pose.travel * 18) - phase * (2.4 + pose.travel * 5.8)) * LUTN / TAU)) & LUTMASK;
        let amberLane = 0.5 + 0.5 * sinLut[wi]; amberLane *= amberLane; amberLane *= amberLane; amberLane *= amberLane; amberLane *= amberLane;
        let cyanLane = 0.5 + 0.5 * sinLut[ci]; cyanLane *= cyanLane; cyanLane *= cyanLane; cyanLane *= cyanLane; cyanLane *= cyanLane;
        let shellLine = 0.5 + 0.5 * sinLut[ri]; shellLine *= shellLine; shellLine *= shellLine; shellLine *= shellLine;
        const index = (Math.floor(r * stripDensity * 37 + a * (2048 * 3 / TAU) + phase * 241 + family * 13 + 8192) & 2047) * 3;
        const rawR = raw[index], rawG = raw[index + 1], rawB = raw[index + 2];
        const photoY = Math.max(0, Math.min(1, (0.2126 * rawR + 0.7152 * rawG + 0.0722 * rawB) / 255));
        const edge = 1 - smooth(0.76 + 0.14 * edgePower, 1.035, r0);
        const er = Math.sqrt(nx * nx + ny * ny * throatX / Math.max(0.02, throatY));
        const throat = smooth(throatX * 0.86, throatX + 0.19, er);
        const tinyCore = 1 - smooth(throatX * 0.05, throatX * 0.31, er);
        const scan = Math.max(0, 1 - Math.abs(nx - scanX) / (0.045 + 0.06 * pose.charge));
        const open = edge * throat, energy = 0.28 + pose.energy * 0.72;
        amberLane *= open * energy * (0.34 + photoY * 0.66);
        cyanLane *= open * energy * (0.3 + 0.7 * (1 - photoY * 0.42)) * (0.62 - amberLane * 0.34);
        shellLine *= open * (0.045 + pose.travel * 0.1 + pose.charge * 0.045);
        const scanLine = scan * pose.charge * edge * 0.12;
        const photoW = amberLane * gain * (0.15 + 0.12 * photoY);
        const dark = edge * (0.22 - eye * 0.1) + 0.05;
        let R = fr * dark + rawR * photoW + bandR * amberLane * 0.72 + cr * cyanLane * 0.3 + ar * shellLine * 0.5 + hotR * tinyCore * (0.12 + pose.charge * 0.2) + ar * scanLine;
        let G = fg * dark + rawG * photoW + bandG * amberLane * 0.72 + cg * cyanLane * 0.3 + cg * shellLine * 0.28 + hotG * tinyCore * (0.12 + pose.charge * 0.2) + ag * scanLine;
        let B = fb * dark + rawB * photoW + bandB * amberLane * 0.72 + cb * cyanLane * 0.3 + cb * shellLine * 0.28 + hotB * tinyCore * (0.12 + pose.charge * 0.2) + ab * scanLine;
        const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        const localSat = 0.72 + sat * 0.42;
        R = y + (R - y) * localSat; G = y + (G - y) * localSat; B = y + (B - y) * localSat;
        if (R > knee) R = knee + shoulder * (R - knee) / (R - knee + shoulder);
        if (G > knee) G = knee + shoulder * (G - knee) / (G - knee + shoulder);
        if (B > knee) B = knee + shoulder * (B - knee) / (B - knee + shoulder);
        R = Math.max(0, R) | 0; G = Math.max(0, G) | 0; B = Math.max(0, B) | 0;
        energy32[i] = (255 << 24) | (Math.min(255, B) << 16) | (Math.min(255, G) << 8) | Math.min(255, R);
      }
      energyCtx.putImageData(energyImage, 0, 0);
    }

    function pathFrom(points) {
      const p = new Path2D(); if (!points.length) return p;
      p.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) p.lineTo(points[i].x, points[i].y); p.closePath(); return p;
    }
    function chamferPoints(cx, cy, hw, hh, cut) {
      return [
        { x: cx - hw + cut, y: cy - hh }, { x: cx + hw - cut, y: cy - hh },
        { x: cx + hw, y: cy - hh + cut }, { x: cx + hw, y: cy + hh - cut },
        { x: cx + hw - cut, y: cy + hh }, { x: cx - hw + cut, y: cy + hh },
        { x: cx - hw, y: cy + hh - cut }, { x: cx - hw, y: cy - hh + cut },
      ];
    }
    function ellipsePoint(cx, cy, rx, ry, scale, angle, dx, dy) {
      return { x: cx + (dx || 0) + Math.cos(angle) * rx * scale, y: cy + (dy || 0) + Math.sin(angle) * ry * scale };
    }
    function segmentPath(cx, cy, rx, ry, outer, inner, a0, a1, dx, dy) {
      const p = new Path2D(), A = ellipsePoint(cx, cy, rx, ry, outer, a0, dx, dy), B = ellipsePoint(cx, cy, rx, ry, outer, a1, dx, dy);
      const C = ellipsePoint(cx, cy, rx, ry, inner, a1, dx, dy), D = ellipsePoint(cx, cy, rx, ry, inner, a0, dx, dy);
      p.moveTo(A.x, A.y); p.lineTo(B.x, B.y); p.lineTo(C.x, C.y); p.lineTo(D.x, D.y); p.closePath(); return p;
    }
    function quad(a, b, c, d) { const p = new Path2D(); p.moveTo(a.x, a.y); p.lineTo(b.x, b.y); p.lineTo(c.x, c.y); p.lineTo(d.x, d.y); p.closePath(); return p; }

    function geometry() {
      const portrait = w / Math.max(1, h) < 0.78;
      const rx = Math.max(28, Math.min(w * clamp(params.aperture, 0.15, 0.36, 0.27), h * (portrait ? 0.235 : 0.3)));
      const ry = rx * clamp(params.apertureAspect, 0.55, 1.05, 0.78);
      const cx = ctx.vp.x * w, cy = Math.min(ctx.vp.y * h, h * (portrait ? 0.385 : 0.43));
      return { cx, cy, rx, ry, portrait };
    }

    function drawHangar(M, pose) {
      const T = ctx.tokens, { cx, cy, rx, ry } = M;
      const bloomScale = 1.7 + clamp(params.bloomW, 0, 1, 0.23) * 1.8 + clamp(params.bloomH, 0, 1, 0.16) * 1.2;
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx * bloomScale, ry * bloomScale));
      glow.addColorStop(0, ctx.rgba(bandCss, clamp(params.haze, 0, 1.5, 0.42) * (0.08 + clamp(params.bloom, 0, 1.5, 0.28) * pose.energy * 0.42)));
      glow.addColorStop(0.5, ctx.rgba(T.horizonTint, 0.1)); glow.addColorStop(1, ctx.rgba(T.field, 0));
      g.fillStyle = glow; g.fillRect(0, 0, w, h);

      const fade = Math.max(0.1, Math.min(0.6, clamp(params.fog, 0.5, 100, 20) / 45));
      for (let i = 4; i >= 1; i--) {
        const perspective = clamp(params.focalK, 0.15, 1.5, 0.62);
        const s = 1.45 + i * (0.24 + perspective * 0.31), pts = chamferPoints(cx, cy + ry * 0.04 * i, rx * s, ry * s, Math.min(rx, ry) * 0.22 * s);
        g.strokeStyle = i === 1 ? T.phosphorDim : T.line; g.globalAlpha = fade * (0.13 + (4 - i) * 0.07);
        g.lineWidth = (i === 1 ? 2.2 : 1.15) * px; g.stroke(pathFrom(pts));
      }

      const topY = Math.max(-h * 0.08, cy - ry * (1.12 + clamp(params.ceilH, 0.3, 2, 1.15) * 0.37));
      const bottomY = cy + ry * (1.08 + clamp(params.floorH, 0.3, 2, 1) * 0.38);
      g.fillStyle = ctx.rgba(T.field2, 0.48 + clamp(params.sideShade, 0, 1, 0.32) * 0.56); g.globalAlpha = 1;
      g.fill(pathFrom([{ x: 0, y: 0 }, { x: cx - rx * 1.6, y: topY }, { x: cx - rx * 1.55, y: bottomY }, { x: 0, y: h }]));
      g.fill(pathFrom([{ x: w, y: 0 }, { x: cx + rx * 1.6, y: topY }, { x: cx + rx * 1.55, y: bottomY }, { x: w, y: h }]));
      g.strokeStyle = T.line; g.globalAlpha = 0.46; g.lineWidth = 1.1 * px;
      for (let i = 0; i < 4; i++) {
        const k = (i + 1) / 5;
        g.beginPath(); g.moveTo(0, h * k); g.lineTo(cx - rx * (1.36 + 0.1 * i), cy + (h * k - cy) * 0.2); g.stroke();
        g.beginPath(); g.moveTo(w, h * k); g.lineTo(cx + rx * (1.36 + 0.1 * i), cy + (h * k - cy) * 0.2); g.stroke();
      }

      const floorY = cy + ry * 1.1; g.globalAlpha = 0.34 + pose.travel * 0.16;
      for (let i = -3; i <= 3; i++) {
        g.strokeStyle = i === 0 ? T.phosphorDim : T.line; g.lineWidth = (i === 0 ? 1.8 : 1) * px;
        g.beginPath(); g.moveTo(cx + i * rx * 0.24, floorY); g.lineTo(cx + i * w * 0.22, h); g.stroke();
      }
      for (let i = 1; i <= 5; i++) {
        const u = i / 6, y = floorY + (h - floorY) * u * u;
        g.strokeStyle = T.line; g.globalAlpha = (0.42 - i * 0.045) * (1 + pose.travel * 0.25); g.lineWidth = 1 * px;
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      }
      g.globalAlpha = 1;
    }

    function drawChassis(M) {
      const T = ctx.tokens, { cx, cy, rx, ry } = M;
      const hw = rx * 1.55, hh = ry * 1.34, cut = Math.min(rx, ry) * 0.28;
      const dx = rx * 0.075, dy = ry * clamp(params.frameDepth, 0.02, 0.28, 0.11);
      const front = chamferPoints(cx, cy, hw, hh, cut), back = front.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      g.fillStyle = T.field; g.fill(pathFrom(back));
      for (let i = 0; i < front.length; i++) {
        const j = (i + 1) % front.length, side = quad(front[i], front[j], back[j], back[i]);
        g.fillStyle = i < 3 ? ctx.rgba(T.phosphorDim, 0.15) : ctx.rgba(T.field, 0.96); g.fill(side);
        g.strokeStyle = T.line; g.globalAlpha = 0.72; g.lineWidth = 1 * px; g.stroke(side);
      }
      const metal = g.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
      metal.addColorStop(0, ctx.rgba(T.phosphorDim, 0.22)); metal.addColorStop(0.24, T.field2); metal.addColorStop(0.7, T.field2); metal.addColorStop(1, T.field);
      const frontPath = pathFrom(front); g.fillStyle = metal; g.globalAlpha = 1; g.fill(frontPath);
      g.strokeStyle = T.field; g.lineWidth = 11 * px; g.stroke(frontPath);
      g.strokeStyle = T.phosphorDim; g.globalAlpha = 0.62; g.lineWidth = 2.2 * px; g.stroke(frontPath);
      g.strokeStyle = T.phosphorCore; g.globalAlpha = 0.16; g.lineWidth = 0.8 * px; g.stroke(frontPath);

      for (const side of [-1, 1]) {
        const x = cx + side * rx * 1.34, y0 = cy - ry * 0.48;
        g.fillStyle = T.field; g.globalAlpha = 0.92; g.fillRect(x - rx * 0.12, y0, rx * 0.24, ry * 0.96);
        g.strokeStyle = T.line; g.globalAlpha = 0.9; g.lineWidth = 1.2 * px; g.strokeRect(x - rx * 0.12, y0, rx * 0.24, ry * 0.96);
        for (let k = 0; k < 4; k++) {
          const y = y0 + ry * (0.16 + k * 0.2); g.strokeStyle = k === 1 ? T.amber : T.phosphorDim; g.globalAlpha = k === 1 ? 0.52 : 0.36;
          g.lineWidth = 2 * px; g.beginPath(); g.moveTo(x - rx * 0.065, y); g.lineTo(x + rx * 0.065, y); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }

    function drawAperture(M, pose) {
      const T = ctx.tokens, { cx, cy, rx, ry } = M, ix = rx * 0.94, iy = ry * 0.94;
      g.fillStyle = T.field; g.beginPath(); g.ellipse(cx, cy + ry * 0.025, rx * 1.08, ry * 1.08, 0, 0, TAU); g.fill();
      g.strokeStyle = T.line; g.globalAlpha = 0.9; g.lineWidth = 18 * px; g.stroke();
      g.strokeStyle = T.phosphorDim; g.globalAlpha = 0.28; g.lineWidth = 4 * px; g.stroke();

      renderEnergy(pose);
      g.save(); g.beginPath(); g.ellipse(cx, cy, ix, iy, 0, 0, TAU); g.clip();
      g.fillStyle = T.field; g.fillRect(cx - ix, cy - iy, ix * 2, iy * 2);
      if (energyCanvas) {
        const zoom = 1 + pose.travel * 0.42, dw = ix * 2 * zoom, dh = iy * 2 * zoom;
        const sx = pose.shove * ix * 0.11;
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.globalAlpha = 0.94; g.drawImage(energyCanvas, cx - dw * 0.5 + sx, cy - dh * 0.5, dw, dh);
      }

      const channelCount = M.portrait ? 8 : 12, channelColors = [bandCss, hotCss, roseCss];
      for (let i = 0; i < channelCount; i++) {
        const a = -Math.PI / 2 + i * TAU / channelCount, bend = (i & 1 ? 1 : -1) * (0.08 + pose.travel * 0.08);
        const A = ellipsePoint(cx, cy, ix, iy, 0.13, a - 0.13 + bend, pose.shove * ix * 0.035, 0);
        const B = ellipsePoint(cx, cy, ix, iy, 0.38, a - 0.08 + bend * 0.72, pose.shove * ix * 0.025, 0);
        const C = ellipsePoint(cx, cy, ix, iy, 0.72, a + bend * 0.34, pose.shove * ix * 0.012, 0);
        const D = ellipsePoint(cx, cy, ix, iy, 1.04 + pose.travel * 0.24, a, 0, 0);
        const path = new Path2D(); path.moveTo(A.x, A.y); path.bezierCurveTo(B.x, B.y, C.x, C.y, D.x, D.y);
        g.strokeStyle = T.field; g.globalAlpha = 0.94; g.lineWidth = (M.portrait ? 3.2 : 4.2) * px; g.stroke(path);
        g.strokeStyle = channelColors[i % channelColors.length]; g.globalAlpha = 0.34 + pose.energy * 0.34 + pose.travel * 0.16;
        g.lineWidth = (M.portrait ? 0.9 : 1.15) * px * (1 + pose.charge * 0.36); g.stroke(path);
      }

      if (state === 'charge' || (state === 'still' && stillFired)) {
        const s = 0.16 + (1 - pose.charge) * 0.86;
        g.beginPath(); g.ellipse(cx, cy, ix * s, iy * s, 0, 0, TAU);
        g.strokeStyle = hotCss; g.globalAlpha = 0.36 + pose.charge * 0.42; g.lineWidth = (1.1 + pose.charge * 1.15) * px; g.stroke();
      }

      const railCount = M.portrait ? 6 : 8, railWidth = M.portrait ? 0.095 : 0.074;
      const innerScale = 0.105 + pose.travel * 0.025, railTurn = -0.16 + pose.travel * 0.19;
      for (let i = 0; i < railCount; i++) {
        const a = -Math.PI / 2 + i * TAU / railCount;
        const O0 = ellipsePoint(cx, cy, ix, iy, 1.04, a - railWidth), O1 = ellipsePoint(cx, cy, ix, iy, 1.04, a + railWidth);
        const I1 = ellipsePoint(cx, cy, ix, iy, innerScale, a + railTurn + railWidth * 0.34, pose.shove * ix * 0.035, 0);
        const I0 = ellipsePoint(cx, cy, ix, iy, innerScale, a + railTurn - railWidth * 0.34, pose.shove * ix * 0.035, 0);
        const rail = quad(O0, O1, I1, I0);
        g.fillStyle = T.field; g.globalAlpha = 0.72 + 0.16 * pose.travel; g.fill(rail);
        g.strokeStyle = T.line; g.globalAlpha = 0.48; g.lineWidth = (M.portrait ? 1.5 : 1.1) * px; g.stroke(rail);
        g.beginPath(); g.moveTo(O1.x, O1.y); g.lineTo(I1.x, I1.y);
        g.strokeStyle = i & 1 ? T.amber : T.phosphorDim; g.globalAlpha = 0.28 + pose.energy * 0.18; g.lineWidth = 1.1 * px; g.stroke();
      }

      const scanX = cx - ix + pose.scan * ix * 2, scan = g.createLinearGradient(scanX - ix * 0.09, 0, scanX + ix * 0.09, 0);
      scan.addColorStop(0, ctx.rgba(T.amber, 0)); scan.addColorStop(0.5, ctx.rgba(T.amber, 0.14 * pose.charge)); scan.addColorStop(1, ctx.rgba(T.amber, 0));
      g.fillStyle = scan; g.globalAlpha = 1; g.fillRect(scanX - ix * 0.1, cy - iy, ix * 0.2, iy * 2);

      const shells = M.portrait ? 5 : Math.round(clamp(params.ribSpacing, 0.5, 5, 1.65) * 3.65);
      const shade = clamp(params.ribShade, 0, 1, 0.58), width = clamp(params.ribWidth, 0.015, 0.25, 0.075);
      for (let i = 0; i < shells; i++) {
        const u = mod((i + 0.22) / shells + energyPhase * 0.012 + pose.travel * 0.48, 1);
        const s = 0.12 + Math.pow(u, 1.48) * 1.08, ox = pose.shove * ix * 0.045 * (1 - u);
        const thick = (2.4 + s * 9.5 + width * 10) * px;
        g.beginPath(); g.ellipse(cx + ox, cy + thick * 0.24, ix * s, iy * s, 0, 0, TAU);
        g.strokeStyle = T.field; g.globalAlpha = 0.98; g.lineWidth = thick + 4 * px; g.stroke();
        g.beginPath(); g.ellipse(cx + ox, cy, ix * s, iy * s, 0, 0, TAU);
        g.strokeStyle = T.field2; g.globalAlpha = 0.96; g.lineWidth = thick; g.stroke();
        g.strokeStyle = i & 1 ? T.amber : T.phosphorDim; g.globalAlpha = 0.16 + shade * (0.24 + 0.22 * u);
        g.lineWidth = Math.max(1, thick * 0.16); g.stroke();
        if (pose.travel > 0.04 && u > 0.74) {
          g.strokeStyle = hotCss; g.globalAlpha = pose.travel * smooth(0.74, 1, u) * 0.72;
          g.lineWidth = Math.max(1 * px, thick * 0.075); g.stroke();
        }
      }

      const coreS = 0.105 + pose.travel * 0.018;
      g.beginPath(); g.ellipse(cx + pose.shove * ix * 0.03, cy, ix * coreS, iy * coreS, 0, 0, TAU);
      g.fillStyle = T.field; g.globalAlpha = 0.98; g.fill();
      g.strokeStyle = T.phosphorDim; g.globalAlpha = 0.54; g.lineWidth = 2.4 * px; g.stroke();
      g.strokeStyle = T.amber; g.globalAlpha = 0.32 + pose.charge * 0.32; g.lineWidth = 0.9 * px; g.stroke();
      g.beginPath(); g.moveTo(cx + pose.shove * ix * 0.03 - Math.max(2.5 * px, ix * 0.022), cy);
      g.lineTo(cx + pose.shove * ix * 0.03 + Math.max(2.5 * px, ix * 0.022), cy);
      g.strokeStyle = hotCss; g.globalAlpha = 0.56 + pose.charge * 0.26; g.lineWidth = 1.15 * px; g.stroke();
      g.restore();

      g.beginPath(); g.ellipse(cx, cy + ry * 0.045, rx * 1.02, ry * 1.02, 0, 0, TAU);
      g.strokeStyle = T.field; g.globalAlpha = 1; g.lineWidth = 24 * px; g.stroke();
      for (let i = 0; i < 3; i++) {
        const s = 1.01 - i * 0.045; g.beginPath(); g.ellipse(cx, cy, rx * s, ry * s, 0, 0, TAU);
        g.strokeStyle = i === 1 ? T.phosphorDim : T.field; g.globalAlpha = i === 1 ? 0.56 : 0.96;
        g.lineWidth = (12 - i * 3.2) * px; g.stroke();
      }
      g.beginPath(); g.ellipse(cx, cy, rx * 0.965, ry * 0.965, 0, 0, TAU);
      g.strokeStyle = pose.charge > 0.55 ? T.amber : T.phosphor;
      g.globalAlpha = (0.24 + pose.energy * 0.32) * clamp(params.rim, 0, 1.5, 0.62);
      g.lineWidth = (1.2 + pose.charge * 1.8) * px; g.stroke();
      g.globalAlpha = 1;
    }

    function drawSegments(M, pose) {
      const T = ctx.tokens, { cx, cy, rx, ry } = M, n = Math.round(clamp(params.segments, 8, 20, 12));
      const gap = clamp(params.segmentGap, 0.008, 0.16, 0.045), fw = clamp(params.frameWidth, 0.12, 0.5, 0.27);
      const opening = pose.charge * 0.035 + pose.travel * 0.05;
      const outer = 1 + fw, inner = 1.015 + opening, dx = rx * 0.045, dy = ry * clamp(params.frameDepth, 0.02, 0.28, 0.11);
      const metal = g.createLinearGradient(cx - rx * outer, cy - ry * outer, cx + rx * outer, cy + ry * outer);
      metal.addColorStop(0, ctx.rgba(T.phosphorDim, 0.35)); metal.addColorStop(0.28, T.field2); metal.addColorStop(0.72, T.field2); metal.addColorStop(1, T.field);
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * TAU / n + gap, a1 = -Math.PI / 2 + (i + 1) * TAU / n - gap;
        const back = segmentPath(cx, cy, rx, ry, outer, inner, a0, a1, dx, dy);
        g.fillStyle = T.field; g.globalAlpha = 0.98; g.fill(back); g.strokeStyle = T.line; g.lineWidth = 1.3 * px; g.stroke(back);
        const A = ellipsePoint(cx, cy, rx, ry, outer, a0), B = ellipsePoint(cx, cy, rx, ry, inner, a0);
        const C = ellipsePoint(cx, cy, rx, ry, inner, a0, dx, dy), D = ellipsePoint(cx, cy, rx, ry, outer, a0, dx, dy);
        g.fillStyle = i & 1 ? T.field2 : T.field; g.fill(quad(A, B, C, D));
      }
      const litTo = pose.charge * n * 1.15 + energized * 1.4;
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * TAU / n + gap, a1 = -Math.PI / 2 + (i + 1) * TAU / n - gap;
        const face = segmentPath(cx, cy, rx, ry, outer, inner, a0, a1, 0, 0), active = smooth(i - 0.7, i + 0.65, litTo);
        g.fillStyle = metal; g.globalAlpha = 1; g.fill(face);
        g.fillStyle = i & 1 ? ctx.rgba(T.line, 0.16) : ctx.rgba(T.phosphorDim, 0.09); g.fill(face);
        if (active > 0.01) { g.fillStyle = ctx.rgba(T.amber, 0.04 + active * 0.15 * pose.energy); g.fill(face); }
        g.strokeStyle = T.field; g.globalAlpha = 0.94; g.lineWidth = 7.5 * px; g.stroke(face);
        g.strokeStyle = active > 0.5 ? T.amber : T.phosphorDim; g.globalAlpha = 0.26 + active * 0.5;
        g.lineWidth = (2.2 + active * 1.1) * px; g.stroke(face);
        g.strokeStyle = T.phosphorCore; g.globalAlpha = 0.12 + active * 0.2; g.lineWidth = 0.75 * px; g.stroke(face);
        const mid = (a0 + a1) * 0.5, bolt = ellipsePoint(cx, cy, rx, ry, 1 + fw * 0.55, mid);
        const bs = Math.max(1.2 * px, Math.min(rx, ry) * 0.018);
        g.fillStyle = active > 0.6 ? T.amber : T.phosphorCore; g.globalAlpha = 0.42 + active * 0.48;
        g.fillRect(bolt.x - bs * 0.5, bolt.y - bs * 0.5, bs, bs);
      }
      g.globalAlpha = 1;
    }

    function drawClamp(M, pose, angle, major) {
      const T = ctx.tokens, { cx, cy, rx, ry } = M, minR = Math.min(rx, ry);
      const anchor = ellipsePoint(cx, cy, rx, ry, 1.25, angle), retract = pose.charge * minR * (major ? 0.13 : 0.07);
      g.save(); g.translate(anchor.x, anchor.y); g.rotate(angle); g.translate(retract, 0);
      const vertical = Math.abs(Math.cos(angle)) < 0.5;
      const len = minR * (major ? (vertical ? 0.34 : 0.54) : 0.32), thick = minR * (major ? 0.24 : 0.13);
      const p = new Path2D(); p.moveTo(-len * 0.3, -thick * 0.5); p.lineTo(len * 0.52, -thick * 0.5); p.lineTo(len, -thick * 0.24);
      p.lineTo(len, thick * 0.24); p.lineTo(len * 0.52, thick * 0.5); p.lineTo(-len * 0.3, thick * 0.5); p.closePath();
      g.fillStyle = T.field; g.fill(p); g.strokeStyle = T.phosphorDim; g.globalAlpha = major ? 0.82 : 0.5; g.lineWidth = 2.2 * px; g.stroke(p);
      g.strokeStyle = T.phosphorCore; g.globalAlpha = 0.17; g.lineWidth = 0.75 * px; g.stroke(p);
      g.fillStyle = T.field2; g.globalAlpha = 1; g.fillRect(-len * 0.13, -thick * 0.28, len * 0.58, thick * 0.56);
      g.strokeStyle = pose.charge > 0.62 ? T.amber : T.line; g.globalAlpha = 0.74; g.lineWidth = 1.4 * px; g.strokeRect(-len * 0.13, -thick * 0.28, len * 0.58, thick * 0.56);
      const bolt = thick * 0.12; g.fillStyle = pose.charge > 0.78 ? T.amber : T.phosphorCore; g.globalAlpha = 0.72;
      g.fillRect(len * 0.02 - bolt, -bolt, bolt * 2, bolt * 2); g.fillRect(len * 0.31 - bolt, -bolt, bolt * 2, bolt * 2);
      g.restore(); g.globalAlpha = 1;
    }

    function drawClamps(M, pose) {
      for (let i = 0; i < 4; i++) drawClamp(M, pose, i * Math.PI / 2, true);
      for (let i = 0; i < 4; i++) drawClamp(M, pose, Math.PI / 4 + i * Math.PI / 2, false);
    }

    function drawPressureRing(M, pose) {
      if (pose.burst <= 0.005) return;
      const T = ctx.tokens, u = smooth(0, 1, pose.travel), s = 1.02 + u * 0.82;
      g.beginPath(); g.ellipse(M.cx, M.cy, M.rx * s, M.ry * s, 0, 0, TAU);
      g.strokeStyle = T.amber; g.globalAlpha = clamp(params.burst, 0, 1, 0.72) * pose.burst * (1 - 0.42 * u);
      g.lineWidth = (2.2 + 5.5 * pose.burst) * px; g.stroke();
      g.strokeStyle = T.phosphorCore; g.globalAlpha *= 0.34; g.lineWidth = 1.1 * px; g.stroke(); g.globalAlpha = 1;
    }

    function draw(pose, sx, sy) {
      lastPose = pose; const T = ctx.tokens;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = T.field; g.fillRect(0, 0, w, h);
      const M = geometry(); g.save(); g.translate(sx || 0, sy || 0);
      drawHangar(M, pose);
      const approach = 1 + smooth(0.02, 0.82, pose.travel) * 0.42;
      g.save(); g.translate(M.cx, M.cy); g.scale(approach, approach); g.translate(-M.cx, -M.cy);
      drawChassis(M); drawAperture(M, pose); drawSegments(M, pose); drawClamps(M, pose); g.restore();
      drawPressureRing(M, pose);
      g.restore(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }

    function stillPose(fired) {
      return fired
        ? { charge: 0.96, travel: 0.2, burst: 0, energy: 1, scan: 0.78, shove: 0 }
        : { charge: 0.72, travel: 0.08, burst: 0, energy: 0.88, scan: 0.57, shove: 0 };
    }
    function poseAt(t, calm) {
      const idle = clamp(params.idleEnergy, 0.15, 1, 0.62), breathe = 0.96 + 0.04 * Math.sin(t * 0.72);
      const scanRate = clamp(params.scanRate, 0, 2, 0.24);
      let pose = { charge: 0.18 + energized * 0.18, travel: 0, burst: 0, energy: idle * breathe * (0.84 + energized * 0.16), scan: mod(energyPhase * scanRate * 0.375, 1), shove };
      if (state === 'still') return stillPose(stillFired);
      if (state === 'charge') {
        const u = smooth(0, 1, seqT / clamp(params.chargeTime, 0.25, 4, 1.05));
        pose.charge = u; pose.energy = idle + (1 - idle) * u; pose.scan = mod(u * 2.35, 1);
      } else if (state === 'traverse') {
        const u = smooth(0, 1, seqT / clamp(params.travelTime, 0.2, 3, 0.82));
        pose.charge = 1 - 0.18 * u; pose.travel = u; pose.burst = Math.sin(Math.PI * u); pose.energy = 1; pose.scan = mod(0.35 + u * 3.1, 1);
      } else if (state === 'settle') {
        const u = smooth(0, 1, seqT / clamp(params.recoveryTime, 0.25, 5, 1.15));
        pose.charge = 0.82 - 0.42 * u; pose.travel = 1 - u; pose.energy = 1 - 0.16 * u; pose.scan = mod(0.45 + u * 0.35, 1);
      }
      if (calm) {
        pose.charge *= 0.66; pose.travel *= 0.24; pose.burst = 0; pose.energy *= 0.78;
      }
      return pose;
    }

    function enter(next) {
      state = next; seqT = 0;
      if (next === 'traverse' && ctx.dial === 'full') {
        kick = 1;
        window.dispatchEvent(new CustomEvent('boneyard:gate', { detail: { phase: 'transit' } }));
      }
    }
    function advance(dt) {
      if (state === 'charge' && seqT >= clamp(params.chargeTime, 0.25, 4, 1.05)) enter('traverse');
      else if (state === 'traverse' && seqT >= clamp(params.travelTime, 0.2, 3, 0.82)) enter('settle');
      else if (state === 'settle' && seqT >= clamp(params.recoveryTime, 0.25, 5, 1.15)) { energized = 1; enter('idle'); }
      else seqT += dt;
    }

    function clearShare() {
      if (!ownsShare) return;
      const S = ctx.share;
      S.gateEnergy = 0; S.warp = 0; S.warpAt = 0; S.punch = 0; S.shake = null; S.punchAt = 0;
      ownsShare = false;
    }

    function launch() {
      if (dead || !ready) return false;
      if (ctx.dial === 'still') {
        stillFired = true; state = 'still'; seqT = 0; energized = 1;
        energyPhase = mod(energyPhase + 0.67, 2048); ctx.share.gateEnergy = 0; ownsShare = true;
        draw(stillPose(true), 0, 0); if (ready) ctx.readout('gate', 'strip 2025-03-01 sunset · reactor armed');
        return true;
      }
      energized = Math.max(0.58, energized); kick = ctx.dial === 'full' ? 0.12 : 0; enter('charge'); return true;
    }

    return {
      tick(dt, t, progress, pointer) {
        if (dead) return;
        dt = clamp(dt, 0, 0.05, 0.016); lastTick = t || 1e-3;
        if (state === 'still') enter('idle'); advance(dt);
        const calm = ctx.dial === 'calm', p = pointer || ctx.pointer;
        const want = p && p.present && !p.coarse ? (clamp(p.nx, 0, 1, 0.5) - 0.5) * 2 * clamp(params.shove, 0, 2, 0.65) : 0;
        shove += (want - shove) * (1 - Math.exp(-dt / clamp(params.settle, 0.04, 3, 0.45)));
        const past = clamp(progress, 0, 0.3, 0), flow = clamp(params.cruise, 0, 100, 9) * 0.018 + clamp(params.scrollGain, 0, 60, 12) * past * 0.035;
        const pose = poseAt(t || 0, calm); energyPhase = mod(energyPhase + dt * (flow + pose.charge * 0.46 + pose.travel * 1.55), 2048);
        kick *= Math.exp(-dt / 0.16); if (kick < 0.01) kick = 0; clock += dt;
        const localShake = ctx.dial === 'full' ? clamp(params.shakePx, 0, 10, 2.4) * Math.max(kick, pose.burst * 0.24) : 0;
        const sx = localShake * (0.68 * Math.sin(clock * 47.3) + 0.32 * Math.sin(clock * 79.1 + 1.2));
        const sy = localShake * (0.68 * Math.sin(clock * 59.7 + 0.8) + 0.32 * Math.sin(clock * 83.9 + 2.3));
        const S = ctx.share, now = performance.now(); ownsShare = true;
        S.warp = state === 'idle' ? pose.energy * 0.08 : Math.min(1, 0.18 + pose.charge * 0.45 + pose.travel * 0.3); S.warpAt = now;
        S.gateEnergy = state === 'charge' ? Math.min(1, pose.charge * 0.78)
          : state === 'traverse' ? Math.min(1, 0.78 + pose.travel * 0.22)
            : state === 'settle' ? Math.max(0, 0.5 * (1 - seqT / clamp(params.recoveryTime, 0.25, 5, 1.15))) : 0;
        S.punch = ctx.dial === 'full' ? kick : 0; S.shake = localShake > 0.05 ? { x: sx, y: sy } : null; S.punchAt = now;
        draw(pose, sx * bd, sy * bd); if (ready) ctx.readout('gate', stateLine());
      },
      resize(nw, nh, ndpr) { w = Math.max(1, Math.round(nw)); h = Math.max(1, Math.round(nh)); bd = clamp(ndpr, 0.5, 4, 1); px = Math.max(0.65, bd); },
      still() {
        const entering = state !== 'still'; state = 'still'; seqT = 0; energized = 0.9;
        if (entering) {
          stillFired = false;
          energyPhase = mod(clamp(params.stillDolly, -4096, 4096, 23.5) * 0.071, 2048);
        }
        ctx.share.gateEnergy = 0; ownsShare = true;
        draw(stillPose(stillFired), 0, 0);
        if (ready) ctx.readout('gate', 'strip 2025-03-01 sunset · reactor ' + (stillFired ? 'armed' : 'still'));
      },
      deactivate() {
        if (dead) return;
        if (state !== 'still' && state !== 'idle') { state = 'idle'; seqT = 0; kick = 0; }
        clearShare();
      },
      launch,
      get state() { return state; },
      destroy() {
        dead = true; state = 'dead'; pic.onload = null; pic.onerror = null;
        raw = null; energy32 = null; energyImage = null; energyCtx = null; energyCanvas = null; eRad = null; eAng = null; eNx = null; eNy = null;
        clearShare();
        g.clearRect(0, 0, w, h);
      },
      params(p) {
        if (p && typeof p === 'object') params = p;
        if (raw) analyseStrip();
        if (ctx.dial === 'still' || !lastTick) draw(state === 'still' ? stillPose(stillFired) : poseAt(lastTick, ctx.dial === 'calm'), 0, 0);
      },
    };
  }
  BAYS.push({ slug: 'gate', title: 'Gate', order: 2, role: 'bay', params: PARAMS, mount });
})();
