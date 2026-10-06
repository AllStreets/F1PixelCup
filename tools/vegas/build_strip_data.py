"""The Las Vegas Strip's buildings, from OpenStreetMap (© OpenStreetMap
contributors, ODbL: https://www.openstreetmap.org/copyright), as the data the
Blender build reads (tools/blender/build_vegas.py) and where the game puts it.

  python3 tools/vegas/build_strip_data.py [--cache osm.json]

Fetches every building and building part (with its height, levels, colour
and roof) round the Las Vegas Strip Circuit, keeps the tall ones (and the
landmarks' anchors), and writes tools/vegas/strip.json:

- origin: the circuit's own projection centre (as tools/tracks/build_tracks.py
  projects it), and where that point lies in the game (fitted to the
  circuit's outline in tracks-data.js), so the buildings stand where they
  really do relative to its streets;
- buildings: footprints in metres from that centre (x east, y north), their
  heights, colours and roofs, each with the resort it belongs to;
- anchors: the points the hand-built landmarks stand on (the Eiffel Tower,
  the balloon, the campanile, the High Roller, the Sphere, ...);
- lake: the Bellagio's lake, for its fountains.

No names or marks go on any model: the names here only say which is which.
"""
import argparse
import json
import math
import os
import re
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SCALE = 1.3  # game units per metre, as build_tracks.py
BBOX = (36.0900, -115.1800, 36.1500, -115.1530)
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
QUERY = ('[out:json][timeout:180];(way["building:part"]({b});relation["building:part"]({b});way["building"]({b});'
         'relation["building"]({b});way["natural"="water"]({b});nwr["attraction"="big_wheel"]({b});'
         'nwr["name"~"Colosseum|Statue of Liberty|Rialto Bridge"]({b}););out tags geom;')

# Each resort's footprints, by the name it is mapped under or a point inside
# it (the towers of a resort are often unnamed): name -> (lat, lon) samples.
RESORTS = {
    "bellagio": ["Bellagio"], "caesars": ["Caesars", "Palace Tower", "Augustus Tower", "Octavius Tower", "Forum Tower", "Julius Tower", "Nobu"],
    "venetian": ["Venetian", "Venezia", "Campanile"], "palazzo": ["Palazzo"], "wynn": ["Wynn Las Vegas"], "encore": ["Encore"],
    "cosmopolitan": ["Cosmopolitan"], "aria": ["Aria"], "paris": ["Paris", "Le Boulevard"], "linq": ["LINQ"], "flamingo": ["Flamingo"],
    "planethollywood": ["Planet Hollywood"], "mirage": ["Mirage"], "treasureisland": ["Treasure Island"], "mgm": ["MGM Grand"],
    "nyny": ["New York New York"], "excalibur": ["Excalibur"], "luxor": ["Luxor"], "fontainebleau": ["Fontainebleau"],
    "resortsworld": ["Resorts World"], "strat": ["Strat", "Stratosphere"], "harrahs": ["Harrah"], "horseshoe": ["Horseshoe"],
    "trump": ["Trump"], "mandalay": ["Mandalay"],
}
# Points inside resorts whose towers are mapped without a name (and how near
# a tower must be, metres: 90 unless given).
RESORT_POINTS = {
    "mirage": (36.1213, -115.1752), "treasureisland": (36.1247, -115.1719), "flamingo": (36.1165, -115.1715),
    "harrahs": (36.1195, -115.1701), "aria": (36.1072, -115.1772), "mgm": (36.1024, -115.1700), "nyny": (36.1022, -115.1749),
    "excalibur": (36.0989, -115.1752), "resortsworld": (36.1347, -115.1662), "bellagio": (36.1131, -115.1763),
    "cosmopolitan": (36.1098, -115.1752), "paris": (36.1125, -115.1705), "venetian": (36.1213, -115.1693),
    # The Luxor's two stepped towers, either side of the pyramid's north.
    "luxor": (36.0968, -115.1758, 150.0),
}
# Heights for towers mapped without one (public figures; only for a tower's
# own footprint, not a resort's whole site: under MAX_SITE square metres).
HEIGHTS = {"fontainebleau": 224.0, "flamingo": 90.0}
# The resorts' colours (a facade's frame and stone; its glass is the game's).
COLOURS = {
    "wynn": "#8a6a46", "encore": "#8a6a46", "palazzo": "#ecc996", "venetian": "#f3dcc0", "bellagio": "#dccaa5",
    "caesars": "#e9e7e2", "paris": "#e8dcc6", "planethollywood": "#2e343c", "cosmopolitan": "#3a4652", "aria": "#93aabd",
    "mgm": "#11804a", "nyny": "#b39678", "horseshoe": "#d8d0c0", "harrahs": "#e2d6be", "linq": "#e6e8ea", "flamingo": "#f2e4dc",
    "excalibur": "#efe9df", "resortsworld": "#8e3b2a", "fontainebleau": "#4f7493", "trump": "#c9a44c", "mirage": "#d6a243",
    "treasureisland": "#c8a27c", "strat": "#cfcac0", "luxor": "#1b1f26", "mandalay": "#c9a24a",
}
# The landmarks built by hand: their anchors (OSM names), and the footprints
# they replace (so the extrusion doesn't stand inside them).
ANCHORS = {
    "eiffel": "Eiffel Tower", "balloon": "Paris Balloon", "arc": "Arc de Triomphe", "campanile": "The Campanile",
    "sphere": "Sphere", "strat": "Stratosphere Tower", "luxor": "Luxor Las Vegas", "highroller": "High Roller",
    "colosseum": "The Colosseum", "liberty": "Statue of Liberty", "rialto": "Rialto Bridge",
}
MIN_HEIGHT = 20.0
MAX_SITE = 12000.0
# Footprints whose resort the map doesn't say (unnamed towers).
OVERRIDES = {"w27858550": "mandalay"}


def fetch(cache):
    if cache and os.path.exists(cache):
        return json.load(open(cache))
    b = ",".join(str(v) for v in BBOX)
    data = urllib.parse.urlencode({"data": QUERY.format(b=b)}).encode()
    for url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "F1PixelCup-build/1.0"})
            d = json.load(urllib.request.urlopen(req, timeout=240))
            if cache:
                json.dump(d, open(cache, "w"))
            return d
        except Exception as e:  # noqa: BLE001 (the next endpoint)
            print(url, e)
    raise RuntimeError("no Overpass endpoint answered")


def number(v):
    """A height as the map writes it: metres, or feet with ' or ft."""
    if not v:
        return None
    v = v.split(";")[0].strip()
    try:
        n = float(re.sub(r"[^0-9.]", "", v))
    except ValueError:
        return None
    return n * 0.3048 if ("'" in v or "ft" in v) else n


def ring(e):
    g = e.get("geometry")
    if g:
        return [(p["lat"], p["lon"]) for p in g]
    outers = [m for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    if not outers:
        return None
    best = max(outers, key=lambda m: len(m["geometry"]))
    return [(p["lat"], p["lon"]) for p in best["geometry"]]


def inside(pt, poly):
    x, y = pt
    hit = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
    return hit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="")
    args = ap.parse_args()
    d = fetch(args.cache)
    # The circuit's projection centre, as build_tracks.py has it.
    gj = json.load(open(os.path.join(ROOT, "tools", "tracks", "f1-circuits.geojson")))
    coords = next(f for f in gj["features"] if f["properties"]["id"] == "us-2023")["geometry"]["coordinates"]
    lat0 = sum(c[1] for c in coords) / len(coords)
    lon0 = sum(c[0] for c in coords) / len(coords)
    k = math.pi / 180 * 6371000
    cs = math.cos(math.radians(lat0))
    metres = lambda lat, lon: ((lon - lon0) * cs * k, (lat - lat0) * k)
    # Where that centre is in the game: the true outline (scaled) slid onto
    # the game's outline (the relaxation moves it a little; never rotated).
    src = open(os.path.join(ROOT, "tracks-data.js")).read()
    start = src.index("const TRACK_SHAPES = ") + len("const TRACK_SHAPES = ")
    shapes = json.loads(src[start:src.index(";\n", start)])
    pts = [(p["x"], p["y"]) for p in shapes["lasvegas"]["points"]]
    true = [(x * SCALE, -y * SCALE) for x, y in (metres(c[1], c[0]) for c in coords)]
    dense = []
    for a, b in zip(true, true[1:] + true[:1]):
        n = max(1, int(math.dist(a, b) / 10))
        dense += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
    tx = sum(p[0] for p in pts) / len(pts) - sum(p[0] for p in dense) / len(dense)
    ty = sum(p[1] for p in pts) / len(pts) - sum(p[1] for p in dense) / len(dense)
    for _ in range(30):
        sx = sy = 0.0
        for p in pts:
            q = min(dense, key=lambda q: (q[0] + tx - p[0]) ** 2 + (q[1] + ty - p[1]) ** 2)
            sx += p[0] - q[0] - tx
            sy += p[1] - q[1] - ty
        tx += sx / len(pts)
        ty += sy / len(pts)
    err = sum(min(math.dist(p, (q[0] + tx, q[1] + ty)) for q in dense) for p in pts) / len(pts)

    elements = [e for e in d["elements"] if ring(e)]
    named = [(e, ring(e)) for e in elements if e.get("tags", {}).get("name")]
    anchors = {}
    for key, name in ANCHORS.items():
        hits = [r for e, r in named if e["tags"]["name"] == name]
        if not hits:
            raise RuntimeError(f"no {name} in the map")
        r = max(hits, key=len)
        lat = sum(p[0] for p in r) / len(r)
        lon = sum(p[1] for p in r) / len(r)
        x, y = metres(lat, lon)
        # Toward the nearest point of the circuit (radians from east, toward
        # north): the way a landmark's front faces.
        near = min((metres(c[1], c[0]) for c in coords), key=lambda q: math.dist(q, (x, y)))
        facing = math.atan2(near[1] - y, near[0] - x)
        anchors[key] = {"x": round(x, 2), "y": round(y, 2), "facing": round(facing, 4), "outline": [[round(v, 2) for v in metres(*p)] for p in r]}

    # Each resort's outlines (its named footprints), to give its towers its look.
    resort_polys = {}
    for key, names in RESORTS.items():
        resort_polys[key] = [r for e, r in named if any(n.lower() in e["tags"]["name"].lower() for n in names) and len(r) > 3]

    def resort_of(lat, lon, name):
        for key, names in RESORTS.items():
            if name and any(n.lower() in name.lower() for n in names):
                return key
        for key, point in RESORT_POINTS.items():
            if math.dist(metres(lat, lon), metres(point[0], point[1])) < (point[2] if len(point) > 2 else 90.0):
                return key
        for key, polys in resort_polys.items():
            if any(inside((lat, lon), p) for p in polys):
                return key
        return ""

    parts = [(e, ring(e)) for e in elements if "building:part" in e.get("tags", {})]
    replaced = [a["outline"] for k2, a in anchors.items() if k2 in ("eiffel", "balloon", "arc", "campanile", "sphere", "strat", "colosseum")]
    # The Luxor's anchor is the whole resort's site: only what stands inside
    # the pyramid's own square (183 m) gives way to it, not its towers.
    lx, ly = anchors["luxor"]["x"], anchors["luxor"]["y"]
    replaced.append([(lx - 92, ly - 92), (lx + 92, ly - 92), (lx + 92, ly + 92), (lx - 92, ly + 92)])
    buildings = []
    for e, r in [(e, ring(e)) for e in elements]:
        t = e.get("tags", {})
        if not ("building" in t or "building:part" in t):
            continue
        if t.get("name") in ANCHORS.values():
            continue
        lat = sum(p[0] for p in r) / len(r)
        lon = sum(p[1] for p in r) / len(r)
        # An outline with parts in it is drawn by its parts.
        if "building" in t and "building:part" not in t and any(inside((sum(p[0] for p in pr) / len(pr), sum(p[1] for p in pr) / len(pr)), r) for _, pr in parts):
            continue
        name = t.get("name", "")
        resort = OVERRIDES.get(f'{e["type"][0]}{e["id"]}') or resort_of(lat, lon, name)
        h = number(t.get("height"))
        if h is None and t.get("building:levels"):
            h = number(t["building:levels"]) * 3.4
        area = abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip([metres(*p) for p in r], [metres(*p) for p in r[1:] + r[:1]]))) / 2
        if h is None and name and resort in HEIGHTS and area < MAX_SITE:
            h = HEIGHTS[resort]
        if h is None or h < MIN_HEIGHT:
            continue
        minh = number(t.get("min_height")) or (number(t.get("building:min_level")) or 0) * 3.4
        outline = [metres(*p) for p in r]
        if math.dist(outline[0], outline[-1]) < 0.01:
            outline = outline[:-1]
        cx = sum(p[0] for p in outline) / len(outline)
        cy = sum(p[1] for p in outline) / len(outline)
        if any(inside((cx, cy), a) for a in replaced):
            continue
        colour = COLOURS.get(resort) or (t.get("building:colour") if re.match(r"^#[0-9a-fA-F]{6}$", t.get("building:colour", "")) else "#d9cbb4")
        buildings.append({
            "id": f'{e["type"][0]}{e["id"]}', "resort": resort, "h": round(h, 1), "minh": round(minh, 1),
            "colour": colour.lower(), "glass": t.get("building:material") == "glass" or resort in ("wynn", "encore", "cosmopolitan", "aria", "fontainebleau", "planethollywood", "mirage", "trump", "mandalay", "mgm"),
            "roof": t.get("roof:shape", "flat"), "outline": [[round(x, 2), round(y, 2)] for x, y in outline],
        })
    lakes = [r for e, r in named if e["tags"]["name"] == "Fountains of Bellagio"]
    if not lakes:
        raise RuntimeError("no Fountains of Bellagio (the lake) in the map")
    out = {
        "attribution": "© OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright)",
        "origin": {"lat": lat0, "lon": lon0, "game": {"x": round(tx, 2), "z": round(ty, 2)}, "scale": SCALE, "fitError": round(err, 2)},
        "anchors": anchors,
        "lake": [[round(v, 2) for v in metres(*p)] for p in max(lakes, key=len)],
        "buildings": buildings,
        # The circuit's true outline in the same metres (where the resorts'
        # signs stand by it).
        "circuit": [[round(v, 2) for v in metres(c[1], c[0])] for c in coords],
    }
    json.dump(out, open(os.path.join(HERE, "strip.json"), "w"), separators=(",", ":"))
    by = {}
    for b in buildings:
        by[b["resort"] or "-"] = by.get(b["resort"] or "-", 0) + 1
    print(f"{len(buildings)} buildings, fit {err:.1f} units, game origin {tx:.1f}, {ty:.1f}", by)


main()
