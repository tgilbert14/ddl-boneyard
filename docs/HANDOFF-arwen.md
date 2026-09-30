# HANDOFF · arwen · the light (2026-09-29)

Files touched: `src/00-tokens.css`, `src/01-tube.css`, `src/20-tube.js`, `assets/fonts/*`. Nothing else.
Verified in desktop Chromium 149 (headless, real GPU: AMD RX 5600M via D3D11), 1440x900 and 390x844, normal and
`reducedMotion: 'reduce'`, the no-JS index, the shelf, `parts/jump.html`, `parts/tube.html`, `#jump` held 2 s,
`#gate` and `#range` at 390. Dial Full > Still > Full toggles the tube off and on; with WebGL stubbed out the tube
stays `hidden` and nothing errors.

## Tokens

The ten contract names are unchanged. Design values are OKLCH; the stored values are their exact sRGB hex
(see "Runtime note" below for why).

| token | oklch (design) | stored | role | on field |
|---|---|---|---|---|
| `--field` | 0.135 0.014 262 | `#06080e` | ground, room backs | |
| `--field-2` | 0.19 0.035 266 | `#0c1323` | top of the sky gradient | |
| `--phosphor` | 0.90 0.105 204 | `#81f3fe` | THE stroke, links, h2, current tick | 15.4:1 |
| `--phosphor-core` | 0.975 0.035 160 | `#e4ffef` | hot core (slightly warmer): title face, flash | 18.9:1 |
| `--phosphor-dim` | 0.50 0.075 214 | `#236e7d` | grid, bezels, far frames (never text) | 3.4:1 |
| `--amber` | 0.81 0.145 72 | `#fab048` | pull glyph, visited ticks, focus ring, sunlit limb, Tucson dot | 10.8:1 |
| `--ink` | 0.94 0.022 208 | `#dbf0f3` | body type | 16.9:1 |
| `--ink-dim` | 0.76 0.035 214 | `#99b7bf` | quietest text allowed | 9.4:1 |
| `--line` | 0.33 0.045 226 | `#193a47` | hairline chrome borders (not text) | 1.7:1 |
| `--horizon-tint` | 0.29 0.075 268 | `#1b2850` | hour band default; 22-sky.js overwrites | |

Derived (new, all `color-mix` of the above, no new hex): `--scrim` (field 86%), `--scrim-deep` (field 92%),
`--glow` (phosphor 42%), `--glow-far` (phosphor 14%), `--amber-wash` (amber 14%), `--halo-text` (a field-colored
text halo for HUD type over live scenery). Worst case on the plate scrim over a white-hot room: ink 12.1,
ink-dim 6.8, phosphor 11.1, amber 7.8 (all over 4.5). `--radius` went 6px to 4px (squarer, more instrument).

Registered with `@property`: all ten colors (`<color>`), plus `--room-s` and `--room-o` (`<number>`,
`inherits: false`): the core writes them per frame on each `.room` and reads them only there, so a registered
non-inheriting prop keeps that write from invalidating the room's subtree. Not a "renders at 0" trap (the core
sets them from JS); a perf and hygiene registration.

**Runtime note (for the foundations builder, optional).** A registered `<color>` holding `oklch()` computes to
`oklch(...)` in Chromium 149 (measured), and `09-runtime.js` `toRgb()` parses only `rgb()` and hex, so every
canvas would fall back to one cyan. That is why the hexes are stored. If you want the tokens to be literally
OKLCH, change `readTokens()` to resolve each token through a 1x1 canvas (`g.fillStyle = v; g.fillRect(0,0,1,1);
getImageData`), then I can swap the hexes for the oklch() values with no module change.

## 01-tube.css: what changed (every selector kept; no renames)

- **Tube stacking:** `#rooms { position:absolute; inset:0; z-index:2 }`, `#c-tube { z-index:1; opacity:0 }`,
  `.is-live` fades it in over 420 ms; `#c-tube[hidden] { display:none }` (the old `canvas { display:block }`
  was beating the `hidden` attribute, so the empty tube canvas was actually displayed).
- **Title:** Michroma 400 (it ships one weight; 600 was asking for a fake bold), `phosphor-core` face with a
  two-shadow `phosphor` halo (the two-temperature stroke), size `clamp(2.1rem, 7.6vw, 5.6rem)` because Michroma is
  very wide. Plate h2 and sign-off h2 also 400.
- **HUD:** `--halo-text` on all HUD type; readout `max-width: min(62vw, 46rem)` so a long live line wraps.
  **At 720 px and below the readout stacks under the clock, left-aligned, and `.hud__live` breaks to its own
  line** (the 390 px overprint, confirmed fixed on `#gate` and `#range`).
- **Scrims:** plates, dial, Auto-fly and index moved from 70 to 72% field to `--scrim` (86%); greetings to 92%.
  The plate's backdrop-filter stays (small region, 2px).
- **Dial / index:** joined segmented dial (shared borders), checked dot is `phosphor-core` with a small glow;
  visited ticks keep amber text with a half-amber border; the current tick gets a static glow.
- **Rooms:** `.room__tube` halo is now `0 0 14px -2px glow, 0 0 48px 4px glow-far` (static, rasterized once,
  transformed only): the rooms' share of the bloom the tube cannot give them.
- **touch-action:** `.room__tube > canvas` and the RANGE, RELIEF, TERMINATOR and MARK `.bay` sections get
  `touch-action: pan-y pinch-zoom`. Both, because `#stage` is `pointer-events:none`, so a touch is hit-tested
  on the bay section, not on the canvas; the canvas rule alone would do nothing. `pinch-zoom` stays allowed.
- Horizon hairline: `phosphor-core` core with `phosphor` halo. `::selection`, link hover to `phosphor-core`,
  forced-colors drops the title halos.

## The tube (`src/20-tube.js`)

Choice: **the tube skins the layer canvases only (sky, row, corridor); the rooms sit above it with a CSS halo.**
Rebuilding each room's per-frame transform, opacity, SWITCH animation and flash inside WebGL would cost a style
read and a full-viewport texture upload per room per frame, past 4 ms; and every room must look right without the
tube anyway.

Pipeline, 5 passes: (A) composite field gradient + three premultiplied layer textures, persistence as
`max(now, last * decay)` (a plain sum saturates a static line) at the layers' own resolution; (B) 4x4 box
down to quarter res with four bilinear taps, soft knee per tap on luma (thin strokes bloom, the broad hour band
does not); (C, D) separable 9-tap gaussian; (E) barrel **centered on the vanishing point** and normalized so the
farthest corner samples its own corner (the vanishing point never moves, no black rim), bloom added back,
vignette. No scanlines.

| param | value |
|---|---|
| persistence | 0.72 per 60 Hz frame (frame-rate corrected; x0.85 under Calm) |
| bloom | 0.9 gain, knee 0.22 luma, radius 1.4 quarter-res texels |
| barrel | k = 0.04 |
| vignette | 0.30 |

Behaviour: waits 0.6 s after mount (the 500 ms switch-on plays on the untubed field), then fades in. Off under
Still (the layers underneath are the still), off when the tab is hidden, bloom off when `ctx.scale < 1` (and on the
core's `bloom(false)`), whole tube off at `ctx.scale <= 0.5`. No WebGL, a failed shader compile or `?tube=0`
returns `enabled:false`. Context loss hides it. On `parts/tube.html` it draws its own vector test card
(floor, Lissajous, sweep); there `still()` is a crisp frame with bloom and no persistence, as the brief asks.

Measured (in the header too): 0.24 ms/frame JS (3 uploads + 5 passes submitted) at 2160x1350 internal
(1440x900 x1.5); over 5 s of scroll, frame work 4.7 to 5.5 ms with the tube vs 4.2 to 5.7 ms without (inside the
noise), p50 16.7 ms both. 390x844 x1: 0.21 ms JS, +0.6 to 1.4 ms frame work. A readPixels-synced number
(`?tubeprobe=1`) reads 10 to 14 ms, but that also waits on the layers' own 2D raster, so it is an upper bound,
not the tube. Under SwiftShader (software GL) the adaptive budget drops it within seconds, as designed.
Phone not measured.

**Brief vs task:** the brief (4.1) says Still = "persistence off, bloom on"; the task says the tube turns itself
off under Still. I followed the task on the ride (the ride's loop idles in Still, so a live tube could show a stale
frame) and the brief on the parts page.

## Fonts

| file | source | licence | bytes (woff2) |
|---|---|---|---|
| `Michroma-Regular-sub.woff2` | google/fonts `ofl/michroma` | OFL 1.1 (Vernon Adams), `OFL-michroma.txt` | 6,336 |
| `IBMPlexMono-Regular-sub.woff2` | google/fonts `ofl/ibmplexmono` | OFL 1.1 (IBM Corp.), `OFL-ibmplexmono.txt` | 5,620 |
| `IBMPlexMono-Medium-sub.woff2` | same | same | 5,612 |

Total 17.6 KB binary, about 23.5 KB as base64, embedded in `00-tokens.css` (so each parts page carries it too).
Subset: U+0020-007E, NBSP, `§ ° ± · × é`, en dash, curly quotes, ellipsis, primes, arrows U+2190-2193 (Michroma
has no arrows or primes; those fall back). Features kept: kern, liga, tnum, zero. Hinting dropped, all name
records kept (OFL notice travels in the font). `font-display: swap`; Michroma declared across weights 100 to 900
and Plex 500 across 450 to 900, with `font-synthesis: none`, so no fake bolds. Rebuild command:
`python -m fontTools.subset <ttf> --unicodes=... --flavor=woff2 --layout-features=kern,liga,tnum,zero --no-hinting --desubroutinize --name-IDs='*'`,
then replace the base64 in the three `@font-face` rules.

## Notes for others (not edited)

- **GATE (41-gate.js):** the corridor fogs to `field`, which leaves a black slit at the vanishing point. The
  palette would prefer the slit to glow faintly, not go bright: fog toward `horizon-tint` (or `phosphor-dim` at
  about 30%) so the vanishing point reads as a lit distance. A white `phosphor-core` stargate core would be the
  loudest thing on the row and would compete with JUMP's warp; I would not do it.
- **Harness (90-parts-harness.html):** its `h1` asks `600` of Michroma; it now maps to the 400 file with no
  synthesis, so nothing to change. Its own `.sheet` scrim is 82% (ink-dim holds 6.0:1 in the worst case, fine).
