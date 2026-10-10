"""Build the Las Vegas Strip: every tall building round the circuit, where it
really stands, and the Strip's landmarks by hand, and export them to
assets/landmarks/vegas_strip.glb (docs/superpowers/specs/2026-10-05-vegas-strip-design.md).

Run headless, so it never touches an open Blender session:

  F1_LANDMARKS_OUT=assets/landmarks Blender -b --factory-startup -P tools/blender/build_vegas.py
  node tools/compress-models.mjs assets/landmarks/vegas_strip.glb

Set F1_LANDMARKS_PREVIEW=<dir> to also render it there for review.

The buildings come from tools/vegas/strip.json (OpenStreetMap, ODbL; see
tools/vegas/build_strip_data.py): each footprint extruded to its height, its
walls the window shader's (UVs in metres round the walls, v up), its colour
in its vertex colours (alpha: 1 stone, lower glass), a band of light round
the top of the tall ones in its resort's colour. The landmarks are built by
hand on their anchors, in proportion from public photographs used only as
reference: the half-scale Eiffel Tower and the balloon, the Arc de Triomphe,
the campanile, the Doge's Palace front and the Rialto bridge, the Colosseum,
the High Roller, the Statue of Liberty, the Luxor's pyramid, sphinx and beam,
the Strat's tower, the Bellagio's lake and fountains, the LED walls. No
names, logos or marks on anything.

Real metres, x east, y north, z up, the origin the circuit's own projection
centre (the game puts it at strip.json's origin.game, at 1.3 units a metre:
the circuit map's own scale, so every building stands where it does in life
relative to the streets the circuit runs on).
"""
import bpy
import json
import math
import os
import sys
from mathutils import Vector

if (bpy.data.filepath or bpy.data.is_dirty) and os.environ.get("F1_BUILD_FORCE") != "1":
    raise RuntimeError("build_vegas.py clears the scene, and this one has work in it. Use a new file, or set F1_BUILD_FORCE=1.")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from landmark_kit import *  # noqa: E402,F401,F403
from landmark_kit import PALETTE, Mesh, tube, empty, clear, subtree, bounds, tris  # noqa: E402
import landmark_kit  # noqa: E402

DATA = json.load(open(os.path.join(HERE, "..", "vegas", "strip.json")))

PALETTE.update({
    "facade_vegas": ((0.85, 0.82, 0.76), 0.3, 0.35),
    "roof_flat": ((0.32, 0.32, 0.34), 0.0, 0.9),
    "neon": ((1.0, 1.0, 1.0), 0.0, 0.5),
    "video": ((0.2, 0.2, 0.3), 0.0, 0.5),
    "fountain": ((0.9, 0.95, 1.0), 0.0, 0.3),
    "lake": ((0.05, 0.12, 0.18), 0.2, 0.1),
    "beam": ((0.9, 0.95, 1.0), 0.0, 0.5),
    "eiffel": ((0.42, 0.3, 0.18), 0.6, 0.45),
    "balloon": ((0.12, 0.2, 0.55), 0.0, 0.5),
    "brick": ((0.62, 0.32, 0.22), 0.0, 0.85),
    "roof_green": ((0.32, 0.55, 0.45), 0.4, 0.5),
    "copper_green": ((0.38, 0.6, 0.52), 0.3, 0.6),
    "black_glass": ((0.03, 0.035, 0.045), 0.6, 0.08),
    "sandstone": ((0.82, 0.7, 0.5), 0.0, 0.9),
    "roof_red": ((0.82, 0.07, 0.06), 0.2, 0.5),
    "roof_blue": ((0.07, 0.2, 0.8), 0.2, 0.5),
    "roof_gold": ((0.95, 0.7, 0.12), 0.8, 0.35),
    "doge_pink": ((0.86, 0.62, 0.58), 0.0, 0.85),
})

from vegas_resorts import (F, STONE, PLAIN, GLASS, STYLES, VMesh, light_bar, ccw, tidy, walls, ring, RESORT_OF, band, arch, offset, tone, building, prepare)  # noqa: E402

# (The towers the map leaves unnamed belong to their resorts everywhere
# here: the signs, the screens and the placing with them.)
for _b in DATA["buildings"]:
    _b["resort"] = RESORT_OF.get(_b["id"], _b["resort"])
prepare(DATA)


# =============================================================================
# The landmarks, by hand
# =============================================================================

def frame(anchor):
    """A landmark's frame: its anchor, turned so its front (+Y) faces the
    circuit."""
    a = DATA["anchors"][anchor]
    turn = a["facing"] - math.pi / 2
    c, s = math.cos(turn), math.sin(turn)
    return lambda x, y, z=0.0: (a["x"] + x * c - y * s, a["y"] + x * s + y * c, z)


def eiffel(parent):
    """The half-scale Eiffel Tower (165 m): four lattice legs curving in to
    the first platform, the tower's taper above (each face braced in X),
    the two platforms with their rails, the top and its mast; lit gold."""
    at = frame("eiffel")
    m = Mesh("eiffel")
    side = lambda z: 62.0 * math.exp(-z / 47.0) + 1.0
    # The legs: from each corner to the second platform, where they meet.
    levels = [0.0, 7.0, 14.0, 21.0, 28.5, 36.0, 43.0, 50.0, 57.5]
    for sx in (-1, 1):
        for sy in (-1, 1):
            prev = None
            for z in levels:
                half = side(z) / 2
                leg = max(1.8, 8.5 * (1 - z / 70))
                cx, cy = sx * (half - leg / 2), sy * (half - leg / 2)
                sq = [(cx - leg / 2, cy - leg / 2), (cx + leg / 2, cy - leg / 2), (cx + leg / 2, cy + leg / 2), (cx - leg / 2, cy + leg / 2)]
                cur = [at(x, y, z) for x, y in sq]
                if prev:
                    for k in range(4):
                        a0, a1, b0, b1 = prev[k], prev[(k + 1) % 4], cur[k], cur[(k + 1) % 4]
                        tube(m, a0, b0, 0.28, "eiffel", 4)
                        tube(m, a0, b1, 0.16, "eiffel", 3)
                        tube(m, a1, b0, 0.16, "eiffel", 3)
                prev = cur
    # The arches between the legs at the foot.
    for k in range(4):
        t0 = k * math.pi / 2
        for s in range(10):
            f0, f1 = s / 10, (s + 1) / 10
            half = side(0) / 2 - 6
            p = lambda f: (-half + 2 * half * f, 0.0, 9.0 + 9.0 * math.sin(math.pi * f))
            (x0, _, z0), (x1, _, z1) = p(f0), p(f1)
            c, sn = math.cos(t0), math.sin(t0)
            d = side(z0) / 2
            tube(m, at(x0 * c - (-d) * sn, x0 * sn + (-d) * c, z0), at(x1 * c - (-d) * sn, x1 * sn + (-d) * c, z1), 0.35, "eiffel", 4)
    # Above the second platform: the tower, its four corner members and X bracing.
    zs = [57.5 + (138.0 - 57.5) * (k / 12) ** 0.9 for k in range(13)]
    prev = None
    for z in zs:
        half = side(z) / 2
        cur = [at(sx * half, sy * half, z) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        if prev:
            for k in range(4):
                tube(m, prev[k], cur[k], 0.45, "eiffel", 4)
                tube(m, prev[k], cur[(k + 1) % 4], 0.14, "eiffel", 3)
                tube(m, prev[(k + 1) % 4], cur[k], 0.14, "eiffel", 3)
        prev = cur
    # The platforms and the top.
    for z, half in ((28.5, side(28.5) / 2 + 1.5), (57.5, side(57.5) / 2 + 1.0), (136.0, side(136) / 2 + 1.2)):
        pts = [at(sx * half, sy * half, z) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        m.face([p for p in pts], "eiffel")
        m.face([(x, y, zz - 1.2) for x, y, zz in reversed(pts)], "eiffel")
        for k in range(4):
            a, b = pts[k], pts[(k + 1) % 4]
            m.face([(a[0], a[1], a[2] - 1.2), (b[0], b[1], b[2] - 1.2), b, a], "eiffel")
            tube(m, (a[0], a[1], a[2] + 1.1), (b[0], b[1], b[2] + 1.1), 0.08, "eiffel", 3)
    tube(m, at(0, 0, 136.0), at(0, 0, 146.0), 1.8, "eiffel", 8)
    tube(m, at(0, 0, 146.0), at(0, 0, 165.0), 0.5, "eiffel", 6)
    ob = m.finish(parent=parent)
    # Its lights: a beacon at the top, and a string up each corner.
    li = VMesh("eiffel_lights")
    gold = (1.0, 0.78, 0.42, 1.0)
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        pts = [at(sx * (side(z) / 2 + 0.6), sy * (side(z) / 2 + 0.6), z) for z in [0.4 + k * 139.6 / 20 for k in range(21)]]
        for a, b in zip(pts, pts[1:]):
            light_bar(li, a, b, 0.36, gold)
    # The beacon: a closed cone of light round the mast.
    rim = [at(math.cos(2 * math.pi * k / 8) * 1.4, math.sin(2 * math.pi * k / 8) * 1.4, 147) for k in range(8)]
    for k in range(8):
        li.cface([rim[k], rim[(k + 1) % 8], at(0, 0, 150)], "neon", (1.0, 0.9, 0.7, 1.0))
    li.cface(list(reversed(rim)), "neon", (1.0, 0.9, 0.7, 1.0))
    li.finish(parent=ob)
    return ob


def balloon(parent):
    """The balloon in front of the hotel (46 m): a hot-air balloon's
    envelope, blue with gold, its meridians and rings in light at night, on
    its stand. No lettering."""
    at = frame("balloon")
    m = VMesh("balloon")
    prof = [(0.0, 10.0), (3.2, 10.5), (6.0, 13.0), (10.0, 18.0), (13.5, 24.0), (15.0, 31.0), (14.5, 37.0), (12.0, 41.5), (7.5, 44.6), (0.0, 46.0)]
    segs = 24
    rows = [[at(math.cos(2 * math.pi * k / segs) * r, math.sin(2 * math.pi * k / segs) * r, z) for k in range(segs)] for r, z in prof]
    for i, (r0, r1) in enumerate(zip(rows, rows[1:])):
        for k in range(segs):
            j = (k + 1) % segs
            pts = [r0[k], r0[j], r1[j], r1[k]]
            if prof[i][0] < 1e-3:
                pts = [r0[k], r1[j], r1[k]]
            elif prof[i + 1][0] < 1e-3:
                pts = [r0[k], r0[j], r1[k]]
            # Its gores: blue, every fourth gold.
            m.cface(pts, "roof_gold" if k % 4 == 0 else "balloon")
    # The neon: a ring at the widest and meridians.
    gold = (1.0, 0.8, 0.35, 1.0)
    for i in range(1, len(prof) - 1):
        r, z = prof[i]
        if i in (3, 5, 7):
            ring = [at(math.cos(2 * math.pi * k / segs) * (r + 0.25), math.sin(2 * math.pi * k / segs) * (r + 0.25), z) for k in range(segs)]
            for k in range(segs):
                a, b = ring[k], ring[(k + 1) % segs]
                m.cface([a, b, (b[0], b[1], b[2] + 0.5), (a[0], a[1], a[2] + 0.5)], "neon", gold)
                m.cface([(a[0], a[1], a[2] + 0.5), (b[0], b[1], b[2] + 0.5), b, a], "neon", gold)
    m.finish(parent=parent)
    s = Mesh("balloon_stand")
    s.lathe([(0.0, 0.0), (9.0, 0.0), (9.0, 3.0), (3.0, 3.6), (2.2, 10.0), (0.0, 10.0)], (0, 0), "stone", segs=16, smooth=False)
    ob = s.finish(parent=parent)
    ob.location = Vector(at(0, 0, 0))
    return ob


def arc(parent):
    """The Arc de Triomphe (about two thirds of the real one): its great arch
    through it, the smaller arches through its sides, the cornice and attic."""
    at = frame("arc")
    m = Mesh("arc")
    W, D, H = 30.0, 15.0, 33.0
    # Four piers and the mass over the arches.
    for x0, x1 in ((-W / 2, -7.0), (7.0, W / 2)):
        for y0, y1 in ((-D / 2, -2.5), (2.5, D / 2)):
            pts = [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]
            m.prism([(p[0], p[1]) for p in pts], 0.0, 22.0, "stone")
    # The vault over the great arch: a span from 18 m up.
    outline = [at(-W / 2, -D / 2), at(W / 2, -D / 2), at(W / 2, D / 2), at(-W / 2, D / 2)]
    m.prism([(p[0], p[1]) for p in outline], 22.0, H - 3.0, "stone")
    big = [at(-W / 2 - 0.6, -D / 2 - 0.6), at(W / 2 + 0.6, -D / 2 - 0.6), at(W / 2 + 0.6, D / 2 + 0.6), at(-W / 2 - 0.6, D / 2 + 0.6)]
    m.prism([(p[0], p[1]) for p in big], H - 3.0, H - 2.0, "stone_dark")
    m.prism([(p[0], p[1]) for p in outline], H - 2.0, H, "stone")
    # The arch's curve under the vault, front and back.
    for sy in (-1, 1):
        y = sy * (D / 2 + 0.05)
        pts = [at(-7.0, y, 18.0)] + [at(-7.0 * math.cos(math.pi * k / 10), y, 18.0 + 4.0 * math.sin(math.pi * k / 10)) for k in range(11)] + [at(7.0, y, 22.0), at(-7.0, y, 22.0)]
        m.face(pts if sy > 0 else list(reversed(pts)), "stone")
    return m.finish(parent=parent)


def campanile(parent):
    """The campanile (96 m): its brick shaft, the belfry's arches, the
    cornice and attic, the green pyramid spire and its gilded top."""
    at = frame("campanile")
    m = Mesh("campanile")
    sq = lambda h: [(at(sx * h, sy * h)[0], at(sx * h, sy * h)[1]) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    m.prism(sq(6.5), 0.0, 58.0, "brick")
    for z in (14.0, 30.0, 46.0):
        m.prism(sq(6.8), z, z + 0.6, "stone")
    m.prism(sq(7.0), 58.0, 60.0, "stone")
    # The belfry: four piers at the corners, arches between, the bells' room.
    m.prism(sq(4.8), 60.0, 71.0, "black_glass")
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        c = at(sx * 5.6, sy * 5.6)
        m.lathe([(1.3, 60.0), (1.3, 71.0)], (c[0], c[1]), "stone", segs=6, smooth=False)
    for k in range(4):
        t = k * math.pi / 2
        for j in (-1, 0, 1):
            c = at(math.cos(t) * 6.6 - math.sin(t) * j * 3.0, math.sin(t) * 6.6 + math.cos(t) * j * 3.0)
            m.lathe([(0.45, 60.0), (0.45, 68.0)], (c[0], c[1]), "stone", segs=6, smooth=False)
    m.prism(sq(7.2), 71.0, 73.0, "stone")
    m.prism(sq(6.2), 73.0, 80.0, "brick")
    m.prism(sq(6.6), 80.0, 81.0, "stone")
    c = at(0, 0)
    m.lathe([(6.0, 81.0), (0.6, 94.0), (0.0, 94.5)], (c[0], c[1]), "roof_green", segs=4, smooth=False)
    m.lathe([(0.0, 94.0), (0.5, 94.0), (0.3, 96.0), (0.0, 96.5)], (c[0], c[1]), "roof_gold", segs=6)
    return m.finish(parent=parent)


def doges(parent):
    """The Doge's Palace front by the Strip, south of the campanile: an open
    arcade below, a loggia of pointed arches over it, the pink wall above
    with its few large windows, the crenellated parapet."""
    at = frame("campanile")
    m = Mesh("doges_palace")
    L, D = 70.0, 14.0
    x0 = 10.0
    # (Set back from the Strip behind the campanile's line: the game's road
    # and run-off are wider than the real street.)
    back = -24.0
    at0 = at
    at = lambda x, y, z=0.0: at0(x, y + back, z)
    base = [at(x0, -D / 2), at(x0 + L, -D / 2), at(x0 + L, D / 2), at(x0, D / 2)]
    m.prism([(p[0], p[1]) for p in base], 0.0, 4.0, "stone")
    m.prism([(p[0], p[1]) for p in base], 12.0, 24.0, "doge_pink")
    m.prism([(p[0], p[1]) for p in base], 4.0, 12.0, "black_glass")
    for k in range(18):
        x = x0 + 2.0 + k * (L - 4.0) / 17
        c = at(x, D / 2 + 0.6)
        m.lathe([(0.7, 0.0), (0.7, 4.2)], (c[0], c[1]), "stone", segs=6, smooth=False)
    for k in range(34):
        x = x0 + 1.2 + k * (L - 2.4) / 33
        c = at(x, D / 2 + 0.4)
        m.lathe([(0.35, 4.0), (0.35, 11.5)], (c[0], c[1]), "stone", segs=5, smooth=False)
    for k in range(7):
        x = x0 + 6 + k * (L - 12) / 6
        p = [at(x - 1.6, D / 2 + 0.05, 15.0), at(x + 1.6, D / 2 + 0.05, 15.0), at(x + 1.6, D / 2 + 0.05, 19.5), at(x, D / 2 + 0.05, 21.0), at(x - 1.6, D / 2 + 0.05, 19.5)]
        m.face(p, "black_glass")
    for k in range(40):
        x = x0 + 0.5 + k * (L - 1.0) / 40
        p = [(at(x, -D / 2)[0], at(x, -D / 2)[1]), (at(x + 1.0, -D / 2)[0], at(x + 1.0, -D / 2)[1]), (at(x + 1.0, D / 2)[0], at(x + 1.0, D / 2)[1]), (at(x, D / 2)[0], at(x, D / 2)[1])]
        m.prism(p, 24.0, 25.6, "stone")
    return m.finish(parent=parent)


def rialto(parent):
    """The Rialto bridge over the canal by the Strip: a single stone arch,
    the arcades of shops along its deck, the central portico."""
    at = frame("rialto")
    m = Mesh("rialto")
    L, W = 34.0, 14.0
    rows_top, rows_bot = [], []
    for k in range(17):
        f = k / 16
        x = -L / 2 + L * f
        z_deck = 4.0 + 5.0 * math.sin(math.pi * f)
        z_under = 1.0 + 6.0 * math.sin(math.pi * f) ** 1.2
        rows_top.append((x, z_deck))
        rows_bot.append((x, z_under))
    for sy in (-1, 1):
        y = sy * W / 2
        pts = [at(x, y, z) for x, z in rows_top] + [at(x, y, z) for x, z in reversed(rows_bot)]
        m.face(pts if sy > 0 else list(reversed(pts)), "stone")
    for (xa, za), (xb, zb) in zip(rows_top, rows_top[1:]):
        m.face([at(xa, -W / 2, za), at(xb, -W / 2, zb), at(xb, W / 2, zb), at(xa, W / 2, za)], "stone")
    for (xa, za), (xb, zb) in zip(rows_bot, rows_bot[1:]):
        m.face([at(xa, W / 2, za), at(xb, W / 2, zb), at(xb, -W / 2, zb), at(xa, -W / 2, za)], "stone")
    m.face([at(-L / 2, W / 2, 4.0), at(-L / 2, W / 2, 1.0), at(-L / 2, -W / 2, 1.0), at(-L / 2, -W / 2, 4.0)], "stone")
    m.face([at(L / 2, -W / 2, 4.0), at(L / 2, -W / 2, 1.0), at(L / 2, W / 2, 1.0), at(L / 2, W / 2, 4.0)], "stone")
    # The portico at the crown.
    p = [(at(-4, -W / 2)[0], at(-4, -W / 2)[1]), (at(4, -W / 2)[0], at(4, -W / 2)[1]), (at(4, W / 2)[0], at(4, W / 2)[1]), (at(-4, W / 2)[0], at(-4, W / 2)[1])]
    m.prism(p, 9.0, 15.0, "stone")
    q = [(at(-4.6, -W / 2 - 0.6)[0], at(-4.6, -W / 2 - 0.6)[1]), (at(4.6, -W / 2 - 0.6)[0], at(4.6, -W / 2 - 0.6)[1]), (at(4.6, W / 2 + 0.6)[0], at(4.6, W / 2 + 0.6)[1]), (at(-4.6, W / 2 + 0.6)[0], at(-4.6, W / 2 + 0.6)[1])]
    m.prism(q, 15.0, 15.8, "roof_red")
    return m.finish(parent=parent)


def colosseum(parent):
    """Caesars' Colosseum (the theatre): a white drum about 70 m across and
    35 high, a ring of columns round its face and three tiers of lit arches
    between them, its crown band lit blue."""
    a = DATA["anchors"]["colosseum"]
    m = VMesh("colosseum")
    R = 36.0
    m.lathe([(R, 0.0), (R, 33.0), (R + 1.0, 33.5), (R + 1.0, 35.0), (0.0, 35.0)], (a["x"], a["y"]), "stone", segs=48, smooth=False)
    for k in range(32):
        t = 2 * math.pi * k / 32
        c = (a["x"] + math.cos(t) * (R + 1.6), a["y"] + math.sin(t) * (R + 1.6))
        m.lathe([(0.9, 0.0), (0.9, 30.0), (1.3, 31.0), (0.0, 31.0)], c, "stone", segs=8, smooth=False)
    # Three tiers of arches between the columns, lit from within.
    for k in range(32):
        t = 2 * math.pi * (k + 0.5) / 32
        c = (a["x"] + math.cos(t) * (R - 0.05), a["y"] + math.sin(t) * (R - 0.05))
        for z, hh in ((2.5, 8.0), (12.0, 8.0), (21.5, 7.5)):
            arch(m, c, (-math.sin(t), math.cos(t)), 4.0, hh, z, 0.5, (0.85, 0.7, 0.47, 1.0))
    circle = [(a["x"] + math.cos(2 * math.pi * k / 48) * R, a["y"] + math.sin(2 * math.pi * k / 48) * R) for k in range(48)]
    band(m, circle, 31.4, 32.6, (0.3, 0.55, 1.0, 1.0), out=1.4)
    return m.finish(parent=parent)


def high_roller(parent):
    """The High Roller (167.6 m): 158.5 m across its cabins, a deep tubular
    rim, cable spokes to its hub, 28 glass cabins on the rim, the hub on a
    pair of raked legs from one side; its rim's lights at night. Its lowest
    cabin boards from a platform 9 m up."""
    a = DATA["anchors"]["highroller"]
    # The wheel's plane faces the Strip (its face toward the circuit's west side).
    t = a["facing"]
    nx, ny = math.cos(t), math.sin(t)
    ux, uy = -ny, nx
    R, HUB = 72.0, 88.3
    at = lambda u, w, z: (a["x"] + ux * u + nx * w, a["y"] + uy * u + ny * w, z)
    m = Mesh("high_roller")
    n = 56
    rim = [at(math.cos(2 * math.pi * k / n) * R, 0.0, HUB + math.sin(2 * math.pi * k / n) * R) for k in range(n)]
    for k in range(n):
        tube(m, rim[k], rim[(k + 1) % n], 1.3, "white_steel", 8)
    for k in range(0, n, 2):
        for w in (-6.0, 6.0):
            tube(m, at(0, w, HUB), rim[k], 0.12, "steel", 3)
    tube(m, at(0, -9, HUB), at(0, 9, HUB), 3.0, "white_steel", 12)
    for w in (-7.0, 7.0):
        for u in (-34.0, 34.0):
            tube(m, at(0, w, HUB), at(u, w * 2.4, 0.5), 2.6, "white_steel", 8)
    cab = Mesh("high_roller_cabins")
    for k in range(28):
        th = 2 * math.pi * k / 28
        c = at(math.cos(th) * (R + 4.0), 0.0, HUB + math.sin(th) * (R + 4.0))
        cab.lathe([(0.0, c[2] - 3.3), (2.7, c[2] - 2.6), (3.6, c[2]), (2.7, c[2] + 2.6), (0.0, c[2] + 3.3)], (c[0], c[1]), "window_lit", segs=10)
    m.finish(parent=parent)
    cab.finish(parent=parent)
    li = VMesh("high_roller_lights")
    for k in range(n):
        p, q = Vector(rim[k]), Vector(rim[(k + 1) % n])
        off = (p - Vector(at(0, 0, HUB))).normalized() * 1.4
        hue = k / n
        col = (0.6 + 0.4 * math.sin(hue * 6.28), 0.2, 0.7 + 0.3 * math.cos(hue * 6.28), 1.0)
        for w in (-1.4, 1.4):
            d = Vector((nx * w, ny * w, 0))
            light_bar(li, p + off * 1.2 + d, q + off * 1.2 + d, 0.5, col)
    return li.finish(parent=parent)


def liberty(parent):
    """The Statue of Liberty replica by New York-New York (about 46 m on
    its pedestal): the robed figure in green copper, her raised torch's
    flame lit gold, the tablet, the crown's rays; the stone pedestal."""
    at = frame("liberty")
    m = Mesh("liberty")
    a = at(0, 0)
    m.prism([(at(sx * 7, sy * 7)[0], at(sx * 7, sy * 7)[1]) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))], 0.0, 18.0, "stone")
    m.prism([(at(sx * 5, sy * 5)[0], at(sx * 5, sy * 5)[1]) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))], 18.0, 21.0, "stone_dark")
    m.lathe([(0.0, 21.0), (4.2, 21.0), (3.6, 27.0), (2.8, 33.0), (2.2, 37.0), (2.6, 38.5), (1.8, 39.5), (1.2, 40.0), (1.5, 41.5), (1.3, 43.0), (0.0, 43.6)], (a[0], a[1]), "copper_green", segs=10, smooth=False)
    tube(m, at(1.6, 0.4, 38.5), at(3.2, 1.2, 46.5), 0.65, "copper_green", 6)
    m.lathe([(0.0, 46.5), (0.9, 46.6), (0.9, 47.3), (0.0, 47.4)], (at(3.2, 1.2)[0], at(3.2, 1.2)[1]), "copper_green", segs=8)
    m.lathe([(0.0, 47.4), (0.7, 47.6), (0.0, 49.4)], (at(3.2, 1.2)[0], at(3.2, 1.2)[1]), "window_lit", segs=8)
    m.box((at(-2.6, 1.0)[0] - 0.8, at(-2.6, 1.0)[1] - 0.4, 31.0), (at(-2.6, 1.0)[0] + 0.8, at(-2.6, 1.0)[1] + 0.4, 35.0), "copper_green")
    for k in range(7):
        t = math.pi * (0.15 + 0.7 * k / 6)
        tube(m, (a[0], a[1], 42.5), (a[0] + math.cos(t) * 2.4, a[1] + math.sin(t) * 0.6, 43.4 + math.sin(t) * 1.8), 0.12, "copper_green", 3)
    return m.finish(parent=parent)


def luxor(parent):
    """The Luxor's pyramid (107 m, 183 m a side) in black glass, its edges
    lit; the sphinx before it, facing the Strip; and the beam of light from
    its apex into the sky."""
    a = DATA["anchors"]["luxor"]
    o = a["outline"]
    # The pyramid's square from its footprint's own axes.
    cx = sum(p[0] for p in o) / len(o)
    cy = sum(p[1] for p in o) / len(o)
    far = max(o, key=lambda p: math.dist(p, (cx, cy)))
    ang = math.atan2(far[1] - cy, far[0] - cx)
    half = 183.0 / 2 * math.sqrt(2)
    corners = [(cx + math.cos(ang + k * math.pi / 2) * half, cy + math.sin(ang + k * math.pi / 2) * half) for k in range(4)]
    m = VMesh("luxor_pyramid")
    H = 107.0
    glass = tone("#6a563e", GLASS)
    for k in range(4):
        p, q = corners[k], corners[(k + 1) % 4]
        m.cface([(p[0], p[1], 0.0), (q[0], q[1], 0.0), (cx, cy, H)], F, glass, uvs=[(0.0, 0.0), (183.0, 0.0), (91.5, H)])
    # Its four edges lit their whole length, and the lamp room at its apex.
    for k in range(4):
        p = corners[k]
        light_bar(m, (cx + (p[0] - cx) * 1.004, cy + (p[1] - cy) * 1.004, 2.2), (cx, cy, H + 0.4), 2.2, (0.95, 0.95, 1.0, 1.0))
    light_bar(m, (cx, cy, H - 4.0), (cx, cy, H + 2.0), 4.5, (1.0, 1.0, 1.0, 1.0))
    m.finish(parent=parent)
    # The beam: the strongest light on the Strip, 14 m across, into the sky.
    beam = Mesh("luxor_beam")
    beam.lathe([(0.0, H), (7.0, H), (7.0, H + 2600.0), (0.0, H + 2600.0)], (cx, cy), "beam", segs=12, smooth=True)
    beam.finish(parent=parent)
    # The sphinx: toward the Strip, a lion's long body and paws, its head in its headdress.
    t = a["facing"]
    fx, fy = math.cos(t), math.sin(t)
    sx_, sy_ = -fy, fx
    base = (cx + fx * (half / math.sqrt(2) + 70), cy + fy * (half / math.sqrt(2) + 70))
    at = lambda f, s, z: (base[0] + fx * f + sx_ * s, base[1] + fy * f + sy_ * s, z)
    sp = Mesh("sphinx")
    blocks = [((-30, -7, 0), (6, 7, 12)), ((6, -6.5, 0), (24, -2.5, 4)), ((6, 2.5, 0), (24, 6.5, 4)), ((-4, -6, 12), (8, 6, 22)), ((-6, -7.5, 18), (8, 7.5, 24))]
    for (f0, s0, z0), (f1, s1, z1) in blocks:
        pts = [at(f0, s0, 0), at(f1, s0, 0), at(f1, s1, 0), at(f0, s1, 0)]
        sp.prism([(p[0], p[1]) for p in pts], z0, z1, "sandstone")
    sp.prism([(at(8, -3, 0)[0], at(8, -3, 0)[1]), (at(11, -3, 0)[0], at(11, -3, 0)[1]), (at(11, 3, 0)[0], at(11, 3, 0)[1]), (at(8, 3, 0)[0], at(8, 3, 0)[1])], 13.0, 20.0, "sandstone")
    sp.finish(parent=parent)


def strat(parent):
    """The Strat's tower (350 m): its three-legged shaft, the pod at the
    top with its lit glass, the mast; the pod's band of light at night."""
    a = DATA["anchors"]["strat"]
    cx, cy = a["x"], a["y"]
    m = VMesh("strat_tower")
    for k in range(3):
        t = 2 * math.pi * k / 3
        tube(m, (cx + math.cos(t) * 14, cy + math.sin(t) * 14, 0), (cx + math.cos(t) * 5, cy + math.sin(t) * 5, 262), 4.4, "concrete", 10)
    m.lathe([(0.0, 258), (6.0, 258), (16.0, 262), (24.0, 268), (25.0, 274), (22.0, 280), (25.0, 284), (24.0, 288), (12.0, 292), (5.0, 294), (0.0, 294)], (cx, cy), "concrete", segs=28, smooth=False)
    for z0, r in ((268.5, 24.4), (280.5, 22.4)):
        m.lathe([(0.0, z0), (r, z0), (r + 0.3, z0 + 0.4), (r + 0.3, z0 + 3.4), (r, z0 + 3.8), (0.0, z0 + 3.8)], (cx, cy), "window_lit", segs=28, smooth=False)
    m.lathe([(0.0, 294), (3.0, 294), (1.6, 330), (0.6, 350), (0.0, 352)], (cx, cy), "white_steel", segs=8, smooth=False)
    ring = [(cx + math.cos(2 * math.pi * k / 28) * 24.6, cy + math.sin(2 * math.pi * k / 28) * 24.6) for k in range(28)]
    band(m, ring, 287.0, 288.4, (0.7, 0.3, 1.0, 1.0), out=0.6)
    return m.finish(parent=parent)


def plume(jets, x, y, r, col):
    """A jet of water a metre tall (the game stretches it to its height)."""
    prof = [(0.25, 0.2), (0.45, 0.45), (0.8, 0.85), (0.55, 0.97), (0.0, 1.0)]
    for (ra, za), (rb, zb) in zip(prof, prof[1:]):
        for s in range(6):
            t0 = 2 * math.pi * s / 6
            t1 = 2 * math.pi * (s + 1) / 6
            q = [(x + math.cos(t0) * ra * r, y + math.sin(t0) * ra * r, za), (x + math.cos(t1) * ra * r, y + math.sin(t1) * ra * r, za),
                 (x + math.cos(t1) * rb * r, y + math.sin(t1) * rb * r, zb), (x + math.cos(t0) * rb * r, y + math.sin(t0) * rb * r, zb)]
            jets.cface(q if rb > 0 else q[:3], "fountain", col)


def bellagio_tower():
    """The Bellagio's tower as a footprint (the map has it without a height):
    two long wings in one curve, hollow toward the lake, and a third behind,
    from the hub its cupola stands on; 151 m, 36 floors."""
    hub = next(b for b in DATA["buildings"] if b["resort"] == "bellagio" and b["roof"] in ("dome", "round"))
    cx = sum(p[0] for p in hub["outline"]) / len(hub["outline"])
    cy = sum(p[1] for p in hub["outline"]) / len(hub["outline"])
    R, D, A = 215.0, 22.0, math.radians(34)
    ax = cx + R
    pt = lambda r, a: (ax - r * math.cos(a), cy + r * math.sin(a))
    inner = [pt(R - D / 2, -A + 2 * A * k / 12) for k in range(13)]
    aw = math.asin(11.0 / (R + D / 2))
    north = [pt(R + D / 2, A - (A - aw) * k / 6) for k in range(7)]
    wx = ax - (R + D / 2) * math.cos(aw)
    wing = [(wx - 78.0, cy + 11.0), (wx - 78.0, cy - 11.0)]
    south = [pt(R + D / 2, -aw - (A - aw) * k / 6) for k in range(7)]
    return {"id": "bellagio_tower", "resort": "bellagio", "h": 151.0, "minh": 0.0, "roof": "flat", "outline": inner + north + wing + south}


def bellagio_village(parent):
    """The houses along the lake's shore before the tower: stucco in the
    colours of an Italian lakeside, their low roofs tiled."""
    lake = DATA["lake"]
    ys = [p[1] for p in lake]
    m = VMesh("b_bellagio_village")
    cols = ["#e6c98f", "#d9a37c", "#efe0c0", "#d6b48a", "#e3bfa0", "#cfa07a"]
    tile = tone("#b0603f", PLAIN)
    y = min(ys) + 30.0
    k = 0
    while y < max(ys) - 50.0:
        wide, deep, hh = 20.0 + (k * 7) % 9, 14.0 + (k * 5) % 6, 10.0 + (k * 3) % 8
        west = min(p[0] for p in lake if abs(p[1] - (y + wide / 2)) < 30)
        x1 = west - 10.0
        o = [(x1 - deep, y), (x1, y), (x1, y + wide), (x1 - deep, y + wide)]
        walls(m, o, 0.0, hh, F, tone(cols[k % len(cols)], STONE))
        hi = offset(o, -min(deep, wide) * 0.32)
        for i in range(4):
            j = (i + 1) % 4
            m.cface([(*o[i], hh), (*o[j], hh), (*hi[j], hh + 3.6), (*hi[i], hh + 3.6)], F, tile)
        m.cface([(*p, hh + 3.6) for p in hi], F, tile)
        ring(m, o, hh - 0.7, hh - 0.05, tile, out=0.7)
        y += wide + 3.0
        k += 1
    return m.finish(parent=parent, extras={"resort": "bellagio", "height": 21.0})


def caesars_fountains(parent):
    """Caesars' fountains before its front: three round basins in a row
    toward the Strip, a ring of low jets and one at the middle of each."""
    pts = [p for b in DATA["buildings"] if b["resort"] == "caesars" for p in b["outline"]]
    p, c = min(((p, c) for p in pts for c in DATA["circuit"][::2]), key=lambda pc: math.dist(pc[0], pc[1]))
    d = math.dist(p, c)
    ux, uy = (p[0] - c[0]) / d, (p[1] - c[1]) / d
    off = max(62.0, d - 24.0)
    basins = VMesh("caesars_basins")
    jets = VMesh("caesars_fountains", data=True)
    count = 0
    for k, along in enumerate((20.0, 42.0, 64.0)):
        x, y = c[0] + ux * off - uy * along, c[1] + uy * off + ux * along
        circle = [(x + math.cos(2 * math.pi * i / 20) * 8.0, y + math.sin(2 * math.pi * i / 20) * 8.0) for i in range(20)]
        ring(basins, circle, 0.0, 0.9, tone(STYLES["caesars"]["trim"], PLAIN), out=0.5, inn=0.5)
        basins.prism(offset(circle, -0.6), 0.02, 0.55, "lake", cap_bottom=True)
        # (Blue 1: a small fountain, a few metres of water, no finale.)
        plume(jets, x, y, 1.5, (k / 3.0, 0.0, 1.0, 1.0))
        for i in range(6):
            plume(jets, x + math.cos(2 * math.pi * i / 6) * 5.0, y + math.sin(2 * math.pi * i / 6) * 5.0, 0.9, ((k / 3.0 + 0.4 + i / 12.0) % 1.0, 1.0, 1.0, 1.0))
        count += 7
    basins.finish(parent=parent)
    jets.finish(parent=parent, extras={"jets": count})


def bellagio_lake(parent):
    """The Bellagio's lake (its outline from the map) and its fountains: rows
    of jets along the lake's front toward the Strip, each a thin column of
    water the game raises and drops in its show (the vertex colours: red the
    jet's phase in the show, green its row)."""
    lake = ccw([tuple(p) for p in DATA["lake"]])
    w = Mesh("bellagio_lake")
    w.face([(x, y, 0.15) for x, y in lake], "lake")
    w.face([(x, y, 0.05) for x, y in reversed(lake)], "lake")
    n = len(lake)
    for i in range(n):
        a, b = lake[i], lake[(i + 1) % n]
        w.face([(a[0], a[1], 0.05), (b[0], b[1], 0.05), (b[0], b[1], 0.15), (a[0], a[1], 0.15)], "lake")
    w.finish(parent=parent)

    def inside(x, y, margin):
        hit = False
        for (ax, ay), (bx, by) in zip(lake, lake[1:] + lake[:1]):
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                hit = not hit
        if not hit:
            return False
        for (ax, ay), (bx, by) in zip(lake, lake[1:] + lake[:1]):
            dx, dy = bx - ax, by - ay
            L = dx * dx + dy * dy or 1
            t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L))
            if math.hypot(x - ax - t * dx, y - ay - t * dy) < margin:
                return False
        return True

    # Rows along the front: the lake's east edge, stepping in.
    ys = [p[1] for p in lake]
    jets = VMesh("bellagio_fountains", data=True)
    count = 0
    for row in range(4):
        for k in range(120):
            y = min(ys) + (max(ys) - min(ys)) * k / 119
            east = max((p[0] for p in lake if abs(p[1] - y) < 25), default=None)
            if east is None:
                continue
            x = east - 14.0 - row * 12.0 - 6.0 * math.sin(k / 7.0 + row)
            if not inside(x, y, 6.0):
                continue
            if k % (2 if row < 2 else 3):
                continue
            phase = (k / 119 + row * 0.13) % 1.0
            col = (phase, row / 3.0, 0.0, 1.0)
            # A plume: narrow at the nozzle, opening as it climbs, its crown
            # rounded (the game stretches it to the jet's height).
            plume(jets, x, y, 2.4 if row % 2 == 0 else 1.7, col)
            count += 1
    jets.finish(parent=parent, extras={"jets": count})


def planethollywood_base():
    """Planet Hollywood's base before its tower: a low hall whose front to
    the Strip is one long curve (the map has its towers alone)."""
    towers = [b for b in DATA["buildings"] if b["resort"] == "planethollywood" and b["h"] > 45]
    xs = [p[0] for b in towers for p in b["outline"]]
    ys = [p[1] for b in towers for p in b["outline"]]
    # (Before every tower of the resort: its front clear of them all.)
    x0, y0, y1 = min(xs), min(ys), max(ys)
    front = [(x0 - 6.0 - 20.0 * math.sin(math.pi * k / 12), y0 + (y1 - y0) * k / 12) for k in range(13)]
    return tidy([(x0 - 2.0, y1), *reversed(front), (x0 - 2.0, y0)])


def planethollywood_hall(parent):
    o = planethollywood_base()
    m = VMesh("b_planethollywood_base")
    walls(m, o, 0.0, 24.0, F, tone(STYLES["planethollywood"]["pod"], PLAIN))
    m.cface([(x, y, 24.0) for x, y in o], "roof_flat")
    ring(m, o, 22.6, 24.6, tone(STYLES["planethollywood"]["trim"], PLAIN), out=0.9)
    return m.finish(parent=parent, extras={"resort": "planethollywood", "height": 24.0})


def vbox(m, lo, hi, screen):
    """A box of screens, its id (1 to 255) in its vertex colours' red: each
    screen its own picture."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    p = [Vector((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        m.cface([p[i] for i in q], "video", (screen / 255.0, 0.0, 0.0, 1.0))


def led_walls(parent):
    """The LED walls: Planet Hollywood's along its front to the Strip, the
    Cosmopolitan's marquee pillar by the Strip, Resorts World's on its tower's
    face to the Strip (abstract, moving images: the game draws them). Each its
    own node, so each is placed with its own building."""
    def resort_box(key):
        pts = [p for b in DATA["buildings"] if b["resort"] == key for p in b["outline"]]
        return min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts)

    # Planet Hollywood: its curved base along the Strip, wrapped in screens.
    m = VMesh("led_planethollywood", data=True)
    ring(m, planethollywood_base(), 6.0, 21.0, (201 / 255.0, 0.0, 0.0, 1.0), role="video", out=0.7, inn=0.2)
    m.finish(parent=parent)
    # The Cosmopolitan's marquee: a tall pillar of screens by the Strip.
    m = VMesh("led_cosmopolitan", data=True)
    x0, x1, y0, y1 = resort_box("cosmopolitan")
    vbox(m, (x1 + 8, (y0 + y1) / 2 - 3, 0.0), (x1 + 14, (y0 + y1) / 2 + 3, 62.0), 202)
    m.finish(parent=parent)
    # Resorts World: its tower's face to the Strip, screens from 30 to 150 m.
    m = VMesh("led_resortsworld", data=True)
    tower = max((b for b in DATA["buildings"] if b["resort"] == "resortsworld"), key=lambda b: b["h"])
    o = tidy(tower["outline"])
    run = 0.0
    for a, b in zip(o, o[1:] + o[:1]):
        length = math.dist(a, b)
        nx, ny = (b[1] - a[1]) / length, -(b[0] - a[0]) / length
        # (Its walls that look east, on each of them: a slab 0.6 m proud.)
        if nx < 0.5 or length < 12:
            continue
        a2 = (a[0] + (b[0] - a[0]) * 0.06, a[1] + (b[1] - a[1]) * 0.06)
        b2 = (a[0] + (b[0] - a[0]) * 0.94, a[1] + (b[1] - a[1]) * 0.94)
        slab = [(a2[0] + nx * 0.05, a2[1] + ny * 0.05), (b2[0] + nx * 0.05, b2[1] + ny * 0.05), (b2[0] + nx * 0.6, b2[1] + ny * 0.6), (a2[0] + nx * 0.6, a2[1] + ny * 0.6)]
        z0, z1 = 30.0, min(150.0, tower["h"] - 12.0)
        col = (203 / 255.0, 0.0, 0.0, 1.0)
        seg = length * 0.88
        m.cface([(*slab[3], z0), (*slab[2], z0), (*slab[2], z1), (*slab[3], z1)], "video", col, uvs=[(run + seg, z0), (run, z0), (run, z1), (run + seg, z1)])
        m.cface([(*slab[1], z0), (*slab[0], z0), (*slab[0], z1), (*slab[1], z1)], "video", col)
        m.cface([(*slab[0], z0), (*slab[3], z0), (*slab[3], z1), (*slab[0], z1)], "video", col)
        m.cface([(*slab[2], z0), (*slab[1], z0), (*slab[1], z1), (*slab[2], z1)], "video", col)
        m.cface([(*p, z1) for p in slab], "video", col)
        m.cface([(*p, z0) for p in reversed(slab)], "video", col)
        run += seg
    m.finish(parent=parent)


# The resorts whose sign (an LED pylon, no lettering) stands by the circuit.
SIGNS = ["bellagio", "caesars", "paris", "flamingo", "linq", "harrahs", "horseshoe", "venetian", "palazzo", "mirage", "treasureisland", "planethollywood", "cosmopolitan", "wynn"]


def signs(parent):
    """Each resort's sign by the street: an LED pylon on a stone base, its
    screens both ways (the game's moving colour; no lettering, no mark),
    between the resort and the circuit's nearest point."""
    circuit = DATA["circuit"]
    for key in SIGNS:
        pts = [p for b in DATA["buildings"] if b["resort"] == key for p in b["outline"]]
        if not pts:
            continue
        best = min(((p, c) for p in pts for c in circuit[::2]), key=lambda pc: math.dist(pc[0], pc[1]))
        p, c = best
        d = math.dist(p, c) or 1.0
        ux, uy = (p[0] - c[0]) / d, (p[1] - c[1]) / d
        # Past the game's road and run-off (about 45 m from the centreline)
        # and its margin, short of the resort itself.
        off = max(46.0, min(d - 6.0, 52.0))
        x, y = c[0] + ux * off, c[1] + uy * off
        vx, vy = -uy, ux
        m = VMesh(f"sign_{key}", data=True)
        corner = lambda a, b: (x + vx * a + ux * b, y + vy * a + uy * b)
        base = [corner(-5, -2), corner(5, -2), corner(5, 2), corner(-5, 2)]
        m.prism(base, 0.0, 6.0, "stone")
        board = [corner(-4, -1.2), corner(4, -1.2), corner(4, 1.2), corner(-4, 1.2)]
        sid = (SIGNS.index(key) + 1) / 255.0
        lo = [(x, y, 6.0) for x, y in board]
        hi = [(x, y, 38.0) for x, y in board]
        for i in range(4):
            j = (i + 1) % 4
            u0 = math.dist(board[0], board[i]) if i else 0.0
            m.cface((lo[i], lo[j], hi[j], hi[i]), "video", (sid, 0.0, 0.0, 1.0), uvs=[(u0, 6.0), (u0 + math.dist(board[i], board[j]), 6.0), (u0 + math.dist(board[i], board[j]), 38.0), (u0, 38.0)])
        m.cface(hi, "video", (sid, 0.0, 0.0, 1.0))
        cap = [corner(-4.6, -1.6), corner(4.6, -1.6), corner(4.6, 1.6), corner(-4.6, 1.6)]
        m.prism(cap, 38.0, 40.0, "white_steel")
        m.finish(parent=parent)


GROUPED = {"bellagio_lake": "bellagio", "colosseum": "caesars", "caesars_fountains": "caesars"}


def build():
    clear()
    root = empty("vegas_strip")
    bl = empty("buildings", parent=root)
    for b in [*DATA["buildings"], bellagio_tower()]:
        building(b, bl)
    bellagio_village(bl)
    planethollywood_hall(bl)
    # The anchors (the game places the Sphere on its own, and names the
    # landmarks for the checks and the photographs).
    for key, a in DATA["anchors"].items():
        empty(f"anchor_{key}", (a["x"], a["y"], 0.0), parent=root)
    lm = empty("landmarks", parent=root)
    for fn in (eiffel, balloon, arc, campanile, doges, rialto, colosseum, high_roller, liberty, luxor, strat, bellagio_lake, caesars_fountains):
        # (A resort's own pieces are placed with it: the lake with its tower
        # and village, the Colosseum and the fountains with Caesars.)
        sub = empty(f"lm_{fn.__name__}", parent=lm, extras={"resort": GROUPED[fn.__name__]} if fn.__name__ in GROUPED else None)
        fn(sub)
    # (Each wall and sign its own landmark node.)
    led_walls(lm)
    signs(lm)
    return root


root = build()
objs = subtree(root)
total = sum(tris(o) for o in objs)
lo, hi = bounds(objs)
print(f"vegas_strip: {total} triangles, {len([o for o in objs if o.type == 'MESH'])} meshes, {lo.x:.0f}..{hi.x:.0f} x {lo.y:.0f}..{hi.y:.0f} x {lo.z:.2f}..{hi.z:.0f}")
if total > 200000:
    raise RuntimeError(f"vegas_strip has {total} triangles, over its 200000")
for o in objs:
    if o.type == "MESH" and min((o.matrix_world @ v.co).z for v in o.data.vertices) < -0.01:
        print("below ground:", o.name)
if lo.z < -0.01:
    raise RuntimeError(f"vegas_strip goes {-lo.z:.2f} m into the ground")
landmark_kit.export(root, "vegas_strip.glb", uvs=True, colours=True)
landmark_kit.preview(root, "vegas_strip", [("strip", (-300, 300, 260), (-500, 0, 60)), ("paris", (-380, -380, 90), (-580, -470, 70))], night=True)
