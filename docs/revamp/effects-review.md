# Effect refinement review, 2026-09-30

The owner asked to improve every effect within the approved Desert Salvage Observatory
visual direction. All 17 reusable modules were refined, with the eight bays kept visually
distinct. No dependencies, remote runtime requests, invented data, or generated media were added.

| Part | Concrete improvement |
| --- | --- |
| Jump | Seeded depth layers, staged charge planes and an earned release wave |
| Gate | Sunset-derived ribs and panels, colored aperture edge, readable dark center |
| Range | Real-elevation contour accents, world-coordinate survey detail, atmospheric separation and smoother near ground |
| Wash | Real-elevation backdrop contours, visible drop heads, cloud marker and accessible Rain burst |
| Relief | Survey plinth, warm scan light and projected-bounds fitting, including portrait |
| Terminator | Stronger globe body, exact daylight hemisphere, atmospheric edge and sun references |
| Scope | Recessed instrument, harmonic ticks, phase rotors and measured channel level rails |
| Mark | Distinct slab materials, spatial gimbal, projected turn echoes and amber response |
| Tube | Crisp current frame with tinted persistence and restrained flare; authored standalone 2D fallback |
| Row | Survey traverses, registration marks and original salvage silhouettes |
| Sky | Deterministic magnitude classes and oblique stellar lane |
| Greetings | CRT entrance and masked spatial edge departure |
| Yard | Machine lighting, contact shadows, cabling, portrait framing and refreshed real-effect screens |
| Switch | Physical dot hold, recede/arrival and clean interrupted reversals |
| Hyperspace | Launch, cruise and arrival rhythm with layered depth |
| Rings | Articulated spatial portals, thickness, hinges, gaps and longitudinal rails |
| Placeholder | Useful calibration frame, axes, rings and deterministic probe |

Baseline and refined sheets are in `effects/`. Real terrain, exaggeration labels, solar
calculations, module identifiers, one host ticker and the source/font notices are preserved.
The rain API works with touch/keyboard buttons; Still settles only a bounded seeded batch.
PNG exports preserve the selected 2D frame instead of resetting turns or rain before saving.

## Validation

`tools/verify-effects.mjs` passed 34 views: all 17 parts at 1440x900 and 390x844 touch
emulation, Still task cleanup, Full operation, no overflow/errors/external requests,
28 keyboard parameter mutations, eight Still turn responses, two settled rain bursts,
and two actual PNG downloads decoded to the exact selected canvas pixels.
Greetings and Switch have no meaningful motion-parameter change in a settled Still;
Tube's fallback and direct invalid-parameter behavior were reviewed in its scoped lane.

The integrated ride also passed 16 scene views and two Still rain controls, including phone
Next bay navigation and feedback cleanup. Full-resolution local screenshots are retained in
the sibling release receipt; the phone scene sheet is in `effects/`.

Artifact checks passed 17 pages, three no-JavaScript routes and four configured HTML export/lift
round trips. Ride checks passed 19 tour/audio/navigation/lifecycle checks. Source syntax,
build and diff checks passed. All final cards are actual authored Still renders, and machine
screen assets are copies of the current original Jump, Relief and Scope stills.

One-second normal-rate JS tick samples in the integrated workbench were below the 4 ms target:
Range 1.72/1.89 ms, Wash 1.18/1.50 ms, Gate 1.09/1.05 ms, desktop/phone respectively.
Relief drift is capped at 30 Hz, so its 0.10/0.11 ms host-tick mean includes skipped redraws.
Terminator's idle sample also includes skipped draws. These numbers exclude GPU/raster work;
see `effects/effect-checks.json` for all samples and dimensions. Functional browser checks
ran on the same workstation during parts of this sampling window.

The opening lab under fourfold CPU slowdown observed no long tasks or overflow at either size.
Source is 519,533 bytes, 178,963 bytes gzipped. CLS was 0.022 desktop and 0.008 phone in this
short localhost window; these are local observations, not field Core Web Vitals or INP.

The new GLSL Tube optics were build-checked, but this headless Chromium intentionally declined
WebGL under `failIfMajorPerformanceCaveat`. The inspected fallback does not validate the shader
on hardware. Physical Android/iOS, Safari/Firefox, screen-reader tasks, actual 200% browser zoom,
GPU timing and phone thermal/battery behavior remain unverified. This is a scoped effect
refinement release, not whole-site REVAMP certification.

Publication continues the owner's explicit instruction to polish and send updates live at the
existing GitHub Pages destination. Source-bound clean rebuild and live hash/journey receipts
are retained in the sibling `ddl-boneyard-effects-release-20260930` directory.
