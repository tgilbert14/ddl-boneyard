/* BONEYARD PART · 02 · GATE
 * technique   a full-viewport 1/z slit canyon with continuous source-lit ribbons, offset one-sided shutter fins,
 *             longitudinal phosphor tracks and a camera that always flies forward through wrapped depth stations
 * lineage     Douglas Trumbull's slit-scan for 2001: A Space Odyssey (1968), after John Whitney's slit-scan
 *             experiments (1950s and 1960s); vector arcade flight displays and practical backlit miniatures
 * original    the amber, coral and rose ribbons sample ONE column of Tim Gilbert's own 2025-03-01 Sonoran sunset
 *             photograph, resampled to 1 x 1024 (assets/sunset-strip.png, provenance in sunset-strip.json);
 *             the canyon, asymmetric shutters and cyan structural tracks are original code-built geometry
 * not         a film recreation, a video, a photo, or a texture-mapped tunnel. The photograph supplies bounded
 *             light colors while projected world geometry supplies motion and occlusion.
 * deps        none · high-resolution Canvas 2D perspective geometry · 2026-10
 * budget      target <4 ms mean for requestAnimationFrame-paced normal-rate tick calls at desktop DPR1; synchronous
 *             JavaScript and Canvas API cost only, with compositor, paint, GPU, network and thermal work excluded
 * api         mount(canvas, params, ctx) -> { tick, resize, still, deactivate, destroy, params, launch(), state }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The camera travels through a dark four-sided canyon. Every point is authored in world space, bent along a shallow
 * deterministic flight path, then projected through a near plane with x' = focal * x / z and y' = focal * y / z.
 * Opaque wall, ceiling and floor cells are painted from far to near, so nearer geometry hides what is behind it.
 * Four sunset-sampled ribbons run down those surfaces, bounded by thin phosphor tracks and crisp dark seams. Each
 * ribbon is divided into stable world-depth color slices with a narrow hot core and a restrained outer shoulder.
 * They are real longitudinal faces, not a screen gradient, and their colored cells grow and leave the viewport as
 * the camera crosses each station.
 *
 * A single shutter fin occupies each station, alternating left, ceiling, right and floor. No station closes into a
 * ring. At the default glide, a fin passes the camera about once per second and the wrapped replacement appears at
 * the far end. launch() only adds forward speed: spool, transit and settle all advance the same distance accumulator,
 * then return to the living glide. Full emits one transit event and carries a short physical shake. Calm moves gently
 * with no event, punch or shake. Still renders one selected travel frame synchronously; launch() selects a second
 * stable frame and resize preserves that choice without starting a clock.
 */
(() => {
  'use strict';
  const PARAMS = {
    cruise: 2.9,           /* world units per second: 2.55 spacing gives one near pass about every 0.88 s */
    calmCruise: 0.62,
    scrollGain: 0.8,       /* modest extra forward speed after the bay hold; outer scroll remains native */
    settle: 0.34,          /* speed and pointer response */
    corridorW: 2.06,
    floorH: 1.24,
    ceilH: 1.14,
    focalK: 0.74,
    near: 0.48,
    fog: 34,               /* far draw distance */
    ribSpacing: 2.55,
    ribWidth: 0.19,
    finReach: 0.27,
    finSpan: 0.5,
    lanePool: 32,          /* sunset palette entries */
    stripPerUnit: 1.1,
    gain: 1.08,
    sat: 1.84,
    toneKnee: 216,
    idleEnergy: 0.96,
    railAlpha: 0.7,
    sideShade: 0.88,
    shove: 0.18,
    stillDolly: 18.35,
    chargeTime: 0.5,
    travelTime: 1.3,
    recoveryTime: 1.15,
    burst: 3.2,
    shakePx: 1.85,
  };

  const clamp = (x, a, b, fallback) => Number.isFinite(Number(x)) ? Math.max(a, Math.min(b, Number(x))) : fallback;
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return u * u * (3 - 2 * u); };
  const mod = (x, n) => ((x % n) + n) % n;

  function assetUrls(ctx, name) {
    const bases = (ctx.assetBases && ctx.assetBases.length) ? ctx.assetBases.slice()
      : (location.pathname.includes('/parts/') ? ['../assets/', 'assets/'] : ['assets/', '../assets/']);
    return bases.map((base) => new URL(base + name, document.baseURI).href);
  }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: false });
    let w = canvas.width, h = canvas.height, bd = 1, px = 1;
    let raw = null, palette = [], ready = false, dead = false, lastTick = 0;
    let distance = clamp(params.stillDolly, -4096, 4096, 18.35);
    let speed = clamp(params.cruise, 0.2, 20, 2.9), shove = 0, clock = 0, kick = 0;
    let state = 'glide', seqT = 0, stillFired = false, transitSent = false, ownsShare = false;

    function releaseShare() {
      if (!ownsShare) return;
      const S = ctx.share;
      S.gateEnergy = 0; S.warp = 0; S.warpAt = 0; S.punch = 0; S.punchAt = 0; S.shake = null;
      ownsShare = false;
    }
    function claimShare() {
      if (ownsShare) return;
      const S = ctx.share;
      S.gateEnergy = 0; S.warp = 0; S.warpAt = 0; S.punch = 0; S.punchAt = 0; S.shake = null;
      ownsShare = true;
    }
    claimShare();

    function buildPalette() {
      if (!raw) return;
      const candidates = [];
      for (let i = 0; i < 1024; i++) {
        const q = i * 3, R = raw[q], G = raw[q + 1], B = raw[q + 2];
        const hi = Math.max(R, G, B), lo = Math.min(R, G, B), lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        const saturation = (hi - lo) / Math.max(1, hi), warmth = Math.max(0, (R * 1.08 + G * 0.28 - B * 0.24) / 255);
        candidates.push({ i, score: Math.pow(saturation, 1.45) * (0.28 + Math.pow(lum / 255, 0.82)) * (0.42 + warmth) });
      }
      const wanted = Math.round(clamp(params.lanePool, 12, 64, 32));
      const selected = candidates.sort((a, b) => b.score - a.score).slice(0, Math.min(192, wanted * 5)).sort((a, b) => a.i - b.i);
      const sat = clamp(params.sat, 0.6, 3.2, 1.84), gain = clamp(params.gain, 0.35, 2.4, 1.08);
      const knee = clamp(params.toneKnee, 128, 238, 216), shoulder = 244 - knee;
      const tone = (v) => v > knee ? knee + shoulder * (v - knee) / Math.max(1, v - knee + shoulder) : v;
      palette = [];
      for (let k = 0; k < wanted; k++) {
        const item = selected[Math.min(selected.length - 1, Math.floor((k + 0.5) * selected.length / wanted))];
        const q = item.i * 3, R0 = raw[q], G0 = raw[q + 1], B0 = raw[q + 2];
        const y = 0.2126 * R0 + 0.7152 * G0 + 0.0722 * B0;
        let R = Math.max(0, y + (R0 - y) * sat), G = Math.max(0, y + (G0 - y) * sat), B = Math.max(0, y + (B0 - y) * sat);
        const brightest = Math.max(1, R, G, B), target = clamp((174 + 62 * Math.sqrt(y / 255)) * gain, 138, 242, 228), lift = target / brightest;
        R = Math.min(244, Math.max(0, tone(R * lift))) | 0;
        G = Math.min(244, Math.max(0, tone(G * lift))) | 0;
        B = Math.min(244, Math.max(0, tone(B * lift))) | 0;
        palette.push(`rgb(${R},${G},${B})`);
      }
    }

    const pic = new Image(); pic.decoding = 'async';
    const urls = assetUrls(ctx, 'sunset-strip.png'); let tryAt = 0;
    pic.onload = () => {
      if (dead) return;
      const strip = document.createElement('canvas'); strip.width = 1; strip.height = pic.naturalHeight || 1024;
      const sg = strip.getContext('2d', { willReadFrequently: true }); sg.drawImage(pic, 0, 0);
      const data = sg.getImageData(0, 0, 1, strip.height).data;
      raw = new Float32Array(1024 * 3);
      for (let i = 0; i < 1024; i++) {
        const q = Math.min(strip.height - 1, Math.floor(i * strip.height / 1024)) * 4;
        raw[i * 3] = data[q]; raw[i * 3 + 1] = data[q + 1]; raw[i * 3 + 2] = data[q + 2];
      }
      buildPalette(); ready = true;
      draw(framePose(), 0, 0); ctx.readout('gate', stateLine());
    };
    pic.onerror = () => { if (!dead && ++tryAt < urls.length) pic.src = urls[tryAt]; };
    pic.src = urls[0];

    function stateLine() {
      const word = state === 'spool' ? 'boost building' : state === 'transit' ? 'boost transit' : state === 'settle' ? 'boost settling' : state;
      return `${word} · ${speed.toFixed(1)} u/s`;
    }

    function trackX(s) { return Math.sin(s * 0.103) * 0.18 + Math.sin(s * 0.039 + 1.25) * 0.1; }
    function trackY(s) { return Math.sin(s * 0.071 + 0.8) * 0.075 + Math.sin(s * 0.027 + 2.2) * 0.035; }
    function trackRoll(s) { return Math.sin(s * 0.092 + 0.35) * 0.055 + Math.sin(s * 0.031) * 0.025; }

    function sceneGeometry() {
      const portrait = w / Math.max(1, h) < 0.72;
      const width = clamp(params.corridorW, 1.1, 4, 2.06) * (portrait ? 0.82 : 1);
      const top = clamp(params.ceilH, 0.6, 2.5, 1.14) * (portrait ? 1.07 : 1);
      const bottom = clamp(params.floorH, 0.6, 2.5, 1.24) * (portrait ? 1.05 : 1);
      const focalK = clamp(params.focalK, 0.35, 1.3, 0.74);
      const f = portrait ? Math.min(w * (0.8 + focalK * 0.08), h * 0.5) : Math.min(w * focalK, h * 0.84);
      const vx = ctx.vp.x * w + w * (portrait ? 0.055 : 0.042);
      const vy = Math.min(ctx.vp.y * h, h * (portrait ? 0.345 : 0.44));
      return {
        portrait, width, top, bottom, f, vx, vy,
        near: clamp(params.near, 0.25, 1.2, 0.48), far: clamp(params.fog, 16, 64, 34),
      };
    }

    function viewPose(M) {
      const look = M.portrait ? 3.2 : 4.2;
      const camX = trackX(distance) + shove, camY = trackY(distance);
      return {
        camX, camY,
        tangentX: (trackX(distance + look) - camX + shove) / look,
        tangentY: (trackY(distance + look) - camY) / look,
      };
    }

    function project(x, y, z, M, V) {
      const world = distance + z, roll = trackRoll(world) * (M.portrait ? 0.72 : 1);
      const cr = Math.cos(roll), sr = Math.sin(roll), xr = x * cr - y * sr, yr = x * sr + y * cr;
      const relX = trackX(world) + xr - V.camX - V.tangentX * z;
      const relY = trackY(world) + yr - V.camY - V.tangentY * z;
      const k = M.f / Math.max(M.near, z);
      return { x: M.vx + relX * k, y: M.vy + relY * k };
    }

    function face(points, M, V, fill, alpha, stroke, lineWidth) {
      g.beginPath();
      for (let i = 0; i < points.length; i++) {
        const p = project(points[i][0], points[i][1], points[i][2], M, V);
        if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y);
      }
      g.closePath();
      if (fill && alpha > 0.001) { g.fillStyle = fill; g.globalAlpha = alpha; g.fill(); }
      if (stroke && alpha > 0.001) { g.strokeStyle = stroke; g.globalAlpha = Math.min(1, alpha * 1.04); g.lineWidth = lineWidth || px; g.stroke(); }
    }

    function line(a, b, M, V, color, alpha, width) {
      const A = project(a[0], a[1], a[2], M, V), B = project(b[0], b[1], b[2], M, V);
      g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y);
      g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = width; g.stroke();
    }

    function stripColor(worldDepth, lane) {
      if (!palette.length) return ctx.tokens.field2;
      const sample = Math.floor(worldDepth * clamp(params.stripPerUnit, 0.25, 8, 1.1) * 2.25);
      return palette[mod(sample + lane * 11, palette.length)];
    }

    function visibility(z, M) {
      return smooth(M.near, M.near + 0.42, z) * (1 - smooth(M.far * 0.72, M.far, z));
    }

    function drawCell(station, M, V, pose, fromZ, toZ) {
      const T = ctx.tokens, W = M.width, top = M.top, bottom = M.bottom;
      const thickness = clamp(params.ribWidth, 0.08, 0.42, 0.19);
      const z0 = fromZ == null ? station.z + thickness * 0.82 : fromZ;
      const z1 = toZ == null ? Math.min(M.far + 1, station.z + station.spacing * 0.985) : toZ;
      if (z1 <= z0) return;
      const vis = visibility((z0 + z1) * 0.5, M); if (vis < 0.004) return;
      const shade = clamp(params.sideShade, 0.35, 1, 0.88);
      const seam = Math.min(Math.max(0.015, thickness * 0.12), (z1 - z0) * 0.18);

      face([[-W, -top, z0], [-W, bottom, z0], [-W, bottom, z1], [-W, -top, z1]], M, V, T.field2, vis * shade, null, 0);
      face([[W, bottom, z0], [W, -top, z0], [W, -top, z1], [W, bottom, z1]], M, V, T.field2, vis * shade, null, 0);
      face([[-W, -top, z0], [W, -top, z0], [W, -top, z1], [-W, -top, z1]], M, V, T.field, vis * 0.96, null, 0);
      face([[W, bottom, z0], [-W, bottom, z0], [-W, bottom, z1], [W, bottom, z1]], M, V, T.field, vis, null, 0);

      if (ready) {
        const energy = clamp(params.idleEnergy, 0.25, 1.1, 0.96) * (0.92 + pose.energy * 0.08);
        const bandA = vis * energy;
        const inset = 0.018;
        const warm0 = z0 + seam, warm1 = z1 - seam, warmMid = distance + (warm0 + warm1) * 0.5;
        const outer = [stripColor(warmMid, 0), stripColor(warmMid, 1), stripColor(warmMid, 2), stripColor(warmMid, 3)];
        face([[-W + inset, -top * 0.52, warm0], [-W + inset, bottom * 0.18, warm0], [-W + inset, bottom * 0.18, warm1], [-W + inset, -top * 0.52, warm1]], M, V, outer[0], bandA * 0.16, null, 0);
        face([[-W * 0.36, -top + inset, warm0], [W * 0.3, -top + inset, warm0], [W * 0.3, -top + inset, warm1], [-W * 0.36, -top + inset, warm1]], M, V, outer[1], bandA * 0.15, null, 0);
        face([[W - inset, bottom * 0.52, warm0], [W - inset, -top * 0.18, warm0], [W - inset, -top * 0.18, warm1], [W - inset, bottom * 0.52, warm1]], M, V, outer[2], bandA * 0.16, null, 0);
        face([[W * 0.36, bottom - inset, warm0], [-W * 0.34, bottom - inset, warm0], [-W * 0.34, bottom - inset, warm1], [W * 0.36, bottom - inset, warm1]], M, V, outer[3], bandA * 0.15, null, 0);

        const pieces = Math.max(1, Math.min(3, Math.ceil((warm1 - warm0) / 0.55)));
        const leftCore = -top * 0.17, rightCore = bottom * 0.17, yCoreHalf = (top + bottom) * 0.018;
        const ceilingCore = -W * 0.025, floorCore = W * 0.03, xCoreHalf = W * 0.018;
        for (let part = 0; part < pieces; part++) {
          const za0 = warm0 + (warm1 - warm0) * part / pieces, zb0 = warm0 + (warm1 - warm0) * (part + 1) / pieces;
          const gap = Math.min(0.026, (zb0 - za0) * 0.055), za = za0 + gap, zb = zb0 - gap;
          const world = distance + (za + zb) * 0.5;
          const left = stripColor(world, 0), ceiling = stripColor(world, 1), right = stripColor(world, 2), floor = stripColor(world, 3);
          face([[-W + inset * 1.35, -top * 0.42, za], [-W + inset * 1.35, bottom * 0.1, za], [-W + inset * 1.35, bottom * 0.1, zb], [-W + inset * 1.35, -top * 0.42, zb]], M, V, left, bandA * 0.73, null, 0);
          face([[-W * 0.25, -top + inset * 1.35, za], [W * 0.2, -top + inset * 1.35, za], [W * 0.2, -top + inset * 1.35, zb], [-W * 0.25, -top + inset * 1.35, zb]], M, V, ceiling, bandA * 0.71, null, 0);
          face([[W - inset * 1.35, bottom * 0.42, za], [W - inset * 1.35, -top * 0.1, za], [W - inset * 1.35, -top * 0.1, zb], [W - inset * 1.35, bottom * 0.42, zb]], M, V, right, bandA * 0.73, null, 0);
          face([[W * 0.25, bottom - inset * 1.35, za], [-W * 0.22, bottom - inset * 1.35, za], [-W * 0.22, bottom - inset * 1.35, zb], [W * 0.25, bottom - inset * 1.35, zb]], M, V, floor, bandA * 0.72, null, 0);
          face([[-W + inset * 1.7, leftCore - yCoreHalf, za], [-W + inset * 1.7, leftCore + yCoreHalf, za], [-W + inset * 1.7, leftCore + yCoreHalf, zb], [-W + inset * 1.7, leftCore - yCoreHalf, zb]], M, V, left, bandA * 0.98, null, 0);
          face([[ceilingCore - xCoreHalf, -top + inset * 1.7, za], [ceilingCore + xCoreHalf, -top + inset * 1.7, za], [ceilingCore + xCoreHalf, -top + inset * 1.7, zb], [ceilingCore - xCoreHalf, -top + inset * 1.7, zb]], M, V, ceiling, bandA * 0.96, null, 0);
          face([[W - inset * 1.7, rightCore + yCoreHalf, za], [W - inset * 1.7, rightCore - yCoreHalf, za], [W - inset * 1.7, rightCore - yCoreHalf, zb], [W - inset * 1.7, rightCore + yCoreHalf, zb]], M, V, right, bandA * 0.98, null, 0);
          face([[floorCore + xCoreHalf, bottom - inset * 1.7, za], [floorCore - xCoreHalf, bottom - inset * 1.7, za], [floorCore - xCoreHalf, bottom - inset * 1.7, zb], [floorCore + xCoreHalf, bottom - inset * 1.7, zb]], M, V, floor, bandA * 0.96, null, 0);
        }
      }

      const railA = vis * clamp(params.railAlpha, 0.1, 1, 0.7) * (0.88 + pose.energy * 0.12);
      const rw = M.portrait ? 0.062 : 0.045;
      face([[-W + 0.025, bottom * 0.1, z0], [-W + 0.025, bottom * (0.1 + rw), z0], [-W + 0.025, bottom * (0.1 + rw), z1], [-W + 0.025, bottom * 0.1, z1]], M, V, T.phosphorDim, railA, null, 0);
      face([[W - 0.025, -top * 0.08, z0], [W - 0.025, -top * (0.08 + rw), z0], [W - 0.025, -top * (0.08 + rw), z1], [W - 0.025, -top * 0.08, z1]], M, V, T.phosphorDim, railA, null, 0);
      face([[-W * 0.2, -top + 0.025, z0], [-W * (0.2 - rw), -top + 0.025, z0], [-W * (0.2 - rw), -top + 0.025, z1], [-W * 0.2, -top + 0.025, z1]], M, V, T.phosphorDim, railA, null, 0);
      face([[W * 0.58, bottom - 0.025, z0], [W * (0.58 - rw), bottom - 0.025, z0], [W * (0.58 - rw), bottom - 0.025, z1], [W * 0.58, bottom - 0.025, z1]], M, V, T.phosphorDim, railA, null, 0);
      line([-W + 0.021, bottom * 0.1, z0], [-W + 0.021, bottom * 0.1, z1], M, V, T.phosphor, railA * 0.13, Math.max(4 * px, M.portrait ? 7 * px : 5 * px));
      line([W - 0.021, -top * 0.08, z0], [W - 0.021, -top * 0.08, z1], M, V, T.phosphor, railA * 0.13, Math.max(4 * px, M.portrait ? 7 * px : 5 * px));
      line([-W + 0.021, bottom * 0.1, z0], [-W + 0.021, bottom * 0.1, z1], M, V, T.phosphorCore, railA * 0.82, Math.max(0.75 * px, M.portrait ? 1.2 * px : 0.85 * px));
      line([W - 0.021, -top * 0.08, z0], [W - 0.021, -top * 0.08, z1], M, V, T.phosphorCore, railA * 0.82, Math.max(0.75 * px, M.portrait ? 1.2 * px : 0.85 * px));
    }

    function finPolygon(type, M, z) {
      const W = M.width, top = M.top, bottom = M.bottom;
      const reach = clamp(params.finReach, 0.12, 0.42, 0.27), span = clamp(params.finSpan, 0.24, 0.7, 0.5);
      if (type === 0) {
        const end = -W + W * 2 * reach, half = (top + bottom) * span * 0.5;
        return [[-W, -half, z], [end, -half * 0.64, z], [end, half * 0.64, z], [-W, half, z]];
      }
      if (type === 1) {
        const end = -top + (top + bottom) * reach, half = W * span;
        return [[-half, -top, z], [half, -top, z], [half * 0.64, end, z], [-half * 0.64, end, z]];
      }
      if (type === 2) {
        const end = W - W * 2 * reach, half = (top + bottom) * span * 0.5;
        return [[W, half, z], [end, half * 0.64, z], [end, -half * 0.64, z], [W, -half, z]];
      }
      const end = bottom - (top + bottom) * reach, half = W * span;
      return [[half, bottom, z], [-half, bottom, z], [-half * 0.64, end, z], [half * 0.64, end, z]];
    }

    function drawFin(station, M, V, pose) {
      const T = ctx.tokens, z = station.z, vis = visibility(z, M); if (vis < 0.004) return;
      const type = mod(station.worldIndex, 4), depth = clamp(params.ribWidth, 0.08, 0.42, 0.19);
      const front = finPolygon(type, M, z), back = finPolygon(type, M, z + depth);
      for (let i = 0; i < front.length; i++) {
        const q = (i + 1) % front.length;
        face([front[i], front[q], back[q], back[i]], M, V, i === 1 || i === 2 ? T.phosphorDim : T.field, vis * (i === 1 || i === 2 ? 0.3 : 0.92), T.line, vis * px);
      }
      face(front, M, V, T.field2, vis * 0.99, null, 0);
      const leadA = front[1], leadB = front[2], farBreak = smooth(M.far * 0.42, M.far * 0.82, z);
      const trim = 0.055 + farBreak * 0.2;
      const lead0 = [leadA[0] + (leadB[0] - leadA[0]) * trim, leadA[1] + (leadB[1] - leadA[1]) * trim, leadA[2]];
      const lead1 = [leadA[0] + (leadB[0] - leadA[0]) * (1 - trim * 1.35), leadA[1] + (leadB[1] - leadA[1]) * (1 - trim * 1.35), leadA[2]];
      const edgeA = vis * (1 - farBreak);
      line(lead0, lead1, M, V, T.phosphor, edgeA * 0.13, (M.portrait ? 10 : 8) * px);
      line(lead0, lead1, M, V, T.phosphor, edgeA * (0.72 + pose.energy * 0.16), (M.portrait ? 4.5 : 3.3) * px);
      line(lead0, lead1, M, V, T.phosphorCore, edgeA * 0.92, (M.portrait ? 1.4 : 0.95) * px);

      if (ready) {
        const color = stripColor(distance + z, type);
        if (type === 0 || type === 2) {
          const root = type === 0 ? -M.width + 0.13 : M.width - 0.13;
          face([[root, -M.top * 0.58, z - 0.002], [root, M.bottom * 0.54, z - 0.002], [root + (type === 0 ? 0.085 : -0.085), M.bottom * 0.5, z - 0.002], [root + (type === 0 ? 0.085 : -0.085), -M.top * 0.54, z - 0.002]], M, V, color, vis * 0.76, T.field, vis * px);
        } else {
          const root = type === 1 ? -M.top + 0.13 : M.bottom - 0.13;
          face([[-M.width * 0.58, root, z - 0.002], [M.width * 0.54, root, z - 0.002], [M.width * 0.5, root + (type === 1 ? 0.085 : -0.085), z - 0.002], [-M.width * 0.54, root + (type === 1 ? 0.085 : -0.085), z - 0.002]], M, V, color, vis * 0.76, T.field, vis * px);
        }
      }

      const seamA = front[0], seamB = front[3];
      line(seamA, seamB, M, V, T.line, vis * 0.85, (M.portrait ? 2 : 1.35) * px);
    }

    function draw(pose, sx, sy) {
      const T = ctx.tokens, M = sceneGeometry(), V = viewPose(M);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = T.field; g.fillRect(0, 0, w, h);
      g.save(); g.translate(sx || 0, sy || 0); g.lineJoin = 'bevel'; g.lineCap = 'square';
      const spacing = clamp(params.ribSpacing, 1.6, 4.4, 2.55);
      const count = M.portrait ? 11 : 15, span = count * spacing, travel = mod(distance, span);
      M.far = Math.min(M.far, span);  /* the wrapped phone station enters beyond the zero-alpha far seam */
      const stations = [];
      for (let slot = 0; slot < count; slot++) {
        const z = M.near + mod(slot * spacing - travel, span);
        const worldIndex = Math.round((distance + z - M.near) / spacing);
        stations.push({ slot, z, spacing, worldIndex });
      }
      stations.sort((a, b) => b.z - a.z);
      for (const station of stations) { drawCell(station, M, V, pose); drawFin(station, M, V, pose); }
      const nearest = stations[stations.length - 1], foregroundEnd = nearest.z - clamp(params.ribWidth, 0.08, 0.42, 0.19) * 0.12;
      if (foregroundEnd > M.near + 0.04) {
        drawCell({ worldIndex: nearest.worldIndex - 1, z: M.near, spacing }, M, V, pose, M.near + 0.015, foregroundEnd);
      }
      g.restore(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }

    function framePose() {
      if (state === 'spool') {
        const u = smooth(0, 1, seqT / clamp(params.chargeTime, 0.2, 3, 0.5)); return { energy: 0.18 + u * 0.48, burst: 0 };
      }
      if (state === 'transit') {
        const u = smooth(0, 1, seqT / clamp(params.travelTime, 0.35, 4, 1.3)); return { energy: 0.72 + Math.sin(Math.PI * u) * 0.28, burst: Math.sin(Math.PI * u) };
      }
      if (state === 'settle') {
        const u = smooth(0, 1, seqT / clamp(params.recoveryTime, 0.3, 5, 1.15)); return { energy: 0.64 * (1 - u), burst: 0 };
      }
      if (state === 'still') return { energy: stillFired ? 0.82 : 0.34, burst: 0 };
      return { energy: 0, burst: 0 };
    }

    function enter(next) {
      state = next; seqT = 0;
      if (next === 'transit' && ctx.dial === 'full' && !transitSent) {
        transitSent = true; kick = 1;
        window.dispatchEvent(new CustomEvent('boneyard:gate', { detail: { phase: 'transit' } }));
      }
    }

    function advanceSequence(dt) {
      if (state !== 'spool' && state !== 'transit' && state !== 'settle') return;
      seqT += dt;
      if (state === 'spool' && seqT >= clamp(params.chargeTime, 0.2, 3, 0.5)) enter('transit');
      else if (state === 'transit' && seqT >= clamp(params.travelTime, 0.35, 4, 1.3)) enter('settle');
      else if (state === 'settle' && seqT >= clamp(params.recoveryTime, 0.3, 5, 1.15)) enter('glide');
    }

    function speedTarget(progress, calm) {
      const base = clamp(params.cruise, 0.2, 20, 2.9) * (calm ? clamp(params.calmCruise, 0.25, 1, 0.62) : 1);
      const scroll = 1 + clamp(params.scrollGain, 0, 6, 0.8) * clamp(progress, 0, 0.3, 0);
      if (state === 'spool') {
        const u = smooth(0, 1, seqT / clamp(params.chargeTime, 0.2, 3, 0.5)); return base * scroll * (1 + u * (calm ? 0.25 : 0.72));
      }
      if (state === 'transit') {
        const u = smooth(0, 1, seqT / clamp(params.travelTime, 0.35, 4, 1.3));
        const swell = Math.sin(Math.PI * u); return base * scroll * (calm ? 1.32 + swell * 0.28 : 1.72 + swell * clamp(params.burst, 0.4, 5, 3.2));
      }
      if (state === 'settle') {
        const u = smooth(0, 1, seqT / clamp(params.recoveryTime, 0.3, 5, 1.15)); return base * scroll * (1 + (1 - u) * (calm ? 0.32 : 1.05));
      }
      return base * scroll;
    }

    function launch() {
      if (dead || !ready) return false;
      if (ctx.dial === 'still') {
        stillFired = true; state = 'still'; seqT = 0; kick = 0;
        distance = clamp(params.stillDolly, -4096, 4096, 18.35) + clamp(params.ribSpacing, 1.6, 4.4, 2.55) * 0.46;
        claimShare(); ctx.share.gateEnergy = 0; ctx.share.punch = 0; ctx.share.shake = null;
        draw(framePose(), 0, 0); ctx.readout('gate', 'selected travel frame');
        return true;
      }
      claimShare(); transitSent = false; kick = 0; enter('spool'); return true;
    }

    return {
      tick(dt, t, progress, pointer) {
        if (dead) return;
        dt = clamp(dt, 0, 0.05, 0.016); lastTick = t || 1e-3; claimShare();
        if (state === 'still') { stillFired = false; enter('glide'); }
        advanceSequence(dt);
        const calm = ctx.dial === 'calm', p = pointer || ctx.pointer;
        const want = !calm && p && p.present && !p.coarse ? (clamp(p.nx, 0, 1, 0.5) - 0.5) * 2 * clamp(params.shove, 0, 0.7, 0.18) : 0;
        shove += (want - shove) * (1 - Math.exp(-dt / clamp(params.settle, 0.08, 2, 0.34)));
        const target = speedTarget(progress, calm), tau = target > speed ? 0.16 : clamp(params.settle, 0.08, 2, 0.34);
        speed += (target - speed) * (1 - Math.exp(-dt / tau));
        speed = Math.max(0.05, speed); distance += speed * dt;
        if (distance > 1048576) distance -= 1048576;
        kick *= Math.exp(-dt / 0.19); if (kick < 0.008) kick = 0; clock += dt;
        const pose = framePose(), shake = !calm && state === 'transit' ? clamp(params.shakePx, 0, 8, 1.85) * Math.max(kick, pose.burst * 0.28) : 0;
        const sx = shake * (0.67 * Math.sin(clock * 47.7) + 0.33 * Math.sin(clock * 81.1 + 1.2));
        const sy = shake * (0.67 * Math.sin(clock * 59.3 + 0.8) + 0.33 * Math.sin(clock * 89.7 + 2.1));
        const S = ctx.share, now = performance.now();
        S.warp = 0; S.warpAt = 0;
        S.gateEnergy = state === 'spool' ? Math.min(0.7, 0.14 + pose.energy * 0.72)
          : state === 'transit' ? Math.min(1, 0.72 + pose.burst * 0.28)
            : state === 'settle' ? Math.max(0, pose.energy * 0.58) : 0;
        S.punch = calm ? 0 : kick; S.punchAt = calm || !kick ? 0 : now; S.shake = shake > 0.04 ? { x: sx, y: sy } : null;
        draw(pose, sx * bd, sy * bd); if (ready) ctx.readout('gate', stateLine());
      },
      resize(nw, nh, ndpr) {
        w = Math.max(1, Math.round(nw)); h = Math.max(1, Math.round(nh)); bd = clamp(ndpr, 0.5, 4, 1); px = Math.max(0.65, bd);
      },
      still() {
        const entering = state !== 'still'; state = 'still'; seqT = 0; kick = 0; speed = clamp(params.cruise, 0.2, 20, 2.9);
        if (entering) { stillFired = false; distance = clamp(params.stillDolly, -4096, 4096, 18.35); }
        claimShare(); ctx.share.gateEnergy = 0; ctx.share.warp = 0; ctx.share.warpAt = 0; ctx.share.punch = 0; ctx.share.punchAt = 0; ctx.share.shake = null;
        draw(framePose(), 0, 0); if (ready) ctx.readout('gate', stillFired ? 'selected travel frame' : 'stable travel frame');
      },
      deactivate() {
        if (dead) return;
        if (state !== 'still') state = 'glide';
        seqT = 0; transitSent = false; kick = 0;
        speed = clamp(params.cruise, 0.2, 20, 2.9) * (ctx.dial === 'calm' ? clamp(params.calmCruise, 0.25, 1, 0.62) : 1);
        releaseShare();
      },
      launch,
      get state() { return state; },
      destroy() {
        dead = true; state = 'dead'; pic.onload = null; pic.onerror = null; raw = null; palette = [];
        releaseShare(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      },
      params(next) {
        if (next && typeof next === 'object') params = next;
        if (raw) buildPalette();
        if (ctx.dial === 'still' || !lastTick) draw(framePose(), 0, 0);
      },
    };
  }

  BAYS.push({ slug: 'gate', title: 'Gate', order: 2, role: 'bay', params: PARAMS, mount });
})();
