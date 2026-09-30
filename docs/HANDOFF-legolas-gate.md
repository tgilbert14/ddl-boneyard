# Handoff from legolas (GATE + RINGS), 2026-09-29

Changes I need outside my two files. I did not make them.

1. **HUD collision at 390 px wide (10-core.js / 01-tube.css HUD).** On `/#gate` at 390x844 the right-hand
   HUD line ("BAY 02 / 08 · GATE · <readout>") wraps and overprints the clock at top left. It happens even
   with the bay label alone, so it is the HUD layout, not the readout length. Suggest: on narrow screens, drop
   the readout to its own second line under the bay label, or hide the clock below ~480 px.
   Screenshot: scratchpad `boneyard-check/gate-3/ride-gate-phone.png`.
2. **Rings sit under the outgoing room.** Between TERMINATOR and SCOPE the corridor canvas paints beneath
   the receding room frame, so at progress ~0.5 the tunnel's centre is seen through the terminator tube's
   outline. Reads fine; only flagging in case the core wants corridors above receding rooms.
3. **Harness readout throttle (90-parts-harness.html).** `ctx.onReadout` drops any update inside 150 ms of the
   last and never flushes a trailing one. Under reduced motion a module that reports once (from an async
   onload) can be swallowed if it lands inside that window. A trailing-edge flush would make it exact.
