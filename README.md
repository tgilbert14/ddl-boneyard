# BONEYARD

A Tucson boneyard at night, of display machines. Retired consoles and scopes stand in a row on
the desert floor under a survey light-grid, tubes still on, each drawing the one thing it was
built to draw. You fly down the row. Every screen is a room; every room is a part you can pull.

A Desert Data Labs web experience and, at the same time, DDL's living library of motion effects:
every effect is one plain file with a provenance header, a `PARAMS` block and a fixed
`mount(canvas, params, ctx)` API, and the build emits each one as a standalone `parts/<slug>.html`.

- Vision brief: [docs/vision-brief.md](docs/vision-brief.md) (Galadriel, 2026-09-29)
- Build: `node build.js` writes `index.html` (the ride) and `parts/` (the shelf)
- Status: scaffolded 2026-09-29; the spine (floor, row, sky, switch, jump) is being built first

Framework-free. No dependencies. Real data where the ground is real (the Santa Catalina elevation
grid, see `assets/catalinas-meta.json`).
