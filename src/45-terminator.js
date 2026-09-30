/* BONEYARD PART · 06 · TERMINATOR
 * technique   a back-culled dotted sphere in orthographic projection with faint graticule, land drawn as denser and
 *             brighter dots from a 1-degree land mask, lit by a Lambert term from the real sub-solar point so the
 *             day line sits where it sits right now
 * lineage     Elite's dotted planets (David Braben and Ian Bell, Acornsoft, 1984); the IRIX-era wireframe globe
 *             (Silicon Graphics workstations, early 1990s)
 * original    the sun is computed, not animated: solar declination plus the equation of time from the visitor's
 *             clock place the sub-solar point, and the readout prints it with the sun's real altitude over Tucson,
 *             whose one dot is amber; the sunlit limb is stroked amber in proportion to how lit it is; the globe is
 *             centred on the site's shared vanishing point, so the pointer parallax that moves every other room
 *             moves the planet too; drag spins it and it comes home to face Tucson
 * not         precise: the low-precision solar formulas (Astronomical Almanac style) are good to about 0.1 degree, but
 *             the drawn day line is a sharp Lambert edge with no refraction or twilight, which puts the visible
 *             line up to about a degree from where the sun actually sets. The land mask is Natural Earth 110m
 *             rasterised to 1 degree, so small islands and narrow coasts are coarse. No city lights: there is no data
 *             for them here, so the night side is simply dim.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.67 ms per full redraw @ 2160x1350 internal (1440x900 x1.5), 0.52 ms/frame on the parts counter while
 *             dragging, 0.01 ms/frame idle (it redraws only on change); headless Chromium, software raster (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Two Fibonacci spheres give the dots: a sparse one kept everywhere (the ocean) and a dense one kept only where the
 * land mask has a bit set, so continents read as crowded, brighter dots. The mask is 360 x 180 bits, row 0 at 90 N,
 * column 0 at 180 W; it loads after mount, and the globe redraws when it arrives.
 *
 * The sun: from days since J2000 the sun's mean longitude and mean anomaly give its ecliptic longitude, then its
 * declination and right ascension. The equation of time is mean longitude minus right ascension. The sub-solar point
 * is at latitude = declination and longitude = 180 - 15 x UTC hours - equation of time (in degrees). Each dot's
 * brightness is ambient plus the Lambert term max(0, n . s), binned into a handful of alpha levels so the whole globe
 * is about twenty fills. Dots with a negative view-space z are behind the globe and are culled.
 *
 * Rotation brings Tucson (32.22 N, 110.97 W) to the centre of the disc. A horizontal drag (touch only once it is
 * clearly sideways) spins the globe about its axis; released, it waits and eases back to face Tucson. Nothing moves
 * on its own: the sun is recomputed every few seconds and the frame is redrawn only when something changed.
 */
(() => {
  'use strict';
  const PARAMS = {
    radius: 0.31,        /* globe radius, fraction of height (and at most 0.36 of width) */
    oceanDots: 2600,
    landDots: 11000,     /* dense sphere, kept only over land */
    ambient: 0.34,       /* night-side brightness */
    oceanLevel: 0.55,    /* ocean dot brightness relative to land */
    dotPx: 2,            /* land dot size, CSS px */
    oceanPx: 1.3,
    graticuleDeg: 30,
    graticuleAlpha: 0.22,
    limbAlpha: 0.85,     /* amber on the sunlit limb */
    dayLine: true,       /* stroke the terminator great circle, faintly */
    returnAfter: 1.8,    /* seconds after a drag before it turns home */
    dragDegPerPx: 0.3,
    sunEvery: 5,         /* seconds between sun recomputes while live */
  };
  const TUCSON = { lat: 32.22, lon: -110.97 };
  const D2R = Math.PI / 180;

  /* sub-solar point from a Date (low-precision solar coordinates, about 0.01 degree in declination) */
  function sun(date) {
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
    const gA = ((357.528 + 0.9856003 * n) % 360) * D2R;
    const lam = (L + 1.915 * Math.sin(gA) + 0.020 * Math.sin(2 * gA)) * D2R;
    const eps = (23.439 - 0.0000004 * n) * D2R;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam)) / D2R;
    const ra = ((Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / D2R) + 360) % 360;
    const eot = ((L - ra) % 360 + 540) % 360 - 180;                  /* degrees; x4 = minutes */
    const ut = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const lon = ((180 - 15 * ut - eot) % 360 + 540) % 360 - 180;
    return { lat: dec, lon, eotMin: eot * 4 };
  }
  const unit = (lat, lon) => { const a = lat * D2R, b = lon * D2R; return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]; };
  function fib(n) {
    const out = new Float32Array(n * 2), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2;
      out[i * 2] = Math.asin(y) / D2R;
      out[i * 2 + 1] = ((i * ga / D2R) % 360 + 540) % 360 - 180;
    }
    return out;
  }
  function maskUrls() {
    const inParts = /\/parts\//.test(location.pathname);
    const a = new URL('assets/land-mask.json', document.baseURI).href, b = new URL('../assets/land-mask.json', document.baseURI).href;
    return inParts ? [b, a] : [a, b];
  }
  let maskPromise = null;
  function loadMask() {
    if (maskPromise) return maskPromise;
    const urls = maskUrls();
    const tryAt = (i) => fetch(urls[i]).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch((err) => { if (i + 1 < urls.length) return tryAt(i + 1); throw err; });
    maskPromise = tryAt(0).then((j) => {
      const bin = atob(j.bits), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const W = j.width || 360, H = j.height || 180;
      return (lat, lon) => {
        const r = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) * H / 180)));
        const c = ((Math.floor((lon + 180) * W / 360) % W) + W) % W;
        const k = r * W + c;
        return (bytes[k >> 3] >> (7 - (k & 7))) & 1;
      };
    }).catch((err) => { maskPromise = null; throw err; });
    return maskPromise;
  }
  function placeLabel(lat, lon) {
    const a = Math.abs(lat).toFixed(1) + (lat < 0 ? ' S' : ' N');
    const b = Math.abs(lon).toFixed(1) + (lon < 0 ? ' W' : ' E');
    return a + ', ' + b;
  }

  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, px = 1, dead = false;
    let land = null, ocean = fib(Math.round(params.oceanDots)), isLand = null, oceanKeep = null;
    let S = sun(new Date()), sunAt = 0, sinceReadout = 0, spin = 0, drag = null, idle = 99, dirty = true, lastKey = '', lastReadout = '';

    function prepare() {
      if (!isLand) return;
      const all = fib(Math.round(params.landDots)), keep = [];
      for (let i = 0; i < all.length / 2; i++) if (isLand(all[i * 2], all[i * 2 + 1])) keep.push(all[i * 2], all[i * 2 + 1]);
      land = new Float32Array(keep);
      oceanKeep = new Uint8Array(ocean.length / 2);
      for (let i = 0; i < oceanKeep.length; i++) oceanKeep[i] = isLand(ocean[i * 2], ocean[i * 2 + 1]) ? 0 : 1;
    }
    loadMask().then((fn) => { if (dead) return; isLand = fn; prepare(); dirty = true; draw(); }).catch(() => {});

    const BINS = 7;
    function draw() {
      dirty = false;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      const T = ctx.tokens;
      const R = Math.min(h * params.radius, w * 0.36), cx = ctx.vp.x * w, cy = ctx.vp.y * h;
      const grow = Math.min(2, Math.max(1, R / (150 * px)));             /* dots keep their density on a big globe */
      /* rotation: longitude so the facing meridian is at +z, then tilt by Tucson's latitude */
      const lon0 = TUCSON.lon + spin, lat0 = TUCSON.lat * D2R, cl = Math.cos(lat0), sl = Math.sin(lat0);
      const rot = (lat, lon, out) => {
        const a = lat * D2R, b = (lon - lon0) * D2R, ca = Math.cos(a);
        const x = ca * Math.sin(b), y = Math.sin(a), z = ca * Math.cos(b);
        out[0] = x; out[1] = y * cl - z * sl; out[2] = y * sl + z * cl;
      };
      const v = [0, 0, 0], s = [0, 0, 0];
      rot(S.lat, S.lon, s);
      /* the disc: a faint fill so the globe reads as a body against the stars, and the dim limb */
      g.globalAlpha = 1; g.fillStyle = T.field; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      /* graticule, front half only */
      const grat = new Path2D(), step = params.graticuleDeg;
      const seg = (fn) => { let pen = false; for (let u = 0; u <= 360; u += 4) { const [la, lo] = fn(u); rot(la, lo, v); if (v[2] > 0) { const X = cx + R * v[0], Y = cy - R * v[1]; if (pen) grat.lineTo(X, Y); else grat.moveTo(X, Y); pen = true; } else pen = false; } };
      if (step > 0) {
        for (let lo = -180; lo < 180; lo += step) seg((u) => [Math.min(90, u / 2 - 90), lo]);
        for (let la = -90 + step; la < 90; la += step) seg((u) => [la, u - 180]);
      }
      g.lineWidth = 1 * px; g.strokeStyle = T.phosphor; g.globalAlpha = params.graticuleAlpha; g.stroke(grat);
      /* dots, binned by brightness */
      const paths = [[], []];
      for (let b = 0; b < BINS; b++) { paths[0].push(new Path2D()); paths[1].push(new Path2D()); }
      const put = (set, kind, keepArr) => {
        if (!set) return;
        const size = (kind ? params.oceanPx : params.dotPx) * px * grow, half = size / 2;
        for (let i = 0, n = set.length / 2; i < n; i++) {
          if (keepArr && !keepArr[i]) continue;
          rot(set[i * 2], set[i * 2 + 1], v);
          if (v[2] <= 0.02) continue;
          const lit = Math.max(0, v[0] * s[0] + v[1] * s[1] + v[2] * s[2]);
          const amb = kind ? params.ambient * 0.45 : params.ambient;          /* night ocean nearly black, night land still legible */
          const lum = amb + (1 - amb) * lit;
          const b = Math.min(BINS - 1, Math.floor(lum * BINS));
          const k = 0.55 + 0.45 * v[2];                                /* foreshorten toward the limb */
          paths[kind][b].rect(cx + R * v[0] - half * k, cy - R * v[1] - half, size * k, size);
        }
      };
      put(land, 0, null);
      put(ocean, 1, oceanKeep);
      g.fillStyle = T.phosphorCore;
      for (let kind = 0; kind < 2; kind++) {
        const lvl = kind ? params.oceanLevel : 1;
        for (let b = 0; b < BINS; b++) { g.globalAlpha = Math.min(1, ((b + 1) / BINS) * lvl); g.fill(paths[kind][b]); }
      }
      /* the day line: the great circle perpendicular to the sun, front half */
      if (params.dayLine) {
        const e1 = Math.abs(s[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let ax = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
        const al = Math.hypot(ax[0], ax[1], ax[2]); ax = ax.map((c) => c / al);
        const bx = [s[1] * ax[2] - s[2] * ax[1], s[2] * ax[0] - s[0] * ax[2], s[0] * ax[1] - s[1] * ax[0]];
        const dl = new Path2D(); let pen = false;
        for (let u = 0; u <= 360; u += 3) {
          const c = Math.cos(u * D2R), sn = Math.sin(u * D2R);
          const x = ax[0] * c + bx[0] * sn, y = ax[1] * c + bx[1] * sn, z = ax[2] * c + bx[2] * sn;
          if (z > 0) { const X = cx + R * x, Y = cy - R * y; if (pen) dl.lineTo(X, Y); else dl.moveTo(X, Y); pen = true; } else pen = false;
        }
        g.setLineDash([2 * px, 5 * px]); g.lineWidth = 1 * px; g.strokeStyle = T.amber; g.globalAlpha = 0.45; g.stroke(dl); g.setLineDash([]);
      }
      /* the limb: dim all round, amber where the sun lights it */
      g.lineWidth = 1 * px; g.strokeStyle = T.phosphor; g.globalAlpha = 0.28;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
      const N = 144, limb = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      for (let i = 0; i < N; i++) {
        const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
        const lit = Math.cos(am) * s[0] + Math.sin(am) * s[1];            /* limb normal (cos, sin, 0), y up */
        if (lit <= 0.02) continue;
        const b = Math.min(3, Math.floor(lit * 4));
        limb[b].moveTo(cx + R * Math.cos(a0), cy - R * Math.sin(a0)); limb[b].lineTo(cx + R * Math.cos(a1), cy - R * Math.sin(a1));
      }
      g.lineCap = 'round'; g.strokeStyle = T.amber;
      for (let b = 0; b < 4; b++) {
        const a = (b + 0.5) / 4 * params.limbAlpha;
        g.lineWidth = 4 * px; g.globalAlpha = a * 0.22; g.stroke(limb[b]);
        g.lineWidth = 1.4 * px; g.globalAlpha = a; g.stroke(limb[b]);
      }
      /* Tucson */
      rot(TUCSON.lat, TUCSON.lon, v);
      if (v[2] > 0) {
        const X = cx + R * v[0], Y = cy - R * v[1];
        g.fillStyle = T.amber;
        g.globalAlpha = 0.25; g.beginPath(); g.arc(X, Y, 5 * px, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1; g.beginPath(); g.arc(X, Y, 2.2 * px, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }

    function readout() {
      /* the sun's altitude over Tucson from the same sub-solar vector: sin(alt) = n_tucson . s */
      const a = unit(TUCSON.lat, TUCSON.lon), b = unit(S.lat, S.lon);
      const alt = Math.asin(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / D2R;
      const ha = ((TUCSON.lon - S.lon) % 360 + 540) % 360 - 180;         /* local solar hour angle, degrees */
      const half = ha < 0 ? 'morning' : 'afternoon';
      let when;
      if (alt > -0.83) when = Math.abs(ha) < 7.5 ? 'midday' : half;
      else if (alt > -18) when = ha < 0 ? 'dawn twilight' : 'dusk twilight';
      else when = 'night';
      const text = `sub-solar point ${placeLabel(S.lat, S.lon)} · Tucson: ${when}, sun ${Math.abs(Math.round(alt))}° ${alt >= 0 ? 'up' : 'down'}`;
      if (text !== lastReadout || sinceReadout > 0.5) { lastReadout = text; sinceReadout = 0; ctx.readout('terminator', text); }
    }

    /* the host throttles readouts on the leading edge; one trailing emit makes sure the Still frame's line lands */
    let flushT = 0;
    const flushLater = () => { clearTimeout(flushT); flushT = setTimeout(() => { if (!dead) { lastReadout = ''; readout(); } }, 400); };

    return {
      tick(dt, t, progress, pointer) {
        sunAt += dt;
        if (sunAt > params.sunEvery) { sunAt = 0; S = sun(new Date()); dirty = true; readout(); }
        if (pointer.down) {
          if (!drag) drag = { x0: pointer.x, y0: pointer.y, spin0: spin, armed: false, dead: false };
          const dx = pointer.x - drag.x0, dy = pointer.y - drag.y0;
          if (!drag.armed && !drag.dead) {
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { drag.armed = true; drag.x0 = pointer.x; drag.spin0 = spin; }
            else if (Math.abs(dy) > 8) drag.dead = true;
          }
          if (drag.armed) { const ns = drag.spin0 - (pointer.x - drag.x0) * params.dragDegPerPx; if (ns !== spin) { spin = ns; dirty = true; } idle = 0; }
        } else if (drag) drag = null;
        if (!drag || !drag.armed) {
          idle += dt;
          if (spin !== 0 && idle > params.returnAfter) {
            const target = Math.round(spin / 360) * 360, k = 1 - Math.exp(-dt / (ctx.dial === 'calm' ? 1.0 : 0.5));
            spin += (target - spin) * k;
            if (Math.abs(target - spin) < 0.02) spin = 0;                 /* a whole turn is the same pose */
            dirty = true;
          }
        }
        /* redraw only on change: spin, sun, size, or the vanishing point moving under pointer parallax */
        const key = `${w}x${h} ${ctx.vp.x.toFixed(4)} ${ctx.vp.y.toFixed(4)}`;
        if (key !== lastKey) { lastKey = key; dirty = true; }
        if (dirty) draw();
        sinceReadout += dt; if (sinceReadout > 0.5) readout();
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); dirty = true; },
      still() { spin = 0; S = sun(new Date()); draw(); lastReadout = ''; readout(); flushLater(); },
      destroy() { dead = true; clearTimeout(flushT); g.clearRect(0, 0, w, h); land = ocean = oceanKeep = null; },
      params(p) {
        const reseed = p.oceanDots !== params.oceanDots || p.landDots !== params.landDots;
        params = p;
        if (reseed) { ocean = fib(Math.round(params.oceanDots)); prepare(); }
        draw();
      },
    };
  }
  BAYS.push({ slug: 'terminator', title: 'Terminator', order: 6, role: 'bay', params: PARAMS, mount });
})();
