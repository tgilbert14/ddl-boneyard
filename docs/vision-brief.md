# Vision Brief: BONEYARD (working name)

Galadriel here. I have looked, and this is what the site wants to be.

Tim asked for an all-out retro sci-fi motion showcase that is also DDL's living library of
effects. Those two jobs pull against each other only if the library is allowed to show on the
ride. So the ride is a place you fly through, and the library is a shelf you walk to. On the ride
the only trace of the shelf is a 16 px "pull" glyph in the corner of each nameplate. Off the ride,
every effect is one plain file on its own plain page. The vibe is never asked to explain itself.

What the site is: a Tucson boneyard at night, but of display machines. Retired consoles, cabinets
and scopes stand in a row on the desert floor under a survey light-grid, their tubes still on,
each drawing the one thing it was built to draw. You fly down the row at a low hover. Every screen
is a room. Every room is a part you can pull. The desert keeps old machines flyable because the air
is dry; this site keeps old screen tricks flyable because the code is small. That is the whole
metaphor, and it is true of the real place a few miles from Tim's desk.

Written 2026-09-29 for the MITHRIL fan-out (legolas, gimli, arwen), then grinch, then smaug.
No em dashes anywhere in this brief, and none in any copy string it proposes (house rule).

---

## The portable brief (the six-header block, plus the house extras)

```
Audience:  three arrivals, in weight order.
  (a) Prospects and peers clicking through from desertdatalabs.com (the "Interactive web
      experiences" grid in flagship/src/data/experiences.ts, the Work page). Curious, unhurried,
      giving it one to three minutes, half on phones. They came to see whether DDL can make a
      screen do something, not to get a quote. The quote lives on the flagship.
  (b) DDL's own builders (Tim, the fleet) coming back for a part. They want ONE file, its PARAMS,
      and a how-it-works note, in under a minute, without touching the ride.
  (c) The share crowd (Hacker News, demoscene people, Tucson locals) arriving from a link and
      deciding in ten seconds whether to keep scrolling. They have seen a thousand synthwave grids
      and are braced to be bored.

The one feeling:  PULL. Forward momentum into depth: every room, corridor and background layer
  pulls the eye toward a vanishing point on a flat screen. Nostalgia and wit are seasoning.
  Virtuosity ("look what the machine can do") is the site's MESSAGE, not its feeling: the visitor
  feels pulled, and concludes on their own that we are good.

Register:  IMMERSIVE, because the site IS the pitch and every arrival will linger; there is no busy
  buyer here (the flagship serves them). The discipline inside immersive, non-negotiable:
  - Scroll is the only clock. Nothing moves the page except the visitor, or an explicit and
    interruptible Auto-fly they pressed.
  - Every room has a HOLD. Centered on a room, the effect idles at cruise, the nameplate is still
    and readable, and the pointer is the only thing that raises intensity.
  - A motion dial in the HUD: Full / Calm / Still. Defaults to the OS setting. Remembered.
  - The floor is a designed page: JS off = a complete illustrated index; reduced motion = one
    designed frame per room, never a stripped scene.

Wrapper:  vanilla. The DDL concatenating build.js (the Orrery pattern, playbook §2.13) emitting
  index.html (the ride) + parts/<slug>.html (one standalone file per effect) + parts/index.html
  (the shelf). GitHub Pages at tgilbert14.github.io/ddl-boneyard/. Listed in experiences.ts.

Continuity model:  one persistent visual field (a fixed vector-CRT canvas, "the tube"), one variable
  (scroll position = camera distance along a straight flight line down the row), no cuts.
  - WHERE YOU CAME FROM: the room you leave collapses to a horizontal line, then a dot, and the dot
    recedes to the vanishing point behind you (the CRT switch-off). The index strip keeps visited
    bays lit.
  - WHERE YOU ARE: the grid floor is continuous under every room and recedes at the scroll rate;
    it never leaves, because the rooms are screens standing ON it. The HUD names the bay
    ("BAY 04 / 08 · WASH"). Every room that has a vanishing point shares the SAME vanishing point
    (50% x, 38% y, plus a ±4% pointer parallax), so the eye never re-aims.
  - WHAT TIME IT IS: the HUD clock is the visitor's real local time; the horizon tint follows their
    hour; the Terminator room's day/night line is computed from the real date. No other "live"
    number exists on the page.
  Motion that answers none of the three is cut in this brief (see the cut list).

Reference essence:
  - 3d-retro.com (31 CC0 demos): borrow the MENU of techniques and the single-file discipline
    (PARAMS up top, reduced-motion draws one frame, DPR capped, pointer shifts the vanishing point).
    Do NOT copy the code (no repo, unreviewed, HN found the globe perspective, teapot backfaces and
    plasma history wrong), the museum framing (31 unrelated toys with no world), or the three 2026
    Navier-Stokes editorial pieces (someone else's argument).
  - Tron (1982), Battlezone (1980), Tempest (1981), Vectrex (1982): borrow the vector-CRT idiom:
    glowing strokes, long-persistence trails, a black field, the perspective light-grid. Do NOT
    borrow the props (light cycles, recognizers, discs are Disney design, and the Orrery's Velocity
    already races cycles).
  - Elite (1984), Star Raiders (1979): dotted spheres, parallax stars, the cockpit's economy of ink.
  - The Amiga/C64 scene (1988-1994): glenz vectors, the greetings scroller, the dot tunnel.
    Do NOT bring plasma, fire, copper bars or rotozoomers as rooms (raster-era screensavers with no
    vanishing point).
  - 2001 (Trumbull, 1968): slit-scan.
  - NASA Eyes: one world, one clock, no cuts.
  - DDL prior art: the Orrery's build + covenants (all rooms in the DOM from byte one, headline is
    the LCP, canvas aria-hidden, DPR cap, one ticker), Voxel Catalinas (the real DEM), 27 Miles'
    life-zone palette, andrewcalebintl's rAF ticker / fxLock / audio-unlock. Do NOT bring ACI's
    VHS, scanlines, channels or synthwave radio; do NOT bring the Orrery's hub-and-spoke nav,
    Derelict, glyph rain or invaders cabinet. This is the OTHER retro: the black-and-cyan future.

Emotional arc:  black field + one line of phosphor type (first paint) -> the tube switches on
  (a hairline opens into the grid, 0.5 s) -> the yard at rest: grid, saguaro pylons, stars, the
  clock -> first scroll: the floor moves, a frame grows on the horizon -> BAY 01 JUMP: the stars
  you were just looking at stretch (the first pull) -> the grammar repeats: hold, pull, switch,
  next -> the ground turns real (RANGE flies the actual Catalinas; WASH lets rain find the actual
  washes; RELIEF holds the range as an object) -> the sky turns real (TERMINATOR: the day line,
  right now) -> the machine sings only if you press it (SCOPE) -> the mark, spinning, glass
  (MARK) -> sign-off: the shelf link and the way home.

Wow shortlist (each serves PULL; effort in brackets; feasibility checked below):
  1. RANGE, the voxel flight over the real Catalinas [large, and already built; integration medium]
  2. WASH, a drainage flow field on the same real elevation [medium]
  3. GATE, slit-scan whose slit is one column of a real Sonoran sunset [medium]
  4. SCOPE, an XY oscilloscope where what you hear is literally what you see [medium]

Do NOT build:  see §5 (fifteen named cuts, each with its reason). Headline cuts: no vaporwave, no
  VHS, no scanlines, no autoplay or ambient score, no fake terminal typing or boot POST, no fake
  telemetry, no light cycles / glyph rain / invaders (the Orrery has them), no Tron props, no
  Star Wars crawl, no plasma/fire/fluid/cloth/teapot/boing rooms, no hub nav, no preloader, no
  mandatory snap or wheel hijack, no second feeling.

Static / reduced-motion end-state:  see §3.4. JS off: a designed index page (CSS grid horizon, the
  title, eight nameplates with lineage lines and their part links, the greetings line, sign-off).
  Reduced motion: every module's still() draws its designed frame; corridors become 200 ms
  crossfades; the grid is a still; Auto-fly does not run.

NEEDS FROM TIM:  three questions in §7 (the name/frame, folding Voxel Catalinas in, the sound
  ceiling). Nothing else in this brief needs an answer to start building.
```

---

## House constraints the builders inherit (state once, never relitigate)

- Framework-free vanilla JS; Canvas 2D for the rooms, WebGL1 only for the optional tube post-pass
  (and each room must look right WITHOUT it, so the parts run standalone with no skin).
- The DDL concatenating `build.js` pattern (Orrery `build.js`: a single manifest array, CSS/HTML/JS
  derived by extension, fails loudly on any surviving `__PLACEHOLDER__`), extended with a parts
  emitter (§6). GitHub Pages hosting. Linked from the flagship experiences grid and Work page.
- Every effect holds on a throttled mid-tier Android: DPR capped at 1.5 desktop / 1 mobile;
  adaptive internal resolution (30 consecutive frames over 20 ms drops the internal scale one step:
  1 -> 0.75 -> 0.5, and turns off the tube's bloom; never below 0.5); ImageData rooms render to a
  320 to 480 px wide buffer and upscale pixelated (that is also the look). Per-module budget:
  4 ms/frame at internal res, measured and written in the module header.
- One rAF ticker (ACI §2.1) that stops when the queue is empty. Only the current bay, its corridor,
  and the four layers are mounted; everything else is destroyed, not paused. IntersectionObserver
  mounts one bay ahead (rootMargin 100%). `visibilitychange` pauses the ticker and any audio.
- Native scroll only. `scroll-snap-type: y proximity` is allowed (it is native and keeps the back
  button); `mandatory` is not. No wheel handlers that preventDefault, no smooth-scroll libraries,
  no transform on body/html (playbook §2.4; the fixed HUD would tear).
- Reduced motion = a designed still per module. JS off = a readable, designed page. `prefers-reduced-
  motion` sets the dial's default; the dial can override either way and is remembered.
- No autoplay audio. The only sounds are user-held (§4 SCOPE) or a single 20 ms switch tick that
  is itself opt-in through the same audio-unlock choreography (ACI §2.6). Off by default.
- Honesty: no fake data, no fake live telemetry, no invented history. Every lineage line on a
  nameplate is checkable (the verified list is in §4.3). The greetings scroller names real people
  and real years. Vertical exaggeration in RANGE is shown in the HUD. WASH says it is a slope model.
- All text is real DOM; canvas is `aria-hidden` scenery. Keyboard: PageDown/arrow keys move a bay;
  each bay is a `<section>` with an `<h2>`; the pull link is a real `<a>`; the dial is a radiogroup;
  SCOPE's hold works with Space; RANGE keeps its keyboard controls. Skip link to the shelf.
- Deep links: `#jump`, `#gate`, `#range` (plus `?t=`), `#wash`, `#relief`, `#terminator`, `#scope`,
  `#mark`, `#shelf`. `replaceState` as you scroll; `pushState` only on explicit index clicks.
- og:image for the ride = the yard at rest with the title (1200x630, baked at build or captured);
  every parts page carries its own title, description and og still.
- Copy goes through the Grinch cringe gate; the site through Smaug's kill list. No em dashes.

---

## 1. Audience, the one feeling, the register (the discipline inside "all out")

Tim said "all out." The Mirror's job is to say what "all out" means here, because the failure mode
of an all-out motion site is not too little spectacle, it is spectacle with no rest and no aim.

**The audience will linger, so immersive is honest.** Nobody arrives at this URL needing a price.
They arrive from the experiences grid (four siblings already there: The Long Saturday, 27 Miles,
The Orrery, ACI), from a share, or from inside DDL looking for a part. Immersive-by-default is a
trap when the buyer is busy; here the buyer has already chosen to play.

**The one feeling is PULL.** Every technique on the menu that earns a room does one thing: it
makes a flat screen pull you forward into depth. Hyperspace, the slit-scan corridor, the receding
grid, the ring tunnel, the voxel flyover, even the globe's dots crowding at the limb: all of them
are a vanishing point doing work. That is why they share ONE vanishing point on this site. The
moment two rooms aim differently, the eye re-aims, the pull breaks, and the page becomes a
playlist. Two feelings is no feeling; two vanishing points is no pull.

**The discipline: rest, control, floor.**
- Rest: each bay has a hold pose at cruise. The nameplate is real DOM and does not animate.
  Intensity is raised only by the visitor (pointer position, press-and-hold, the stick in RANGE).
  Corridors are where the site is loud; bays are where it breathes.
- Control: scroll drives the camera and nothing else drives the scroll. Auto-fly (the demo mode,
  the Orrery's Grand Tour precedent) is a visible button, moves the page at reading pace, and any
  input ends it. The motion dial (Full / Calm / Still) is in the HUD from byte one.
- Floor: the site is designed still first. §3.4 describes the exact frame each module draws with
  motion off, and the no-JS page is an index somebody would be happy to land on.

**Palette and type (direction for arwen, not the hexes).** A black-to-blue-black field. ONE
phosphor: a cyan-white stroke with a slightly warmer core (long-persistence radar tubes glowed
blue-white and decayed toward yellow-green; borrow the idea of a two-temperature stroke, not a
literal P7 chart). ONE accent: a desert amber, used only for the pull glyph, the visited-bay ticks,
and the Terminator's sunlit limb. The six life-zone colors appear ONLY inside RANGE, because there
they are data. OKLCH tokens, `@property`-registered where animated. Type: a Eurostile-family
display face for the title and bay names (Michroma is the OFL stand-in; this is the 1982 face
without quoting Tron's own logo), a humanist mono for the HUD and notes (IBM Plex Mono or Space
Mono). NOT Audiowide or VT323 (ACI's faces), NOT Orbitron (the default sci-fi tell). One embedded
latin subset per face, base64 in the build like ACI.

---

## 2. The name

Three candidates, checked against products in OUR audience (web developers), not just the general
market, because that is where a collision costs us.

1. **BONEYARD** (my pick). The 309th Aerospace Maintenance and Regeneration Group at Davis-Monthan
   in Tucson is the largest aircraft storage and regeneration facility in the world: about 2,600
   acres, an inventory in the low thousands (the March 2025 line-by-line list was 3,247 airframes;
   larger counts circulate depending on what is counted), roughly a hundred aircraft regenerated a
   year and parts reclaimed from the rest, sited there because the dry air and hard alkaline soil
   keep metal from corroding. That is exactly this site: old machines kept in dry storage, still
   flyable, and you may pull a part. The word names the place, the library job, and the humor in
   one breath, and it does not sound AI-named because it is a proper noun Tucson already uses.
   Collision: not a famous product. There is an open-source React skeleton-loading library called
   "boneyard" (about 3.4k stars), a Boneyard Software LLC at boneyard.io, and a Boneyard Collective
   design studio. None owns the word and none is a showcase; nobody will npm-install us by mistake.
   Handle: repo `ddl-boneyard`, `tgilbert14.github.io/ddl-boneyard/`, and `boneyard.desertdatalabs.com`
   later if Tim wants a Cloudflare hostname. Diegetic vocabulary: the ROW (the ride), a BAY (a
   room), a PART (a module), PULL (lift it), the TUBE (the CRT skin), the SHELF (the parts index).
   Risk: the graveyard reading. The first line of copy must carry "still runs" (chaz writes it;
   the AMARG fact backs it), and the yard's own nameplate says in one line that this is a fiction
   of display machines, not the Air Force's planes.

2. **RETRACE** (runner-up). The CRT beam's flyback between lines is the retrace, and to retrace is
   to go back over old paths, which is what a tour of forty-year-old tricks does. Technique-native,
   one word, human. Collision: Stackify Retrace, an APM product known in .NET circles. Says nothing
   of Tucson, and the library metaphor has to be bolted on.

3. **VANISHING POINT** (third). Names the feeling itself. A 1971 film and a common phrase, not a
   tech product. Two words every design blog has used, and no place in it.

Rejected in passing: PHOSPHOR (Phosphor Icons is on half the web; famous in exactly our audience),
AFTERGLOW (PDP's controller line, and a hundred other things), STATION 32 (a tracking-station
fiction at Tucson's latitude that we would have to explain, and it reads as a radio station next
to ACI's Skywave 99.9), SKY ISLAND (Sky Island Alliance is a real Tucson conservation org).

---

## 3. The world and its continuity model

### 3.1 The place

A boneyard at night, of display machines. The desert floor is the survey grid (vector lines to a
horizon at 38% of the viewport height). Standing on the grid at intervals, left and right, are
wireframe saguaros: not decoration, they are the DDL mark. The brand glyph (`site/assets/
ddl-cactus-mark.svg`, `flagship/src/components/BrandMark.tsx`) is a saguaro drawn as a circuit
trace: trunk, two node-tipped arms, a ground rail, inside a rounded chip. Drawn as a 1/z vector
object it is the pylon of this world, and in the last bay it is the keepsake. Above the grid: a
two-plane starfield and a horizon band tinted by the visitor's hour. Down the row, each machine's
screen is a rectangle that grows from the vanishing point as you approach and fills the viewport
when you arrive. Inside the rectangle is the room. Leaving, the screen blanks (line, dot, gone)
and the next rectangle is already growing on the horizon. The grid never cuts. The stars never cut.

### 3.2 How a visitor moves

Native scroll down one long page. One viewport height of scroll = one bay length. Each bay is a
`100svh` `<section>` with `scroll-snap-align: center` under `y proximity`, so a lazy scroll lands
on a hold without ever fighting a deliberate one. Within a bay the scroll offset from center is
the bay's own progress variable (used by GATE for dolly speed, by SWITCH for its timing). Keyboard
moves a bay at a time. The index strip (eight ticks, bottom right) is a list of real links. Auto-fly
scrolls at reading pace and stops on any input. There is no hub, no picker, no camera flight the
visitor did not scroll.

### 3.3 The first sixty seconds, beat by beat

- 0.0 s  First paint, HTML + CSS only (target 30 KB). Black. A pure-CSS perspective grid (a
  repeating gradient on a `rotateX` pseudo-element, static) with the horizon at 38%. The title in
  phosphor type, real DOM, the LCP, never opacity-gated. One line under it (chaz). A scroll cue
  chevron. HUD corners: real local time (top left), "BAY 00 / 08 · THE YARD" (top right), the
  motion dial (bottom left), the index strip (bottom right).
- 0.3 s  JS boots. The canvas mounts behind the DOM. The tube switches on: a hairline at 38%
  widens vertically to fill the frame over 500 ms, and the CSS grid hands off to the canvas grid
  at the same vanishing point, so nothing jumps. This is the first illusion and it is 500 ms
  (WCAG's 5 s auto-start cap is not approached; nothing else auto-starts).
- 0.8 to 6 s  The yard at rest. The grid drifts toward you at idle cruise (about 0.4 grid units a
  second, the "powered on" hum). Saguaro pylons stream past slowly at 1/z. Two star planes. The
  horizon band is whatever hour it is where the visitor sits. Nothing else moves. No text
  animates. A visitor can stay here; the page is complete.
- 4 s  The greetings scroller starts in the footer bar at reading pace (the provenance line, §4).
- 8 s  If no scroll yet, the chevron pulses once. Once. The page never scrolls itself.
- On first scroll  The floor answers scroll velocity (eased, 120 ms), pylons speed past, and a
  rectangle appears at the vanishing point and grows 1/z: BAY 01's screen. The corridor into
  BAY 01 is HYPERSPACE: the same stars that were resting above the grid begin to streak.
- About 10 s  Threshold. The rectangle fills the viewport; the switch-on line opens INTO it. You
  are in JUMP. Pointer or touch shifts the vanishing point (±4%); press-and-hold raises warp;
  release settles to cruise. The nameplate rises from the bottom edge as real DOM: "01 · JUMP ·
  hyperspace starfield · 1977 to 1993" and, in the corner, the pull glyph. Hold.
- About 20 s  Scroll on. The nameplate leaves; the room collapses to a 2 px line, then a dot, and
  the dot recedes to the vanishing point (SWITCH, 350 + 600 ms). The grid is still there; it never
  left. The next rectangle is growing on the horizon. Index tick 01 turns amber.
- About 25 s  BAY 02 GATE opens: slit-scan streaks in the colors of a real Sonoran sunset. Pointer
  shoves the corridor; scrolling inside the bay changes dolly speed. Hold.
- About 40 s  BAY 03 RANGE: the voxel flight over the real Catalinas begins its autopilot tour on
  arrival (the tour is the hold); pointer or arrow keys take the stick; the HUD shows real
  elevation under the camera and the 2x exaggeration. Scroll on to leave.
- About 55 s  BAY 04 WASH: rain finds the washes on the same mountains you just flew.
- 60 s  The visitor has felt four different pulls, seen the same grid under all of them, and
  knows the grammar: floor, frame, switch, hold, pull. Everything after this is variation and
  crest.

### 3.4 The static and reduced-motion end-state (designed first)

**JS off.** The CSS grid horizon and the title; then the eight bays as an ordered list of
nameplates (number, name, lineage line, one sentence on what it does, the pull link to
`parts/<slug>.html`); the greetings line as static text; the sign-off with the shelf link and the
way home. A complete, designed index page. This is also what crawlers index; each parts page has
its own title and description.

**Reduced motion (the dial's Still).** Every module's `still()` draws its designed frame:
- THE ROW: a static grid with pylons; THE SKY: static stars at the current hour's tint;
  GREETINGS: a static line; SWITCH: a 200 ms opacity crossfade instead of the collapse.
- JUMP: mid-warp with short streaks (the frame that reads as "hyperspace" in a screenshot).
- GATE: mid-corridor, the sunset streaks fully drawn.
- RANGE: `t=22`, just past the summit heading southwest for Mount Kimball (corrected 2026-09-30: the pose the Labs page also shows at t=22; arrow keys
  step the view).
- WASH: the frame after twenty seconds of accumulation, precomputed on mount so the washes are
  already drawn.
- RELIEF: a three-quarter view of the range.
- TERMINATOR: the globe facing Tucson with the real day line at load time.
- SCOPE: a 3:2 Lissajous at full persistence.
- MARK: the chip mark at a 30 degree pose.

**The dial's Calm.** Half cruise speeds, no flash frame in SWITCH, no pointer parallax, WASH at
half the particle count, RANGE's tour at half speed.

---

## 4. The room list (14 modules: 8 bays, 2 corridor modules, 4 layers)

Order down the row, with the corridor that leads into each bay. Effort classes: small (a day or
less), medium (two to four days), large (a week or more). Every entry: lineage, the DDL twist,
effort, role, and its still.

### 4.1 Layers (always mounted, under everything)

**L1 · THE TUBE** (the phosphor skin) · lineage: the vector CRT (the oscilloscope; Asteroids
1979; Battlezone 1980; Tempest 1981; Vectrex 1982). A WebGL1 post-pass that samples the composited
2D canvas as a texture: persistence (previous frame times a decay plus the current frame), a
quarter-res two-pass bloom added back, a very slight barrel (k about 0.04) and a vignette. NO
scanlines: vector tubes had none, and scanlines are ACI's. DDL twist: it is one wrapper every room
draws through, and every room must look right without it (each owns a cheap double-stroke glow),
so parts run standalone with no skin. Effort: medium. Role: background layer. Still: persistence
off (a crisp single frame), bloom on. Falls off first under the adaptive budget; absent without
WebGL.

**L2 · THE ROW** (the grid floor and the saguaro pylons) · lineage: the Tron light-grid (1982),
the Battlezone horizon (1980), the per-scanline perspective floor (Sega's Space Harrier 1985, the
SNES Mode 7 1990). Horizontal lines at one world unit in z, scrolling by camera z; two rails and
verticals every unit; all projected 1/z to the shared vanishing point. Pylons: the saguaro-circuit
glyph as a vector object at x = ±3 units every 6 units, 1/z scaled, double-stroked. DDL twist: the
pylons are the brand mark, and the grid is the odometer of the whole ride (its rate IS the one
clock). Effort: small to medium. Role: background layer. Still: one static frame with pylons.

**L3 · THE SKY** (parallax stars and the hour) · lineage: Star Raiders (1979), Galaga (1981)
multi-plane stars. Two planes (about 300 far, 120 near) drifting with camera z at different
factors; no twinkle (twinkle is churn). The horizon band takes a 24-stop OKLCH tint from the
visitor's local hour (pre-dawn indigo, dawn amber, day pale, dusk orange, night blue-black); the
ground stays black at every hour. DDL twist: time continuity, honestly earned (it is the clock,
not weather; the nameplate for the yard says so). Effort: small. Role: background layer. Still:
static stars at the current tint. Note for arwen: if the daytime tint reads as "a dark yard at
noon" in build, clamp the ramp to dusk-through-night and say so in the module header.

**L4 · GREETINGS** (the provenance scroller) · lineage: the C64/Amiga cracktro sine scroller
(about 1985 to 1992). Real DOM: a duplicated track moved by transform (never `<marquee>`), each
glyph a span with a negative-delay phased translateY (playbook §2.7), `aria-label` on the parent
with the plain sentence, spans `aria-hidden`, pauses on hover and focus. DDL twist: the demoscene
"greetings to" list IS the provenance line: the people and years behind every trick on the site,
verified (§4.3), plus the data sources for the ground. Effort: small. Role: background layer
(footer bar). Still: a static line.

### 4.2 Corridors (the transitions; each answers "where you came from")

**C1 · SWITCH** (the tube blanking) · lineage: every CRT television's power-off, formalized by
1980s title sequences. Leaving a bay: the room's layer collapses to a 2 px line (scaleY, 200 ms),
to a dot (scaleX, 150 ms), and the dot recedes to the vanishing point (600 ms). Entering: the
reverse. Compositor-only (transforms on the room's canvas wrapper). One bright frame at most, and
only in Full; never more than one flash per bay, nowhere near three a second. Effort: small.
Role: corridor (used on every transition). Still: a 200 ms crossfade.

**C2 · HYPERSPACE** (the JUMP module in corridor mode) · lineage: the Star Wars jump (1977), the
demoscene 1/z starfields (early 1990s), Windows 3.1's Starfield Simulation (1992). The L3 star
buffer with a depth decrement and the tube's persistence as motion blur. Fires only on two
transitions: the yard into JUMP (the overture) and RELIEF into TERMINATOR (leaving the ground for
the sky). DDL twist: the streaks are the same stars you were resting under, so the jump is
continuous with the sky. Effort: small (shares JUMP). Role: corridor.

**C3 · RINGS** (the dot/square tunnel) · lineage: the demoscene dot tunnel (about 1991).
Concentric squares of dots receding along z, twist growing with depth, the shared vanishing point.
Used for the corridors into the three machine bays (SCOPE, MARK, and the return from SCOPE), so the
corridor texture says where you are going: ground, sky, or machine. Effort: small. Role: corridor.
Still: one frame.

### 4.3 Bays (the rooms, in row order)

**01 · JUMP** (yard -> C2 -> JUMP) · lineage: as C2. The hold room for hyperspace: pointer or
touch shifts the vanishing point ±4%, press-and-hold (or Space) raises warp, release settles to
cruise. DDL twist: none needed beyond continuity; this is the overture, and its restraint is the
point. Effort: small. Role: hero bay. Still: mid-warp, short streaks.

**02 · GATE** (JUMP -> C1 -> GATE) · lineage: Douglas Trumbull's slit-scan for 2001: A Space
Odyssey (1968); the polar variant is the catalog's stargate. A 1-D strip of "artwork" sampled
while the camera dollies, so every pixel is a different moment. DDL twist: the strip is ONE column
resampled from one of Tim's own desert sunset photographs in `site/assets/desert/` (his phone
photos, so the rights are his), shipped as a 1x1024 PNG of about 4 KB; the whole photo never
ships; the corridor's colors are a real Sonoran sky and the nameplate says so. Scroll offset inside
the bay sets dolly speed; pointer shoves the corridor. Internal buffer 320x180, pixelated. Effort:
medium. Role: hero bay. Still: mid-corridor.

**03 · RANGE** (GATE -> C1 -> RANGE) · lineage: NovaLogic's Voxel Space ray-column renderer
(Comanche: Maximum Overkill, 1992). DDL twist: it is Voxel Catalinas, already built: a 768x768
grid of real elevation (SRTM and USGS 3DEP via the Mapzen Terrarium tiles, 64 m cells) over the
Tucson basin, the front range, Mount Lemmon and the highway, colored by the six life-zone bands
from 27 Miles; the autopilot tour (highway base, Windy Point, Lemmon, Kimball, Pusch, Sabino,
downtown) runs as the hold and any input takes the stick; the HUD shows the real elevation under
the camera and the 2x vertical exaggeration; `#range?t=22` deep-links. Folded in as a module with
the §6 contract (see Q2). The 427 KB DEM lazy-loads one bay ahead and is shared with 04 and 05.
Effort: built; refactor to the contract, medium. Role: hero bay (the hero of place). Still: t=22
past the summit, heading for Mount Kimball.

**04 · WASH** (RANGE -> C1 -> WASH) · lineage: vector-field particle advection (1990s scientific
visualization; the catalog's flow field). 1,500 to 3,000 particles advected by the DEM's downslope
gradient, computed once from the same PNG (central differences, normalized, plus a little curl
noise so the flat basin still moves), drawn as phosphor trails over a faint hillshade. In a few
seconds Sabino, Bear, Ventana and Pima canyons draw themselves, and the washes fan across the
basin. Pointer is a rain cloud: particles spawn under it. DDL twist: the place, again, and an
honest one; the nameplate reads "where water would run downhill, not where it does" (a slope
model, not hydrology). Effort: medium. Role: hero bay. Still: the twenty-second accumulation,
precomputed on mount.

**05 · RELIEF** (WASH -> C1 -> RELIEF) · lineage: the Rutt/Etra scan processor (Steve Rutt and
Bill Etra, 1973), which bent each video scanline in z by its brightness; the pop cousin is the
CP 1919 pulsar plot (Harold Craft, 1970) that became the cover of Unknown Pleasures (1979). About
96 scanlines by 192 samples of the DEM, each line displaced by elevation, drawn as wire with the
far lines dimmer; slow auto-orbit until dragged; returns to the three-quarter view. DDL twist: the
range you just flew and watered, held in the hand as an object; the crest of the ground trilogy.
Effort: medium (data already resident). Role: hero bay. Still: the three-quarter view.

**06 · TERMINATOR** (RELIEF -> C2 -> TERMINATOR) · lineage: Elite's dotted planets (David Braben
and Ian Bell, 1984), the IRIX-era wireframe globe (early 1990s). A back-culled dotted sphere with
faint meridians; a coarse land mask (about 180x90 bits, 2 KB, or a 20 KB coastline polyline set)
so continents read as denser dots; a Lambert terminator from the sub-solar point computed from the
real date (declination plus the equation of time; a degree of error is fine and the note says so);
Tucson's dot in amber; drag to spin, and it returns to face Tucson. DDL twist: time continuity you
can check against a window. Effort: medium. Role: hero bay (the quiet one). Still: the globe at
load time. Name note: "terminator" is the astronomical term; if the film reading bothers chaz,
"DAY LINE" is the fallback, and the technique lineage does not change.

**07 · SCOPE** (TERMINATOR -> C3 -> SCOPE) · lineage: the oscilloscope's XY mode, Lissajous
figures (Jules Antoine Lissajous, 1857), and oscilloscope music (the 2010s practice of composing
sound whose stereo channels draw pictures). Idle: a slow Lissajous with long persistence; pointer
detunes the frequency ratio. Press-and-hold (pointer or Space) starts a two-oscillator WebAudio
tone (X from one channel, Y from the other, at the ratio you set) through ACI's audio-unlock
choreography (§2.6), and the trace switches to drawing the ACTUAL samples from two AnalyserNodes.
Release stops the sound; nothing sustains without a hold; volume low with a soft envelope. DDL
twist: what you hear is exactly what you see, and the site's only voice is one the visitor is
holding down. Effort: medium. Role: hero bay. Still: a 3:2 figure.

**08 · MARK** (SCOPE -> C3 -> MARK) · lineage: Amiga glenz vectors (about 1989 to 1990): a solid
drawn with see-through faces so the back sides pile up as light; painter-sorted, additive. The DDL
chip mark (rounded square plus the saguaro circuit) as a low-poly solid, spinning slowly; drag to
spin. Below it, the sign-off: the shelf link and the way home to desertdatalabs.com. DDL twist:
the keepsake is the same glyph that stood as every pylon on the way in (the ring the site closes),
and its pull link is the whole repo. Effort: small to medium. Role: hero bay (the close). Still:
a 30 degree pose.

### 4.4 Verified facts the copy may assert (for chaz and Grinch)

- Slit-scan: Douglas Trumbull, 2001: A Space Odyssey, 1968.
- Voxel Space: NovaLogic, Comanche: Maximum Overkill, 1992.
- Elite: David Braben and Ian Bell, 1984 (BBC Micro).
- Tron: 1982 (Disney). Battlezone: Atari, 1980. Tempest: Atari, 1981. Asteroids: Atari, 1979.
  Vectrex: 1982. Star Raiders: Atari, 1979. Galaga: Namco, 1981.
- Rutt/Etra scan processor: Steve Rutt and Bill Etra, 1973. CP 1919 plot: Harold Craft, 1970;
  Unknown Pleasures cover: 1979 (Peter Saville, from Craft's plot).
- Space Harrier: Sega, 1985. Mode 7: Super Nintendo, 1990.
- Lissajous figures: Jules Antoine Lissajous, 1857.
- Windows 3.1 Starfield Simulation screensaver: 1992.
- Davis-Monthan's 309th AMARG: about 2,600 acres; the March 2025 line-by-line inventory listed
  3,247 aircraft (higher counts circulate); roughly 100 aircraft regenerated a year; sited for the
  dry climate and hard alkaline soil. Say "thousands of aircraft," not a precise number.
- Elevation: AWS Terrain Tiles (Mapzen Terrarium), compiled from SRTM, USGS 3DEP/NED and others;
  their requested attribution line is already in the Voxel Catalinas README.
- Life zones: the six-band Catalina Highway framing per the 27 Miles grounding bible; interpretive,
  boundaries shift with aspect and have moved upslope.
Anything not on this list gets sourced before it is written, or it is not written.

---

## 5. The wow shortlist and the cut list

### 5.1 Wow (the moments a visitor hands the phone to a friend for)

1. **RANGE** [large, built; integration medium]. Flying the actual Catalinas in 1992 pixels, with
   the highway and the summit where they really are. Feasible: it already runs at 60 fps on a
   phone in the standalone; the module refactor is contract work, not rendering work. CWV: the
   DEM is lazy, never on the first-paint path.
2. **WASH** [medium]. Rain finding the real washes. Feasible: the gradient field is one pass over
   a 768x768 array on mount (well under 100 ms), the particle loop is a 2D canvas trail at 3,000
   points (about 2 ms). Shares the DEM already resident from RANGE.
3. **GATE** [medium]. A real sunset stretched into 2001's corridor. Feasible: a 320x180 ImageData
   loop is about 2 ms; the strip is 4 KB. The only photo data on the site, and it is honest.
4. **SCOPE** [medium]. What you hear is what you see, and only while you hold it. Feasible: two
   OscillatorNodes, two AnalyserNodes, a 2D trace; the unlock choreography is proven in ACI.
   The one room with sound, so the one place the site can surprise a visitor who thought it was
   silent.

TERMINATOR is not on this list because it is not a phone-handing moment; it is the quiet carrier
of "what time it is," and the site would be dishonest about its own clock without it.

### 5.2 Do NOT build (each with the reason, so nobody relitigates)

1. **Vaporwave, VHS, tracking rolls, channel static, raster scanlines.** ACI owns that register
   on DDL's own shelf, and vector tubes never had scanlines: the black-and-cyan future is drawn,
   not rastered. Historical honesty and sibling distinctness in one cut.
2. **A synthwave or ambient score, any autoplay audio, any "sound on" splash.** House rule, ACI's
   radio already exists, and the Orrery already has the generative score. The only sound here is
   SCOPE's held tone and an opt-in 20 ms switch tick.
3. **Fake terminal typing, a fake POST/boot sequence, fake "TELEMETRY: 2,441 NODES ONLINE" HUD
   numbers, fake coordinates.** Fake data and cringe. The HUD's only numbers are the real clock,
   the bay index, RANGE's real elevation, and (under `?dev=1` only) the measured frame time.
4. **Light-cycle races, glyph rain, an 8-bit invaders cabinet.** The Orrery's Velocity, Grid and
   Arcadia. Building them again would make this site the Orrery's B-side.
5. **Tron props (recognizers, discs, the MCP face), the Star Wars opening crawl, a 2001
   monolith.** IP iconography, not technique; and the crawl is the most-parodied thing on the web.
   We borrow the grid idiom, the slit-scan method, the hyperspace projection. We do not borrow
   the props.
6. **Plasma, palette fire, copper bars, rotozoomers, twisters as rooms.** Raster-era screensavers
   with no vanishing point, so no pull. Plasma's history is contested (HN flagged the catalog's
   telling), so we could not write an honest lineage line. A heat mirage on the grid horizon was
   tempting for the desert joke and is cut for a structural reason: it fuzzes the vanishing point
   the entire site is built on.
7. **Fluid tank, Verlet cloth, chrome metaballs, the Whitted raytracer.** Physics and render toys
   with no pull; raymarching cooks a throttled phone; 1995 chrome reads as a render reel, not a
   vector tube.
8. **Boing ball, Utah teapot, ASCII donut, I Robot, PS1 affine warp, Penrose, hopalong, Burgers,
   the spaghetti vortex, dual tank, spiral stretch.** Museum objects and plots (three of them are
   someone else's 2026 editorial). A copy of the Boing ball is a museum ticket; static pretty
   things do not make the list.
9. **The Wolfenstein raycaster.** A walk, not a pull, and it needs a building to be walked
   through. Parked as a v2 candidate ("the hangar") only if Tim asks; not in this build.
10. **A hub-and-spoke nav or world picker.** The Orrery's shape. This site is a row; you fly down
    it, and the index strip is a list of links.
11. **A preloader or boot gate, `scroll-snap-type: mandatory`, wheel hijack, smooth-scroll
    libraries, any transform on body or html.** Gates 1 and 3; §2.4. The LCP is a headline, not
    a spinner, and the back button always works.
12. **A second feeling.** No "cozy nostalgia," no "menace," no "dread" (the Orrery has dread).
    Pull only. Wit lives in the twists, not in a tone.
13. **Per-room palettes, fonts or chrome.** One tube, one type system, one HUD. RANGE keeps its
    six life-zone colors because there they are data, and nowhere else.
14. **Twinkling stars, floating dust motes, idle camera sway, nameplate letter-by-letter
    reveals.** Churn: none answers origin, place or time.
15. **Leaderboards, "share your run," any backend or telemetry, comments.** Static site; no data
    leaves the page in either direction. (Analytics parity with the flagship is Tim's call, not a
    build item.)

---

## 6. The library contract

**In one paragraph.** Every effect is one JavaScript file in `src/` with a provenance header
(name; lineage with people and years; what is original here; license MIT, Desert Data Labs;
dependencies: none; the measured ms/frame at internal resolution on a named phone), a single
`const PARAMS = {...}` block at the top that holds every tunable (no magic numbers below it), and
one exported factory with a fixed shape: `mount(canvas, params, ctx)` returns a handle with
`tick(dt, t, progress, pointer)`, `resize(w, h, dpr)`, `still(t)` (draws the designed reduced-motion
frame), and `destroy()` (releases every buffer, listener and audio node). Modules draw no text,
touch no DOM outside the canvas they were handed, and register themselves by pushing onto a `BAYS`
manifest. The build reads that manifest and emits, besides the ride, one standalone
`parts/<slug>.html` per module: the module inlined with a tiny harness (a full-bleed canvas, the
PARAMS as a tweak row, a "how it works" note in real DOM, the provenance block, the budget line,
a "ride it" link back to `/#<slug>`), plus `parts/index.html`, the shelf: a table of bay, technique,
era, file size, measured cost and a still. On the ride, all of this is invisible except a 16 px
amber "pull" glyph (a real `<a>`, labelled) in each nameplate's corner and the shelf link in the
sign-off; `?dev=1` overlays the tweak row on the ride for tuning and is never the default. The
ride never shows code, params or notes; the shelf never shows the row. That is how the two jobs
share one repo without the library ever being heard from during the ride.

**File layout (the manifest in build.js, in this order).**
```
src/
  00-tokens.css            palette, type, @property registrations
  01-tube.css              HUD, nameplates, index strip, dial, the CSS grid horizon, no-JS layout
  02-body.html             every bay in the DOM from byte one: h2, lineage line, note, pull link
  10-core.js               ticker (self-removing tasks, stops when empty), world-pause, DPR cap,
                           adaptive scale, scroll -> camera, hash sync, dial, audio-unlock, fxLock
  20-tube.js               L1 post-pass (WebGL1; no-op when absent)
  21-row.js  22-sky.js  23-greetings.js
  30-switch.js  31-hyperspace.js  32-rings.js
  40-jump.js  41-gate.js  42-range.js  43-wash.js  44-relief.js  45-terminator.js
  46-scope.js  47-mark.js
  90-parts-harness.html    the standalone wrapper the build folds each module into
assets/
  catalinas-dem.png        427 KB, Terrarium-encoded, copied from ddl-voxel-catalinas (not a submodule)
  catalinas-meta.json      bounds, cell size, landmark check
  sunset-strip.png         1x1024, about 4 KB, from one of Tim's photos
  land-mask.bin            about 2 KB (or coast.json, about 20 KB)
  fonts/                   two base64 latin subsets
build.js                   the Orrery build + the parts emitter; fails on any surviving placeholder
parts/                     GENERATED, committed (GitHub Pages serves it): <slug>.html, index.html
index.html                 GENERATED, committed
```

**Provenance header shape (every module, verbatim fields).**
```
/* BONEYARD PART · 04 · WASH
 * technique   vector-field particle advection over a heightmap gradient
 * lineage     flow-field particle systems, 1990s scientific visualization
 * original    the field is the downslope gradient of real Catalina elevation (SRTM/3DEP via
 *             Mapzen Terrarium, 64 m cells); rain-cloud pointer; phosphor trail render
 * not         a hydrology model: slope only, no infiltration, no channels
 * deps        none · Canvas 2D · 2026-10
 * budget      2.1 ms/frame @ 480x270 internal, Pixel 4a, Chrome 140 (measured 2026-10-xx)
 * api         mount(canvas, params, ctx) -> { tick, resize, still, destroy }
 * license     MIT, Desert Data Labs LLC · data: public domain, see attribution in the note
 */
```

**The lift test (smaug runs it).** Copy `parts/wash.html` to an empty folder, open it over http,
and it runs with no network requests except its own assets, honors reduced motion with the designed
still, and its PARAMS row changes what you see. If any part fails the lift test, the site is not
done, because the second job is not done.

---

## 7. Open questions for Tim (only the ones that change the build)

1. **The frame and the name.** BONEYARD, with the diegetic vocabulary in §2 (row, bay, part, pull,
   tube, shelf)? Or RETRACE / VANISHING POINT? This changes the copy, the HUD words and the repo
   name. It does not change a single room, so the builders can start on the modules either way.
2. **Fold Voxel Catalinas in.** My call: refactor `D:\Git\ddl-voxel-catalinas\index.html` into
   `42-range.js` under the §6 contract, copy the DEM and meta into `assets/`, and let the
   standalone repo become a generated part (`parts/range.html`) so there is one source of truth.
   The alternative is to leave it standalone and iframe it, which breaks the shared vanishing
   point, the tube, the dial and the lift test. This changes the build plan and the asset plan.
3. **The sound ceiling.** My call: SCOPE's held tone and an opt-in switch tick, nothing else, so
   `10-core.js` carries only the unlock choreography and there is no `07-audio.js` at all. If Tim
   wants an opt-in score like the Orrery's, that is a module and a week, and it competes with the
   one voice the site has.

---

## Handoff assets for the flagship (so the link exists the day it ships)

An entry in `flagship/src/data/experiences.ts` needs: `id: 'boneyard'`, `name`, `line` (chaz
writes it; it must carry "still runs"), `craft` (suggested: `'Vector CRT · real Catalina elevation
· 14 parts you can pull'`), `href`, `preview` (a REAL 1600x900 headless screenshot of the yard at
rest, per that file's own rule), `alt`. The Work page gets the same card. Nothing on the flagship
should call it "immersive" or "an experience"; the grid's own header already does that work.

---

## What I would tell the builders in one breath

Build the floor first (the CSS horizon, the no-JS index, the nameplates), then the row and the
sky, then SWITCH, then JUMP. If those five things feel like one place at a low hover with one
vanishing point, the other seven bays are variations and the site is already good. If they do not,
no bay will save it. Design each still before its motion. Measure every module on a phone and
write the number in its header. The shelf is not a footnote; the lift test is a ship gate.

The Mirror shows a row of old tubes glowing in dry air, and a hand reaching in to pull a part.
That one should come to pass.

Galadriel
