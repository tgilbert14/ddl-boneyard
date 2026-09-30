/* BONEYARD PART · 01 · JUMP
 * technique   1/z starfield in warp: stars flow toward the camera along rays from the vanishing point and are drawn as
 *             streaks whose length is the warp; press-and-hold raises warp, release settles to cruise
 * lineage     the Star Wars jump (1977); the demoscene 1/z starfields (early 1990s); Windows 3.1 Starfield Simulation (1992)
 * original    the hold room for HYPERSPACE: the same projection and the same vanishing point as the corridor and the row
 *             (pointer parallax on the point is the core's, so the whole world shifts together); warp is a time
 *             constant, not a keyframe, so a tap flickers and a hold builds; a translucent field fill gives cheap
 *             persistence without the tube; the still is mid-warp with short streaks, the frame that reads as
 *             "hyperspace" in a screenshot
 * not         random speed changes, a tunnel, a lens flare, autoplay warp. Cruise is quiet; only a hold raises it.
 * deps        none · Canvas 2D · 2026-09
 * budget      see docs/BUILD-LOG.md for the measured number @ 1440x900 x1.5 internal, desktop Chromium (2026-09-29); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * count stars live in camera space with x and y spread around the line of flight and z between zNear and zFar. Each
 * frame every z decreases by (drift + warp * warpDrift) * dt; a star that passes zNear respawns at zFar with new x, y.
 * A star projects to (vpX + f x / z, vpY + f y / z) with f = focalK * height; its streak runs from that head back to
 * the projection at z + warp * streakLen, so all streaks point at the vanishing point and lengthen with warp.
 *
 * Warp eases toward holdWarp while the pointer, a finger or Space is held and toward cruiseWarp otherwise, each with
 * its own time constant (riseTime up, settleTime down). Instead of clearing, the frame is washed with the field colour
 * at trailAlpha, which leaves a short persistence trail. still() clears and draws one frame at stillWarp.
 */
(() => {
  'use strict';
  const PARAMS = {
    count: 420,
    spread: 9, ySpread: 6.5,
    zNear: 0.9, zFar: 42,
    focalK: 0.62,
    drift: 1.6,          /* units per second at cruise */
    warpDrift: 14,       /* extra units per second at warp 1 */
    cruiseWarp: 0.16,
    holdWarp: 1.0,
    riseTime: 1.2,       /* seconds to ~95% of hold */
    settleTime: 0.9,
    streakLen: 6,
    trailAlpha: 0.5,     /* field wash per frame: lower = longer trails */
    haloWidth: 3.4, coreWidth: 1.15,
    haloAlpha: 0.2, coreAlpha: 0.92,
    stillWarp: 0.42,
  };
  function mount(canvas, params, ctx) {
    const g = canvas.getContext('2d', { alpha: true });
    let w = canvas.width, h = canvas.height, f = h * params.focalK, px = 1, warp = params.cruiseWarp;
    const n = params.count, a = new Float32Array(n * 3);
    const spawn = (i, anyZ) => { a[i * 3] = (Math.random() * 2 - 1) * params.spread; a[i * 3 + 1] = (Math.random() * 2 - 1) * params.ySpread; a[i * 3 + 2] = anyZ ? params.zNear + Math.random() * (params.zFar - params.zNear) : params.zFar; };
    for (let i = 0; i < n; i++) spawn(i, true);
    function draw(clear) {
      const T = ctx.tokens;
      const vpX = ctx.vp.x * w, vpY = ctx.vp.y * h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (clear) g.clearRect(0, 0, w, h);
      else { g.globalAlpha = params.trailAlpha; g.fillStyle = T.field; g.fillRect(0, 0, w, h); }
      g.lineCap = 'round';
      const path = new Path2D();
      const L = warp * params.streakLen;
      for (let i = 0; i < n; i++) {
        const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
        const hx = vpX + f * x / z, hy = vpY + f * y / z;
        if (hx < -4 || hx > w + 4 || hy < -4 || hy > h + 4) continue;
        const z2 = z + L + 0.15;
        path.moveTo(vpX + f * x / z2, vpY + f * y / z2); path.lineTo(hx, hy);
      }
      g.strokeStyle = T.phosphor; g.globalAlpha = params.haloAlpha; g.lineWidth = params.haloWidth * px; g.stroke(path);
      g.strokeStyle = T.phosphorCore; g.globalAlpha = params.coreAlpha; g.lineWidth = params.coreWidth * px; g.stroke(path);
      g.globalAlpha = 1;
    }
    return {
      tick(dt, t, progress, pointer) {
        const target = pointer && pointer.down ? params.holdWarp : params.cruiseWarp;
        const tau = (target > warp ? params.riseTime : params.settleTime) / 3;
        warp += (target - warp) * (1 - Math.exp(-dt / tau));
        const dz = (params.drift + warp * params.warpDrift) * dt;
        for (let i = 0; i < n; i++) { let z = a[i * 3 + 2] - dz; if (z < params.zNear) { spawn(i, false); z = params.zFar - (params.zNear - z); } a[i * 3 + 2] = z; }
        draw(false);
      },
      resize(nw, nh, ndpr) { w = nw; h = nh; px = Math.max(0.75, ndpr); f = h * params.focalK; },
      still() { warp = params.stillWarp; draw(true); },
      destroy() { g.clearRect(0, 0, w, h); },
      params(p) { params = p; f = h * params.focalK; },
    };
  }
  BAYS.push({ slug: 'jump', title: 'Jump', order: 1, role: 'bay', params: PARAMS, mount });
})();
