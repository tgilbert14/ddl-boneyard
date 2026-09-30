/* BONEYARD PART · 03 · RANGE
 * technique   Voxel Space: one ray per screen column marched front to back over a heightmap, each hit drawn as a
 *             vertical span above the column's running y-buffer; distance fog; hillshaded colour table
 * lineage     NovaLogic, Comanche: Maximum Overkill, 1992; adapted from a CC0 voxel demo at 3d-retro.com whose
 *             terrain was synthetic sine waves; ported from Voxel Catalinas (desertdatalabs.com/labs/voxel-catalinas/)
 * original    the heightmap is real: the Santa Catalina Mountains over the Tucson basin, 768 x 768 cells of about
 *             64 m (AWS Terrain Tiles, Mapzen Terrarium, compiled from SRTM, USGS 3DEP/NED and others), coloured
 *             by the six Catalina Highway life-zone bands from 27 Miles; an autopilot tour of seven stops that
 *             any input interrupts; a readout of the true altitude and ground elevation under the camera; the
 *             same deterministic fast-forward as the Labs page, so #range?t=22 lands on the pose and readout the Labs page shows at t=22
 * not         a map for navigation: 64 m cells, an interpretive six-band life-zone framing (boundaries shift with
 *             aspect and have moved upslope), 2x vertical exaggeration by default (named in the readout; v = 1x)
 * deps        none · Canvas 2D · 2026-09
 * budget      1.72 ms/tick in a 1440x900 workbench; 1.89 ms/tick at 390x844 touch emulation, 448 px long-side ray buffer;
 *             one-second local Chromium CPU samples, 2026-09-30, normal CPU rate; excludes GPU, raster and hardware phones
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC · elevation: Mapzen terrain tiles; data from SRTM, NED, and others
 */
/* HOW IT WORKS
 * The Catalina grid arrives once (ctx.dem) as metres per cell. Two tables are built from it: a height in screen
 * units (elevation above a 600 m basin floor, times the vertical exaggeration, over the cell size) and a colour per
 * cell, the life-zone band for that elevation in feet, blended 120 ft into the next band and multiplied by a
 * west-southwest afternoon hillshade from central differences. Each frame, for every column of a buffer whose long side
 * is 384 pixels, a ray leaves the camera at that column's angle and steps outward in growing strides. A sample projects to
 * screen y = horizon + (camera height - ground height) / distance * scale; if that is above everything drawn in the
 * column so far, the span between is painted in the cell colour faded toward the tube's fog, and the column's
 * y-buffer rises. Near ground paints first and hides the far ridges behind it, which is why no sorting is needed.
 *
 * The camera flies at a fixed ground speed. On autopilot it turns toward the next of seven stops (the Catalina
 * Highway base, Windy Point, Mount Lemmon, Mount Kimball, Pusch Peak, Sabino Canyon, downtown) and holds 320 m over
 * the highest ground in the next 90 cells. Arrow keys or a sideways drag take the stick; a pause hands it back.
 * The tour is stepped at a fixed 1/60 s to reach any t, so a deep link and the still land on the same pose as the
 * Labs page. The horizon sits on the shared vanishing point; the sky and fog come from the tube's tokens; the
 * landmark tags are DOM spans placed with the same projection and hidden when a ridge is in front of them.
 */
(() => {
  'use strict';
  const PARAMS = {
    ve: 2,               /* vertical exaggeration: 1, 2 or 3 */
    speed: 26,           /* ground speed, grid cells per second */
    fov: 1.0,            /* horizontal field of view, radians */
    far: 560,            /* draw distance, cells */
    cruiseAgl: 320,      /* autopilot clearance over the terrain ahead, metres */
    minAgl: 110,         /* never closer to the ground than this, metres */
    stillT: 22,          /* the designed still: seconds into the tour (the Labs page's t=22 pose: past the summit, heading for Mount Kimball) */
    idleResume: 8,       /* seconds without input before the tour takes the stick back */
    labels: true,
    buffer: 448,         /* long side; phone composition uses the same bounded pixel budget */
    contours: 0.42,      /* luminous accents from actual sampled elevation, not surveyed contour geometry */
    contourM: 160,       /* metres between illustrative contour accents */
    survey: 0.24,        /* world-aligned survey lattice, independent of the life-zone colours */
    haze: 1.1,           /* distance separation, without changing elevation or camera calculations */
  };

  const FT = 3.28084, BASE_M = 600, DT = 1 / 60;
  /* the grid's edges (Web Mercator tile edges, assets/catalinas-meta.json) */
  const B = { north: 32.54681317351515, south: 32.10118973232094, west: -111.09375, east: -110.56640625 };
  /* the Labs page's 512-cell crop: the soft fence the camera turns back from, so the tour flies the same line */
  const FENCE = { north: 32.505129231918936, south: 32.20815332547324, west: -111.005859375, east: -110.654296875, margin: 44 };
  const MPP = 64.59248259040142;
  /* the six life-zone bands (floor in ft, name, colour): data from the 27 Miles grounding bible, not decoration */
  const BANDS = [
    [0, 'Sonoran Desertscrub', 201, 138, 90], [4000, 'Semidesert Grassland', 185, 162, 98],
    [5000, 'Madrean Oak Woodland', 127, 154, 92], [6000, 'Pine-Oak Woodland', 79, 127, 102],
    [7000, 'Ponderosa Pine Forest', 58, 106, 90], [8000, 'Mixed-Conifer Forest', 52, 92, 112],
  ];
  const TOUR_LL = [[32.2560, -110.7300], [32.3703, -110.7175], [32.4431, -110.7883], [32.3768, -110.8792],
    [32.3721, -110.9389], [32.3103, -110.8226], [32.2217, -110.9265]];
  const LANDMARKS = [['Mount Lemmon', 32.4431, -110.7883], ['Mount Kimball', 32.3768, -110.8792],
    ['Summerhaven', 32.4300, -110.7590], ['Windy Point', 32.3703, -110.7175], ['Sabino Canyon', 32.3103, -110.8226],
    ['Pusch Peak', 32.3721, -110.9389], ['Catalina Hwy base', 32.2560, -110.7300], ['Downtown Tucson', 32.2217, -110.9265]];
  const START = { lat: 32.232, lon: -110.80, yaw: -Math.PI / 2, altM: 1700 };   /* over the basin, facing north */
  const SUN_AZ = Math.PI * 0.95;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
  const mercY = (la) => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const bandOf = (ft) => { let k = 0; for (let i = 0; i < BANDS.length; i++) if (ft >= BANDS[i][0]) k = i; return k; };

  /* t from ?t= or from a hash such as #range?t=22 */
  function linkT() {
    let v = parseFloat(new URLSearchParams(location.search).get('t'));
    if (!(v > 0)) { const h = location.hash, q = h.indexOf('?'); if (q >= 0 && /^#range\b/.test(h)) v = parseFloat(new URLSearchParams(h.slice(q + 1)).get('t')); }
    return v > 0 ? Math.min(v, 600) : 0;
  }

  function mount(canvas, params, ctx) {
    let P = Object.assign({}, PARAMS, params);
    const g = canvas.getContext('2d', { alpha: false });
    let buf = document.createElement('canvas'), bctx = buf.getContext('2d');   /* the low-res buffer, upscaled pixelated */
    let BW = 0, BH = 0, img = null, px = null, ybuf = null, skyKey = '';
    let W = 768, H = 768, elev = null, hu = null, colR = null, colG = null, colB = null, contour = null, ready = false, dead = false;
    let VE = P.ve, mN = mercY(B.north), mS = mercY(B.south);
    const toPx = (lat, lon) => ({ x: (lon - B.west) / (B.east - B.west) * W, z: (mN - mercY(lat)) / (mN - mS) * H });
    let TOUR = [], LM = [], fence = null;
    let camX = 0, camZ = 0, yaw = 0, altM = 0, altTarget = 0, autopilot = true, tourIdx = 0;
    let look = 0, idle = 0, stickHeld = false, lastKeys = new Set(), drag = null, wasDown = false, readAt = 0;
    let wantStill = true, cssW = 1, cssH = 1;
    const T0 = linkT();

    /* ---------- labels (DOM, aria-hidden overlay) ---------- */
    const overlay = ctx.overlayFor(canvas);
    const labelEls = LANDMARKS.map((l) => { const s = document.createElement('span'); s.textContent = l[0]; s.style.display = 'none'; overlay.appendChild(s); return s; });
    const labelVis = new Array(LANDMARKS.length).fill(false);

    const cellIdx = (x, z) => clamp(z | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1);
    const elevAt = (x, z) => (x < 0 || z < 0 || x >= W || z >= H) ? BASE_M : elev[cellIdx(x, z)];
    const toUnits = (m) => (m - BASE_M) * VE / MPP;
    function heightAt(x, z) {
      const xi = clamp(x | 0, 0, W - 2), zi = clamp(z | 0, 0, H - 2), fx = clamp(x - xi, 0, 1), fz = clamp(z - zi, 0, 1), i = zi * W + xi;
      return (hu[i] * (1 - fx) + hu[i + 1] * fx) * (1 - fz) + (hu[i + W] * (1 - fx) + hu[i + W + 1] * fx) * fz;
    }

    function setBuffer(w, h) {
      if (w === BW && h === BH && img) return;
      BW = w; BH = h; buf.width = w; buf.height = h; img = bctx.createImageData(w, h); px = img.data; px32 = new Uint32Array(px.buffer); ybuf = new Float32Array(w); skyKey = '';
    }
    /* colour + height tables, built in row chunks so a phone keeps scrolling while the grid is prepared */
    function build(done) {
      const n = W * H; hu = new Float32Array(n); colR = new Uint8Array(n); colG = new Uint8Array(n); colB = new Uint8Array(n); contour = new Uint8Array(n);
      let lx = -0.80, ly = 0.55, lz = 0.28; const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
      const shadeVE = 1.6;
      let z = 0;
      (function chunk() {
        if (dead) return;
        const zEnd = Math.min(H, z + 128);
        for (; z < zEnd; z++) for (let x = 0; x < W; x++) {
          const i = z * W + x, e = elev[i], ft = e * FT; hu[i] = toUnits(e);
          const k = bandOf(ft); let r = BANDS[k][2], gg = BANDS[k][3], b = BANDS[k][4];
          if (k < BANDS.length - 1) {
            const t = clamp((ft - (BANDS[k + 1][0] - 120)) / 120, 0, 1);
            if (t > 0) { const nb = BANDS[k + 1]; r += (nb[2] - r) * t; gg += (nb[3] - gg) * t; b += (nb[4] - b) * t; }
          }
          const eW = elevAt(x - 1, z), eE = elevAt(x + 1, z), eN = elevAt(x, z - 1), eS = elevAt(x, z + 1);
          let nx = -(eE - eW) / (2 * MPP) * shadeVE, nz = -(eS - eN) / (2 * MPP) * shadeVE, ny = 1;
          const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          const sh = 0.26 + 0.91 * Math.max(0, nx * lx + ny * ly + nz * lz);
          colR[i] = clamp(r * sh, 0, 255); colG[i] = clamp(gg * sh, 0, 255); colB[i] = clamp(b * sh, 0, 255);
        }
        if (z < H) setTimeout(chunk, 0); else { rebuildContours(); done(); }
      })();
    }
    const rebuildHeights = () => { for (let i = 0; i < W * H; i++) hu[i] = toUnits(elev[i]); };
    function rebuildContours() {
      const interval = clamp(P.contourM, 40, 600);
      for (let i = 0; i < W * H; i++) {
        const level = elev[i] / interval;
        contour[i] = Math.round(Math.max(0, 1 - Math.abs(level - Math.round(level)) * 22) * 255);
      }
    }

    function reset() {
      const s = toPx(START.lat, START.lon);
      camX = s.x; camZ = s.z; yaw = START.yaw; altM = START.altM; altTarget = START.altM; tourIdx = 0; autopilot = true; look = 0; idle = 0;
    }
    function aheadMax() {
      let a = 0; for (let s = 10; s <= 90; s += 10) a = Math.max(a, elevAt(camX + Math.cos(yaw) * s, camZ + Math.sin(yaw) * s));
      return a;
    }
    /* one fixed step of the flight model (the Labs page's, byte for byte in behaviour) */
    function step(dt, speedK, yawIn) {
      if (autopilot) {
        const t = TOUR[tourIdx], dx = t.x - camX, dz = t.z - camZ;
        if (Math.hypot(dx, dz) < 22) tourIdx = (tourIdx + 1) % TOUR.length;
        yaw += wrap(Math.atan2(dz, dx) - yaw) * Math.min(1, 1.6 * dt);
      } else {
        yaw += yawIn * dt;
      }
      altTarget = Math.max(1500, aheadMax() + P.cruiseAgl);           /* terrain-following in both modes: there is no altitude stick here */
      const m = FENCE.margin;
      if (camX < fence.x0 + m || camZ < fence.z0 + m || camX > fence.x1 - m || camZ > fence.z1 - m)
        yaw += wrap(Math.atan2((fence.z0 + fence.z1) / 2 - camZ, (fence.x0 + fence.x1) / 2 - camX) - yaw) * Math.min(1, 2.2 * dt);
      const v = P.speed * speedK;
      camX = clamp(camX + Math.cos(yaw) * v * dt, fence.x0 + 2, fence.x1 - 3);
      camZ = clamp(camZ + Math.sin(yaw) * v * dt, fence.z0 + 2, fence.z1 - 3);
      const gnd = elevAt(camX, camZ);
      altM += (altTarget - altM) * Math.min(1, 2.0 * dt);
      if (altM < gnd + P.minAgl) { altM = gnd + P.minAgl; if (altTarget < altM) altTarget = altM; }
    }
    function fastForward(tt) { reset(); for (let s = 0; s < tt; s += DT) step(DT, 1, 0); }

    /* ---------- render ---------- */
    /* sky: one packed colour per scanline from the tokens, filled row by row (a memset, not a pixel loop) */
    let px32 = null, skyTop = null, skyHz = null, skyRow = null;
    function skyTable(tok) {
      const key = BH + '|' + tok.field + tok.horizonTint;
      if (key !== skyKey) { skyKey = key; skyTop = BONEYARD_RGB(tok.field); skyHz = BONEYARD_RGB(tok.horizonTint); skyRow = new Uint32Array(BH); }
      const hy = BH * ctx.vp.y, top = skyTop, hz = skyHz;
      for (let y = 0; y < BH; y++) {
        const t = y < hy ? Math.pow(y / hy, 1.6) : 1;
        skyRow[y] = (255 << 24) | ((top[2] + (hz[2] - top[2]) * t) << 16) | ((top[1] + (hz[1] - top[1]) * t) << 8) | (top[0] + (hz[0] - top[0]) * t);
      }
      for (let y = 0; y < BH; y++) px32.fill(skyRow[y], y * BW, y * BW + BW);
    }
    /* Illustrative fixed sky points, not a star catalogue. Bearing follows the real camera yaw. */
    function skyPoints(view, horizonY) {
      const ink = BONEYARD_RGB(ctx.tokens.phosphorCore);
      for (let i = 0; i < 156; i++) {
        const bearing = ((i * 2.3999632297) % (Math.PI * 2)) - Math.PI;
        const rel = wrap(bearing - view);
        if (Math.abs(rel) > P.fov * 0.5) continue;
        const x = Math.floor((rel / P.fov + 0.5) * BW);
        const y = Math.floor(horizonY * (0.07 + (((i * 47) % 149) / 149) * 0.71));
        const a = 0.12 + (i % 5) * 0.075;
        const q = (y * BW + x) * 4;
        for (let c = 0; c < 3; c++) px[q + c] += (ink[c] - px[q + c]) * a;
      }
    }
    function draw() {
      if (!ready || !px) return;
      const tok = ctx.tokens;
      skyTable(tok);
      const fov = P.fov, far = P.far, horizonY = BH * ctx.vp.y;
      const scale = (BW / fov) * 0.5625 * Math.max(1, Math.min(1.8, (BH / BW) * 0.9));   /* portrait: taller relief, same horizontal fov */
      const view = yaw;
      skyPoints(view, horizonY);
      /* the sun, low in the west, in the tube's amber */
      const sunRel = wrap(SUN_AZ - view);
      if (Math.abs(sunRel) < fov * 0.5 + 0.2) {
        const am = BONEYARD_RGB(tok.amber), R = Math.max(10, BW * 0.05);
        const sx = (sunRel + fov / 2) / fov * BW, sy = horizonY * 0.62;
        const x0 = Math.max(0, (sx - R) | 0), x1 = Math.min(BW - 1, (sx + R) | 0), y0 = Math.max(0, (sy - R) | 0), y1 = Math.min(horizonY | 0, (sy + R) | 0);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - sx, y - sy); if (d > R) continue;
          const i = (y * BW + x) * 4, a = d < R * 0.22 ? 1 : Math.max(0, 1 - (d - R * 0.22) / (R * 0.78)) * 0.5;
          px[i] += (am[0] - px[i]) * a; px[i + 1] += (am[1] - px[i + 1]) * a; px[i + 2] += (am[2] - px[i + 2]) * a;
        }
      }
      const FOG = BONEYARD_RGB(tok.horizonTint), camH = toUnits(altM);
      const wire = BONEYARD_RGB(tok.phosphor), core = BONEYARD_RGB(tok.phosphorCore);
      const fr = FOG[0], fg = FOG[1], fb = FOG[2];
      for (let col = 0; col < BW; col++) {
        const rel = -fov * 0.5 + fov * ((col + 0.5) / BW), ang = view + rel, cosA = Math.cos(rel);
        const dx = Math.cos(ang), dz = Math.sin(ang);
        let maxY = BH, dist = 2.5;
        while (dist < far && maxY > 0) {
          const mx = camX + dx * dist, mz = camZ + dz * dist;
          const inside = mx >= 0 && mz >= 0 && mx < W && mz < H;
          const idx = inside ? ((mz | 0) * W + (mx | 0)) : -1;
          const hh = inside ? (dist < 100 ? heightAt(mx, mz) : hu[idx]) : 0;
          const sy = ((camH - hh) / (dist * cosA)) * scale + horizonY;
          if (sy < maxY) {
            const f = dist / far, fog = Math.exp(-f * f * clamp(P.haze, 0.2, 3) * 2.7);
            let r, gg, b;
            if (inside) { r = colR[idx]; gg = colG[idx]; b = colB[idx]; } else { r = 150; gg = 112; b = 84; }
            r = r * fog + fr * (1 - fog); gg = gg * fog + fg * (1 - fog); b = b * fog + fb * (1 - fog);
            const y0 = sy < 0 ? 0 : sy | 0, y1 = maxY | 0;
            for (let y = y0; y < y1; y++) { const i = (y * BW + col) * 4; px[i] = r; px[i + 1] = gg; px[i + 2] = b; }
            if (inside && y0 < y1 && y0 < BH) {
              const near = Math.min(1, 38 / Math.max(1, dist));
              const lattice = ((mx | 0) % 32 === 0 || (mz | 0) % 32 === 0) ? clamp(P.survey, 0, 0.7) * near : 0;
              const a = Math.max(contour[idx] / 255 * clamp(P.contours, 0, 0.85), lattice) * fog;
              const q = (y0 * BW + col) * 4;
              if (a > 0.01) for (let c = 0; c < 3; c++) px[q + c] += ((lattice > a ? core[c] : wire[c]) - px[q + c]) * a;
            }
            maxY = sy;
          }
          dist += 0.45 + dist * 0.011;
        }
        ybuf[col] = maxY;
      }
      bctx.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(buf, 0, 0, canvas.width, canvas.height);
      placeLabels(view, camH, horizonY, scale);
    }
    /* the highest screen row nearer ground reaches in column c before the ray gets to distance d: a landmark whose
       projected ground sits below that row is hidden. The same march as draw(), one column, stopped early. */
    function occluder(c, d, view, camH, horizonY, scale) {
      const fov = P.fov, rel = -fov * 0.5 + fov * ((c + 0.5) / BW), ang = view + rel, cosA = Math.cos(rel);
      const dx = Math.cos(ang), dz = Math.sin(ang), stop = (d - 3) / cosA;
      let maxY = BH, dist = 2.5;
      while (dist < stop && maxY > 0) {
        const mx = camX + dx * dist, mz = camZ + dz * dist;
        const hh = (mx >= 0 && mz >= 0 && mx < W && mz < H) ? (dist < 100 ? heightAt(mx, mz) : hu[(mz | 0) * W + (mx | 0)]) : 0;
        const sy = ((camH - hh) / (dist * cosA)) * scale + horizonY;
        if (sy < maxY) maxY = sy;
        dist += 0.45 + dist * 0.011;
      }
      return maxY;
    }
    function placeLabels(view, camH, horizonY, scale) {
      if (!cssW || cssW < 2) { cssW = canvas.clientWidth || 1; cssH = canvas.clientHeight || 1; }
      const fov = P.fov, far = P.far;
      for (let k = 0; k < LM.length; k++) {
        const l = LM[k], el = labelEls[k];
        const dx = l.x - camX, dz = l.z - camZ, dist = Math.hypot(dx, dz), rel = wrap(Math.atan2(dz, dx) - view);
        if (!P.labels || dist < 6 || dist > far * 0.92 || Math.abs(rel) > fov * 0.42) { if (labelVis[k]) el.style.display = 'none'; labelVis[k] = false; continue; }
        const colf = (rel + fov / 2) / fov * BW, hh = hu[cellIdx(l.x, l.z)];
        const sy = ((camH - hh) / (dist * Math.cos(rel))) * scale + horizonY;
        const c = clamp(colf | 0, 0, BW - 1);
        const top = occluder(c, dist * Math.cos(rel), view, camH, horizonY, scale);
        /* hysteresis: appear when clearly in front of the nearer ground, vanish only when clearly behind it (no flicker on far ridges) */
        const vis = sy >= 0 && (labelVis[k] ? sy <= top + 4 : sy < top + 1);
        if (!vis) { if (labelVis[k]) el.style.display = 'none'; labelVis[k] = false; continue; }
        if (!labelVis[k]) el.style.display = 'block';
        labelVis[k] = true;
        el.style.transform = 'translate3d(' + clamp(colf / BW * cssW, 64, Math.max(64, cssW - 64)).toFixed(1) + 'px,' + (sy / BH * cssH).toFixed(1) + 'px,0) translate(-50%,-100%)';
        el.style.opacity = String(clamp(1.25 - dist / far, 0.35, 1).toFixed(2));
      }
    }
    function readout(force) {
      const now = performance.now();
      if (!force && now - readAt < 140) return;
      readAt = now;
      const gft = elevAt(camX, camZ) * FT;
      ctx.readout('range', 'ALT ' + fmt(altM * FT) + ' ft · GROUND ' + fmt(gft) + ' ft · ' + BANDS[bandOf(gft)][1] + ' · ' + VE + 'x vertical' + (autopilot ? '' : ' · stick'));
    }

    /* ---------- the grid arrives ---------- */
    ctx.dem().then((dem) => {
      if (dead) return;
      W = dem.width; H = dem.height; elev = dem.elev;
      mN = mercY(B.north); mS = mercY(B.south);
      TOUR = TOUR_LL.map((p) => toPx(p[0], p[1]));
      LM = LANDMARKS.map((l) => toPx(l[1], l[2]));
      const a = toPx(FENCE.north, FENCE.west), b = toPx(FENCE.south, FENCE.east);
      fence = { x0: a.x, z0: a.z, x1: b.x, z1: b.z };
      build(() => {
        if (dead) return;
        ready = true;
        fastForward(T0 || P.stillT);
        if (wantStill || ctx.dial === 'still') { draw(); readout(true); }
      });
    }).catch(() => { ctx.readout('range', 'elevation grid unavailable'); });

    /* ---------- input: ctx.keys and ctx.pointer, read each tick ---------- */
    function input(dt, pointer) {
      const keys = ctx.keys;
      const edge = (k) => keys.has(k) && !lastKeys.has(k);
      if (edge('a')) { autopilot = !autopilot; stickHeld = !autopilot; idle = 0; }
      if (edge('v')) { VE = VE >= 3 ? 1 : VE + 1; rebuildHeights(); }
      if (edge('r')) { reset(); stickHeld = false; }
      lastKeys = new Set(keys);
      let yawIn = 0;
      const kYaw = (keys.has('ArrowLeft') ? -1 : 0) + (keys.has('ArrowRight') ? 1 : 0);
      if (kYaw) yawIn += kYaw * 1.3;
      /* drag: arms only on a sideways move (|dx| > 8 and |dx| > |dy|), so a vertical scroll swipe never takes the stick */
      if (pointer.down && !wasDown) drag = { x: pointer.x, y: pointer.y, armed: false };
      if (!pointer.down) drag = null;
      wasDown = pointer.down;
      if (drag) {
        const dx = pointer.x - drag.x, dy = pointer.y - drag.y;
        if (!drag.armed && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) drag.armed = true;
        if (drag.armed) { look = clamp(dx / Math.max(120, (canvas.clientWidth || 800) * 0.3), -1, 1); yawIn += look * 1.5; }
      } else look = 0;
      if (yawIn) { if (autopilot) autopilot = false; idle = 0; }
      else if (!autopilot && !stickHeld) { idle += dt; if (idle > P.idleResume) { autopilot = true; idle = 0; } }
      return yawIn;
    }

    return {
      tick(dt, t, progress, pointer) {
        if (!ready) return;
        wantStill = false;
        const calm = ctx.dial === 'calm' ? 0.5 : 1;
        const yawIn = input(dt, pointer || ctx.pointer) * calm;
        step(Math.min(0.05, dt), calm, yawIn);
        draw();
        readout(false);
      },
      resize(w, h) {
        /* the long side of the buffer is P.buffer pixels (the Labs page's rule): a phone costs what a desktop costs */
        const aspect = Math.max(1, w) / Math.max(1, h), L = Math.round(clamp(P.buffer, 240, 640));
        setBuffer(aspect >= 1 ? L : Math.max(160, Math.round(L * aspect)), aspect >= 1 ? Math.max(120, Math.round(L / aspect)) : L);
        cssW = canvas.clientWidth || 0; cssH = canvas.clientHeight || 0;
        if (ready) draw();
      },
      still() {
        wantStill = true;
        if (!ready) return;
        fastForward(T0 || P.stillT);
        draw(); readout(true);
      },
      turn(degrees) { if (!ready) return; yaw += degrees * Math.PI / 180; autopilot = false; idle = 0; draw(); readout(true); },
      params(p) {
        const veChanged = p.ve !== P.ve;
        const bufChanged = p.buffer !== P.buffer;
        const contoursChanged = p.contourM !== P.contourM;
        P = Object.assign({}, PARAMS, p);
        if (bufChanged) { BW = 0; this.resize(canvas.width, canvas.height); }
        if (veChanged) { VE = clamp(Math.round(P.ve), 1, 3); if (ready) rebuildHeights(); }
        if (contoursChanged && ready) rebuildContours();
        if (ready) draw();
      },
      destroy() {
        dead = true; ready = false;
        for (const el of labelEls) el.remove();
        elev = hu = colR = colG = colB = contour = null; img = px = px32 = ybuf = skyRow = null; buf = bctx = null;
      },
    };
  }

  /* token colour -> [r, g, b] (the runtime's parser, reached through the global it exports) */
  function BONEYARD_RGB(c) { return BONEYARD.toRgb(c); }

  BAYS.push({ slug: 'range', title: 'Range', order: 3, role: 'bay', params: PARAMS, mount, dem: true });
})();
