# Gate travel correction review, 2026-10-01

The reactor revision b87011b was rejected by the owner. This correction follows the owner's
retro science-fiction, visual ride direction and the request to travel through something.
Publication of polished updates to the existing GitHub Pages site remains authorized.
Owner acceptance of the exact replacement remains open.

## Result

Gate is an original, full-viewport vector canyon. Continuous walls, floor and ceiling carry
sunset-derived ribbons; staggered one-sided fins grow from depth and pass beyond screen
edges. The camera always advances. Boost smoothly rises, surges and settles into that same
forward cruise. No return to a stationary object. Portrait has its own width, focal length,
far fade and thicker light edges, with the route above the control plate.

Three rendered iterations were reviewed. The first blocked the route with broad dark fins.
The second opened the route but made the warm source into flat painted panels. The final
pass narrows the ribbons, adds segmented color and hot cores, retains dark surface margins,
and breaks distant fin outlines. The real sunset strip, original geometry, existing fonts
and asset provenance remain; no generated media or new runtime dependency was added.

The main action is Boost, with immediate pressed feedback and persistent status text for
assistive technology. Calm uses gentle forward acceleration with no Full punch or voice;
Still chooses a stable alternate travel frame synchronously, retains it through resize,
and starts no ticker. Leaving Gate cancels an unfinished boost and resets base speed.
Native vertical scrolling, Auto-fly takeover, sound intent and remembered mute remain.

The shorter rise exposed an audio initialization bug: the old whoosh timestamp could
suppress the first transit just after its context started. The initial sentinel now permits
the first voice while retaining the 1.5-second repeat gap. Exact event order and one voice
per Full boost passed. Gate-specific workbench ranges also preserve its fractional near
plane in URLs and configured HTML instead of rounding 0.48 to 1.

## Evidence

The lead operated the local phone-size scene through its visible Boost control and recorded
complete normal-speed phone and desktop cruise, Boost and settle journeys. These are actual
browser captures, not animations assembled from stills. The [phone view](travel-phone.png),
[desktop view](travel-desktop.png) and [sequence overview](travel-sequence.png) show composition;
the external motion recordings retain every recorded frame and timestamps. The first
independent frame review found forward growth, three complete near encounters in a 3.175s
phone glide, an open route, no reversal and no visible wrap pop. The final reviewer, `/root/tunnel_design_review`, inspected all 223 phone and 221 desktop
frames of the full final host journeys and all 96 frames of each final light glide, then
returned a reviewer pass with no remaining creative blocker in scope. Its attributed
verdict is retained in the external release receipt. This is not owner acceptance.

The dedicated suite passed all 11 scenarios: layout and targets at desktop, phone and compact
sizes; asset readiness; actual keyboard Boost and positive computed speed through every phase;
normal-rate work; Still PNG and configured HTML; synchronized sound and mute; Calm; interruption
and shared-state cleanup; real emulated touch swipe; resize, destroy and remount. Every configured
parameter survived an actual exported-file lift. Runtime, console, failed-request and external
request counts were zero.

The final local rAF-paced sample at 1050 x 852 DPR1 measured 475 calls: 0.380ms mean,
0.500ms p95 and 0.600ms maximum. Mean callback cadence was 8.334ms. Phase means were
0.388ms rise, 0.371ms surge, 0.380ms settle and 0.386ms cruise. The separately labeled
back-to-back stress loop measured 1.120ms mean and 27.700ms maximum and is excluded from
normal-rate budget evidence. These numbers include synchronous JavaScript and Canvas API
work and exclude asynchronous GPU, compositor, paint, network, physical-device and thermal work.

The receipt beside the checkout is `../ddl-boneyard-flight-release-20261001/`. It preserves
interim failures, final local and public checks, normal-speed recordings, the clean rebuild,
Pages run and SHA-256 deployment manifest. Source geometry SHA-256 is
`61fda4a4c7da63a10f0ed18a882ba8096bc0f51e0bb0c0cf4ba7200633195525`.
Docs, tooling and local recordings are excluded from the Pages deployment.

Phone checks use local Chromium touch emulation. Physical Safari, Android, thermal behavior,
GPU timing, acoustic sound levels and a screen-reader task remain unverified. A reviewer
pass is attributed evidence, not owner acceptance.
