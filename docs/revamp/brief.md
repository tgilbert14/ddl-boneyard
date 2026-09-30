# BONEYARD revamp brief

Prepared 2026-09-30. Baseline commit: 83a01e9 (verify against Git before final evidence). Owner approved desert-salvage-observatory on 2026-09-30: fun retro Tron/scifi feeling; primarily visual cinematic ride with minimal words and a separately composed phone experience. Working branch: codex/boneyard-revamp.

The product is an immersive, original desert display-machine ride and a reusable library. Success means a visitor can discover what to operate immediately, move between the eight bays by name, and take a working part away without losing parameters or provenance. A builder should be able to go directly to the shelf, find a technique and operate it without traversing the ride.

## Audience and baseline

Curious DDL visitors, creative developers, and returning builders. Preserve the eight actual effects, one persistent field, local data, framework-free concatenating build, no external asset requests, module API, native scroll, URL deep links, OS motion default, sound opt-in, and designed stills. Retain real elevation, its units and explicit exaggeration; Wash remains a slope model. The actual UTC day line remains computed from the visitor's clock.

The current opening has strong vector depth and a readable title but lengthy orientation copy. Fixed controls use tiny numbered navigation with no visible bay names. Pull icons require inference. The shelf is a wide technical table with small thumbnails. Part controls and long notes cover much of the animated work and offer no obvious save/reset/share workflow. Baseline operation was inspected in the Codex browser at 750 x 880: yard, Range, and Range standalone. Other viewport and browser evidence is pending.

Routes: ride index; eight bay fragments and shelf fragment; parts index; sixteen standalone modules including layers, corridors, post treatment, eight bays and placeholder. There are no forms, authentication, analytics, or checkout. GitHub Actions publishes on main; a feature branch is the preparation boundary. Generated outputs must be rebuilt and committed with source.

## Three different mechanisms

| Mechanism | Real material and action | Immediate response and consequence | Later use | Desktop / phone / static |
| --- | --- | --- | --- | --- |
| Direct amplified ride | Native scroll or named bay links operate existing field | Immediate active bay, local instructions, direct Pull link | Part opens with the same effect; controls adjust real parameters | Full effect, compact thumb-reachable controls, designed frames |
| Salvage observatory | Scroll moves through physical housings carrying the eight real effects | A cabinet approaches, opens into the existing work, settles into a readable hold | Pull enters a legible workbench; save/export carries selected parameters | Composition-scale procedural desert and housings; portrait recomposition; source stills |
| Build-your-own effect rack | Select multiple effects and arrange a composition | New combined preview | Export a new composition | Potentially useful, but changes module composition contract and adds a second product |

Recommend salvage observatory as the organizing mechanism, with the direct path preserved. The rack is deferred because it changes scope and could obscure the primary ride. There is no selector or intro gate before the ride or part links.

## Visual review

Exactly three comparable style guides in directions.html and directions.jpg: 01 desert-salvage-observatory (new), 02 sonoran-signal-cinema (catalog adaptation), 03 vector-crt-amplified (current language). Each shows the same opening, Range capture, motion controls, pull action and state storyboard. Owner explicitly chose 01 and refined it toward a fun, cinematic visual ride with little copy and exceptional phone behavior.

## Technical and performance targets

Keep zero third-party resource requests. Minimize additional boot work and avoid a second ticker. Keep module API and standalone emit intact. Navigation state commits immediately; motion can settle later. Existing target: LCP <= 2 seconds, CLS <= .05, total blocking <= 300 ms (lab only, no claim until measured). Retain adaptive canvas resolution and 4 ms/module target; label frame work as JS work rather than total frame time. Sound remains off without user intent. Still mode should stop the renderer at rest. All resource/animation/pointer ownership must clear on blur, cancellation, page hide and module destruction.

## Deliverable scope and fallbacks

An upgraded ride, useful parts shelf, and actual workbench. Validate full content volume, long metadata, controls, depth transitions, URL state, standalone asset resolution, no-JS semantics and designed stills. Save-Data should start on a lower-cost tier unless the user chose otherwise. Static captures must be deliberate authored frames; download controls must yield working artifacts.

Local build and review only currently authorized. No main push, public preview, production deployment, domain changes, or external service connections implied. Final review records actual screenshots, tested viewports, passing contracts and honest browser/device limits.
