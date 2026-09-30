/* BONEYARD PART · L4 · GREETINGS
 * technique   real-DOM sine scroller: a duplicated track moved by transform, each glyph a span on a negative-delay
 *             phased translateY (playbook 2.7), so the wave runs from t=0 with no per-frame JavaScript
 * lineage     the C64 and Amiga cracktro sine scroller, about 1985 to 1992
 * original    the demoscene "greetings to" list IS the provenance line: the people and years behind every trick on the
 *             row plus the data sources for the ground (vision brief 4.4, verified). aria-label on the parent carries
 *             the plain sentence; the glyph spans are aria-hidden; the track pauses on hover and focus-within; the
 *             dial's Still shows the static line instead of the track. Never <marquee>.
 * not         a news ticker, a fake terminal, a place for links. It names people and years and nothing else.
 * deps        none · DOM + CSS animations (compositor) · 2026-09
 * budget      0.0 ms/frame of JavaScript after start (CSS transform animations only); compositor cost measured in docs/BUILD-LOG.md, desktop Chromium, 2026-09-29; phone TBD
 * api         mount(element, params, ctx) -> { start(), setDial(v), tick, resize, still, destroy }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * On mount the module reads the sentence already in the element (the static line that ships in the HTML and is what
 * a visitor without JavaScript reads), splits it into one span per glyph, and builds a track holding two copies of
 * that span run. The track slides by exactly one copy width per cycle (translateX to -50% of a two-copy track), so the
 * loop is seamless; the cycle length is the copy width divided by pxPerSecond, measured once on start.
 *
 * Each glyph carries --d, a negative animation-delay of -(i mod phases) * period / phases, so one keyframe pair
 * produces a standing wave across the line. All of it is CSS transform: no JavaScript runs per frame. Hover or focus
 * pauses both animations with animation-play-state. Still hides the track and shows the static sentence.
 */
(() => {
  'use strict';
  const PARAMS = {
    pxPerSecond: 58,       /* track speed */
    phases: 12,            /* glyphs per wave */
    period: 3.6,           /* seconds for one full sine (matches the 1.8 s alternate keyframe in 01-tube.css) */
    text: 'Greetings to · Douglas Trumbull 1968 · NovaLogic 1992 · David Braben and Ian Bell 1984 · Steve Rutt and Bill Etra 1973 · Harold Craft 1970 · Jules Antoine Lissajous 1857 · Atari 1979 to 1981 · Vectrex 1982 · Sega 1985 · the Amiga scene 1988 to 1994 · ground: AWS Terrain Tiles, SRTM, USGS 3DEP',
  };
  /* the standalone skin, injected only when the host is not the ride's #greetings (the parts page) */
  const CSS = `
[data-greet-host]{position:relative;overflow:hidden;contain:paint;white-space:nowrap;height:30px;line-height:30px;font:500 12px/30px var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-dim);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
[data-greet-host] .greet__track{display:inline-flex;margin-left:100%;will-change:transform;animation:greet-slide var(--greet-cycle,48s) linear infinite}
[data-greet-host] .greet__copy{display:inline-block;padding-right:6ch}
[data-greet-host] .greet__copy span{display:inline-block;min-width:.3ch;animation:greet-sine 1.8s ease-in-out infinite alternate;animation-delay:var(--d,0s)}
[data-greet-host]:hover .greet__track,[data-greet-host]:hover .greet__copy span{animation-play-state:paused}
[data-greet-host][data-still] .greet__track{display:none}
[data-greet-host]:not([data-still]) .greet__static{display:none}
@keyframes greet-slide{to{transform:translate3d(-50%,0,0)}}
@keyframes greet-sine{from{transform:translate3d(0,-5px,0)}to{transform:translate3d(0,5px,0)}}
@media (prefers-reduced-motion: reduce){[data-greet-host] .greet__track,[data-greet-host] .greet__copy span{animation:none}}`;

  function mount(el, params, ctx) {
    const standalone = el.id !== 'greetings';
    let staticEl = el.querySelector('.greet__static');
    if (!staticEl) { staticEl = document.createElement('div'); staticEl.className = 'greet__static'; staticEl.textContent = el.getAttribute('aria-label') || params.text; el.appendChild(staticEl); }
    const text = staticEl.textContent.trim() || params.text;
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
    if (standalone) { el.dataset.greetHost = '1'; const st = document.createElement('style'); st.textContent = CSS; el.prepend(st); }
    const track = document.createElement('div'); track.className = 'greet__track'; track.setAttribute('aria-hidden', 'true');
    const step = params.period / params.phases;
    for (let c = 0; c < 2; c++) {
      const copy = document.createElement('span'); copy.className = 'greet__copy';
      const glyphs = [...text];
      for (let i = 0; i < glyphs.length; i++) {
        const s = document.createElement('span');
        s.textContent = glyphs[i] === ' ' ? ' ' : glyphs[i];
        s.style.setProperty('--d', `-${((i % params.phases) * step).toFixed(2)}s`);
        copy.appendChild(s);
      }
      track.appendChild(copy);
    }
    let started = false, dial = ctx.dial;
    function apply() {
      const still = dial === 'still';
      if (still) { el.dataset.still = '1'; staticEl.hidden = false; if (track.parentNode) track.remove(); }
      else { delete el.dataset.still; if (started) { staticEl.hidden = true; if (!track.parentNode) el.appendChild(track); measure(); } }
    }
    function measure() {
      const copy = track.firstElementChild; if (!copy) return;
      const cw = copy.getBoundingClientRect().width || 1200;
      el.style.setProperty('--greet-cycle', (cw / params.pxPerSecond).toFixed(1) + 's');
    }
    return {
      start() { started = true; apply(); },
      setDial(v) { dial = v; apply(); },
      tick() {}, resize() { if (started && dial !== 'still') measure(); }, still() { dial = 'still'; apply(); },
      destroy() { track.remove(); staticEl.hidden = false; delete el.dataset.still; },
      params(p) { params = p; },
    };
  }
  BAYS.push({ slug: 'greetings', title: 'Greetings', order: 3, role: 'layer', kind: 'dom', params: PARAMS, mount });
})();
