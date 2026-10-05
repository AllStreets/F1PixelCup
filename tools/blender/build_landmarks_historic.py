"""Build the landmarks of the historic circuits (the Legends and Golden Era
cups), and export them to assets/landmarks/*.glb
(docs/superpowers/specs/2026-10-05-historic-landmarks-design.md).

Run headless, so it never touches an open Blender session:

  F1_LANDMARKS_OUT=assets/landmarks Blender -b --factory-startup -P tools/blender/build_landmarks_historic.py

Set F1_LANDMARKS_PREVIEW=<dir> to also render each model there for review,
and F1_LANDMARKS_ONLY=name,name to build only some.

Then compress what was built, as every trackside model is:

  node tools/compress-models.mjs assets/landmarks/<name>.glb ...

Real metres, the ground at z = 0, the front toward +Y (the side that faces
the circuit; glTF's -z). No logos, no trademarks, no text: the shapes are
from public photographs, used only as reference. The mesh kit is the one of
build_landmarks_2025.py, copied so the scripts stay independent.

  motodrom.glb             Hockenheim: the Motodrom's great stand, three tiers, its roof
  nurburg_castle.glb       the ruined Nurburg on its wooded hill
  estoril_grandstand.glb   Estoril's main grandstand under its long flat roof
  sintra_hills.glb         the Serra de Sintra's forested ridge, the Pena Palace on top
  joburg_skyline.glb       Johannesburg: the Hillbrow Tower, Ponte City, the Carlton Centre
  sepang_grandstand.glb    Sepang's double-fronted grandstand under its palm-leaf canopies
  istanbul_grandstand.glb  Istanbul Park's main grandstand, its roof hung from masts
  tuscan_hill.glb          Mugello: a hill terraced with olive groves, a farmhouse, cypresses
  finger_lakes.glb         Watkins Glen: a long lake between wooded hills in autumn
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

OUT = os.environ.get("F1_LANDMARKS_OUT", "")
PREVIEW = os.environ.get("F1_LANDMARKS_PREVIEW", "")
ONLY = [s for s in os.environ.get("F1_LANDMARKS_ONLY", "").split(",") if s]

if (bpy.data.filepath or bpy.data.is_dirty) and os.environ.get("F1_BUILD_FORCE") != "1":
    raise RuntimeError("build_landmarks_historic.py clears the scene, and this one has work in it. Use a new file, or set F1_BUILD_FORCE=1.")
scene = bpy.context.scene


# =============================================================================
# The mesh kit (as build_landmarks_2025.py's)
# =============================================================================

def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for block in list(coll):
            coll.remove(block)
    MATS.clear()


def mat(name, color, metal=0.0, rough=0.7, emit=None, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 2.0
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
    m.diffuse_color = (*color, 1)
    return m


PALETTE = {
    "stone": ((0.86, 0.76, 0.58), 0.0, 0.8),
    "stone_dark": ((0.74, 0.63, 0.46), 0.0, 0.8),
    "glass": ((0.06, 0.09, 0.12), 0.3, 0.12),
    "gold": ((0.85, 0.62, 0.22), 1.0, 0.3),
    "gear": ((0.08, 0.09, 0.09), 0.6, 0.45),
    "facade": ((0.55, 0.60, 0.66), 0.4, 0.3),
    "facade_blue": ((0.40, 0.50, 0.66), 0.4, 0.3),
    "facade_bronze": ((0.55, 0.42, 0.28), 0.5, 0.3),
    "facade_hotel": ((0.55, 0.60, 0.66), 0.4, 0.3),
    "window_lit": ((0.85, 0.9, 1.0), 0.0, 0.4),
    "planting": ((0.12, 0.32, 0.14), 0.0, 0.9),
    "seat": ((0.8, 0.06, 0.06), 0.0, 0.5),
    "seat_orange": ((0.95, 0.38, 0.02), 0.0, 0.5),
    # Rows of spectators (the game paints its crowd texture on it, by the
    # UVs in metres).
    "crowd": ((0.55, 0.45, 0.4), 0.0, 0.9),
    "concrete": ((0.62, 0.62, 0.64), 0.0, 0.9),
    "concrete_dark": ((0.45, 0.45, 0.47), 0.0, 0.9),
    "steel": ((0.55, 0.57, 0.6), 0.7, 0.4),
    "white_steel": ((0.9, 0.91, 0.92), 0.5, 0.35),
    "roof_membrane": ((0.92, 0.93, 0.95), 0.0, 0.6),
    "render": ((0.9, 0.89, 0.86), 0.0, 0.85),
    "red_stripe": ((0.62, 0.05, 0.05), 0.2, 0.4),
    "red_steel": ((0.72, 0.08, 0.06), 0.6, 0.35),
    "sail_shade": ((0.97, 0.97, 0.96), 0.0, 0.5),
    "spray": ((0.92, 0.95, 0.98), 0.0, 0.3),
    "mist": ((0.9, 0.93, 0.96), 0.0, 0.5),
    "grass": ((0.30, 0.50, 0.20), 0.0, 0.95),
    "sand": ((0.86, 0.79, 0.62), 0.0, 1.0),
    "screen": ((1.0, 1.0, 1.0), 0.0, 0.5),
    "gridshell": ((0.82, 0.85, 0.9), 0.7, 0.3),
    "dark_glass": ((0.05, 0.07, 0.1), 0.4, 0.1),
    # The historic venues' roles.
    "basalt": ((0.36, 0.34, 0.32), 0.0, 0.9),
    "forest": ((0.10, 0.22, 0.11), 0.0, 0.95),
    "forest_tree": ((0.09, 0.2, 0.1), 0.0, 0.9),
    "forest_autumn": ((0.55, 0.24, 0.08), 0.0, 0.95),
    "forest_gold": ((0.68, 0.48, 0.12), 0.0, 0.95),
    "rock": ((0.24, 0.22, 0.19), 0.0, 0.95),
    "canopy": ((0.74, 0.74, 0.7), 0.0, 0.9),
    "water": ((0.12, 0.3, 0.42), 0.0, 0.15),
    "palace_red": ((0.62, 0.16, 0.12), 0.0, 0.8),
    "palace_yellow": ((0.88, 0.7, 0.24), 0.0, 0.8),
    "terracotta": ((0.66, 0.3, 0.18), 0.0, 0.85),
    "olive": ((0.42, 0.5, 0.34), 0.0, 0.9),
    "cypress": ((0.08, 0.2, 0.1), 0.0, 0.9),
    "vine": ((0.2, 0.36, 0.14), 0.0, 0.9),
}
MATS = {}


def material(role):
    if role not in MATS:
        c, metal, rough = PALETTE[role]
        MATS[role] = mat(role, c, metal, rough, emit=(1.0, 0.85, 0.6) if role == "window_lit" else None,
                         alpha=0.6 if role == "spray" else 0.3 if role == "mist" else 1.0)
    return MATS[role]


class Mesh:
    """Faces gathered with their roles, then one object. UVs are in metres,
    projected per face (u along a wall, v up), unless a face brings its own
    (a curved wall's u runs round it, so its rooms line up)."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.roles = []
        self.own_uv = set()
        # A sheet (a landform open underneath): its faces turned to the sky.
        self.upward = False

    def face(self, pts, role, smooth=False, uvs=None):
        if role not in self.roles:
            self.roles.append(role)
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.roles.index(role)
        f.smooth = smooth
        if uvs is not None:
            for loop, uv in zip(f.loops, uvs):
                loop[self.uv].uv = uv
            self.own_uv.add(f)
        return f

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

    def prism(self, outline, z0, z1, role, cap_top=True, cap_bottom=False, wrap_uv=False):
        """An outline (x, y) extruded from z0 to z1 (`wrap_uv`: u runs round
        the outline in metres, for a curved facade)."""
        n = len(outline)
        lo = [Vector((x, y, z0)) for x, y in outline]
        hi = [Vector((x, y, z1)) for x, y in outline]
        run = 0.0
        for i in range(n):
            j = (i + 1) % n
            seg = (lo[j] - lo[i]).length
            uvs = [(run, z0), (run + seg, z0), (run + seg, z1), (run, z1)] if wrap_uv else None
            self.face((lo[i], lo[j], hi[j], hi[i]), role, uvs=uvs)
            run += seg
        if cap_top:
            self.face(hi, role)
        if cap_bottom:
            self.face(list(reversed(lo)), role)

    def loft(self, rings, role, cap_top=True, wrap_uv=True, smooth=False):
        """Closed rings of points (each a level, bottom to top) joined into a
        wall; the u of the UVs runs round each ring in metres."""
        for r0, r1 in zip(rings, rings[1:]):
            n = len(r0)
            run0 = run1 = 0.0
            for i in range(n):
                j = (i + 1) % n
                s0 = (Vector(r0[j]) - Vector(r0[i])).length
                s1 = (Vector(r1[j]) - Vector(r1[i])).length
                uvs = [(run0, r0[i][2]), (run0 + s0, r0[j][2]), (run1 + s1, r1[j][2]), (run1, r1[i][2])] if wrap_uv else None
                pts = [r0[i], r0[j], r1[j], r1[i]]
                if (Vector(r1[i]) - Vector(r1[j])).length < 1e-4:
                    self.face(pts[:3], role, smooth, uvs=uvs[:3] if uvs else None)
                else:
                    self.face(pts, role, smooth, uvs=uvs)
                run0 += s0
                run1 += s1
        top = rings[-1]
        if cap_top and (Vector(top[0]) - Vector(top[1])).length > 1e-4:
            self.face(top, role)

    def lathe(self, profile, centre, role, segs=16, smooth=True):
        """A body of revolution about the vertical through `centre`: profile
        is (radius, z), bottom to top."""
        cx, cy = centre
        rows = []
        for r, z in profile:
            rows.append([(cx + math.cos(2 * math.pi * i / segs) * r, cy + math.sin(2 * math.pi * i / segs) * r, z) for i in range(segs)])
        for (ra, _), (rb, _), r0, r1 in zip(profile, profile[1:], rows, rows[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                pts = [r0[i], r0[j], r1[j], r1[i]]
                if ra < 1e-4:
                    pts = [r0[i], r1[j], r1[i]]
                elif rb < 1e-4:
                    pts = [r0[i], r0[j], r1[i]]
                self.face(pts, role, smooth)

    def finish(self, extras=None, parent=None, colour=None):
        """`colour`: a function of a vertex's position giving its colour
        (r, g, b), painted into the faces of the `screen` role."""
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-4)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        if self.upward:
            for f in self.bm.faces:
                if f.normal.z < 0:
                    f.normal_flip()
        for f in self.bm.faces:
            if f in self.own_uv and f.is_valid:
                continue
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
        if colour is not None:
            attr = me.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
            screen = self.roles.index("screen") if "screen" in self.roles else -1
            for poly in me.polygons:
                for li in poly.loop_indices:
                    v = me.vertices[me.loops[li].vertex_index].co
                    c = colour(v) if poly.material_index == screen else (1.0, 1.0, 1.0)
                    attr.data[li].color = (*c, 1.0)
            me.color_attributes.active_color = attr
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        for k, v in (extras or {}).items():
            ob[k] = v
        return ob


def slab_xz(m, outline, y0, y1, role):
    """An outline in the XZ plane (x, z), as a slab from y0 to y1."""
    n = len(outline)
    a = [(x, y0, z) for x, z in outline]
    b = [(x, y1, z) for x, z in outline]
    m.face(list(reversed(a)), role)
    m.face(b, role)
    for i in range(n):
        j = (i + 1) % n
        m.face((a[i], a[j], b[j], b[i]), role)


def tube(m, a, b, r, role, sides=6, cap=True):
    """A round bar from a to b, closed at its ends."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(side).normalized()
    v = d.cross(u)
    ra = [a + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r for k in range(sides)]
    rb = [p + (b - a) for p in ra]
    # A bar standing on the ground stops at it (a raked one's foot would dip in).
    ra = [Vector((p.x, p.y, max(0.0, p.z))) for p in ra]
    rb = [Vector((p.x, p.y, max(0.0, p.z))) for p in rb]
    for k in range(sides):
        j = (k + 1) % sides
        m.face((ra[k], ra[j], rb[j], rb[k]), role)
    if cap:
        m.face(list(reversed(ra)), role)
        m.face(rb, role)


def polyline(m, pts, r, role, sides=6):
    for a, b in zip(pts, pts[1:]):
        tube(m, a, b, r, role, sides)


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons) if ob.type == "MESH" else 0


def empty(name, loc=(0, 0, 0), parent=None, extras=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    for k, v in (extras or {}).items():
        ob[k] = v
    return ob


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def facade_tower(m, outline, z0, z1, role):
    """A facade prism whose rooms run round it (UVs in metres)."""
    m.prism(outline, z0, z1, role, cap_top=True, wrap_uv=True)


def rounded_rect(hx, hy, r, steps=3, cx=0.0, cy=0.0):
    """A rectangle with rounded corners, anticlockwise."""
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (hx - r), cy + qy * (hy - r)
        for k in range(steps + 1):
            a = math.radians(a0 + 90 * k / steps)
            pts.append((ox + math.cos(a) * r, oy + math.sin(a) * r))
    return pts


def ellipse(a, b, n, cx=0.0, cy=0.0, a0=0.0, a1=2 * math.pi, closed=True):
    count = n if closed else n + 1
    return [(cx + a * math.cos(a0 + (a1 - a0) * k / n), cy + b * math.sin(a0 + (a1 - a0) * k / n)) for k in range(count)]




# =============================================================================
# Shared pieces
# =============================================================================

def rows(m, x0, x1, y_front, count, depth, z_start, rise, roles, rot=None, about=None):
    """Stepped rows of a stand, front to back: each a block from the ground
    to its step (fans or seats on it by role). Returns (y of the last row's
    back, its top)."""
    for k in range(count):
        y1 = y_front - depth * k
        m.box((x0, y1 - depth, 0), (x1, y1, z_start + rise * (k + 1)), roles[k % len(roles)], rot=rot, about=about, skip=("-z",))
    return y_front - depth * count, z_start + rise * count


def deck(m, x0, x1, y_back, z_back, y_front, z_front, thick, top="roof_membrane", under="white_steel"):
    """A roof deck from its back edge to its front edge, closed (a thin slab
    falling toward the front)."""
    a = [(x0, y_back, z_back), (x1, y_back, z_back), (x1, y_front, z_front), (x0, y_front, z_front)]
    b = [(x, y, z - thick) for x, y, z in a]
    m.face(a, top)
    m.face(list(reversed(b)), under)
    for i in range(4):
        j = (i + 1) % 4
        m.face([b[i], b[j], a[j], a[i]], under)


def wall(m, a, b, z0, h, thick, role):
    """A straight wall from a to b (x, y), standing from z0 to z0 + h."""
    a, b = Vector((a[0], a[1], 0)), Vector((b[0], b[1], 0))
    d = (b - a).normalized()
    n = Vector((-d.y, d.x, 0)) * (thick / 2)
    lo = [a - n, b - n, b + n, a + n]
    m.prism([(p.x, p.y) for p in lo], z0, z0 + h, role, cap_top=True, cap_bottom=True)


def conifer(m, x, y, z, h, r, role="planting"):
    m.lathe([(0.0, z - 0.5), (r * 0.12, z - 0.5), (r * 0.12, z + h * 0.15), (r, z + h * 0.22), (r * 0.55, z + h * 0.6), (0.0, z + h)], (x, y), role, segs=6, smooth=False)


def broadleaf(m, x, y, z, h, r, role="planting"):
    m.lathe([(0.0, z - 0.5), (0.3, z - 0.5), (0.3, z + h * 0.3), (r * 0.9, z + h * 0.42), (r, z + h * 0.7), (r * 0.55, z + h * 0.93), (0.0, z + h)], (x, y), role, segs=6, smooth=False)


def heightfield(m, xs, ys, h, role_at):
    """A landform sheet over a grid, its faces to the sky; role_at(x, y, z)
    names each face's role."""
    grid = [[(x, y, h(x, y)) for y in ys] for x in xs]
    for i in range(len(xs) - 1):
        for k in range(len(ys) - 1):
            q = (grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1])
            cx = sum(p[0] for p in q) / 4
            cy = sum(p[1] for p in q) / 4
            cz = sum(p[2] for p in q) / 4
            m.face(q, role_at(cx, cy, cz))
    return grid


def hash01(a, b):
    v = math.sin(a * 12.9898 + b * 78.233) * 43758.5453
    return v - math.floor(v)


# =============================================================================
# Hockenheim: the Motodrom's great stand
# =============================================================================

def build_motodrom():
    """The Motodrom's stands along the straight opposite the pits (the main
    and south grandstands, 2002 on): 260 m of three tiers of concrete
    terraces, the upper tier over the middle, a long roof over the centre
    cantilevered from trusses, stair towers at the back; at either end the
    stand turns toward the track, as the stadium's stands close round it."""
    clear()
    root = empty("motodrom")
    s = Mesh("stand")
    L = 130.0
    lower = ("concrete", "crowd", "crowd", "seat", "crowd")
    middle = ("crowd", "seat", "crowd", "crowd")
    yb, zt = rows(s, -L, L, 14.0, 16, 0.9, 1.2, 0.5, lower)
    s.box((-L, yb - 2.0, 0), (L, yb, zt + 1.8), "concrete", skip=("-z",))
    for k in range(26):
        x = -L + 6 + k * (2 * L - 12) / 25
        s.box((x - 2.2, yb + 0.05, zt - 0.2), (x + 2.2, yb + 0.15, zt + 1.4), "gear")
    y2 = yb - 2.0
    yb2, zt2 = rows(s, -L, L, y2, 14, 1.0, zt + 2.0, 0.62, middle)
    s.box((-L, yb2 - 2.0, 0), (L, yb2, zt2 + 1.6), "concrete", skip=("-z",))
    # The upper tier over the middle.
    U = 75.0
    y3 = yb2 - 2.0
    yb3, zt3 = rows(s, -U, U, y3, 10, 1.1, zt2 + 1.8, 0.75, middle)
    s.box((-U, yb3 - 2.2, 0), (U, yb3, zt3 + 2.0), "concrete", skip=("-z",))
    # Stair towers at the back.
    for x in (-110, -92, 92, 110):
        s.box((x - 4.5, y3 - 8.0, 0), (x + 4.5, y3, zt2 + 3.0), "concrete_dark", skip=("-z",))
    for x in (-60, 0, 60):
        s.box((x - 4.5, yb3 - 9.0, 0), (x + 4.5, yb3 - 2.2, zt3 + 4.0), "concrete_dark", skip=("-z",))
    s.finish(parent=root)
    # The ends turned toward the track, 22 degrees, lower and middle tiers.
    for name, sign in (("end_L", -1), ("end_R", 1)):
        e = Mesh(name)
        rot = Matrix.Rotation(math.radians(22) * sign, 3, "Z")
        about = (sign * L, 14.0, 0.0)
        x0, x1 = (L - 1.0, L + 38.0) if sign > 0 else (-L - 38.0, -L + 1.0)
        ybe, zte = rows(e, x0, x1, 14.0, 16, 0.9, 1.2, 0.5, lower, rot=rot, about=about)
        e.box((x0, ybe - 2.0, 0), (x1, ybe, zte + 1.8), "concrete", rot=rot, about=about, skip=("-z",))
        ybe2, zte2 = rows(e, x0, x1, ybe - 2.0, 14, 1.0, zte + 2.0, 0.62, middle, rot=rot, about=about)
        e.box((x0, ybe2 - 2.0, 0), (x1, ybe2, zte2 + 1.6), "concrete", rot=rot, about=about, skip=("-z",))
        e.finish(parent=root)
    r = Mesh("roof")
    yr0 = yb3 - 2.2
    deck(r, -95.0, 95.0, yr0, zt3 + 6.0, 4.0, zt3 + 3.0, 0.8)
    for k in range(11):
        x = -95.0 + k * 19.0
        mast = (x, yr0 + 1.0, zt3 + 10.0)
        tube(r, (x, yr0 + 1.0, 0.0), mast, 0.55, "steel", 6)
        tube(r, mast, (x, 3.5, zt3 + 3.1), 0.3, "steel", 5)
        for f in (0.3, 0.6):
            p = (x, yr0 + 1.0 + (3.5 - yr0 - 1.0) * f, zt3 + 10.0 - 6.9 * f)
            q = (x, p[1], zt3 + 6.0 - 3.0 * (p[1] - yr0) / (4.0 - yr0) + 0.05)
            tube(r, p, q, 0.18, "steel", 4)
    r.finish(parent=root)
    return root


# =============================================================================
# The Nurburgring: the castle on its hill
# =============================================================================

NUR_R = 170.0
NUR_H = 78.0


def nur_height(x, y):
    r = math.hypot(x / 1.25, y)
    t = min(1.0, max(0.0, (r - 22.0) / (NUR_R - 22.0)))
    bump = 1.0 + 0.06 * math.sin(math.atan2(y, x) * 5.0) * t
    return NUR_H * (0.5 + 0.5 * math.cos(math.pi * t)) * bump


def build_nurburg_castle():
    """The ruined Nurburg on its wooded volcanic hill: the round keep (about
    20 m) on the summit, the broken ring wall with its round towers, the
    hill under forest, a grass clearing round the castle."""
    clear()
    root = empty("nurburg_castle")
    h = Mesh("hill")
    h.upward = True
    segs = 40
    radii = [0.0, 8.0, 16.0, 24.0, 32.0] + [32.0 + (NUR_R - 32.0) * k / 12 for k in range(1, 13)]
    ring = lambda r: [(math.cos(2 * math.pi * i / segs) * r * 1.25, math.sin(2 * math.pi * i / segs) * r) for i in range(segs)]
    for r0, r1 in zip(radii, radii[1:]):
        a = ring(r0)
        b = ring(r1)
        for i in range(segs):
            j = (i + 1) % segs
            pts = [(b[i][0], b[i][1], nur_height(*b[i])), (b[j][0], b[j][1], nur_height(*b[j])), (a[j][0], a[j][1], nur_height(*a[j])), (a[i][0], a[i][1], nur_height(*a[i]))]
            if r0 == 0.0:
                pts = pts[:3]
            h.face(pts, "grass" if r1 <= 40.0 else "forest")
    h.finish(parent=root)
    t = Mesh("trees")
    k = 0
    for ri in range(9):
        r = 46.0 + ri * 14.0
        n = int(2 * math.pi * r / 21)
        for i in range(n):
            a = 2 * math.pi * (i + 0.5 * (ri % 2)) / n + hash01(ri, i) * 0.2
            x, y = math.cos(a) * r * 1.25, math.sin(a) * r
            z = nur_height(x, y)
            hh = 15.0 + hash01(i, ri) * 8.0
            conifer(t, x, y, z, hh, 3.6, "forest_tree")
            k += 1
    t.finish(parent=root)
    c = Mesh("castle")
    top = NUR_H
    # The keep: a round tower, its crown of merlons.
    c.lathe([(0.0, top - 2.0), (6.0, top - 2.0), (5.6, top + 6.0), (5.4, top + 21.0), (0.0, top + 21.0)], (0.0, 4.0), "basalt", segs=16, smooth=False)
    for i in range(12):
        a = 2 * math.pi * i / 12
        x, y = math.cos(a) * 4.9, 4.0 + math.sin(a) * 4.9
        c.box((x - 0.8, y - 0.8, top + 20.8), (x + 0.8, y + 0.8, top + 22.6), "basalt")
    # The ring wall: broken, its pieces of different heights.
    n = 14
    pts = [(math.cos(2 * math.pi * i / n) * 27.0, math.sin(2 * math.pi * i / n) * 22.0 + 2.0) for i in range(n)]
    for i in range(n):
        if i in (3, 9):
            continue
        hgt = 4.5 + 3.5 * hash01(i, 7)
        wall(c, pts[i], pts[(i + 1) % n], top - 2.0, hgt + 2.0, 1.8, "basalt")
    for i in (0, 5, 11):
        x, y = pts[i]
        c.lathe([(0.0, top - 2.0), (3.4, top - 2.0), (3.2, top + 9.5), (0.0, top + 9.5)], (x, y), "basalt", segs=10, smooth=False)
    # The palace's ruined walls inside the ring.
    wall(c, (-16.0, -8.0), (-2.0, -14.0), top - 1.0, 7.0, 1.4, "stone_dark")
    wall(c, (-16.0, -8.0), (-18.0, 6.0), top - 1.0, 5.0, 1.4, "stone_dark")
    c.finish(parent=root)
    return root


# =============================================================================
# Estoril: the main grandstand, the Serra de Sintra
# =============================================================================

def build_estoril_grandstand():
    """The main grandstand opposite the pits: 200 m of seats rising from the
    track, the boxes' glass along the back, under a long flat roof on a row
    of slender columns."""
    clear()
    root = empty("estoril_grandstand")
    s = Mesh("stand")
    L = 100.0
    yb, zt = rows(s, -L, L, 12.0, 18, 1.15, 1.4, 0.62, ("concrete", "crowd", "seat", "crowd", "crowd", "seat"))
    s.box((-L, yb - 4.0, 0), (L, yb, zt + 4.5), "render", skip=("-z",))
    s.box((-L + 1, yb + 0.02, zt + 0.6), (L - 1, yb + 0.12, zt + 3.6), "glass")
    s.box((-L - 1.0, yb - 4.0, 0), (-L, 13.0, 2.4), "concrete_dark")
    s.box((L, yb - 4.0, 0), (L + 1.0, 13.0, 2.4), "concrete_dark")
    s.finish(parent=root)
    r = Mesh("roof")
    deck(r, -L - 3, L + 3, yb - 4.0, zt + 7.0, 14.0, zt + 6.0, 0.9, top="render", under="white_steel")
    for k in range(17):
        x = -L + k * (2 * L / 16)
        r.box((x - 0.35, 11.4, 0), (x + 0.35, 12.1, zt + 5.2), "white_steel")
        r.box((x - 0.35, yb - 3.0, zt + 4.5), (x + 0.35, yb - 2.3, zt + 6.3), "white_steel")
    r.box((-L - 3, 13.5, zt + 4.9), (L + 3, 14.0, zt + 6.0), "white_steel")
    r.finish(parent=root)
    return root


SINTRA_W = 450.0


def sintra_ridge_y(x):
    return -130.0 + 35.0 * math.sin(x / 150.0)


def sintra_height(x, y):
    yr = sintra_ridge_y(x)
    peak = 115.0 + 85.0 * math.exp(-((x - 90.0) / 95.0) ** 2) + 45.0 * math.exp(-((x + 230.0) / 85.0) ** 2) + 12.0 * math.sin(x / 41.0)
    across = math.exp(-((y - yr) / 95.0) ** 2)
    ends = smooth((SINTRA_W - abs(x)) / 150.0)
    front = smooth((40.0 - y) / 90.0)
    return max(0.0, peak * across * ends * front)


def build_sintra_hills():
    """The Serra de Sintra above the coast: a long forested ridge, its rocky
    crest, and on the highest summit the Pena Palace, its yellow and red
    walls and towers (small at the distance it is seen from)."""
    clear()
    root = empty("sintra_hills")
    g = Mesh("ridge")
    g.upward = True
    xs = [-SINTRA_W + 2 * SINTRA_W * i / 60 for i in range(61)]
    ys = [40.0 - 340.0 * k / 20 for k in range(21)]
    heightfield(g, xs, ys, sintra_height, lambda x, y, z: "rock" if z > 185.0 and math.sin(x / 23.0) * math.sin(y / 17.0) > 0.1 else "forest")
    g.finish(parent=root)
    t = Mesh("trees")
    for i in range(160):
        x = -SINTRA_W * 0.8 + 1.6 * SINTRA_W * hash01(i, 3.0)
        y = sintra_ridge_y(x) + 70.0 + 70.0 * hash01(i, 9.0)
        z = sintra_height(x, y)
        if z < 15.0 or z > 140.0:
            continue
        conifer(t, x, y, z, 16.0 + 6.0 * hash01(i, 5.0), 4.0, "forest_tree")
    t.finish(parent=root)
    p = Mesh("pena_palace")
    px = 90.0
    py = sintra_ridge_y(px)
    pz = sintra_height(px, py) - 3.0
    p.box((px - 14, py - 6, pz), (px + 6, py + 6, pz + 13.0), "palace_red")
    p.box((px + 6, py - 8, pz), (px + 20, py + 4, pz + 16.0), "palace_yellow")
    p.box((px - 26, py - 5, pz), (px - 14, py + 7, pz + 10.0), "stone")
    p.lathe([(0.0, pz), (4.6, pz), (4.6, pz + 22.0), (5.2, pz + 22.5), (4.0, pz + 24.0), (2.4, pz + 27.0), (0.0, pz + 28.5)], (px + 13, py + 6), "palace_yellow", segs=12, smooth=False)
    p.lathe([(0.0, pz), (3.0, pz), (3.0, pz + 19.0), (0.0, pz + 23.0)], (px - 10, py + 5), "palace_red", segs=8, smooth=False)
    p.box((px - 24, py - 3, pz + 10.0), (px - 20, py + 1, pz + 18.0), "stone")
    for k in range(8):
        x = px - 25 + k * 1.6
        p.box((x, py + 6.4, pz + 10.0), (x + 0.8, py + 7.0, pz + 11.2), "stone")
    p.finish(parent=root)
    return root


# =============================================================================
# Kyalami: Johannesburg's skyline
# =============================================================================

def build_joburg_skyline():
    """Johannesburg's towers seen across the Highveld: the Hillbrow Tower
    (269 m, its pod near the top), Ponte City (173 m, the cylinder; its crown
    a plain band, no sign), the Carlton Centre (223 m) and the city's blocks
    round them."""
    clear()
    root = empty("joburg_skyline")
    hb = Mesh("hillbrow")
    cx, cy = -150.0, -40.0
    hb.lathe([(8.0, 0.0), (6.4, 20.0), (5.2, 120.0), (4.8, 204.0), (0.0, 204.0)], (cx, cy), "concrete", segs=14, smooth=False)
    hb.lathe([(0.0, 203.0), (12.5, 206.0), (13.0, 212.0), (0.0, 212.0)], (cx, cy), "concrete", segs=18, smooth=False)
    hb.lathe([(0.0, 212.0), (12.8, 212.0), (12.8, 220.0), (0.0, 220.0)], (cx, cy), "glass", segs=18, smooth=False)
    hb.lathe([(0.0, 220.0), (13.0, 220.0), (10.0, 225.0), (5.0, 226.0), (4.4, 248.0), (1.6, 249.0), (1.0, 268.0), (0.0, 269.0)], (cx, cy), "concrete", segs=14, smooth=False)
    hb.finish(parent=root)
    pc = Mesh("ponte")
    circle = [(60.0 + math.cos(2 * math.pi * i / 32) * 22.0, -10.0 + math.sin(2 * math.pi * i / 32) * 22.0) for i in range(32)]
    facade_tower(pc, circle, 0.0, 167.0, "facade")
    pc.lathe([(0.0, 166.5), (22.4, 166.5), (22.4, 173.0), (0.0, 173.0)], (60.0, -10.0), "concrete_dark", segs=32, smooth=False)
    pc.finish(parent=root)
    cc = Mesh("carlton")
    facade_tower(cc, rounded_rect(24.0, 16.0, 2.0, 2, cx=-40.0, cy=-90.0), 14.0, 223.0, "facade")
    cc.box((-70, -120, 0), (-10, -60, 14.0), "concrete")
    cc.finish(parent=root)
    city = Mesh("city")
    for i, (x, y, w, d, hgt) in enumerate(((-230, -60, 26, 22, 120), (-95, -20, 22, 30, 96), (-10, -10, 30, 24, 140), (25, -120, 26, 20, 112), (115, -60, 30, 26, 150),
                                            (170, -20, 24, 24, 88), (210, -110, 28, 22, 128), (-190, -140, 30, 26, 104), (-270, -10, 22, 22, 72), (260, -40, 26, 20, 96))):
        facade_tower(city, rounded_rect(w / 2, d / 2, 1.0, 1, cx=x, cy=y), 0.0, hgt, "facade" if i % 3 else "facade_blue")
    city.finish(parent=root)
    return root


# =============================================================================
# Sepang: the double-fronted grandstand under its leaves
# =============================================================================

def leaf(m, xc, sign, root_z=31.0, tip_y=41.0, tip_z=22.0, half=10.6):
    """A canopy shaped like an oil-palm leaf from the spine's mast out over
    one side: a pointed leaf on its arched mid-rib, its edges drooping."""
    nu, nv = 12, 6
    pts_top = []
    for i in range(nu + 1):
        u = i / nu
        y = sign * (3.0 + (tip_y - 3.0) * u)
        z = root_z + (tip_z - root_z) * u + 4.0 * math.sin(math.pi * u)
        w = max(0.35, half * math.sin(math.pi * min(1.0, u * 1.08)) ** 0.75)
        row = []
        for k in range(nv + 1):
            v = -1.0 + 2.0 * k / nv
            row.append((xc + v * w, y, z - 2.2 * v * v))
        pts_top.append(row)
    top = pts_top
    bot = [[(x, y, z - 0.35) for x, y, z in row] for row in top]
    for i in range(nu):
        for k in range(nv):
            m.face([top[i][k], top[i + 1][k], top[i + 1][k + 1], top[i][k + 1]], "canopy")
            m.face([bot[i][k + 1], bot[i + 1][k + 1], bot[i + 1][k], bot[i][k]], "canopy")
    edge = [(i, 0) for i in range(nu)] + [(nu, k) for k in range(nv)] + [(i, nv) for i in range(nu, 0, -1)] + [(0, k) for k in range(nv, 0, -1)]
    for (i, k), (i2, k2) in zip(edge, edge[1:] + edge[:1]):
        m.face([top[i][k], bot[i][k], bot[i2][k2], top[i2][k2]], "canopy")
    return [row[nv // 2] for row in top]


def build_sepang_grandstand():
    """The double-fronted main grandstand between the main and back
    straights: stands either side of a central spine, each side under a
    row of white canopies shaped like the leaves of the oil palms the
    circuit was built among, a pair springing from each mast on the spine."""
    clear()
    root = empty("sepang_grandstand")
    s = Mesh("stand")
    L = 110.0
    roles = ("concrete", "crowd", "crowd", "seat", "crowd", "seat")
    for sign in (1, -1):
        for k in range(18):
            y1 = 34.0 - 1.6 * k
            z = 1.2 + 0.7 * (k + 1)
            if sign > 0:
                s.box((-L, y1 - 1.6, 0), (L, y1, z), roles[k % len(roles)], skip=("-z",))
            else:
                s.box((-L, -y1, 0), (L, -y1 + 1.6, z), roles[k % len(roles)], skip=("-z",))
    s.box((-L, -5.2, 0), (L, 5.2, 16.0), "concrete", skip=("-z",))
    for sign in (1, -1):
        s.box((-L + 1, sign * 5.2 - 0.05, 13.2), (L - 1, sign * 5.2 + 0.05, 15.4), "glass")
    s.finish(parent=root)
    c = Mesh("canopy")
    ribs = Mesh("masts")
    bays = 10
    for i in range(bays):
        xc = -L + (2 * L / bays) * (i + 0.5)
        for sign in (1, -1):
            spine = leaf(c, xc, sign)
            polyline(ribs, [(x, y, z + 0.2) for x, y, z in spine], 0.28, "white_steel", 5)
        tube(ribs, (xc, 0.0, 16.0), (xc, 0.0, 36.0), 0.6, "white_steel", 8)
        for sign in (1, -1):
            tube(ribs, (xc, 0.0, 35.5), (xc, sign * 22.0, 31.2), 0.14, "steel", 4)
    c.finish(parent=root)
    ribs.finish(parent=root)
    return root


# =============================================================================
# Istanbul Park: the main grandstand
# =============================================================================

def build_istanbul_grandstand():
    """The main grandstand opposite the pits: 260 m of seats, the boxes'
    glass along the back, under a long roof hung by stays from a row of
    tall white masts standing behind it."""
    clear()
    root = empty("istanbul_grandstand")
    s = Mesh("stand")
    L = 130.0
    yb, zt = rows(s, -L, L, 12.0, 20, 1.25, 1.4, 0.68, ("concrete", "crowd", "crowd", "seat", "crowd"))
    s.box((-L, yb - 3.0, 0), (L, yb, zt + 4.0), "concrete", skip=("-z",))
    s.box((-L + 1, yb + 0.02, zt + 0.8), (L - 1, yb + 0.12, zt + 3.4), "glass")
    s.box((-L - 1.0, yb - 3.0, 0), (-L, 13.0, 2.6), "concrete_dark")
    s.box((L, yb - 3.0, 0), (L + 1.0, 13.0, 2.6), "concrete_dark")
    s.finish(parent=root)
    r = Mesh("roof")
    zb = zt + 8.5
    zf = zt + 7.0
    deck(r, -L - 2, L + 2, yb - 3.0, zb, 13.0, zf, 0.8)
    r.finish(parent=root)
    m = Mesh("masts")
    n = 8
    for i in range(n):
        x = -L + 10 + (2 * L - 20) * i / (n - 1)
        foot = (x, yb - 7.0, 0.0)
        top = (x, yb - 10.0, 54.0)
        tube(m, foot, top, 0.9, "white_steel", 8)
        for dx in (-9.0, 0.0, 9.0):
            tube(m, top, (x + dx, 12.5, zf - 0.1), 0.12, "steel", 4)
        tube(m, top, (x, -2.0, zb - 0.6), 0.12, "steel", 4)
        tube(m, top, (x, yb - 32.0, 0.0), 0.16, "steel", 4)
    m.finish(parent=root)
    return root


# =============================================================================
# Mugello: a Tuscan hillside
# =============================================================================

TUSCAN_LEVELS = 14
TUSCAN_WALL = 1.6
TUSCAN_RISE = 4.6


def tuscan_ring(k, n=56):
    """Terrace k's foot (its wall's line), wavering as a hillside's contour
    does, and the height its wall stands on."""
    t = k / TUSCAN_LEVELS
    ax = 240.0 - 180.0 * t
    ay = 160.0 - 120.0 * t
    cy = -60.0 * t
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        w = 1.0 + 0.06 * math.sin(3 * a + k * 0.7) + 0.04 * math.sin(5 * a + 1.3 + k * 0.4)
        pts.append((math.cos(a) * ax * w, cy + math.sin(a) * ay * w))
    return pts, TUSCAN_RISE * k


def build_tuscan_hill():
    """A Tuscan hill terraced with olive groves: low dry-stone walls
    stepping up its rounded flanks along its contours, grass banks between
    them with rows of olives, a stone farmhouse (casa colonica) on top with
    its dovecote tower and terracotta roofs, and a line of cypresses up the
    track to it."""
    clear()
    root = empty("tuscan_hill")
    h = Mesh("terraces")
    for k in range(TUSCAN_LEVELS):
        ring, z = tuscan_ring(k)
        nxt, z2 = tuscan_ring(k + 1)
        h.loft([[(x, y, z) for x, y in ring], [(x, y, z + TUSCAN_WALL) for x, y in ring]], "stone_dark", cap_top=False)
        h.loft([[(x, y, z + TUSCAN_WALL) for x, y in ring], [(x, y, z2) for x, y in nxt]], "grass", cap_top=False)
    top_ring, top = tuscan_ring(TUSCAN_LEVELS)
    h.face([(x, y, top) for x, y in top_ring], "grass")
    h.finish(parent=root)
    o = Mesh("olives")
    for k in range(TUSCAN_LEVELS - 1):
        ring, z = tuscan_ring(k)
        nxt, z2 = tuscan_ring(k + 1)
        n = len(ring)
        # On the front of the hill (toward +y), every other point of the
        # terrace's contour, half way up its bank.
        for i in range(n):
            a = 2 * math.pi * i / n
            if math.sin(a) < 0.15 or (i + k) % 2:
                continue
            x = (ring[i][0] + nxt[i][0]) / 2
            y = (ring[i][1] + nxt[i][1]) / 2
            if abs(x) < 20.0:
                continue
            broadleaf(o, x, y, z + TUSCAN_WALL + (z2 - z - TUSCAN_WALL) * 0.45, 4.4 + hash01(i, k), 2.5, "olive")
    o.finish(parent=root)
    cy_ = Mesh("cypresses")
    for k in range(TUSCAN_LEVELS):
        ring, z = tuscan_ring(k)
        nxt, z2 = tuscan_ring(k + 1)
        q = len(ring) // 4
        y = (ring[q][1] + nxt[q][1]) / 2
        zz = z + TUSCAN_WALL + (z2 - z - TUSCAN_WALL) * 0.5
        for x in (9.0, 15.0):
            cy_.lathe([(0.0, zz - 0.8), (0.9, zz - 0.8), (1.6, zz + 3.0), (1.4, zz + 9.0), (0.6, zz + 13.5), (0.0, zz + 15.5)], (x, y), "cypress", segs=7, smooth=False)
    cy_.finish(parent=root)
    f = Mesh("farmhouse")
    cy = -60.0
    f.box((-10, cy - 7, top - 0.5), (10, cy + 6, top + 8.0), "stone")
    slab_xz(f, [(-10.8, top + 8.0), (10.8, top + 8.0), (0.0, top + 12.0)], cy - 7.8, cy + 6.8, "terracotta")
    f.box((4.0, cy - 3.0, top + 8.0), (9.0, cy + 2.0, top + 14.5), "stone")
    f.lathe([(0.0, top + 14.5), (3.9, top + 14.5), (0.0, top + 17.0)], (6.5, cy - 0.5), "terracotta", segs=4, smooth=False)
    f.box((-18, cy - 4, top - 0.5), (-10, cy + 4, top + 5.0), "stone_dark")
    slab_xz(f, [(-18.6, top + 5.0), (-9.6, top + 5.0), (-14.1, top + 7.2)], cy - 4.6, cy + 4.6, "terracotta")
    for x, y in ((-24.0, cy + 8.0), (22.0, cy + 10.0), (-6.0, cy + 14.0)):
        f.lathe([(0.0, top - 0.5), (0.9, top - 0.5), (1.6, top + 3.0), (1.4, top + 9.0), (0.6, top + 13.5), (0.0, top + 15.5)], (x, y), "cypress", segs=7, smooth=False)
    f.finish(parent=root)
    return root


# =============================================================================
# Watkins Glen: the Finger Lakes
# =============================================================================

FL_W = 560.0
FL_D = 1300.0


def lake_half(y):
    return 125.0 + 30.0 * math.sin(y / 210.0) + 20.0 * math.sin(y / 87.0)


def lakes_height(x, y):
    d = abs(x) - lake_half(y)
    ridge = 125.0 * smooth(d / 260.0) * (1.0 + 0.16 * math.sin(y / 150.0 + x / 75.0) + 0.08 * math.sin(x / 33.0))
    # The lake's near end open toward the track; the ridges rise from there.
    front = smooth((40.0 - y) / 240.0)
    ends = smooth((FL_W - abs(x)) / 120.0)
    # The valley floor 1.5 m up (clear of the game's ground), coming down
    # to the ground at the model's edges.
    base = 1.5 * min(smooth((40.0 - y) / 30.0), smooth((FL_W - abs(x)) / 30.0), smooth((y + FL_D) / 30.0))
    return max(base, base + ridge * front * ends)


def build_finger_lakes():
    """The Finger Lakes' country: a long narrow lake in its valley running
    away from the track into the distance between wooded ridges in their
    autumn colours, vineyards on the lower slopes."""
    clear()
    root = empty("finger_lakes")
    g = Mesh("hills")
    g.upward = True
    xs = [-FL_W + 2 * FL_W * i / 44 for i in range(45)]
    ys = [40.0 - (FL_D + 40.0) * k / 32 for k in range(33)]

    def role(x, y, z):
        d = abs(x) - lake_half(y)
        if z < 4.0:
            return "grass"
        if 20.0 < d < 150.0 and -800.0 < y < -120.0 and z < 55.0:
            return "vine" if int((y + 2000.0) / 22.0) % 2 == 0 else "grass"
        n = 0.5 + 0.32 * math.sin(x / 170.0 + 1.3) * math.sin(y / 140.0) + 0.18 * math.sin(x / 70.0 - y / 100.0)
        return "forest" if n < 0.3 else "forest_autumn" if n < 0.62 else "forest_gold"
    heightfield(g, xs, ys, lakes_height, role)
    g.finish(parent=root)
    t = Mesh("trees")
    for i in range(140):
        side = 1 if i % 2 else -1
        y = -60.0 - (FL_D - 160.0) * hash01(i, 1.7)
        x = side * (lake_half(y) + 40.0 + 260.0 * hash01(i, 4.1))
        z = lakes_height(x, y)
        if z < 8.0 or abs(x) > FL_W - 60.0:
            continue
        roles = ("forest_autumn", "forest_gold", "forest_tree")
        broadleaf(t, x, y, z, 11.0 + 5.0 * hash01(i, 2.2), 5.0, roles[i % 3])
    t.finish(parent=root)
    w = Mesh("lake")
    w.upward = True
    lys = [-20.0 - (FL_D - 60.0) * k / 32 for k in range(33)]
    for y0, y1 in zip(lys, lys[1:]):
        a0, a1 = lake_half(y0) + 6.0, lake_half(y1) + 6.0
        w.face([(-a0, y0, 2.4), (a0, y0, 2.4), (a1, y1, 2.4), (-a1, y1, 2.4)], "water")
    w.finish(parent=root)
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


def check(name, root, budget, top):
    objs = subtree(root)
    total = sum(tris(o) for o in objs)
    lo, hi = bounds(objs)
    print(f"{name}: {total} triangles, {lo.x:.1f}..{hi.x:.1f} x {lo.y:.1f}..{hi.y:.1f} x {lo.z:.2f}..{hi.z:.1f}")
    if total > budget:
        raise RuntimeError(f"{name} has {total} triangles, over its {budget}")
    if lo.z < -0.01:
        raise RuntimeError(f"{name} goes {-lo.z:.2f} m into the ground")
    if not (top[0] < hi.z < top[1]):
        raise RuntimeError(f"{name}'s top is at {hi.z:.1f} m, not {top[0]}..{top[1]}")


def export(root, filename, uvs=True, colours=False):
    """`uvs=False` leaves the UVs out (only the facade shader reads them)."""
    if not OUT:
        return
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in subtree(root):
        o.select_set(True)
        if not uvs and o.type == "MESH":
            if any(m and m.name.startswith("facade") for m in o.data.materials):
                raise RuntimeError(f"{o.name} has a facade, which needs its UVs")
            while o.data.uv_layers:
                o.data.uv_layers.remove(o.data.uv_layers[0])
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_extras=True, export_texcoords=uvs, export_normals=True, export_animations=False,
                              export_vertex_color="ACTIVE" if colours else "NONE")
    print("exported", path)


def preview(root, tag, shots, night=False):
    if not PREVIEW:
        return
    os.makedirs(PREVIEW, exist_ok=True)
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
    sun.data.energy = 0.8 if night else 4.0
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(150))
    scene.collection.objects.link(sun)
    lo, hi = bounds(subtree(root))
    size = max((hi - lo).x, (hi - lo).y)
    bpy.ops.mesh.primitive_plane_add(size=size * 8, location=((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0))
    floor = bpy.context.active_object
    floor.data.materials.append(mat("ground", (0.08, 0.1, 0.16) if night else (0.55, 0.53, 0.5)))
    for o in MATS.values():
        b = next(n for n in o.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        if o.name == "screen":
            # The Sphere's image: its vertex colours, glowing.
            attr = o.node_tree.nodes.new("ShaderNodeVertexColor")
            o.node_tree.links.new(attr.outputs["Color"], b.inputs["Base Color"])
            o.node_tree.links.new(attr.outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = 2.5
        if o.name == "spray":
            b.inputs["Transmission Weight"].default_value = 0.6
        if night and o.name.startswith("facade"):
            tex = o.node_tree.nodes.new("ShaderNodeTexBrick")
            tex.inputs["Scale"].default_value = 1.0
            tex.inputs["Brick Width"].default_value = 4.0
            tex.inputs["Row Height"].default_value = 3.2
            tex.inputs["Mortar Size"].default_value = 0.5
            tex.inputs["Color1"].default_value = (1.0, 0.75, 0.45, 1)
            tex.inputs["Color2"].default_value = (0.1, 0.12, 0.2, 1)
            tex.inputs["Mortar"].default_value = (0.05, 0.06, 0.08, 1)
            uv = o.node_tree.nodes.new("ShaderNodeTexCoord")
            o.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
            o.node_tree.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = 1.2
        if night and o.name in ("window_lit", "gridshell"):
            b.inputs["Emission Color"].default_value = (0.7, 0.85, 1.0, 1) if o.name == "window_lit" else (0.4, 0.3, 1.0, 1)
            b.inputs["Emission Strength"].default_value = 6.0 if o.name == "window_lit" else 3.0
        if night and o.name == "spray":
            b.inputs["Emission Color"].default_value = (0.85, 0.92, 1.0, 1)
            b.inputs["Emission Strength"].default_value = 1.5
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 35
    cam.data.clip_end = 8000
    scene.collection.objects.link(cam)
    scene.camera = cam
    for shot, loc, aim in shots:
        cam.location = loc
        cam.rotation_euler = (Vector(aim) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"{tag}_{shot}.png")
        bpy.ops.render.render(write_still=True)



MODELS = (
    # build, name, top (m), uvs (a facade), vertex colours, preview shots, night
    (build_motodrom, "motodrom", (30, 45), True, False, [("front", (80, 200, 40), (0, 0, 15))], False),
    (build_nurburg_castle, "nurburg_castle", (95, 110), True, False, [("front", (60, 420, 70), (0, 0, 70))], False),
    (build_estoril_grandstand, "estoril_grandstand", (16, 26), True, False, [("front", (60, 150, 25), (0, 0, 10))], False),
    (build_sintra_hills, "sintra_hills", (200, 260), True, False, [("front", (60, 900, 120), (60, -100, 120))], False),
    (build_joburg_skyline, "joburg_skyline", (265, 275), True, False, [("front", (0, 650, 90), (-20, -40, 130))], False),
    (build_sepang_grandstand, "sepang_grandstand", (34, 42), True, False, [("front", (90, 170, 40), (0, 0, 18))], False),
    (build_istanbul_grandstand, "istanbul_grandstand", (50, 60), True, False, [("front", (90, 200, 35), (0, 0, 20))], False),
    (build_tuscan_hill, "tuscan_hill", (78, 90), True, False, [("front", (120, 460, 80), (0, -40, 40))], False),
    (build_finger_lakes, "finger_lakes", (110, 175), True, False, [("front", (0, 600, 160), (0, -600, 30))], False),
)

for build, name, top, uvs, colours, shots, night in MODELS:
    if ONLY and name not in ONLY:
        continue
    root = build()
    check(name, root, 40000, top)
    export(root, f"{name}.glb", uvs=uvs, colours=colours)
    preview(root, name, shots, night=night)
