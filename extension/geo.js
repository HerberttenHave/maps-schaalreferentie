// Geometry helpers shared by the popup (address lookup) and the Node test.
// Projects GeoJSON lon/lat polygons to local metres around the bbox centre and simplifies them.
(function (root) {
  const M_LAT = 111132.0;
  const M_LON_EQ = 111320.0;

  function perpDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  // Douglas-Peucker, iterative.
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = 0, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = perpDist(pts[i], pts[s], pts[e]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }

  function ringArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length - 1; i < n; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    return a / 2;
  }

  // geoms: array of GeoJSON Polygon/MultiPolygon geometries in lon/lat.
  // Returns {polygons, bbox, width_m, height_m, origin}; coordinates in metres, x east, y north.
  function projectGeometries(geoms, tol) {
    const polys = [];
    for (const g of geoms) {
      if (!g) continue;
      if (g.type === 'Polygon') polys.push(g.coordinates);
      else if (g.type === 'MultiPolygon') for (const p of g.coordinates) polys.push(p);
    }
    if (!polys.length) return null;
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const poly of polys) for (const [lon, lat] of poly[0]) {
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    const lon0 = (minLon + maxLon) / 2, lat0 = (minLat + maxLat) / 2;
    const kx = M_LON_EQ * Math.cos(lat0 * Math.PI / 180), ky = M_LAT;
    const proj = (c) => [(c[0] - lon0) * kx, (c[1] - lat0) * ky];
    const sizeM = Math.max((maxLon - minLon) * kx, (maxLat - minLat) * ky);
    const t = tol != null ? tol : Math.max(1, sizeM / 1500);
    const minArea = (10 * t) * (10 * t);
    const out = [];
    for (const poly of polys) {
      const rings = [];
      let skip = false;
      poly.forEach((ring, i) => {
        if (skip) return;
        const pts = simplify(ring.map(proj), t);
        if (pts.length < 4 || Math.abs(ringArea(pts)) < minArea) { if (i === 0) skip = true; return; }
        rings.push(pts.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]));
      });
      if (!skip && rings.length) out.push(rings);
    }
    if (!out.length) return null;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const poly of out) for (const [x, y] of poly[0]) {
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    return {
      polygons: out,
      bbox: [bx0, by0, bx1, by1],
      width_m: Math.round(bx1 - bx0),
      height_m: Math.round(by1 - by0),
      origin: [lon0, lat0],
    };
  }

  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Local metre coordinates of a lon/lat point, or null when the point is not inside the reference.
  function markerFor(ref, lon, lat) {
    if (!ref || !ref.origin) return null;
    const [lon0, lat0] = ref.origin;
    const kx = M_LON_EQ * Math.cos(lat0 * Math.PI / 180);
    const x = (lon - lon0) * kx, y = (lat - lat0) * M_LAT;
    const b = ref.bbox;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return null;
    let inside = false;
    for (const poly of ref.polygons) {
      if (!inRing(x, y, poly[0])) continue;
      if (poly.slice(1).some((hole) => inRing(x, y, hole))) continue;
      inside = true; break;
    }
    if (!inside) return null;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  const api = { simplify, projectGeometries, markerFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MSR_GEO = api;
})(typeof window !== 'undefined' ? window : globalThis);
