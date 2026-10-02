"""Build the yachts and export them to assets/yachts.glb
(docs/superpowers/specs/2026-10-01-trackside-blender-design.md, section 8.1).

Run headless, so it never touches an open Blender session:

  F1_YACHTS_OUT=assets/yachts.glb Blender -b --factory-startup -P tools/blender/build_yachts.py

Set F1_YACHTS_PREVIEW=<dir> to also render them there for review.

Real metres; the bow toward +X, Y to port, Z up, the waterline at z = 0.
Each yacht is one mesh per level of detail, named <kind>_lod0 (near) and
<kind>_lod1 (far), with the number of its deck tiers in its extras:

  superyacht   60 m, four decks, a radar arch, a tender on the aft deck
  motor        45 m, three decks, the flybridge under its hardtop
  explorer     38 m, a high bow, a squared superstructure, a crane
  sail         50 m, a low deckhouse, one tall mast, the sail furled on its boom
  tender       the small boat that ferries the guests

Materials by role (r3d/yachts.js recolours and lights them): hull, boot (the
waterline stripe), deck (teak), super (the superstructure), glass, rail,
gear (masts, radar, cranes), lit (the glass that lights at night).
No names, no logos, no text.
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

OUT = os.environ.get("F1_YACHTS_OUT", "")
PREVIEW = os.environ.get("F1_YACHTS_PREVIEW", "")

if (bpy.data.filepath or bpy.data.is_dirty) and os.environ.get("F1_BUILD_FORCE") != "1":
    raise RuntimeError("build_yachts.py clears the scene, and this one has work in it. Use a new file, or set F1_BUILD_FORCE=1.")
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials):
    for block in list(coll):
        coll.remove(block)
scene = bpy.context.scene


def mat(name, color, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*color, 1)
    return m


ROLES = ["hull", "boot", "deck", "super", "glass", "rail", "gear", "lit"]
MATS = {
    "hull": mat("hull", (0.92, 0.93, 0.94), rough=0.18),
    "boot": mat("boot", (0.05, 0.08, 0.16), rough=0.3),
    "deck": mat("deck", (0.55, 0.36, 0.2), rough=0.7),
    "super": mat("super", (0.95, 0.95, 0.94), rough=0.25),
    "glass": mat("glass", (0.03, 0.05, 0.08), metal=0.4, rough=0.06),
    "rail": mat("rail", (0.8, 0.82, 0.84), metal=0.9, rough=0.25),
    "gear": mat("gear", (0.12, 0.13, 0.14), metal=0.3, rough=0.4),
    "lit": mat("lit", (0.04, 0.06, 0.09), metal=0.3, rough=0.08),
}


class Mesh:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.roles = []

    def role(self, r):
        if r not in self.roles:
            self.roles.append(r)
        return self.roles.index(r)

    def vert(self, p):
        return self.bm.verts.new(Vector(p))

    def face(self, verts, role, smooth=False):
        """Points or BMVerts; repeated corners are dropped (a bow's point)."""
        vs = [v if isinstance(v, bmesh.types.BMVert) else self.vert(v) for v in verts]
        uniq = []
        for v in vs:
            if all((v.co - u.co).length > 1e-5 for u in uniq):
                uniq.append(v)
        if len(uniq) < 3:
            return None
        try:
            f = self.bm.faces.new(uniq)
        except ValueError:
            return None
        f.material_index = self.role(role)
        f.smooth = smooth
        return f

    def box(self, lo, hi, role, rot=None, about=None):
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        p = [Vector((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        if rot is not None:
            c = Vector(about) if about is not None else (Vector(lo) + Vector(hi)) / 2
            p = [c + rot @ (v - c) for v in p]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.face([p[i] for i in q], role)

    def bar(self, a, b, r, role, sides=4):
        """A thin rod from a to b (a rail, a stay, a post)."""
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        side = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        u = d.cross(side).normalized()
        v = d.cross(u)
        ra = [a + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r for k in range(sides)]
        rb = [p + (b - a) for p in ra]
        for k in range(sides):
            j = (k + 1) % sides
            self.face((ra[k], ra[j], rb[j], rb[k]), role)

    def loft(self, rings, roles, smooth=True, closed=False):
        """Rings of points (each the same length), faces between neighbours;
        roles[k] is the role of the band between point k and k + 1."""
        vs = [[self.vert(p) for p in r] for r in rings]
        n = len(rings[0])
        for r0, r1 in zip(vs, vs[1:]):
            for k in range(n if closed else n - 1):
                j = (k + 1) % n
                self.face((r0[k], r1[k], r1[j], r0[j]), roles[k], smooth)
        return vs

    def finish(self, extras=None):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for r in self.roles:
            me.materials.append(MATS[r])
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        for k, v in (extras or {}).items():
            ob[k] = v
        return ob


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# -----------------------------------------------------------------------------
# The hull
# -----------------------------------------------------------------------------

class Hull:
    """A displacement hull: L long, B in the beam, freeboard D at the stern
    rising by `sheer` to the bow, draft T. The stem is raked: the bow's
    foot is `rake` metres aft of its top."""

    def __init__(self, L, B, D, sheer, T, rake, entry=0.5):
        self.L, self.B, self.D, self.sheer, self.T, self.rake, self.entry = L, B, D, sheer, T, rake, entry

    def half(self, t):
        """Half-breadth at the deck at station t (0 the transom, 1 the bow)."""
        e = self.entry
        if t <= e:
            return self.B / 2 * (0.9 + 0.1 * math.sin(t / e * math.pi / 2))
        u = (t - e) / (1 - e)
        return self.B / 2 * max(0.0, 1 - u ** 1.8) ** 0.85

    def deck(self, t):
        return self.D + self.sheer * t ** 2.2

    def x(self, t, z):
        """Station t's x at height z: the bow rakes, the foot further aft."""
        lean = (self.deck(t) - z) / (self.deck(t) + self.T) * self.rake * smoothstep(0.55, 1.0, t)
        return t * self.L - lean

    # The section, deck edge down to the keel, as (fraction of half, z).
    def section(self, t, coarse=False):
        d, T = self.deck(t), self.T
        keel = -T * (1 - smoothstep(0.82, 1.0, t)) - 0.05
        if coarse:
            return [(1.0, d), (0.97, 0.35), (0.0, keel)]
        return [(1.0, d), (1.0, d - 0.35), (0.985, d * 0.5), (0.95, 0.42), (0.93, -0.12), (0.68, -T * 0.6 + 0.1 * (1 - t)), (0.0, keel)]

    def rings(self, stations, coarse=False):
        rings = []
        for i in range(stations + 1):
            # Closer together toward the bow, where the hull curves most.
            t = math.sin(i / stations * math.pi / 2) ** 0.9 if stations > 6 else i / stations
            hb = self.half(t)
            sec = self.section(t, coarse)
            port = [(self.x(t, z), hb * f, z) for f, z in sec]
            star = [(self.x(t, z), -hb * f, z) for f, z in reversed(sec[:-1])]
            rings.append(port + star)
        return rings

    def build(self, m, stations=18, coarse=False):
        rings = self.rings(stations, coarse)
        n = len(rings[0])
        if coarse:
            roles = ["hull", "boot", "boot", "hull"]
        else:
            # Port: rubrail band, topsides, boot top, boot stripe, bottom...
            port = ["hull", "hull", "hull", "boot", "hull", "hull"]
            roles = port + list(reversed(port))
        m.loft(rings, roles, smooth=True)
        # The deck, port to starboard between stations (teak).
        for r0, r1 in zip(rings, rings[1:]):
            m.face((r0[0], r0[-1], r1[-1], r1[0]), "deck")
        # The transom: flat, the stern's ring closed.
        m.face(list(reversed(rings[0])), "hull")
        return rings


def window_strip(m, hull, t0, t1, z0, z1, count, role="lit"):
    """A row of long hull windows on both topsides, just proud of the hull."""
    for k in range(count):
        a = t0 + (t1 - t0) * k / count
        b = a + (t1 - t0) / count * 0.82
        for sg in (1, -1):
            ya, yb = sg * (hull.half(a) * 0.985 + 0.03), sg * (hull.half(b) * 0.985 + 0.03)
            m.face(((hull.x(a, z0), ya, z0), (hull.x(b, z0), yb, z0), (hull.x(b, z1), yb, z1), (hull.x(a, z1), ya, z1)), role)


def swim_platform(m, hull):
    w = hull.half(0.0) * 0.92
    m.box((-1.6, -w, 0.25), (0.05, w, 0.5), "deck")


# -----------------------------------------------------------------------------
# The superstructure
# -----------------------------------------------------------------------------

def outline(x0, x1, w, nose, steps=6):
    """A deck tier's plan: square aft at x0, straight sides at +-w, a
    rounded front from x1 - nose to x1. Counter-clockwise from aft port."""
    pts = [(x0, w)]
    for k in range(steps + 1):
        a = math.pi / 2 * (1 - k / steps)
        pts.append((x1 - nose + nose * math.cos(a), w * math.sin(a)))
    for k in range(1, steps + 1):
        a = -math.pi / 2 * k / steps
        pts.append((x1 - nose + nose * math.cos(a), w * math.sin(a)))
    pts.append((x0, -w))
    return pts


def tier(m, x0, x1, w, z0, h, nose, rake, glass=(0.3, 0.86), front_glass="glass", side_glass="lit",
         overhang=0.45, rails=True, steps=6, coarse=False):
    """One deck tier: walls from z0 to z0 + h, the front raked back by
    `rake` at the top; a band of glass round it; a deck slab overhanging
    on top, with a rail round its edge."""
    lo = outline(x0, x1, w, nose, 2 if coarse else steps)
    hi = outline(x0, x1 - rake, w * 0.97, max(0.5, nose - rake * 0.4), 2 if coarse else steps)
    lo3 = [(x, y, z0) for x, y in lo]
    hi3 = [(x, y, z0 + h) for x, y in hi]
    n = len(lo3)
    for k in range(n):
        j = (k + 1) % n
        m.face((lo3[k], lo3[j], hi3[j], hi3[k]), "super")
    m.face(hi3, "super")
    if coarse:
        return hi
    # The glass band, a little proud of the walls: the front's wraps round
    # the nose, the sides are the cabins' windows (lit at night).
    g0, g1 = z0 + h * glass[0], z0 + h * glass[1]

    def at(k, f):
        (ax, ay), (bx, by) = lo[k], hi[k]
        return ax + (bx - ax) * f, ay + (by - ay) * f

    for k in range(n - 1):
        j = k + 1
        if lo[k][0] == x0 and lo[j][0] == x0:
            continue
        (ax0, ay0), (ax1, ay1) = at(k, glass[0]), at(k, glass[1])
        (bx0, by0), (bx1, by1) = at(j, glass[0]), at(j, glass[1])
        # Outward a few centimetres (the outline's normal).
        ex, ey = by0 - ay0, -(bx0 - ax0)
        l = math.hypot(ex, ey) or 1
        ox, oy = -ey / l * 0.0, ex / l * 0.0
        nx, ny = (by0 - ay0) / l, -(bx0 - ax0) / l
        push = 0.04
        role = front_glass if min(ax0, bx0) > x1 - nose - 0.5 else side_glass
        m.face(((ax0 - nx * push, ay0 - ny * push, g0), (bx0 - nx * push, by0 - ny * push, g0),
                (bx1 - nx * push, by1 - ny * push, g1), (ax1 - nx * push, ay1 - ny * push, g1)), role)
    # The deck slab on top, overhanging.
    slab = outline(x0 - overhang * 0.6, x1 - rake + overhang * 0.5, w * 0.97 + overhang, max(0.6, nose - rake * 0.4 + overhang * 0.5), steps)
    top = z0 + h
    lo_s = [(x, y, top) for x, y in slab]
    hi_s = [(x, y, top + 0.28) for x, y in slab]
    for k in range(len(slab)):
        j = (k + 1) % len(slab)
        m.face((lo_s[k], lo_s[j], hi_s[j], hi_s[k]), "super")
    m.face(hi_s, "deck")
    m.face(list(reversed(lo_s)), "super")
    if rails:
        rail_round(m, slab, top + 0.28, inset=0.12)
    return slab


def rail_round(m, pts, z, inset=0.1, height=1.0, every=2.2, open_aft=False):
    """Stanchions and a top rail round an outline (open at the aft end if
    asked: where the steps go down)."""
    n = len(pts)
    # The outline pulled in a little toward its middle.
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    q = []
    for x, y in pts:
        dx, dy = x - cx, y - cy
        l = math.hypot(dx, dy) or 1
        q.append((x - dx / l * inset, y - dy / l * inset))
    for k in range(n):
        j = (k + 1) % n
        (ax, ay), (bx, by) = q[k], q[j]
        if open_aft and abs(ax - bx) < 1e-3 and ax < cx:
            continue
        m.bar((ax, ay, z + height), (bx, by, z + height), 0.035, "rail")
        seg = math.hypot(bx - ax, by - ay)
        count = max(1, int(seg / every))
        for s in range(count):
            f = s / count
            px, py = ax + (bx - ax) * f, ay + (by - ay) * f
            m.bar((px, py, z), (px, py, z + height), 0.025, "rail", sides=3)


def deck_rail(m, hull, t0=0.04, t1=0.97, every=0.06):
    """The rail along the main deck's edge, both sides, round the bow."""
    pts = []
    for sg in (1, -1):
        side = []
        t = t0
        while t <= t1 + 1e-6:
            side.append((hull.x(t, hull.deck(t)), sg * (hull.half(t) - 0.15), hull.deck(t)))
            t += every
        pts.append(side if sg > 0 else list(reversed(side)))
    run = pts[0] + pts[1]
    for a, b in zip(run, run[1:]):
        m.bar((a[0], a[1], a[2] + 1.0), (b[0], b[1], b[2] + 1.0), 0.035, "rail")
        m.bar(a, (a[0], a[1], a[2] + 1.0), 0.025, "rail", sides=3)
    # A bulwark-like toe rail is the hull's own rubrail band.


def tender(m, x, y, z, L=7.2, coarse=False):
    """A tender: a small open boat, a console and a seat, on chocks."""
    h = Hull(L, L * 0.36, 0.85, 0.25, 0.35, 0.6, entry=0.45)
    rings = h.rings(5 if coarse else 8, coarse=True)
    rings = [[(p[0] + x, p[1] + y, p[2] + z) for p in r] for r in rings]
    m.loft(rings, ["super", "super", "super", "super"], smooth=True)
    for r0, r1 in zip(rings, rings[1:]):
        m.face((r0[0], r0[-1], r1[-1], r1[0]), "deck")
    m.face(list(reversed(rings[0])), "super")
    if not coarse:
        m.box((x + L * 0.45, y - 0.45, z + 0.85), (x + L * 0.62, y + 0.45, z + 1.6), "super")
        m.box((x + L * 0.6, y - 0.42, z + 1.45), (x + L * 0.64, y + 0.42, z + 1.85), "glass", rot=Matrix.Rotation(math.radians(-25), 3, "Y"))
        m.box((x + L * 0.2, y - 0.6, z + 0.85), (x + L * 0.38, y + 0.6, z + 1.25), "boot")


def radar_arch(m, x, z, w, h, depth=1.4):
    """A swept radar arch over the top deck, domes on its crossbar."""
    for sg in (1, -1):
        m.box((x - depth / 2, sg * w - 0.25, z), (x + depth / 2, sg * w + 0.25, z + h), "super",
              rot=Matrix.Rotation(math.radians(-14), 3, "Y"), about=(x, sg * w, z))
    m.box((x - depth / 2 - 0.4, -w - 0.3, z + h - 0.5), (x + depth / 2 - 0.4, w + 0.3, z + h), "super")
    for y in (-w * 0.45, w * 0.45):
        m.box((x - 0.5, y - 0.5, z + h), (x + 0.5, y + 0.5, z + h + 0.9), "super")
    m.bar((x - 0.4, 0, z + h), (x - 0.4, 0, z + h + 3.2), 0.08, "gear")
    m.box((x - 1.6, -0.08, z + h + 2.4), (x + 0.8, 0.08, z + h + 2.55), "gear")


# -----------------------------------------------------------------------------
# The yachts
# -----------------------------------------------------------------------------

def superyacht(coarse):
    m = Mesh("superyacht_lod1" if coarse else "superyacht_lod0")
    h = Hull(60.0, 11.0, 3.4, 1.6, 2.9, 3.2, entry=0.52)
    h.build(m, 6 if coarse else 18, coarse)
    swim_platform(m, h)
    # Four tiers stepping back, raked fronts; the main deck's long.
    d = h.deck(0.4)
    tiers = [(8.0, 44.0, 4.9, 3.0, 5.0, 1.4), (12.0, 39.0, 4.5, 2.8, 4.2, 1.6), (17.0, 33.5, 4.1, 2.6, 3.4, 1.5), (21.0, 30.0, 3.6, 2.4, 2.6, 1.2)]
    z = d
    for k, (x0, x1, w, ht, nose, rake) in enumerate(tiers):
        tier(m, x0, x1, w, z, ht, nose, rake, coarse=coarse, rails=k > 0)
        z += ht + 0.28
    if coarse:
        return m.finish({"decks": 4})
    window_strip(m, h, 0.28, 0.62, d - 1.65, d - 0.95, 6)
    deck_rail(m, h, 0.05, 0.97)
    radar_arch(m, 26.0, z, 2.6, 2.4)
    tender(m, 1.5, 0.0, d + 0.15, 7.0)
    # The bow's anchor hawses and a mooring winch.
    for sg in (1, -1):
        m.box((h.x(0.9, d - 0.9) - 0.4, sg * h.half(0.9) * 0.99 - 0.05, d - 1.2), (h.x(0.9, d - 0.9) + 0.4, sg * h.half(0.9) * 0.99 + 0.05, d - 0.6), "gear")
    m.box((50.0, -0.6, h.deck(0.83)), (51.2, 0.6, h.deck(0.83) + 0.6), "gear")
    return m.finish({"decks": 4})


def motor(coarse):
    m = Mesh("motor_lod1" if coarse else "motor_lod0")
    h = Hull(45.0, 8.8, 3.1, 1.3, 2.4, 2.6, entry=0.5)
    h.build(m, 6 if coarse else 16, coarse)
    swim_platform(m, h)
    d = h.deck(0.4)
    tiers = [(6.0, 33.0, 3.9, 2.7, 4.2, 1.5), (10.0, 28.5, 3.6, 2.5, 3.6, 1.6), (13.5, 22.0, 3.2, 1.2, 2.0, 0.4)]
    z = d
    for k, (x0, x1, w, ht, nose, rake) in enumerate(tiers):
        tier(m, x0, x1, w, z, ht, nose, rake, coarse=coarse, rails=k == 1)
        z += ht + 0.28
    if coarse:
        return m.finish({"decks": 3})
    # The flybridge's hardtop on four posts, its console under it.
    top = z + 1.2
    for x in (14.0, 20.5):
        for sg in (1, -1):
            m.bar((x, sg * 2.6, z - 0.3), (x + 0.3, sg * 2.6, top), 0.09, "super")
    hard = outline(12.5, 22.5, 3.3, 2.2, 6)
    m.face([(x, y, top + 0.25) for x, y in hard], "super")
    lo = [(x, y, top) for x, y in hard]
    hi = [(x, y, top + 0.25) for x, y in hard]
    for k in range(len(hard)):
        j = (k + 1) % len(hard)
        m.face((lo[k], lo[j], hi[j], hi[k]), "super")
    m.face(list(reversed(lo)), "super")
    m.box((18.5, -1.2, z - 0.3), (20.0, 1.2, z + 0.7), "super")
    m.box((19.9, -1.1, z + 0.5), (20.3, 1.1, z + 0.95), "glass", rot=Matrix.Rotation(math.radians(-30), 3, "Y"))
    m.bar((17.0, 0, top + 0.25), (17.0, 0, top + 2.0), 0.06, "gear")
    m.box((16.2, -0.06, top + 1.6), (17.8, 0.06, top + 1.7), "gear")
    window_strip(m, h, 0.3, 0.6, d - 1.5, d - 0.95, 5)
    deck_rail(m, h, 0.05, 0.97)
    tender(m, 1.2, 0.0, h.deck(0.0) + 0.15, 6.2)
    return m.finish({"decks": 3})


def explorer(coarse):
    m = Mesh("explorer_lod1" if coarse else "explorer_lod0")
    h = Hull(38.0, 8.6, 3.8, 2.4, 2.8, 0.9, entry=0.45)
    h.build(m, 6 if coarse else 16, coarse)
    swim_platform(m, h)
    d = h.deck(0.45)
    # A square-shouldered superstructure, set forward, the bridge's windows
    # raked forward-in (an explorer's look), working deck aft.
    tiers = [(13.0, 30.0, 3.8, 2.7, 1.2, -0.5), (15.0, 29.0, 3.6, 2.5, 1.0, -0.6), (18.0, 27.0, 3.2, 2.2, 0.9, -0.5)]
    z = d
    for k, (x0, x1, w, ht, nose, rake) in enumerate(tiers):
        tier(m, x0, x1, w, z, ht, nose, rake, glass=(0.32, 0.8), coarse=coarse, rails=k > 0, steps=2)
        z += ht + 0.28
    if coarse:
        return m.finish({"decks": 3})
    # A mast with the radar, the crane on the working deck, the tender by it.
    m.bar((22.0, 0, z), (22.0, 0, z + 4.5), 0.12, "gear")
    m.box((20.6, -0.08, z + 3.6), (23.4, 0.08, z + 3.75), "gear")
    m.box((21.2, -0.6, z + 1.6), (22.8, 0.6, z + 1.8), "gear")
    base = h.deck(0.2)
    m.bar((9.5, -2.0, base), (9.5, -2.0, base + 3.0), 0.25, "gear", sides=6)
    m.bar((9.5, -2.0, base + 3.0), (3.5, -0.6, base + 4.6), 0.16, "gear", sides=6)
    m.bar((3.5, -0.6, base + 4.6), (3.5, -0.6, base + 2.6), 0.02, "rail", sides=3)
    tender(m, 1.5, 0.6, base + 0.15, 6.6)
    window_strip(m, h, 0.35, 0.7, d - 1.9, d - 1.2, 4)
    deck_rail(m, h, 0.04, 0.97)
    return m.finish({"decks": 3})


def sail(coarse):
    m = Mesh("sail_lod1" if coarse else "sail_lod0")
    h = Hull(50.0, 9.4, 2.4, 0.7, 3.6, 4.5, entry=0.48)
    h.build(m, 6 if coarse else 18, coarse)
    swim_platform(m, h)
    d = h.deck(0.4)
    # The low deckhouse, glass all round, aft of the mast.
    tier(m, 15.0, 27.0, 3.0, d, 1.9, 2.2, 0.9, glass=(0.2, 0.9), coarse=coarse, rails=False)
    mast_x = 31.0
    top = d + 56.0
    m.bar((mast_x, 0, d), (mast_x - 0.6, 0, top), 0.25 if not coarse else 0.4, "gear", sides=6 if not coarse else 4)
    if coarse:
        return m.finish({"decks": 1})
    # The boom, the sail furled on it under its cover, the stays.
    boom = d + 3.4
    m.bar((mast_x - 0.2, 0, boom), (mast_x - 19.0, 0, boom + 0.6), 0.2, "gear", sides=6)
    m.bar((mast_x - 0.8, 0, boom + 0.45), (mast_x - 18.0, 0, boom + 1.0), 0.42, "super", sides=6)
    stem = (h.x(1.0, h.deck(1.0)), 0, h.deck(1.0))
    m.bar(stem, (mast_x - 0.55, 0, top - 2.0), 0.03, "rail", sides=3)
    m.bar((0.6, 0, h.deck(0.0) + 0.3), (mast_x - 0.6, 0, top), 0.03, "rail", sides=3)
    # The headsail furled round its stay, thick at the foot.
    stay_top = Vector((mast_x - 0.55, 0, top - 2.0))
    foot = Vector(stem) + (stay_top - Vector(stem)) * 0.02
    for k in range(6):
        a = foot + (stay_top - foot) * (k / 6)
        b = foot + (stay_top - foot) * ((k + 1) / 6)
        m.bar(a, b, 0.32 * (1 - k / 7), "super", sides=6)
    # Three pairs of spreaders, the shrouds over their tips to the chainplates.
    for sg in (1, -1):
        chain = (mast_x - 1.0, sg * (h.half(0.6) - 0.2), h.deck(0.6))
        prev = chain
        for k, (zz, span) in enumerate(((d + 16.0, 2.8), (d + 30.0, 2.1), (d + 43.0, 1.4))):
            tip = (mast_x - 0.4 - 0.01 * zz, sg * span, zz)
            m.bar((mast_x - 0.4 - 0.01 * zz, 0, zz), tip, 0.07, "gear", sides=4)
            m.bar(prev, tip, 0.025, "rail", sides=3)
            prev = tip
        m.bar(prev, (mast_x - 0.55, 0, top - 4.0), 0.025, "rail", sides=3)
    # Winches by the cockpit and the mast, hatches on the foredeck.
    for (wx, wy) in ((12.0, 2.0), (12.0, -2.0), (9.0, 2.2), (9.0, -2.2), (mast_x - 1.5, 0.8), (mast_x - 1.5, -0.8)):
        base = h.deck(wx / h.L)
        m.bar((wx, wy, base), (wx, wy, base + 0.45), 0.22, "rail", sides=8)
    for hx in (35.0, 39.0, 43.0):
        base = h.deck(hx / h.L)
        m.box((hx - 0.7, -0.7, base), (hx + 0.7, 0.7, base + 0.18), "glass")
    # The cockpit aft, a wheel pedestal, the deck rail.
    m.box((7.0, -2.4, d - 0.6), (13.5, 2.4, d + 0.5), "deck")
    m.box((12.6, -0.25, d + 0.5), (13.0, 0.25, d + 1.4), "gear")
    deck_rail(m, h, 0.04, 0.95)
    window_strip(m, h, 0.35, 0.6, d - 1.3, d - 0.85, 4, role="glass")
    return m.finish({"decks": 1})


BUILT = {}
for build in (superyacht, motor, explorer, sail):
    for coarse in (False, True):
        ob = build(coarse)
        BUILT[ob.name] = ob
t = Mesh("tender")
tender(t, 0.0, 0.0, -0.3, 7.2)
BUILT["tender"] = t.finish()

# --- Self-checks -----------------------------------------------------------------
for name, ob in BUILT.items():
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    xs = [v.co.x for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    print(f"{name}: {tris} triangles, {max(xs) - min(xs):.1f} m long, {min(zs):.2f} .. {max(zs):.1f} m")
    budget = 7000 if name.endswith("lod0") else 400 if name.endswith("lod1") else 600
    if tris > budget:
        raise RuntimeError(f"{name} has {tris} triangles, over its {budget}")
    if min(zs) < -4.0 or (name != "tender" and min(zs) > -0.3):
        raise RuntimeError(f"{name}'s keel is at {min(zs):.2f} m")

# --- Export ------------------------------------------------------------------------
if OUT:
    bpy.ops.object.select_all(action="DESELECT")
    for ob in BUILT.values():
        ob.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                              export_extras=True, export_texcoords=False, export_normals=True, export_animations=False)
    print("exported", OUT)

# --- Preview -----------------------------------------------------------------------
if PREVIEW:
    engines = [i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs["Color"].default_value = (0.5, 0.66, 0.85, 1)
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(50), math.radians(8), math.radians(140))
    scene.collection.objects.link(sun)
    bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0))
    sea = bpy.context.active_object
    sea.data.materials.append(mat("sea", (0.03, 0.18, 0.28), metal=0.1, rough=0.12))
    # The near models side by side, as moored stern-to.
    names = ["superyacht_lod0", "motor_lod0", "explorer_lod0", "sail_lod0"]
    for k, n in enumerate(names):
        BUILT[n].location = (0, k * 16.0, 0)
    for n, ob in BUILT.items():
        if n not in names:
            ob.hide_render = True
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 35
    cam.data.clip_end = 3000
    scene.collection.objects.link(cam)
    scene.camera = cam
    for tag, loc, aim in (("quay", (95, -45, 22), (30, 26, 4)), ("bow", (110, 30, 9), (30, 24, 8)), ("close", (48, -26, 12), (32, 0, 7))):
        cam.location = loc
        cam.rotation_euler = (Vector(aim) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"yachts_{tag}.png")
        bpy.ops.render.render(write_still=True)
