# BONEYARD local revamp review

2026-09-30. Approved theme: `desert-salvage-observatory`, Desert Salvage Observatory.
Baseline: `83a01e9`. Feature branch: `codex/boneyard-revamp`. Local preview:
http://127.0.0.1:4186/. This is implemented local work; no production deployment or public
preview was requested. Theme approval is recorded in brief.md; whole-experience owner acceptance
remains open.

Release follow-up: Tim requested "send it live!" on 2026-09-30, authorizing the existing
https://tgilbert14.github.io/ddl-boneyard/ target. The release audit added complete font notices
to every emitted and exported HTML file, and replaced inherited custom IBM font subsets with
unchanged IBM-authored Latin1 webfonts. Their pinned sources and byte hashes are in
assets/fonts/provenance.json. Final deploy and live verification receipts are retained in the
adjacent ddl-boneyard-release-20260930 directory. The browser/device limits below still apply;
this is not a fully certified REVAMP release evidence pass.

## What changed

The original native-scroll ride and all eight real effects remain. The opening is now a procedural
desert yard of physical CRT machines showing the work itself. Long default paragraphs became
optional About disclosures. Named desktop navigation becomes one phone dock. Warp and Scope have
explicit hold controls; Range, Relief, Terminator and Mark have tap/keyboard turns. The initial
revamp kept sound off and followed OS motion preferences. The owner-requested follow-up below
changes those defaults. Save-Data retains a lower canvas tier.

The shelf uses actual effect captures, local search and role filters. A part opens a canvas-first
workbench with validated parameters, reset, configured URLs, actual PNG export and configured HTML
export. Phone actions precede a collapsed parameter disclosure. The canvas uses its panel's actual
dimensions. Designed frames are embedded for the no-JavaScript workbench path.

Scientific calculations and asset sources remain inherited: Range shows real elevation with 2x
vertical exaggeration; Relief labels its 4x treatment; Wash is explicitly a slope model; the globe's
day line uses the actual clock. No generated media, new third-party runtime or external services
were introduced.

## Rendered and functional evidence

| Check | Actual result |
| --- | --- |
| 1440x900 | Opening, named bay navigation, moving Gate and desktop workbench inspected |
| 851x900 | Middle composition and named rail; no horizontal overflow |
| 390x844 | Opening, all eight deep-linked bays, compact menu, tap steering, motion settings, shelf search/empty/recovery, workbench and exports inspected |
| 320x568 | Opening and static fallback stress case; native primary actions and dock fit |
| 844x390 | Landscape opening retains machines and usable entry/nav; fresh Still reload inspected |
| Keyboard | Auto-fly toggle, bay steps, turn controls, motion settings; Escape returns focus to the owning summary |
| Reduced motion | 17 standalone mounts, zero remaining ticker tasks, no page errors or overflow |
| No JavaScript | Real disabled-JS browser contexts for ride, shelf and Range workbench; decoded inline frame, native links, enhancement controls hidden |
| Artifacts | Actual Range PNG/HTML browser downloads inspected; copies in artifacts/. Four exact export-API files lifted with adjacent assets, parameters preserved |
| Capture | All 17 stills and share cards regenerated; no page errors or external hosts |
| Source | 26 JavaScript files syntax-checked; build guards, output reproducibility and diff whitespace checked |

An unbriefed reviewer first used the named Range link. Opening the reusable part took two
navigation actions; switching Still and saving HTML took four meaningful actions total, with no
wrong turn. Final independent review confirmed the corrected export scripts/config and Escape
focus return. The in-app browser did not expose Blob download events, but the actual files were
found, inspected and copied byte-for-byte from Downloads.

Observed defects were fixed: unwired exports, stage/aspect mismatch, invalid FFT sizes, stale
filled animations and cancellation races, input cancellation cleanup, lost disclosure focus,
Still-mode scene redraw, WebGL overlay opacity, narrow no-script navigation overflow, desktop scrollbar-width leakage, buried phone
exports, and a serializer that accidentally matched its own marker literals.

## Local performance evidence

`lab.json` records local Chromium at DPR 1, fourfold CPU slowdown and localhost transport, with no
network throttle or real user input. The opening's LCP proxy was 80 ms desktop and 76 ms phone;
CLS was .022 and .008 respectively. No long tasks were observed in the fixed observation window.
The final source was about 426 KiB uncompressed and 154 KiB gzip. The first field loaded three local
machine captures in addition to the document; fonts are inline. No external resource requests.
These are local lab results, not field Core Web Vitals, INP, a Lighthouse score, or phone hardware
performance certification. Full rendering/GPU cost is not represented by JS ticker work.

Reproduce with the existing workstation runtime:

```
node build.js
node tools/capture.mjs
node build.js
node tools/measure.mjs http://127.0.0.1:4186/
node tools/verify-artifacts.mjs http://127.0.0.1:4186/
```

## Sources and limits

New `src/25-yard.js` is original DDL procedural artwork, declared MIT in its provenance header.
`assets/machine-*.webp` are copies of BONEYARD's original own-effect captures at this revision's
start. They are illustrative screens, not documentary hardware photographs. The fonts retain
OFL license files under assets/fonts. Sunset attribution stays in sunset-strip.json, elevation
bounds/method in catalinas-meta.json, and Natural Earth/world-atlas attribution in land-mask.json.
The individual part headers preserve technique, lineage, source, honest limits and measured dates.
No asset was sent to a generator.

Physical touch devices, Safari/Firefox, human screen-reader tasks, actual 200% zoom and forced-color
rendering were not verified. CSS includes forced-color treatment and keyboard/touch equivalents;
source inspection does not certify those device checks. Software Chromium can decline the WebGL
tube, so hardware WebGL coverage remains a release check. Existing dated module budgets describe
the prior measured implementation; this review does not relabel them as new measurements.

## Cinematic tour and sound follow-up

The owner requested a smoother cinematic tour, sound on scroll or Auto-fly, Full and sound-on
defaults, and publication after polish. Travel now uses easing with zero velocity and acceleration
at each end, exact scene positions, and 4.2-second scene holds. Pause, manual scroll and scene
interaction return control; tab hiding stops the tour. Replay travels back to the opening.
Resizing preserves the current scene and travel progress. Sound and motion controls stay usable
throughout, with a visible 44px mute target and stable pressed feedback. Fresh Full and sound-on
defaults honor this explicit request; saved motion and mute choices remain remembered.

Sound stays silent before ride intent. First scroll requests the engine bed; Auto-fly starts it
within the click gesture. Browsers that deny first-wheel playback show a one-tap pending state.
Mute fades and suspends audio, persists after reload, and is respected by subsequent scrolling
and Auto-fly. Still remains independent of the sound choice.

`ride-checks.json` records 19 passing installed-Chromium checks, no page errors and no external
requests. The first leg and dwell use real default timing. The complete nine-leg route test uses
compressed configured timing. Checks include orientation resize during a hold, keyboard Tab,
visible mute during flight, document/button style isolation, pause, wheel takeover, remembered mute, phone touch start/pause, 320px
layout and 44px controls, Still, shelf completion, replay and Escape. The blocked-audio recovery
test injects an AudioContext resume denial with actual native audio nodes and a trusted tap;
it is a controlled integration test, not a hardware Safari autoplay observation. The in-app
browser tour and pause were also exercised and visually inspected. `ride-phone.png` shows the
updated phone controls. Physical-device and cross-browser limits above remain open.

## Gate travel correction, 2026-10-01

The owner rejected the published reactor Gate and asked for retro travel through something.
The replacement is a continuously moving, full-viewport vector canyon with sunset-derived
light ribbons, staggered one-sided fins and a smooth forward Boost. Phone composition and
normal-speed motion were reviewed through multiple rendered iterations. The dedicated
local Gate suite passed 11 scenarios; the wider artifact checks passed 17 parts, three
no-JavaScript paths and four configured lifts, and the ride suite passed 19 checks.
See [the correction review](gate/travel-review.md) and the adjacent
`ddl-boneyard-flight-release-20261001` receipt for exact release evidence. Internal review
and publication do not imply owner acceptance of the replacement build.
