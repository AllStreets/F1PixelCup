"""Fetch the real pit lanes and the Monaco tunnel from OpenStreetMap.

Writes tools/tracks/osm-features.json, which build_tracks.py reads. The data
is (c) OpenStreetMap contributors, available under the Open Database Licence
(ODbL): https://www.openstreetmap.org/copyright. Only a handful of points per
feature are kept (five, evenly spaced along each way).

    python3 tools/tracks/fetch_osm.py            # fetches what is new
    python3 tools/tracks/fetch_osm.py --refresh  # fetches everything again

Features already in osm-features.json are kept as they are, unless
--refresh: OpenStreetMap keeps being edited, and a refetch would move their
points slightly, and every circuit built from them with it.

Ways, by game circuit (ids from OpenStreetMap):
  pit lanes: the raceway tagged as the pit lane beside each start/finish
  straight (several ways, end to end, where it is mapped in parts);
  the Monaco tunnel is Boulevard Louis II's tunnel section;
  the signature corners are the raceway ways named for them.
Monza, Suzuka, Albert Park (whose pit building goes up each year) and Las
Vegas have no pit lane mapped as a raceway there; build_tracks.py finds
theirs from the circuit's shape alone.
"""
import json
import math
import os
import sys
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
    "shanghai": 107371138,
    "jeddah": 1121870473,
    "miami": 1017340352,
    "imola": 196368195,
    # Barcelona's is mapped in three: the way in, the lane, the way out.
    "barcelona": (33742214, 178416729, 178416733),
    "montreal": 413000959,
    "redbullring": 289111668,
    "hungaroring": 231417580,
    "zandvoort": 38144527,
    "baku": 1513267145,
    "cota": 514836373,
    "mexico": (638504647, 772763791),
    # Lusail's: the way in from the last corner, then the lane.
    "losail": (1037707300, 196193732),
    # Yas Marina's runs beside the straight and under the track to turn 2.
    "yasmarina": (176695254, 176695255, 176695253),
    # The historic circuits (docs/superpowers/specs/2026-10-04-historic-cups-design.md).
    "hockenheim": 15446020,
    "nurburgring": 30815119,
    "estoril": 363050271,
    "kyalami": 793806972,
    "sepang": 144359483,
    "istanbul": 295742111,
    "mugello": 197788411,
    "watkinsglen": (50289311, 20164027),
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
    # The S is two ways in OpenStreetMap: turn 1, then turn 2.
    "interlagos": [((189535473, 807691487), "S DO SENNA", "")],
    # Imola's corners are mapped turn by turn (refs 2 to 19).
    "imola": [
        ((1025616638, 1025616639, 1021771405), "TAMBURELLO", ""),
        (1021771395, "TOSA", ""),
        ((1025616641, 7920430), "PIRATELLA", ""),
        ((1025616657, 1021771400, 1025616656), "ACQUE MINERALI", ""),
        ((1025616650, 1021771404), "RIVAZZA", ""),
    ],
    # The Red Bull Ring's other corners carry sponsors' names: not these two.
    "redbullring": [(822592403, "NIKI LAUDA KURVE", ""), (822592407, "RINDT", "")],
    "zandvoort": [
        (1311522212, "TARZANBOCHT", ""),
        (1311522216, "HUGENHOLTZBOCHT", ""),
        (1311566937, "SCHEIVLAK", ""),
        (1311879069, "ARIE LUYENDYKBOCHT", ""),
    ],
    # (No corner named for a sponsor: Hockenheim's Mobil 1, Sachs and Ravenol,
    # the Nürburgring's Ford, NGK and Goodyear, Sepang's Genting, Berjaya
    # Tioman and Sunway Lagoon.)
    "hockenheim": [(117570506, "PARABOLIKA", ""), (117568832, "SÜDKURVE", "")],
    "nurburgring": [(820330153, "SCHUMACHER-S", "")],
    "estoril": [(363138869, "PARABÓLICA", "AYRTON SENNA"), (638617010, "ORELHA", "")],
    "kyalami": [(1359379866, "CROWTHORNE", ""), (1359379870, "BARBEQUE", ""), (1359379871, "SUNSET", "")],
    "sepang": [(1561055757, "LANGKAWI", ""), (1561055764, "KENYIR LAKE", "")],
    "mugello": [(612265027, "SAN DONATO", ""), (612265004, "ARRABBIATA", ""), (612265034, "CORRENTAIO", "")],
    "watkinsglen": [(293208067, "THE NINETY", ""), ((293208063, 293208062, 293208064), "THE ESSES", ""), (293208068, "THE BOOT", "")],
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


def joined(ways, wid, label):
    """One line through a feature mapped as several ways, end to end."""
    geometry = []
    for i in (list(wid) if isinstance(wid, tuple) else [wid]):
        g = ways[i]["geometry"]
        if geometry and (g[-1]["lat"], g[-1]["lon"]) == (geometry[-1]["lat"], geometry[-1]["lon"]):
            g = g[::-1]
        # Each way must carry on from the one before.
        assert not geometry or (g[0]["lat"], g[0]["lon"]) == (geometry[-1]["lat"], geometry[-1]["lon"]), f"{label}: way {i} does not join the one before"
        geometry += g if not geometry else g[1:]
    return geometry


def main():
    ways_of = lambda w: list(w) if isinstance(w, tuple) else [w]
    path = os.path.join(HERE, "osm-features.json")
    old = {} if "--refresh" in sys.argv or not os.path.exists(path) else json.load(open(path))
    # What is already fetched, for the same way(s), stays as it is.
    have = lambda kind, gid, ways: kind in old and gid in old[kind] and old[kind][gid]["way"] in (ways, ways_of(ways))
    have_corners = lambda gid, corners: "corners" in old and gid in old["corners"] and [
        (c["way"], c["board"], c["aka"]) for c in old["corners"][gid]] == [(ways_of(w), b, a) for w, b, a in corners]
    ids = [i for g, w in PIT_LANES.items() if not have("pitLanes", g, w) for i in ways_of(w)]
    ids += [w for g, w in TUNNELS.items() if not have("tunnels", g, w)]
    ids += [i for g, cs in CORNERS.items() if not have_corners(g, cs) for c in cs for i in ways_of(c[0])]
    data = {"elements": []} if not ids else None
    query = f"[out:json][timeout:60];way(id:{','.join(map(str, ids))});out geom;"
    # The public Overpass servers are often busy: try each, a few times.
    for attempt in range(3 if data is None else 0):
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
        if have("pitLanes", gid, wid):
            out["pitLanes"][gid] = old["pitLanes"][gid]
            continue
        points, length = five_points(joined(ways, wid, gid))
        out["pitLanes"][gid] = {"way": wid if isinstance(wid, int) else ways_of(wid), "name": ways[ways_of(wid)[0]]["tags"].get("name", ""), "metres": length, "points": points}
    for gid, wid in TUNNELS.items():
        if have("tunnels", gid, wid):
            out["tunnels"][gid] = old["tunnels"][gid]
            continue
        points, length = five_points(ways[wid]["geometry"])
        out["tunnels"][gid] = {"way": wid, "name": ways[wid]["tags"].get("name", ""), "metres": length, "points": points}
    for gid, corners in CORNERS.items():
        if have_corners(gid, corners):
            out["corners"][gid] = old["corners"][gid]
            continue
        out["corners"][gid] = []
        for wid, board, aka in corners:
            # A corner mapped as several ways, end to end: one line through them.
            points, length = five_points(joined(ways, wid, board))
            out["corners"][gid].append({"way": ways_of(wid), "name": ways[ways_of(wid)[0]]["tags"].get("name", ""), "board": board, "aka": aka, "metres": length, "points": points})
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
