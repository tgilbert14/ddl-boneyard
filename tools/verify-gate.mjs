#!/usr/bin/env node
/* Browser acceptance gate for the rebuilt GATE module.
 *
 * This script drives the shipped ride and standalone part through their visible controls. It writes
 * receipts outside the repository by default and never builds, captures, edits, or publishes site output.
 * CPU numbers time only synchronous handle.tick calls. They do not claim GPU, compositor, paint, phone,
 * thermal, or field performance.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserRuntime} from './browser-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return `Usage: node tools/verify-gate.mjs [base] [receipt-dir]
       node tools/verify-gate.mjs --base http://127.0.0.1:4186/ --out /private/tmp/gate-receipts

Defaults:
  base         http://127.0.0.1:4186/
  receipt-dir  /private/tmp/boneyard-gate-<UTC timestamp>

The preview must already be serving a freshly built checkout. The exact public deployment URL
https://tgilbert14.github.io/ddl-boneyard/ is also accepted. The verifier does not run build.js.`;
}

function parseArgs(argv) {
  const options = {base: '', out: '', headed: false};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { console.log(usage()); process.exit(0); }
    if (arg === '--headed') { options.headed = true; continue; }
    if (arg === '--base') { options.base = argv[++i] || ''; continue; }
    if (arg.startsWith('--base=')) { options.base = arg.slice(7); continue; }
    if (arg === '--out') { options.out = argv[++i] || ''; continue; }
    if (arg.startsWith('--out=')) { options.out = arg.slice(6); continue; }
    if (arg.startsWith('-')) throw new Error('Unknown option: ' + arg + '\n' + usage());
    positional.push(arg);
  }
  if (!options.base) options.base = positional.shift() || 'http://127.0.0.1:4186/';
  if (!options.out) options.out = positional.shift() || '';
  if (positional.length) throw new Error('Unexpected argument: ' + positional[0] + '\n' + usage());
  return options;
}

const options = parseArgs(process.argv.slice(2));
const baseUrl = new URL(options.base);
if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
const localPreview = baseUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(baseUrl.hostname);
const publicDeployment = baseUrl.origin === 'https://tgilbert14.github.io' && baseUrl.pathname === '/ddl-boneyard/';
if (!localPreview && !publicDeployment) {
  throw new Error('Gate verification accepts loopback HTTP or exactly https://tgilbert14.github.io/ddl-boneyard/.');
}
if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error('Base URL must not contain credentials, a query, or a fragment.');
const base = baseUrl.href;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve(options.out || `/private/tmp/boneyard-gate-${stamp}`);
const shots = path.join(out, 'screenshots');
const downloads = path.join(out, 'downloads');
const liftDir = path.join(out, 'lift');
await Promise.all([fs.mkdir(shots, {recursive: true}), fs.mkdir(downloads, {recursive: true})]);

const report = {
  passed: false,
  observedAt: new Date().toISOString(),
  base,
  receiptDir: out,
  conditions: {
    browser: 'Installed Chromium from tools/browser-runtime.mjs',
    deviceScaleFactor: 1,
    motion: 'Normal Full motion unless the named check changes the visible dial',
    cpu: 'Standalone Gate at 1440x900 with the harness ticker stopped through the visible Still control. For the budget measurement, ctx.dial is set to Full only inside the test and each of 30 conditioning ticks plus every measured tick is paced by one requestAnimationFrame; actual callback cadence supplies dt (capped at 0.05 s) and is reported. The real handle.launch() begins the measured factory charge, travel, recovery, and one post-settle second at progress 0 with a centered inactive pointer. A separately labeled back-to-back fixed-dt stress loop is also reported and is not treated as normal-rate budget evidence. Labels use published PARAMS durations, not private state names. performance.now surrounds handle.tick only. Costs include synchronous JavaScript and Canvas 2D work charged to that call; they exclude asynchronous GPU, compositor, paint, screenshots, network, thermal behavior, and hardware-phone performance.',
    phones: 'Chromium touch/mobile emulation, not hardware Safari or Android certification.',
  },
  checks: [],
  failures: [],
  browserIssues: {pageErrors: [], consoleErrors: [], failedRequests: [], badResponses: [], offsiteRequests: []},
  assets: [],
};

const allowedOrigins = new Set([baseUrl.origin]);
const assetResponses = [];
const {chromium} = browserRuntime();
let browser = null;
let liftServer = null;

const site = (relative = '') => new URL(relative, base).href;
const shot = (name) => path.join(shots, name + '.png');
const delay = (page, ms) => page.waitForTimeout(Math.max(0, Math.round(ms)));

function messageFor(error) {
  return error && error.stack ? error.stack : String(error);
}

async function scenario(name, action) {
  const started = performance.now();
  try {
    const details = await action();
    const entry = {name, passed: true, elapsedMs: Math.round(performance.now() - started), details};
    report.checks.push(entry);
    console.log('PASS ' + name);
    return details;
  } catch (error) {
    const failure = {name, elapsedMs: Math.round(performance.now() - started), error: messageFor(error)};
    report.failures.push(failure);
    report.checks.push({name, passed: false, elapsedMs: failure.elapsedMs});
    console.error('FAIL ' + name + ': ' + (error && error.message ? error.message : error));
    return null;
  }
}

function observe(page, label) {
  page.on('pageerror', (error) => report.browserIssues.pageErrors.push({label, url: page.url(), message: error.message}));
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.browserIssues.consoleErrors.push({label, url: page.url(), message: msg.text()});
  });
  page.on('request', (request) => {
    let url;
    try { url = new URL(request.url()); } catch (_) { return; }
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return;
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (!allowedOrigins.has(url.origin)) report.browserIssues.offsiteRequests.push({label, url: url.href});
    }
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    report.browserIssues.failedRequests.push({label, url: request.url(), error: failure && failure.errorText});
  });
  page.on('response', (response) => {
    const url = response.url();
    if (/\/assets\/sunset-strip\.png(?:$|\?)/.test(url)) assetResponses.push({label, url, status: response.status()});
    if (response.status() >= 400) report.browserIssues.badResponses.push({label, url, status: response.status()});
  });
}

async function openPage(context, label) {
  const page = await context.newPage();
  observe(page, label);
  return page;
}

async function waitPart(page) {
  await page.waitForFunction(() => {
    const part = window.BONEYARD_PART;
    return !!part?.handle && typeof part.handle.launch === 'function' && !!part.ctx?.readouts?.gate;
  }, null, {timeout: 15000});
}

async function waitMain(page) {
  await page.waitForFunction(() => {
    const ride = window.BONEYARD_RIDE;
    const gate = ride?.bays?.find((bay) => bay.slug === 'gate');
    return !!gate?.m?.handle && typeof gate.m.handle.launch === 'function' && !!ride.ctx?.readouts?.gate;
  }, null, {timeout: 15000});
}

async function canvasFrame(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const w = 96, h = 64;
    const sample = document.createElement('canvas'); sample.width = w; sample.height = h;
    const g = sample.getContext('2d', {willReadFrequently: true});
    g.drawImage(canvas, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h).data;
    let luma = 0, nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      luma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (data[i] + data[i + 1] + data[i + 2] > 18) nonBlack++;
    }
    return {
      source: [canvas.width, canvas.height],
      css: [canvas.clientWidth, canvas.clientHeight],
      sample: [w, h],
      meanLuma: luma / (w * h),
      nonBlackPercent: nonBlack / (w * h) * 100,
      pixels: Array.from(data),
    };
  });
}

function frameMeta(frame) {
  return {
    source: frame.source,
    css: frame.css,
    sample: frame.sample,
    meanLuma: Number(frame.meanLuma.toFixed(3)),
    nonBlackPercent: Number(frame.nonBlackPercent.toFixed(3)),
    sha256: crypto.createHash('sha256').update(Buffer.from(frame.pixels)).digest('hex'),
  };
}

function frameDiff(a, b) {
  assert.deepEqual(a.sample, b.sample, 'sample dimensions');
  let sum = 0, changed = 0, max = 0;
  const pixels = a.sample[0] * a.sample[1];
  for (let i = 0; i < a.pixels.length; i += 4) {
    const delta = (Math.abs(a.pixels[i] - b.pixels[i]) + Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) + Math.abs(a.pixels[i + 2] - b.pixels[i + 2])) / 3;
    sum += delta; max = Math.max(max, delta); if (delta >= 4) changed++;
  }
  return {meanAbsRgb: Number((sum / pixels).toFixed(3)), changedPercent: Number((changed / pixels * 100).toFixed(3)), maxRgb: Number(max.toFixed(3))};
}

function requireVisibleChange(before, after, label, minimum = {mean: 0.15, percent: 0.25}) {
  const diff = frameDiff(before, after);
  assert.ok(diff.meanAbsRgb >= minimum.mean && diff.changedPercent >= minimum.percent,
    `${label} was too small to establish a rendered-frame change (${JSON.stringify(diff)})`);
  return diff;
}

function factoryDurations(params) {
  const charge = Number(params.chargeTime), travel = Number(params.travelTime), recovery = Number(params.recoveryTime);
  assert.ok([charge, travel, recovery].every((value) => Number.isFinite(value) && value > 0), 'Gate publishes positive charge/travel/recovery PARAMS');
  const total = charge + travel + recovery;
  assert.ok(total <= 12, 'Factory launch remains bounded to at most 12 seconds');
  return {charge, travel, recovery, total};
}

async function partState(page) {
  return page.evaluate(() => {
    const reg = window.BAYS.find((entry) => entry.slug === 'gate');
    const button = [...document.querySelectorAll('#module-actions button')].find((entry) => entry.textContent.trim() === 'Fire gate');
    const box = button?.getBoundingClientRect();
    const canvas = document.getElementById('part');
    return {
      dial: document.documentElement.dataset.dial,
      mounted: !!window.BONEYARD_PART?.handle,
      launch: typeof window.BONEYARD_PART?.handle?.launch === 'function',
      ticker: BONEYARD.Ticker.size,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      button: box && {width: box.width, height: box.height},
      title: document.getElementById('h-part')?.textContent.trim(),
      source: document.querySelector('.file')?.textContent.trim(),
      pngEnabled: !document.getElementById('save-png')?.disabled,
      htmlEnabled: !document.getElementById('save-html')?.disabled,
      assetNote: document.getElementById('asset-note')?.textContent.trim(),
      registration: reg && {slug: reg.slug, title: reg.title, ownsPixel: Object.prototype.hasOwnProperty.call(reg, 'pixel'), pixel: reg.pixel ?? null},
      canvas: {backing: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight], dataPixel: canvas.hasAttribute('data-pixel')},
    };
  });
}

async function mainState(page) {
  return page.evaluate(() => {
    const ride = window.BONEYARD_RIDE;
    const gate = ride?.bays?.find((bay) => bay.slug === 'gate');
    const reg = window.BAYS.find((entry) => entry.slug === 'gate');
    const button = document.querySelector('.bay-launch[data-slug="gate"]');
    const box = button?.getBoundingClientRect();
    const canvas = gate?.m?.canvas;
    const sound = window.BONEYARD_SOUND;
    return {
      dial: document.documentElement.dataset.dial,
      hash: location.hash,
      current: ride?.current,
      currentSlug: ride?.bays?.[ride.current]?.slug,
      mounted: !!gate?.m?.handle,
      launch: typeof gate?.m?.handle?.launch === 'function',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      button: box && {width: box.width, height: box.height},
      registration: reg && {slug: reg.slug, title: reg.title, ownsPixel: Object.prototype.hasOwnProperty.call(reg, 'pixel'), pixel: reg.pixel ?? null},
      canvas: canvas && {backing: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight], dataPixel: canvas.hasAttribute('data-pixel')},
      sound: sound && {on: sound.on, context: sound.context?.state || null, playing: sound.playing, pending: sound.pending, outputLevel: sound.outputLevel},
      y: scrollY,
    };
  });
}

async function mainActionClearance(page) {
  return page.evaluate(() => {
    const action = document.querySelector('.bay-launch[data-slug="gate"]');
    const nav = document.querySelector('.bay-navigation');
    const a = action.getBoundingClientRect(), n = nav.getBoundingClientRect();
    const center = {x: a.left + a.width / 2, y: a.top + a.height / 2};
    const hit = document.elementFromPoint(center.x, center.y);
    const box = (r) => ({left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height});
    const overlapWidth = Math.max(0, Math.min(a.right, n.right) - Math.max(a.left, n.left));
    const overlapHeight = Math.max(0, Math.min(a.bottom, n.bottom) - Math.max(a.top, n.top));
    return {
      action: box(a),
      navigation: box(n),
      actionCenter: center,
      navigationCenter: {x: n.left + n.width / 2, y: n.top + n.height / 2},
      verticalClearance: n.top - a.bottom,
      overlap: {width: overlapWidth, height: overlapHeight},
      centerHit: !!hit && action.contains(hit),
      viewport: {width: innerWidth, height: innerHeight},
    };
  });
}

function assertCommonGateState(state, label) {
  assert.equal(state.dial, 'full', label + ' defaults to Full');
  assert.equal(state.mounted, true, label + ' mounts Gate');
  assert.equal(state.launch, true, label + ' exposes launch');
  assert.equal(state.overflow, false, label + ' has no horizontal overflow');
  assert.ok(state.button && state.button.width >= 44 && state.button.height >= 44,
    `${label} Fire gate target is at least 44px in both dimensions; measured ${JSON.stringify(state.button)}`);
  assert.deepEqual(state.registration && {slug: state.registration.slug, title: state.registration.title}, {slug: 'gate', title: 'Gate'}, label + ' keeps Gate identity');
  assert.equal(state.registration.ownsPixel, false, label + ' removes fixed pixel registration');
  assert.equal(state.canvas.dataPixel, false, label + ' has no data-pixel canvas marker');
}

async function setRideDial(page, value) {
  const details = page.locator('#ride-settings');
  if (!(await details.evaluate((node) => node.open))) await details.locator('summary').click();
  await page.getByRole('radio', {name: value, exact: true}).check();
  await page.waitForFunction((dial) => document.documentElement.dataset.dial === dial, value.toLowerCase());
}

async function compareDownloadedPng(page, selectedDataUrl, pngBytes) {
  return page.evaluate(async ({selected, downloaded}) => {
    async function decode(src) {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const g = canvas.getContext('2d', {willReadFrequently: true}); g.drawImage(image, 0, 0);
      return {width: canvas.width, height: canvas.height, pixels: g.getImageData(0, 0, canvas.width, canvas.height).data};
    }
    const a = await decode(selected), b = await decode(downloaded);
    if (a.width !== b.width || a.height !== b.height) return {selected: [a.width, a.height], downloaded: [b.width, b.height], mismatchPixels: -1};
    let mismatchPixels = 0;
    for (let i = 0; i < a.pixels.length; i += 4) {
      if (a.pixels[i] !== b.pixels[i] || a.pixels[i + 1] !== b.pixels[i + 1] || a.pixels[i + 2] !== b.pixels[i + 2] || a.pixels[i + 3] !== b.pixels[i + 3]) mismatchPixels++;
    }
    return {selected: [a.width, a.height], downloaded: [b.width, b.height], mismatchPixels};
  }, {selected: selectedDataUrl, downloaded: 'data:image/png;base64,' + pngBytes.toString('base64')});
}

function configFromHtml(source) {
  const match = source.match(/<script[^>]+id=["']boneyard-part-config["'][^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'downloaded HTML contains boneyard-part-config');
  return JSON.parse(match[1]);
}

async function staticServer(directory) {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      let file = path.resolve(directory, '.' + pathname);
      if (!file.startsWith(directory + path.sep) && file !== directory) { res.writeHead(403); res.end(); return; }
      const stat = await fs.stat(file);
      if (stat.isDirectory()) file = path.join(file, 'index.html');
      const data = await fs.readFile(file);
      const ext = path.extname(file).toLowerCase();
      const types = {'.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2'};
      res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
      res.end(data);
    } catch (_) { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {server, base: `http://127.0.0.1:${server.address().port}/`};
}

async function nativeTouchSwipe(context, page, from, to) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: from.x, y: from.y, radiusX: 4, radiusY: 4, force: 1}]});
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps, y = from.y + (to.y - from.y) * i / steps;
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y, radiusX: 4, radiusY: 4, force: 1}]});
    await delay(page, 16);
  }
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await cdp.detach();
}

try {
  browser = await chromium.launch({headless: !options.headed});

  await scenario('desktop, phone, and compact layouts mount the full-resolution Gate', async () => {
    const views = [
      {name: 'desktop-1440x900', width: 1440, height: 900, mobile: false},
      {name: 'phone-390x844', width: 390, height: 844, mobile: true},
      {name: 'compact-320x568', width: 320, height: 568, mobile: true},
    ];
    const states = [];
    for (const view of views) {
      const context = await browser.newContext({viewport: {width: view.width, height: view.height}, deviceScaleFactor: 1, hasTouch: view.mobile, isMobile: view.mobile});
      try {
        const main = await openPage(context, 'layout-main-' + view.name);
        await main.goto(site('#gate'), {waitUntil: 'networkidle'}); await waitMain(main);
        const ride = await mainState(main); assertCommonGateState(ride, 'Ride ' + view.name);
        assert.equal(ride.hash, '#gate', 'Ride ' + view.name + ' preserves #gate');
        assert.equal(ride.currentSlug, 'gate', 'Ride ' + view.name + ' lands on Gate');
        assert.equal(ride.sound.on, true, 'Ride ' + view.name + ' starts sound enabled');
        assert.equal(ride.sound.context, null, 'Ride ' + view.name + ' creates no audio context before a gesture');
        assert.equal(ride.sound.playing, false, 'Ride ' + view.name + ' stays silent before a gesture');
        assert.equal(ride.sound.outputLevel, 0, 'Ride ' + view.name + ' has zero output before a gesture');
        await main.evaluate(() => document.getElementById('gate').scrollIntoView({block: 'start', behavior: 'instant'}));
        await delay(main, 180);
        const clearance = await mainActionClearance(main);
        assert.equal(clearance.centerHit, true, 'Ride ' + view.name + ' Fire center is the actual hit target at the Gate anchor');
        assert.equal(clearance.overlap.width * clearance.overlap.height, 0, 'Ride ' + view.name + ' Fire bounds do not overlap fixed bay navigation');
        assert.ok(clearance.verticalClearance >= 0, `Ride ${view.name} Fire has nonnegative navigation clearance; measured ${clearance.verticalClearance}px`);
        assert.ok(clearance.action.left >= 0 && clearance.action.top >= 0 && clearance.action.right <= clearance.viewport.width && clearance.action.bottom <= clearance.viewport.height,
          'Ride ' + view.name + ' Fire bounds remain inside the viewport at the Gate anchor');
        await main.screenshot({path: shot('main-' + view.name + '-live')});

        const part = await openPage(context, 'layout-part-' + view.name);
        await part.goto(site('parts/gate.html'), {waitUntil: 'networkidle'}); await waitPart(part);
        const standalone = await partState(part); assertCommonGateState(standalone, 'Part ' + view.name);
        assert.equal(standalone.ticker, 1, 'Part ' + view.name + ' uses the one shared ticker in Full');
        assert.equal(standalone.title, 'Gate');
        assert.match(standalone.source, /src\/41-gate\.js/);
        assert.equal(standalone.pngEnabled, true); assert.equal(standalone.htmlEnabled, true);
        assert.match(standalone.assetNote, /assets\//);
        await part.locator('#stage').screenshot({path: shot('stage-' + view.name + '-live')});
        states.push({view: view.name, ride, clearance, part: standalone});
      } finally { await context.close(); }
    }
    assert.ok(assetResponses.some((entry) => entry.status === 200), 'Gate requests and receives sunset-strip.png');
    return states;
  });

  await scenario('Fire reports unavailable before the sunset strip loads, then launches after release', async () => {
    async function heldAssetPage(context, label, url) {
      const page = await openPage(context, label);
      let release;
      const released = new Promise((resolve) => { release = resolve; });
      await page.route('**/sunset-strip.png', async (route) => { await released; await route.continue(); });
      const requested = page.waitForRequest((request) => /\/assets\/sunset-strip\.png(?:$|\?)/.test(request.url()), {timeout: 10000});
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      await requested;
      return {page, release};
    }

    const receipts = {};
    const partContext = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    let releasePart = () => {};
    try {
      const held = await heldAssetPage(partContext, 'part-held-asset', site('parts/gate.html')); releasePart = held.release;
      const page = held.page;
      await page.waitForFunction(() => !!window.BONEYARD_PART?.handle && typeof BONEYARD_PART.handle.launch === 'function');
      await page.evaluate(() => { window.__heldPartEvents = 0; addEventListener('boneyard:gate', () => window.__heldPartEvents++); });
      const fire = page.getByRole('button', {name: 'Fire gate', exact: true});
      const stateBefore = await page.evaluate(() => BONEYARD_PART.handle.state);
      await fire.click();
      const unavailable = await page.evaluate(() => ({
        status: document.querySelector('#status[role="status"]')?.textContent,
        feedback: document.querySelector('#module-actions button')?.dataset.state || null,
        events: window.__heldPartEvents,
        gateEnergy: Number(BONEYARD_PART.ctx.share.gateEnergy) || 0,
        state: BONEYARD_PART.handle.state,
      }));
      assert.deepEqual(unavailable, {status: 'Gate is not ready yet.', feedback: null, events: 0, gateEnergy: 0, state: stateBefore});
      releasePart(); await waitPart(page);
      const before = await canvasFrame(page, '#part');
      await fire.click(); await page.waitForFunction(() => document.querySelector('#module-actions button')?.dataset.state === 'ok');
      const durations = factoryDurations(await page.evaluate(() => ({...BONEYARD_PART.params})));
      await delay(page, durations.charge * 450);
      const after = await canvasFrame(page, '#part');
      receipts.part = {unavailable, readyDiff: requireVisibleChange(before, after, 'released standalone Fire')};
    } finally { releasePart(); await partContext.close(); }

    const rideContext = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    let releaseRide = () => {};
    try {
      const held = await heldAssetPage(rideContext, 'main-held-asset', site('#gate')); releaseRide = held.release;
      const page = held.page;
      await page.waitForFunction(() => {
        const gate = window.BONEYARD_RIDE?.bays?.find((bay) => bay.slug === 'gate');
        return !!gate?.m?.handle && typeof gate.m.handle.launch === 'function';
      });
      await page.evaluate(() => { window.__heldRideEvents = 0; addEventListener('boneyard:gate', () => window.__heldRideEvents++); });
      const fire = page.locator('.bay-launch[data-slug="gate"]');
      const stateBefore = await page.evaluate(() => BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m.handle.state);
      await fire.click();
      const unavailable = await page.evaluate(() => ({
        status: document.querySelector('#gate .action-status[role="status"]')?.textContent,
        feedback: document.querySelector('.bay-launch[data-slug="gate"]')?.classList.contains('is-fired'),
        events: window.__heldRideEvents,
        gateEnergy: Number(BONEYARD_RIDE.ctx.share.gateEnergy) || 0,
        state: BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m.handle.state,
      }));
      assert.deepEqual(unavailable, {status: 'Gate is not ready yet.', feedback: false, events: 0, gateEnergy: 0, state: stateBefore});
      releaseRide(); await waitMain(page);
      await fire.click();
      const durations = factoryDurations(await page.evaluate(() => ({...BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m.params})));
      await delay(page, durations.charge * 450);
      const ready = await page.evaluate(() => ({
        status: document.querySelector('#gate .action-status[role="status"]')?.textContent,
        gateEnergy: Number(BONEYARD_RIDE.ctx.share.gateEnergy) || 0,
      }));
      assert.equal(ready.status, 'Gate firing.'); assert.ok(ready.gateEnergy > 0, 'released ride Fire enters charge');
      receipts.ride = {unavailable, ready};
    } finally { releaseRide(); await rideContext.close(); }
    return receipts;
  });

  await scenario('actual keyboard Fire runs a bounded, visible, repeatable Full flight', async () => {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    try {
      const page = await openPage(context, 'part-full-flight');
      await page.goto(site('parts/gate.html'), {waitUntil: 'networkidle'}); await waitPart(page);
      const durations = factoryDurations(await page.evaluate(() => ({...BONEYARD_PART.params})));
      const fire = page.getByRole('button', {name: 'Fire gate', exact: true});
      const idleStart = await canvasFrame(page, '#part');
      await delay(page, durations.charge * 550);
      const live = await canvasFrame(page, '#part'), idleDrift = frameDiff(idleStart, live);
      await page.locator('#stage').screenshot({path: shot('stage-desktop-live')});
      await fire.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#module-actions button')?.dataset.state === 'ok');

      await delay(page, durations.charge * 550);
      const charge = await canvasFrame(page, '#part');
      await page.locator('#stage').screenshot({path: shot('stage-desktop-charge')});
      await delay(page, durations.charge * 450 + durations.travel * 520);
      const traversal = await canvasFrame(page, '#part');
      await page.locator('#stage').screenshot({path: shot('stage-desktop-traversal')});
      await delay(page, durations.travel * 480 + durations.recovery * 1000 + 220);
      const settled = await canvasFrame(page, '#part');
      await page.locator('#stage').screenshot({path: shot('stage-desktop-settled')});

      const liveToCharge = requireVisibleChange(live, charge, 'Full charge');
      const liveToTraversal = requireVisibleChange(live, traversal, 'Full traversal');
      assert.ok(liveToCharge.meanAbsRgb > idleDrift.meanAbsRgb * 1.2 + 0.05,
        `Full charge change must exceed same-duration idle drift (charge ${liveToCharge.meanAbsRgb}, idle ${idleDrift.meanAbsRgb})`);
      await fire.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#module-actions button')?.dataset.state === 'ok');
      await delay(page, durations.charge * 550);
      const repeat = await canvasFrame(page, '#part');
      const repeatChange = requireVisibleChange(settled, repeat, 'repeat charge after the factory settle interval');
      return {durations, idleStart: frameMeta(idleStart), live: frameMeta(live), charge: frameMeta(charge), traversal: frameMeta(traversal), settled: frameMeta(settled), repeat: frameMeta(repeat), diffs: {idleDrift, liveToCharge, liveToTraversal, repeatChange}};
    } finally { await context.close(); }
  });

  await scenario('normal-rate module JavaScript CPU stays inside the documented desktop budget', async () => {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    try {
      const page = await openPage(context, 'part-cpu');
      await page.goto(site('parts/gate.html'), {waitUntil: 'networkidle'}); await waitPart(page);
      await page.getByLabel('Designed still', {exact: true}).check();
      await page.waitForFunction(() => BONEYARD.Ticker.size === 0);
      const paced = await page.evaluate(async () => {
        const part = BONEYARD_PART, handle = part.handle, ctx = part.ctx;
        const pointer = Object.assign({}, ctx.pointer, {nx: 0.5, ny: 0.5, present: false, down: false});
        const canvas = document.getElementById('part'), stage = document.getElementById('stage').getBoundingClientRect();
        const charge = Number(part.params.chargeTime), travel = Number(part.params.travelTime), recovery = Number(part.params.recoveryTime);
        const sequence = charge + travel + recovery;
        const buckets = () => ({charge: {cost: [], cadence: []}, travel: {cost: [], cadence: []}, recovery: {cost: [], cadence: []}, settled: {cost: [], cadence: []}});
        const intervals = buckets(), costs = [], cadence = [];
        const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        const phase = (elapsed) => elapsed <= charge ? 'charge' : elapsed <= charge + travel ? 'travel' : elapsed <= sequence ? 'recovery' : 'settled';
        function stats(values) {
          const sorted = values.slice().sort((a, b) => a - b), sum = sorted.reduce((total, value) => total + value, 0);
          return {samples: sorted.length, meanMs: sum / sorted.length, p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)], maxMs: sorted.at(-1)};
        }
        ctx.dial = 'full';
        let t = 0, previous = performance.now();
        for (let i = 0; i < 30; i++) {
          const stamp = await nextFrame(), dt = Math.min(0.05, Math.max(1 / 1000, (stamp - previous) / 1000));
          previous = stamp; t += dt; handle.tick(dt, t, 0, pointer);
        }
        const launchAccepted = handle.launch() !== false;
        let elapsed = 0;
        while (elapsed < sequence + 1) {
          const stamp = await nextFrame(), cadenceMs = stamp - previous;
          const dt = Math.min(0.05, Math.max(1 / 1000, cadenceMs / 1000));
          previous = stamp; elapsed += dt; t += dt;
          const start = performance.now(); handle.tick(dt, t, 0, pointer); const costMs = performance.now() - start;
          const label = phase(elapsed);
          costs.push(costMs); cadence.push(cadenceMs); intervals[label].cost.push(costMs); intervals[label].cadence.push(cadenceMs);
        }
        ctx.dial = 'still'; handle.still(t);
        return {
          mode: 'requestAnimationFrame-paced normal-rate calls', warmups: 30, measured: costs.length, progress: 0, launchAccepted,
          configuredSeconds: {charge, travel, recovery, postSettle: 1},
          actualElapsedSeconds: elapsed,
          total: {costMs: stats(costs), cadenceMs: stats(cadence)},
          intervals: Object.fromEntries(Object.entries(intervals).map(([key, values]) => [key, {costMs: stats(values.cost), cadenceMs: stats(values.cadence)}])),
          backing: [canvas.width, canvas.height], stageCss: [stage.width, stage.height], tickerAfter: BONEYARD.Ticker.size,
        };
      });
      await page.evaluate(() => { window.__gatePacedCpuHandle = BONEYARD_PART.handle; });
      await page.getByRole('button', {name: 'Reset', exact: true}).click();
      await page.waitForFunction(() => BONEYARD_PART.handle && BONEYARD_PART.handle !== window.__gatePacedCpuHandle && BONEYARD.Ticker.size === 0);
      const stress = await page.evaluate(() => {
        const part = BONEYARD_PART, handle = part.handle, ctx = part.ctx;
        const pointer = Object.assign({}, ctx.pointer, {nx: 0.5, ny: 0.5, present: false, down: false});
        const charge = Number(part.params.chargeTime), travel = Number(part.params.travelTime), recovery = Number(part.params.recoveryTime);
        const sequence = charge + travel + recovery, dt = 1 / 60;
        const intervals = {charge: [], travel: [], recovery: [], settled: []}, costs = [];
        function stats(values) {
          const sorted = values.slice().sort((a, b) => a - b), sum = sorted.reduce((total, value) => total + value, 0);
          return {samples: sorted.length, meanMs: sum / sorted.length, p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)], maxMs: sorted.at(-1)};
        }
        ctx.dial = 'full'; let t = 0;
        for (let i = 0; i < 30; i++) { t += dt; handle.tick(dt, t, 0, pointer); }
        const launchAccepted = handle.launch() !== false, measured = Math.ceil((sequence + 1) / dt);
        for (let i = 0; i < measured; i++) {
          const elapsed = (i + 1) * dt;
          t += dt; const start = performance.now(); handle.tick(dt, t, 0, pointer); const cost = performance.now() - start;
          const label = elapsed <= charge ? 'charge' : elapsed <= charge + travel ? 'travel' : elapsed <= sequence ? 'recovery' : 'settled';
          costs.push(cost); intervals[label].push(cost);
        }
        ctx.dial = 'still'; handle.still(t);
        return {
          mode: 'back-to-back fixed-dt stress calls with no frame pacing', budgetEvidence: false,
          warmups: 30, measured, dtSeconds: dt, progress: 0, launchAccepted,
          configuredSeconds: {charge, travel, recovery, postSettle: 1},
          total: {costMs: stats(costs)},
          intervals: Object.fromEntries(Object.entries(intervals).map(([key, values]) => [key, {costMs: stats(values)}])),
          tickerAfter: BONEYARD.Ticker.size,
        };
      });
      const cpu = {paced, stress};
      const samples = [paced.total.costMs, paced.total.cadenceMs, ...Object.values(paced.intervals).flatMap((interval) => [interval.costMs, interval.cadenceMs]), stress.total.costMs, ...Object.values(stress.intervals).map((interval) => interval.costMs)];
      for (const sample of samples) {
        for (const key of ['meanMs', 'p95Ms', 'maxMs']) sample[key] = Number(sample[key].toFixed(3));
      }
      assert.equal(paced.tickerAfter, 0); assert.equal(stress.tickerAfter, 0);
      assert.equal(paced.launchAccepted, true, 'ready Full Gate accepts the paced launch choreography');
      assert.equal(stress.launchAccepted, true, 'ready Full Gate accepts the stress launch choreography');
      assert.ok(Object.values(paced.intervals).every((interval) => interval.costMs.samples > 0 && interval.cadenceMs.samples > 0), 'paced CPU receipt samples cost and actual cadence for every configured launch interval');
      assert.ok(Object.values(stress.intervals).every((interval) => interval.costMs.samples > 0), 'stress CPU receipt samples every configured launch interval');
      assert.ok(paced.total.costMs.meanMs < 4,
        `requestAnimationFrame-paced Gate launch mean synchronous JS/Canvas tick cost ${paced.total.costMs.meanMs} ms does not stay below the 4 ms contract budget; receipt ${JSON.stringify(cpu)}`);
      return cpu;
    } finally { await context.close(); }
  });

  let exportReceipt = null;
  exportReceipt = await scenario('Still cancellation, authored Fire, PNG, PARAMS, HTML, and pagehide cleanup work', async () => {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, acceptDownloads: true});
    try {
      const page = await openPage(context, 'part-still-exports');
      await page.goto(site('parts/gate.html'), {waitUntil: 'networkidle'}); await waitPart(page);
      const durations = factoryDurations(await page.evaluate(() => ({...BONEYARD_PART.params})));
      await page.evaluate(() => { window.__gateTransitEvents = []; addEventListener('boneyard:gate', (event) => window.__gateTransitEvents.push(event.detail || {})); });
      const fire = page.getByRole('button', {name: 'Fire gate', exact: true});
      await fire.click(); await delay(page, durations.charge * 300);
      await page.getByLabel('Designed still', {exact: true}).check();
      await page.waitForFunction(() => BONEYARD.Ticker.size === 0);
      const stillA = await canvasFrame(page, '#part');
      await page.locator('#stage').screenshot({path: shot('stage-desktop-still')});
      await delay(page, Math.max(250, durations.charge * 1000 + 100));
      const stillB = await canvasFrame(page, '#part');
      assert.equal(frameMeta(stillB).sha256, frameMeta(stillA).sha256, 'switching to Still cancels motion and freezes the authored frame');
      assert.equal(await page.evaluate(() => window.__gateTransitEvents.length), 0, 'canceled charge emits no traversal event');

      await fire.click();
      await page.waitForFunction(() => document.querySelector('#module-actions button')?.dataset.state === 'ok');
      const fired = await canvasFrame(page, '#part');
      const stillFireChange = requireVisibleChange(stillA, fired, 'Still Fire authored frame');
      assert.equal(await page.evaluate(() => BONEYARD.Ticker.size), 0, 'Still Fire starts no ticker');
      await delay(page, 260);
      const firedLater = await canvasFrame(page, '#part');
      assert.equal(frameMeta(firedLater).sha256, frameMeta(fired).sha256, 'Still Fire is synchronous and stable');
      await page.locator('#stage').screenshot({path: shot('stage-desktop-still-fired')});

      const firedBacking = fired.source.slice();
      await page.setViewportSize({width: 900, height: 1200});
      await page.waitForFunction(([w, h]) => { const canvas = document.getElementById('part'); return canvas.width !== w || canvas.height !== h; }, firedBacking);
      assert.equal(await page.evaluate(() => BONEYARD.Ticker.size), 0, 'Still Fire portrait resize starts no ticker');
      await page.locator('#stage').screenshot({path: shot('stage-portrait-still-fired')});
      await page.setViewportSize({width: 1440, height: 900});
      await page.waitForFunction(([w, h]) => { const canvas = document.getElementById('part'); return canvas.width === w && canvas.height === h; }, firedBacking);
      const retained = await canvasFrame(page, '#part');
      assert.equal(frameMeta(retained).sha256, frameMeta(fired).sha256, 'Still Fire composition survives orientation resize and return');
      requireVisibleChange(stillA, retained, 'retained Still Fire composition');
      assert.equal(await page.evaluate(() => BONEYARD.Ticker.size), 0, 'resized Still Fire remains ticker-free');

      const selectedDataUrl = await page.locator('#part').evaluate((canvas) => canvas.toDataURL('image/png'));
      const pngDownloadPromise = page.waitForEvent('download');
      await page.getByRole('button', {name: 'Save PNG', exact: true}).click();
      const pngDownload = await pngDownloadPromise;
      const pngPath = path.join(downloads, 'gate-still-fired.png');
      await pngDownload.saveAs(pngPath);
      const pngBytes = await fs.readFile(pngPath);
      const pngPixels = await compareDownloadedPng(page, selectedDataUrl, pngBytes);
      assert.equal(pngPixels.mismatchPixels, 0, 'decoded Save PNG pixels equal the selected Still Fire frame');

      const disclosure = page.locator('#params-disclosure');
      if (!(await disclosure.evaluate((node) => node.open))) await disclosure.locator('summary').click();
      const gain = page.locator('input[data-param="gain"]');
      assert.equal(await gain.getAttribute('data-param'), 'gain');
      const gainBefore = await gain.inputValue(), frameBeforeGain = await canvasFrame(page, '#part');
      await gain.focus();
      for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowRight');
      const gainAfter = await gain.inputValue(), frameAfterGain = await canvasFrame(page, '#part');
      assert.notEqual(gainAfter, gainBefore, 'keyboard changes the data-param=gain slider');
      assert.equal(Number(gainAfter), await page.evaluate(() => BONEYARD_PART.params.gain));
      const gainChange = requireVisibleChange(frameBeforeGain, frameAfterGain, 'keyboard gain change', {mean: 0.04, percent: 0.08});
      await page.locator('#stage').screenshot({path: shot('stage-desktop-still-fired-gain')});

      const htmlDownloadPromise = page.waitForEvent('download');
      const expectedParams = await page.evaluate(() => ({...BONEYARD_PART.params}));
      await page.getByRole('button', {name: 'Save HTML', exact: true}).click();
      const htmlDownload = await htmlDownloadPromise;
      const htmlPath = path.join(downloads, 'gate-configured.html');
      await htmlDownload.saveAs(htmlPath);
      const source = await fs.readFile(htmlPath, 'utf8'), config = configFromHtml(source);
      assert.equal(config.slug, 'gate'); assert.equal(config.motion, 'still'); assert.equal(Number(config.params.gain), Number(gainAfter));
      assert.deepEqual(config.params, expectedParams, 'Save HTML persists every factory PARAMS key and configured value');
      assert.match(source, /src\/41-gate\.js/); assert.match(source, /slug:\s*['"]gate['"]/); assert.match(source, /title:\s*['"]Gate['"]/);
      assert.match(source, /sunset-strip\.png/); assert.match(source, /id=["']save-png["']/); assert.match(source, /id=["']save-html["']/);

      await page.getByLabel('Designed still', {exact: true}).uncheck();
      await page.waitForFunction(() => BONEYARD.Ticker.size > 0);
      await fire.click();
      const beforePartPagehide = await page.evaluate(() => ({
        handle: !!window.BONEYARD_PART?.handle,
        ticker: BONEYARD.Ticker.size,
        moduleActions: document.getElementById('module-actions').children.length,
        statefulButtons: document.querySelectorAll('button[data-state]').length,
      }));
      assert.equal(beforePartPagehide.handle, true); assert.ok(beforePartPagehide.ticker > 0);
      assert.ok(beforePartPagehide.moduleActions > 0); assert.ok(beforePartPagehide.statefulButtons > 0);
      const pagehideKey = '__boneyard_gate_part_pagehide';
      await page.evaluate((key) => {
        sessionStorage.removeItem(key);
        addEventListener('pagehide', () => sessionStorage.setItem(key, JSON.stringify({
          handle: !!window.BONEYARD_PART?.handle,
          ticker: BONEYARD.Ticker.size,
          moduleActions: document.getElementById('module-actions')?.children.length,
          statefulButtons: document.querySelectorAll('button[data-state]').length,
        })), {once: true});
      }, pagehideKey);
      await page.goto(site('parts/gate.html?cleanup=1'), {waitUntil: 'networkidle'}); await waitPart(page);
      const cleanup = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), pagehideKey);
      assert.deepEqual(cleanup, {handle: false, ticker: 0, moduleActions: 0, statefulButtons: 0}, 'actual pagehide destroys the part and clears transient controls');

      return {htmlPath, pngPath, configuredGain: Number(gainAfter), config, expectedParams, stillFireChange, retainedAfterResize: frameMeta(retained), gainChange, pngPixels, beforePartPagehide, cleanup};
    } finally { await context.close(); }
  });

  if (exportReceipt) {
    await scenario('downloaded HTML lifts with relative assets and preserves config and Fire', async () => {
      await fs.mkdir(liftDir, {recursive: true});
      await fs.cp(path.join(root, 'assets'), path.join(liftDir, 'assets'), {recursive: true});
      const liftedName = 'gate-configured.html';
      await fs.copyFile(exportReceipt.htmlPath, path.join(liftDir, liftedName));
      const serving = await staticServer(liftDir); liftServer = serving.server;
      allowedOrigins.add(new URL(serving.base).origin);
      const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
      try {
        const page = await openPage(context, 'lifted-gate');
        await page.goto(serving.base + liftedName, {waitUntil: 'networkidle'}); await waitPart(page);
        const state = await partState(page);
        assert.equal(state.dial, 'still'); assert.equal(state.ticker, 0); assert.equal(state.overflow, false);
        assert.equal(await page.evaluate(() => BONEYARD_PART.params.gain), exportReceipt.configuredGain);
        assert.deepEqual(await page.evaluate(() => ({...BONEYARD_PART.params})), exportReceipt.expectedParams, 'lifted HTML restores every persisted PARAMS key');
        const embedded = await page.locator('#boneyard-part-config').textContent();
        assert.equal(JSON.parse(embedded).params.gain, exportReceipt.configuredGain);
        const before = await canvasFrame(page, '#part');
        const fire = page.getByRole('button', {name: 'Fire gate', exact: true});
        await fire.click(); await page.waitForFunction(() => document.querySelector('#module-actions button')?.dataset.state === 'ok');
        const stillFired = await canvasFrame(page, '#part');
        const stillDiff = requireVisibleChange(before, stillFired, 'lifted Still Fire');
        assert.equal(await page.evaluate(() => BONEYARD.Ticker.size), 0);
        await page.getByLabel('Designed still', {exact: true}).uncheck();
        await page.waitForFunction(() => BONEYARD.Ticker.size > 0);
        const live = await canvasFrame(page, '#part');
        const durations = factoryDurations(await page.evaluate(() => ({...BONEYARD_PART.params})));
        await fire.click(); await delay(page, durations.charge * 550);
        const liveFired = await canvasFrame(page, '#part');
        const liveDiff = requireVisibleChange(live, liveFired, 'lifted Full Fire');
        await page.locator('#stage').screenshot({path: shot('stage-lifted-configured-fire')});
        assert.ok(assetResponses.some((entry) => entry.label === 'lifted-gate' && entry.status === 200), 'lifted Gate loads sunset-strip.png from adjacent assets/');
        return {state, persistedGain: exportReceipt.configuredGain, stillDiff, liveDiff, liftBase: serving.base};
      } finally {
        await context.close();
        await new Promise((resolve) => liftServer.close(resolve)); liftServer = null;
      }
    });
  } else {
    report.failures.push({name: 'downloaded HTML lifts with relative assets and preserves config and Fire', error: 'Skipped because the export scenario did not produce HTML.'});
  }

  await scenario('main Full Fire starts sound, traverses once, and respects mute and Still', async () => {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    try {
      const page = await openPage(context, 'main-sound');
      await page.goto(site('#gate'), {waitUntil: 'networkidle'}); await waitMain(page);
      const initial = await mainState(page);
      assert.equal(initial.sound.on, true); assert.equal(initial.sound.context, null); assert.equal(initial.sound.playing, false); assert.equal(initial.sound.outputLevel, 0);
      const durations = factoryDurations(await page.evaluate(() => ({...BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m.params})));
      await page.evaluate(() => {
        window.__gateMainEvents = [];
        window.__gatePreDispatch = [];
        const originalDispatch = window.dispatchEvent;
        window.dispatchEvent = function (event) {
          if (event?.type === 'boneyard:gate') window.__gatePreDispatch.push({
            detail: event.detail || {},
            whooshes: BONEYARD_SOUND.stats.whooshes,
            atMs: performance.now(),
          });
          return originalDispatch.apply(this, arguments);
        };
        addEventListener('boneyard:gate', (event) => window.__gateMainEvents.push({
          detail: event.detail || {},
          atMs: performance.now(),
        }));
        addEventListener('boneyard:gate', () => {
          const entry = window.__gateMainEvents.at(-1);
          if (entry) entry.whooshesAfterHandlers = BONEYARD_SOUND.stats.whooshes;
        });
      });
      const fire = page.locator('.bay-launch[data-slug="gate"]');
      const whooshes0 = await page.evaluate(() => BONEYARD_SOUND.stats.whooshes);
      await fire.click();
      await delay(page, durations.charge * 450);
      const chargeCheckpoint = await page.evaluate(() => ({
        whooshes: BONEYARD_SOUND.stats.whooshes,
        transitEvents: window.__gateMainEvents.filter((event) => event.detail.phase === 'transit').length,
      }));
      assert.equal(chargeCheckpoint.whooshes, whooshes0, 'charge does not trigger the traversal voice early');
      assert.equal(chargeCheckpoint.transitEvents, 0, 'charge has not emitted the traversal event early');
      await page.screenshot({path: shot('main-desktop-charge')});
      await page.waitForFunction(() => BONEYARD_SOUND.playing, null, {timeout: 5000});
      await page.waitForFunction((before) => BONEYARD_SOUND.stats.whooshes > before, whooshes0, {timeout: Math.ceil((durations.charge + durations.travel + 3) * 1000)});
      await page.screenshot({path: shot('main-desktop-traversal')});
      const afterFirst = await page.evaluate(() => ({
        whooshes: BONEYARD_SOUND.stats.whooshes,
        events: window.__gateMainEvents.slice(),
        preDispatch: window.__gatePreDispatch.slice(),
        fired: document.querySelector('.bay-launch[data-slug="gate"]').classList.contains('is-fired'),
        status: document.querySelector('#gate .action-status').textContent,
        sound: {on: BONEYARD_SOUND.on, playing: BONEYARD_SOUND.playing, context: BONEYARD_SOUND.context?.state || null},
      }));
      assert.equal(afterFirst.whooshes, whooshes0 + 1, 'one Full traversal adds exactly one whoosh');
      const transitEvents = afterFirst.events.filter((event) => event.detail.phase === 'transit');
      assert.equal(transitEvents.length, 1, 'one Full traversal event is emitted');
      const preDispatchTransit = afterFirst.preDispatch.filter((event) => event.detail.phase === 'transit');
      assert.equal(preDispatchTransit.length, 1, 'one Gate transit reaches dispatch');
      assert.equal(preDispatchTransit[0].whooshes, whooshes0, 'no generic voice fires before the Gate traversal event is dispatched');
      assert.equal(transitEvents[0].whooshesAfterHandlers, whooshes0 + 1, 'the Gate traversal event starts exactly one voice');
      assert.equal(afterFirst.sound.on, true); assert.equal(afterFirst.sound.playing, true); assert.equal(afterFirst.sound.context, 'running');
      assert.equal(afterFirst.fired, false, 'brief visual button feedback has settled');
      assert.equal(afterFirst.status, 'Gate firing.', 'assistive Fire status remains announced after visual feedback settles');
      await delay(page, durations.total * 1000 + 180);
      await page.screenshot({path: shot('main-desktop-settled')});

      await page.getByRole('button', {name: 'Sound on', exact: true}).click();
      await page.waitForFunction(() => !BONEYARD_SOUND.on && !BONEYARD_SOUND.playing);
      const mutedWhooshes = await page.evaluate(() => BONEYARD_SOUND.stats.whooshes);
      await fire.click(); await delay(page, (durations.charge + durations.travel + 0.3) * 1000);
      const muted = await page.evaluate(() => ({on: BONEYARD_SOUND.on, playing: BONEYARD_SOUND.playing, whooshes: BONEYARD_SOUND.stats.whooshes}));
      assert.equal(muted.on, false); assert.equal(muted.playing, false); assert.equal(muted.whooshes, mutedWhooshes, 'muted Fire adds no whoosh');
      await delay(page, (durations.recovery + 0.2) * 1000);

      await setRideDial(page, 'Still');
      await page.waitForFunction(() => BONEYARD.Ticker.size === 0, null, {timeout: 4000});
      const beforeStill = await canvasFrame(page, '.room[data-slug="gate"] canvas');
      const eventsBeforeStill = await page.evaluate(() => window.__gateMainEvents.length);
      await fire.click();
      const afterStill = await canvasFrame(page, '.room[data-slug="gate"] canvas');
      const stillDiff = requireVisibleChange(beforeStill, afterStill, 'main Still Fire');
      assert.equal(await page.evaluate(() => BONEYARD.Ticker.size), 0, 'main Still Fire does not wake the host ticker');
      await page.mouse.move(700, 300);
      await delay(page, 80);
      assert.equal(await page.evaluate(() => BONEYARD.Ticker.size), 0, 'pointermove in Still does not wake the host ticker');
      await delay(page, (durations.charge + durations.travel + 0.3) * 1000);
      const still = await page.evaluate(() => ({events: window.__gateMainEvents.length, whooshes: BONEYARD_SOUND.stats.whooshes, ticker: BONEYARD.Ticker.size, soundOn: BONEYARD_SOUND.on}));
      assert.equal(still.events, eventsBeforeStill, 'Still Fire emits no traversal event');
      assert.equal(still.whooshes, mutedWhooshes, 'Still Fire adds no whoosh');
      assert.equal(still.ticker, 0); assert.equal(still.soundOn, false);
      await page.screenshot({path: shot('main-desktop-still-fired')});

      await setRideDial(page, 'Full');
      const pagehideKey = '__boneyard_gate_main_pagehide';
      await page.evaluate((key) => {
        sessionStorage.removeItem(key);
        addEventListener('pagehide', () => sessionStorage.setItem(key, JSON.stringify({
          autofly: window.BONEYARD_RIDE?.autofly,
          fired: document.querySelector('.bay-launch[data-slug="gate"]')?.classList.contains('is-fired'),
          status: document.querySelector('#gate .action-status')?.textContent,
        })), {once: true});
      }, pagehideKey);
      await fire.click(); await page.getByRole('button', {name: 'Start auto-fly', exact: true}).click();
      const beforeMainPagehide = await page.evaluate(() => ({
        autofly: BONEYARD_RIDE.autofly,
        fired: document.querySelector('.bay-launch[data-slug="gate"]').classList.contains('is-fired'),
        status: document.querySelector('#gate .action-status').textContent,
      }));
      assert.deepEqual(beforeMainPagehide, {autofly: true, fired: true, status: 'Gate firing.'});
      await page.goto(site('parts/gate.html?from=main-pagehide'), {waitUntil: 'networkidle'}); await waitPart(page);
      const cleanup = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), pagehideKey);
      assert.deepEqual(cleanup, {autofly: false, fired: false, status: ''}, 'main pagehide clears Auto-fly and launch feedback');
      return {initial: initial.sound, durations, whooshes0, chargeCheckpoint, afterFirst, muted, still, stillDiff, beforeMainPagehide, cleanup};
    } finally { await context.close(); }
  });

  await scenario('Calm Fire is visible and removes traversal punch and event', async () => {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    try {
      const page = await openPage(context, 'main-calm');
      await page.goto(site('#gate'), {waitUntil: 'networkidle'}); await waitMain(page);
      await setRideDial(page, 'Calm');
      await page.evaluate(() => { window.__gateCalmEvents = []; addEventListener('boneyard:gate', (event) => window.__gateCalmEvents.push(event.detail || {})); });
      const durations = factoryDurations(await page.evaluate(() => ({...BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m.params})));
      const before = await canvasFrame(page, '.room[data-slug="gate"] canvas');
      await page.locator('.bay-launch[data-slug="gate"]').click();
      await delay(page, (durations.charge + durations.travel * 0.5) * 1000);
      const active = await canvasFrame(page, '.room[data-slug="gate"] canvas');
      const diff = requireVisibleChange(before, active, 'Calm Fire');
      const calm = await page.evaluate(() => ({dial: BONEYARD_RIDE.ctx.dial, punch: BONEYARD_RIDE.ctx.share.punch || 0, shake: BONEYARD_RIDE.ctx.share.shake || null, events: window.__gateCalmEvents.length, whooshes: BONEYARD_SOUND.stats.whooshes}));
      assert.equal(calm.dial, 'calm'); assert.ok(Math.abs(calm.punch) < 0.01); assert.equal(calm.shake, null);
      assert.equal(calm.events, 0, 'Calm has no Full traversal event'); assert.equal(calm.whooshes, 0, 'Calm has no Full traversal whoosh');
      await page.screenshot({path: shot('main-desktop-calm-fire')});
      return {durations, diff, calm};
    } finally { await context.close(); }
  });

  await scenario('scrolling Gate off during charge deactivates shared energy without remounting or resuming', async () => {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    try {
      const page = await openPage(context, 'main-deactivate');
      await page.goto(site('#gate'), {waitUntil: 'networkidle'}); await waitMain(page);
      const setup = await page.evaluate(() => {
        const gate = BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate');
        window.__gateDeactivateHandle = gate.m.handle;
        window.__gateDeactivateEvents = [];
        addEventListener('boneyard:gate', (event) => window.__gateDeactivateEvents.push(event.detail || {}));
        return {
          top: gate.el.offsetTop,
          height: gate.el.offsetHeight,
          current: BONEYARD_RIDE.current,
          currentSlug: BONEYARD_RIDE.bays[BONEYARD_RIDE.current]?.slug,
          hasDeactivate: typeof gate.m.handle.deactivate === 'function',
        };
      });
      assert.equal(setup.currentSlug, 'gate'); assert.equal(setup.hasDeactivate, true, 'Gate exposes optional deactivate lifecycle hook');
      const durations = factoryDurations(await page.evaluate(() => ({...BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m.params})));
      await page.locator('.bay-launch[data-slug="gate"]').click();
      await delay(page, durations.charge * 400);
      const activeShare = await page.evaluate(() => {
        const share = BONEYARD_RIDE.ctx.share;
        return {gateEnergy: Number(share.gateEnergy) || 0, warp: Number(share.warp) || 0, punch: Number(share.punch) || 0, events: window.__gateDeactivateEvents.length};
      });
      assert.ok(activeShare.gateEnergy > 0 || activeShare.warp > 0 || activeShare.punch > 0, 'charge owns visible shared energy before deactivation');
      assert.equal(activeShare.events, 0, 'scroll starts before traversal');

      const target = setup.top + setup.height * 0.37;
      const startY = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, target - startY);
      await page.waitForFunction(({top, height}) => {
        const progress = (scrollY - top) / height;
        const gate = BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate');
        return progress > 0.34 && progress < 0.45 && gate.m?.state === 'off';
      }, {top: setup.top, height: setup.height}, {timeout: 5000});
      const off = await page.evaluate(({top, height}) => {
        const gate = BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate'), share = BONEYARD_RIDE.ctx.share;
        return {
          current: BONEYARD_RIDE.current,
          currentSlug: BONEYARD_RIDE.bays[BONEYARD_RIDE.current]?.slug,
          progress: (scrollY - top) / height,
          mounted: !!gate.m,
          sameHandle: gate.m?.handle === window.__gateDeactivateHandle,
          roomState: gate.m?.state,
          share: {
            gateEnergy: Number(share.gateEnergy) || 0,
            warp: Number(share.warp) || 0,
            warpAt: Number(share.warpAt) || 0,
            punch: Number(share.punch) || 0,
            punchAt: Number(share.punchAt) || 0,
            shake: share.shake || null,
            flashAt: Number(share.flashAt) || 0,
          },
          now: performance.now(),
          events: window.__gateDeactivateEvents.length,
        };
      }, {top: setup.top, height: setup.height});
      assert.equal(off.current, setup.current, '0.37 bay progress retains the current bay index');
      assert.equal(off.currentSlug, 'gate', '0.37 bay progress still reports Gate as current');
      assert.equal(off.mounted, true); assert.equal(off.sameHandle, true); assert.equal(off.roomState, 'off');
      assert.deepEqual({
        gateEnergy: off.share.gateEnergy,
        warp: off.share.warp,
        warpAt: off.share.warpAt,
        punchAt: off.share.punchAt,
        shake: off.share.shake,
      }, {gateEnergy: 0, warp: 0, warpAt: 0, punchAt: 0, shake: null}, 'deactivate clears Gate-owned shared energy and punch stamp');
      assert.ok(off.share.punch === 0 || (off.share.flashAt > 0 && off.now - off.share.flashAt < 500),
        'any immediate un-stamped punch belongs to the bounded host switch flash');
      assert.equal(off.events, 0);
      await page.screenshot({path: shot('main-desktop-gate-deactivated')});
      await page.waitForFunction(() => {
        const share = BONEYARD_RIDE.ctx.share;
        return Math.abs(Number(share.punch) || 0) < 0.01 && !share.shake && (Number(share.punchAt) || 0) === 0;
      }, null, {timeout: 2500});
      const settledShare = await page.evaluate(() => {
        const share = BONEYARD_RIDE.ctx.share;
        return {gateEnergy: Number(share.gateEnergy) || 0, warp: Number(share.warp) || 0, punch: Number(share.punch) || 0, punchAt: Number(share.punchAt) || 0, shake: share.shake || null};
      });
      assert.deepEqual(settledShare, {gateEnergy: 0, warp: 0, punch: 0, punchAt: 0, shake: null}, 'Gate state remains clear after the host switch flash settles');

      const yOff = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, setup.top - yOff);
      await page.waitForFunction(() => {
        const gate = BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate');
        return Math.abs(scrollY - gate.el.offsetTop) < 3 && gate.m?.state === 'on' && gate.m.handle === window.__gateDeactivateHandle;
      }, null, {timeout: 5000});
      const eventsOnReturn = await page.evaluate(() => window.__gateDeactivateEvents.length);
      await delay(page, (durations.charge + durations.travel + 0.35) * 1000);
      const returned = await page.evaluate(() => {
        const gate = BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate');
        return {
          current: BONEYARD_RIDE.current,
          currentSlug: BONEYARD_RIDE.bays[BONEYARD_RIDE.current]?.slug,
          sameHandle: gate.m?.handle === window.__gateDeactivateHandle,
          roomState: gate.m?.state,
          events: window.__gateDeactivateEvents.length,
        };
      });
      assert.equal(returned.current, setup.current); assert.equal(returned.currentSlug, 'gate'); assert.equal(returned.sameHandle, true); assert.equal(returned.roomState, 'on');
      assert.equal(returned.events, eventsOnReturn, 'returning on the same handle does not resume the canceled flight or emit transit');
      await page.screenshot({path: shot('main-desktop-gate-reactivated-idle')});
      return {setup, durations, activeShare, off, settledShare, returned};
    } finally { await context.close(); }
  });

  await scenario('phone coarse tap pauses Auto-fly, holds scroll, then native touch scrolls', async () => {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 1, hasTouch: true, isMobile: true});
    try {
      const page = await openPage(context, 'main-phone-interaction');
      await page.goto(site('#gate'), {waitUntil: 'networkidle'}); await waitMain(page);
      const fire = page.locator('.bay-launch[data-slug="gate"]');
      const touchAction = await page.evaluate(() => ({main: getComputedStyle(document.getElementById('row-main')).touchAction, fire: getComputedStyle(document.querySelector('.bay-launch[data-slug="gate"]')).touchAction}));
      assert.match(touchAction.main, /pan-y/); assert.match(touchAction.fire, /manipulation/);
      await page.getByRole('button', {name: 'Start auto-fly', exact: true}).tap();
      await page.waitForFunction(() => BONEYARD_RIDE.autofly);
      const before = await canvasFrame(page, '.room[data-slug="gate"] canvas');
      const yBefore = await page.evaluate(() => scrollY);
      await fire.tap();
      await page.waitForFunction(() => !BONEYARD_RIDE.autofly);
      await delay(page, 520);
      const yAfter = await page.evaluate(() => scrollY), fired = await canvasFrame(page, '.room[data-slug="gate"] canvas');
      assert.ok(Math.abs(yAfter - yBefore) < 2, `Fire moved outer scroll from ${yBefore} to ${yAfter}`);
      const diff = requireVisibleChange(before, fired, 'phone coarse Fire tap');
      await page.screenshot({path: shot('main-phone-coarse-fire')});

      const swipeStart = await page.evaluate(() => scrollY);
      await nativeTouchSwipe(context, page, {x: 20, y: 680}, {x: 20, y: 280});
      await delay(page, 650);
      const swipeEnd = await page.evaluate(() => scrollY);
      assert.ok(Math.abs(swipeEnd - swipeStart) > 60, `native touch swipe did not move the page (${swipeStart} to ${swipeEnd})`);
      return {touchAction, yBefore, yAfter, swipeStart, swipeEnd, diff};
    } finally { await context.close(); }
  });

  await scenario('resize and real destroy/remount paths preserve Gate without errors', async () => {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    try {
      const part = await openPage(context, 'part-lifecycle');
      await part.goto(site('parts/gate.html'), {waitUntil: 'networkidle'}); await waitPart(part);
      await part.evaluate(() => { window.__gateOldPartHandle = BONEYARD_PART.handle; });
      const beforePart = await partState(part);
      await part.setViewportSize({width: 1000, height: 700});
      await part.waitForFunction(([w, h]) => { const canvas = document.getElementById('part'); return canvas.width !== w || canvas.height !== h; }, beforePart.canvas.backing);
      const resizedPart = await partState(part);
      assert.notDeepEqual(resizedPart.canvas.backing, beforePart.canvas.backing);
      await part.getByRole('button', {name: 'Reset', exact: true}).click();
      await part.waitForFunction(() => BONEYARD_PART.handle && BONEYARD_PART.handle !== window.__gateOldPartHandle);
      assert.equal(await part.evaluate(() => BONEYARD.Ticker.size), 1);

      const ride = await openPage(context, 'main-lifecycle');
      await ride.goto(site('#gate'), {waitUntil: 'networkidle'}); await waitMain(ride);
      await ride.evaluate(() => { window.__gateOldRideHandle = BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m.handle; });
      const beforeRide = await mainState(ride);
      await ride.setViewportSize({width: 1100, height: 700}); await delay(ride, 180);
      const resizedRide = await mainState(ride); assert.notDeepEqual(resizedRide.canvas.backing, beforeRide.canvas.backing);
      await ride.evaluate(() => scrollTo({top: document.getElementById('shelf').offsetTop, behavior: 'instant'}));
      await ride.waitForFunction(() => !BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m, null, {timeout: 8000});
      await ride.evaluate(() => scrollTo({top: document.getElementById('gate').offsetTop, behavior: 'instant'}));
      await ride.waitForFunction(() => {
        const mounted = BONEYARD_RIDE.bays.find((bay) => bay.slug === 'gate').m;
        return !!mounted?.handle && mounted.handle !== window.__gateOldRideHandle;
      }, null, {timeout: 8000});
      await ride.screenshot({path: shot('main-desktop-remounted')});
      return {part: {before: beforePart.canvas, resized: resizedPart.canvas, remounted: true}, ride: {before: beforeRide.canvas, resized: resizedRide.canvas, destroyedOffscreen: true, remounted: true}};
    } finally { await context.close(); }
  });
} catch (error) {
  report.failures.push({name: 'verifier infrastructure', error: messageFor(error)});
} finally {
  if (liftServer) await new Promise((resolve) => liftServer.close(resolve));
  if (browser) await browser.close();
  report.assets = assetResponses;
  report.artifacts = {
    screenshots: await fs.readdir(shots).catch(() => []),
    downloads: await fs.readdir(downloads).catch(() => []),
    lift: await fs.readdir(liftDir).catch(() => []),
  };
  for (const [kind, issues] of Object.entries(report.browserIssues)) {
    if (issues.length) report.failures.push({name: 'browser issue: ' + kind, error: JSON.stringify(issues)});
  }
  report.passed = report.failures.length === 0;
  report.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'gate-checks.json'), JSON.stringify(report, null, 2) + '\n');
}

console.log(JSON.stringify({passed: report.passed, checks: report.checks.length, failures: report.failures.length, receiptDir: out, report: path.join(out, 'gate-checks.json')}, null, 2));
if (!report.passed) process.exitCode = 1;
