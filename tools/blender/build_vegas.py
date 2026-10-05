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
import bmesh
import json
import math
import os
import sys
from mathutils import Vector, Matrix

if (bpy.data.filepath or bpy.data.is_dirty) and os.environ.get("F1_BUILD_FORCE") != "1":
    raise RuntimeError("build_vegas.py clears the scene, and this one has work in it. Use a new file, or set F1_BUILD_FORCE=1.")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from landmark_kit import *  # noqa: E402,F401,F403
from landmark_kit import PALETTE, MATS, Mesh, tube, polyline, empty, clear, subtree, bounds, tris, smooth  # noqa: E402
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
    "roof_red": ((0.65, 0.1, 0.1), 0.2, 0.5),
    "roof_blue": ((0.12, 0.25, 0.65), 0.2, 0.5),
    "roof_gold": ((0.85, 0.65, 0.2), 0.8, 0.35),
    "doge_pink": ((0.86, 0.62, 0.58), 0.0, 0.85),
})

# Each resort's band of light round its tall towers' tops (night), rgb.
CROWN = {
    "caesars": (0.25, 0.5, 1.0), "palazzo": (1.0, 0.85, 0.6), "mgm": (0.2, 1.0, 0.45), "mirage": (1.0, 0.75, 0.3),
    "treasureisland": (1.0, 0.25, 0.2), "harrahs": (1.0, 0.2, 0.25), "horseshoe": (1.0, 0.75, 0.3), "linq": (0.35, 0.55, 1.0),
    "planethollywood": (0.75, 0.35, 1.0), "flamingo": (1.0, 0.35, 0.6), "excalibur": (1.0, 0.8, 0.35), "paris": (1.0, 0.85, 0.55),
    "resortsworld": (1.0, 0.2, 0.15), "fontainebleau": (0.4, 0.75, 1.0), "strat": (0.7, 0.3, 1.0), "nyny": (1.0, 0.9, 0.7),
    "cosmopolitan": (0.9, 0.95, 1.0), "aria": (0.85, 0.9, 1.0), "bellagio": (1.0, 0.9, 0.7), "venetian": (1.0, 0.9, 0.7),
    "mandalay": (1.0, 0.8, 0.4), "trump": (1.0, 0.85, 0.5),
}


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


class VMesh(Mesh):
    """A Mesh whose faces each carry a colour (r, g, b, a), written to a
    colour attribute (glTF COLOR_0) for the roles that read it."""

    def __init__(self, name):
        super().__init__(name)
        self.col_layer = self.bm.faces.layers.int.new("colour_index")
        self.palette = [(1.0, 1.0, 1.0, 1.0)]

    def cface(self, pts, role, col=None, uvs=None):
        f = self.face(pts, role, uvs=uvs)
        if col is not None:
            if col not in self.palette:
                self.palette.append(col)
            f[self.col_layer] = self.palette.index(col)
        return f

    def finish(self, extras=None, parent=None):
        ob = super().finish(extras=extras, parent=parent)
        me = ob.data
        idx = me.attributes.get("colour_index")
        attr = me.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
        for poly in me.polygons:
            c = self.palette[idx.data[poly.index].value] if idx else (1, 1, 1, 1)
            for li in poly.loop_indices:
                attr.data[li].color = c
        me.color_attributes.active_color = attr
        if idx:
            me.attributes.remove(idx)
        return ob


def ccw(outline):
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(outline, outline[1:] + outline[:1]))
    return outline if area > 0 else list(reversed(outline))


def walls(m, outline, z0, z1, role, col):
    """A footprint's walls from z0 to z1, the UVs' u round them in metres."""
    run = 0.0
    n = len(outline)
    for i in range(n):
        a, b = outline[i], outline[(i + 1) % n]
        seg = math.dist(a, b)
        if seg < 0.05:
            continue
        m.cface([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], role, col,
                 uvs=[(run, z0), (run + seg, z0), (run + seg, z1), (run, z1)])
        run += seg


def band(m, outline, z0, z1, col, out=0.25):
    """A band of light round a footprint (its own thin closed ring)."""
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    o = []
    for x, y in outline:
        d = math.hypot(x - cx, y - cy) or 1
        o.append((x + (x - cx) / d * out, y + (y - cy) / d * out))
    i = [(x - (x - cx) / math.hypot(x - cx, y - cy) * 0.3 if math.hypot(x - cx, y - cy) > 0.5 else x, y - (y - cy) / math.hypot(x - cx, y - cy) * 0.3 if math.hypot(x - cx, y - cy) > 0.5 else y) for x, y in outline]
    n = len(outline)
    for k in range(n):
        j = (k + 1) % n
        m.cface([(o[k][0], o[k][1], z0), (o[j][0], o[j][1], z0), (o[j][0], o[j][1], z1), (o[k][0], o[k][1], z1)], "neon", col)
        m.cface([(i[j][0], i[j][1], z0), (i[k][0], i[k][1], z0), (i[k][0], i[k][1], z1), (i[j][0], i[j][1], z1)], "neon", col)
        m.cface([(o[k][0], o[k][1], z1), (o[j][0], o[j][1], z1), (i[j][0], i[j][1], z1), (i[k][0], i[k][1], z1)], "neon", col)
        m.cface([(i[k][0], i[k][1], z0), (i[j][0], i[j][1], z0), (o[j][0], o[j][1], z0), (o[k][0], o[k][1], z0)], "neon", col)


def building(b, parent):
    """One footprint: its walls, its roof (flat, a pyramid or a dome), and a
    band of light round the top of a tall one."""
    outline = ccw([tuple(p) for p in b["outline"]])
    # Drop points closer than 0.3 m (map noise) so the walls stay clean.
    clean = [outline[0]]
    for p in outline[1:]:
        if math.dist(p, clean[-1]) > 0.3:
            clean.append(p)
    if len(clean) > 3 and math.dist(clean[0], clean[-1]) < 0.3:
        clean.pop()
    if len(clean) < 3:
        return None
    outline = clean
    r, g, bb = hexrgb(b["colour"])
    col = (r, g, bb, 0.35 if b["glass"] else 1.0)
    m = VMesh(f'b_{b["id"]}')
    z0, h = b["minh"], b["h"]
    roof = b["roof"]
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    w = min(max(xs) - min(xs), max(ys) - min(ys))
    roof_h = min(w * 0.6, h * 0.35) if roof in ("pyramidal", "dome", "round") else 0.0
    top = h - roof_h
    walls(m, outline, z0, top, "facade_vegas", col)
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    if roof == "pyramidal":
        role = ("roof_red", "roof_blue", "roof_gold")[int(abs(cx * 7 + cy * 3)) % 3] if b["resort"] == "excalibur" else "roof_flat"
        for i in range(len(outline)):
            a, c = outline[i], outline[(i + 1) % len(outline)]
            m.cface([(a[0], a[1], top), (c[0], c[1], top), (cx, cy, h)], role)
    elif roof in ("dome", "round"):
        rad = max(math.dist((cx, cy), p) for p in outline)
        rows = [[(cx + (p[0] - cx) * math.cos(t), cy + (p[1] - cy) * math.cos(t), top + roof_h * math.sin(t)) for p in outline] for t in [math.pi / 2 * k / 5 for k in range(5)]]
        for r0, r1 in zip(rows, rows[1:]):
            for i in range(len(outline)):
                j = (i + 1) % len(outline)
                m.cface([r0[i], r0[j], r1[j], r1[i]], "roof_green" if b["resort"] in ("bellagio",) else "roof_flat")
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            m.cface([rows[-1][i], rows[-1][j], (cx, cy, h)], "roof_green" if b["resort"] in ("bellagio",) else "roof_flat")
        _ = rad
    else:
        m.cface([(x, y, top) for x, y in outline], "roof_flat")
    if b["minh"] > 0.5:
        m.cface([(x, y, z0) for x, y in reversed(outline)], "roof_flat")
    if roof == "flat" and top - z0 > 60 and inside_poly((cx, cy), outline):
        crown_details(m, b, outline, cx, cy, w, top)
    crown = CROWN.get(b["resort"])
    if crown and top - z0 > 55:
        c = (*crown, 1.0)
        band(m, outline, top - 2.6, top - 1.4, c)
        if b["resort"] == "flamingo":
            # The Flamingo's neon: pink and orange bands up its towers.
            for k, z in enumerate(range(12, int(top) - 8, 14)):
                band(m, outline, z, z + 0.9, (1.0, 0.3, 0.6, 1.0) if k % 2 else (1.0, 0.55, 0.2, 1.0))
    return m.finish(parent=parent, extras={"resort": b["resort"], "height": b["h"]})


def inside_poly(pt, poly):
    x, y = pt
    hit = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
    return hit


def crown_details(m, b, outline, cx, cy, w, top):
    """A tall tower's top: the plant room on its roof, and a resort's own
    crown: New York-New York's towers stepping up to their spires (as the
    skyline they copy), the Palazzo's lantern, Paris's mansard roof."""
    s = max(4.0, min(w * 0.28, 16.0))
    if b["resort"] == "nyny" and b["h"] > 110:
        # Setbacks to a mast (an Empire State or a Chrysler of the skyline).
        z = top
        for k, f in enumerate((0.55, 0.38, 0.24)):
            hs = w * f / 2
            sq = [(cx - hs, cy - hs), (cx + hs, cy - hs), (cx + hs, cy + hs), (cx - hs, cy + hs)]
            walls(m, sq, z, z + 7.0 - k, "facade_vegas", (0.7, 0.62, 0.52, 1.0))
            m.cface([(x, y, z + 7.0 - k) for x, y in sq], "roof_flat")
            z += 7.0 - k
        m.lathe([(0.0, z), (w * 0.08, z), (0.4, z + 26.0), (0.0, z + 27.0)], (cx, cy), "white_steel", segs=8, smooth=False)
        m.cface([(cx - 1.2, cy - 1.2, z + 4.0), (cx + 1.2, cy - 1.2, z + 4.0), (cx, cy, z + 9.0)], "neon", (1.0, 0.9, 0.7, 1.0))
        return
    if b["resort"] == "palazzo":
        m.lathe([(0.0, top), (s, top), (s, top + 6.0), (s * 0.8, top + 8.0), (s * 0.45, top + 13.0), (0.0, top + 15.0)], (cx, cy), "roof_gold", segs=12)
        return
    if b["resort"] == "paris":
        # A slate mansard round the top, in from its edges.
        inset = [(cx + (x - cx) * 0.9, cy + (y - cy) * 0.9) for x, y in outline]
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            m.cface([(outline[i][0], outline[i][1], top), (outline[j][0], outline[j][1], top), (inset[j][0], inset[j][1], top + 7.0), (inset[i][0], inset[i][1], top + 7.0)], "roof_flat")
        m.cface([(x, y, top + 7.0) for x, y in inset], "roof_flat")
        return
    # The plant room.
    sq = [(cx - s, cy - s * 0.6), (cx + s, cy - s * 0.6), (cx + s, cy + s * 0.6), (cx - s, cy + s * 0.6)]
    if all(inside_poly(p, outline) for p in sq):
        walls(m, sq, top, top + 6.0, "roof_flat", None)
        m.cface([(x, y, top + 6.0) for x, y in sq], "roof_flat")


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
        pts = [at(sx * (side(z) / 2 + 0.6), sy * (side(z) / 2 + 0.6), z) for z in [k * 140 / 20 for k in range(21)]]
        for a, b in zip(pts, pts[1:]):
            d = Vector(b) - Vector(a)
            u = Vector((-d.y, d.x, 0)).normalized() * 0.18 if d.length else Vector((0.18, 0, 0))
            li.cface([Vector(a) - u, Vector(a) + u, Vector(b) + u, Vector(b) - u], "neon", gold)
            li.cface([Vector(b) - u, Vector(b) + u, Vector(a) + u, Vector(a) - u], "neon", gold)
    for k in range(8):
        t = 2 * math.pi * k / 8
        li.cface([at(math.cos(t) * 1.4, math.sin(t) * 1.4, 147), at(math.cos(t + 0.8) * 1.4, math.sin(t + 0.8) * 1.4, 147), at(0, 0, 150)], "neon", (1.0, 0.9, 0.7, 1.0))
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
    35 high, a ring of columns round its face, its crown band lit blue."""
    a = DATA["anchors"]["colosseum"]
    m = VMesh("colosseum")
    R = 36.0
    m.lathe([(R, 0.0), (R, 33.0), (R + 1.0, 33.5), (R + 1.0, 35.0), (0.0, 35.0)], (a["x"], a["y"]), "stone", segs=48, smooth=False)
    for k in range(32):
        t = 2 * math.pi * k / 32
        c = (a["x"] + math.cos(t) * (R + 1.6), a["y"] + math.sin(t) * (R + 1.6))
        m.lathe([(0.9, 0.0), (0.9, 30.0), (1.3, 31.0), (0.0, 31.0)], c, "stone", segs=8, smooth=False)
    ring = [(a["x"] + math.cos(2 * math.pi * k / 48) * R, a["y"] + math.sin(2 * math.pi * k / 48) * R) for k in range(48)]
    band(m, ring, 31.4, 32.6, (0.3, 0.55, 1.0, 1.0), out=1.4)
    return m.finish(parent=parent)


def high_roller(parent):
    """The High Roller (167 m): a 158 m wheel, a deep tubular rim, cable
    spokes to its hub, 28 glass cabins on the rim, the hub on a pair of
    raked legs from one side; its rim's lights at night."""
    a = DATA["anchors"]["highroller"]
    # The wheel's plane faces the Strip (its face toward the circuit's west side).
    t = a["facing"]
    nx, ny = math.cos(t), math.sin(t)
    ux, uy = -ny, nx
    R, HUB = 79.0, 88.6
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
            li.cface([p + off + d, q + off + d, q + off * 1.4 + d, p + off * 1.4 + d], "neon", col)
            li.cface([p + off * 1.4 + d, q + off * 1.4 + d, q + off + d, p + off + d], "neon", col)
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
    for k in range(4):
        p, q = corners[k], corners[(k + 1) % 4]
        m.cface([(p[0], p[1], 0.0), (q[0], q[1], 0.0), (cx, cy, H)], "black_glass")
    for k in range(4):
        p = corners[k]
        d = Vector((cx - p[0], cy - p[1], H))
        u = Vector((-(cy - p[1]), cx - p[0], 0)).normalized() * 0.8
        base = Vector((p[0], p[1], 1.0))
        top = Vector((cx, cy, H - 0.5))
        lift = d.normalized().cross(u).normalized() * 0.4
        m.cface([base - u + lift, base + u + lift, top + u + lift, top - u + lift], "neon", (0.95, 0.95, 1.0, 1.0))
    m.finish(parent=parent)
    beam = Mesh("luxor_beam")
    beam.lathe([(0.0, H), (3.0, H), (3.0, H + 1400.0), (0.0, H + 1400.0)], (cx, cy), "beam", segs=12, smooth=True)
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
    jets = VMesh("bellagio_fountains")
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
            r = 2.4 if row % 2 == 0 else 1.7
            prof = [(0.25, 0.2), (0.45, 0.45), (0.8, 0.85), (0.55, 0.97), (0.0, 1.0)]
            for (ra, za), (rb, zb) in zip(prof, prof[1:]):
                for s in range(6):
                    t0 = 2 * math.pi * s / 6
                    t1 = 2 * math.pi * (s + 1) / 6
                    q = [(x + math.cos(t0) * ra * r, y + math.sin(t0) * ra * r, za), (x + math.cos(t1) * ra * r, y + math.sin(t1) * ra * r, za),
                         (x + math.cos(t1) * rb * r, y + math.sin(t1) * rb * r, zb), (x + math.cos(t0) * rb * r, y + math.sin(t0) * rb * r, zb)]
                    jets.cface(q if rb > 0 else q[:3], "fountain", col)
            count += 1
    jets.finish(parent=parent, extras={"jets": count})


def led_walls(parent):
    """The LED walls: Planet Hollywood's along its front to the Strip, the
    Cosmopolitan's marquee pillar by the Strip, Resorts World's on its tower's
    face to the Strip (abstract, moving images: the game draws them). Each its
    own node, so each is placed with its own building."""
    def resort_box(key):
        pts = [p for b in DATA["buildings"] if b["resort"] == key for p in b["outline"]]
        return min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts)

    # Planet Hollywood: a long curved screen on its podium's west front.
    m = Mesh("led_planethollywood")
    x0, x1, y0, y1 = resort_box("planethollywood")
    for k in range(10):
        f0, f1 = k / 10, (k + 1) / 10
        ya, yb = y0 + (y1 - y0) * f0, y0 + (y1 - y0) * f1
        xa = x0 - 4 - 6 * math.sin(math.pi * f0)
        xb = x0 - 4 - 6 * math.sin(math.pi * f1)
        m.box((min(xa, xb) - 0.6, ya, 6.0), (max(xa, xb), yb, 26.0), "video")
    m.finish(parent=parent)
    # The Cosmopolitan's marquee: a tall pillar of screens by the Strip.
    m = Mesh("led_cosmopolitan")
    x0, x1, y0, y1 = resort_box("cosmopolitan")
    m.box((x1 + 8, (y0 + y1) / 2 - 3, 0.0), (x1 + 14, (y0 + y1) / 2 + 3, 62.0), "video")
    m.finish(parent=parent)
    # Resorts World: its tower's face to the Strip, screens from 30 to 150 m.
    m = Mesh("led_resortsworld")
    x0, x1, y0, y1 = resort_box("resortsworld")
    m.box((x1 - 1.0, y0 + (y1 - y0) * 0.25, 30.0), (x1 + 0.6, y0 + (y1 - y0) * 0.75, 150.0), "video")
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
        x, y = c[0] + ux * min(36.0, d * 0.6), c[1] + uy * min(36.0, d * 0.6)
        vx, vy = -uy, ux
        m = Mesh(f"sign_{key}")
        corner = lambda a, b: (x + vx * a + ux * b, y + vy * a + uy * b)
        base = [corner(-5, -2), corner(5, -2), corner(5, 2), corner(-5, 2)]
        m.prism(base, 0.0, 6.0, "stone")
        board = [corner(-4, -1.2), corner(4, -1.2), corner(4, 1.2), corner(-4, 1.2)]
        m.prism(board, 6.0, 38.0, "video")
        cap = [corner(-4.6, -1.6), corner(4.6, -1.6), corner(4.6, 1.6), corner(-4.6, 1.6)]
        m.prism(cap, 38.0, 40.0, "white_steel")
        m.finish(parent=parent)


def build():
    clear()
    root = empty("vegas_strip")
    bl = empty("buildings", parent=root)
    for b in DATA["buildings"]:
        building(b, bl)
    # The anchors (the game places the Sphere on its own, and names the
    # landmarks for the checks and the photographs).
    for key, a in DATA["anchors"].items():
        empty(f"anchor_{key}", (a["x"], a["y"], 0.0), parent=root)
    lm = empty("landmarks", parent=root)
    for fn in (eiffel, balloon, arc, campanile, doges, rialto, colosseum, high_roller, liberty, luxor, strat, bellagio_lake):
        sub = empty(fn.__name__, parent=lm)
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
if total > 400000:
    raise RuntimeError(f"vegas_strip has {total} triangles, over its 400000")
for o in objs:
    if o.type == "MESH" and min((o.matrix_world @ v.co).z for v in o.data.vertices) < -0.01:
        print("below ground:", o.name)
if lo.z < -0.01:
    raise RuntimeError(f"vegas_strip goes {-lo.z:.2f} m into the ground")
landmark_kit.export(root, "vegas_strip.glb", uvs=True, colours=True)
landmark_kit.preview(root, "vegas_strip", [("strip", (-300, 300, 260), (-500, 0, 60)), ("paris", (-380, -380, 90), (-580, -470, 70))], night=True)
