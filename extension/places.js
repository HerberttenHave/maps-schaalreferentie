// Worldwide place lookup for "own references", shared by the extension popup and the web version.
// Countries and continents come from world.json (Natural Earth land outlines, so without the
// territorial waters that OpenStreetMap country borders include); everything else (regions, cities,
// islands, lakes, parks) comes from OpenStreetMap through Nominatim.
// project() returns the same structure as MSR_GEO.projectGeometries, but uses an azimuthal equidistant
// projection around the centre of the area, so Greenland or a whole continent keeps its true size and shape.
(function (root) {
  const R = 6371008.8;                       // mean earth radius in metres
  const RAD = Math.PI / 180;
  const NOMINATIM = 'https://nominatim.openstreetmap.org';

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  async function getJSON(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ---------- world.json (loaded on first use only) ----------
  let world = null;
  function loadWorld(url) {
    if (!world) {
      world = getJSON(url).then((doc) => {
        const byName = new Map(), byIso = new Map();
        for (const p of doc.places) {
          for (const a of p.a) if (!byName.has(a)) byName.set(a, p);
          if (p.iso) byIso.set(p.iso, p);
        }
        return { byName, byIso, source: doc.source };
      });
      world.catch(() => { world = null; });
    }
    return world;
  }
  function fromWorld(w, p, lang) {
    return {
      name: lang === 'en' ? p.en : p.nl, kind: p.kind, key: p.id,
      source: w.source,
      geoms: [{ type: 'MultiPolygon', coordinates: p.p }],
    };
  }

  // ---------- lookup ----------
  // Returns {name, kind, key, source, geoms} or null when no outline exists for the query.
  async function find(query, lang, worldUrl) {
    const key = norm(query);
    if (!key) return null;
    let w = null;
    try { w = await loadWorld(worldUrl); } catch (e) { w = null; }   // without world.json: OpenStreetMap only
    if (w && w.byName.has(key)) return fromWorld(w, w.byName.get(key), lang);

    const sp = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', addressdetails: '1', 'accept-language': lang });
    const hits = await getJSON(NOMINATIM + '/search?' + sp.toString());
    if (!hits.length) return null;
    const first = hits[0];
    if (w) {   // a country or continent under another spelling or language
      const cc = first.address && first.address.country_code;
      if (first.addresstype === 'country' && cc && w.byIso.has(cc)) return fromWorld(w, w.byIso.get(cc), lang);
      if (first.type === 'continent' && w.byName.has(norm(first.name))) return fromWorld(w, w.byName.get(norm(first.name)), lang);
    }
    const areas = hits.filter((h) => h.osm_type === 'relation' || h.osm_type === 'way');
    if (!areas.length) return null;
    // An island of the same name beats the municipality or province around it: administrative borders
    // on the coast include water, the island itself follows the coastline.
    const land = areas.find((h) => h.category === 'place' && /^(island|islet|archipelago)$/.test(h.type) &&
      norm(h.name) === norm(areas[0].name));
    const hit = land || areas[0];
    const bb = hit.boundingbox.map(Number);                        // [south, north, west, east]
    const span = Math.max(bb[1] - bb[0], bb[3] - bb[2]);
    const threshold = Math.min(0.05, Math.max(0.00002, span / 600));   // let the server thin out the outline
    const lp = new URLSearchParams({
      osm_ids: (hit.osm_type === 'relation' ? 'R' : 'W') + hit.osm_id,
      format: 'geojson', polygon_geojson: '1', polygon_threshold: threshold.toFixed(6), 'accept-language': lang,
    });
    const fc = await getJSON(NOMINATIM + '/lookup?' + lp.toString());
    const f = fc.features && fc.features[0];
    if (!f || !f.geometry || !/Polygon$/.test(f.geometry.type)) return null;
    return {
      name: hit.name || query, kind: hit.addresstype || hit.type || 'place', key: 'osm-' + hit.osm_type + '-' + hit.osm_id,
      source: 'OpenStreetMap (Nominatim), ' + hit.osm_type + ' ' + hit.osm_id + ': ' + hit.display_name,
      geoms: [f.geometry],
    };
  }

  // ---------- projection ----------
  function sphericalMean(rings) {
    let x = 0, y = 0, z = 0;
    for (const ring of rings) for (const c of ring) {
      const lo = c[0] * RAD, la = c[1] * RAD;
      x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
    }
    return [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];
  }
  function projector(lon0, lat0) {
    const l0 = lon0 * RAD, p0 = lat0 * RAD, s0 = Math.sin(p0), c0 = Math.cos(p0);
    return (c) => {
      const dl = c[0] * RAD - l0, p = c[1] * RAD, sp = Math.sin(p), cp = Math.cos(p);
      const cosc = Math.max(-1, Math.min(1, s0 * sp + c0 * cp * Math.cos(dl)));
      const ang = Math.acos(cosc);
      const k = ang < 1e-9 ? R : R * ang / Math.sin(ang);
      return [k * cp * Math.sin(dl), k * (c0 * sp - s0 * cp * Math.cos(dl))];
    };
  }
  function unproject(lon0, lat0, x, y) {
    const rho = Math.hypot(x, y);
    if (rho < 1e-6) return [lon0, lat0];
    const p0 = lat0 * RAD, c = rho / R, sc = Math.sin(c), cc = Math.cos(c);
    const lat = Math.asin(cc * Math.sin(p0) + y * sc * Math.cos(p0) / rho);
    const lon = lon0 * RAD + Math.atan2(x * sc, rho * Math.cos(p0) * cc - y * Math.sin(p0) * sc);
    return [lon / RAD, lat / RAD];
  }
  function ringArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length - 1; i < n; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    return a / 2;
  }
  function bounds(polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of polys) for (const p of poly[0]) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    return [x0, y0, x1, y1];
  }

  // geoms: GeoJSON Polygon/MultiPolygon geometries in lon/lat; geo: MSR_GEO (for simplify).
  function project(geoms, geo) {
    const src = [];
    for (const g of geoms) {
      if (!g) continue;
      if (g.type === 'Polygon') src.push(g.coordinates);
      else if (g.type === 'MultiPolygon') for (const p of g.coordinates) src.push(p);
    }
    if (!src.length) return null;
    // two passes: first around the mean of all points, then around the centre of the projected bounding box
    let origin = sphericalMean(src.map((p) => p[0]));
    let proj = projector(origin[0], origin[1]);
    let b = bounds(src.map((p) => [p[0].map(proj)]));
    origin = unproject(origin[0], origin[1], (b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    proj = projector(origin[0], origin[1]);
    b = bounds(src.map((p) => [p[0].map(proj)]));

    const size = Math.max(b[2] - b[0], b[3] - b[1]);
    const tol = Math.max(1, size / 1500);
    const minArea = (10 * tol) * (10 * tol);
    const round = size > 100000 ? (v) => Math.round(v) : (v) => Math.round(v * 10) / 10;
    const out = [];
    let largest = null, largestArea = 0;
    for (const poly of src) {
      const rings = [];
      let skip = false;
      poly.forEach((ring, i) => {
        if (skip) return;
        const pts = geo.simplify(ring.map(proj), tol);
        const area = Math.abs(ringArea(pts));
        if (i === 0 && area > largestArea && pts.length >= 4) { largestArea = area; largest = pts; }
        if (pts.length < 4 || area < minArea) { if (i === 0) skip = true; return; }
        rings.push(pts.map((p) => [round(p[0]), round(p[1])]));
      });
      if (!skip && rings.length) out.push(rings);
    }
    if (!out.length && largest) out.push([largest.map((p) => [round(p[0]), round(p[1])])]);   // a tiny atoll state
    if (!out.length) return null;
    const bb = bounds(out);
    return {
      polygons: out, bbox: bb,
      width_m: Math.round(bb[2] - bb[0]), height_m: Math.round(bb[3] - bb[1]),
      origin: [Math.round(origin[0] * 1e5) / 1e5, Math.round(origin[1] * 1e5) / 1e5], proj: 'aeqd',
    };
  }

  root.MSR_PLACES = { find, project, norm };
})(typeof window !== 'undefined' ? window : globalThis);
