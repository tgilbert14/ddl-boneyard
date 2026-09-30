/* BONEYARD PART · L1 · THE TUBE
 * technique   WebGL1 phosphor post-pass over the composited 2D layers: decay-tinted persistence behind an untouched current frame, a two-scale bloom with a restrained horizontal lens flare, overdriven white-hot cores, a very slight barrel, a vignette, and a light chromatic fringe only at peak warp or a punch
 * lineage     the vector CRT: the oscilloscope; Asteroids (Atari, 1979); Battlezone (Atari, 1980); Tempest (Atari, 1981); Vectrex (1982)
 * original    one skin over the whole row that no room depends on: it takes the sky, the row and the corridor canvases as textures, and the rooms stay crisp DOM above it with a static CSS halo on their frames
 * not         scanlines (vector tubes drew lines, not rasters, so they had none), a curvature gimmick, a blocking dependency; it does not skin the rooms (see HOW IT WORKS)
 * deps        none · WebGL1 when present; a clean ride no-op and an authored Canvas 2D diagnostic on the standalone part otherwise · 2026-09
 * budget      0.24 ms/frame JS (3 uploads + 5 passes) @ 2160x1350 internal (1440x900 x1.5), desktop Chromium 149 on an AMD RX 5600M (D3D11), 2026-09-29;
 *             A/B over 5 s of scroll, frame work with the tube 4.7 to 5.5 ms vs 4.2 to 5.7 ms without (inside the noise);
 *             390x844 x1: 0.21 ms JS, +0.6 to 1.4 ms frame work. A readPixels-synced upper bound (?tubeprobe=1) reads 10 to 14 ms
 *             because it also waits on the layers' own 2D raster; on SwiftShader (software GL) the adaptive budget drops it within seconds; phone TBD
 * api         mount(canvas, params, ctx) -> { enabled, tick(dt, t, sources), resize(w, h, dpr), still(t), destroy(), bloom(on), params(p) }
 * license     MIT, Desert Data Labs LLC
 */
/* HOW IT WORKS
 * Each frame the ride hands the tube its three stacked 2D canvases (sky, row, corridor). They are uploaded as
 * textures and composited over the field gradient, then combined with the previous tube frame by keeping the
 * brighter of "now" and "last frame times a decay". The old frame drifts slightly toward the warmer core token first,
 * like a long-persistence phosphor changing colour as it fades. The current frame is never softened or recoloured:
 * anything that moves leaves a distinct optical tail, while anything still stays exactly as crisp and bright as drawn.
 * A 4x4 box downsample to quarter resolution (four bilinear taps) keeps one-pixel lines from falling between
 * samples; a horizontal then a vertical 9-tap blur makes the bloom, which is added back. Two low-energy horizontal
 * samples of that tight bloom make the small lens flare a real bright vector tube produces, without blurring the source.
 * The last pass samples
 * through a barrel of k = 0.04 centered on the vanishing point (so the one vanishing point never moves), scaled so
 * the farthest corner samples its own corner (no black rim), and darkens the corners.
 * The rooms are CSS-transformed canvases in the DOM, animated by the core and by SWITCH. Rebuilding their
 * transforms, opacities and flashes inside WebGL every frame would cost a texture upload per room plus a style
 * read per frame, well past 4 ms, so the rooms sit ABOVE the tube and carry their own static halo (a box-shadow on
 * the frame, rasterized once and then only transformed). Every room already looks right without the tube.
 * The adaptive budget drops it first: below internal scale 1 the bloom goes; at 0.5 the tube goes. It turns itself
 * off under the dial's Still (the layers underneath are the still). Without WebGL it reports enabled: false and the
 * ride keeps using its untouched source canvases. The standalone part instead draws an honest Canvas 2D vector
 * diagnostic: it is a designed fallback, not a claim that the phosphor post-pass or the visitor's GPU was tested.
 */
(() => {
  'use strict';
  const PARAMS = {
    persistence: 0.72,     /* last-frame weight at 60 fps (frame-rate corrected) */
    bloom: 1.3,            /* tight bloom add-back gain (quarter res): the arcade glow */
    wide: 0.85,            /* wide halo add-back gain (eighth res) */
    knee: 0.17,            /* bloom starts above this luma, per 2x2 tap */
    radius: 1.8,           /* blur step in quarter-res texels */
    hot: 0.55,             /* overdrive: how far the brightest strokes whiten toward a white-hot core */
    afterglow: 0.18,       /* old strokes drift this far toward the warmer phosphor-core token */
    flare: 0.12,           /* horizontal optical flare taken from the tight bloom, never from the crisp source */
    fringe: 0.006,         /* chromatic split at the far corner (uv) at full warp or punch; 0 at the vanishing point */
    barrel: 0.04,          /* barrel distortion k */
    vignette: 0.30,        /* corner darkening */
  };
  const finite = (v, fallback) => Number.isFinite(+v) ? +v : fallback;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  /* A: composite field + three premultiplied layers, then persistence against the last frame */
  const FS_COMP = 'precision mediump float;varying vec2 v;uniform sampler2D s0,s1,s2,sp;uniform vec3 top,bot,after;uniform float vpY,decay,afterMix,n;' +
    'void main(){vec3 c=mix(top,bot,clamp((1.-v.y)/vpY,0.,1.));' +
    'vec4 a=texture2D(s0,v);c=a.rgb+c*(1.-a.a);' +
    'if(n>1.){a=texture2D(s1,v);c=a.rgb+c*(1.-a.a);}' +
    'if(n>2.){a=texture2D(s2,v);c=a.rgb+c*(1.-a.a);}' +
    'vec3 p=texture2D(sp,v).rgb;float pl=max(p.r,max(p.g,p.b));p=mix(p,after*pl,afterMix);' +
    'c=max(c,p*decay);gl_FragColor=vec4(c,1.);}';
  /* B: 4x4 box to quarter res (four bilinear taps, each a 2x2 average, so a 1 px line still lands at half
     strength); the knee is applied PER TAP on luma, so thin strokes bloom and broad dim fills (the hour band) do not */
  const FS_DOWN = 'precision mediump float;varying vec2 v;uniform sampler2D s;uniform vec2 px;uniform float knee;' +
    'vec3 k(vec2 o){vec3 c=texture2D(s,v+px*o).rgb;float l=dot(c,vec3(.2126,.7152,.0722));return c*smoothstep(knee,knee+.25,l);}' +
    'void main(){vec3 c=k(vec2(-1.,-1.))+k(vec2(1.,-1.))+k(vec2(-1.,1.))+k(vec2(1.,1.));gl_FragColor=vec4(c*.25,1.);}';
  /* C/D: separable 9-tap gaussian */
  const FS_BLUR = 'precision mediump float;varying vec2 v;uniform sampler2D s;uniform vec2 d;' +
    'void main(){vec3 c=texture2D(s,v).rgb*.227027;' +
    'c+=(texture2D(s,v+d).rgb+texture2D(s,v-d).rgb)*.1945946;' +
    'c+=(texture2D(s,v+d*2.).rgb+texture2D(s,v-d*2.).rgb)*.1216216;' +
    'c+=(texture2D(s,v+d*3.).rgb+texture2D(s,v-d*3.).rgb)*.0540541;' +
    'c+=(texture2D(s,v+d*4.).rgb+texture2D(s,v-d*4.).rgb)*.0162162;gl_FragColor=vec4(c,1.);}';
  /* E: barrel CENTERED ON THE VANISHING POINT (so the one vanishing point never moves and the DOM rooms still
     converge on it), normalized so the farthest corner samples its own corner: no black rim, nothing sampled
     off the edge. Then the bloom add-back and a vignette about the screen center. */
  /* Hot cores: the brightest strokes are pushed toward their own max channel (a white-hot core inside a cyan
     stroke, the overdriven vector beam), then the tight and wide blooms are added. Fringe: R and B are sampled
     a hair apart ALONG the ray from the vanishing point, so the split is 0 at the vanishing point and grows
     outward; the uniform is 0 unless warp is near peak or a punch lands (Full only). */
  const FS_OUT = 'precision mediump float;varying vec2 v;uniform sampler2D s,b,w;uniform float k,gain,wgain,hot,flare,fr,vig,aspect;uniform vec2 vp,bpx;' +
    'void main(){vec2 d=v-vp;vec2 da=vec2(d.x*aspect,d.y);vec2 fc=vec2(max(vp.x,1.-vp.x)*aspect,max(vp.y,1.-vp.y));' +
    'float r2=dot(da,da)/dot(fc,fc);vec2 u=vp+d*(1.+k*r2)/(1.+k);' +
    'vec3 c=texture2D(s,u).rgb;if(fr>0.){vec2 o=d*fr;c.r=texture2D(s,u+o).r;c.b=texture2D(s,u-o).b;}' +
    'float l=dot(c,vec3(.2126,.7152,.0722));c=mix(c,vec3(max(c.r,max(c.g,c.b))),hot*smoothstep(.55,.95,l));' +
    'vec3 tight=texture2D(b,u).rgb;vec3 lens=(texture2D(b,u+vec2(bpx.x*3.,0.)).rgb+texture2D(b,u-vec2(bpx.x*3.,0.)).rgb)*.5;' +
    'c+=tight*gain+texture2D(w,u).rgb*wgain+lens*flare;' +
    'vec2 q=(v*2.-1.)*vec2(aspect,1.);float rv=dot(q,q)/(1.+aspect*aspect);' +
    'c*=1.-vig*pow(rv,1.6);gl_FragColor=vec4(c,1.);}';

  /* The yard's ignition is CSS (01-tube.css, keyed on html.tube-on, which the core adds at boot). This latch is
     its only JavaScript: once it has played (about 1.2 s) html.ignited retires it, so a later dial change never
     replays the flash; on a deep link (the ride did not start at the yard) it is retired at once. It runs before
     the WebGL check on purpose: the ignition does not need the tube. Ride only (the parts page has no #title). */
  function latchIgnition(canvas) {
    const html = document.documentElement;
    if (canvas.id !== 'c-tube' || !document.getElementById('title') || html.classList.contains('ignited')) return;
    const hash = location.hash.split('?')[0];
    const deep = (hash && hash !== '#' && hash !== '#yard') || window.scrollY > window.innerHeight * 0.3;
    if (deep) { html.classList.add('ignited'); return; }
    setTimeout(() => html.classList.add('ignited'), 1500);
  }

  /* A useful standalone card when failIfMajorPerformanceCaveat declines WebGL. This never runs on #c-tube: the
     ride must keep showing the real source layers rather than substitute demo art. It deliberately draws only
     geometry, because canvas text would turn a portable visual diagnostic into inaccessible interface copy. */
  function mountDiagnostic(canvas, params, ctx) {
    const g = canvas.getContext('2d');
    if (!g) return null;
    let W = Math.max(2, canvas.width), H = Math.max(2, canvas.height), lastT = 0, bloomOn = true;
    function pathLissajous(cx, cy, rx, ry, phase, from, to) {
      g.beginPath();
      const n = 360;
      for (let i = 0; i <= n; i++) {
        const a = from + (to - from) * i / n;
        const x = cx + rx * Math.sin(3 * a + phase), y = cy + ry * Math.sin(2 * a);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
    }
    function draw(t) {
      lastT = finite(t, 0);
      const T = ctx.tokens || {}, s = Math.max(2, Math.min(W, H));
      const vp = { x: clamp(ctx.vp && ctx.vp.x, 0.08, 0.92) * W, y: clamp(ctx.vp && ctx.vp.y, 0.12, 0.74) * H };
      const calm = ctx.dial === 'calm', still = ctx.dial === 'still';
      const phase = (still ? 0.36 : lastT * (calm ? 0.28 : 0.62));
      const top = T.field2 || '#081116', bottom = T.field || '#030708';
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.shadowBlur = 0; g.clearRect(0, 0, W, H);
      const field = g.createLinearGradient(0, 0, 0, H);
      field.addColorStop(0, top); field.addColorStop(0.62, bottom); field.addColorStop(1, top);
      g.fillStyle = field; g.fillRect(0, 0, W, H);

      /* Perspective fan and range arcs register the same shared vanishing point used by the world. */
      g.save(); g.strokeStyle = T.phosphorDim || '#286c73'; g.globalAlpha = 0.3;
      g.lineWidth = Math.max(0.7, s / 900); g.beginPath();
      for (let i = -8; i <= 8; i++) { g.moveTo(vp.x, vp.y); g.lineTo(vp.x + i * W * 0.12, H * 0.94); }
      for (let i = 1; i <= 9; i++) {
        const q = i / 9, y = vp.y + (H * 0.94 - vp.y) * q * q;
        g.moveTo(W * (0.08 - q * 0.18), y); g.lineTo(W * (0.92 + q * 0.18), y);
      }
      g.stroke(); g.restore();

      const cx = W * 0.5, cy = Math.max(H * 0.26, Math.min(H * 0.5, vp.y - s * 0.02));
      const tubeRx = Math.min(W * 0.43, s * 0.62), tubeRy = Math.min(H * 0.34, s * 0.37);
      /* Curved tube face, focus rings and axes form a legible calibration field at any aspect ratio. */
      g.save(); g.translate(cx, cy); g.strokeStyle = T.line || T.phosphorDim || '#286c73';
      g.lineWidth = Math.max(0.8, s / 780); g.globalAlpha = 0.5;
      for (const k of [1, 0.72, 0.43]) { g.beginPath(); g.ellipse(0, 0, tubeRx * k, tubeRy * k, 0, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 0.32; g.beginPath(); g.moveTo(-tubeRx, 0); g.lineTo(tubeRx, 0); g.moveTo(0, -tubeRy); g.lineTo(0, tubeRy); g.stroke();
      const mark = s * 0.018;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, x = Math.cos(a) * tubeRx * 0.88, y = Math.sin(a) * tubeRy * 0.88;
        g.beginPath(); g.moveTo(x - Math.cos(a) * mark, y - Math.sin(a) * mark); g.lineTo(x + Math.cos(a) * mark, y + Math.sin(a) * mark); g.stroke();
      }
      g.restore();

      const rx = Math.min(W * 0.27, s * 0.39), ry = Math.min(H * 0.19, s * 0.25);
      /* Three phase-separated traces make decay direction visible while the final trace stays pin-sharp. */
      const trails = calm ? 2 : clamp(Math.round(2 + clamp(params.persistence, 0, 0.98) * 3), 2, 5);
      const trailEnergy = 0.7 + clamp(params.afterglow, 0, 0.6) * 0.8;
      for (let i = trails; i >= 1; i--) {
        g.save(); g.globalAlpha = (0.045 + (trails - i) * 0.03) * trailEnergy;
        g.strokeStyle = T.phosphor || '#6ee7ed'; g.lineWidth = Math.max(1, s / 420);
        pathLissajous(cx, cy, rx, ry, phase - i * 0.045, 0, Math.PI * 2); g.stroke(); g.restore();
      }
      g.save(); g.strokeStyle = T.phosphor || '#6ee7ed'; g.globalAlpha = 0.82;
      g.lineWidth = Math.max(1.15, s / 370); if (bloomOn) { g.shadowColor = T.phosphor || '#6ee7ed'; g.shadowBlur = Math.max(2, s * 0.008 * (0.4 + clamp(params.bloom, 0, 3) * 0.6)); }
      pathLissajous(cx, cy, rx, ry, phase, 0, Math.PI * 2); g.stroke();
      g.shadowBlur = 0; g.strokeStyle = T.phosphorCore || '#d8ffff'; g.globalAlpha = 0.72 + clamp(params.hot, 0, 1) * 0.23; g.lineWidth = Math.max(0.7, s / 760);
      pathLissajous(cx, cy, rx, ry, phase, 0, Math.PI * 2); g.stroke(); g.restore();

      /* The amber probe is the only moving marker. Its short bright tail exposes direction without twinkle. */
      const a = (still ? 0.84 : lastT * (calm ? 0.52 : 1.05)) % (Math.PI * 2);
      const hx = cx + rx * Math.sin(3 * a + phase), hy = cy + ry * Math.sin(2 * a);
      g.save(); g.strokeStyle = T.phosphorCore || '#d8ffff'; g.globalAlpha = 0.9; g.lineWidth = Math.max(0.8, s / 650);
      pathLissajous(cx, cy, rx, ry, phase, a - 0.22, a); g.stroke();
      g.fillStyle = T.amber || '#e7a44b'; g.shadowColor = T.amber || '#e7a44b'; g.shadowBlur = bloomOn ? Math.max(4, s * 0.014) : 0;
      g.beginPath(); g.arc(hx, hy, Math.max(1.8, s * 0.0055), 0, Math.PI * 2); g.fill(); g.restore();

      /* A restrained glass falloff makes the face read as an object while preserving every diagnostic line. */
      const glass = g.createRadialGradient(cx, cy, s * 0.12, cx, cy, Math.max(tubeRx, tubeRy));
      const edge = 0.3 + clamp(params.vignette, 0, 1) * 0.58;
      glass.addColorStop(0, 'rgba(0,0,0,0)'); glass.addColorStop(0.72, 'rgba(0,0,0,0.04)'); glass.addColorStop(1, `rgba(0,0,0,${edge.toFixed(3)})`);
      g.fillStyle = glass; g.fillRect(0, 0, W, H);
    }
    return {
      enabled: false,
      diagnostic: true,
      tick(dt, t) { if (!document.hidden) draw(t); },
      resize(w, h) { W = Math.max(2, finite(w, canvas.width)); H = Math.max(2, finite(h, canvas.height)); draw(lastT); },
      still(t) { draw(t); },
      destroy() { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); },
      bloom(on) { bloomOn = !!on; draw(lastT); },
      params(p) { params = p || PARAMS; draw(lastT); },
    };
  }

  function mount(canvas, params, ctx) {
    latchIgnition(canvas);
    const OFF = { enabled: false, tick() {}, resize() {}, still() {}, destroy() {}, bloom() {}, params() {} };
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true });   /* software GL: the tube declines (measured 30 to 41 ms/frame on SwiftShader) */
    } catch (_) { gl = null; }
    if (!gl) return canvas.id === 'part' ? (mountDiagnostic(canvas, params, ctx) || OFF) : OFF;
    if (/[?&]tube=0(&|$)/.test(location.search)) return OFF;   /* ?tube=0: the A/B switch for measuring */
    const R = typeof BONEYARD !== 'undefined' ? BONEYARD : {};   /* a top-level const, not a window property */
    const toRgb = R.toRgb || (() => [0, 0, 0]);

    function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    function prog(fs, names) {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; for (const n of names) u[n] = gl.getUniformLocation(p, n);
      return { p, u };
    }
    let P;
    try {
      P = {
        comp: prog(FS_COMP, ['s0', 's1', 's2', 'sp', 'top', 'bot', 'after', 'vpY', 'decay', 'afterMix', 'n']),
        down: prog(FS_DOWN, ['s', 'px', 'knee']),
        blur: prog(FS_BLUR, ['s', 'd']),
        out: prog(FS_OUT, ['s', 'b', 'w', 'k', 'gain', 'wgain', 'hot', 'flare', 'fr', 'vig', 'aspect', 'vp', 'bpx']),
      };
    } catch (e) { return OFF; }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

    function tex() {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function target(w, h) {
      const t = tex(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      return { t, f, w, h };
    }
    function free(T) { if (T) { gl.deleteTexture(T.t); gl.deleteFramebuffer(T.f); } }

    const src = [tex(), tex(), tex()];
    let acc = [null, null], q = [null, null], e = [null, null], iw = 0, ih = 0, cur = 0;
    let bloomOn = true, lost = false, shown = false, fresh = true, age = 0, W = canvas.width, H = canvas.height;
    let col = { top: [0, 0, 0], bot: [0, 0, 0], after: [0, 0, 0] };
    const stats = { ms: 0, n: 0, avg: 0, w: 0, h: 0 };
    ctx.share.tubeStats = stats;

    function readColors() {
      const T = ctx.tokens || {};
      col.top = toRgb(T.field2).map((x) => x / 255); col.bot = toRgb(T.field).map((x) => x / 255);
      col.after = toRgb(T.phosphorCore || T.phosphor).map((x) => x / 255);
    }
    readColors();

    /* internal buffers follow the layers' own resolution (they already carry dpr and the adaptive scale) */
    function ensure(w, h) {
      if (w === iw && h === ih && acc[0]) return;
      iw = w; ih = h;
      free(acc[0]); free(acc[1]); free(q[0]); free(q[1]); free(e[0]); free(e[1]);
      acc = [target(w, h), target(w, h)];
      const qw = Math.max(1, Math.ceil(w / 4)), qh = Math.max(1, Math.ceil(h / 4));
      q = [target(qw, qh), target(qw, qh)];
      const ew = Math.max(1, Math.ceil(qw / 2)), eh = Math.max(1, Math.ceil(qh / 2));
      e = [target(ew, eh), target(ew, eh)];
      fresh = true;
    }

    /* the parts-page test card: a vector Lissajous, a sweep and a floor, drawn in the tokens */
    let demo = null;
    function drawDemo(t) {
      if (!demo) { demo = document.createElement('canvas'); }
      const w = Math.max(2, Math.round(W * 0.75)), h = Math.max(2, Math.round(H * 0.75));
      if (demo.width !== w || demo.height !== h) { demo.width = w; demo.height = h; }
      const g = demo.getContext('2d'), T = ctx.tokens;
      g.clearRect(0, 0, w, h);
      const vx = ctx.vp.x * w, vy = ctx.vp.y * h, s = Math.min(w, h);
      g.lineWidth = Math.max(1, s / 500);
      g.strokeStyle = T.phosphorDim;
      g.beginPath();
      for (let i = -12; i <= 12; i++) { g.moveTo(vx, vy); g.lineTo(vx + i * w * 0.18, h); }
      for (let z = 1; z < 14; z++) { const y = vy + (h - vy) * (1 / (1 + (14 - z) * 0.45)); g.moveTo(0, y); g.lineTo(w, y); }
      g.stroke();
      g.strokeStyle = T.phosphor; g.lineWidth = Math.max(1.2, s / 380);
      g.beginPath(); g.moveTo(0, vy); g.lineTo(w, vy); g.stroke();
      const cx = w / 2, cy = vy - s * 0.02, rx = s * 0.26, ry = s * 0.2, ph = t * 0.7;
      g.beginPath();
      for (let i = 0; i <= 480; i++) { const a = i / 480 * Math.PI * 2; const x = cx + rx * Math.sin(3 * a + ph), y = cy + ry * Math.sin(2 * a); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.strokeStyle = T.phosphorCore; g.lineWidth = Math.max(1, s / 520);
      const sa = t * 1.3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sa) * rx * 1.15, cy + Math.sin(sa) * ry * 1.15); g.stroke();
      g.fillStyle = T.amber;
      g.fillRect(cx + Math.cos(sa) * rx * 1.15 - 2, cy + Math.sin(sa) * ry * 1.15 - 2, 4, 4);
      return demo;
    }

    function upload(i, c) {
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, src[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    }
    function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
    function draw() { gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }

    function render(list, decay, useBloom, fx) {
      fx = fx || { gain: 1, fr: 0 };
      const base = list[0];
      ensure(base.width, base.height);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      for (let i = 0; i < list.length; i++) upload(i, list[i]);
      const prev = acc[cur], next = acc[1 - cur];
      /* A */
      gl.bindFramebuffer(gl.FRAMEBUFFER, next.f); gl.viewport(0, 0, iw, ih);
      gl.useProgram(P.comp.p); const u = P.comp.u;
      gl.uniform1i(u.s0, 0); gl.uniform1i(u.s1, 1); gl.uniform1i(u.s2, 2); gl.uniform1i(u.sp, 3);
      bindTex(3, prev.t);
      gl.uniform3fv(u.top, col.top); gl.uniform3fv(u.bot, col.bot);
      gl.uniform3fv(u.after, col.after);
      gl.uniform1f(u.vpY, Math.max(0.05, ctx.vp.y)); gl.uniform1f(u.decay, fresh ? 0 : decay);
      gl.uniform1f(u.afterMix, clamp(params.afterglow, 0, 0.6)); gl.uniform1f(u.n, list.length);
      draw();
      cur = 1 - cur; fresh = false;
      /* B, C, D */
      if (useBloom) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, q[0].f); gl.viewport(0, 0, q[0].w, q[0].h);
        gl.useProgram(P.down.p); gl.uniform1i(P.down.u.s, 0); bindTex(0, next.t);
        gl.uniform2f(P.down.u.px, 1 / iw, 1 / ih); gl.uniform1f(P.down.u.knee, clamp(params.knee, 0, 1)); draw();
        gl.useProgram(P.blur.p); gl.uniform1i(P.blur.u.s, 0);
        const radius = clamp(params.radius, 0.2, 8);
        gl.bindFramebuffer(gl.FRAMEBUFFER, q[1].f); bindTex(0, q[0].t); gl.uniform2f(P.blur.u.d, radius / q[0].w, 0); draw();
        gl.bindFramebuffer(gl.FRAMEBUFFER, q[0].f); bindTex(0, q[1].t); gl.uniform2f(P.blur.u.d, 0, radius / q[0].h); draw();
        /* the wide halo: the blurred quarter-res bloom, halved again (bilinear) and blurred at eighth res */
        gl.viewport(0, 0, e[0].w, e[0].h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, e[1].f); bindTex(0, q[0].t); gl.uniform2f(P.blur.u.d, radius * 1.5 / e[0].w, 0); draw();
        gl.bindFramebuffer(gl.FRAMEBUFFER, e[0].f); bindTex(0, e[1].t); gl.uniform2f(P.blur.u.d, 0, radius * 1.5 / e[0].h); draw();
      }
      /* E */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      gl.useProgram(P.out.p); const o = P.out.u;
      gl.uniform1i(o.s, 0); gl.uniform1i(o.b, 1); gl.uniform1i(o.w, 2); bindTex(0, next.t); bindTex(1, q[0].t); bindTex(2, e[0].t);
      gl.uniform1f(o.k, clamp(params.barrel, -0.2, 0.3)); gl.uniform1f(o.gain, useBloom ? clamp(params.bloom, 0, 4) * fx.gain : 0); gl.uniform1f(o.wgain, useBloom ? clamp(params.wide, 0, 3) * fx.gain : 0);
      gl.uniform1f(o.hot, clamp(params.hot, 0, 1.5)); gl.uniform1f(o.flare, useBloom ? clamp(params.flare, 0, 0.5) * fx.gain : 0);
      gl.uniform1f(o.fr, clamp(fx.fr, 0, 0.04)); gl.uniform1f(o.vig, clamp(params.vignette, 0, 1));
      gl.uniform1f(o.aspect, W / Math.max(1, H)); gl.uniform2f(o.vp, ctx.vp.x, 1 - ctx.vp.y);
      gl.uniform2f(o.bpx, 1 / Math.max(1, q[0].w), 1 / Math.max(1, q[0].h));
      draw();
    }

    function show(on) {
      if (on === shown) return;
      shown = on;
      canvas.classList.toggle('is-live', on);
      if (!on) { fresh = true; age = 0; }
    }

    const onLost = (e) => { e.preventDefault(); lost = true; show(false); };
    canvas.addEventListener('webglcontextlost', onLost);

    const measure = /[?&]tubeprobe=1/.test(location.search);   /* readPixels sync: includes the 2D layers' own GPU raster, so it over-reads */
    function timed(fn) {
      const t0 = performance.now();
      fn();
      if (measure) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }   /* forces the GPU work into the number */
      stats.ms += performance.now() - t0; stats.n++;
      if (stats.n >= 30) { stats.avg = stats.ms / stats.n; stats.ms = 0; stats.n = 0; stats.w = iw; stats.h = ih; }
    }

    return {
      enabled: true,
      stats,
      tick(dt, t, sources) {
        if (lost) return;
        const onRide = sources && typeof sources === 'object';
        const off = ctx.dial === 'still' || ctx.scale <= 0.5 || document.hidden;
        if (off) { show(false); return; }
        const list = onRide ? [sources.sky, sources.row, sources.corridor].filter((c) => c && c.width > 1) : [drawDemo(t)];
        if (!list.length) return;
        age += dt;
        if (age < 0.6 && onRide) { fresh = true; return; }     /* hold until the 500 ms switch-on is done, then warm up */
        readColorsMaybe();
        const calm = ctx.dial === 'calm';
        const decay = Math.pow(clamp(params.persistence, 0, 0.995), Math.max(0, finite(dt, 0)) * 60) * (calm ? 0.85 : 1);
        /* the fringe: only in Full, only near peak warp (above 0.6) or on a punch; share.punch is optional (0 when absent) */
        const S = ctx.share || {};
        const heat = calm ? 0 : Math.min(1, Math.max(0, ((+S.warp || 0) - 0.6) / 0.4) * 0.7 + Math.max(0, Math.min(1, +S.punch || 0)));
        const fx = { gain: calm ? 0.7 : 1, fr: clamp(params.fringe, 0, 0.04) * heat };
        timed(() => render(list, decay, bloomOn && ctx.scale >= 1, fx));
        show(true);
      },
      resize(w, h) { W = w; H = h; fresh = true; readColors(); },
      still(t) {
        /* parts page only (the ride never calls it): a crisp single frame, persistence off, bloom on */
        if (lost) return;
        fresh = true;
        render([drawDemo(t || 0)], 0, true);
        show(true);
      },
      destroy() {
        canvas.removeEventListener('webglcontextlost', onLost);
        show(false);
        free(acc[0]); free(acc[1]); free(q[0]); free(q[1]); free(e[0]); free(e[1]);
        for (const t of src) gl.deleteTexture(t);
        for (const k in P) gl.deleteProgram(P[k].p);
        gl.deleteBuffer(quad);
        if (ctx.share.tubeStats === stats) delete ctx.share.tubeStats;
      },
      bloom(on) { bloomOn = !!on; },
      params(p) { params = p || PARAMS; fresh = true; readColors(); },
    };

    /* the field tokens only change with a theme; re-read them on a slow clock, never per frame */
    function readColorsMaybe() { if ((stats.n & 63) === 0) readColors(); }
  }
  BAYS.push({ slug: 'tube', title: 'The tube', order: 1, role: 'layer', kind: 'post', params: PARAMS, mount });
})();
