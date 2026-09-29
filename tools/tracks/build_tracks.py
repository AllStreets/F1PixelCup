"""Build tracks-data.js from the real circuit outlines.

Source: bacinger/f1-circuits (MIT), one GeoJSON LineString per circuit,
traced from satellite imagery. Download it next to this script first:

    curl -L -o tools/tracks/f1-circuits.geojson \
      https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson
    python3 tools/tracks/build_tracks.py            # writes tracks-data.js
    python3 tools/tracks/build_tracks.py --plot DIR # also writes overlay PNGs

Every circuit gets the same scale, so Spa stays the longest and Monaco the
shortest. The game's road is wider than a real one relative to its cars, so
two things are adjusted, locally and only where needed:

- corners tighter than the road can turn are opened out to a minimum radius;
- sections that would overlap once widened are nudged apart.

Suzuka really does cross itself; the crossing is kept and reported as a bridge
for the 3D renderer to lift.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

SCALE = 1.3            # game units per metre
HALF_WIDTH = 49.5      # road half-width in game units (roadWidth 33 * 1.5)
MIN_RADIUS = 58        # centreline radius the road can turn without folding
SEPARATION = 150       # closest two unrelated stretches of centreline may get
WAYPOINT_STEP = 30     # spacing of the physics polyline
MARGIN = 420           # clear space around the circuit inside the world box

# Game id -> dataset id, and whether the dataset runs the wrong way round.
CIRCUITS = {
    "monza": ("it-1922", False),
    "spa": ("be-1925", False),
    "silverstone": ("gb-1948", False),
    "suzuka": ("jp-1962", False),
    "monaco": ("mc-1929", False),
    "singapore": ("sg-2008", True),   # Marina Bay runs anticlockwise
    "bahrain": ("bh-2002", False),
    "interlagos": ("br-1940", False),
}


def project(coords):
    lat0 = sum(c[1] for c in coords) / len(coords)
    lon0 = sum(c[0] for c in coords) / len(coords)
    k = math.pi / 180 * 6371000
    # Game y grows downwards, so north is up on the mini map.
    return [((c[0] - lon0) * math.cos(math.radians(lat0)) * k, -(c[1] - lat0) * k) for c in coords]


def resample(pts, step):
    ring = pts + [pts[0]]
    acc = [0.0]
    for a, b in zip(ring, ring[1:]):
        acc.append(acc[-1] + math.dist(a, b))
    total = acc[-1]
    n = max(8, round(total / step))
    out, j = [], 0
    for i in range(n):
        s = i * total / n
        while acc[j + 1] < s:
            j += 1
        seg = acc[j + 1] - acc[j] or 1
        t = (s - acc[j]) / seg
        a, b = ring[j], ring[j + 1]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def length(pts):
    return sum(math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))


def radius_at(pts, i, k):
    n = len(pts)
    a, b, c = pts[(i - k) % n], pts[i], pts[(i + k) % n]
    area2 = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    if area2 < 1e-9:
        return float("inf")
    return math.dist(a, b) * math.dist(b, c) * math.dist(a, c) / (2 * area2)


def seg_cross(p1, p2, p3, p4):
    d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
    if abs(d) < 1e-12:
        return None
    t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d
    u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d
    if 0 < t < 1 and 0 < u < 1:
        return t, u
    return None


def find_crossings(pts, step):
    n = len(pts)
    found = []
    for i in range(n):
        for j in range(i + 3, n):
            if n - (j - i) < 3:
                continue
            hit = seg_cross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])
            if hit:
                found.append((i, j))
    return found


def arc_gap(i, j, n):
    d = abs(i - j)
    return min(d, n - d)


def relax(pts, crossings, step, report):
    """Open out tight corners and push apart stretches that would overlap."""
    import numpy as np
    P = np.array(pts, dtype=float)
    falloff = 6
    kern = np.exp(-(np.arange(-falloff, falloff + 1) ** 2) / (2 * (falloff / 2) ** 2))
    kern /= kern.sum()
    shield = int(SEPARATION * 2.2 / step)
    near = int(SEPARATION * 1.6 / step)
    k = max(2, round(MIN_RADIUS * 0.5 / step))

    def masks(n, cross):
        idx = np.arange(n)
        gap = np.abs(idx[:, None] - idx[None, :])
        gap = np.minimum(gap, n - gap)
        allowed = gap >= near
        # Around a genuine crossing the two passes may overlap: it is a bridge.
        for a, b in cross:
            ga = np.minimum(np.abs(idx - a), n - np.abs(idx - a)) < shield
            gb = np.minimum(np.abs(idx - b), n - np.abs(idx - b)) < shield
            allowed &= ~(ga[:, None] & gb[None, :])
            allowed &= ~(gb[:, None] & ga[None, :])
        return allowed

    n = len(P)
    cross = list(crossings)
    allowed = masks(n, cross)
    it = 0
    for it in range(1500):
        d = P[None, :, :] - P[:, None, :]          # d[i, j] = P[j] - P[i]
        dist = np.hypot(d[..., 0], d[..., 1]) + 1e-9
        viol = allowed & (dist < SEPARATION)
        push = np.where(viol, (SEPARATION - dist) * 0.25, 0.0)
        u = d / dist[..., None]
        # Each point is pushed away from every too-close point.
        raw = -(push[..., None] * u).sum(axis=1)
        # Spread the push along the track so the stretch moves, not a vertex.
        disp = np.zeros_like(P)
        for off, w in zip(range(-falloff, falloff + 1), kern):
            disp += np.roll(raw, off, axis=0) * w
        # Minimum radius.
        a = np.roll(P, k, axis=0)
        c = np.roll(P, -k, axis=0)
        ab = np.hypot(*(P - a).T)
        bc = np.hypot(*(c - P).T)
        ac = np.hypot(*(c - a).T)
        area2 = np.abs((P[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (P[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]))
        rad = ab * bc * ac / (2 * area2 + 1e-9)
        tight = rad < MIN_RADIUS
        mid = (a + c) / 2
        disp[tight] += (mid[tight] - P[tight]) * 0.3
        # Small steps, so the relaxation settles instead of oscillating.
        mag = np.hypot(*disp.T)
        cap = 3.0
        disp *= np.minimum(1.0, cap / (mag + 1e-9))[:, None]
        P = P + disp
        moved = np.hypot(*disp.T).max()
        assert len(P) < 5000, "relaxation diverged"
        if it % 5 == 4:
            new = resample([tuple(p) for p in P], step)
            if len(new) != n:
                scale = len(new) / n
                cross = [(round(i * scale), round(j * scale)) for i, j in cross]
                n = len(new)
                allowed = masks(n, cross)
            P = np.array(new)
        if moved < 0.05 and not viol.any() and not tight.any():
            break
    report["relax_iterations"] = it + 1
    report["still_tight"] = int(tight.sum())
    report["still_close"] = int(viol.sum() // 2)
    return [tuple(p) for p in P]


def curvature_series(pts, k):
    n = len(pts)
    out = []
    for i in range(n):
        a, b, c = pts[(i - k) % n], pts[i], pts[(i + k) % n]
        h1 = math.atan2(b[1] - a[1], b[0] - a[0])
        h2 = math.atan2(c[1] - b[1], c[0] - b[0])
        d = (h2 - h1 + math.pi) % (2 * math.pi) - math.pi
        out.append(d)
    return out


def tangent(pts, i):
    n = len(pts)
    a, b = pts[(i - 1) % n], pts[(i + 1) % n]
    L = math.dist(a, b) or 1
    return (b[0] - a[0]) / L, (b[1] - a[1]) / L


def clear_of_track(pts, x, y, need):
    for p in pts:
        if abs(p[0] - x) < need and abs(p[1] - y) < need and math.dist(p, (x, y)) < need:
            return False
    return True


def footprint_clear(pts, x, y, angle, half_len, half_depth, need):
    """Sample the rectangle's outline and interior against the centreline."""
    ca, sa = math.cos(angle), math.sin(angle)
    for u in (-1, -0.5, 0, 0.5, 1):
        for v in (-1, 0, 1):
            lx, ly = u * half_len, v * half_depth
            px = x + lx * ca - ly * sa
            py = y + lx * sa + ly * ca
            if not clear_of_track(pts, px, py, need):
                return False
    return True


def place_scenery(pts, report):
    """Grandstands on the main straight and at the big corners, plus billboards
    and towers. Everything is checked against the whole circuit, not just the
    nearest stretch, so nothing can end up on the road."""
    n = len(pts)
    curv = curvature_series(pts, 3)
    clearance = HALF_WIDTH + 70  # beyond the barrier line in the renderer
    decor = []
    placed = []

    def try_place(i, side, kind, half_len, half_depth, extra):
        tx, ty = tangent(pts, i)
        nx, ny = -ty, tx
        for push in (0, 25, 50, 80, 120):
            dist = HALF_WIDTH + extra + half_depth + push
            x = pts[i][0] + nx * side * dist
            y = pts[i][1] + ny * side * dist
            # Long side runs along the track; "angle" is the long axis.
            angle = math.atan2(ty, tx)
            if not footprint_clear(pts, x, y, angle, half_len, half_depth, clearance):
                continue
            if any(math.dist((x, y), q[:2]) < q[2] + max(half_len, half_depth) for q in placed):
                continue
            face = math.atan2(pts[i][1] - y, pts[i][0] - x)
            decor.append({"type": kind, "x": round(x), "y": round(y), "angle": round(angle, 3),
                          "face": round(face, 3)})
            placed.append((x, y, max(half_len, half_depth)))
            return True
        return False

    # Main straight: stands on both sides just before the line.
    for off in (-3, -9):
        i = off % n
        try_place(i, 1, "grandstand", 75, 34, 45)
        try_place(i, -1, "grandstand", 75, 34, 45)
    # The biggest corners get a stand on the outside.
    corners = []
    i = 0
    while i < n:
        if abs(curv[i]) > 0.09:
            j = i
            total = 0
            while j < n and abs(curv[j]) > 0.04:
                total += curv[j]
                j += 1
            mid = (i + j) // 2
            corners.append((abs(total), mid, 1 if total < 0 else -1))
            i = j + 1
        else:
            i += 1
    corners.sort(reverse=True)
    stands = 0
    for _, mid, outside in corners:
        if stands >= 7:
            break
        # The outside of a right-hander (positive turn, y down) is on the left.
        if try_place(mid, -outside, "grandstand", 75, 34, 60):
            stands += 1
    # Billboards and towers spread round the lap.
    for k in range(0, n, max(1, n // 14)):
        side = 1 if (k // max(1, n // 14)) % 2 else -1
        try_place(k, side, "billboard", 32, 6, 50)
    for k in range(n // 16, n, max(1, n // 7)):
        try_place(k, (-1) ** k, "tower", 22, 22, 110)
    report["grandstands"] = sum(1 for d in decor if d["type"] == "grandstand")
    return decor


# Keep boxes out of the start zone: the 20-car grid, with margin, lies within
# this of the line. It must equal grid.js START_ZONE_BEFORE, which the game
# uses to drop any box that lands there; tests/track-boxes.test.js checks the
# two agree.
START_ZONE_BEFORE = 640


def place_item_boxes(pts, bridges=()):
    """Rows of three across the road on the straightest stretches, between a
    launch run after the line and the start zone before it, and never at a
    crossover (under or on the bridge)."""
    n = len(pts)
    curv = curvature_series(pts, 3)
    rows = 5
    boxes = []
    skip = max(1, int(450 / WAYPOINT_STEP))
    # Index of the last point that is clear of the start zone.
    run, dist = 0.0, []
    for i in range(n):
        dist.append(run)
        run += math.dist(pts[i], pts[(i + 1) % n])
    end = max(i for i in range(n) if dist[i] <= run - START_ZONE_BEFORE - WAYPOINT_STEP) + 1

    def near_bridge(i):
        return any(min(abs(i - k), n - abs(i - k)) <= 7 for b in bridges for k in (b["under"], b["over"]))

    for r in range(rows):
        lo = skip + (end - skip) * r // rows
        hi = skip + (end - skip) * (r + 1) // rows
        candidates = [i for i in range(lo, hi) if not near_bridge(i)]
        assert candidates, "a box row has nowhere to go"
        best = min(candidates, key=lambda i: sum(abs(curv[(i + d) % n]) for d in range(-2, 3)))
        tx, ty = tangent(pts, best)
        nx, ny = -ty, tx
        for lane in (-0.5, 0, 0.5):
            boxes.append({"x": round(pts[best][0] + nx * lane * HALF_WIDTH, 1),
                          "y": round(pts[best][1] + ny * lane * HALF_WIDTH, 1)})
    return boxes


def main():
    src = os.path.join(HERE, "f1-circuits.geojson")
    data = json.load(open(src))
    by_id = {f["properties"]["id"]: f for f in data["features"]}
    plot_dir = sys.argv[sys.argv.index("--plot") + 1] if "--plot" in sys.argv else None
    out = {}
    for game_id, (src_id, reverse) in CIRCUITS.items():
        feat = by_id[src_id]
        coords = feat["geometry"]["coordinates"]
        raw = project(coords)
        if math.dist(raw[0], raw[-1]) < 1:
            raw = raw[:-1]
        if reverse:
            raw = raw[::-1]
        real_len = length(raw)
        scaled = [(x * SCALE, y * SCALE) for x, y in raw]
        fine_step = 12
        fine = resample(scaled, fine_step)
        report = {"real_m": round(real_len)}
        crossings = find_crossings(fine, fine_step)
        report["crossings"] = len(crossings)
        relaxed = relax(fine, crossings, fine_step, report)
        # Keep the start/finish line where the source puts it: the first
        # vertex. Find the relaxed point nearest to it and start there.
        s0 = min(range(len(relaxed)), key=lambda i: math.dist(relaxed[i], scaled[0]))
        relaxed = relaxed[s0:] + relaxed[:s0]
        pts = resample(relaxed, WAYPOINT_STEP)
        min_x = min(p[0] for p in pts)
        min_y = min(p[1] for p in pts)
        pts = [(x - min_x + MARGIN, y - min_y + MARGIN) for x, y in pts]
        scaled_shift = [(x - min_x + MARGIN, y - min_y + MARGIN) for x, y in scaled]
        world_w = max(p[0] for p in pts) + MARGIN
        world_h = max(p[1] for p in pts) + MARGIN

        # Deviation from the true outline, for the report.
        dev = max(min(math.dist(p, q) for q in resample(scaled_shift, 6)) for p in pts)
        report["max_deviation_units"] = round(dev)
        report["lap_units"] = round(length(pts))
        gap = float("inf")
        n = len(pts)
        cross_idx = find_crossings(pts, WAYPOINT_STEP)
        for i in range(n):
            for j in range(i + 12, n):
                if n - (j - i) < 12:
                    continue
                if any(min(abs(i - a), n - abs(i - a)) < 12 and min(abs(j - b), n - abs(j - b)) < 12 for a, b in cross_idx):
                    continue
                gap = min(gap, math.dist(pts[i], pts[j]))
        report["min_gap_units"] = round(gap)

        bridges = []
        if crossings:
            # The later pass over the crossing is the one on the bridge.
            fin = find_crossings(pts, WAYPOINT_STEP)
            for i, j in fin:
                bridges.append({"under": i, "over": j})
            report["bridges"] = bridges
        decor = place_scenery(pts, report)
        boxes = place_item_boxes(pts, bridges)
        out[game_id] = {
            "source": src_id,
            "world": {"width": round(world_w), "height": round(world_h)},
            "points": [{"x": round(x, 1), "y": round(y, 1)} for x, y in pts],
            "bridges": bridges,
            "decor": decor,
            "itemBoxes": boxes,
        }
        print(game_id, report, file=sys.stderr)
        if plot_dir:
            plot(game_id, scaled_shift, pts, decor, boxes, plot_dir)

    js = ("// Generated by tools/tracks/build_tracks.py from bacinger/f1-circuits (MIT).\n"
          "// Real circuit outlines, scaled to game units. Do not edit by hand.\n"
          "const TRACK_SHAPES = " + json.dumps(out, separators=(",", ":")) + ";\n")
    open(os.path.join(ROOT, "tracks-data.js"), "w").write(js)


def plot(game_id, true_pts, pts, decor, boxes, plot_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(8, 8))
    tx = [p[0] for p in true_pts] + [true_pts[0][0]]
    ty = [p[1] for p in true_pts] + [true_pts[0][1]]
    ax.plot(tx, ty, color="#bbbbbb", lw=6, label="real outline")
    gx = [p[0] for p in pts] + [pts[0][0]]
    gy = [p[1] for p in pts] + [pts[0][1]]
    ax.plot(gx, gy, color="#dc0000", lw=1.4, label="game centreline")
    ax.plot(pts[0][0], pts[0][1], "ko", ms=8)
    ax.annotate("", xy=pts[4], xytext=pts[0], arrowprops=dict(arrowstyle="->", lw=2))
    for d in decor:
        c = {"grandstand": "#0060ff", "billboard": "#e8bf00", "tower": "#555"}[d["type"]]
        ax.plot(d["x"], d["y"], "s", color=c, ms=5)
    for b in boxes:
        ax.plot(b["x"], b["y"], "^", color="#00a000", ms=4)
    ax.set_aspect("equal")
    ax.invert_yaxis()
    ax.set_title(game_id)
    ax.legend(loc="lower right")
    fig.savefig(os.path.join(plot_dir, f"{game_id}.png"), dpi=70)
    plt.close(fig)


if __name__ == "__main__":
    main()
