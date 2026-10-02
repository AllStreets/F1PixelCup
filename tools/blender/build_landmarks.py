"""Build the trackside landmarks and the grandstand, and export them to
assets/landmarks/*.glb (docs/superpowers/specs/2026-10-01-trackside-blender-design.md).

Run headless, so it never touches an open Blender session:

  F1_LANDMARKS_OUT=assets/landmarks Blender -b --factory-startup -P tools/blender/build_landmarks.py

Set F1_LANDMARKS_PREVIEW=<dir> to also render each model there for review.

Real metres, the ground at z = 0, the front toward +Y (the side that faces
the circuit; glTF's -z). No logos, no trademarks, no text: the shapes are
from public photographs, used only as reference.

  casino.glb            the Casino de Monte-Carlo's front on the Place du
                        Casino, and the Hôtel de Paris beside it
  marina_bay_sands.glb  three towers, each a straight leg and a curved one,
                        and the SkyPark's ship across their tops
  grandstand.glb        a covered stand: ten stepped rows of seats, two
                        stairs, a rail, end walls, a cantilevered roof; empties
                        row_0 .. row_9 mark where each row's spectators stand
                        (extras: the seats' x positions)

Materials by role (r3d/landmarks.js lights and recolours them): stone,
stone_dark, roof_slate, glass, gold, gear (iron); facade (the window shader
reads the UVs, in metres: u along the wall, v up), skypark, window_lit, pool,
planting; seat, concrete, concrete_dark, steel, roof_membrane.
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

OUT = os.environ.get("F1_LANDMARKS_OUT", "")
PREVIEW = os.environ.get("F1_LANDMARKS_PREVIEW", "")

if (bpy.data.filepath or bpy.data.is_dirty) and os.environ.get("F1_BUILD_FORCE") != "1":
    raise RuntimeError("build_landmarks.py clears the scene, and this one has work in it. Use a new file, or set F1_BUILD_FORCE=1.")
scene = bpy.context.scene


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for block in list(coll):
            coll.remove(block)
    MATS.clear()


def mat(name, color, metal=0.0, rough=0.7, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 2.0
    m.diffuse_color = (*color, 1)
    return m


PALETTE = {
    "stone": ((0.86, 0.76, 0.58), 0.0, 0.8),
    "stone_dark": ((0.74, 0.63, 0.46), 0.0, 0.8),
    "roof_slate": ((0.30, 0.36, 0.36), 0.2, 0.55),
    "glass": ((0.06, 0.09, 0.12), 0.3, 0.12),
    "gold": ((0.85, 0.62, 0.22), 1.0, 0.3),
    "gear": ((0.08, 0.09, 0.09), 0.6, 0.45),
    "facade": ((0.55, 0.60, 0.66), 0.4, 0.3),
    "skypark": ((0.82, 0.84, 0.86), 0.2, 0.45),
    "window_lit": ((0.85, 0.9, 1.0), 0.0, 0.4),
    "pool": ((0.1, 0.45, 0.6), 0.1, 0.05),
    "planting": ((0.12, 0.32, 0.14), 0.0, 0.9),
    "seat": ((0.8, 0.06, 0.06), 0.0, 0.5),
    "concrete": ((0.62, 0.62, 0.64), 0.0, 0.9),
    "concrete_dark": ((0.45, 0.45, 0.47), 0.0, 0.9),
    "steel": ((0.55, 0.57, 0.6), 0.7, 0.4),
    "roof_membrane": ((0.92, 0.93, 0.95), 0.0, 0.6),
}
MATS = {}


def material(role):
    if role not in MATS:
        c, metal, rough = PALETTE[role]
        MATS[role] = mat(role, c, metal, rough, emit=(1.0, 0.85, 0.6) if role == "window_lit" else None)
    return MATS[role]


class Mesh:
    """Faces gathered with their roles, then one object. UVs are in metres,
    projected per face: u along a wall (or x on a flat face), v up (or y)."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.roles = []

    def face(self, pts, role, smooth=False):
        if role not in self.roles:
            self.roles.append(role)
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.roles.index(role)
        f.smooth = smooth
        return f

    def quad_strip(self, rows, role, closed=False, smooth=False):
        """rows: lists of points of equal length; faces between rows."""
        for r0, r1 in zip(rows, rows[1:]):
            n = len(r0)
            for i in range(n if closed else n - 1):
                j = (i + 1) % n
                self.face((r0[i], r0[j], r1[j], r1[i]), role, smooth)

    def box(self, lo, hi, role, rot=None, about=None, skip=()):
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        p = [Vector((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        if rot is not None:
            c = Vector(about) if about is not None else (Vector(lo) + Vector(hi)) / 2
            p = [c + rot @ (v - c) for v in p]
        faces = {"-x": (0, 1, 3, 2), "+x": (4, 6, 7, 5), "-y": (0, 4, 5, 1), "+y": (2, 3, 7, 6), "-z": (0, 2, 6, 4), "+z": (1, 5, 7, 3)}
        for k, q in faces.items():
            if k not in skip:
                self.face([p[i] for i in q], role)

    def frame_box(self, o, u, n, a, b, c, role):
        """A box in a facade's frame: from o, `a` along u, `b` up, `c` out along n."""
        o, u, n = Vector(o), Vector(u), Vector(n)
        up = Vector((0, 0, 1))
        p = [o + u * x + up * y + n * z for x in (0, a) for y in (0, b) for z in (0, c)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.face([p[i] for i in q], role)

    def prism(self, outline, z0, z1, role, cap_top=True, cap_bottom=False):
        """An outline (x, y) extruded from z0 to z1."""
        n = len(outline)
        lo = [Vector((x, y, z0)) for x, y in outline]
        hi = [Vector((x, y, z1)) for x, y in outline]
        for i in range(n):
            j = (i + 1) % n
            self.face((lo[i], lo[j], hi[j], hi[i]), role)
        if cap_top:
            self.face(hi, role)
        if cap_bottom:
            self.face(list(reversed(lo)), role)

    def lathe(self, profile, centre, role, segs=16, smooth=True, square=False):
        """A body of revolution about the vertical through `centre`: profile
        is (radius, z) from bottom to top. `square` makes it a square plan
        (an imperial roof)."""
        cx, cy = centre
        rows = []
        for r, z in profile:
            row = []
            for i in range(segs):
                a = 2 * math.pi * i / segs + (math.pi / 4 if square else 0)
                if square:
                    c, s = math.cos(a), math.sin(a)
                    k = r / max(abs(c), abs(s))
                    row.append((cx + c * k, cy + s * k, z))
                elif r < 1e-4:
                    row.append((cx, cy, z))
                else:
                    row.append((cx + math.cos(a) * r, cy + math.sin(a) * r, z))
            rows.append(row)
        for r0, r1 in zip(rows, rows[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                pts = [r0[i], r0[j], r1[j], r1[i]]
                uniq = []
                for p in pts:
                    if all((Vector(p) - Vector(q)).length > 1e-5 for q in uniq):
                        uniq.append(p)
                if len(uniq) >= 3:
                    self.face(uniq, role, smooth and not square)

    def arch(self, o, u, n, w, h, role, segs=6, proud=0.06):
        """An arched opening's glass on a facade: a rectangle w by (h - w/2)
        and a half-circle on top, `proud` out from the wall at o (its foot's
        left corner)."""
        o, u, n = Vector(o) + Vector(n) * proud, Vector(u), Vector(n)
        up = Vector((0, 0, 1))
        r = w / 2
        pts = [o, o + u * w, o + u * w + up * (h - r)]
        for k in range(1, segs):
            a = math.pi * k / segs
            pts.append(o + u * (r + r * math.cos(a)) + up * (h - r + r * math.sin(a)))
        pts.append(o + up * (h - r))
        self.face(pts, role)

    def finish(self, extras=None, parent=None):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        for f in self.bm.faces:
            n = f.normal
            if abs(n.z) < 0.6:
                t = Vector((-n.y, n.x, 0)).normalized()
                for loop in f.loops:
                    p = loop.vert.co
                    loop[self.uv].uv = (p.dot(t), p.z)
            else:
                for loop in f.loops:
                    loop[self.uv].uv = (loop.vert.co.x, loop.vert.co.y)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for r in self.roles:
            me.materials.append(material(r))
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        for k, v in (extras or {}).items():
            ob[k] = v
        return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons) if ob.type == "MESH" else 0


def empty(name, loc, parent=None, extras=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    for k, v in (extras or {}).items():
        ob[k] = v
    return ob


# =============================================================================
# The Casino de Monte-Carlo and the Hôtel de Paris
# =============================================================================

X = Vector((1, 0, 0))
Y = Vector((0, 1, 0))


def facade_bays(m, x0, x1, y, z_floor, bays, kind, w, h, role="glass", n=Y, keystone=True):
    """Windows along a wall facing +Y (or -Y) at y: `bays` evenly spaced
    between x0 and x1, from z_floor; arched or square; a sill under each and
    a stone pediment or keystone over it."""
    span = (x1 - x0) / bays
    sgn = 1 if n.y > 0 else -1
    for k in range(bays):
        cx = x0 + span * (k + 0.5)
        left = Vector((cx - sgn * w / 2, y, z_floor))
        u = X * sgn
        if kind == "arch":
            m.arch(left, u, n, w, h, role)
        else:
            m.face([left + n * 0.06, left + u * w + n * 0.06, left + u * w + n * 0.06 + Vector((0, 0, h)), left + n * 0.06 + Vector((0, 0, h))], role)
        # Sill and the stone over the window.
        m.frame_box(left - u * 0.15, u, n, w + 0.3, 0.18, 0.22, "stone_dark")
        if keystone and kind == "arch":
            m.frame_box(left + u * (w / 2 - 0.2) + Vector((0, 0, h - 0.05)), u, n, 0.4, 0.55, 0.18, "stone_dark")
        elif keystone:
            m.frame_box(left - u * 0.25 + Vector((0, 0, h + 0.15)), u, n, w + 0.5, 0.28, 0.25, "stone_dark")


def facade_bays_x(m, y0, y1, x, z_floor, bays, kind, w, h, sgn=1, role="glass"):
    """The same along a wall facing +X (sgn 1) or -X at x."""
    n = X * sgn
    u = Y * -sgn
    span = (y1 - y0) / bays
    for k in range(bays):
        cy = y0 + span * (k + 0.5)
        left = Vector((x, cy + sgn * w / 2, z_floor))
        if kind == "arch":
            m.arch(left, u, n, w, h, role)
        else:
            m.face([left + n * 0.06, left + u * w + n * 0.06, left + u * w + n * 0.06 + Vector((0, 0, h)), left + n * 0.06 + Vector((0, 0, h))], role)
        m.frame_box(left - u * 0.15, u, n, w + 0.3, 0.18, 0.22, "stone_dark")
        if kind != "arch":
            m.frame_box(left - u * 0.25 + Vector((0, 0, h + 0.15)), u, n, w + 0.5, 0.28, 0.25, "stone_dark")


def cornice(m, x0, x1, y0, y1, z, depth=0.6, height=0.7):
    """A projecting cornice round a block's top."""
    m.box((x0 - depth, y0 - depth, z), (x1 + depth, y1 + depth, z + height), "stone_dark")


def balustrade(m, x0, x1, y, z, n=1):
    """A rail of short posts on a parapet along x at y."""
    m.box((x0, y - 0.25, z), (x1, y + 0.25, z + 0.2), "stone")
    k = int((x1 - x0) / 0.9)
    for i in range(k):
        x = x0 + (i + 0.5) * (x1 - x0) / k
        m.box((x - 0.12, y - 0.12, z + 0.2), (x + 0.12, y + 0.12, z + 0.85), "stone")
    m.box((x0, y - 0.28, z + 0.85), (x1, y + 0.28, z + 1.05), "stone")


def mansard(m, x0, x1, y0, y1, z0, z1, inset=1.6, role="roof_slate"):
    """A mansard: the slopes in from the block's edge to a flat top."""
    lo = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)]
    hi = [(x0 + inset, y0 + inset, z1), (x1 - inset, y0 + inset, z1), (x1 - inset, y1 - inset, z1), (x0 + inset, y1 - inset, z1)]
    for i in range(4):
        j = (i + 1) % 4
        m.face((lo[i], lo[j], hi[j], hi[i]), role)
    m.face(hi, role)


def dormers(m, x0, x1, y, z, count, n=1):
    """Dormer windows on a mansard's slope facing +Y (n=1) or -Y."""
    span = (x1 - x0) / count
    for k in range(count):
        cx = x0 + span * (k + 0.5)
        m.box((cx - 0.75, y - 1.1 * n if n < 0 else y - 0.9, z), (cx + 0.75, y + 0.9 if n < 0 else y + 0.2, z + 2.1), "stone")
        m.arch(Vector((cx - 0.45 * n, y + 0.2 * n if n > 0 else y - 1.1, z + 0.4)), X * n, Y * n, 0.9, 1.4, "glass", segs=4, proud=0.03)
        m.box((cx - 0.85, y - 0.9 if n > 0 else y - 1.2, z + 2.1), (cx + 0.85, y + 0.3 if n > 0 else y + 0.9, z + 2.4), "roof_slate")


def imperial_roof(m, cx, cy, half, z0, height, lantern=True):
    """A square bell roof (an imperial dome), its lantern, cupola and finial."""
    prof = []
    for k in range(9):
        t = k / 8
        # Bulging out, then curving in to the lantern's foot.
        r = half * (1.0 + 0.08 * math.sin(math.pi * min(1, t * 2.2))) * (1 - 0.72 * t ** 1.6)
        prof.append((r, z0 + height * t))
    m.lathe(prof, (cx, cy), "roof_slate", segs=4, square=True)
    top = z0 + height
    r0 = prof[-1][0]
    m.face([(cx + dx * r0, cy + dy * r0, top) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))], "roof_slate")
    # Round windows (oeils-de-boeuf) in gold rings on each face.
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        r = half * 1.02
        c = Vector((cx + dx * r * 0.98, cy + dy * r * 0.98, z0 + height * 0.25))
        n = Vector((dx, dy, 0))
        u = Vector((-dy, dx, 0))
        ring = []
        for i in range(10):
            a = 2 * math.pi * i / 10
            ring.append(c + u * math.cos(a) * 0.7 + Vector((0, 0, math.sin(a) * 0.7)) + n * 0.15)
        m.face(ring if n.dot(u.cross(Vector((0, 0, 1)))) < 0 else list(reversed(ring)), "gold")
    if lantern:
        lr = max(r0 * 0.9, 0.9)
        m.lathe([(lr, top), (lr, top + 2.0), (lr * 1.1, top + 2.2), (lr * 1.1, top + 2.4)], (cx, cy), "stone", segs=8, smooth=False)
        for i in range(8):
            a = 2 * math.pi * (i + 0.5) / 8
            n = Vector((math.cos(a), math.sin(a), 0))
            u = Vector((-n.y, n.x, 0))
            o = Vector((cx, cy, top + 0.25)) + n * (lr * 0.93) - u * 0.25
            m.arch(o, u, n, 0.5, 1.5, "glass", segs=3, proud=0.05)
        m.lathe([(lr * 1.05, top + 2.4), (lr * 0.9, top + 3.1), (lr * 0.55, top + 3.7), (0.2, top + 4.0), (0.0, top + 4.05)], (cx, cy), "roof_slate", segs=10)
        m.lathe([(0.22, top + 4.0), (0.3, top + 4.4), (0.12, top + 4.8), (0.05, top + 6.0), (0.0, top + 6.1)], (cx, cy), "gold", segs=6)


def casino_building():
    m = Mesh("casino")
    # --- The block behind the front, its mansards and the atrium's lantern.
    m.box((-22, -38, 0), (22, -2.0, 16.2), "stone", skip=("-z",))
    mansard(m, -22.3, 22.3, -38.3, -1.7, 16.9, 20.0, inset=2.0)
    dormers(m, -21, -7.5, -0.3, 17.2, 3)
    dormers(m, 7.5, 21, -0.3, 17.2, 3)
    # The front wings: pilasters, two floors of windows, cornices, balustrade.
    for x0, x1 in ((-22, -6.5), (6.5, 22)):
        facade_bays(m, x0, x1, -2.0, 1.0, 4, "rect", 1.9, 3.4)
        facade_bays(m, x0, x1, -2.0, 6.6, 4, "arch", 1.9, 4.6)
        facade_bays(m, x0, x1, -2.0, 12.6, 4, "rect", 1.3, 1.6, keystone=False)
        for k in range(5):
            x = x0 + k * (x1 - x0) / 4
            m.box((x - 0.35, -2.0, 0), (x + 0.35, -1.6, 15.6), "stone")
        m.box((x0, -2.0, 5.6), (x1, -1.45, 6.2), "stone_dark")
    cornice(m, -22, 22, -38, -2.0, 15.6, 0.5, 0.6)
    balustrade(m, -22, -6.5, -1.6, 16.2)
    balustrade(m, 6.5, 22, -1.6, 16.2)
    # The central pavilion: the great arched entrance, the window over it, the
    # attic with the clock between its sculpture groups, a crest on top.
    m.box((-6.5, -2.0, 0), (6.5, 2.0, 19.0), "stone", skip=("-z", "-y"))
    for x in (-6.5, -3.4, 3.4, 6.5):
        m.box((x - 0.45, 1.9, 0), (x + 0.45, 2.45, 18.4), "stone_dark")
    m.arch(Vector((-2.4, 2.0, 0.0)), X, Y, 4.8, 7.2, "glass", segs=8)
    m.arch(Vector((-1.9, 2.0, 8.4)), X, Y, 3.8, 6.0, "glass", segs=8)
    m.frame_box(Vector((-2.2, 2.0, 8.2)), X, Y, 4.4, 0.25, 0.4, "stone_dark")
    for x in (-5.4, 4.2):
        m.arch(Vector((x, 2.0, 9.0)), X, Y, 1.2, 3.8, "glass", segs=4)
    cornice(m, -6.5, 6.5, -2.0, 2.0, 18.4, 0.6, 0.6)
    # The attic: a raised block with a curved top round the clock.
    m.box((-4.2, 0.2, 19.0), (4.2, 1.6, 22.4), "stone")
    clock = [(math.cos(2 * math.pi * i / 16) * 1.1, 1.66, 20.7 + math.sin(2 * math.pi * i / 16) * 1.1) for i in range(16)]
    m.face(list(reversed(clock)), "gold")
    face = [(math.cos(2 * math.pi * i / 16) * 0.85, 1.7, 20.7 + math.sin(2 * math.pi * i / 16) * 0.85) for i in range(16)]
    m.face(list(reversed(face)), "stone")
    crest = [(-4.2, 22.4), (4.2, 22.4), (3.4, 23.3), (1.6, 24.0), (0.0, 24.3), (-1.6, 24.0), (-3.4, 23.3)]
    m.face([(x, 1.6, z) for x, z in crest], "stone")
    m.face([(x, 0.2, z) for x, z in reversed(crest)], "stone")
    for (xa, za), (xb, zb) in zip(crest, crest[1:] + crest[:1]):
        m.face([(xa, 0.2, za), (xb, 0.2, zb), (xb, 1.6, zb), (xa, 1.6, za)], "stone")
    # The sculpture groups either side of the clock, gilded figures on plinths.
    for sx in (-1, 1):
        x = sx * 5.2
        m.box((x - 1.0, 0.4, 19.0), (x + 1.0, 1.9, 19.8), "stone_dark")
        for k, (dx, h, r) in enumerate(((-0.35, 1.9, 0.32), (0.35, 1.6, 0.3))):
            prof = [(r * 0.9, 19.8), (r, 19.8 + h * 0.45), (r * 0.7, 19.8 + h * 0.8), (r * 0.55, 19.8 + h * 0.85), (r * 0.6, 19.8 + h), (0.0, 19.8 + h + 0.25)]
            m.lathe(prof, (x + dx, 1.1), "gold", segs=6)
    m.lathe([(0.25, 24.2), (0.35, 24.6), (0.0, 25.6)], (0, 0.9), "gold", segs=6)
    # The canopy (marquise) over the entrance: glass on an iron frame.
    m.box((-5.5, 2.0, 7.4), (5.5, 7.0, 7.6), "glass", rot=Matrix.Rotation(math.radians(-8), 3, "X"), about=(0, 2.0, 7.5))
    m.box((-5.6, 6.6, 6.55), (5.6, 7.2, 7.0), "gold")
    for x in (-5.2, 0, 5.2):
        m.box((x - 0.08, 2.0, 7.0), (x + 0.08, 6.9, 7.25), "gear")
    for x in (-4.6, 4.6):
        m.box((x - 0.1, 6.6, 0), (x + 0.1, 6.8, 6.6), "gear")
    # The atrium's lantern behind the front.
    m.box((-6, -18, 16.2), (6, -6, 21.0), "stone")
    facade_bays(m, -6, 6, -6.0, 17.2, 3, "arch", 1.8, 3.0)
    m.lathe([(8.4, 21.0), (8.0, 22.6), (6.0, 24.6), (3.4, 26.0), (0.0, 26.6)], (0, -12), "roof_slate", segs=4, square=True)
    m.lathe([(0.25, 26.4), (0.35, 26.9), (0.0, 28.4)], (0, -12), "gold", segs=6)
    return m


def casino_tower(name, cx, cy, half, height, roof):
    """A corner pavilion: quoins, a window per face per floor, a cornice and
    balustrade, the imperial roof with its lantern."""
    m = Mesh(name)
    x0, x1, y0, y1 = cx - half, cx + half, cy - half, cy + half
    m.box((x0, y0, 0), (x1, y1, height), "stone", skip=("-z",))
    for x in (x0, x1):
        for y in (y0, y1):
            m.box((x - 0.35, y - 0.35, 0), (x + 0.35, y + 0.35, height - 0.4), "stone")
    m.box((x0 - 0.3, y0 - 0.3, 5.6), (x1 + 0.3, y1 + 0.3, 6.2), "stone_dark")
    m.box((x0 - 0.3, y0 - 0.3, 13.6), (x1 + 0.3, y1 + 0.3, 14.1), "stone_dark")
    facade_bays(m, x0 + 1, x1 - 1, y1, 1.0, 2, "rect", 1.8, 3.4, n=Y)
    facade_bays(m, x0 + 1, x1 - 1, y1, 7.0, 1, "arch", 2.6, 5.4, n=Y)
    facade_bays(m, x0 + 1, x1 - 1, y1, 15.0, 1, "arch", 2.0, 3.4, n=Y)
    for sgn, x in ((1, x1), (-1, x0)):
        facade_bays_x(m, y0 + 1, y1 - 1, x, 7.0, 1, "arch", 2.6, 5.4, sgn)
        facade_bays_x(m, y0 + 1, y1 - 1, x, 15.0, 1, "arch", 2.0, 3.4, sgn)
    cornice(m, x0, x1, y0, y1, height - 0.4, 0.6, 0.7)
    for y in (y0 - 0.1, y1 + 0.1):
        balustrade(m, x0 - 0.2, x1 + 0.2, y, height + 0.3)
    imperial_roof(m, cx, cy, half * 0.92, height + 0.3, roof)
    return m


def hotel_de_paris():
    """The Hôtel de Paris's front onto the square: an arcaded ground floor,
    four floors of windows with iron balconies, a mansard with dormers, and
    the rotunda at the corner by the casino with its dome. Faces +X."""
    m = Mesh("hotel_de_paris")
    x0, x1, y0, y1 = -64.0, -46.0, 0.0, 58.0
    top = 21.5
    m.box((x0, y0, 0), (x1, y1, top), "stone", skip=("-z",))
    # The arcade: arched openings, the piers proud of the wall.
    bays = 16
    facade_bays_x(m, y0 + 6, y1, x1, 0.4, bays - 2, "arch", 2.4, 4.4)
    for sgn_floor, z in enumerate((6.4, 10.2, 13.9)):
        facade_bays_x(m, y0 + 6, y1, x1, z, bays - 2, "rect", 1.3, 2.4)
    facade_bays_x(m, y0 + 6, y1, x1, 17.4, bays - 2, "rect", 1.2, 2.0)
    m.box((x1, y0 + 6, 5.4), (x1 + 0.5, y1, 5.9), "stone_dark")
    # Iron balconies on the first and fourth floors, end to end.
    for z in (6.3, 17.3):
        m.box((x1, y0 + 6.5, z - 0.15), (x1 + 1.1, y1 - 0.5, z), "stone_dark")
        m.box((x1 + 1.0, y0 + 6.5, z), (x1 + 1.1, y1 - 0.5, z + 1.0), "gear")
    cornice(m, x0, x1, y0, y1, top - 0.5, 0.7, 0.7)
    mansard(m, x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2, top + 0.2, top + 5.0, inset=2.2)
    for k in range(bays - 2):
        cy = y0 + 6 + (y1 - y0 - 6) * (k + 0.5) / (bays - 2)
        m.box((x1 - 1.0, cy - 0.7, top + 0.6), (x1 + 0.1, cy + 0.7, top + 2.8), "stone")
        m.arch(Vector((x1 + 0.1, cy + 0.42, top + 0.95)), -Y, X, 0.84, 1.5, "glass", segs=4, proud=0.03)
    # The rotunda on the corner nearest the casino.
    rc = (x1 - 3.0, y0 + 2.5)
    m.lathe([(6.5, 0.0), (6.5, top)], rc, "stone", segs=16, smooth=False)
    m.lathe([(7.1, top - 0.5), (7.1, top + 0.2), (6.6, top + 0.4)], rc, "stone_dark", segs=16, smooth=False)
    for k in range(9):
        a = math.radians(-100 + k * 25)
        n = Vector((math.cos(a), math.sin(a), 0))
        u = Vector((-n.y, n.x, 0))
        o = Vector((rc[0], rc[1], 0)) + n * 6.5 - u * 0.65
        m.arch(o + Vector((0, 0, 0.6)), u, n, 1.6, 4.2, "glass", segs=4)
        for z in (6.4, 10.2, 13.9, 17.4):
            o2 = Vector((rc[0], rc[1], z)) + n * 6.5 - u * 0.6
            m.face([o2 + n * 0.06, o2 + u * 1.2 + n * 0.06, o2 + u * 1.2 + n * 0.06 + Vector((0, 0, 2.2)), o2 + n * 0.06 + Vector((0, 0, 2.2))], "glass")
    m.lathe([(6.6, top + 0.4), (6.4, top + 2.6), (5.2, top + 5.4), (3.4, top + 7.3), (1.2, top + 8.3), (0.0, top + 8.5)], rc, "roof_slate", segs=16)
    m.lathe([(1.0, top + 8.2), (1.0, top + 9.6), (1.2, top + 9.8), (0.0, top + 10.8)], rc, "stone", segs=8, smooth=False)
    m.lathe([(0.15, top + 10.6), (0.2, top + 11.0), (0.0, top + 12.2)], rc, "gold", segs=6)
    return m


def build_casino():
    clear()
    root = empty("casino_square", (0, 0, 0))
    casino = casino_building().finish(parent=root)
    towers = [casino_tower("tower_L", 26.5, -4.5, 4.5, 20.5, 7.0), casino_tower("tower_R", -26.5, -4.5, 4.5, 20.5, 7.0)]
    for t in towers:
        t.finish(parent=casino)
    # The harbour-side pair, taller, seen over the roofs.
    for name, x in (("tower_sea_L", 14.0), ("tower_sea_R", -14.0)):
        casino_tower(name, x, -34.0, 4.0, 26.0, 6.0).finish(parent=casino)
    hotel_de_paris().finish(parent=root)
    return root


# =============================================================================
# Marina Bay Sands
# =============================================================================

TOWER_TOP = 188.0
DECK = 198.0


def mbs_tower(name, x0, x1):
    """One tower: the straight east leg behind, the curved west leg in front
    meeting it about a third of the way up, a glass lobby between their feet."""
    m = Mesh(name)
    # East leg (back): straight up.
    m.box((x0, -30, 0), (x1, -10, TOWER_TOP), "facade", skip=("-z",))
    # West leg (front): its front face curving back as it climbs, its back
    # face meeting the east leg's front at 70 m.
    steps = 24
    front = lambda z: 8 + 36 * (1 - z / TOWER_TOP) ** 1.8
    back = lambda z: -10 + 36 * max(0.0, 1 - z / 70) ** 1.5 if z < 70 else -10.0
    rows = []
    for k in range(steps + 1):
        z = TOWER_TOP * (k / steps) ** 1.15
        rows.append((z, front(z), back(z)))
    for (za, fa, ba), (zb, fb, bb) in zip(rows, rows[1:]):
        m.face([(x0, fa, za), (x1, fa, za), (x1, fb, zb), (x0, fb, zb)], "facade")
        if ba > -10 or bb > -10:
            m.face([(x1, ba, za), (x0, ba, za), (x0, bb, zb), (x1, bb, zb)], "facade")
        for x, flip in ((x0, False), (x1, True)):
            q = [(x, ba, za), (x, fa, za), (x, fb, zb), (x, bb, zb)]
            m.face(list(reversed(q)) if flip else q, "facade")
    m.face([(x0, -30, TOWER_TOP), (x1, -30, TOWER_TOP), (x1, 8, TOWER_TOP), (x0, 8, TOWER_TOP)], "facade")
    # The lobby between the legs' feet: glass, lit.
    m.box((x0 + 1, -10, 0), (x1 - 1, 22, 9), "window_lit", skip=("-z",))
    return m


def skypark():
    """The SkyPark: a ship 340 m long across the three towers, its bow
    cantilevered 67 m past the last; a pool along the front, trees, the
    pavilions, a band of light under its edge."""
    m = Mesh("skypark")
    x0, x1 = -172.0, 170.0
    y0, y1 = -33.0, 11.0
    steps = 28
    rows = []
    for k in range(steps + 1):
        x = x0 + (x1 - x0) * k / steps
        # The bow tapers in plan and rises underneath past the last tower.
        t = max(0.0, (x - 100) / (x1 - 100))
        half = (y1 - y0) / 2 * (1 - 0.72 * t ** 1.6)
        mid = (y0 + y1) / 2
        under = TOWER_TOP - 1.0 + 6.5 * t ** 2
        rows.append((x, mid - half, mid + half, under))
    for (xa, ba, fa, ua), (xb, bb, fb, ub) in zip(rows, rows[1:]):
        m.face([(xa, fa, ua), (xb, fb, ub), (xb, fb, DECK), (xa, fa, DECK)], "skypark")
        m.face([(xb, bb, ub), (xa, ba, ua), (xa, ba, DECK), (xb, bb, DECK)], "skypark")
        m.face([(xa, ba, DECK), (xa, fa, DECK), (xb, fb, DECK), (xb, bb, DECK)], "skypark")
        m.face([(xa, fa, ua), (xa, ba, ua), (xb, bb, ub), (xb, fb, ub)], "skypark")
        # The light band along both sides, under the deck's edge.
        lo, hi = DECK - 2.4, DECK - 1.5
        m.face([(xa, fa + 0.05, lo), (xb, fb + 0.05, lo), (xb, fb + 0.05, hi), (xa, fa + 0.05, hi)], "window_lit")
        m.face([(xb, bb - 0.05, lo), (xa, ba - 0.05, lo), (xa, ba - 0.05, hi), (xb, bb - 0.05, hi)], "window_lit")
    xs, xe = rows[0], rows[-1]
    m.face([(x0, xs[2], xs[3]), (x0, xs[1], xs[3]), (x0, xs[1], DECK), (x0, xs[2], DECK)], "skypark")
    m.face([(x1, xe[1], xe[3]), (x1, xe[2], xe[3]), (x1, xe[2], DECK), (x1, xe[1], DECK)], "skypark")
    # The infinity pool along the front edge, the deck's parapet behind.
    m.box((-160, 2, DECK), (60, 9.2, DECK + 0.25), "pool")
    m.box((-160, 0.8, DECK), (60, 2.0, DECK + 1.1), "skypark")
    # Trees in planters and the pavilions along the back.
    for k in range(18):
        x = -150 + k * 15
        m.box((x - 1.4, -8, DECK), (x + 1.4, -5.2, DECK + 0.8), "skypark")
        m.lathe([(0.0, DECK + 0.8), (2.2, DECK + 2.2), (2.6, DECK + 3.4), (1.6, DECK + 4.6), (0.0, DECK + 5.0)], (x, -6.6), "planting", segs=6)
    for x, w in ((-120, 22), (-40, 30), (40, 24), (110, 14)):
        m.box((x - w / 2, -28, DECK), (x + w / 2, -14, DECK + 3.2), "glass")
        m.box((x - w / 2 - 1.5, -29.5, DECK + 3.2), (x + w / 2 + 1.5, -12.5, DECK + 3.8), "skypark")
    return m


def build_mbs():
    clear()
    root = empty("marina_bay_sands", (0, 0, 0))
    for k, (x0, x1) in enumerate(((-170.0, -128.0), (-54.5, -12.5), (61.0, 103.0))):
        mbs_tower(f"tower_{k + 1}", x0, x1).finish(parent=root)
    skypark().finish(parent=root)
    return root


# =============================================================================
# The covered grandstand
# =============================================================================

ROWS = 10
TREAD = 0.8
RISE = 0.42
PLINTH = 1.8
HALF_LEN = 13.0
FRONT = 5.65
AISLES = (-6.5, 6.5)


def build_grandstand():
    clear()
    root = empty("grandstand", (0, 0, 0))
    m = Mesh("stand")
    first = FRONT - 1.0
    # The raker: a stepped concrete mass, a step per row; the front walkway.
    m.box((-HALF_LEN + 0.3, first, 0), (HALF_LEN - 0.3, FRONT - 0.1, PLINTH), "concrete", skip=("-z",))
    for k in range(ROWS):
        y1 = first - TREAD * k
        z = PLINTH + RISE * (k + 1)
        m.box((-HALF_LEN + 0.3, y1 - TREAD, 0), (HALF_LEN - 0.3, y1, z), "concrete_dark" if k % 2 else "concrete", skip=("-z",))
    back = first - TREAD * ROWS
    top = PLINTH + RISE * (ROWS + 1)
    m.box((-HALF_LEN + 0.3, -FRONT + 0.3, 0), (HALF_LEN - 0.3, back, top), "concrete", skip=("-z",))
    # The back wall up to the roof.
    m.box((-HALF_LEN, -FRONT, 0), (HALF_LEN, -FRONT + 0.3, 8.9), "concrete", skip=("-z",))
    # End walls following the rake.
    for x0, x1 in ((-HALF_LEN, -HALF_LEN + 0.3), (HALF_LEN - 0.3, HALF_LEN)):
        prof = [(FRONT, 0), (FRONT, PLINTH + 1.1), (first, PLINTH + 1.3), (back, top + 1.2), (-FRONT, top + 1.2), (-FRONT, 0)]
        lo = [(x0, y, z) for y, z in prof]
        hi = [(x1, y, z) for y, z in prof]
        m.face(list(reversed(lo)), "concrete")
        m.face(hi, "concrete")
        for i in range(len(prof)):
            j = (i + 1) % len(prof)
            m.face((lo[i], lo[j], hi[j], hi[i]), "concrete")
    # The front rail: glass panels on posts, a steel top rail.
    m.box((-HALF_LEN + 0.3, FRONT - 0.18, PLINTH), (HALF_LEN - 0.3, FRONT - 0.14, PLINTH + 1.0), "glass")
    m.box((-HALF_LEN + 0.3, FRONT - 0.22, PLINTH + 1.0), (HALF_LEN - 0.3, FRONT - 0.1, PLINTH + 1.08), "steel")
    for k in range(14):
        x = -HALF_LEN + 0.5 + k * (2 * HALF_LEN - 1.0) / 13
        m.box((x - 0.04, FRONT - 0.22, PLINTH), (x + 0.04, FRONT - 0.1, PLINTH + 1.0), "steel")
    stand = m.finish(parent=root)

    # Seats: a pan along each row's block, a back for every seat.
    s = Mesh("seats")
    seat_xs = []
    x = -HALF_LEN + 0.6
    while x < HALF_LEN - 0.55:
        if all(abs(x - a) > 0.85 for a in AISLES):
            seat_xs.append(round(x, 3))
        x += 0.5
    blocks = [(-HALF_LEN + 0.35, AISLES[0] - 0.65), (AISLES[0] + 0.65, AISLES[1] - 0.65), (AISLES[1] + 0.65, HALF_LEN - 0.35)]
    for k in range(ROWS):
        yf = first - TREAD * k
        z = PLINTH + RISE * k
        for b0, b1 in blocks:
            s.box((b0, yf - 0.68, z + 0.38), (b1, yf - 0.28, z + 0.45), "seat", skip=("-z",))
        for sx in seat_xs:
            s.box((sx - 0.21, yf - 0.76, z + 0.45), (sx + 0.21, yf - 0.7, z + 0.9), "seat",
                  rot=Matrix.Rotation(math.radians(-10), 3, "X"), about=(sx, yf - 0.73, z + 0.45), skip=("-z",))
        empty(f"row_{k}", (0, yf - 0.12, z), parent=root, extras={"seats": seat_xs})
    s.finish(parent=root)

    # Stairs up each aisle: a step at every half row, and a handrail.
    st = Mesh("stairs")
    for a in AISLES:
        for k in range(ROWS * 2 + 1):
            yf = first - TREAD * k / 2
            z = PLINTH + RISE * k / 2
            st.box((a - 0.6, yf - TREAD / 2, z), (a + 0.6, yf, z + RISE / 2), "concrete")
        st.box((a - 0.03, first - TREAD * ROWS, PLINTH + 0.95), (a + 0.03, first, PLINTH + 1.0), "steel",
               rot=Matrix.Rotation(-math.atan2(RISE, TREAD), 3, "X"), about=(a, first, PLINTH + 1.0))
    st.finish(parent=root)

    # The roof: a membrane cantilevered from columns at the back, its beams
    # tapering to the front edge, a fascia along it.
    r = Mesh("roof")
    roof_back, roof_front = 9.1, 8.55
    yb, yf = -FRONT, FRONT - 0.9
    slope = math.atan2(roof_back - roof_front, yf - yb)
    rot = Matrix.Rotation(-slope, 3, "X")
    r.box((-HALF_LEN, yb, roof_back - 0.25), (HALF_LEN, yb + (yf - yb) / math.cos(slope), roof_back), "roof_membrane", rot=rot, about=(0, yb, roof_back))
    r.box((-HALF_LEN, yf - 0.1, roof_front - 0.65), (HALF_LEN, yf + 0.1, roof_front + 0.05), "steel")
    for k in range(5):
        x = -HALF_LEN + 0.5 + k * (2 * HALF_LEN - 1.0) / 4
        r.box((x - 0.18, -FRONT, 0), (x + 0.18, -FRONT + 0.36, roof_back + 1.1), "steel")
        beam = [(-FRONT, roof_back), (-FRONT, roof_back + 1.1), (yf, roof_front + 0.15), (yf, roof_front)]
        lo = [(x - 0.12, y, z) for y, z in beam]
        hi = [(x + 0.12, y, z) for y, z in beam]
        r.face(list(reversed(lo)), "steel")
        r.face(hi, "steel")
        for i in range(4):
            j = (i + 1) % 4
            r.face((lo[i], lo[j], hi[j], hi[i]), "steel")
    r.finish(parent=root)
    return root


# =============================================================================
# Build, check, export, preview
# =============================================================================

def subtree(root):
    out = [root]
    for c in root.children:
        out += subtree(c)
    return out


def bounds(objs):
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != "MESH":
            continue
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def check(name, root, budget, size_check):
    objs = subtree(root)
    total = sum(tris(o) for o in objs)
    lo, hi = bounds(objs)
    print(f"{name}: {total} triangles, {lo.x:.1f}..{hi.x:.1f} x {lo.y:.1f}..{hi.y:.1f} x {lo.z:.2f}..{hi.z:.1f}")
    if total > budget:
        raise RuntimeError(f"{name} has {total} triangles, over its {budget}")
    if lo.z < -0.01:
        raise RuntimeError(f"{name} goes {-lo.z:.2f} m into the ground")
    size_check(lo, hi)


def export(root, filename):
    if not OUT:
        return
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in subtree(root):
        o.select_set(True)
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_extras=True, export_texcoords=True, export_normals=True, export_animations=False)
    print("exported", path)


def preview(root, tag, shots, night=False):
    if not PREVIEW:
        return
    engines = [i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.02, 0.025, 0.06, 1) if night else (0.45, 0.62, 0.85, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 0.6 if night else 4.0
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(150))
    scene.collection.objects.link(sun)
    lo, hi = bounds(subtree(root))
    size = max((hi - lo).x, (hi - lo).y)
    bpy.ops.mesh.primitive_plane_add(size=size * 6, location=((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0))
    floor = bpy.context.active_object
    floor.data.materials.append(mat("ground", (0.08, 0.1, 0.16) if night else (0.55, 0.53, 0.5)))
    if night:
        for o in MATS.values():
            b = next(n for n in o.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            if o.name == "facade":
                # Rooms lit floor by floor (the game does this in its shader).
                tex = o.node_tree.nodes.new("ShaderNodeTexBrick")
                tex.inputs["Scale"].default_value = 1.0
                tex.inputs["Brick Width"].default_value = 1.8
                tex.inputs["Row Height"].default_value = 3.2
                tex.inputs["Mortar Size"].default_value = 0.5
                tex.inputs["Color1"].default_value = (1.0, 0.75, 0.45, 1)
                tex.inputs["Color2"].default_value = (0.1, 0.12, 0.2, 1)
                tex.inputs["Mortar"].default_value = (0.05, 0.06, 0.08, 1)
                uv = o.node_tree.nodes.new("ShaderNodeTexCoord")
                o.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
                o.node_tree.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
                b.inputs["Emission Strength"].default_value = 1.2
            if o.name in ("window_lit", "pool"):
                b.inputs["Emission Color"].default_value = (0.7, 0.85, 1.0, 1) if o.name == "window_lit" else (0.1, 0.6, 0.9, 1)
                b.inputs["Emission Strength"].default_value = 6.0
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 35
    cam.data.clip_end = 5000
    scene.collection.objects.link(cam)
    scene.camera = cam
    for shot, loc, aim in shots:
        cam.location = loc
        cam.rotation_euler = (Vector(aim) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"{tag}_{shot}.png")
        bpy.ops.render.render(write_still=True)


def casino_size(lo, hi):
    if not (90 < hi.x - lo.x < 110) or hi.z > 42:
        raise RuntimeError(f"the casino square is {hi.x - lo.x:.0f} m across and {hi.z:.0f} m tall")


root = build_casino()
check("casino", root, 40000, casino_size)
export(root, "casino.glb")
preview(root, "casino", [("front", (40, 95, 16), (-8, 0, 14)), ("square", (10, 140, 45), (-15, 10, 10))])


def mbs_size(lo, hi):
    if not (190 < hi.z < 206) or not (330 < hi.x - lo.x < 355):
        raise RuntimeError(f"Marina Bay Sands is {hi.z:.0f} m tall and {hi.x - lo.x:.0f} m long")


root = build_mbs()
check("marina_bay_sands", root, 40000, mbs_size)
export(root, "marina_bay_sands.glb")
preview(root, "mbs", [("bay", (-60, 620, 70), (0, 0, 100)), ("angle", (380, 420, 120), (0, 0, 110))], night=True)


def stand_size(lo, hi):
    if hi.x - lo.x > 26.01 or hi.y - lo.y > 11.34 or hi.z > 10.5:
        raise RuntimeError(f"the grandstand is {hi.x - lo.x:.2f} x {hi.y - lo.y:.2f} x {hi.z:.2f} m, over its footprint")


root = build_grandstand()
check("grandstand", root, 12000, stand_size)
export(root, "grandstand.glb")
preview(root, "grandstand", [("front", (14, 24, 6), (0, 0, 4)), ("side", (30, 6, 5), (0, 0, 4))])
