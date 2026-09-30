# HANDOFF from gimli (2026-09-29): core diffs for the owner of 09/10, and module notes

Gimli does not edit `src/09-runtime.js`, `src/10-core.js`, CSS or modules. Each item below is
measured, with the exact change. Apply in order; each is independent.

## 1. 10-core.js: the adaptive scale never steps down on a page that is slow from boot (P1)

**Measured.** Chromium, 1440x900. A 70 ms or 30 ms burn added to every animation frame from boot
(a stand-in for a slow phone or a heavy post-pass): `ctx.scale` stayed `1` for 10 s in both
cases. Healthy page: stays `1` (correct). A burn added AFTER boot steps 1 -> 0.75 -> 0.5 as
designed, so the stepping logic is fine; the calibration is the fault.

**Cause.** `adapt()` returns until it has 40 samples of `4 < dt < 60` and takes their median as the
display refresh. (a) A page slower than 60 ms per frame from boot never collects a sample, so
`refresh` stays 0 and `adapt()` returns forever. (b) A page at 30 to 60 ms from boot calibrates its
own slowness as "the refresh" and the slow threshold becomes `refresh * 1.6` (50 to 96 ms), so the
brief's rule (30 frames over 20 ms steps down) never fires. At 4x CPU on the 390x844 profile the
yard ran about 19 to 25 frames per second at scale 1 during this run.

**Fix** (only count frames where our own JS was light toward the refresh estimate, and fall back to
60 Hz after 3 s of frames without a clean estimate):

```diff
-  let slow = 0, refresh = 0; const dts = [];
+  let slow = 0, refresh = 0, calT = 0; const dts = [];
   function adapt() {
     const dt = Ticker.stats.dt;
-    if (!refresh) { if (dt > 4 && dt < 60) dts.push(dt); if (dts.length >= 40) { dts.sort((a, b) => a - b); refresh = dts[20]; } return; }
+    if (!refresh) { calT += dt; if (dt > 4 && dt < 60 && Ticker.stats.work < dt * 0.5) dts.push(dt); if (dts.length >= 40) { dts.sort((a, b) => a - b); refresh = dts[20]; } else if (calT > 3000) refresh = 16.7; if (!refresh) return; }
```

**Verified on a scratch copy of index.html** (not the repo): 70 ms burn from boot steps
`1 1 1 1 1 0.75 0.75 0.75 0.5 0.5` (one reading per second); 30 ms burn steps
`1 1 1 1 1 0.75 0.5 0.5 0.5 0.5`; healthy page stays `1` for 10 s. Honest limit: a slowdown that
lives entirely outside our ticker (GPU raster, another tab) at 30 to 60 ms is indistinguishable by
timing from a 30 Hz panel; the work filter only rescues the case where our JS is the cost.

## 2. 10-core.js: the HUD readout trailing edge (coordinator request): APPLIED

Already in the core as of commit 2969759 (`liveTimer`, trailing-edge paint). The parts harness carries
the same pattern (`readTimer` in `src/90-parts-harness.html`). Nothing to do.

## 3. 10-core.js: `html.js` and `data-dial` are now set in the head by the build (FYI, no change needed)

**Measured before:** CLS **1.0** at 390x844 and **1.02** at 1440x900 (4x CPU, slow 4G). The page is
one ~250 KB file, so first paint (about 670 ms) lands long before DOMContentLoaded (about 1.4 s); the
first frame was the no-JS index layout, and `html.classList.add('js')` at boot moved all of `main`
(`row-main [46,798] -> [0,844]`, the greetings bar `[0,0] -> [823,21]`). **After:** build.js emits a
tiny inline head script that adds `js` and the dial (same `boneyard_dial` key, same reduced-motion
default) before the stylesheet paints. Measured CLS **0**. The core's own `classList.add('js')` and
`html.dataset.dial = ...` lines are now idempotent re-sets; leave them (they keep the core
self-contained for any page that does not use this build). JS off never runs the head script, so the
no-JS index is unchanged (browser-check no-JS screenshot read).

## 4. Module notes (for each module's owner; found by the lift test's params sweep)

Each numeric param was pushed to its range end on `parts/<slug>.html`, canvas compared before/after.
`-` = no visible change.

- **relief** (44): `lines`, `samples`, `exaggeration` change NOTHING, in Full or in Still, through
  `handle.params()`. The mesh is built once at mount; `params()` must rebuild it when any of those
  three change (or drop `params()` so the harness remounts). `orbitDegPerSec`, `returnAfter`,
  `restAt`, `dragDegPerPx` being `-` in Still is correct (speeds).
- **jump** (40): in Still, `count`, `spread`, `ySpread`, `zNear`, `zFar` change nothing: the star
  buffer is not regenerated in `params()`. Either rebuild on those keys or remount.
- **gate** (41): all visual params respond. Its `assetUrl()` keys off `location.pathname.includes('/parts/')`;
  the parts harness now also exposes `ctx.assetBases` (ordered list, e.g. `['../assets/', 'assets/']`)
  for a module that loads its own file. Optional: use it with a fallback so a lifted copy inside any
  folder named `parts` still finds its strip.
- **tube** (20): its still is an empty frame on its own page (it is a post-pass with nothing under
  it). Honest, but the shelf thumbnail is black. Consider a `still()` that draws a test card (grid +
  a few vectors) through the pass on the parts page only.
- **Core addition worth making** (optional): `ctx.assetBases = ['assets/']` in `bootBoneyardRide`,
  so modules can iterate one list on both the ride and the parts pages.

## 5. 20-tube.js: decline software GL (P1, for the tube's owner)

**Measured.** On SwiftShader (software WebGL) the post-pass costs 30 to 41 ms of JS per frame at
2160x1350; the desktop ride drops to 4 fps at 4x CPU and 8 fps unthrottled, TBT proxy 2318 ms, and
because of item 1 the adaptive scale never drops the tube. Many real machines land on software GL
(blocklisted drivers, remote desktops, some VMs and Chromebooks). The tube is a skin (brief: every
room must look right without it), so the right answer on software GL is "off".

```diff
-      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
+      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true });
```

Verified: on this headless Chromium, `getContext('webgl')` returns a context and the same call with
`failIfMajorPerformanceCaveat: true` returns `null` (so the existing `OFF` handle is used). With
that emulated, desktop TBT proxy 2318 -> 219 ms and idle fps 4.1 -> 13.2 at 4x CPU (BUILD-LOG).
Real-GPU cost of the pass is still unmeasured (no GPU here); measure on real hardware with `?tubeprobe=1`.

## 6. 10-core.js: the stage keeps cruising under the sign-off (decide)

Scrolled to the shelf in Full: 58 rAF/s, about 4 ms JS per frame, indefinitely. The yard's cruise is
the designed "powered-on hum", but at the sign-off the visitor is reading. If the stage is covered or
dimmed there, stop the world once `current === LAST` and the scroll has settled (same shape as the
Still idle-stop):

```diff
-    if (still && !autofly && scrollStill > 0.4 && !(switcher && switcher.handle.anyBusy())) { running = false; return false; }
+    const resting = still || (current === LAST && !corridor);
+    if (resting && !autofly && scrollStill > 0.4 && !(switcher && switcher.handle.anyBusy())) { running = false; return false; }
```

(`wake()` on scroll restarts it.) Skip this if the stage is meant to stay alive behind the sign-off.

## 7. 09-runtime.js: portrait phones get 3.5x the pixels in a `pixel` room (P2)

`sizeCanvas` fixes the WIDTH of a pixel room and lets the height follow the aspect, so GATE
(`pixel: 320`) is 320x200 on desktop but **320x693 on a 390x844 phone**, and measured
**17.3 ms/frame at 4x CPU** there (1.2 ms on desktop). Cap the AREA instead, at 1.5x the landscape
budget (tune the 1.5; 1 gives 163x353, chunkier):

```diff
-    if (pixel) { bw = pixel; bh = Math.max(1, Math.round(pixel * cssH / Math.max(1, cssW))); canvas.dataset.pixel = '1'; }
+    if (pixel) {
+      const aspect = cssH / Math.max(1, cssW), area = pixel * pixel * 0.5625 * 1.5;
+      bw = aspect > 0.5625 * 1.5 ? Math.max(1, Math.round(Math.sqrt(area / aspect))) : pixel;
+      bh = Math.max(1, Math.round(bw * aspect)); canvas.dataset.pixel = '1';
+    }
```

Landscape is unchanged (320x200 stays). 390x844 becomes 231x500 (about half the pixels). The
returned `dpr` (`bw / cssW`) stays correct, so modules need no change.
