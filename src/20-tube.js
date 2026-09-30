/* BONEYARD PART · L1 · THE TUBE
 * technique   WebGL1 phosphor post-pass over the composited 2D layers: persistence (max of the current frame and the decayed last one), a quarter-res two-pass bloom added back, a very slight barrel, a vignette
 * lineage     the vector CRT: the oscilloscope; Asteroids (Atari, 1979); Battlezone (Atari, 1980); Tempest (Atari, 1981); Vectrex (1982)
 * original    one skin over the whole row that no room depends on: it takes the sky, the row and the corridor canvases as textures, and the rooms stay crisp DOM above it with a static CSS halo on their frames
 * not         scanlines (vector tubes had none; scanlines are ACI's), a curvature gimmick, a blocking dependency; it does not skin the rooms (see HOW IT WORKS)
 * deps        none · WebGL1 when present, a clean no-op otherwise · 2026-09
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
 * brighter of "now" and "last frame times a decay". That is phosphor persistence without the blow-out a plain sum
 * gives a static line: anything that moves leaves a short tail, anything still stays exactly as bright as it is.
 * A 4x4 box downsample to quarter resolution (four bilinear taps) keeps one-pixel lines from falling between
 * samples; a horizontal then a vertical 9-tap blur makes the bloom, which is added back. The last pass samples
 * through a barrel of k = 0.04 centered on the vanishing point (so the one vanishing point never moves), scaled so
 * the farthest corner samples its own corner (no black rim), and darkens the corners.
 * The rooms are CSS-transformed canvases in the DOM, animated by the core and by SWITCH. Rebuilding their
 * transforms, opacities and flashes inside WebGL every frame would cost a texture upload per room plus a style
 * read per frame, well past 4 ms, so the rooms sit ABOVE the tube and carry their own static halo (a box-shadow on
 * the frame, rasterized once and then only transformed). Every room already looks right without the tube.
 * The adaptive budget drops it first: below internal scale 1 the bloom goes; at 0.5 the tube goes. It turns itself
 * off under the dial's Still (the layers underneath are the still). Without WebGL it reports enabled: false and the
 * page never knows. On this parts page it draws its own vector test card so the pass has something to hold.
 */
(() => {
  'use strict';
  const PARAMS = {
    persistence: 0.72,     /* last-frame weight at 60 fps (frame-rate corrected) */
    bloom: 0.9,            /* bloom add-back gain */
    knee: 0.22,            /* bloom starts above this luma, per 2x2 tap */
    radius: 1.4,           /* blur step in quarter-res texels */
    barrel: 0.04,          /* barrel distortion k */
    vignette: 0.30,        /* corner darkening */
  };

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  /* A: composite field + three premultiplied layers, then persistence against the last frame */
  const FS_COMP = 'precision mediump float;varying vec2 v;uniform sampler2D s0,s1,s2,sp;uniform vec3 top,bot;uniform float vpY,decay,n;' +
    'void main(){vec3 c=mix(top,bot,clamp((1.-v.y)/vpY,0.,1.));' +
    'vec4 a=texture2D(s0,v);c=a.rgb+c*(1.-a.a);' +
    'if(n>1.){a=texture2D(s1,v);c=a.rgb+c*(1.-a.a);}' +
    'if(n>2.){a=texture2D(s2,v);c=a.rgb+c*(1.-a.a);}' +
    'c=max(c,texture2D(sp,v).rgb*decay);gl_FragColor=vec4(c,1.);}';
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
  const FS_OUT = 'precision mediump float;varying vec2 v;uniform sampler2D s,b;uniform float k,gain,vig,aspect;uniform vec2 vp;' +
    'void main(){vec2 d=v-vp;vec2 da=vec2(d.x*aspect,d.y);vec2 fc=vec2(max(vp.x,1.-vp.x)*aspect,max(vp.y,1.-vp.y));' +
    'float r2=dot(da,da)/dot(fc,fc);vec2 u=vp+d*(1.+k*r2)/(1.+k);' +
    'vec3 c=texture2D(s,u).rgb+texture2D(b,u).rgb*gain;' +
    'vec2 q=(v*2.-1.)*vec2(aspect,1.);float rv=dot(q,q)/(1.+aspect*aspect);' +
    'c*=1.-vig*pow(rv,1.6);gl_FragColor=vec4(c,1.);}';

  function mount(canvas, params, ctx) {
    const OFF = { enabled: false, tick() {}, resize() {}, still() {}, destroy() {}, bloom() {}, params() {} };
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    } catch (_) { gl = null; }
    if (!gl || /[?&]tube=0(&|$)/.test(location.search)) return OFF;   /* ?tube=0: the A/B switch for measuring */
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
        comp: prog(FS_COMP, ['s0', 's1', 's2', 'sp', 'top', 'bot', 'vpY', 'decay', 'n']),
        down: prog(FS_DOWN, ['s', 'px', 'knee']),
        blur: prog(FS_BLUR, ['s', 'd']),
        out: prog(FS_OUT, ['s', 'b', 'k', 'gain', 'vig', 'aspect', 'vp']),
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
    let acc = [null, null], q = [null, null], iw = 0, ih = 0, cur = 0;
    let bloomOn = true, lost = false, shown = false, fresh = true, age = 0, W = canvas.width, H = canvas.height;
    let col = { top: [0, 0, 0], bot: [0, 0, 0] };
    const stats = { ms: 0, n: 0, avg: 0, w: 0, h: 0 };
    ctx.share.tubeStats = stats;

    function readColors() {
      const T = ctx.tokens || {};
      col.top = toRgb(T.field2).map((x) => x / 255); col.bot = toRgb(T.field).map((x) => x / 255);
    }
    readColors();

    /* internal buffers follow the layers' own resolution (they already carry dpr and the adaptive scale) */
    function ensure(w, h) {
      if (w === iw && h === ih && acc[0]) return;
      iw = w; ih = h;
      free(acc[0]); free(acc[1]); free(q[0]); free(q[1]);
      acc = [target(w, h), target(w, h)];
      const qw = Math.max(1, Math.ceil(w / 4)), qh = Math.max(1, Math.ceil(h / 4));
      q = [target(qw, qh), target(qw, qh)];
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

    function render(list, decay, useBloom) {
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
      gl.uniform1f(u.vpY, Math.max(0.05, ctx.vp.y)); gl.uniform1f(u.decay, fresh ? 0 : decay); gl.uniform1f(u.n, list.length);
      draw();
      cur = 1 - cur; fresh = false;
      /* B, C, D */
      if (useBloom) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, q[0].f); gl.viewport(0, 0, q[0].w, q[0].h);
        gl.useProgram(P.down.p); gl.uniform1i(P.down.u.s, 0); bindTex(0, next.t);
        gl.uniform2f(P.down.u.px, 1 / iw, 1 / ih); gl.uniform1f(P.down.u.knee, params.knee); draw();
        gl.useProgram(P.blur.p); gl.uniform1i(P.blur.u.s, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, q[1].f); bindTex(0, q[0].t); gl.uniform2f(P.blur.u.d, params.radius / q[0].w, 0); draw();
        gl.bindFramebuffer(gl.FRAMEBUFFER, q[0].f); bindTex(0, q[1].t); gl.uniform2f(P.blur.u.d, 0, params.radius / q[0].h); draw();
      }
      /* E */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      gl.useProgram(P.out.p); const o = P.out.u;
      gl.uniform1i(o.s, 0); gl.uniform1i(o.b, 1); bindTex(0, next.t); bindTex(1, q[0].t);
      gl.uniform1f(o.k, params.barrel); gl.uniform1f(o.gain, useBloom ? params.bloom : 0); gl.uniform1f(o.vig, params.vignette);
      gl.uniform1f(o.aspect, W / Math.max(1, H)); gl.uniform2f(o.vp, ctx.vp.x, 1 - ctx.vp.y);
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
        const decay = Math.pow(params.persistence, Math.max(0, dt) * 60) * (ctx.dial === 'calm' ? 0.85 : 1);
        timed(() => render(list, decay, bloomOn && ctx.scale >= 1));
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
        free(acc[0]); free(acc[1]); free(q[0]); free(q[1]);
        for (const t of src) gl.deleteTexture(t);
        for (const k in P) gl.deleteProgram(P[k].p);
        gl.deleteBuffer(quad);
        if (ctx.share.tubeStats === stats) delete ctx.share.tubeStats;
      },
      bloom(on) { bloomOn = !!on; },
      params(p) { params = p; },
    };

    /* the field tokens only change with a theme; re-read them on a slow clock, never per frame */
    function readColorsMaybe() { if ((stats.n & 63) === 0) readColors(); }
  }
  BAYS.push({ slug: 'tube', title: 'The tube', order: 1, role: 'layer', kind: 'post', params: PARAMS, mount });
})();
