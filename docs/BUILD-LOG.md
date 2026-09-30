# BONEYARD build log: measured budgets (gimli)

Numbers, not vibes. Every figure below was measured on the build of 2026-09-29 (index.html 257 KB
raw, all 16 modules present) unless marked. Re-measure after any change to the core, the tube or a
module's draw path, and append a dated section; do not overwrite old ones.

## The budget (the contract; `budgets.json` is the Lighthouse form)

| metric | budget | why |
|---|---|---|
| LCP on the ride | **2000 ms** at 4x CPU / slow 4G | the title is the LCP: real DOM, never opacity-gated, never animated |
| CLS | **0.05** | the ride layout is decided in the head, before first paint |
| TBT (long-task proxy) | **300 ms** in the first 5 s | |
| Bytes before the DEM | **900 KB** transferred | the DEM (427 KB) is lazy: fetched only when RANGE, WASH or RELIEF is near |
| Third-party requests | **0** | enforced by `build.js` (host allowlist) and by `tools/capture.mjs` |
| Per module | **4 ms/frame** at internal resolution, desktop Chromium | brief, house constraints |

## Method

Local Chromium 1228 (Playwright, headless), served over loopback, `Cache-Control: no-store`.
CDP `Emulation.setCPUThrottlingRate 4` and `Network.emulateNetworkConditions` at Lighthouse's slow 4G
(150 ms RTT, 1.6 Mbps down, 750 kbps up). Profiles: **390x844** (dsf 3, isMobile, touch) and
**1440x900** (dsf 1). LCP, CLS and long tasks from `PerformanceObserver`; TBT proxy = sum of
(long task - 50 ms) in the first 5 s; bytes = CDP `encodedDataLength` (the loopback server does not
gzip, so these are RAW bytes; GitHub Pages gzips, see sizes). rAF rate by wrapping
`requestAnimationFrame` in an init script. Scripts live in the session scratchpad, never the repo.

**The one big caveat: headless Chromium here has no GPU.** WebGL runs on SwiftShader (software) and
canvas raster is CPU. That overstates the WebGL tube post-pass enormously (see below) and overstates
raster generally. A real-GPU run could not be taken (headed Chromium cannot launch in this
environment). The numbers are therefore an upper bound for phones with a GPU.

## Results: the ride (2026-09-29)

Two states, because the tube post-pass (20-tube.js) is live on desktop: as shipped (tube on
SwiftShader), and with `failIfMajorPerformanceCaveat` emulated (what the tube would do on software
GL if it asked; HANDOFF-gimli.md item 5).

| 4x CPU, slow 4G | LCP (element) | FCP | CLS | long tasks (5 s) | TBT proxy | worst task | idle ticker fps |
|---|---|---|---|---|---|---|---|
| 390x844, as shipped | **716 ms** (`#title`) | 620 ms | **0** | 4 / 421 ms | **221 ms** | 144 ms | 12.4 |
| 1440x900, as shipped | **788 ms** (`#title`) | 636 ms | **0.016** | 25 / 3568 ms | **2318 ms** | 443 ms | 4.1 |
| 390x844, tube declines software GL | **708 ms** (`#title`) | 708 ms | **0** | 3 / 305 ms | **155 ms** | 132 ms | 15.6 |
| 1440x900, tube declines software GL | **688 ms** (`#title`) | 592 ms | **0.016** | 7 / 569 ms | **219 ms** | 121 ms | 13.2 |

- **LCP passes** everywhere (budget 2000 ms). The LCP element is the title in every run; nothing
  gates it.
- **CLS was 1.0 before this pass** (390x844) and 1.02 (1440x900): the page is one ~250 KB file, first
  paint lands ~700 ms before DOMContentLoaded, and the core added `html.js` at boot, which moved all
  of `main` from the no-JS index layout to the ride layout. `build.js` now sets `js` and the dial in
  an inline head script before first paint. Now 0 / 0.016 (the 0.016 is the greetings bar; within
  budget).
- **TBT fails on desktop as shipped (2318 ms)**: the tube post-pass costs 30 to 41 ms of JS per frame
  on SwiftShader at 2160x1350 (three canvas-to-texture uploads per frame on a CPU rasteriser). With
  the tube declining software GL, desktop TBT is 219 ms (passes).

### Bytes (raw over loopback; the wire is gzip)

| | raw | gzip -9 |
|---|---|---|
| `index.html` (everything: CSS with base64 fonts, HTML, all JS) | 264 KB | **93 KB** |
| inline CSS (includes three base64 woff2 subsets) | 50 KB | |
| requests before the DEM | 5 | |
| bytes before the DEM | **282 KB** raw (budget 900 KB) | |
| `assets/catalinas-dem.png` | 427 KB, **not fetched at load** | |

### The DEM is lazy (verified)

Not requested during the first 5 s at rest on either profile. Walking the row one bay at a time, it
is requested with the view **at bay 2 (GATE)**, one bay before RANGE (the IntersectionObserver mounts
one bay ahead and `dem: true` prefetches). Both profiles identical.

## rAF probes (unthrottled, 1440x900 dsf 2)

| state | rAF/s | notes |
|---|---|---|
| hidden tab (document.hidden forced + visibilitychange) | **0** | the ticker's frame returns without rescheduling; it wakes on visible |
| dial on Still | **0** | the world task idle-stops 0.4 s after scroll settles |
| at rest on the yard | 44 to 59 | the cruise: 0.4 ms of JS per frame with the tube off; 38 ms with the tube on SwiftShader |
| JUMP, idle / held | 25 / 28 | 5 to 6 ms JS per frame (tube off); held does not raise it |
| scrolled to the shelf (Full) | 58 | 4.1 ms JS per frame: the stage keeps cruising under the sign-off (HANDOFF item 6) |

A real background tab could not be produced headless (`bringToFront` on a second page leaves the
first `visible`), so the hidden case forces `document.hidden`; that exercises the exact code path.

## DPR cap and adaptive scale

- **DPR cap holds.** 1440x900 at dsf 2: `c-row` backing 2160 px = 1440 x 1.5, `ctx.dpr` 1.5.
  390x844 at dsf 3 touch: backing 390 = 390 x 1, `ctx.dpr` 1.
- **Adaptive scale steps down when a slowdown starts after boot**: a 30 ms burn added at rest stepped
  `1 -> 0.75 -> 0.5` within about 2 s (earlier run; `c-row` 2160 -> 1620 -> 1080).
- **It never steps down when the page is slow from boot** (70 ms and 30 ms burns from load: scale 1
  for 10 s; the shipped desktop ride at 4 to 8 fps with the tube on SwiftShader: scale 1). The
  calibration needs 40 frames under 60 ms and otherwise returns forever. Fix + verification:
  HANDOFF-gimli.md item 1.

## Per module (the harness's own live counter, ms of JS per frame)

Each `parts/<slug>.html` in Full, 3.5 s after load, counter read from the page. Desktop column is the
header's `budget` basis (desktop Chromium, 1440x900 at dsf 1.5, so 2160x1350 backing unless the
module is a fixed-width pixel room). The 4x column is a mid-tier-phone stand-in.

| part | 1440x900 dsf 1.5 | 390x844, 4x CPU |
|---|---|---|
| tube (alone on its page) | 0.00 | 5.88 |
| row | 0.12 | 1.15 |
| sky | 0.19 | 1.22 |
| greetings, switch | DOM / WAAPI, no per-frame JS | same |
| hyperspace | 0.09 | 0.49 |
| rings | 0.21 | 0.92 |
| jump | 0.06 | 0.61 |
| gate | 1.23 @ 320x200 | **17.34 @ 320x693** |
| range | 2.37 | 6.60 |
| wash | 2.37 | 8.37 |
| relief | 1.35 | 8.26 |
| terminator | 0.01 | 0.13 |
| scope | 0.12 | 0.90 |
| mark | 0.25 | 1.51 |
| placeholder | 0.09 | 0.65 |

Every module is inside 4 ms on desktop. GATE on a portrait phone is the outlier: a `pixel` room keeps
its WIDTH fixed and lets the height follow the aspect, so portrait 390x844 gets a 320x693 buffer
(3.5x the pixels of 320x200). HANDOFF item 7.

## Lift test (2026-09-29)

`parts/<slug>.html` copied into an empty folder served as a SUBFOLDER (so `../assets/` is a real
404, not a lucky root hit) with a copy of `assets/` next to it, for **jump, hyperspace, relief, gate,
terminator, range, wash**: zero requests to other hosts, zero 4xx, zero page errors, Still box ticked
under `reducedMotion: reduce`, and at least one PARAMS input visibly changes the canvas on every
part (full sweep of every param for jump, relief, hyperspace, gate). Dead params found: HANDOFF item 4.

## Visual checks read (not assumed)

browser-check (54/54) on the final build; no-JS screenshot read: a complete designed index (title,
eight nameplates with pull glyphs, sign-off, greetings as text). Shelf read: 16 rows with captured
stills. `og-yard.png` read: the yard at rest, title in frame.
