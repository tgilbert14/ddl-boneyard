# BONEYARD module contract

The exact API a bay, corridor or layer is written against. Derived from the shipped code
(`src/09-runtime.js`, `src/10-core.js`, `src/90-parts-harness.html`, `build.js`) on 2026-09-29.
Read this and `docs/vision-brief.md`; you should not need anything else to ship a bay.

## One file per module

`src/NN-<slug>.js`, an IIFE, added to the `parts` array in `build.js` in numeric order (bays are
`41` to `47`, corridors `30` to `39`, layers `21` to `29`). Nothing else in the repo is yours to edit.

```js
/* BONEYARD PART · 03 · RANGE
 * technique   one line
 * lineage     people and years, checkable
 * original    what is ours
 * not         what it is not (the honest limit)
 * deps        none · Canvas 2D · 2026-09
 * budget      N.NN ms/frame @ WxH internal, desktop Chromium (2026-09-xx); phone TBD
 * api         mount(canvas, params, ctx) -> { tick(dt, t, progress, pointer), resize(w, h, dpr), still(t), destroy() }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Plain prose, one or two paragraphs. Becomes the note on parts/<slug>.html.
 */
(() => {
  'use strict';
  const PARAMS = { /* every tunable; numbers, booleans or short strings only (the tweak row reads these) */ };
  function mount(canvas, params, ctx) {
    /* ... */
    return { tick(dt, t, progress, pointer) {}, resize(w, h, dpr) {}, still(t) {}, destroy() {}, params(p) { params = p; } };
  }
  BAYS.push({ slug: 'range', title: 'Range', order: 3, role: 'bay', params: PARAMS, mount /*, pixel: 384, dem: true */ });
})();
```

`build.js` parses the header as TEXT. All eight fields are required, each on a line that starts
with ` * <field>` followed by two or more spaces; continuation lines are indented. `slug`,
`title`, `role` (and `order`) must be string or number literals in the `BAYS.push({...})` call.
The build fails on a missing field, a duplicate slug, a surviving `__PLACEHOLDER__`, or any em dash
(U+2014) anywhere in the output. No em dashes in comments either: they ship.

## Registration fields

| field | meaning |
|---|---|
| `slug` | must equal the bay's `data-slug` in `src/02-body.html` (`gate`, `range`, `wash`, `relief`, `terminator`, `scope`, `mark`), or a corridor name (`rings`). A registered `role: 'bay'` module replaces the placeholder for that slug automatically. |
| `role` | `bay` · `corridor` · `layer` |
| `order` | the bay number (1 to 8) |
| `params` | the PARAMS object (the core passes a copy to `mount`) |
| `pixel` | optional. A number: the canvas backing store is that many pixels wide (height follows the aspect) and CSS upscales it pixelated. Use for ImageData rooms (320 to 480). Omit for vector rooms, which get `cssW * dpr * scale`. |
| `dem` | optional `true`: the core prefetches the elevation grid when your room mounts. |

## Lifecycle (what the core does to you)

- **Mount.** When the bay's section comes within about one viewport of the screen, the core creates
  `.room > .room__tube > canvas`, sizes it, calls `mount(canvas, params, ctx)`, then `resize(w, h, dpr)`,
  then `still(0)`. The room is small and far away on the vanishing point at this stage.
- **Approach.** As the visitor scrolls, the core scales the whole room (CSS transform) from the
  vanishing point. You do nothing; your `still(0)` frame is what they see growing.
- **On (the hold).** Within the live zone around the bay, the core calls `tick(dt, t, progress, pointer)`
  every frame (unless the dial is Still). `dt` seconds (clamped to 0.05), `t` seconds since switch-on,
  `progress` = bay lengths from the hold point (0 at the hold, negative before, positive after; about
  -0.3 to 0.3 while live), `pointer` = `ctx.pointer`.
- **Off.** Leaving the live zone, the SWITCH module blanks the room (line, dot, recede). `tick` stops.
- **Destroy.** When the section is far off screen: `destroy()`. Release every buffer, listener,
  typed array, audio node. The room element is removed by the core.
- **Resize.** On window resize or an adaptive-scale step: `resize(w, h, dpr)` with backing-store
  pixels. Recompute anything size-dependent. If the dial is Still, `still(t)` follows.
- **Still.** `still(t)` must draw the designed reduced-motion frame (brief §3.4) synchronously when
  your data is ready, and draw it again when async data (the DEM) arrives. It is the frame the
  approach shows, the reduced-motion frame, and what the harness's Still box shows.
- **turn(degrees)** optional: an immediate turn or steering action for left/right buttons and arrow keys. Draw immediately even in Still. This supplements pointer interaction.
- **params(p)** optional: live re-tune from the tweak row. Without it the harness remounts.

The ride runs ONE ticker; never call `requestAnimationFrame` yourself, never add scroll or
resize listeners. Pointer and keyboard listeners on `window` are not yours either: read `ctx`.

## ctx (shared by every module; same shape on the ride and on parts pages)

| key | type | meaning |
|---|---|---|
| `ctx.vp` | `{x, y}` 0..1 | the SHARED vanishing point, parallax already applied. Every room that has depth converges here. Default 0.5, 0.38. |
| `ctx.dpr`, `ctx.scale` | number | shared vector backing dpr (use the `resize` argument for your actual canvas, especially a `pixel` module); adaptive internal scale (1, 0.75, 0.5) |
| `ctx.pointer` | `{x, y, nx, ny, down, present, coarse}` | `nx, ny` 0..1 of the viewport; `down` is true while pointer is held OR Space is held on a bay with `data-holds="true"` (jump, scope); `coarse` = touch device |
| `ctx.keys` | `Set` | held keys routed to bays: `ArrowLeft`, `ArrowRight`, single lowercase letters. ArrowUp/Down and PageUp/Down move between bays and never reach you. |
| `ctx.dial` | `'full' \| 'calm' \| 'still'` | Calm: halve speeds, no flashes, fewer particles. Still: only `still()` is called. `ctx.reduced` is `dial === 'still'`. |
| `ctx.tokens` | object | resolved CSS tokens as color strings: `field, field2, phosphor, phosphorCore, phosphorDim, amber, ink, inkDim, line, horizonTint`. Use these, never hard-coded brand hexes (the RANGE life-zone colors are data and are the one exception). |
| `ctx.rgba(color, a)` | fn | token color with alpha |
| `ctx.hour` | number | visitor's local hour, fractional |
| `ctx.camera` | `{z, v}` | grid units along the row, speed |
| `ctx.share` | object | shared bag. `share.stars` (sky's star buffers), `share.warp` (0..1, corridors write it) |
| `ctx.dem()` | `Promise<{width, height, elev: Float32Array (metres), min, max, url}>` | the Santa Catalina grid, decoded once and shared. 768 x 768, row 0 = north. Bounds (Web Mercator tile edges): N 32.5468, S 32.1012, W -111.0938, E -110.5664; about 64.4 m per cell; latitude of row r via inverse Mercator (see `assets/catalinas-meta.json`). |
| `ctx.readout(slug, text)` | fn | your bay's one live line of REAL numbers (e.g. `ALT 8,040 ft · GROUND 5,384 ft · Madrean Oak Woodland · 2x vertical`). The ride appends it to the HUD while you are current; parts pages print it under the canvas. Throttled to about 7 per second for you. Plain text, no invented values. |
| `ctx.overlayFor(canvas)` | fn → element | an `aria-hidden`, pointer-transparent div exactly over your canvas for decorative labels that track the scene (`<span>` children; CSS for `.part-overlay span` exists: position absolute at 0,0, place with `transform: translate3d(x,y,0)`). Nothing a reader needs lives only here. |
| `ctx.dev` | bool | `?dev=1` |

Assets: `assets/catalinas-dem.png` (via `ctx.dem()`), `assets/sunset-strip.png` (1 x 1024 RGB, one
column of Tim Gilbert's 2025-03-01 Sonoran sunset photo; provenance in `sunset-strip.json`),
`assets/land-mask.json` (360 x 180 bits, row-major, MSB first, row 0 = 90N..89N, col 0 = 180W..179W,
Natural Earth 110m via world-atlas). Load images with `new Image()` relative to the page
(`assets/...` on the ride; the parts harness page lives in `parts/`, so resolve with
`new URL('../assets/x.png', document.baseURI)` when `location.pathname` contains `/parts/`, or
simply try `assets/` then `../assets/`). Fetch nothing from other hosts.

## Rules the gate enforces

- **Draw no text in the canvas.** Numbers go through `ctx.readout`, labels through `ctx.overlayFor`.
- **Budget 4 ms/frame** at internal resolution on desktop Chromium; measure with the parts page's
  live counter and write the number in your header.
- **Still first.** Design the still frame before the motion.
- **One vanishing point.** Anything with depth converges on `ctx.vp`.
- **No pre-interaction audio.** The owner requested an enabled engine bed after scroll or Auto-fly
  on 2026-09-30. A visible mute control and remembered explicit off remain available. Browser audio
  activation is respected; a blocked first wheel scroll offers tap recovery. SCOPE's own tones
  still sound only while held, and the engine ducks underneath them.
- **The lift test.** `parts/<slug>.html` copied into an empty folder next to a copy of `assets/`
  must run with no requests to other hosts, show the still under reduced motion, and respond to the
  PARAMS row.
- **No em dashes. No fake data.** Every number in a readout is computed from real inputs.

## Verify before you report

```
node build.js
node D:/Git/TG-Data-Apps-voxel-lab/tools/local-guilds/serve-preview.mjs D:/Git/ddl-boneyard <port> &
LOCAL_GUILD_PLAYWRIGHT_MODULE=D:/Git/TG-Data-Apps/tools/visual-regress/node_modules/playwright \
  node D:/Git/TG-Data-Apps-voxel-lab/tools/local-guilds/browser-check.mjs --url http://127.0.0.1:<port>/ --out <new empty folder>
```
Then, with a scratch Playwright script (never in the repo), screenshot `http://127.0.0.1:<port>/#<slug>`
at 1440x900 and 390x844 after holding 2 s (evaluate an `await` in the page so the tab stays active),
and `parts/<slug>.html` with `reducedMotion: 'reduce'`. READ the PNGs. Green scripts are not a look.
