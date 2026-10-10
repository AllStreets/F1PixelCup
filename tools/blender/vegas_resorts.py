"""The Strip's resorts, each in its own architecture (the second pass of
docs/superpowers/specs/2026-10-05-vegas-strip-design.md): a footprint from
the map is the building's real plan; this gives it its walls' kind (floodlit
stone with its rooms' windows, glass in ribbons between pale bands, bronze
glass with fine pale lines, a curtain of tinted glass), its roof and crown
(a classical cornice and attic, a mansard, a tiled hip, battlements, a cap of
light), its belts, colonnades, arcades and turrets. In proportion from public
photographs used only as reference; no names, logos or marks on anything.

The facade shader (r3d/vegas.js, stripFacade) reads a face's colour as its
tint and its alpha as its kind: the numbers below.
"""
import math
from mathutils import Vector
from landmark_kit import Mesh

F = "facade_vegas"
# A wall's kind (the vertex colours' alpha).
STONE, QUIET, PLAIN, RIBBON, LINED, GLASS = 1.0, 0.9, 0.8, 0.65, 0.5, 0.35

# The towers the map leaves unnamed, by their footprints' ids.
RESORT_OF = {
    "w52175577": "vdara", "w134932948": "vdara", "w134932949": "vdara", "w52134834": "veer", "w52134835": "veer",
    "w27897921": "horseshoe", "w134921371": "planethollywood", "w134921379": "planethollywood", "w118347176": "mandalay", "w27831695": "parkmgm",
    "w95223224": "signature", "w95223231": "signature", "w95223232": "signature",
}

# Each resort: k its towers' walls, c their tint, trim its pale stone, top
# its roof and crown, crown its band of light at night (rgb), pod its low
# buildings' walls, belts its string courses.
STYLES = {
    "caesars": dict(k=STONE, c="#efe8d8", trim="#f7f2e7", top="classical", belts=3, crown=(0.35, 0.6, 1.0), temple=True),
    "bellagio": dict(k=STONE, c="#e9dcbd", trim="#f4ebd3", top="classical", belts=2, crown=(1.0, 0.86, 0.6)),
    "paris": dict(k=STONE, c="#ddd2ba", trim="#efe7d3", top="mansard", belts=1, crown=(1.0, 0.85, 0.55)),
    "venetian": dict(k=STONE, c="#ead6b0", trim="#f5e9d0", top="hip", belts=1, crown=(1.0, 0.88, 0.65), arcade=True),
    "palazzo": dict(k=STONE, c="#e8d2a8", trim="#f5e9d0", top="lantern", belts=1, crown=(1.0, 0.85, 0.6), arcade=True),
    "wynn": dict(k=LINED, c="#8f5631", trim="#efe6d6", top="cap", crown=(1.0, 0.8, 0.55), pod="#d9c9ae"),
    "encore": dict(k=LINED, c="#8f5631", trim="#efe6d6", top="cap", crown=(1.0, 0.8, 0.55), pod="#d9c9ae"),
    "mirage": dict(k=RIBBON, c="#e0a21a", trim="#f2ede3", top="cap", crown=(1.0, 0.78, 0.35)),
    "treasureisland": dict(k=STONE, c="#d98e72", trim="#f5ede1", top="classical", belts=1, crown=(1.0, 0.3, 0.2)),
    "cosmopolitan": dict(k=GLASS, c="#4a7fb0", trim="#cdd6de", top="lightbox", pod="#aab4bd"),
    "aria": dict(k=LINED, c="#5d8fb6", trim="#d5dde5", top="plain", crown=(0.8, 0.9, 1.0), pod="#b9c2ca"),
    "vdara": dict(k=RIBBON, c="#34506e", trim="#e1e6ea", top="plain", crown=(0.8, 0.9, 1.0)),
    "veer": dict(k=GLASS, c="#a9a23c", trim="#d9d6c0", top="plain", crown=(1.0, 0.95, 0.6)),
    "planethollywood": dict(k=RIBBON, c="#3a4f6e", trim="#e9ebee", top="cap", crown=(0.75, 0.35, 1.0), pod="#3a3f48"),
    "mgm": dict(k=GLASS, c="#1f9a5e", trim="#35b877", top="cap", crown=(0.2, 1.0, 0.45), pod="#2a7d55"),
    "signature": dict(k=GLASS, c="#a89544", trim="#d8c77a", top="cap", crown=(1.0, 0.85, 0.45)),
    "luxor": dict(k=GLASS, c="#6a563e", trim="#5a4a3a", top="plain", all=True),
    "mandalay": dict(k=RIBBON, c="#e2a822", trim="#f0e7d0", top="cap", crown=(1.0, 0.8, 0.4), pod="#e3d6b8"),
    "flamingo": dict(k=RIBBON, c="#e56a9a", trim="#f7f1ef", top="cap", crown=(1.0, 0.35, 0.6), neon=True),
    "linq": dict(k=RIBBON, c="#4a5d78", trim="#eef0f2", top="cap", crown=(0.35, 0.55, 1.0)),
    "harrahs": dict(k=STONE, c="#e6d7b8", trim="#f3ead4", top="classical", belts=1, crown=(1.0, 0.25, 0.3)),
    "horseshoe": dict(k=RIBBON, c="#5a6f8a", trim="#f2f0ea", top="cap", crown=(1.0, 0.75, 0.3)),
    "resortsworld": dict(k=GLASS, c="#a3261f", trim="#c43b31", top="cap", crown=(1.0, 0.2, 0.15), pod="#b9b2aa"),
    "fontainebleau": dict(k=GLASS, c="#2f62a8", trim="#9fb6d2", top="plain", crown=(0.4, 0.75, 1.0), pod="#c9ced4"),
    "strat": dict(k=STONE, c="#d8d2c6", trim="#eeeae2", top="plain", crown=(0.7, 0.3, 1.0)),
    "trump": dict(k=GLASS, c="#c7a23c", trim="#e2ca72", top="cap", crown=(1.0, 0.85, 0.5)),
    "parkmgm": dict(k=STONE, c="#dccfb6", trim="#efe7d5", top="classical", belts=1, crown=(0.6, 1.0, 0.7)),
}
# The towers the map gives no resort: neutral and quiet, so the named stand out.
QUIET_COL = "#7d776e"

# New York-New York's towers: the skyline it copies, each tower its own
# stone or glass and its own crown.
SKYLINE = [
    ("#b9a58a", STONE, "mast"), ("#b4bac0", STONE, "spire"), ("#3d3229", GLASS, "flat"), ("#cfa390", STONE, "gable"),
    ("#8c5a44", STONE, "ziggurat"), ("#4f8f8a", GLASS, "flat"), ("#d9d0bb", STONE, "hip"), ("#77808a", RIBBON, "flat"),
    ("#a8866a", STONE, "ziggurat"), ("#c9c2b2", STONE, "mast"),
]
NYNY = {}


def prepare(data):
    """The tables that need the whole map: New York-New York's towers in
    their order of height (each its own tower of the skyline)."""
    towers = sorted((b for b in data["buildings"] if b["resort"] == "nyny" and b["h"] >= 75), key=lambda b: (-b["h"], b["id"]))
    wide = [b for b in towers if extent(b["outline"]) >= 8]
    for k, b in enumerate(wide):
        NYNY[b["id"]] = SKYLINE[k % len(SKYLINE)]


def rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def tone(h, kind):
    return (*rgb(h), kind)


def extent(outline):
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    return min(max(xs) - min(xs), max(ys) - min(ys))


class VMesh(Mesh):
    """A Mesh whose faces each carry a colour (r, g, b, a), written to a
    colour attribute (glTF COLOR_0) for the roles that read it. Colours are
    sRGB (as the hex colours are) and stored linear, as glTF's are; with
    `data`, the channels are numbers for a shader (the fountains' phases, a
    screen's id) and stored as they are. A facade's face without UVs of its
    own gets them in metres: u along it, v its height (the shader reads v as
    the height above the street, whichever way the face lies)."""

    def __init__(self, name, data=False):
        super().__init__(name)
        self.data = data
        self.col_layer = self.bm.faces.layers.int.new("colour_index")
        self.palette = [(1.0, 1.0, 1.0, 1.0)]

    def cface(self, pts, role, col=None, uvs=None):
        if uvs is None and role == F:
            p0 = Vector(pts[0])
            t = None
            for p in pts[1:]:
                d = Vector(p) - p0
                d.z = 0
                if d.length > 1e-3:
                    t = d.normalized()
                    break
            uvs = [((Vector(p) - p0).dot(t) if t else 0.0, p[2]) for p in pts]
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
                if self.data:
                    attr.data[li].color = c
                else:
                    attr.data[li].color_srgb = c
        me.color_attributes.active_color = attr
        if idx:
            me.attributes.remove(idx)
        return ob


def light_bar(m, a, b, w, col):
    """A bar of light from a to b, w thick: a closed box (its faces outward)."""
    a, b = Vector(a), Vector(b)
    # (A hair short of b: bars end to end stay separate closed boxes, never
    # welded into one with walls inside it.)
    b = a + (b - a) * 0.97
    d = (b - a).normalized()
    side = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(side).normalized() * (w / 2)
    v = d.cross(u).normalized() * (w / 2)
    ring_ = lambda c: [c - u - v, c + u - v, c + u + v, c - u + v]
    ra, rb = ring_(a), ring_(b)
    for k in range(4):
        j = (k + 1) % 4
        m.cface((ra[k], ra[j], rb[j], rb[k]), "neon", col)
    m.cface(list(reversed(ra)), "neon", col)
    m.cface(rb, "neon", col)


def ccw(outline):
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(outline, outline[1:] + outline[:1]))
    return outline if area > 0 else list(reversed(outline))


def tidy(outline):
    """A footprint anticlockwise, without the map's noise (points closer than
    0.3 m), or None if nothing is left of it."""
    outline = ccw([tuple(p) for p in outline])
    clean = [outline[0]]
    for p in outline[1:]:
        if math.dist(p, clean[-1]) > 0.3:
            clean.append(p)
    if len(clean) > 3 and math.dist(clean[0], clean[-1]) < 0.3:
        clean.pop()
    return clean if len(clean) >= 3 else None


def offset(outline, d):
    """An anticlockwise outline moved out by d metres (in, if negative), its
    corners mitred (a sharp corner's mitre kept short)."""
    n = len(outline)
    out = []
    for i in range(n):
        p0, p1, p2 = outline[i - 1], outline[i], outline[(i + 1) % n]
        l1 = math.dist(p0, p1) or 1.0
        l2 = math.dist(p1, p2) or 1.0
        n1 = ((p1[1] - p0[1]) / l1, -(p1[0] - p0[0]) / l1)
        n2 = ((p2[1] - p1[1]) / l2, -(p2[0] - p1[0]) / l2)
        mx, my = n1[0] + n2[0], n1[1] + n2[1]
        length = math.hypot(mx, my)
        if length < 1e-6:
            mx, my, length = n1[0], n1[1], 1.0
        mx, my = mx / length, my / length
        c = max(0.45, mx * n1[0] + my * n1[1])
        out.append((p1[0] + mx * d / c, p1[1] + my * d / c))
    return out


def inside_poly(pt, poly):
    x, y = pt
    hit = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
    return hit


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


def flat(m, outline, z, role="roof_flat", col=None, down=False):
    pts = [(x, y, z) for x, y in outline]
    m.cface(list(reversed(pts)) if down else pts, role, col)


def ring(m, outline, z0, z1, col, role=F, out=0.4, inn=0.3):
    """A closed ring round a footprint from z0 to z1, standing `out` proud
    of its walls: a cornice, a belt, a parapet's cap, a band of light."""
    o = offset(outline, out)
    i = offset(outline, -inn)
    n = len(outline)
    run = 0.0
    for k in range(n):
        j = (k + 1) % n
        seg = math.dist(o[k], o[j])
        m.cface([(*o[k], z0), (*o[j], z0), (*o[j], z1), (*o[k], z1)], role, col, uvs=[(run, z0), (run + seg, z0), (run + seg, z1), (run, z1)] if role in (F, "video") else None)
        m.cface([(*i[j], z0), (*i[k], z0), (*i[k], z1), (*i[j], z1)], role, col)
        m.cface([(*o[k], z1), (*o[j], z1), (*i[j], z1), (*i[k], z1)], role, col)
        m.cface([(*i[k], z0), (*i[j], z0), (*o[j], z0), (*o[k], z0)], role, col)
        run += seg


def band(m, outline, z0, z1, col, out=0.25):
    """A band of light round a footprint."""
    ring(m, outline, z0, z1, col, role="neon", out=out)


def cbox(m, c, t, hw, hd, z0, z1, col, role=F):
    """A closed box: centre c (x, y), t along it (hw half its width), hd half
    its depth, from z0 to z1."""
    nx, ny = t[1], -t[0]
    q = [(c[0] + t[0] * a * hw + nx * b * hd, c[1] + t[1] * a * hw + ny * b * hd) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for k in range(4):
        j = (k + 1) % 4
        m.cface([(*q[k], z0), (*q[j], z0), (*q[j], z1), (*q[k], z1)], role, col)
    m.cface([(*p, z1) for p in q], role, col)
    m.cface([(*p, z0) for p in reversed(q)], role, col)


def arch(m, c, t, w, h, z0, depth, col, role="neon"):
    """An arched opening's light: a round-headed panel w wide and h tall on
    a wall at c (its outward normal to the right of t), `depth` proud of it:
    a closed slab."""
    nx, ny = t[1], -t[0]
    r = w / 2
    prof = [(-r, 0.0), (r, 0.0), (r, h - r)] + [(r * math.cos(a), h - r + r * math.sin(a)) for a in (math.pi / 4, math.pi / 2, 3 * math.pi / 4)] + [(-r, h - r)]
    front = [(c[0] + t[0] * u + nx * depth, c[1] + t[1] * u + ny * depth, z0 + v) for u, v in prof]
    back = [(c[0] + t[0] * u + nx * 0.03, c[1] + t[1] * u + ny * 0.03, z0 + v) for u, v in prof]
    m.cface(front, role, col)
    m.cface(list(reversed(back)), role, col)
    n = len(prof)
    for k in range(n):
        j = (k + 1) % n
        m.cface([back[k], back[j], front[j], front[k]], role, col)


def axes(outline):
    """A footprint's centre, its long axis and its short one (unit vectors),
    and its half lengths along them."""
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cy = sum(p[1] for p in outline) / n
    sxx = sum((p[0] - cx) ** 2 for p in outline)
    syy = sum((p[1] - cy) ** 2 for p in outline)
    sxy = sum((p[0] - cx) * (p[1] - cy) for p in outline)
    a = 0.5 * math.atan2(2 * sxy, sxx - syy)
    u = (math.cos(a), math.sin(a))
    v = (-u[1], u[0])
    hu = max(abs((p[0] - cx) * u[0] + (p[1] - cy) * u[1]) for p in outline)
    hv = max(abs((p[0] - cx) * v[0] + (p[1] - cy) * v[1]) for p in outline)
    return (cx, cy), u, v, hu, hv


def wall_point(outline, origin, d):
    """The farthest point of the outline along d from origin, or None."""
    best = None
    for (ax, ay), (bx, by) in zip(outline, outline[1:] + outline[:1]):
        ex, ey = bx - ax, by - ay
        den = d[0] * ey - d[1] * ex
        if abs(den) < 1e-9:
            continue
        t = ((ax - origin[0]) * ey - (ay - origin[1]) * ex) / den
        s = ((ax - origin[0]) * d[1] - (ay - origin[1]) * d[0]) / den
        if t > 0 and 0 <= s <= 1 and (best is None or t > best):
            best = t
    return None if best is None else (origin[0] + d[0] * best, origin[1] + d[1] * best)


def temple(m, p, t, w, top, trim):
    """A temple front at a tower's top (Caesars): six tall columns before a
    lit recess, their entablature, and a pediment above the roof line; large
    enough to read from the street."""
    n = (t[1], -t[0])
    at = lambda a, b: (p[0] + t[0] * a + n[0] * b, p[1] + t[1] * a + n[1] * b)
    z0 = top - 22.0
    cbox(m, at(0, 0.6), t, w / 2 - 0.8, 0.3, z0 + 0.4, top - 2.9, (0.85, 0.7, 0.47, 1.0), "neon")
    cbox(m, at(0, 2.0), t, w / 2 + 0.6, 2.4, z0 - 1.4, z0, trim)
    for k in range(6):
        cbox(m, at(-w / 2 + 1.6 + k * (w - 3.2) / 5, 3.0), t, 1.1, 1.1, z0 + 0.02, top - 2.72, trim)
    cbox(m, at(0, 2.1), t, w / 2 + 0.8, 2.5, top - 2.7, top + 0.02, trim)
    # The pediment: a triangle's prism on the entablature.
    a0, a1 = -w / 2 - 0.8, w / 2 + 0.8
    lo, hi = -0.3, 4.6
    z = top + 0.04
    tri = lambda b: [(*at(a0, b), z), (*at(a1, b), z), (*at(0, b), z + w * 0.2)]
    f, bk = tri(hi), tri(lo)
    m.cface(f, F, trim)
    m.cface(list(reversed(bk)), F, trim)
    m.cface([bk[0], bk[1], f[1], f[0]], F, trim)
    m.cface([bk[1], bk[2], f[2], f[1]], F, trim)
    m.cface([bk[2], bk[0], f[0], f[2]], F, trim)


def arcade(m, outline, trim):
    """An arcade along a building's foot (the Venetian's): two storeys of
    lit arches on its long walls, tall enough to show over the fences, a
    cornice above each."""
    for a, b in zip(outline, outline[1:] + outline[:1]):
        length = math.dist(a, b)
        if length < 12:
            continue
        t = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
        count = int((length - 3.0) / 8.0)
        for k in range(count):
            s = length / 2 + (k - (count - 1) / 2) * 8.0
            c = (a[0] + t[0] * s, a[1] + t[1] * s)
            arch(m, c, t, 5.2, 13.0, 1.0, 0.45, (0.85, 0.7, 0.47, 1.0))
            arch(m, (c[0] - t[0] * 2.0, c[1] - t[1] * 2.0), t, 2.6, 6.4, 17.6, 0.4, (0.85, 0.7, 0.47, 1.0))
            arch(m, (c[0] + t[0] * 2.0, c[1] + t[1] * 2.0), t, 2.6, 6.4, 17.6, 0.4, (0.85, 0.7, 0.47, 1.0))
    ring(m, outline, 15.2, 16.6, trim, out=1.0)
    ring(m, outline, 25.0, 26.2, trim, out=0.9)


def crenels(m, outline, z, col):
    """Battlements round a roof: a parapet and its merlons."""
    ring(m, outline, z - 0.2, z + 1.0, col, out=0.5, inn=0.5)
    for a, b in zip(outline, outline[1:] + outline[:1]):
        length = math.dist(a, b)
        if length < 3.2:
            continue
        t = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
        count = max(1, int(length / 4.4))
        for k in range(count):
            s = length / 2 + (k - (count - 1) / 2) * (length / count)
            cbox(m, (a[0] + t[0] * s, a[1] + t[1] * s), t, 1.1, 0.48, z + 1.02, z + 2.5, col)


def turret(m, c, r, z0, z1, cone, col, k, segs=10):
    """A round turret from z0 to z1, its parapet, and its cone of a roof
    (red, blue or gold by k)."""
    circle = [(c[0] + math.cos(2 * math.pi * i / segs) * r, c[1] + math.sin(2 * math.pi * i / segs) * r) for i in range(segs)]
    walls(m, circle, z0, z1, F, col)
    if z0 > 0.5:
        flat(m, circle, z0, F, col, down=True)
    flat(m, circle, z1, F, col)
    ring(m, circle, z1 - 1.2, z1 + 0.5, col, out=0.6, inn=0.2)
    m.lathe([(0.0, z1 + 0.52), (r * 1.18, z1 + 0.52), (0.0, z1 + 0.52 + cone)], c, ("roof_red", "roof_blue", "roof_gold")[k % 3], segs=segs, smooth=False)


def castle(m, outline, h):
    """Excalibur: white walls and battlements, round turrets under cones of
    red, blue and gold."""
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    wide = max(max(xs) - min(xs), max(ys) - min(ys))
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    white = tone("#f2ede2", STONE)
    plain = tone("#f2ede2", PLAIN)
    key = int(abs(cx * 7 + cy * 3))
    if len(outline) >= 12 and wide <= 16:
        # A turret of the castle: the map's height is its cone's tip.
        # (A quarter wider than the map's, so the castle reads from the Strip.)
        r = wide * 0.62
        cone = max(12.0, r * 3.0)
        turret(m, (cx, cy), r, 0.0, h - cone - 0.52, cone, plain, key, segs=12)
        return
    if h > 60:
        # The hotel's towers round the castle: rooms in white walls, the
        # battlements, a turret at each outer corner.
        walls(m, outline, 0.0, h, F, white)
        flat(m, outline, h)
        crenels(m, outline, h, plain)
        placed = []
        n = len(outline)
        for i in range(n):
            p0, p1, p2 = outline[i - 1], outline[i], outline[(i + 1) % n]
            cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0])
            la, lb = math.dist(p0, p1), math.dist(p1, p2)
            if cross / (la * lb or 1) < 0.8 or min(la, lb) < 8 or any(math.dist(p1, q) < 22 for q in placed):
                continue
            placed.append(p1)
            turret(m, p1, 4.6, h - 16.0, h + 2.0, 11.0, plain, len(placed))
        return
    walls(m, outline, 0.0, h, F, plain if wide > 40 else white)
    flat(m, outline, h)
    crenels(m, outline, h, plain)


def skyline(m, b, outline, z0, h):
    """One of New York-New York's towers: its own stone or glass, and the
    crown of the tower it copies."""
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    w = extent(outline)
    if b["id"] not in NYNY:
        # A slender piece: a spire of steel.
        walls(m, outline, z0, h - 19.0, F, tone("#c9cdd2", PLAIN))
        m.lathe([(0.0, h - 19.0), (w * 0.55, h - 19.0), (0.3, h - 1.0), (0.0, h)], (cx, cy), "white_steel", segs=8, smooth=False)
        return
    hexc, kind, crown = NYNY[b["id"]]
    # (The map's height is the tower's tip: its crown is built down from it.)
    tip = h
    if crown == "mast":
        h = tip - 47.0
    elif crown == "spire":
        h = tip - 38.0
    elif crown == "ziggurat":
        h = tip - 18.0
    elif crown in ("hip", "gable"):
        h = tip - 8.0
    col = tone(hexc, kind)
    trim = tone(hexc, PLAIN)
    if crown == "hip":
        walls(m, outline, z0, h, F, col)
        hi = offset(outline, -w * 0.3)
        lo = [(x, y, h) for x, y in outline]
        up = [(x, y, h + 7.0) for x, y in hi]
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            m.cface([lo[i], lo[j], up[j], up[i]], F, tone("#5f8f7c", PLAIN))
        m.cface(up, F, tone("#5f8f7c", PLAIN))
        return
    walls(m, outline, z0, h, F, col)
    flat(m, outline, h)
    if z0 > 0.5:
        flat(m, outline, z0, down=True)
    ring(m, outline, h - 1.0, h + 0.8, trim, out=0.35)
    if crown in ("mast", "ziggurat"):
        z = h
        steps = 3
        for k in range(steps):
            sq = offset(outline, -w * (0.12 + 0.11 * k))
            top = z + (7.0 - k)
            walls(m, sq, z + 0.02, top, F, col)
            flat(m, sq, top)
            z = top
        if crown == "mast":
            m.lathe([(0.0, z + 0.02), (w * 0.1, z + 0.02), (0.4, z + 26.0), (0.0, z + 27.0)], (cx, cy), "white_steel", segs=8, smooth=False)
            light_bar(m, (cx, cy, z + 27.2), (cx, cy, z + 29.0), 0.9, (1.0, 0.9, 0.7, 1.0))
    elif crown == "spire":
        # A crown of narrowing tiers to a needle (steel).
        r = w * 0.46
        prof = [(0.0, h + 0.82)]
        for k in range(6):
            rr = r * (1 - k / 6.6)
            prof += [(rr, h + 0.82 + k * 3.2), (rr * 0.88, h + 0.82 + k * 3.2 + 3.0)]
        prof += [(0.5, h + 21.0), (0.0, h + 36.0)]
        m.lathe(prof, (cx, cy), "white_steel", segs=8, smooth=False)
        light_bar(m, (cx, cy, h + 36.2), (cx, cy, h + 38.0), 0.9, (1.0, 0.95, 0.85, 1.0))
    elif crown == "gable":
        # A pediment across its top.
        c, u, v, hu, hv = axes(outline)
        at = lambda a, bb: (c[0] + u[0] * a + v[0] * bb, c[1] + u[1] * a + v[1] * bb)
        hu, hv = hu * 0.8, hv * 0.8
        z = h + 0.82
        f = [(*at(-hu, hv), z), (*at(hu, hv), z), (*at(0, hv), z + 7.0)]
        bk = [(*at(-hu, -hv), z), (*at(hu, -hv), z), (*at(0, -hv), z + 7.0)]
        m.cface(f, F, trim)
        m.cface(list(reversed(bk)), F, trim)
        m.cface([bk[0], bk[1], f[1], f[0]], F, trim)
        m.cface([bk[1], bk[2], f[2], f[1]], F, trim)
        m.cface([bk[2], bk[0], f[0], f[2]], F, trim)


def plant_room(m, outline, cx, cy, w, top):
    s = max(4.0, min(w * 0.28, 16.0))
    sq = [(cx - s, cy - s * 0.6), (cx + s, cy - s * 0.6), (cx + s, cy + s * 0.6), (cx - s, cy + s * 0.6)]
    if all(inside_poly(p, outline) for p in offset(sq, 3.0)):
        walls(m, sq, top + 0.02, top + 6.0, "roof_flat", None)
        flat(m, sq, top + 6.0)


def cupola(m, c, r, z, trim):
    """The Bellagio's cupola on its tower's hub: an eight-sided belvedere,
    its arches lit, under a green dome and its lantern."""
    oct_ = [(c[0] + math.cos(math.pi / 8 + math.pi / 4 * k) * r, c[1] + math.sin(math.pi / 8 + math.pi / 4 * k) * r) for k in range(8)]
    walls(m, oct_, z - 1.0, z + 10.0, F, trim)
    flat(m, oct_, z + 10.0, F, trim)
    ring(m, oct_, z + 9.0, z + 10.4, trim, out=0.9)
    for a, b in zip(oct_, oct_[1:] + oct_[:1]):
        length = math.dist(a, b)
        t = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
        arch(m, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), t, length * 0.5, 6.6, z + 1.2, 0.25, (0.85, 0.7, 0.47, 1.0))
    m.lathe([(0.0, z + 10.42), (r * 0.92, z + 10.42), (r * 0.86, z + 13.0), (r * 0.62, z + 15.6), (r * 0.3, z + 17.2), (0.0, z + 17.6)], c, "roof_green", segs=16)
    m.lathe([(0.0, z + 17.3), (1.4, z + 17.3), (1.4, z + 20.2), (1.9, z + 20.4), (0.0, z + 23.6)], c, "roof_gold", segs=8, smooth=False)


def building(b, parent):
    """One footprint as its resort builds: its walls, its roof and crown,
    its light."""
    outline = tidy(b["outline"])
    if outline is None:
        return None
    resort = RESORT_OF.get(b["id"], b["resort"])
    st = STYLES.get(resort)
    z0, h = b["minh"], b["h"]
    if resort == "luxor":
        # (Its stepped towers stand on the ground: the map starts them at
        # the roof of a hall it gives no height.)
        z0 = 0.0
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    w = extent(outline)
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    m = VMesh(f'b_{b["id"]}')
    extras = {"resort": resort, "height": h}
    tall = h - z0 >= 45
    if resort == "excalibur":
        castle(m, outline, h)
        return m.finish(parent=parent, extras=extras)
    if resort == "nyny" and h >= 75:
        skyline(m, b, outline, z0, h)
        return m.finish(parent=parent, extras=extras)
    if resort == "bellagio" and b["roof"] in ("dome", "round"):
        # The map's dome on the tower's hub: the cupola (the tower itself is
        # build_vegas.py's, the map having it without a height).
        cupola(m, (cx, cy), w / 2, 154.4, tone(STYLES["bellagio"]["trim"], PLAIN))
        return m.finish(parent=parent, extras=extras)
    if st is None:
        walls(m, outline, z0, h, F, tone(QUIET_COL, QUIET))
        flat(m, outline, h)
        if z0 > 0.5:
            flat(m, outline, z0, down=True)
        if tall and inside_poly((cx, cy), outline):
            plant_room(m, outline, cx, cy, w, h)
        return m.finish(parent=parent, extras=extras)
    tower = tall or st.get("all")
    col = tone(st["c"], st["k"]) if tower else tone(st.get("pod", st["trim"]), PLAIN)
    trim = tone(st["trim"], PLAIN)
    kind = st["top"] if tall else "parapet"
    crown = (*st["crown"], 1.0) if st.get("crown") and tall and h - z0 > 55 else None
    if kind in ("mansard", "hip"):
        # The roof closes the walls: a slate mansard (Paris), a low tiled hip.
        rise = 9.0 if kind == "mansard" else 4.6
        inset = min(4.6 if kind == "mansard" else 6.0, w * 0.22)
        top = h - rise
        walls(m, outline, z0, top, F, col)
        tile = tone("#4f5b68" if kind == "mansard" else "#b0654a", PLAIN)
        hi = offset(outline, -inset)
        lo = [(x, y, top) for x, y in outline]
        up = [(x, y, h) for x, y in hi]
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            m.cface([lo[i], lo[j], up[j], up[i]], F, tile)
        m.cface(up, F, tile)
        ring(m, outline, top - 1.6, top - 0.1, trim, out=1.1)
        if kind == "mansard":
            # Its dormers, lit.
            for a, c in zip(outline, outline[1:] + outline[:1]):
                length = math.dist(a, c)
                if length < 6:
                    continue
                t = ((c[0] - a[0]) / length, (c[1] - a[1]) / length)
                count = int(length / 7.0)
                for k in range(count):
                    s = length / 2 + (k - (count - 1) / 2) * 7.0
                    cbox(m, (a[0] + t[0] * s - t[1] * 1.6, a[1] + t[1] * s + t[0] * 1.6), t, 0.9, 1.0, top + 2.2, top + 4.8, (0.85, 0.7, 0.47, 1.0), "neon")
        if crown:
            band(m, outline, top - 3.4, top - 2.5, crown, out=0.5)
    else:
        top = h
        walls(m, outline, z0, top, F, col)
        flat(m, outline, top)
        if kind == "parapet":
            ring(m, outline, top - 1.0, top + 0.7, trim, out=0.3)
        elif kind in ("classical", "lantern"):
            ring(m, outline, top - 1.7, top, trim, out=1.3)
            attic = offset(outline, -min(2.4, w * 0.12))
            walls(m, attic, top + 0.02, top + 3.6, F, trim)
            flat(m, attic, top + 3.6)
            ring(m, attic, top + 3.0, top + 3.7, trim, out=0.5)
            if crown:
                band(m, outline, top - 3.4, top - 2.5, crown, out=0.5)
            if kind == "lantern" and inside_poly((cx, cy), outline):
                # The Palazzo's lantern: a lit crown of glass on its hub.
                s = max(6.0, min(w * 0.22, 14.0))
                m.lathe([(0.0, top + 3.62), (s, top + 3.62), (s, top + 9.6), (s * 0.8, top + 11.6), (s * 0.45, top + 16.6), (0.0, top + 18.6)], (cx, cy), "roof_gold", segs=12)
        elif kind == "cap":
            ring(m, outline, top - 4.2, top + 1.4, trim, out=0.5)
            if resort == "mgm" and crown:
                # MGM Grand's crown: its top storeys' edge in emerald light.
                band(m, outline, top + 1.42, top + 2.6, crown, out=0.3)
                band(m, outline, top - 9.0, top - 8.2, crown, out=0.4)
            if crown:
                band(m, outline, top - 5.7, top - 4.8, crown, out=0.4)
        elif kind == "lightbox":
            # The Cosmopolitan's crown: a box of soft light round its top.
            ring(m, outline, top - 6.5, top + 1.6, (0.62, 0.72, 0.86, 1.0), role="neon", out=0.4)
        else:
            ring(m, outline, top - 0.6, top + 1.0, trim, out=0.25)
            if crown:
                band(m, outline, top - 2.6, top - 1.7, crown, out=0.35)
        if tall and kind not in ("lantern",) and top - z0 > 60 and inside_poly((cx, cy), outline):
            plant_room(m, outline, cx, cy, w * (0.7 if kind == "classical" else 1.0), top + (3.6 if kind == "classical" else 0.0))
    if z0 > 0.5:
        flat(m, outline, z0, down=True)
    if tall:
        for k in range(st.get("belts", 0)):
            z = z0 + (h - z0) * (k + 1) / (st["belts"] + 1.5)
            ring(m, outline, z, z + 1.0, trim, out=0.55)
        if st.get("temple") and h > 90:
            c, u, v, hu, hv = axes(outline)
            if hu > 30:
                for sgn in (1, -1):
                    p = wall_point(outline, c, (v[0] * sgn, v[1] * sgn))
                    if not p:
                        continue
                    # As wide as the wall stays flat behind it: on a curved
                    # tower the front narrows until its ends stand within a
                    # metre of the wall.
                    d = (v[0] * sgn, v[1] * sgn)
                    wide = min(hu * 0.7, 46.0)
                    while wide > 14.0:
                        ends = [wall_point(outline, (p[0] + u[0] * e * wide / 2 - d[0] * 60, p[1] + u[1] * e * wide / 2 - d[1] * 60), d) for e in (-1, 1)]
                        if all(q and (p[0] - q[0]) * d[0] + (p[1] - q[1]) * d[1] < 1.0 for q in ends):
                            break
                        wide -= 4.0
                    temple(m, p, (-u[0] * sgn, -u[1] * sgn), wide, h, trim)
        if st.get("neon"):
            # The Flamingo's neon: bands of pink and orange up its towers.
            for k in range(3):
                z = z0 + (h - z0) * (k + 1) / 4
                band(m, outline, z, z + 0.8, (1.0, 0.3, 0.6, 1.0) if k % 2 else (1.0, 0.55, 0.2, 1.0), out=0.35)
    if st.get("arcade") and h - z0 > 30 and z0 < 0.5:
        arcade(m, outline, trim)
    return m.finish(parent=parent, extras=extras)
