// Node test of the address flow: node tools/test_pdok.js "Straat 1, Plaats"
// Runs the same geo.js and pdok.js code the popup uses, against the live PDOK services.
const path = require('path');
const geo = require(path.join(__dirname, '..', 'extension', 'geo.js'));
const pdok = require(path.join(__dirname, '..', 'extension', 'pdok.js'));
const fs = require('fs');

(async () => {
  const q = process.argv[2];
  if (!q) { console.error('usage: node test_pdok.js "adres"'); process.exit(2); }
  const g = await pdok.geocode(q);
  console.log('geocode:', g);
  if (!g) process.exit(1);
  const areas = await pdok.fetchAreas(g, geo);
  for (const a of areas) {
    const pts = a.polygons.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
    const marker = geo.markerFor(a, g.lon, g.lat);
    console.log(`${a.id.padEnd(14)} ${a.name.padEnd(28)} ${a.width_m} x ${a.height_m} m, ${a.polygons.length} polys, ${pts} pts, marker ${JSON.stringify(marker)}`);
  }
  // markers in the built-in references
  const w = {}; global.window = w;
  eval(fs.readFileSync(path.join(__dirname, '..', 'extension', 'references.js'), 'utf8'));
  for (const r of w.MSR_BUILTIN_REFERENCES) {
    const m = geo.markerFor(r, g.lon, g.lat);
    if (m) console.log('marker in', r.id, r.name, m);
  }
  const bytes = JSON.stringify(areas).length;
  console.log('storage.local payload:', Math.round(bytes / 1024), 'kB');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
