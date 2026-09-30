/* BONEYARD PART · L4 · GREETINGS
 * technique   real-DOM sine scroller: a duplicated track slid by one CSS transform animation, revealed as a CRT line opening, with masked edge depth and a travelling sine written only to glyphs on screen
 * lineage     the C64 and Amiga cracktro sine scroller, about 1985 to 1992
 * original    the demoscene "greetings to" list IS the provenance line: the people and years behind the tricks on the
 *             row plus the data sources for the ground (vision brief 4.4, verified). aria-label on the parent carries
 *             the plain sentence; the glyph spans are aria-hidden; the track pauses on hover and focus-within; the
 *             dial's Still shows the static line instead of the track. Glyphs rise, resolve and depart through the
 *             same edge envelope, so the provenance enters and leaves as typography instead of being clipped. Never <marquee>.
 * not         a news ticker, a fake terminal, a place for links. It names people and years and nothing else.
 * deps        none · DOM + one CSS transform animation · 2026-09
 * budget      the first version ran one CSS animation per glyph (587 at once) and cost about 22 ms of style work per
 *             frame at 4x CPU, the single largest cost on the ride; this version writes about 40 (phone) to 170
 *             (desktop) transforms per frame and the ride went from 16 to 26 fps to 50 to 60 fps at 4x CPU (2026-09-30)
 * api         mount(element, params, ctx) -> { start(), setDial(v), tick(dt, t), resize, still, destroy }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * On mount the module reads the sentence already in the element (the static line that ships in the HTML and is what
 * a visitor without JavaScript reads), splits it into one span per glyph, and builds a track holding two copies of
 * that span run. One CSS animation slides the track by exactly one copy width per cycle, so the loop joins without a
 * jump. Every frame the ride calls tick(): the module reads how far that animation has run, works out where each
 * glyph is on screen, and lifts only the visible glyphs on a sine wave that travels along the line. A gradient mask
 * and a matching per-glyph scale/opacity envelope resolve each character inside the frame and let it recede at the
 * other edge. The first run opens from a bright horizontal sliver, borrowing SWITCH's physical CRT grammar. Off-screen glyphs
 * are never touched, so the cost follows the screen width, not the length of the sentence.
 *
 * When the ride rests (the Still dial, the sign-off, a hidden tab) tick() is not called and the wave holds its last
 * shape. Hover or focus pauses the slide. Still hides the track and shows the static sentence.
 */
(() => {
  'use strict';
  const PARAMS = {
    pxPerSecond: 58,       /* track speed */
    amplitude: 5,          /* px of lift at the crest */
    wavelength: 180,       /* px per sine along the line */
    speed: 1.7,            /* radians per second the wave travels */
    edge: 92,              /* px over which glyphs arrive and depart */
    edgeDrop: 5,           /* px of spatial drop at the two edges */
    entranceMs: 680,       /* first line-to-strip reveal */
    text: 'Greetings to · Douglas Trumbull 1968 · NovaLogic 1992 · David Braben and Ian Bell 1984 · Steve Rutt and Bill Etra 1973 · Harold Craft 1970 · Jules Antoine Lissajous 1857 · Atari 1979 to 1981 · Vectrex 1982 · Sega 1985 · the Amiga scene 1988 to 1994 · ground: AWS Terrain Tiles, SRTM, USGS 3DEP',
  };
  /* the standalone skin, injected only when the host is not the ride's #greetings (the parts page) */
  const CSS = `
[data-greet-host]{position:relative;overflow:hidden;contain:paint;white-space:nowrap;height:30px;line-height:30px;font:500 12px/30px var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-dim);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
[data-greet-host] .greet__track{display:inline-flex;margin-left:100%;will-change:transform;animation:greet-slide var(--greet-cycle,48s) linear infinite}
[data-greet-host] .greet__copy{display:inline-block;padding-right:6ch}
[data-greet-host] .greet__copy span{display:inline-block;min-width:.3ch}
[data-greet-host]:hover .greet__track{animation-play-state:paused}
[data-greet-host][data-still] .greet__track{display:none}
[data-greet-host]:not([data-still]) .greet__static{display:none}
@keyframes greet-slide{to{transform:translate3d(-50%,0,0)}}
@media (prefers-reduced-motion: reduce){[data-greet-host] .greet__track{animation:none}}`;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (v) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
  const finite = (v, fallback) => Number.isFinite(+v) ? +v : fallback;

  function mount(el, params, ctx) {
    const standalone = el.id !== 'greetings';
    let staticEl = el.querySelector('.greet__static');
    if (!staticEl) { staticEl = document.createElement('div'); staticEl.className = 'greet__static'; staticEl.textContent = el.getAttribute('aria-label') || params.text; el.appendChild(staticEl); }
    const text = staticEl.textContent.trim() || params.text;
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
    let styleEl = null;
    if (standalone) { el.dataset.greetHost = '1'; styleEl = document.createElement('style'); styleEl.textContent = CSS; el.prepend(styleEl); }
    const track = document.createElement('div'); track.className = 'greet__track'; track.setAttribute('aria-hidden', 'true');
    const spans = [];
    for (let c = 0; c < 2; c++) {
      const copy = document.createElement('span'); copy.className = 'greet__copy';
      for (const ch of text) { const s = document.createElement('span'); s.textContent = ch === ' ' ? ' ' : ch; copy.appendChild(s); spans.push(s); }
      track.appendChild(copy);
    }
    let started = false, dial = ctx.dial, lefts = null, copyW = 1, hostW = 1, lead = 0, slide = null, intro = null;
    const lifted = new Set();            /* glyphs currently carrying a transform */
    function apply() {
      const still = dial === 'still';
      if (still) { if (intro) { try { intro.cancel(); } catch (_) {} intro = null; } el.dataset.still = '1'; staticEl.hidden = false; if (track.parentNode) track.remove(); }
      else { delete el.dataset.still; if (started) { staticEl.hidden = true; if (!track.parentNode) { el.appendChild(track); reveal(); } measure(); } }
      if (dial !== 'full') flatten();
    }
    function measure() {
      const copy = track.firstElementChild; if (!copy) return;
      copyW = copy.getBoundingClientRect().width || 1200;
      hostW = el.getBoundingClientRect().width || innerWidth;
      const rate = clamp(finite(params.pxPerSecond, 58), 8, 400);
      el.style.setProperty('--greet-cycle', (copyW / rate).toFixed(1) + 's');
      const edge = Math.min(hostW * 0.24, Math.max(20, finite(params.edge, 92)));
      const mask = `linear-gradient(90deg,transparent 0,#000 ${edge.toFixed(1)}px,#000 calc(100% - ${edge.toFixed(1)}px),transparent 100%)`;
      track.style.maskImage = mask; track.style.webkitMaskImage = mask;
      /* glyph x inside the track, measured once per resize (layout reads never happen in tick) */
      const tRect = track.getBoundingClientRect();
      lead = tRect.left - el.getBoundingClientRect().left - currentShift();
      lefts = spans.map((s) => s.getBoundingClientRect().left - tRect.left + s.offsetWidth / 2);
      slide = null;
    }
    function reveal() {
      if (intro) { try { intro.cancel(); } catch (_) {} intro = null; }
      if (dial !== 'full' || !track.animate) return;
      const duration = clamp(finite(params.entranceMs, 680), 120, 2200);
      intro = track.animate([
        { clipPath: 'inset(47% 50%)', opacity: 0.2 },
        { clipPath: 'inset(43% 0%)', opacity: 0.88, offset: 0.34 },
        { clipPath: 'inset(0% 0%)', opacity: 1 },
      ], { duration, easing: 'cubic-bezier(.2,.75,.2,1)' });
      intro.onfinish = () => { const a = intro; intro = null; try { a.cancel(); } catch (_) {} };
      intro.oncancel = () => { intro = null; };
    }
    function currentShift() {
      if (!slide) slide = track.getAnimations ? track.getAnimations().find((a) => a.animationName === 'greet-slide') || null : null;
      if (!slide || slide.currentTime == null) return 0;
      const dur = slide.effect.getComputedTiming().duration || 1;
      return -((slide.currentTime % dur) / dur) * copyW;   /* the track moves one copy width per cycle */
    }
    function flatten() { for (const s of lifted) { s.style.transform = ''; s.style.opacity = ''; } lifted.clear(); }
    return {
      start() { started = true; apply(); },
      setDial(v) { dial = v; apply(); },
      tick(dt, t) {
        if (!started || dial === 'still' || !lefts) return;
        const edge = Math.min(hostW * 0.24, clamp(finite(params.edge, 92), 20, 480));
        const shift = currentShift(), k = (Math.PI * 2) / clamp(finite(params.wavelength, 180), 24, 2000);
        const wave = clamp(finite(params.speed, 1.7), -20, 20) * finite(t, 0), A = dial === 'full' ? clamp(finite(params.amplitude, 5), 0, 80) : 0;
        const drop = clamp(finite(params.edgeDrop, 5), -30, 30);
        const seen = new Set();
        for (let i = 0; i < spans.length; i++) {
          const x = lead + lefts[i] + shift;
          if (x < -edge || x > hostW + edge) continue;
          const s = spans[i]; seen.add(s);
          const gate = smooth(x / edge) * smooth((hostW - x) / edge);
          const y = A * Math.sin(k * x - wave) * gate + (1 - gate) * drop;
          s.style.transform = `translate3d(0,${y.toFixed(1)}px,0) scaleY(${(0.76 + gate * 0.24).toFixed(3)})`;
          s.style.opacity = (0.12 + gate * 0.88).toFixed(3);
        }
        for (const s of lifted) if (!seen.has(s)) { s.style.transform = ''; s.style.opacity = ''; }
        lifted.clear(); for (const s of seen) lifted.add(s);
      },
      resize() { if (started && dial !== 'still') measure(); },
      still() { dial = 'still'; apply(); },
      destroy() { if (intro) { try { intro.cancel(); } catch (_) {} intro = null; } flatten(); track.remove(); if (styleEl) styleEl.remove(); staticEl.hidden = false; delete el.dataset.still; if (standalone) delete el.dataset.greetHost; },
      params(p) { params = p || PARAMS; if (track.parentNode) measure(); },
    };
  }
  BAYS.push({ slug: 'greetings', title: 'Greetings', order: 3, role: 'layer', kind: 'dom', params: PARAMS, mount });
})();
