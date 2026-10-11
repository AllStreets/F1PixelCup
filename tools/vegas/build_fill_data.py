"""What stands on the ground between and behind the Las Vegas Strip's towers,
from OpenStreetMap (© OpenStreetMap contributors, ODbL:
https://www.openstreetmap.org/copyright): the data the game fills the
circuit's empty ground with (r3d/vegas-fill.js,
docs/superpowers/specs/2026-10-11-vegas-fill-design.md).

  python3 tools/vegas/build_fill_data.py --cache osm_fill.json

Fetches every building, car park, swimming pool, garden, road, the monorail
and the footbridges round the Las Vegas Strip Circuit and writes

- tools/vegas/fill.json: the low buildings the Strip's own model leaves out
  (tools/vegas/strip.json has the tall ones), each with a height and a kind;
  the surface car parks, pools and gardens; the roads by class; the
  monorail and the footbridges; where the Sphere and the High Roller stand. Metres from the circuit's own
  projection centre (strip.json's origin), x east, y north, to 0.1 m.
- assets/landmarks/vegas_fill.glb: the same data as a model the game's
  loader fetches with the venue (a scene without geometry, the data in its
  extras).

No names or marks are kept: a name only decides a building's kind.
"""
import argparse
import json
import math
import os
import struct
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
BBOX = "36.0850,-115.1850,36.1500,-115.1480"
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
QUERIES = [
    'way["building"]({b});relation["building"]({b});',
    'way["amenity"="parking"]({b});relation["amenity"="parking"]({b});way["leisure"="swimming_pool"]({b});way["leisure"~"park|garden|golf_course"]({b});',
    'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|motorway_link|primary_link)$"]({b});way["railway"="monorail"]({b});way["highway"="footway"]["bridge"]({b});',
]
# A building's kind: how the game dresses it.
GENERIC, GARAGE, HOUSE, HOTEL, CANOPY, CHAPEL, SHED = range(7)
KINDS = {
    "parking": GARAGE, "garage": GARAGE, "house": HOUSE, "residential": HOUSE, "detached": HOUSE, "apartments": HOTEL, "hotel": HOTEL,
    "motel": HOTEL, "roof": CANOPY, "carport": CANOPY, "church": CHAPEL, "chapel": CHAPEL, "industrial": SHED, "warehouse": SHED, "hangar": SHED,
}
# Heights (metres) where the map gives none: by kind, a plain building by its size.
HEIGHTS = {GARAGE: 15.0, HOUSE: 4.5, HOTEL: 9.5, CANOPY: 5.5, CHAPEL: 6.5, SHED: 8.0}
# A road's width (metres) and letter by its class.
ROADS = {"motorway": ("m", 26), "trunk": ("m", 24), "primary": ("p", 24), "secondary": ("s", 18), "tertiary": ("t", 13),
         "residential": ("r", 9), "unclassified": ("r", 9), "motorway_link": ("l", 9), "primary_link": ("l", 9)}


def fetch(cache):
    if cache and os.path.exists(cache):
        return json.load(open(cache))
    elements = []
    for body in QUERIES:
        q = f"[out:json][timeout:170];({body.format(b=BBOX)});out tags geom;"
        for attempt in range(9):
            url = ENDPOINTS[attempt % len(ENDPOINTS)]
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "F1PixelCup-build/1.0"})
                elements += json.load(urllib.request.urlopen(req, timeout=200))["elements"]
                break
            except Exception as e:  # noqa: BLE001 (the next endpoint)
                print(url, e)
                time.sleep(10)
        else:
            raise RuntimeError("no Overpass endpoint answered")
    d = {"elements": elements}
    if cache:
        json.dump(d, open(cache, "w"))
    return d


def number(v):
    if not v:
        return None
    v = v.split(";")[0].strip()
    try:
        n = float("".join(ch for ch in v if ch.isdigit() or ch == "."))
    except ValueError:
        return None
    return n * 0.3048 if ("'" in v or "ft" in v) else n


def geometry(e):
    g = e.get("geometry")
    if g:
        return [(p["lat"], p["lon"]) for p in g]
    outers = [m for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    if not outers:
        return None
    return [(p["lat"], p["lon"]) for p in max(outers, key=lambda m: len(m["geometry"]))["geometry"]]


def area(poly):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))) / 2


def inside(pt, poly):
    x, y = pt
    hit = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
    return hit


def simplify(pts, tol):
    """Douglas-Peucker: the line's points, those within tol of it dropped."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    length = math.dist(a, b) or 1e-9
    far, at = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / length
        if d > far:
            far, at = d, i
    if far <= tol:
        return [a, b]
    return simplify(pts[:at + 1], tol)[:-1] + simplify(pts[at:], tol)


def flat(pts):
    return [round(v, 1) for p in pts for v in p]


def ring(pts, tol=0.4):
    """A closed outline without its repeated last point, simplified."""
    if len(pts) > 1 and math.dist(pts[0], pts[-1]) < 0.05:
        pts = pts[:-1]
    if len(pts) < 3:
        return None
    half = len(pts) // 2
    out = simplify(pts[:half + 1], tol)[:-1] + simplify(pts[half:] + pts[:1], tol)[:-1]
    return out if len(out) >= 3 else None


def glb(data):
    """A model without geometry, the data in its scene's extras."""
    doc = {"asset": {"version": "2.0", "generator": "tools/vegas/build_fill_data.py"}, "scene": 0, "scenes": [{"name": "vegas_fill", "nodes": [0], "extras": {"fill": data}}], "nodes": [{"name": "vegas_fill"}]}
    body = json.dumps(doc, separators=(",", ":")).encode()
    body += b" " * (-len(body) % 4)
    return struct.pack("<4sII", b"glTF", 2, 20 + len(body)) + struct.pack("<I4s", len(body), b"JSON") + body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="")
    args = ap.parse_args()
    d = fetch(args.cache)
    strip = json.load(open(os.path.join(HERE, "strip.json")))
    lat0, lon0 = strip["origin"]["lat"], strip["origin"]["lon"]
    k = math.pi / 180 * 6371000
    cs = math.cos(math.radians(lat0))
    metres = lambda p: ((p[1] - lon0) * cs * k, (p[0] - lat0) * k)
    # The Strip's own buildings and landmarks: nothing of the fill inside them.
    taken_ids = {b["id"] for b in strip["buildings"]}
    taken = [[tuple(p) for p in b["outline"]] for b in strip["buildings"]] + [[tuple(p) for p in a["outline"]] for a in strip["anchors"].values() if len(a["outline"]) > 2]
    taken.append([tuple(p) for p in strip["lake"]])
    boxes = [(min(p[0] for p in t), max(p[0] for p in t), min(p[1] for p in t), max(p[1] for p in t)) for t in taken]

    def in_strip(pt):
        return any(b[0] <= pt[0] <= b[1] and b[2] <= pt[1] <= b[3] and inside(pt, t) for t, b in zip(taken, boxes))

    low, lots, pools, greens, roads, rail, bridges = [], [], [], [], [], [], []
    for e in d["elements"]:
        tags = e.get("tags", {})
        if e["type"] == "node":
            continue
        g = geometry(e)
        if not g:
            continue
        pts = [metres(p) for p in g]
        key = f'{e["type"][0]}{e["id"]}'
        if "building" in tags:
            if key in taken_ids or tags["building"] in ("bridge", "construction") or tags.get("location") == "underground":
                continue
            o = ring(pts)
            if not o or area(o) < 30:
                continue
            c = (sum(p[0] for p in o) / len(o), sum(p[1] for p in o) / len(o))
            if in_strip(c):
                continue
            kind = KINDS.get(tags["building"], GENERIC)
            name = tags.get("name", "").lower()
            if "chapel" in name or tags.get("amenity") == "place_of_worship":
                kind = CHAPEL
            if tags.get("amenity") == "fuel":
                kind = CANOPY
            a = area(o)
            h = number(tags.get("height")) or (number(tags.get("building:levels")) or 0) * 3.4
            if not h:
                h = HEIGHTS.get(kind) or (4.0 if a < 150 else 5.5 if a < 1000 else 8.0 if a < 5000 else 11.0)
            low.append({"o": flat(o), "h": round(min(h, 60.0), 1), "k": kind})
        elif tags.get("amenity") == "parking":
            o = ring(pts, 0.8)
            if o and area(o) > 300 and tags.get("parking", "surface") in ("surface", "street_side", "lane"):
                lots.append(flat(o))
        elif tags.get("leisure") == "swimming_pool":
            o = ring(pts, 0.3)
            if o and area(o) > 25:
                pools.append(flat(o))
        elif tags.get("leisure") in ("park", "garden", "golf_course"):
            o = ring(pts, 1.0)
            if o and area(o) > 150:
                greens.append(flat(o))
        elif tags.get("railway") == "monorail":
            rail.append(flat(simplify(pts, 0.5)))
        elif tags.get("highway") == "footway":
            if len(pts) >= 2:
                bridges.append(flat(simplify(pts, 0.5)))
        elif tags.get("highway") in ROADS and tags.get("tunnel") != "yes":
            c, w = ROADS[tags["highway"]]
            lanes = number(tags.get("lanes"))
            if lanes and c in ("p", "s", "t"):
                # (A carriageway of a divided road: its own lanes' width.)
                w = max(7.0, min(w, lanes * 3.6 + 2.0))
            roads.append({"p": flat(simplify(pts, 0.6)), "w": round(w, 1), "c": c})
    data = {"attribution": strip["attribution"], "origin": strip["origin"], "low": low, "lots": lots, "pools": pools, "greens": greens,
            "roads": roads, "rail": rail, "bridges": bridges,
            # Where the Sphere and the High Roller stand: their plaza and promenade are paved round them.
            "marks": {key: [strip["anchors"][key]["x"], strip["anchors"][key]["y"]] for key in ("sphere", "highroller")}}
    json.dump(data, open(os.path.join(HERE, "fill.json"), "w"), separators=(",", ":"))
    out = os.path.join(ROOT, "assets", "landmarks", "vegas_fill.glb")
    open(out, "wb").write(glb(data))
    print({key: len(v) for key, v in data.items() if isinstance(v, list)}, f"{os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main()
