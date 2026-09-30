# HANDOFF · feanor (bays 05 RELIEF, 06 TERMINATOR) · 2026-09-29

Requests for files I do not own. Each has the symptom I saw and a proposed fix.

1. `src/90-parts-harness.html` ctx.onReadout (and `src/10-core.js` ctx.onReadout): the 150 ms throttle is
   leading-edge only, with no trailing flush. A readout emitted within 150 ms of page start (performance.now()
   minus readAt=0 is under 150) or of a previous emit is dropped for good. In Still mode nothing ticks, so the
   parts page showed an empty readout under reduced motion. I work around it in both bays with one trailing
   setTimeout emit (400 ms). Proposed fix: keep a pending flag and flush on a trailing setTimeout, so every bay
   gets its last line without a workaround.
2. `src/01-tube.css`: `.room__tube > canvas { touch-action: pan-y; }` would let the sideways drag in RELIEF and
   TERMINATOR own horizontal touch moves while vertical page scroll stays native. Today both bays only arm a
   drag once |dx| > 8 and |dx| > |dy|, and a browser pointercancel ends it cleanly, so nothing is stolen; the
   CSS would just make a sideways drag on a phone less likely to be cancelled.
3. HUD at 390x844 (not mine, seen in my screenshots): the top-left clock and the top-right bay readout overlap
   on the first line ("06:27 PM" is drawn over "BAY 05 / 08"). The readout wraps to three lines on a phone.
