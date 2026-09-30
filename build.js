#!/usr/bin/env node
/* BONEYARD build: the Orrery concatenation pattern (MITHRIL playbook 2.13) plus the parts emitter
 * (vision brief 6). `node build.js` writes:
 *   index.html          the ride (one file, no external requests)
 *   parts/<slug>.html   one standalone page per module registered on BAYS (module + harness)
 *   parts/index.html    the shelf (with captured stills from tools/capture.mjs once they exist)
 *   sitemap.xml         the ride, the shelf, every part
 * Fails loudly on any surviving placeholder marker, any em dash, or any href / src / url() / fetch()
 * naming a host other than ours (no third-party requests). */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT_PARTS = path.join(__dirname, 'parts');
const SITE_URL = 'https://tgilbert14.github.io/ddl-boneyard/';

/* THE manifest: the one load-bearing fragment list. CSS / HTML / JS are derived from it by
   extension, in this order. Add a fragment here and only here. The harness is not in the ride;
   it is the wrapper each module is folded into for parts/. */
const parts = [
  '00-tokens.css',
  '01-tube.css',
  '02-body.html',
  '09-runtime.js',
  '10-core.js',
  '20-tube.js',
  '21-row.js',
  '22-sky.js',
  '23-greetings.js',
  '24-sound.js',
  '30-switch.js',
  '31-hyperspace.js',
  '32-rings.js',
  '40-jump.js',
  '41-gate.js',
  '42-range.js',
  '43-wash.js',
  '44-relief.js',
  '45-terminator.js',
  '46-scope.js',
  '47-mark.js',
  '49-placeholder.js',
].filter((f) => fs.existsSync(path.join(SRC, f)));   /* planned modules join the build the moment their file lands */
const HARNESS = '90-parts-harness.html';

const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n?/g, '\n');   /* CRLF-proof: a Windows editor must not break the header parser */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1) + ' KB';

/* Placeholder failsafe: a surviving __MARKER__ means a broken inject. Fail the build. */
function guard(text, label) {
  const leftover = text.match(/__[A-Z][A-Z0-9_]+__/g);
  if (leftover) {
    console.error(`BUILD FAILED (${label}): surviving placeholders: ${[...new Set(leftover)].join(', ')}`);
    process.exit(1);
  }
}
/* The house rule: no em dashes in any string that ships. */
function noEmDash(text, label) {
  const i = text.indexOf('\u2014');   /* U+2014 written as an escape so this file carries none */
  if (i >= 0) {
    console.error(`BUILD FAILED (${label}): em dash at offset ${i}: ...${text.slice(Math.max(0, i - 40), i + 40)}...`);
    process.exit(1);
  }
}

/* No third-party requests: every href / src / url() / fetch() that names a host must name one of ours.
   Scans HTML attributes and JS assignments alike (x.src = '//cdn...' fails too). Data URIs and relative
   paths pass. Navigation links to github.com are allowed (the source repo). */
const HOSTS = ['tgilbert14.github.io', 'desertdatalabs.com', 'www.desertdatalabs.com', 'github.com'];
const HOST_RE = /\b(?:href|src|srcset|action|poster)\s*[:=]\s*["'`]?\s*((?:https?:)?\/\/[^\s"'`<>)]+)|\burl\(\s*["']?((?:https?:)?\/\/[^\s"')]+)|\b(?:fetch|import)\(\s*["'`]((?:https?:)?\/\/[^\s"'`)]+)/gi;
function ownHostsOnly(text, label) {
  const bad = [];
  for (const m of text.matchAll(HOST_RE)) {
    const u = m[1] || m[2] || m[3];
    let host = '';
    try { host = new URL(u, 'https://x.invalid/').hostname; } catch (_) { host = u; }
    if (!HOSTS.includes(host)) bad.push(u);
  }
  if (bad.length) {
    console.error(`BUILD FAILED (${label}): reference to a host outside ${HOSTS.join(', ')}: ${[...new Set(bad)].join(', ')}`);
    process.exit(1);
  }
}
const ship = (text, label) => { guard(text, label); noEmDash(text, label); ownHostsOnly(text, label); };

/* ---------------------------------------------------------------- the ride */
const css = parts.filter((f) => f.endsWith('.css')).map(read).join('\n\n');
const body = parts.filter((f) => f.endsWith('.html')).map(read).join('\n\n');
const js = parts.filter((f) => f.endsWith('.js')).map(read).join('\n\n');

const DESCRIPTION = 'A boneyard of retired display machines, tubes still on, in a row on the desert floor. Fly the row; pull any part. A Desert Data Labs experience.';
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>BONEYARD · a Desert Data Labs experience</title>
<meta name="description" content="${esc(DESCRIPTION)}">
<meta property="og:title" content="BONEYARD · Desert Data Labs">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}og-yard.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="BONEYARD · Desert Data Labs">
<meta name="twitter:description" content="${esc(DESCRIPTION)}">
<meta name="twitter:image" content="${SITE_URL}og-yard.png">
<link rel="canonical" href="${SITE_URL}">
<meta name="theme-color" content="#030509">
<script>/* before first paint (gimli): the ride layout and the dial are decided here, not at DOMContentLoaded.
   The page is one ~240 KB file; its first paint lands long before the core boots, and flipping html.js then
   moved the whole main (measured CLS 1.0 at 4x CPU / slow 4G). JS off never runs this: the index layout. */
(function(h){h.classList.add('js');var d=null;try{d=localStorage.getItem('boneyard_dial')}catch(_){}
h.dataset.dial=(d==='full'||d==='calm'||d==='still')?d:(matchMedia('(prefers-reduced-motion: reduce)').matches?'still':'full');})(document.documentElement);</script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect x='6' y='6' width='84' height='84' rx='22' fill='%23030509' stroke='%238ef3ff' stroke-width='4'/%3E%3Cg fill='none' stroke='%238ef3ff' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M48 22V76'/%3E%3Cpath d='M48 31L59 41 48 51 37 41Z'/%3E%3Cpath d='M36 76H60'/%3E%3C/g%3E%3C/svg%3E">
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>`;

ship(page, 'index.html');
fs.writeFileSync(path.join(__dirname, 'index.html'), page);

/* ---------------------------------------------------------------- the parts emitter */
/* A module is any manifest JS file that registers itself with BAYS.push({...}). The build reads the
   file as TEXT (no eval): the provenance header block, the HOW IT WORKS block, and the slug / title /
   order / role literals in the registration call. */
const FIELDS = ['technique', 'lineage', 'original', 'not', 'deps', 'budget', 'api', 'license'];
function parseModule(file, text) {
  if (!/BAYS\.push\(\s*\{/.test(text)) return null;
  const head = text.match(/\/\*\s*BONEYARD PART[^\n]*\n([\s\S]*?)\*\//);
  if (!head) throw new Error(`${file}: missing the provenance header (/* BONEYARD PART ... */)`);
  const title = text.match(/\/\*\s*BONEYARD PART\s*·\s*([^\n]*)/);
  const meta = { file, name: title ? title[1].trim() : file };
  let last = null;
  for (const raw of head[1].split('\n')) {
    const line = raw.replace(/^\s*\*\s?/, '');
    const m = line.match(/^(\w+)\s{2,}(.*)$/);
    if (m && FIELDS.includes(m[1])) { meta[m[1]] = m[2].trim(); last = m[1]; }
    else if (last && line.trim()) meta[last] += ' ' + line.trim();
  }
  for (const f of FIELDS) if (!meta[f]) throw new Error(`${file}: provenance header is missing "${f}"`);
  const note = text.match(/\/\*\s*HOW IT WORKS\s*\n([\s\S]*?)\*\//);
  meta.note = note ? note[1].split('\n').map((l) => l.replace(/^\s*\*\s?/, '')).join('\n').trim() : '';
  const reg = text.match(/BAYS\.push\(\s*\{([\s\S]*?)\}\s*\)/);
  const lit = (k) => { const m = reg[1].match(new RegExp(`\\b${k}\\s*:\\s*(?:'([^']*)'|"([^"]*)"|(\\d+))`)); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
  meta.slug = lit('slug'); meta.title = lit('title'); meta.role = lit('role'); meta.order = Number(lit('order') || 0);
  meta.kind = lit('kind') || 'canvas';
  if (!meta.slug || !meta.title || !meta.role) throw new Error(`${file}: BAYS.push needs literal slug, title and role`);
  meta.bytes = Buffer.byteLength(text, 'utf8');
  return meta;
}

const modules = parts.filter((f) => f.endsWith('.js')).map((f) => parseModule(f, read(f))).filter(Boolean);
const slugs = new Set();
for (const m of modules) { if (slugs.has(m.slug)) throw new Error(`duplicate slug ${m.slug}`); slugs.add(m.slug); }

const tokens = read('00-tokens.css');
const runtime = read('09-runtime.js');
const harness = read(HARNESS);
const noteHtml = (note) => note ? note.split(/\n\s*\n/).map((p) => `<p>${esc(p.replace(/\s*\n\s*/g, ' '))}</p>`).join('\n') : '<p>No note yet.</p>';
const provenanceHtml = (m) => `<dl class="prov">${FIELDS.map((f) => `<dt>${f}</dt><dd>${esc(m[f])}</dd>`).join('')}</dl>`;

fs.mkdirSync(OUT_PARTS, { recursive: true });
/* Captured stills (tools/capture.mjs writes parts/stills/<slug>.webp). The build never invents one:
   no capture, no image; the shelf keeps the plain link and the og card falls back to the yard. */
const STILLS = path.join(OUT_PARTS, 'stills');
const hasStill = (slug) => fs.existsSync(path.join(STILLS, `${slug}.webp`));
/* Remove stale generated parts so a renamed slug does not leave a ghost on the shelf. */
for (const f of fs.readdirSync(OUT_PARTS)) if (f.endsWith('.html')) fs.unlinkSync(path.join(OUT_PARTS, f));

for (const m of modules) {
  const code = read(m.file);
  const url = `${SITE_URL}parts/${m.slug}.html`;
  /* a 1200x630 share card when capture.mjs made one (large link previews need it), else the yard card */
  const og = fs.existsSync(path.join(OUT_PARTS, 'og', `${m.slug}.jpg`))
    ? { img: `${SITE_URL}parts/og/${m.slug}.jpg`, w: 1200, h: 630, type: 'image/jpeg' }
    : { img: `${SITE_URL}og-yard.png`, w: 1200, h: 630, type: 'image/png' };
  const pageOut = harness
    .replace(/__CANONICAL__/g, url)
    .replace(/__OG_IMAGE__/g, og.img)
    .replace(/__OG_W__/g, String(og.w))
    .replace(/__OG_H__/g, String(og.h))
    .replace(/__OG_TYPE__/g, og.type)
    .replace(/__TITLE__/g, esc(m.title))
    .replace(/__NAME__/g, esc(m.name))
    .replace(/__SLUG__/g, esc(m.slug))
    .replace(/__ROLE__/g, esc(m.role))
    .replace(/__KIND__/g, esc(m.kind))
    .replace(/__FILE__/g, esc(m.file))
    .replace(/__DESCRIPTION__/g, esc(`${m.title}: ${m.technique}. One standalone BONEYARD part with its PARAMS, note and provenance.`))
    .replace(/__BUDGET__/g, esc(m.budget))
    .replace(/__NOTE__/g, noteHtml(m.note))
    .replace(/__PROVENANCE__/g, provenanceHtml(m))
    .replace(/__TOKENS__/g, tokens)
    .replace('__RUNTIME__', () => runtime)
    .replace('__MODULE__', () => code);
  ship(pageOut, `parts/${m.slug}.html`);
  fs.writeFileSync(path.join(OUT_PARTS, `${m.slug}.html`), pageOut);
}

/* The shelf: bay, technique, era (lineage), file size, measured cost, still. The still is the captured
   reduced-motion frame (tools/capture.mjs) once it exists; until then a plain link (no fake thumbnails). */
const byOrder = [...modules].sort((a, b) => (a.role === b.role ? a.order - b.order : ['layer', 'corridor', 'bay', 'placeholder'].indexOf(a.role) - ['layer', 'corridor', 'bay', 'placeholder'].indexOf(b.role)));
const rows = byOrder.map((m) => `<tr>
  <th scope="row"><a href="${esc(m.slug)}.html">${esc(m.title)}</a><span class="role">${esc(m.role)}</span></th>
  <td>${esc(m.technique)}</td>
  <td>${esc(m.lineage)}</td>
  <td class="num">${(m.bytes / 1024).toFixed(1)} KB</td>
  <td>${esc(m.budget)}</td>
  <td>${hasStill(m.slug)
    ? `<a href="${esc(m.slug)}.html" class="still"><img src="stills/${esc(m.slug)}.webp" width="120" height="68" loading="lazy" decoding="async" alt="${esc(m.title)}, the still frame"></a>`
    : `<a href="${esc(m.slug)}.html" class="still">open</a>`}</td>
</tr>`).join('\n');
const SHELF_DESC = 'Every BONEYARD effect as one plain file: technique, lineage, size and measured cost. Pull any part.';
const pageList = byOrder.map((m) => `<li><a href="${esc(m.slug)}.html">${esc(m.title)}</a> <span class="role">${esc(m.role)}</span> <code>parts/${esc(m.slug)}.html</code></li>`).join('\n');
const shelf = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The shelf · BONEYARD parts · Desert Data Labs</title>
<meta name="description" content="${esc(SHELF_DESC)}">
<meta property="og:title" content="The shelf · BONEYARD parts">
<meta property="og:description" content="${esc(SHELF_DESC)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}parts/">
<meta property="og:image" content="${SITE_URL}og-yard.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="The shelf · BONEYARD parts">
<meta name="twitter:description" content="${esc(SHELF_DESC)}">
<meta name="twitter:image" content="${SITE_URL}og-yard.png">
<link rel="canonical" href="${SITE_URL}parts/">
<meta name="theme-color" content="#030509">
<style>
${tokens}
body { margin: 0; background: var(--field); color: var(--ink); font: 15px/1.5 var(--font-mono); padding: clamp(1rem, 4vw, 3rem); }
h1 { font: 600 clamp(1.4rem, 4vw, 2.2rem)/1.1 var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: var(--phosphor); margin: 0 0 .4rem; }
p { max-width: 62ch; color: var(--ink-dim); }
a { color: var(--phosphor); }
a:focus-visible { outline: 2px solid var(--amber); outline-offset: 3px; }
table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; font-size: 14px; }
th, td { text-align: left; vertical-align: top; padding: .6rem .7rem; border-top: 1px solid var(--line); }
thead th { color: var(--ink-dim); font-weight: 500; letter-spacing: .06em; text-transform: uppercase; font-size: 12px; }
tbody th { font-weight: 600; white-space: nowrap; }
.role { display: block; font-size: 11px; color: var(--ink-dim); letter-spacing: .08em; text-transform: uppercase; }
.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.wrap { overflow-x: auto; }
nav { margin-top: 2rem; }
.still { display: inline-block; line-height: 0; }
.still img { display: block; width: 120px; height: auto; aspect-ratio: 16 / 9; background: var(--field-2); outline: 1px solid var(--line); }
.still:hover img, .still:focus-visible img { outline-color: var(--phosphor); }
h2 { font: 600 12px/1.2 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-dim); margin: 2.2rem 0 0; }
.pages { list-style: none; padding: 0; margin: .6rem 0 0; columns: 18rem; font-size: 13px; }
.pages li { break-inside: avoid; padding: .15rem 0; }
.pages .role { display: inline; margin-left: .3rem; }
.pages code { display: block; color: var(--ink-dim); font-size: 12px; }
</style>
</head>
<body>
<main>
<h1>The shelf</h1>
<p>Every effect on the BONEYARD row is one plain file: a provenance header, a PARAMS block, and one mount() factory. Each part below runs on its own page with its tweak row and a note on how it works.</p>
<div class="wrap">
<table>
<thead><tr><th scope="col">Part</th><th scope="col">Technique</th><th scope="col">Lineage</th><th scope="col">Size</th><th scope="col">Measured cost</th><th scope="col">Still</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<h2 id="h-pages">Every page</h2>
<ul class="pages" aria-labelledby="h-pages">
<li><a href="../">The ride</a> <code>index.html</code></li>
<li><a href="index.html">The shelf</a> <code>parts/index.html</code></li>
${pageList}
</ul>
<nav><a href="../">Ride the row</a> · <a href="https://desertdatalabs.com/">Desert Data Labs</a></nav>
</main>
</body>
</html>`;
ship(shelf, 'parts/index.html');
fs.writeFileSync(path.join(OUT_PARTS, 'index.html'), shelf);

/* sitemap.xml: the ride, the shelf, every part (crawlers index the no-JS page and each part page) */
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[SITE_URL, `${SITE_URL}parts/`, ...byOrder.map((m) => `${SITE_URL}parts/${m.slug}.html`)].map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
guard(sitemap, 'sitemap.xml'); noEmDash(sitemap, 'sitemap.xml');
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);

console.log(`built: index.html ${kb(page)} (css ${kb(css)} · html ${kb(body)} · js ${kb(js)})`);
console.log(`parts: ${modules.map((m) => `${m.slug} (${(m.bytes / 1024).toFixed(1)} KB${hasStill(m.slug) ? ', still' : ''})`).join(', ')} + index.html + sitemap.xml`);
