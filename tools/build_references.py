"""Build extension/references.js (generic, shareable) from CBS/PDOK GeoJSON downloads.

Usage: python -I build_references.py <download_dir> <output_js> [tolerance_factor]

The download dir must contain landsdeel.json and provincie.json as served by the
PDOK WFS cbs/gebiedsindelingen (EPSG:4326). Personal areas (gemeente, wijk, buurt)
are not built here: the extension fetches them live from PDOK after the user
enters an address in the popup.
"""
import json
import math
import sys
from pathlib import Path

from shapely import transform
from shapely.geometry import shape
from shapely.ops import unary_union

M_PER_DEG_LAT = 111132.0
M_PER_DEG_LON_EQ = 111320.0


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def to_local(geom, tol_m):
    """Project to local metres around the bbox centre, simplify, return polygons."""
    minx, miny, maxx, maxy = geom.bounds
    lon0 = (minx + maxx) / 2
    lat0 = (miny + maxy) / 2
    kx = M_PER_DEG_LON_EQ * math.cos(math.radians(lat0))
    ky = M_PER_DEG_LAT

    local = transform(geom, lambda a: ((a - [lon0, lat0]) * [kx, ky]))
    local = local.simplify(tol_m, preserve_topology=True)
    polys = []
    parts = list(local.geoms) if local.geom_type == "MultiPolygon" else [local]
    for p in parts:
        if p.area < (tol_m * 10) ** 2:  # drop specks
            continue
        rings = [list(p.exterior.coords)] + [list(r.coords) for r in p.interiors]
        polys.append([[[round(x, 1), round(y, 1)] for x, y in ring] for ring in rings])
    lminx, lminy, lmaxx, lmaxy = local.bounds
    return {
        "polygons": polys,
        "width_m": round(lmaxx - lminx),
        "height_m": round(lmaxy - lminy),
        "bbox": [round(lminx, 1), round(lminy, 1), round(lmaxx, 1), round(lmaxy, 1)],
        "origin": [round(lon0, 7), round(lat0, 7)],
    }


def fetch_amsterdam_centrum():
    import urllib.parse
    import urllib.request
    flt = ('<Filter xmlns="http://www.opengis.net/fes/2.0"><PropertyIsEqualTo>'
           '<ValueReference>gemeentecode</ValueReference><Literal>GM0363</Literal>'
           '</PropertyIsEqualTo></Filter>')
    q = urllib.parse.urlencode({"service": "WFS", "version": "2.0.0", "request": "GetFeature",
                                "typeNames": "wijkenbuurten:wijken", "outputFormat": "json",
                                "srsName": "EPSG:4326", "FILTER": flt})
    url = "https://service.pdok.nl/cbs/wijkenbuurten/2024/wfs/v1_0?" + q
    with urllib.request.urlopen(url, timeout=120) as r:
        fc = json.load(r)
    feats = [f for f in fc["features"]
             if f["properties"].get("water") != "JA" and str(f["properties"].get("wijkcode", "")).startswith("WK0363A")]  # stadsdeel Centrum
    names = sorted(f["properties"]["wijknaam"] for f in feats)
    if not feats:
        raise SystemExit("Amsterdam Centrum wijken not found")
    print("Amsterdam wijken:", ", ".join(names))
    return unary_union([shape(f["geometry"]) for f in feats])


def build(dl, out, factor=1.0):
    dl = Path(dl)
    refs = []

    def add(rid, name, geom, tol, note):
        loc = to_local(geom, tol * factor)
        ref = {"id": rid, "name": name, **loc, "source": note}
        refs.append(ref)
        npts = sum(len(r) for p in loc["polygons"] for r in p)
        print(f"{rid:12s} {loc['width_m']:>8} x {loc['height_m']:>7} m  {len(loc['polygons'])} polys, {npts} pts")

    src = "CBS Gebiedsindelingen 2024 (gegeneraliseerd), PDOK"

    landsdelen = load(dl / "landsdeel.json")
    add("nl", "Nederland", unary_union([shape(f["geometry"]) for f in landsdelen["features"]]), 250, src)

    prov = load(dl / "provincie.json")
    for f in sorted(prov["features"], key=lambda f: f["properties"]["statnaam"]):
        p = f["properties"]
        add("prov-" + p["statcode"], p["statnaam"], shape(f["geometry"]), 120, src)

    # Amsterdam city centre (the canal ring inside the Singelgracht): CBS wijken Centrum-West and
    # Centrum-Oost of gemeente Amsterdam, fetched live from the PDOK WFS with an OGC filter.
    add("amsterdam-centrum", "Amsterdam Centrum", fetch_amsterdam_centrum(), 6,
        "CBS Wijk- en buurtkaart 2024, de tien wijken van stadsdeel Centrum (PDOK)")

    # Generic squares fill the gaps between the Netherlands and 1 km² for users without an address
    # (and outside the Netherlands).
    for rid, name, size in (("km100", "100 × 100 km", 100000), ("km10", "10 × 10 km", 10000), ("km2", "1 vierkante kilometer", 1000)):
        h = size / 2
        refs.append({
            "id": rid, "name": name, "width_m": size, "height_m": size,
            "bbox": [-h, -h, h, h],
            "polygons": [[[[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]]]],
            "source": f"{size // 1000} x {size // 1000} km",
        })

    circle = [[round(9.15 * math.cos(a), 2), round(9.15 * math.sin(a), 2)]
              for a in [i * 2 * math.pi / 36 for i in range(37)]]
    refs.append({
        "id": "voetbalveld", "name": "Voetbalveld", "width_m": 105, "height_m": 68,
        "bbox": [-52.5, -34, 52.5, 34],
        "polygons": [[[[-52.5, -34], [52.5, -34], [52.5, 34], [-52.5, 34], [-52.5, -34]]]],
        "lines": [[[0, -34], [0, 34]], circle],
        "source": "FIFA standaardmaat 105 x 68 m",
    })

    js = "// Generated by tools/build_references.py. Coordinates in metres, x east, y north, relative to the bbox centre.\n"
    js += "window.MSR_BUILTIN_REFERENCES = " + json.dumps(refs, ensure_ascii=False, separators=(",", ":")) + ";\n"
    Path(out).write_text(js, encoding="utf-8")
    print("wrote", out, len(js) // 1024, "kB")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 1.0)
