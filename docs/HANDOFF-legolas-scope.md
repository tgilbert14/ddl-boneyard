# HANDOFF: SCOPE (07) and MARK (08), from legolas, 2026-09-29

Requests for the core owner. Nothing here was edited outside `src/46-scope.js` and `src/47-mark.js`.

1. **Gesture hook for the audio unlock.** `ctx.audio` (10-core.js, the ACI 2.6 stub) is never called
   inside a gesture, and `makeCtx` in 09-runtime.js does not carry it, so the parts harness has no
   `ctx.audio` at all. An AudioContext has to be created or resumed inside the pointerdown / keydown
   call stack (Safari is strict about this; Chromium only needs sticky activation). SCOPE therefore
   adds its OWN capture-phase `pointerdown` and `keydown` listeners on `window` while mounted. They
   only create/resume the context, only while the room ticked in the last 250 ms and the dial is not
   Still, skip the same targets the core skips, and are removed in `destroy()`. This bends the
   contract's "window listeners are not yours". Proposed fix: a core `ctx.onGesture(fn)` that the
   core's own pointerdown / Space-hold handlers call synchronously for the current holding bay; SCOPE
   would then drop its listeners. SCOPE owns its own AudioContext and closes it in `destroy()`, so it
   does not use the stub (closing a shared context would break the stub for good).
2. **`ctx.onReadout` throttle drops instead of deferring** (core `liveAt`, harness `readAt`, 150 ms). A
   readout sent inside the window is lost and never repainted. Seen: under the Still dial the MARK HUD
   shows no readout (its still() line lands inside SCOPE's window), and both parts pages under
   `reducedMotion: 'reduce'` print an empty readout. SCOPE and MARK now re-send every 500 ms while
   ticking, which fixes the moving case only. Proposed fix: a trailing flush (setTimeout for the
   remainder of the window).
3. **MARK geometry note.** `site/assets/ddl-cactus-mark.svg` has a trunk, a closed diamond (the two
   arms meet at 48,51), ONE node circle at the diamond centre (48,41), and a ground rail. It does not
   have node-tipped arms. MARK follows the SVG. If the pylons on the row draw node-tipped arms, one of
   the two should change so "the same glyph" is literally true.
