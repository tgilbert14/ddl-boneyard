/* BONEYARD PART · 01 · JUMP
 * technique   1/z starfield in warp: stars flow toward the camera along rays from the vanishing point and are drawn as
 *             streaks whose length is the warp; press-and-hold raises warp, release settles to cruise
 * lineage     the Star Wars jump (1977); the demoscene 1/z starfields (early 1990s); Windows 3.1 Starfield Simulation (1992)
 * original    the hold room for HYPERSPACE: the same projection and the same vanishing point as the corridor and the row
 *             (pointer parallax on the point is the core's, so the whole world shifts together); warp is a time
 *             constant, not a keyframe, so a tap flickers and a hold builds; the hold is punching it: warp ramps in
 *             about half a second, the nearest streaks go white-hot over an amber halo, an amber core blooms at the
 *             vanishing point, and in Full the cores split red, green and blue and the camera shakes a few px
 *             (published as ctx.share.punch for the sound); a translucent field fill gives cheap persistence without
 *             the tube; the still is mid-warp phosphor streaks, the frame that reads as "hyperspace" (amber is for the hold)
 * not         random speed changes, a tunnel, a lens flare, a flash, autoplay warp. Cruise is quiet; only a hold raises it.
 * deps        none · Canvas 2D · 2026-09
 * budget      0.12 ms/frame JS avg (0.7 max) @ 1440x900 dpr 1, headless desktop Chromium (2026-09-30); raster not in this number; phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * count stars live in camera space with x and y spread around the line of flight and z between zNear and zFar. Each
 * frame every z decreases by (drift + warp^2 * warpDrift) * dt; a star that passes zNear respawns at zFar with new
 * x, y. A star projects to (vpX + f x / z, vpY + f y / z) with f = focalK * height; its streak runs from that head
 * back to the projection at z + warp * streakLen, so all streaks point at the vanishing point and lengthen with warp.
 *
 * Warp eases toward holdWarp while the pointer, a finger or Space is held and toward cruiseWarp otherwise, each with
 * its own time constant (riseTime up, settleTime down). Instead of clearing, the frame is washed with the field colour
 * at trailAlpha (less at high warp, so trails lengthen), which leaves a persistence trail. Stars nearer than hotZ are
 * the hot set: an amber halo under a white core. An amber radial glow at the vanishing point grows with warp squared.
 * In Full, above warp 0.55, the hot set's core strokes are repeated in pure red, green and blue, scaled about the vanishing
 * point and added with 'lighter' (the chromatic split), and the draw offset shakes; both are written to ctx.share.
 * The split and the shake ride a transient kick (1 on the press, 0.8 when warp crosses 0.6, 110 ms decay) over a
 * small sustained level; ctx.share.punch is the kick alone, ctx.share.warp the sustained warp.
 * Calm halves the speeds and drops the split and the shake. Changing count, spread, ySpread, zNear or zFar rebuilds
 * the field (compared against a snapshot taken at build, because the harness mutates the params object in place).
 */
(() => {
  'use strict';
  const PARAMS = {
    count: 420,
    spread: 9, ySpread: 6.5,
    zNear: 0.9, zFar: 42,
    focalK: 0.62,
    drift: 2.4,          /* units per second at cruise */
    warpDrift: 40,       /* extra units per second at warp 1 (scaled by warp squared: the kick lands late and hard) */
    cruiseWarp: 0.18,
    holdWarp: 1.0,
    riseTime: 0.55,      /* seconds to ~95% of hold */
    settleTime: 0.9,
    streakLen: 10,
    trailAlpha: 0.5,     /* field wash per frame at cruise: lower = longer trails */
    trailHot: 0.28,      /* field wash per frame at full warp */
    haloWidth: 3.6, coreWidth: 1.3,
    haloAlpha: 0.22, coreAlpha: 0.95,
    hotZ: 8,             /* stars nearer than this burn white over amber */
    coreGlow: 0.5,       /* amber bloom at the vanishing point, alpha at warp 1 */
    chromaK: 0.014,
    shakePx: 5,
    kickTau: 0.11,       /* seconds: the punch transient's decay */
    stillWarp: 0.5,
  };
  const RGB = ['rgb(255,40,40)', 'rgb(40,255,90)', 'rgb(60,90,255)'];
  const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  const FIELD_KEYS = ['count', 'spread', 'ySpread', 'zNear', 'zFar'];
  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * params.focalK, px = 1, bd = 1, warp = params.cruiseWarp, armed = true, clock = 0, kick = 0, wasDown = false;
    let n = 0, a = null, snap = null;
    const spawn = (i, anyZ) => { a[i * 3] = (Math.random() * 2 - 1) * snap.spread; a[i * 3 + 1] = (Math.random() * 2 - 1) * snap.ySpread; a[i * 3 + 2] = anyZ ? snap.zNear + Math.random() * (snap.zFar - snap.zNear) : snap.zFar; };
    function build() {
      snap = {}; for (const k of FIELD_KEYS) snap[k] = params[k];
      n = Math.max(1, params.count | 0); a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) spawn(i, true);
    }
    build();
    function draw(clear, chroma, sx, sy) {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (clear) { g.globalAlpha = 1; g.clearRect(0, 0, w, h); }
      else { g.globalAlpha = params.trailAlpha + (params.trailHot - params.trailAlpha) * warp * warp; g.fillStyle = T.field; g.fillRect(0, 0, w, h); }
      g.setTransform(1, 0, 0, 1, sx, sy);
      /* the amber core: white-hot streaks, amber heart */
      const glow = params.coreGlow * smooth(0.5, 1, warp);           /* only a real hold lights the heart; the still (and the far room) stays clean */
      if (glow > 0.01) {
        const r = h * (0.1 + 0.34 * warp * warp);
        const gr = g.createRadialGradient(vpX, vpY, 0, vpX, vpY, r);
        gr.addColorStop(0, ctx.rgba(T.amber, 1)); gr.addColorStop(0.35, ctx.rgba(T.amber, 0.35)); gr.addColorStop(1, ctx.rgba(T.amber, 0));
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = glow * (clear ? 1 : 0.5); g.fillStyle = gr; g.fillRect(vpX - r, vpY - r, 2 * r, 2 * r);
        g.globalCompositeOperation = 'source-over';
      }
      g.lineCap = 'round';
      const path = new Path2D(), hot = new Path2D();
      const L = warp * params.streakLen;
      const heat = smooth(0.56, 0.95, warp);                          /* only a hold burns: cruise and the still stay phosphor */
      for (let i = 0; i < n; i++) {
        const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
        const hx = vpX + f * x / z, hy = vpY + f * y / z;
        if (hx < -4 || hx > w + 4 || hy < -4 || hy > h + 4) continue;
        const z2 = z + L + 0.15;
        const p = heat > 0 && z < params.hotZ ? hot : path;
        p.moveTo(vpX + f * x / z2, vpY + f * y / z2); p.lineTo(hx, hy);
      }
      g.strokeStyle = T.phosphor; g.globalAlpha = params.haloAlpha; g.lineWidth = params.haloWidth * px; g.stroke(path);
      g.strokeStyle = T.phosphorCore; g.globalAlpha = params.coreAlpha; g.lineWidth = params.coreWidth * px; g.stroke(path);
      if (heat > 0) {
        g.strokeStyle = T.amber; g.globalAlpha = 0.65 * heat; g.lineWidth = params.haloWidth * 1.6 * px; g.stroke(hot);
        g.strokeStyle = T.phosphorCore; g.globalAlpha = params.coreAlpha; g.lineWidth = params.coreWidth * (1 + 0.8 * heat) * px; g.stroke(hot);
      }
      if (chroma > 0.01 && heat > 0) {
        g.globalCompositeOperation = 'lighter';
        g.lineWidth = params.coreWidth * 1.2 * px;
        for (let c = 0; c < 3; c++) {
          const s = 1 + (1 - c) * params.chromaK * chroma;
          g.setTransform(s, 0, 0, s, vpX * (1 - s) + sx, vpY * (1 - s) + sy);
          g.strokeStyle = RGB[c]; g.globalAlpha = 0.55 * chroma;
          g.stroke(hot);
        }
        g.globalCompositeOperation = 'source-over';
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
    }
    return {
      tick(dt, t, progress, pointer) {
        const S = ctx.share, full = ctx.dial === 'full', calm = ctx.dial === 'calm';
        const down = !!(pointer && pointer.down);
        kick *= Math.exp(-dt / Math.max(0.02, params.kickTau));
        if (down && !wasDown) kick = 1;                                   /* the surge: the moment you punch it */
        wasDown = down;
        const target = down ? params.holdWarp : params.cruiseWarp;
        const tau = (target > warp ? params.riseTime : params.settleTime) / 3;
        warp += (target - warp) * (1 - Math.exp(-dt / tau));
        const now = performance.now();
        S.warp = warp; S.warpAt = now;
        if (armed && warp > 0.6) { armed = false; kick = Math.max(kick, 0.8); window.dispatchEvent(new CustomEvent('boneyard:warp', { detail: { level: warp } })); }
        else if (!armed && warp < 0.45) armed = true;
        const dz = (params.drift + warp * warp * params.warpDrift) * dt * (calm ? 0.5 : 1);
        for (let i = 0; i < n; i++) { let z = a[i * 3 + 2] - dz; if (z < snap.zNear) { spawn(i, false); z = snap.zFar - (snap.zNear - z) % (snap.zFar - snap.zNear); } a[i * 3 + 2] = z; }
        const peak = full ? smooth(0.55, 1, warp) : 0;
        clock += dt;
        if (kick < 0.01) kick = 0;
        const k = full ? kick : 0;
        const amp = params.shakePx * Math.max(0.25 * peak, k);
        const sh = amp > 0.05 ? { x: amp * (0.62 * Math.sin(clock * 53.1) + 0.38 * Math.sin(clock * 91.7 + 1.3)), y: amp * (0.62 * Math.sin(clock * 61.3 + 0.7) + 0.38 * Math.sin(clock * 83.9 + 2.1)) } : null;
        S.punch = k; S.shake = sh; S.punchAt = now;
        draw(false, Math.max(0.3 * peak, k), sh ? sh.x * bd : 0, sh ? sh.y * bd : 0);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; bd = ndpr; px = Math.max(0.75, ndpr); f = h * params.focalK; },
      still() { warp = params.stillWarp; draw(true, 0, 0, 0); },
      destroy() { const S = ctx.share; if (S.punchAt) { S.punch = 0; S.shake = null; S.punchAt = 0; } g.clearRect(0, 0, w, h); },
      params(p) {
        params = p; f = h * params.focalK;
        if (FIELD_KEYS.some((k) => p[k] !== snap[k])) build();
      },
    };
  }
  BAYS.push({ slug: 'jump', title: 'Jump', order: 1, role: 'bay', params: PARAMS, mount });
})();
