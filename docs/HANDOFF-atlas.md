# HANDOFF: atlas (bays 03 RANGE, 04 WASH), 2026-09-29

Requests for files that are not mine. Nothing here is edited; each item names the owner file and the change.

## 1. `#range?t=22` deep link (src/10-core.js)

`42-range.js` reads `t` from `location.search` OR from a hash of the form `#range?t=22`, at mount. Two core
behaviours defeat the hash form:

- The browser only anchor-scrolls when the hash equals an element id, so `#range?t=22` loads at the yard.
- The HUD sync (`history.replaceState(... + hash)`, about line 250) rewrites the hash to `#<slug>` as bays
  change, so `?t=` is gone before RANGE mounts one viewport ahead.

Change: when resolving the initial hash, take `location.hash.split('?')[0]` for the slug and scroll to it;
keep the full hash until the first real bay change. `/?t=22#range` already works today (search, not hash).

## 2. Arrow keys under the Still dial (src/10-core.js, contract)

Brief 3.4 says RANGE's still is stepped by the arrow keys. Under Still the core calls only `still()`, and
ctx.keys is never read, so there is no way to step. Proposal: an optional `handle.key(k)` the core calls on
keydown for the current bay when the dial is Still (RANGE would turn 0.12 rad per press and redraw).

## 3. Brief 3.4 / 4.3 caption for the RANGE still (docs/vision-brief.md, copy)

The Labs page at `?t=22` is NOT over Windy Point facing the summit. Measured on the published page and in this
bay (same numbers): 32.3982 N, 110.8512 W, heading 228 SW, ALT 8,178 ft, GROUND 5,545 ft, Madrean Oak
Woodland, past Mount Lemmon and heading for Mount Kimball; the visible tags are Mount Kimball and Pusch Peak.
Around t = 15 the camera is over the high country (GROUND 7,444 ft, Ponderosa Pine Forest) with Mount Lemmon
tagged, which is closer to the caption. Decision for Tim or chaz: keep t = 22 (matches the Labs deep link;
`PARAMS.stillT`) and fix the caption, or move `stillT` to about 15 and keep the caption. Do not write
"over Windy Point" in the nameplate until that is settled.

## 4. Notes for the next builder

- Both bays render into their own low-res buffer (long side 384 for RANGE, 480 for WASH) and draw it
  pixelated onto the backing canvas; `pixel` is not set. A fixed-width `pixel: 384` made a phone render
  384 x 831 (twice the work of a desktop) and looked flat; the Labs page's long-side rule fixes both.
- Landmark tags in RANGE now use a true occlusion test (one column re-marched to the landmark's distance),
  not the Labs page's skyline test, which showed a tag only when the landmark WAS the skyline (almost never).
- WASH is top-down on purpose: no depth, so no vanishing point to honour.
