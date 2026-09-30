#!/usr/bin/env node
/* BONEYARD capture (gimli, 2026-09-29): the stills the shelf shows and the social cards carry.
 *
 *   node tools/capture.mjs [--port 4187] [--only jump,hyperspace]
 *
 * Serves the repo on loopback (its own tiny static server, no dependency), then for every
 * parts/<slug>.html writes parts/stills/<slug>.webp: the part's REDUCED-MOTION still (the designed
 * frame from still(), not a mid-animation grab), 480x270, the harness sheet hidden so the canvas is
 * the picture. Then writes og-yard.png: the ride at rest (1200x630), title in frame.
 * Re-run `node build.js` afterwards so the shelf and each part's og:image pick the stills up.
 *
 * Playwright comes from the TG-Data-Apps visual-regress harness (never `playwright install` here):
 *   BONEYARD_PLAYWRIGHT=/abs/path/to/node_modules/playwright overrides the default below.
 * WebP is encoded in the page by Chromium (canvas.toDataURL('image/webp')): no image library. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.BONEYARD_PLAYWRIGHT || 'D:/Git/TG-Data-Apps/tools/visual-regress/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(opt('--port', 4187));
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const STILL_W = 480, STILL_H = 270, SHOT_SCALE = 2;          /* shoot at 960x540 css, downsample to 480x270 */

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || p.split('/').some((s) => s.startsWith('.')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}/`;

const slugs = fs.readdirSync(path.join(ROOT, 'parts')).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.slice(0, -5)).filter((s) => !ONLY || ONLY.has(s));
fs.mkdirSync(path.join(ROOT, 'parts', 'stills'), { recursive: true });

const browser = await chromium.launch();
const offsite = [];
/* re-encode a PNG screenshot to WebP (or PNG) at a target size, inside Chromium */
async function encode(page, png, w, h, type, quality) {
  const b64 = await page.evaluate(async ({ src, w, h, type, quality }) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    return c.toDataURL(type, quality).split(',')[1];
  }, { src: 'data:image/png;base64,' + png.toString('base64'), w, h, type, quality });
  return Buffer.from(b64, 'base64');
}

try {
  /* ---- the stills: reduced motion, the sheet hidden, the designed frame ---- */
  const ctx = await browser.newContext({ viewport: { width: STILL_W * SHOT_SCALE, height: STILL_H * SHOT_SCALE }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark' });
  ctx.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', ''].includes(u.hostname) && u.protocol !== 'data:') offsite.push(r.url()); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const slug of slugs) {
    errors.length = 0;
    await page.goto(`${BASE}parts/${slug}.html`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'main, .skip { display: none !important; }' });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(350);                      /* async data (DEM, sunset strip) redraws still() */
    const png = await page.screenshot({ type: 'png' });
    const webp = await encode(page, png, STILL_W, STILL_H, 'image/webp', 0.82);
    const out = path.join(ROOT, 'parts', 'stills', `${slug}.webp`);
    fs.writeFileSync(out, webp);
    console.log(`still  parts/stills/${slug}.webp  ${(webp.length / 1024).toFixed(1)} KB${errors.length ? '  PAGE ERRORS: ' + errors.join(' | ') : ''}`);
  }
  await ctx.close();

  /* ---- per-part share cards: 1200x630 JPEG, the same designed still at the size large link previews need ---- */
  fs.mkdirSync(path.join(ROOT, 'parts', 'og'), { recursive: true });
  const ogCtx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark' });
  ogCtx.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', ''].includes(u.hostname) && u.protocol !== 'data:') offsite.push(r.url()); });
  const ogPage = await ogCtx.newPage();
  for (const slug of slugs) {
    await ogPage.goto(`${BASE}parts/${slug}.html`, { waitUntil: 'networkidle' });
    await ogPage.addStyleTag({ content: 'main, .skip { display: none !important; }' });
    await ogPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await ogPage.waitForTimeout(350);
    const jpg = await ogPage.screenshot({ type: 'jpeg', quality: 84 });
    fs.writeFileSync(path.join(ROOT, 'parts', 'og', `${slug}.jpg`), jpg);
    console.log(`card   parts/og/${slug}.jpg  ${(jpg.length / 1024).toFixed(1)} KB`);
  }
  await ogCtx.close();

  /* ---- og-yard.png: the ride at rest, the title in frame (full motion so the stars are lit; 1.6 s after
     the 500 ms switch-on so the tube is settled) ---- */
  if (!ONLY) {
    const og = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    og.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== '127.0.0.1' && u.protocol !== 'data:') offsite.push(r.url()); });
    const p = await og.newPage();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.evaluate(() => new Promise((r) => setTimeout(r, 1600)));   /* an in-page await keeps rAF running */
    const png = await p.screenshot({ type: 'png' });
    const out = png;
    fs.writeFileSync(path.join(ROOT, 'og-yard.png'), out);
    console.log(`og     og-yard.png  ${(out.length / 1024).toFixed(1)} KB`);
    await og.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (offsite.length) { console.error(`CAPTURE FAILED: requests to other hosts: ${[...new Set(offsite)].join(', ')}`); process.exit(1); }
console.log('done. now run: node build.js');
