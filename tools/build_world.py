"""Builds web/world.json: land outlines of countries and continents for the "own reference" lookup
in the web version. Coordinates stay in lon/lat; web/places.js projects them when a place is added.

usage: python -I tools/build_world.py <dir> web/world.json

<dir> holds two files from Natural Earth (public domain),
https://github.com/nvkelso/natural-earth-vector/tree/master/geojson :
  ne_50m_admin_0_countries.geojson   (used for normal and large countries, and for the continents)
  ne_10m_admin_0_countries.geojson   (used for countries under 30,000 km2, where 1:50m is too coarse)

Per country only the main territory is kept: parts far away from it (French Guiana for France, the
Caribbean for the Netherlands, Hawaii for the USA) would stretch the outline over half the globe.
"""
import json
import math
import os
import sys
import unicodedata

from shapely.affinity import translate
from shapely.geometry import MultiPolygon, Polygon, box, shape
from shapely.ops import unary_union

SMALL_KM2 = 30000
CONTINENT_MIN_KM2 = 6000

CONTINENTS = {
    'Europe': ('Europa', 'Europe'),
    'Asia': ('Azië', 'Asia'),
    'Africa': ('Afrika', 'Africa'),
    'North America': ('Noord-Amerika', 'North America'),
    'South America': ('Zuid-Amerika', 'South America'),
    'Oceania': ('Oceanië', 'Oceania'),
}
# Clip boxes that keep a continent to its familiar outline (lon0, lat0, lon1, lat1).
CONTINENT_CLIP = {
    'Europe': (-25.0, 34.0, 60.0, 71.3),     # Iceland to the Urals, without Svalbard and the Canaries
    'Oceania': (110.0, -50.0, 180.0, 0.0),   # Australia, New Zealand, New Guinea (east), nearby islands
}
EXTRA_NAMES = {
    'USA': ['vs', 'usa', 'us', 'verenigde staten', 'verenigde staten van amerika', 'united states'],
    'GBR': ['vk', 'uk', 'verenigd koninkrijk', 'united kingdom'],
    'NLD': ['holland'],
    'ATA': ['antarctica', 'zuidpool', 'zuidpoolgebied'],
    'CZE': ['tsjechie', 'czech republic'],
    'TUR': ['turkije', 'turkey'],
    'COD': ['congo kinshasa', 'dr congo', 'drc'],
    'COG': ['congo brazzaville'],
}
NAME_FIELDS = ['NAME', 'NAME_LONG', 'ADMIN', 'FORMAL_EN', 'BRK_NAME', 'NAME_EN', 'NAME_NL', 'NAME_DE',
               'NAME_FR', 'NAME_ES', 'NAME_IT', 'NAME_PT', 'NAME_SV', 'NAME_PL', 'NAME_TR']


def norm(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    out = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(out.split())


def polys(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [p for x in g.geoms for p in polys(x)]
    return []


def km2(p):
    lat = max(-89.0, min(89.0, p.centroid.y))
    return p.area * math.cos(math.radians(lat)) * 111.2 ** 2


def diag(parts):
    b = unary_bounds(parts)
    k = math.cos(math.radians(max(-89.0, min(89.0, (b[1] + b[3]) / 2))))
    return math.hypot((b[2] - b[0]) * k, b[3] - b[1])


def unary_bounds(parts):
    xs0, ys0, xs1, ys1 = zip(*(p.bounds for p in parts))
    return min(xs0), min(ys0), max(xs1), max(ys1)


def dist(a, b):
    """Distance in degrees, also tried across the antimeridian."""
    return min(a.distance(b), a.distance(translate(b, xoff=360)), a.distance(translate(b, xoff=-360)))


def main_part(parts):
    """The largest part plus everything connected to it by short hops; far-away overseas parts are dropped."""
    parts = sorted(parts, key=km2, reverse=True)
    big = parts[0]
    d = diag([big])
    near = max(0.3 * d, 1.0)
    keep, rest = [big], parts[1:]
    changed = True
    while changed and rest:
        changed = False
        for p in list(rest):
            hop = min(dist(p, q) for q in keep) < near
            large = km2(p) >= 0.02 * km2(big) and dist(p, big) < 2 * d
            if hop or large:
                keep.append(p)
                rest.remove(p)
                changed = True
    return keep, rest


def join_antimeridian(parts):
    """Parts split at 180 degrees (Russia, Fiji) are shifted to one side and merged, so no seam is drawn."""
    b = unary_bounds(parts)
    if not (b[0] < -179.9 and b[2] > 179.9):
        return parts
    shifted = [translate(p, xoff=360) if p.centroid.x < 0 else p for p in parts]
    return polys(unary_union([p.buffer(0) for p in shifted]))


def tidy(parts, min_km2, hole_km2):
    """Simplify to what a 1500 px drawing can show, drop specks and tiny holes; always keep the largest part."""
    parts = sorted(parts, key=km2, reverse=True)
    d = diag(parts)
    tol = d / 2500
    out = []
    for i, p in enumerate(parts):
        if i > 0 and km2(p) < min_km2:
            continue
        s = p.simplify(tol, preserve_topology=True)
        for q in polys(s):
            holes = [h for h in q.interiors if km2(Polygon(h)) >= hole_km2]
            out.append(Polygon(q.exterior, holes))
    return out, d


def coords(parts, d, drop_pole=False):
    nd = 4 if d < 2 else 3 if d < 40 else 2
    res = []
    for p in parts:
        rings = []
        for ring in [p.exterior] + list(p.interiors):
            pts = []
            for x, y in ring.coords:
                if drop_pole and y <= -89.9:
                    continue
                c = [round(x, nd), round(y, nd)]
                if not pts or pts[-1] != c:
                    pts.append(c)
            if len(pts) >= 4:
                rings.append(pts)
        if rings:
            res.append(rings)
    return res


def guess_continent(lon, lat):
    """Continent of an overseas part, from where it lies."""
    if lat < -60:
        return None
    if lon < -120 and lat < 30:
        return 'Oceania'
    if lon < -30:
        return 'South America' if lat < 12.5 else 'North America'
    if lon < 60:
        return 'Africa' if lat < 34 else 'Europe'
    return 'Oceania' if (lat < -10 or lon > 150) else 'Asia'


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)['features']


def main():
    src, out_path = sys.argv[1], sys.argv[2]
    f50 = {f['properties']['ADM0_A3']: f for f in load(os.path.join(src, 'ne_50m_admin_0_countries.geojson'))}
    f10 = {f['properties']['ADM0_A3']: f for f in load(os.path.join(src, 'ne_10m_admin_0_countries.geojson'))}

    places = []
    for code, f in sorted(f10.items()):
        pr = f['properties']
        g10 = polys(shape(f['geometry']).buffer(0))
        if not g10:
            continue
        keep10, _ = main_part(g10)
        area = sum(km2(p) for p in keep10)
        parts = keep10
        if area >= SMALL_KM2 and code in f50:
            g50 = polys(shape(f50[code]['geometry']).buffer(0))
            if g50:
                parts, _ = main_part(g50)
        if code != 'ATA':
            parts = join_antimeridian(parts)
        d0 = diag(parts)
        speck = (d0 * 111.2 / 150) ** 2          # same cut-off as the drawing code
        if code == 'ATA':                         # the artificial edge along the pole would mangle a simplify
            parts = sorted(parts, key=km2, reverse=True)
            parts = [p for i, p in enumerate(parts) if i == 0 or km2(p) >= speck]
            geom = coords(parts, 60, drop_pole=True)
        else:
            parts, d = tidy(parts, speck, speck)
            geom = coords(parts, d)
        if not geom:
            continue
        names = {norm(pr.get(k)) for k in NAME_FIELDS} | {norm(n) for n in EXTRA_NAMES.get(code, [])}
        names.discard('')
        iso = (pr.get('ISO_A2_EH') or pr.get('ISO_A2') or '').lower()
        places.append({
            'id': 'ne-' + code, 'kind': 'country',
            'nl': pr.get('NAME_NL') or pr['NAME'], 'en': pr.get('NAME_EN') or pr['NAME'],
            'iso': iso if len(iso) == 2 and iso.isalpha() else '',
            'a': sorted(names), 'p': geom,
        })

    # continents, from the 1:50m countries
    buckets = {k: [] for k in CONTINENTS}
    urals = box(0, 30, 60, 90)
    for code, f in f50.items():
        cont = f['properties']['CONTINENT']
        if cont not in CONTINENTS:
            continue
        g = polys(shape(f['geometry']).buffer(0))
        if not g:
            continue
        if code == 'RUS':
            for p in g:
                buckets['Europe'] += polys(p.intersection(urals))
                buckets['Asia'] += polys(p.difference(urals))
            continue
        keep, far = main_part(g)
        buckets[cont] += keep
        for p in far:
            c = guess_continent(p.centroid.x, p.centroid.y)
            if c:
                buckets[c].append(p)
    for cont, (nl, en) in CONTINENTS.items():
        merged = unary_union([p.buffer(0) for p in buckets[cont]])
        if cont in CONTINENT_CLIP:
            merged = merged.intersection(box(*CONTINENT_CLIP[cont]))
        parts = join_antimeridian(polys(merged))
        parts, d = tidy(parts, CONTINENT_MIN_KM2, CONTINENT_MIN_KM2)
        places.append({
            'id': 'ne-c-' + norm(en).replace(' ', '-'), 'kind': 'continent', 'nl': nl, 'en': en, 'iso': '',
            'a': sorted({norm(nl), norm(en)}), 'p': coords(parts, d),
        })

    doc = {
        'source': 'Natural Earth 1:50m and 1:10m, public domain (naturalearthdata.com)',
        'places': places,
    }
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    pts = sum(len(r) for pl in places for poly in pl['p'] for r in poly)
    print('%d places, %d points, %d kB -> %s' % (len(places), pts, os.path.getsize(out_path) // 1024, out_path))


if __name__ == '__main__':
    main()
