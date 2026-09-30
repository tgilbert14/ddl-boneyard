/* BONEYARD PART · L1 · THE TUBE
 * technique   WebGL1 phosphor post-pass over the composited 2D layers (persistence, bloom, slight barrel, vignette)
 * lineage     the vector CRT: the oscilloscope; Asteroids (Atari, 1979); Battlezone (Atari, 1980); Tempest (Atari, 1981); Vectrex (1982)
 * original    ARWEN'S MODULE. Today this file is the no-op hook the core calls so every room is built to look right
 *             WITHOUT the tube (each room owns its own cheap double-stroke glow). When arwen lands the pass, this
 *             file returns enabled:true and the core unhides #c-tube and feeds it the composited layers each frame.
 * not         scanlines (vector tubes had none; scanlines are ACI's), a curvature gimmick, a blocking dependency
 * deps        none · WebGL1 when present, absent otherwise · 2026-09
 * budget      0.0 ms/frame (no-op hook), desktop Chromium, measured 2026-09-29; the real pass has its own line when it lands
 * api         mount(canvas, params, ctx) -> { enabled, tick(dt, t, sources), resize, still, destroy, bloom(on) }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * The core composites the ride from stacked 2D canvases (sky, row, corridor, then one canvas per mounted room).
 * The tube, when present, samples those as textures each frame: previous frame times a decay plus the current
 * frame (persistence), a quarter-resolution two-pass blur added back (bloom), a very slight barrel (k about 0.04)
 * and a vignette. It is the first thing the adaptive budget switches off (bloom(false)), and it is absent without
 * WebGL. This hook draws nothing; it exists so the module contract and the core's call site are already in place.
 */
(() => {
  'use strict';
  const PARAMS = {
    persistence: 0.82,     /* previous-frame weight */
    bloom: 0.35,           /* bloom add-back */
    barrel: 0.04,          /* barrel distortion k */
    vignette: 0.25,
  };
  function mount(canvas, params, ctx) {
    return {
      enabled: false,
      tick() {},
      resize() {},
      still() {},
      destroy() {},
      bloom() {},
      params() {},
    };
  }
  BAYS.push({ slug: 'tube', title: 'The tube', order: 1, role: 'layer', kind: 'post', params: PARAMS, mount });
})();
