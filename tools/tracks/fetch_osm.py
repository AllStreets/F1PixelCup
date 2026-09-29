"""Fetch the real pit lanes and the Monaco tunnel from OpenStreetMap.

Writes tools/tracks/osm-features.json, which build_tracks.py reads. The data
is (c) OpenStreetMap contributors, available under the Open Database Licence
(ODbL): https://www.openstreetmap.org/copyright. Only a handful of points per
feature are kept (five, evenly spaced along each way).

    python3 tools/tracks/fetch_osm.py

Ways, by game circuit (ids from OpenStreetMap):
  pit lanes: the raceway tagged as the pit lane beside each start/finish
  straight; the Monaco tunnel is Boulevard Louis II's tunnel section; the
  signature corners are the raceway ways named for them.
Monza and Suzuka have no pit lane mapped as a raceway there; build_tracks.py
finds theirs from the circuit's shape alone.
"""
import json
import math
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

PIT_LANES = {
    "spa": 323851541,
    "silverstone": 227902927,  # the International (Wing) pit lane
    "monaco": 850261588,       # Voie des stands
    "singapore": 100484287,
    "bahrain": 187123422,
    "interlagos": 33779109,
}
TUNNELS = {
    "monaco": 4230891,  # Boulevard Louis II, under the Fairmont hotel
}
# The signature corners that get their name boards (G2), with the name the
# board carries (a second line where the corner is best known by another).
CORNERS = {
    "spa": [(126835639, "EAU ROUGE", ""), (126835637, "RAIDILLON", "")],
    "monza": [(179968234, "CURVA ALBORETO", "PARABOLICA")],
    "suzuka": [(183391652, "130R", "")],
    "interlagos": [(189535473, "S DO SENNA", "")],
}
# The start/finish line, where the source outline puts it somewhere else:
# level with the middle of the real pit lane.
LINE_AT_PIT_MIDDLE = ["monaco", "silverstone"]


def metres(a, b):
    k = math.pi / 180 * 6371000
    return math.hypot((a[0] - b[0]) * k, (a[1] - b[1]) * k * math.cos(math.radians(a[0])))


def five_points(geometry):
    """Five points evenly spaced along the way, by length: [lat, lon]."""
    pts = [(g["lat"], g["lon"]) for g in geometry]
    run = [0.0]
    for a, b in zip(pts, pts[1:]):
        run.append(run[-1] + metres(a, b))
    out = []
    for f in (0, 0.25, 0.5, 0.75, 1):
        target = run[-1] * f
        i = max(k for k in range(len(pts)) if run[k] <= target)
        if i == len(pts) - 1:
            out.append(list(pts[-1]))
            continue
        t = (target - run[i]) / ((run[i + 1] - run[i]) or 1)
        out.append([round(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, 7),
                    round(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, 7)])
    return out, round(run[-1])


def main():
    ids = list(PIT_LANES.values()) + list(TUNNELS.values()) + [c[0] for cs in CORNERS.values() for c in cs]
    query = f"[out:json][timeout:60];way(id:{','.join(map(str, ids))});out geom;"
    data = None
    # The public Overpass servers are often busy: try each, a few times.
    for attempt in range(3):
        for server in ENDPOINTS:
            url = server + "?" + urllib.parse.urlencode({"data": query})
            req = urllib.request.Request(url, headers={"User-Agent": "F1PixelCup-build/1.0"})
            try:
                data = json.load(urllib.request.urlopen(req, timeout=90))
                break
            except (OSError, ValueError) as error:
                print(f"{server}: {error}")
        if data:
            break
        time.sleep(20)
    if not data:
        raise SystemExit("OpenStreetMap is not answering; try again later")
    ways = {e["id"]: e for e in data["elements"]}
    out = {"attribution": "© OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright)",
           "pitLanes": {}, "tunnels": {}, "corners": {}, "lineAtPitMiddle": LINE_AT_PIT_MIDDLE}
    for gid, wid in PIT_LANES.items():
        points, length = five_points(ways[wid]["geometry"])
        out["pitLanes"][gid] = {"way": wid, "name": ways[wid]["tags"].get("name", ""), "metres": length, "points": points}
    for gid, wid in TUNNELS.items():
        points, length = five_points(ways[wid]["geometry"])
        out["tunnels"][gid] = {"way": wid, "name": ways[wid]["tags"].get("name", ""), "metres": length, "points": points}
    for gid, corners in CORNERS.items():
        out["corners"][gid] = []
        for wid, board, aka in corners:
            points, length = five_points(ways[wid]["geometry"])
            out["corners"][gid].append({"way": wid, "name": ways[wid]["tags"].get("name", ""), "board": board, "aka": aka, "metres": length, "points": points})
    with open(os.path.join(HERE, "osm-features.json"), "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
