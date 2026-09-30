# BONEYARD

A scrolling web page set in an imagined Tucson boneyard of display machines at night. Retired
consoles and scopes stand in a row on the desert floor under a light-grid, tubes still on, each
drawing the one thing it was built to draw. You scroll to fly down the row. Each screen is a bay,
and each bay's effect is a standalone part you can pull.

A Desert Data Labs web experience and a library of motion effects:
every effect is one plain file with a provenance header, a `PARAMS` block and a fixed
`mount(canvas, params, ctx)` API, and the build emits each one as a standalone `parts/<slug>.html`.

- Vision brief: [docs/vision-brief.md](docs/vision-brief.md) (Galadriel, 2026-09-29)
- Module contract: [docs/CONTRACT.md](docs/CONTRACT.md) (the one API a bay, corridor or layer is written against)
- Measured budgets: [docs/BUILD-LOG.md](docs/BUILD-LOG.md) and [budgets.json](budgets.json)
- Live: https://tgilbert14.github.io/ddl-boneyard/ (the shelf is `/parts/`)

Framework-free. No dependencies. No requests to any other host. Real data where the ground is real
(the Santa Catalina elevation grid, see `assets/catalinas-meta.json`).

## The ride and the workbench

The opening is a procedural desert observatory with CRT machines showing captures of the
actual effects. Native scrolling carries you through eight full-screen bays. Named navigation
and previous/next buttons provide a direct path. The phone dock opens a compact bay menu;
warp and Scope have explicit hold buttons, and rotating objects have tap and keyboard turns.
Sound is off until chosen. Reduced motion starts in Still; Save-Data starts in Calm at a lower
canvas resolution. Necessary context and provenance are behind About, leaving the ride visual.

The parts shelf is an image-led library with local search and role filters. Each part opens a
canvas-first workbench with parameters, reset, a configured URL, a PNG frame export and an HTML
part download. Data-backed parts still need the adjacent `assets/` folder when lifted. The
workbench labels that dependency. No libraries, analytics, or remote media run in the page.

The 2026-09-30 local revamp evidence is in [docs/revamp/review.md](docs/revamp/review.md).
Earlier measured budgets remain dated baseline evidence, not certification of the new revision.

## Build

```
node build.js
```

Concatenates the manifest in `build.js` (CSS, HTML, JS by extension, in order) into one file and
writes:

| output | what |
|---|---|
| `index.html` | the ride: one file, inline CSS and JS, no external requests |
| `parts/<slug>.html` | one standalone page per module that registers on `BAYS` (module + `src/90-parts-harness.html`) |
| `parts/index.html` | the shelf: technique, lineage, size, measured cost, the still, every page |
| `sitemap.xml` | the ride, the shelf, every part |

The build **fails** on: a surviving `__PLACEHOLDER__`, any em dash in an output, a missing
provenance field, a duplicate slug, or any `href` / `src` / `url()` / `fetch()` naming a host other
than `tgilbert14.github.io`, `desertdatalabs.com` or `github.com`. A new module joins the build the
moment its file lands in `src/` (the manifest is pre-registered and filtered by `existsSync`).

Outputs are generated **and committed** (GitHub Pages serves them as they are). Never hand-edit them.

## Capture (stills and the social card)

```
node tools/capture.mjs                      # every part, then og-yard.png
node tools/capture.mjs --only jump,relief   # just these stills
node build.js                               # re-run so the shelf and each og:image pick them up
```

Serves the repo on loopback (port 4187, `--port` to change) and writes `parts/stills/<slug>.webp`
(480x270, the part's reduced-motion still with the sheet hidden) and `og-yard.png` (1200x630, the
yard at rest with the title). It fails if any page requests another host or reports a runtime error. Playwright is borrowed from
an installed `playwright` package or the sibling `TG-Data-Apps` workstation tools (override
with `BONEYARD_PLAYWRIGHT=/abs/path/to/playwright`); never run `playwright install` here. Until a still
exists, the shelf shows a plain link and that part's og:image falls back to `og-yard.png`.

## Local verification

With a local preview running, `node tools/measure.mjs` records a CPU-throttled localhost lab
in `docs/revamp/lab.json`. `node tools/verify-artifacts.mjs` checks every standalone Still mount,
exports and lifts four exact configured files, and renders the no-JavaScript paths. Both borrow
the existing workstation Playwright runtime. This tooling is separate from the dependency-free
shipped page. See the review for actual conditions and untested browsers/devices.

## Deploy

`.github/workflows/pages.yml` deploys on push to `main`. It runs `node build.js` as a **check** (the
deploy stops if that changes any committed output, which means someone forgot to rebuild), stages
`index.html`, `parts/`, `assets/`, `og-yard.png` and `sitemap.xml` into `_site/`, and publishes with
`actions/upload-pages-artifact` + `actions/deploy-pages`. In the repo settings set Pages source to
**GitHub Actions**. Before pushing: `node build.js` (and `node tools/capture.mjs` if a still
changed), then commit the outputs together with the source.

## The lift test

Every part must survive being lifted out of the repo:

1. Copy `parts/<slug>.html` into an empty folder, and a copy of `assets/` next to it.
2. Serve that folder over http and open the page.
3. It must make **no request to any other host**, show the **designed still** under
   `prefers-reduced-motion: reduce` (the Still box is ticked for you), and its **PARAMS row must
   change what you see**.

The harness resolves assets from `../assets/` when it lives in `parts/` and from `assets/` when
lifted, falling back to the other either way (`ctx.dem()`, and `ctx.assetBases` for a module that
loads its own file). If any part fails the lift test, the site is not done.

## Local preview

```
python3 -m http.server 4186 --bind 127.0.0.1
```

`?dev=1` on the ride shows the tweak row for the current bay and the measured js ms/frame.
