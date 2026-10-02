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
    "led": ((0.85, 0.9, 0.95), 0.6, 0.3),
    "white_steel": ((0.9, 0.91, 0.92), 0.5, 0.35),
    "render": ((0.9, 0.89, 0.86), 0.0, 0.85),
    "asphalt_old": ((0.3, 0.3, 0.3), 0.0, 0.95),
    "paint_red": ((0.75, 0.08, 0.06), 0.1, 0.4),
    "paint_yellow": ((0.95, 0.75, 0.1), 0.1, 0.4),
    "paint_blue": ((0.1, 0.3, 0.75), 0.1, 0.4),
    "paint_green": ((0.15, 0.6, 0.3), 0.1, 0.4),
    "sail_shade": ((0.97, 0.97, 0.96), 0.0, 0.5),
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
    steps = 40
    rows = []
    for k in range(steps + 1):
        # Closer together toward the prow, where it curves.
        x = x0 + (x1 - x0) * math.sin(k / steps * math.pi / 2) ** 0.8
        # The prow: past the last tower the deck narrows in a curve to a
        # rounded point, its underside sweeping up to the tip.
        t = max(0.0, (x - 100) / (x1 - 100))
        half = max(0.9, (y1 - y0) / 2 * max(0.0, 1 - t ** 1.5) ** 0.7)
        mid = (y0 + y1) / 2
        under = TOWER_TOP - 1.0 + 8.0 * t ** 1.7
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
SEAT_PITCH = 0.55
# A row's feet, ahead of its step's edge (a seated fan's knees come over it).
ROW_FEET = 0.12


def build_grandstand(covered=True):
    """The covered stand, or (covered=False) the open terrace: the same
    stepped rows with long benches in place of seats, no roof, a low back
    wall."""
    clear()
    root = empty("grandstand" if covered else "grandstand_open", (0, 0, 0))
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
    # The back wall up to the roof (the terrace's: a parapet).
    m.box((-HALF_LEN, -FRONT, 0), (HALF_LEN, -FRONT + 0.3, 8.9 if covered else top + 1.1), "concrete", skip=("-z",))
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

    # Seats: a pan along each row's step, a back for every seat. Each step
    # rises a seat's height (RISE) over the tread in front of it, where the
    # row's feet are: a seated fan's hip over the pan, the knees over the
    # step's edge, the feet on the tread below. A seat every 0.55 m, as wide
    # as a person's shoulders with room to wave.
    s = Mesh("seats")
    seat_xs = []
    x = -HALF_LEN + 0.6
    while x < HALF_LEN - 0.55:
        if all(abs(x - a) > 0.85 for a in AISLES):
            seat_xs.append(round(x, 3))
        x += SEAT_PITCH
    blocks = [(-HALF_LEN + 0.35, AISLES[0] - 0.65), (AISLES[0] + 0.65, AISLES[1] - 0.65), (AISLES[1] + 0.65, HALF_LEN - 0.35)]
    for k in range(ROWS):
        yf = first - TREAD * k
        z = PLINTH + RISE * k
        for b0, b1 in blocks:
            if covered:
                s.box((b0, yf - 0.52, z + 0.42), (b1, yf - 0.1, z + 0.46), "seat", skip=("-z",))
            else:
                # A long bench on its legs, the seat's height above the tread.
                s.box((b0, yf - 0.5, z + 0.4), (b1, yf - 0.12, z + 0.46), "seat")
                for lx in (b0 + 0.3, (b0 + b1) / 2, b1 - 0.3):
                    s.box((lx - 0.05, yf - 0.42, z), (lx + 0.05, yf - 0.2, z + 0.4), "steel")
        for sx in (seat_xs if covered else []):
            s.box((sx - 0.23, yf - 0.6, z + 0.46), (sx + 0.23, yf - 0.54, z + 0.91), "seat",
                  rot=Matrix.Rotation(math.radians(-10), 3, "X"), about=(sx, yf - 0.57, z + 0.46), skip=("-z",))
        # Where the row's feet stand: on the tread in front of the step.
        empty(f"row_{k}", (0, yf + ROW_FEET, z), parent=root, extras={"seats": seat_xs})
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

    if not covered:
        return root
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
# Shared pieces for the steel structures
# =============================================================================

def tube(m, a, b, r, role, sides=6):
    """A round bar from a to b."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(side).normalized()
    v = d.cross(u)
    ra = [a + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r for k in range(sides)]
    rb = [p + (b - a) for p in ra]
    for k in range(sides):
        j = (k + 1) % sides
        m.face((ra[k], ra[j], rb[j], rb[k]), role)


def ring(m, centre, radius, y, r, role, segs=56, sides=5):
    """A circle of tube in the XZ plane (a wheel's rim), at depth y."""
    cx, cz = centre
    pts = [(cx + radius * math.cos(2 * math.pi * k / segs), y, cz + radius * math.sin(2 * math.pi * k / segs)) for k in range(segs)]
    for k in range(segs):
        tube(m, pts[k], pts[(k + 1) % segs], r, role, sides)
    return pts


# =============================================================================
# The Singapore Flyer
# =============================================================================

FLYER_R = 75.0
FLYER_HUB = 90.0


def build_flyer():
    """165 m: a 150 m wheel (a triangular truss rim, cable spokes, 28
    capsules outside the rim) on its spindle, held by two pairs of raked
    legs, over a three-storey terminal with a curved glass roof. The wheel
    turns in the XZ plane (its face toward +Y, the circuit)."""
    clear()
    root = empty("singapore_flyer", (0, 0, 0))
    w = Mesh("wheel")
    hub = (0.0, FLYER_HUB)
    outer_a = ring(w, hub, FLYER_R, 2.2, 0.55, "led")
    outer_b = ring(w, hub, FLYER_R, -2.2, 0.55, "led")
    inner = ring(w, hub, FLYER_R - 3.2, 0.0, 0.5, "white_steel")
    # The truss: each node of the inner ring braced to both outer rings.
    for k in range(len(inner)):
        j = (k + 1) % len(inner)
        tube(w, inner[k], outer_a[k], 0.22, "white_steel", 4)
        tube(w, inner[k], outer_b[j], 0.22, "white_steel", 4)
    # Cable spokes from the spindle's two ends to the inner ring.
    for k in range(0, len(inner), 2):
        for y in (9.0, -9.0):
            tube(w, (0.0, y, FLYER_HUB), inner[k], 0.12, "steel", 3)
    # The spindle and its hub.
    tube(w, (0.0, -14.0, FLYER_HUB), (0.0, 14.0, FLYER_HUB), 2.2, "white_steel", 12)
    w.lathe([(0.0, FLYER_HUB - 4.0), (4.5, FLYER_HUB - 3.0), (4.5, FLYER_HUB + 3.0), (0.0, FLYER_HUB + 4.0)], (0.0, 0.0), "steel", segs=12)
    w.finish(parent=root)
    # The capsules: 28 glass pods outside the rim, each a stretched octagon
    # along the axle, its ends steel.
    c = Mesh("capsules")
    count = 28
    for k in range(count):
        a = 2 * math.pi * k / count
        cx, cz = math.cos(a) * (FLYER_R + 3.4), FLYER_HUB + math.sin(a) * (FLYER_R + 3.4)
        ring8 = [(cx + 2.0 * math.cos(2 * math.pi * s / 8), cz + 2.0 * math.sin(2 * math.pi * s / 8)) for s in range(8)]
        for s in range(8):
            t = (s + 1) % 8
            (ax, az), (bx, bz) = ring8[s], ring8[t]
            c.face(((ax, -6.2, az), (bx, -6.2, bz), (bx, 6.2, bz), (ax, 6.2, az)), "window_lit")
        for y, flip in ((-6.2, True), (6.2, False)):
            pts = [(x, y, z) for x, z in ring8]
            c.face(list(reversed(pts)) if flip else pts, "steel")
        # The arm that holds it to the rim.
        tube(c, (cx * 0.955, 0.0, FLYER_HUB + (cz - FLYER_HUB) * 0.955), (math.cos(a) * (FLYER_R + 0.2), 0.0, FLYER_HUB + math.sin(a) * (FLYER_R + 0.2)), 0.35, "white_steel", 4)
    c.finish(parent=root, extras={"count": count})
    # The legs: two pairs, raked, from the spindle's ends to the terminal's roof.
    lg = Mesh("legs")
    for y in (13.0, -13.0):
        for x in (-30.0, 30.0):
            tube(lg, (0.0, y, FLYER_HUB), (x, y * 1.6, 12.0), 1.6, "white_steel", 8)
        tube(lg, (-30.0, y * 1.6, 12.0), (30.0, y * 1.6, 12.0), 0.9, "white_steel", 6)
        for x in (-12.0, 12.0):
            tube(lg, (x * 0.62, y * 1.25, 52.0), (x * 1.6, y * 1.45, 30.0), 0.5, "white_steel", 4)
    lg.finish(parent=root)
    # The terminal: three storeys under a curved glass roof.
    t = Mesh("terminal")
    t.box((-60.0, -26.0, 0.0), (60.0, 26.0, 12.0), "concrete")
    for z in (3.6, 7.6):
        t.box((-60.2, 26.0, z), (60.2, 26.2, z + 2.8), "glass")
        t.box((-60.2, -26.2, z), (60.2, -26.0, z + 2.8), "glass")
    vault = []
    for k in range(13):
        a = math.pi * k / 12
        vault.append((-26.0 * math.cos(a), 12.0 + 7.0 * math.sin(a)))
    for k in range(12):
        (y0, z0), (y1, z1) = vault[k], vault[k + 1]
        t.face(((-58.0, y0, z0), (58.0, y0, z0), (58.0, y1, z1), (-58.0, y1, z1)), "glass")
    for x in (-58.0, 58.0):
        t.face([(x, y, z) for y, z in vault], "glass")
    for k in range(-5, 6):
        x = k * 11.0
        for a, b in zip(vault, vault[1:]):
            tube(t, (x, a[0], a[1]), (x, b[0], b[1]), 0.25, "white_steel", 3)
    t.finish(parent=root)
    return root


# =============================================================================
# The Suzuka Ferris wheel
# =============================================================================

def build_suzuka_wheel():
    """The amusement park's wheel: 50 m across, its hub at 29 m, 32
    gondolas in four colours hanging under the rim, A-frame legs either
    side on a concrete base."""
    clear()
    root = empty("suzuka_wheel", (0, 0, 0))
    R, H = 25.0, 29.0
    w = Mesh("wheel")
    a = ring(w, (0.0, H), R, 1.6, 0.3, "white_steel", segs=32, sides=4)
    b = ring(w, (0.0, H), R, -1.6, 0.3, "white_steel", segs=32, sides=4)
    ring(w, (0.0, H), R * 0.55, 1.6, 0.2, "white_steel", segs=24, sides=4)
    ring(w, (0.0, H), R * 0.55, -1.6, 0.2, "white_steel", segs=24, sides=4)
    for k in range(32):
        tube(w, a[k], b[k], 0.18, "white_steel", 4)
        tube(w, (0.0, 1.6, H), a[k], 0.12, "white_steel", 3)
        tube(w, (0.0, -1.6, H), b[k], 0.12, "white_steel", 3)
    tube(w, (0.0, -4.0, H), (0.0, 4.0, H), 1.1, "steel", 10)
    w.finish(parent=root)
    g = Mesh("gondolas")
    colours = ["paint_red", "paint_yellow", "paint_blue", "paint_green"]
    for k in range(32):
        ang = 2 * math.pi * k / 32
        px, pz = math.cos(ang) * R, H + math.sin(ang) * R
        role = colours[k % 4]
        # Hanging under its pivot: a cabin with windows and a roof.
        g.box((px - 1.1, -1.1, pz - 3.2), (px + 1.1, 1.1, pz - 1.0), role)
        g.box((px - 1.15, -1.15, pz - 2.6), (px + 1.15, 1.15, pz - 1.5), "glass")
        g.box((px - 1.3, -1.3, pz - 1.0), (px + 1.3, 1.3, pz - 0.7), "white_steel")
        tube(g, (px, 0.0, pz), (px, 0.0, pz - 0.7), 0.08, "steel", 3)
    g.finish(parent=root, extras={"count": 32})
    lg = Mesh("legs")
    for y in (4.0, -4.0):
        for x in (-15.0, 15.0):
            tube(lg, (0.0, y, H), (x, y * 1.8, 1.0), 0.75, "white_steel", 6)
        tube(lg, (-8.0, y * 1.4, 14.0), (8.0, y * 1.4, 14.0), 0.4, "white_steel", 4)
    lg.box((-20.0, -10.0, 0.0), (20.0, 10.0, 1.0), "concrete")
    lg.box((-4.0, 6.0, 0.0), (4.0, 12.0, 3.2), "paint_red")
    lg.finish(parent=root)
    return root


# =============================================================================
# The Monza banking
# =============================================================================

def build_monza_banking():
    """A 40-degree stretch of the old banked curve (the sopraelevata): its
    concrete deck 12 m wide, rising steeply from the inner edge to the outer
    lip 9 m up, on rows of columns and arches, a rail along the top. Built
    round a centre 320 m in front of it (+Y), so its deck faces that way."""
    clear()
    root = empty("monza_banking", (0, 0, 0))
    R0, W, LIP = 320.0, 12.0, 9.0
    span = math.radians(40)
    steps = 36
    across = 8

    def at(a, s, dz=0.0):
        r = R0 + W * s
        z = max(0.0, 0.4 + LIP * s ** 2.2 + dz)
        # The centre of the curve in front (+Y): its deck faces the circuit,
        # rising away from it to the lip.
        return (r * math.sin(a), R0 + W / 2 - r * math.cos(a), z)

    deck = Mesh("deck")
    rows_top = []
    rows_under = []
    for i in range(steps + 1):
        a = -span / 2 + span * i / steps
        rows_top.append([at(a, k / across) for k in range(across + 1)])
        rows_under.append([at(a, k / across, -0.7) for k in range(across + 1)])
    for i in range(steps):
        for k in range(across):
            # Weathered slabs, cast a few metres at a time: every fourth a shade darker.
            role = "concrete_dark" if i % 4 == 0 else "asphalt_old" if k == 0 else "concrete"
            deck.face((rows_top[i][k], rows_top[i + 1][k], rows_top[i + 1][k + 1], rows_top[i][k + 1]), role)
            deck.face((rows_under[i][k + 1], rows_under[i + 1][k + 1], rows_under[i + 1][k], rows_under[i][k]), "concrete")
        # The edges: the inner kerb and the outer lip's face.
        deck.face((rows_top[i][0], rows_under[i][0], rows_under[i + 1][0], rows_top[i + 1][0]), "concrete")
        deck.face((rows_top[i + 1][-1], rows_under[i + 1][-1], rows_under[i][-1], rows_top[i][-1]), "concrete")
    for i, flip in ((0, False), (steps, True)):
        ring_ = rows_top[i] + list(reversed(rows_under[i]))
        deck.face(list(reversed(ring_)) if flip else ring_, "concrete")
    deck.finish(parent=root)
    # Columns under the deck: a row at the outer lip and one halfway, each
    # pair joined by an arch; the outer face's ribs.
    cols = Mesh("columns")
    for i in range(0, steps + 1, 2):
        a = -span / 2 + span * i / steps
        for s in (0.5, 0.78, 1.0):
            x, y, z = at(a, s, -0.7)
            if z < 1.2:
                continue
            cols.box((x - 0.45, y - 0.45, 0.0), (x + 0.45, y + 0.45, z), "concrete")
        if i + 2 <= steps:
            b = -span / 2 + span * (i + 2) / steps
            (x0, y0, z0), (x1, y1, z1) = at(a, 1.0, -0.7), at(b, 1.0, -0.7)
            for k in range(6):
                f0, f1 = k / 6, (k + 1) / 6
                h0 = z0 - 1.6 * math.sin(math.pi * f0)
                h1 = z0 - 1.6 * math.sin(math.pi * f1)
                p0 = (x0 + (x1 - x0) * f0, y0 + (y1 - y0) * f0)
                p1 = (x0 + (x1 - x0) * f1, y0 + (y1 - y0) * f1)
                cols.face(((p0[0], p0[1], h0), (p1[0], p1[1], h1), (p1[0], p1[1], z0), (p0[0], p0[1], z0)), "concrete_dark")
    cols.finish(parent=root)
    rail = Mesh("rail")
    for i in range(steps):
        a = -span / 2 + span * i / steps
        b = -span / 2 + span * (i + 1) / steps
        p, q = at(a, 1.0, 0.0), at(b, 1.0, 0.0)
        for h in (0.6, 1.1):
            tube(rail, (p[0], p[1], p[2] + h), (q[0], q[1], q[2] + h), 0.06, "steel", 4)
        tube(rail, p, (p[0], p[1], p[2] + 1.15), 0.06, "steel", 4)
    rail.finish(parent=root)
    return root


# =============================================================================
# Spa: the old pits at the foot of Eau Rouge
# =============================================================================

def build_spa_pits():
    """The old pit building: long and low, painted white, its garages'
    doors along the ground floor, a strip of windows above, a terrace on the
    roof behind a rail, and the old timing tower at one end."""
    clear()
    root = empty("spa_pits", (0, 0, 0))
    m = Mesh("spa_pits")
    L, D = 110.0, 12.0
    m.box((-L / 2, -D / 2, 0.0), (L / 2, D / 2, 7.2), "render")
    for k in range(18):
        x = -L / 2 + 3.0 + k * (L - 6.0) / 18
        m.box((x, D / 2, 0.0), (x + 4.4, D / 2 + 0.08, 3.4), "gear")
        m.box((x, D / 2, 4.2), (x + 4.4, D / 2 + 0.08, 6.0), "glass")
    m.box((-L / 2 - 0.2, D / 2 - 0.2, 3.6), (L / 2 + 0.2, D / 2 + 0.9, 3.9), "render")
    m.box((-L / 2, -D / 2, 7.2), (L / 2, D / 2, 7.6), "concrete")
    for k in range(56):
        x = -L / 2 + 1.0 + k * (L - 2.0) / 55
        tube(m, (x, D / 2 - 0.2, 7.6), (x, D / 2 - 0.2, 8.6), 0.04, "steel", 3)
    tube(m, (-L / 2 + 1.0, D / 2 - 0.2, 8.6), (L / 2 - 1.0, D / 2 - 0.2, 8.6), 0.05, "steel", 4)
    # The timing tower at the end nearest the hill.
    tx = L / 2 - 6.0
    m.box((tx - 5.0, -5.0, 7.6), (tx + 5.0, 5.0, 13.0), "render")
    m.box((tx - 5.2, -5.2, 10.0), (tx + 5.2, 5.2, 12.6), "glass")
    m.box((tx - 6.0, -6.0, 13.0), (tx + 6.0, 6.0, 13.5), "concrete")
    # Its stairs up the side.
    for k in range(12):
        m.box((-L / 2 - 2.2, -D / 2 + 1 + k * 0.8, k * 0.6), (-L / 2, -D / 2 + 1.8 + k * 0.8, k * 0.6 + 0.6), "concrete")
    m.finish(parent=root)
    return root


# =============================================================================
# Silverstone: the Wing
# =============================================================================

def build_silverstone_wing():
    """The Wing: a long glass building, three floors over a recessed ground
    floor, under a roof shaped like an aerofoil, its nose cantilevered out
    over the front (+Y); the roof rises toward the middle of its length."""
    clear()
    root = empty("silverstone_wing", (0, 0, 0))
    L, D = 250.0, 30.0
    b = Mesh("building")
    b.box((-L / 2, -D / 2, 0.0), (L / 2, D / 2 - 4.0, 5.0), "concrete_dark")
    for z0 in (5.0, 9.4, 13.8):
        b.box((-L / 2, -D / 2, z0), (L / 2, D / 2, z0 + 0.6), "white_steel")
        b.box((-L / 2 + 0.2, -D / 2 + 0.2, z0 + 0.6), (L / 2 - 0.2, D / 2 - 0.2, z0 + 4.4), "glass")
    # Vertical fins down the glass front.
    for k in range(int(L / 5)):
        x = -L / 2 + 2.5 + k * 5.0
        b.box((x - 0.15, D / 2 - 0.1, 5.0), (x + 0.15, D / 2 + 0.9, 18.2), "white_steel")
    for k in range(int(L / 12)):
        x = -L / 2 + 6 + k * 12.0
        b.box((x - 0.5, D / 2 - 2.5, 0.0), (x + 0.5, D / 2 - 1.5, 5.0), "white_steel")
    b.finish(parent=root)
    r = Mesh("roof")
    steps = 24
    chord = 46.0
    # The aerofoil's section, nose (+Y) to tail: (fraction of chord, upper, lower).
    sec = [(0.0, 0.0, 0.0), (0.04, 1.3, -0.6), (0.12, 2.3, -0.8), (0.3, 2.9, -0.7), (0.55, 2.4, -0.4), (0.8, 1.3, -0.15), (1.0, 0.0, 0.0)]
    rows = []
    for i in range(steps + 1):
        x = -L / 2 - 4.0 + (L + 8.0) * i / steps
        lift = 3.5 * math.sin(math.pi * i / steps)
        base = 19.0 + lift
        nose = D / 2 + 12.0
        up = [(x, nose - f * chord, base + u) for f, u, _ in sec]
        lo = [(x, nose - f * chord, base + l) for f, _, l in reversed(sec[1:-1])]
        rows.append(up + lo)
    n = len(rows[0])
    for i in range(steps):
        for k in range(n):
            j = (k + 1) % n
            r.face((rows[i][k], rows[i + 1][k], rows[i + 1][j], rows[i][j]), "white_steel" if k < len(sec) else "roof_membrane")
    r.face(rows[0], "white_steel")
    r.face(list(reversed(rows[-1])), "white_steel")
    # Struts from the top floor up to the roof's underside.
    for i in range(1, steps, 2):
        x = -L / 2 - 4.0 + (L + 8.0) * i / steps
        lift = 3.5 * math.sin(math.pi * i / steps)
        for y in (D / 2 - 2.0, -D / 2 + 6.0):
            tube(r, (x, y, 18.2), (x, y + 1.0, 19.0 + lift - 0.6), 0.35, "white_steel", 6)
    r.finish(parent=root)
    return root


# =============================================================================
# Bahrain: the Sakhir tower
# =============================================================================

def build_sakhir_tower():
    """The VIP tower: a slim core rising from a podium to seven stacked
    floors at the top, each wider and turned a little from the one below,
    glazed all round, crowned with white sail-like shades."""
    clear()
    root = empty("sakhir_tower", (0, 0, 0))
    m = Mesh("sakhir_tower")
    m.box((-16.0, -12.0, 0.0), (16.0, 12.0, 6.0), "stone")
    m.box((-16.2, 11.8, 1.0), (16.2, 12.2, 5.0), "glass")
    m.box((-4.5, -4.5, 6.0), (4.5, 4.5, 28.0), "stone")
    for k in range(5):
        m.box((-4.7, 4.4, 8.0 + k * 4.8), (-1.5, 4.7, 11.0 + k * 4.8), "glass")
    z = 28.0
    for k in range(7):
        a = math.radians(4.0 * k - 12.0)
        rot = Matrix.Rotation(a, 3, "Z")
        half = 10.0 + k * 1.2
        m.box((-half, -half * 0.8, z), (half, half * 0.8, z + 0.6), "stone", rot=rot, about=(0, 0, z))
        m.box((-half + 0.4, -half * 0.8 + 0.4, z + 0.6), (half - 0.4, half * 0.8 - 0.4, z + 3.0), "glass", rot=rot, about=(0, 0, z))
        z += 3.0
    m.box((-19.0, -15.0, z), (19.0, 15.0, z + 0.8), "stone")
    # The sails: tall curved shades round the crown.
    for k in range(8):
        a = 2 * math.pi * k / 8
        cx, cy = math.cos(a) * 15.0, math.sin(a) * 12.0
        pts = []
        for s in range(6):
            f = s / 5
            pts.append((cx * (1 - 0.35 * f), cy * (1 - 0.35 * f), z + 0.8 + 10.0 * f))
        for s in range(5):
            (x0, y0, z0), (x1, y1, z1) = pts[s], pts[s + 1]
            tx, ty = -math.sin(a) * 2.6 * (1 - s / 6), math.cos(a) * 2.6 * (1 - s / 6)
            ux, uy = -math.sin(a) * 2.6 * (1 - (s + 1) / 6), math.cos(a) * 2.6 * (1 - (s + 1) / 6)
            m.face(((x0 - tx, y0 - ty, z0), (x0 + tx, y0 + ty, z0), (x1 + ux, y1 + uy, z1), (x1 - ux, y1 - uy, z1)), "sail_shade")
            m.face(((x1 - ux, y1 - uy, z1), (x1 + ux, y1 + uy, z1), (x0 + tx, y0 + ty, z0), (x0 - tx, y0 - ty, z0)), "sail_shade")
    m.finish(parent=root)
    return root


# =============================================================================
# São Paulo: two towers for the skyline
# =============================================================================

def build_sp_towers():
    """An art deco tower stepping up to its spire (161 m), and a modernist
    slab of rounded-triangle plan (165 m): the windows are the facade
    shader's (the UVs in metres), stone at the setbacks."""
    clear()
    root = empty("sp_towers", (0, 0, 0))
    a = Mesh("altino")
    tiers = [(20.0, 15.0, 0.0, 62.0), (15.0, 12.0, 62.0, 104.0), (10.0, 8.0, 104.0, 132.0), (6.0, 5.0, 132.0, 146.0)]
    for hx, hy, z0, z1 in tiers:
        a.box((-hx, -hy, z0), (hx, hy, z1), "facade")
        a.box((-hx - 0.4, -hy - 0.4, z1 - 1.2), (hx + 0.4, hy + 0.4, z1), "stone")
        # Pilasters up the faces.
        for k in range(-3, 4):
            x = hx * k / 3.5
            a.box((x - 0.35, hy, z0), (x + 0.35, hy + 0.45, z1), "stone")
            a.box((x - 0.35, -hy - 0.45, z0), (x + 0.35, -hy, z1), "stone")
    a.lathe([(3.0, 146.0), (2.0, 152.0), (0.6, 158.0), (0.0, 161.0)], (0.0, 0.0), "stone", segs=8)
    a.finish(parent=root)
    it = Mesh("italia")
    plan = []
    for k in range(24):
        ang = 2 * math.pi * k / 24
        r = 26.0 * (1.0 + 0.12 * math.cos(3 * ang))
        plan.append((r * math.cos(ang) + 90.0, r * math.sin(ang)))
    it.prism(plan, 0.0, 160.0, "facade", cap_top=False)
    it.prism([(x + (x - 90.0) * 0.04, y * 1.04) for x, y in plan], 160.0, 165.0, "stone")
    it.finish(parent=root)
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


def export(root, filename, uvs=True):
    """`uvs=False` leaves the UVs out: only the facade shader reads them, and
    a model without one downloads a quarter lighter."""
    if not OUT:
        return
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in subtree(root):
        o.select_set(True)
        if not uvs and o.type == "MESH":
            if any(m and m.name == "facade" for m in o.data.materials):
                raise RuntimeError(f"{o.name} has a facade, which needs its UVs")
            while o.data.uv_layers:
                o.data.uv_layers.remove(o.data.uv_layers[0])
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
export(root, "casino.glb", uvs=False)
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
export(root, "grandstand.glb", uvs=False)
preview(root, "grandstand", [("front", (14, 24, 6), (0, 0, 4)), ("side", (30, 6, 5), (0, 0, 4))])


root = build_grandstand(covered=False)
check("grandstand_open", root, 12000, stand_size)
export(root, "grandstand_open.glb", uvs=False)
preview(root, "grandstand_open", [("front", (14, 24, 6), (0, 0, 3))])


def tall(lo_h, hi_h):
    def size_check(lo, hi):
        if not (lo_h < hi.z < hi_h):
            raise RuntimeError(f"the model's top is at {hi.z:.1f} m, not {lo_h}..{hi_h}")
    return size_check


for build, name, budget, size_check, shots, night, uvs in (
    (build_flyer, "singapore_flyer", 40000, tall(160, 172), [("front", (60, 330, 70), (0, 0, 85))], True, False),
    (build_suzuka_wheel, "suzuka_wheel", 40000, tall(46, 60), [("front", (30, 90, 20), (0, 0, 26))], False, False),
    (build_monza_banking, "monza_banking", 40000, tall(7, 12), [("front", (30, 45, 6), (-20, 0, 4)), ("under", (0, -40, 4), (0, 2, 5))], False, False),
    (build_spa_pits, "spa_pits", 40000, tall(10, 20), [("front", (40, 70, 12), (0, 0, 5))], False, False),
    (build_silverstone_wing, "silverstone_wing", 40000, tall(18, 32), [("front", (110, 140, 25), (0, 0, 14))], False, False),
    (build_sakhir_tower, "sakhir_tower", 40000, tall(45, 65), [("front", (45, 75, 30), (0, 0, 35))], False, False),
    (build_sp_towers, "sp_towers", 40000, tall(150, 170), [("front", (60, 320, 70), (45, 0, 80))], False, True),
):
    root = build()
    check(name, root, budget, size_check)
    export(root, f"{name}.glb", uvs=uvs)
    preview(root, name, shots, night=night)
