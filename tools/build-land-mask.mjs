#!/usr/bin/env node
// build-land-mask.mjs: bake a coarse land mask for the TERMINATOR bay (Elite-style dotted globe).
//
//   node tools/build-land-mask.mjs            (Node 22, global fetch, zero packages)
//
// Source: world-atlas 2.x land-110m.json (TopoJSON derived from Natural Earth 1:110m, public domain),
//   https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json
// Output: assets/land-mask.json
//   { source, fetched, license, width: 360, height: 180, encoding: "row-major bits, MSB first, base64",
//     lon0: -180, lat0: 90 (row 0 is the north edge; cell (r,c) covers lat 90-r-1..90-r, lon -180+c..-180+c+1),
//     bits: "<base64>" }
// A cell is land when its centre falls inside any land ring (even-odd scanline fill).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'land-mask.json');
const URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
const W = 360, H = 180;

async function getJSON(url, attempts = 5) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 500 * 2 ** i)); }
  }
  throw new Error('gave up on ' + url + ': ' + last?.message);
}

// TopoJSON: arcs are delta-encoded quantized points; transform scales them back to lon/lat.
function decodeArcs(topo) {
  const { scale, translate } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
  });
}
function ring(arcs, indices) {
  const pts = [];
  for (const i of indices) {
    const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    for (let k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]);
  }
  return pts;
}

const topo = await getJSON(URL);
const arcs = decodeArcs(topo);
const land = topo.objects.land;
const geoms = land.type === 'GeometryCollection' ? land.geometries : [land];
const rings = [];
for (const g of geoms) {
  if (g.type === 'Polygon') for (const r of g.arcs) rings.push(ring(arcs, r));
  else if (g.type === 'MultiPolygon') for (const p of g.arcs) for (const r of p) rings.push(ring(arcs, r));
}
console.log(`land-110m: ${rings.length} rings, ${rings.reduce((n, r) => n + r.length, 0)} points`);

// Scanline even-odd fill on cell centres.
const bits = new Uint8Array(Math.ceil((W * H) / 8));
let landCells = 0;
for (let r = 0; r < H; r++) {
  const lat = 90 - r - 0.5;
  const xs = [];
  for (const ring_ of rings) {
    for (let i = 0, n = ring_.length; i < n; i++) {
      const [x1, y1] = ring_[i], [x2, y2] = ring_[(i + 1) % n];
      if ((y1 <= lat && y2 > lat) || (y2 <= lat && y1 > lat)) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  xs.sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const c0 = Math.max(0, Math.ceil(xs[k] + 180 - 0.5)), c1 = Math.min(W - 1, Math.floor(xs[k + 1] + 180 - 0.5));
    for (let c = c0; c <= c1; c++) { const i = r * W + c; bits[i >> 3] |= 128 >> (i & 7); landCells++; }
  }
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  source: URL, fetched: new Date().toISOString().slice(0, 10),
  license: 'Natural Earth (public domain) via world-atlas 2 (ISC)',
  width: W, height: H, encoding: 'row-major bits, MSB first, base64', lon0: -180, lat0: 90,
  bits: Buffer.from(bits).toString('base64'),
}, null, 0));
// quick sanity: Tucson (32.2N, 110.9W) is land; mid-Pacific (0N, 160W) is sea
const at = (lat, lon) => { const r = Math.floor(90 - lat), c = Math.floor(lon + 180), i = r * W + c; return !!(bits[i >> 3] & (128 >> (i & 7))); };
console.log(`land cells ${landCells} of ${W * H} (${((100 * landCells) / (W * H)).toFixed(1)}%; Earth's land is about 29%)`);
console.log(`Tucson land=${at(32.2, -110.9)}  mid-Pacific land=${at(0, -160)}  Sahara land=${at(23, 10)}  wrote ${OUT}`);
if (!at(32.2, -110.9) || at(0, -160)) { console.error('sanity check failed'); process.exit(1); }
