# Gate reactor review, 2026-10-01: owner rejected

This review records revision `b87011b033c01fbcf43e2dde268c229dafdf5cc2`.
The independent reviewer passed it and its technical checks passed, but the owner
subsequently rejected the rendered result: "terrible... revert it or make it fit the vibe
of retro and traveling through something... take your time". The reactor direction is
creatively rejected. Neither the review nor publication represented owner acceptance.
The replacement is documented in [the travel correction](travel-brief.md).

Owner feedback: "gate 2 sucks.. i need you do go all out and ramp it up!!"
Baseline: ec9a2b5edf15f18ee951d173cad15faa788f7100.
The owner previously authorized polished updates to go live on the existing GitHub Pages site.

## The built scene

Gate is now a constructed reactor in a hangar. Crisp segmented metal, bevel faces, clamps,
a thick inner lip and occluding barrel shells create the spatial hierarchy. Narrow channels
sample the existing, attributed Sonoran sunset strip. Coral, orange and rose light remains
inside the dark throat, with the project's cyan accents on the machine. The original
canvas-wide 320px fan and its muddy central slit are gone.

Fire gate scans and charges the assembly, retracts the clamps, advances through expanding
barrel tiers, then settles. Idle remains alive without an automatic full blast. Phone uses
fewer and thicker depth tiers; Calm reduces travel and removes the Full burst; Still draws
a selected energized composition synchronously.

The independent visual review required two substantive revisions: replacing the marbled
aperture with a deep barrel, then sharpening its narrow light channels. Final structural,
color, traversal and full-phone composition criteria passed. See the [baseline](baseline.webp),
[charged scene](after-charge.png) and [actual phone ride](after-phone.png).
At the centered 390 x 844 phone viewport, Fire's bottom was 745px and navigation's top 770px,
leaving 25px of clearance. The complete idle silhouette is visible above the plate.

## Interaction and lifecycle

- Native vertical scrolling and the eight-bay navigation remain the ride's clock. Fire
  interrupts Auto-fly and keeps the outer scroll position.
- Fire reports unavailable before the sunset asset loads. The ride announces results through
  a status region, and the standalone action has a minimum 44px target.
- Full traversal emits one Gate event and owns its synchronized whoosh. Sound begins only
  after ride intent, and a remembered mute continues to win.
- Switching the room off cancels the unfinished action and releases shared energy ownership.
  Re-entering the mounted room needs a fresh Fire rather than resuming an old crossing.
- Still preserves the chosen energized composition across redraw and orientation changes.
  The actual PNG download retains those decoded pixels, and configured HTML remains portable
  with the existing asset-path note, source link and font notices.

## Evidence and limits

The existing artifact suite passed 17 mounted parts, three no-JavaScript paths and four
configured HTML lifts. The tour/sound suite passed 19 checks, with no runtime errors or
external requests. Gate's dedicated acceptance receipt includes desktop, phone and compact
layouts; real keyboard and touch actions; normal-speed charge, crossing and repeat;
pre-load feedback; sound order and mute; Still PNG/HTML; orientation; cancellation; and
destroy/remount behavior. All 11 dedicated scenarios passed, with zero failures, runtime
errors, failed requests or external requests. Desktop, phone and compact action/navigation
clearances measured 42px, 25px and 25px, with successful center hit tests.

CPU is measured with requestAnimationFrame-paced calls through the module at normal playback
cadence, with the host ticker paused, and separately with an unpaced loop. The initial
unpaced launch loop measured 11.347ms mean during concurrent browser work. That stress result
is retained in the release receipt. The final 1050 x 852 DPR1 normal-rate sample measured
410 calls: 0.597ms mean, 0.700ms p95 and 2.800ms maximum. Phase means were 0.600ms charge,
0.648ms travel, 0.587ms recovery and 0.569ms settled. Observed frame cadence was 9.817ms mean,
16.700ms p95 and 18.500ms maximum. The separately labeled back-to-back stress run measured
10.528ms mean and 754.900ms maximum, and is explicitly excluded from normal-rate budget evidence.
Timing includes synchronous JavaScript and Canvas API work, and excludes asynchronous GPU,
compositor, paint, network and thermal behavior.

The source sound graph was rendered for six seconds at mono 48kHz with the Gate charge and
0.48s, 0.85-level whoosh. FFmpeg's EBU R128 check measured -23.0 LUFS integrated and -9.8 dBFS
true peak. These are script-specific offline values. Physical sound levels were not measured.

Browser checks use the installed Chromium runtime and phone/touch emulation. Physical Safari,
Android, thermal and GPU performance remain unverified. The final release is rebuilt from a
clean Git archive and all served files are bound to its SHA-256 manifest before live acceptance.
The external receipt is `../ddl-boneyard-gate-release-20261001/` beside this checkout; docs and
tools are excluded from the Pages deployment.
