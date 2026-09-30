# PUNCH: the bad-ass pass (Tim, 2026-09-30: "this site should be BAD ASS, that's the vibe")

This amends the vision brief. The ONE feeling stays PULL, but the register goes from "restrained
museum" to **arcade cabinet at full brightness in a dark room**: every bay should make someone say
"whoa" within two seconds of arriving. Loud in light, motion and scale; still honest, still fast,
still controllable.

## What stays law (non-negotiable)
- One shared vanishing point; scroll is the camera; back button, keyboard and deep links work.
- Reduced motion and the Still dial get designed stills; the dial's Calm is the "tame" mode.
  **Full is now the loud mode.** Nothing flashes more than 3 times per second (WCAG 2.3.1), anywhere.
- No fake data, no fake telemetry. Real numbers only in readouts.
- Budget: 4 ms/frame per module on desktop; the phone must not drop below 30 fps at 4x CPU.
- No autoplay audio. Sound is opt-in behind one visible SOUND button; once on, it's allowed to be
  big.
- No em dashes. No text drawn in canvas.

## What the frames show today (read 2026-09-30, 1440x900)
- Yard: good bones. The title just sits there.
- GATE: the vanishing point is a dead black slit; colours muddy; speed polite.
- RANGE: solid. Could fly faster and lower in Full.
- WASH: gorgeous. Keep it; maybe brighter channels.
- RELIEF: tiny, jammed in the lower right, lines dim. Should fill the screen.
- TERMINATOR: good. Could glow harder at the limb.
- SCOPE: one thin quiet line. Should be a blazing, fat, multi-trace figure.
- MARK: edge-on sliver half the time. Should be big, hot, and fill the frame.

## The punch list
1. **Ignition** (yard): the tube switch-on becomes an event: the hairline, a white-hot flash
   (one), the title igniting letter by letter as phosphor (split text, aria-label on the parent),
   the grid snapping in from the horizon. Under 1.2 s total. Still: the lit title, no animation.
2. **Speed** everywhere in Full: faster cruise on the grid, pylons whipping past, hyperspace
   corridors that PUNCH (streaks, a camera shake of a few px, a brief chromatic split at peak
   warp), SWITCH transitions with the one-frame flash and a harder collapse.
3. **Light**: stronger bloom on the tube (it's the arcade glow), hotter phosphor cores, the amber
   used as a second colour on the loud moments (warp peak, Tucson, the pull glyph, MARK's edges).
4. **Scale**: RELIEF, SCOPE and MARK fill the viewport (the hero object spans at least 60% of the
   shorter side). No edge-on slivers: MARK's spin must keep the face mostly toward the viewer.
5. **GATE**: bright stargate core (fog toward a hot core colour, not black), saturated streaks,
   faster dolly.
6. **SCOPE**: fat, multi-pass trace (3 to 5 persistent copies), brighter core, bigger figure,
   ratio morphs visibly as the pointer moves.
7. **Sound (opt-in)**: a SOUND toggle in the HUD. When on: a low synth engine hum whose pitch
   follows scroll speed, a clunk on every tube switch, a rising whoosh on hyperspace, and SCOPE's
   tone as before. All synthesized in WebAudio (no files, no network). Remembered per device.
   Off by default; muted on hidden tab; volume sane.

## Ownership for the pass (disjoint files)
- legolas: `21-row.js`, `22-sky.js`, `30-switch.js`, `31-hyperspace.js`, `32-rings.js`, `40-jump.js` (speed, punch, shake).
- feanor: `41-gate.js`, `44-relief.js`, `46-scope.js`, `47-mark.js` (scale, heat, GATE core).
- arwen: `00-tokens.css`, `01-tube.css`, `20-tube.js`, `02-body.html` (ignition, bloom, amber, the SOUND button markup).
- foley: `24-sound.js` (new) plus the minimal wiring in `10-core.js` (one mount call, events for switch / warp / scroll speed).
- RANGE, WASH, TERMINATOR: small tweaks only if their owner asks; they already read well.
