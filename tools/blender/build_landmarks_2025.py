"""Build the landmarks of the 2025 calendar's other sixteen venues, and export
them to assets/landmarks/*.glb (docs/superpowers/specs/2026-10-01-landmarks-2025-design.md).

Run headless, so it never touches an open Blender session:

  F1_LANDMARKS_OUT=assets/landmarks Blender -b --factory-startup -P tools/blender/build_landmarks_2025.py

Set F1_LANDMARKS_PREVIEW=<dir> to also render each model there for review,
and F1_LANDMARKS_ONLY=name,name to build only some.

Real metres, the ground at z = 0, the front toward +Y (the side that faces
the circuit; glTF's -z). No logos, no trademarks, no text: the shapes are
from public photographs, used only as reference. The mesh kit is the one of
build_landmarks.py (Stage J), copied so the two scripts stay independent.

  melbourne_skyline.glb    Eureka Tower, Australia 108, the Rialto towers
  shanghai_grandstand.glb  the main grandstand and its two wing roofs
  jeddah_fountain.glb      King Fahd's Fountain, its jet and its platform
  miami_stadium.glb        the stadium bowl, its canopy and four masts
  hillside.glb             a spectator bank: a grass slope, terraces in it
  barcelona_grandstand.glb the main grandstand, two tiers, its trussed roof
  biosphere.glb            the Biosphere's double lattice on its plinth
  spielberg_bull.glb       the steel bull on its rock
  hugenholtz.glb           the bowl of terraces round the hairpin, its dune
  flame_towers.glb         Baku's three Flame Towers
  baku_old_city.glb        the old city's walls and the Maiden Tower
  cota_tower.glb           the Austin observation tower and its red veil
  foro_sol.glb             the stadium section's horseshoe of stands
  vegas_sphere.glb         the Sphere, its LED skin painted (vertex colours)
  vegas_strip.glb          a curved slab, a Y-plan tower, the needle tower
  losail_grandstand.glb    the floodlit main grandstand
  lusail_towers.glb        Lusail's twin crescent towers
  yas_hotel.glb            half the Yas hotel under its gridshell
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
    raise RuntimeError("build_landmarks_2025.py clears the scene, and this one has work in it. Use a new file, or set F1_BUILD_FORCE=1.")
scene = bpy.context.scene


# =============================================================================
# The mesh kit (as build_landmarks.py's)
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
    "bronze": ((0.22, 0.18, 0.15), 0.8, 0.38),
    "screen": ((1.0, 1.0, 1.0), 0.0, 0.5),
    "gridshell": ((0.82, 0.85, 0.9), 0.7, 0.3),
    "dark_glass": ((0.05, 0.07, 0.1), 0.4, 0.1),
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
# Albert Park: Melbourne's towers across the park
# =============================================================================

def build_melbourne():
    """Eureka Tower (297 m: blue glass, its top ten floors gold, a red stripe
    up the front), Australia 108 (317 m: a rounded plan, the gold starburst
    cantilevered at about 210 m, a slimmer shaft above to its crown) and the
    Rialto towers (251 and 185 m: blue-grey glass, saw-tooth tops)."""
    clear()
    root = empty("melbourne_skyline")
    # Eureka: a slim rectangle with its corners cut, the gold crown stepping
    # back to a sloping top.
    e = Mesh("eureka")
    plan = [(-20, -14), (18, -14), (21, -11), (21, 14), (-17, 14), (-20, 11)]
    facade_tower(e, plan, 0, 255, "facade_blue")
    e.prism([(x * 0.98, y * 0.98) for x, y in plan], 255, 284, "gold")
    # The crown's slope: higher at the back, the last floors stepping in.
    e.face([(-19.6, 13.7, 284), (20.6, 13.7, 284), (20.6, -13.7, 297), (-19.6, -13.7, 297)], "gold")
    e.face([(-19.6, 13.7, 284), (-19.6, -13.7, 284), (20.6, -13.7, 284), (20.6, 13.7, 284)], "gold")
    e.face([(-19.6, 13.7, 284), (-19.6, -13.7, 297), (-19.6, -13.7, 284)], "gold")
    e.face([(20.6, 13.7, 284), (20.6, -13.7, 284), (20.6, -13.7, 297)], "gold")
    e.face([(-19.6, -13.7, 284), (-19.6, -13.7, 297), (20.6, -13.7, 297), (20.6, -13.7, 284)], "gold")
    # The red stripe up the front, and the gold band at each tenth floor.
    e.box((-6.5, 13.9, 30), (-3.5, 14.6, 255), "red_stripe")
    for z in (85, 170):
        e.box((-20.3, -14.3, z), (21.3, 14.3, z + 1.2), "gold")
    e.finish(parent=root)
    # Australia 108: its rounded plan, curved faces.
    a = Mesh("australia108")
    cx = 70.0
    shaft = [(cx + 22 * math.cos(t) * (1 + 0.08 * math.cos(2 * t)), 18 * math.sin(t)) for t in [2 * math.pi * k / 28 for k in range(28)]]
    facade_tower(a, shaft, 0, 208, "facade")
    # The starburst: three gold floors cantilevered out to one side.
    burst = [(cx + 26 * math.cos(t) * (1 + 0.3 * max(0.0, math.cos(t - 0.3)) ** 2), 21 * math.sin(t) * (1 + 0.2 * max(0.0, math.cos(t - 0.3)))) for t in [2 * math.pi * k / 28 for k in range(28)]]
    a.prism(burst, 208, 220, "gold")
    upper = [(cx + (x - cx) * 0.78, y * 0.78) for x, y in shaft]
    facade_tower(a, upper, 220, 296, "facade")
    a.lathe([(0.0, 296), (13.5, 296), (12.0, 302), (8.0, 308), (3.0, 313), (0.0, 317)], (cx, 0), "gold", segs=16, smooth=False)
    a.finish(parent=root)
    # The Rialto: two towers side by side, their tops stepping in a saw-tooth.
    r = Mesh("rialto")
    for x0, x1, y0, y1, h, steps in ((-110, -74, -18, 16, 251, 4), (-72, -46, -12, 14, 185, 3)):
        top = h - 6 * steps
        facade_tower(r, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0, top, "facade_blue")
        w = (x1 - x0) / steps
        for k in range(steps):
            # Each tooth a little higher than the last.
            r.box((x0 + k * w, y0 + 1.0, top), (x0 + (k + 1) * w, y1 - 1.0, top + 6 * (k + 1)), "facade_blue")
        r.box((x0 - 0.5, y0 - 0.5, 0), (x1 + 0.5, y1 + 0.5, 9), "dark_glass")
    r.finish(parent=root)
    return root


# =============================================================================
# Shanghai: the main grandstand and its wings
# =============================================================================

def wing(m, sign):
    """One of the great roofs at the grandstand's ends: a leaf-shaped
    canopy rising from the stand's roof outward, its eaves upturned like a
    pagoda's, on raked columns."""
    nu, nv = 14, 10
    x0 = 132.0 * sign
    span = 48.0
    top = lambda u, v: 33.0 + 16.0 * u ** 1.8 + 5.0 * (abs(v - 0.5) * 2) ** 2.4 * (0.3 + u)
    # The leaf's plan: wide at the stand, narrowing to its tip, from the
    # stand's back (y -42) to past its front (y +20).
    def at(u, v):
        half = 36.0 * (1 - 0.55 * u ** 1.5)
        mid = -10.0 + 6.0 * u
        x = x0 + sign * span * u
        y = mid + (v - 0.5) * 2 * half
        return x, y
    upper = [[(*at(i / nu, k / nv), top(i / nu, k / nv)) for k in range(nv + 1)] for i in range(nu + 1)]
    lower = [[(x, y, z - 1.6 - 0.8 * (1 - i / nu)) for (x, y, z) in row] for i, row in enumerate(upper)]
    for i in range(nu):
        for k in range(nv):
            q = [upper[i][k], upper[i + 1][k], upper[i + 1][k + 1], upper[i][k + 1]]
            m.face(q if sign > 0 else list(reversed(q)), "roof_membrane")
            q = [lower[i][k + 1], lower[i + 1][k + 1], lower[i + 1][k], lower[i][k]]
            m.face(q if sign > 0 else list(reversed(q)), "white_steel")
    # Its rim: the edges joining top and underside, all round.
    edge = [(i, 0) for i in range(nu)] + [(nu, k) for k in range(nv)] + [(i, nv) for i in range(nu, 0, -1)] + [(0, k) for k in range(nv, 0, -1)]
    for (i, k), (i2, k2) in zip(edge, edge[1:] + edge[:1]):
        q = [upper[i][k], lower[i][k], lower[i2][k2], upper[i2][k2]]
        m.face(q if sign > 0 else list(reversed(q)), "white_steel")
    # Columns: raked steel legs from the ground up to its underside.
    for u, v in ((0.25, 0.15), (0.25, 0.85), (0.6, 0.3), (0.6, 0.7)):
        x, y = at(u, v)
        z = top(u, v) - 2.4
        tube(m, (x - sign * 8, y, 0), (x, y, z), 1.1, "white_steel", 8)


def build_shanghai():
    """The main grandstand along the pit straight (300 m): a raked bowl of
    seats under a roof, the back wall with its glazed boxes; at each end a
    great wing roof sweeping up to 52 m. The bridge building that crosses
    the track in life is left out (nothing stands over the track)."""
    clear()
    root = empty("shanghai_grandstand")
    s = Mesh("stand")
    L = 132.0
    rows = 24
    for k in range(rows):
        y1 = 14.0 - 2.0 * k
        z = 3.0 + 1.05 * (k + 1)
        s.box((-L, y1 - 2.0, 0), (L, y1, z), ("concrete", "crowd", "crowd", "seat", "crowd", "crowd")[k % 6], skip=("-z",))
    back = 14.0 - 2.0 * rows
    s.box((-L, back - 12.0, 0), (L, back, 30.0), "concrete", skip=("-z",))
    # The boxes: a band of glass along the back wall, over the top row.
    s.box((-L + 2, back - 0.4, 30.0), (L - 2, back + 0.2, 33.0), "glass")
    s.box((-L, 14.0, 0), (L, 16.0, 3.0), "concrete_dark")
    # The roof over the stand: flat, its front edge a white fascia.
    s.box((-L, back - 12.0, 33.0), (L, 16.0, 34.6), "roof_membrane")
    s.box((-L, 15.0, 32.2), (L, 16.4, 34.6), "white_steel")
    for k in range(13):
        x = -L + 4 + k * (2 * L - 8) / 12
        s.box((x - 0.6, back - 12.0, 0), (x + 0.6, back - 10.8, 33.0), "white_steel")
    s.finish(parent=root)
    for name, sign in (("wing_L", -1), ("wing_R", 1)):
        w = Mesh(name)
        wing(w, sign)
        w.finish(parent=root)
    return root


# =============================================================================
# Jeddah: King Fahd's Fountain
# =============================================================================

def build_fountain():
    """The jet, 260 m: a column widening as it climbs, a crown of spray, and
    the water falling back round it in a wider, softer plume, leaning a
    little downwind (+x); from a small platform on the sea."""
    clear()
    root = empty("jeddah_fountain")
    j = Mesh("jet")
    j.lathe([(0.0, 3.0), (1.2, 3.0), (1.6, 60), (2.4, 140), (3.6, 200), (5.5, 238), (8.0, 252), (6.0, 259), (0.0, 262)], (0, 0), "spray", segs=12)
    # The fall: a sheath of mist round the jet, widest where the water turns
    # at the top, drifting downwind (+x) as it falls back to the sea.
    fall = []
    for z, r, lean in ((4.0, 8.0, 30.0), (50, 11.0, 27.0), (120, 14.0, 20.0), (180, 15.5, 12.0), (225, 15.0, 6.0), (254, 10.0, 1.0)):
        fall.append([(lean * (z / 250) ** 0.5 + r * math.cos(2 * math.pi * i / 20) * (1.0 + 0.25 * math.cos(2 * math.pi * i / 20)), r * math.sin(2 * math.pi * i / 20) * 0.9, z) for i in range(20)])
    inner = [[(x * 0.92 + 0.0, y * 0.92, z + 1.5) for x, y, z in ring] for ring in fall]
    for r0, r1 in zip(fall, fall[1:]):
        for i in range(20):
            k = (i + 1) % 20
            j.face((r0[i], r0[k], r1[k], r1[i]), "mist")
    for r0, r1 in zip(inner, inner[1:]):
        for i in range(20):
            k = (i + 1) % 20
            j.face((r1[i], r1[k], r0[k], r0[i]), "mist")
    for a, b in ((fall[-1], inner[-1]), (inner[0], fall[0])):
        for i in range(20):
            k = (i + 1) % 20
            j.face((a[i], a[k], b[k], b[i]), "mist")
    j.finish(parent=root)
    p = Mesh("platform")
    p.prism([(math.cos(2 * math.pi * k / 8) * 11, math.sin(2 * math.pi * k / 8) * 11) for k in range(8)], 0, 2.5, "concrete")
    p.prism([(math.cos(2 * math.pi * k / 8) * 4, math.sin(2 * math.pi * k / 8) * 4) for k in range(8)], 2.5, 4.0, "concrete_dark")
    p.finish(parent=root)
    return root


# =============================================================================
# Miami: the stadium
# =============================================================================

def build_miami_stadium():
    """The stadium the circuit runs round: an oval bowl (about 280 by 235 m)
    of seats stepping up from the field to the rim at 38 m, the outer wall
    ribbed; the canopy ring over the upper seats at 45 m; four masts at the
    corners rising to 90 m, cables down to the canopy."""
    clear()
    root = empty("miami_stadium")
    b = Mesh("bowl")
    n = 56
    A, B = 140.0, 117.0
    a0, b0 = 66.0, 43.0

    def ring(f, z):
        """A ring at fraction f from the field's edge (0) to the rim (1)."""
        a = a0 + (A - a0) * f
        bb = b0 + (B - b0) * f
        return [(math.cos(2 * math.pi * k / n) * a, math.sin(2 * math.pi * k / n) * bb, z) for k in range(n)]

    rows = [ring(0.0, 0.0), ring(0.0, 2.0)]
    steps = 14
    for k in range(steps):
        f0 = k / steps
        f1 = (k + 1) / steps
        z = 2.0 + 36.0 * (k + 1) / steps
        rows.append(ring(f0, z))
        rows.append(ring(f1, z))
    rows.append(ring(1.0, 0.0))
    # Faces between the rows, outward (the field side faces in).
    for r, (r0, r1) in enumerate(zip(rows, rows[1:])):
        # Treads (seats) and risers (the fans in front of them) in turn.
        role = ("seat" if r % 2 == 0 else "crowd") if 2 <= r < len(rows) - 2 else "concrete"
        if r == len(rows) - 2:
            role = "concrete"
        for k in range(n):
            j = (k + 1) % n
            b.face((r0[k], r0[j], r1[j], r1[k]), role)
    # The ribs round the outer wall.
    for k in range(0, n, 2):
        t = 2 * math.pi * k / n
        x, y = math.cos(t) * (A + 0.8), math.sin(t) * (B + 0.8)
        rot = Matrix.Rotation(math.atan2(y / (B * B), x / (A * A)), 3, "Z")
        b.box((x - 0.8, y - 1.0, 0), (x + 0.8, y + 1.0, 39.0), "white_steel", rot=rot, about=(x, y, 0))
    b.prism([(math.cos(2 * math.pi * k / n) * (a0 - 0.5), math.sin(2 * math.pi * k / n) * (b0 - 0.5)) for k in range(n)], 0.0, 0.3, "grass")
    b.finish(parent=root)
    # The canopy: a sloping ring of roof over the upper seats.
    c = Mesh("canopy")
    outer = [(math.cos(2 * math.pi * k / n) * (A + 2), math.sin(2 * math.pi * k / n) * (B + 2)) for k in range(n)]
    inner = [(math.cos(2 * math.pi * k / n) * (A - 44), math.sin(2 * math.pi * k / n) * (B - 44)) for k in range(n)]
    for k in range(n):
        j = (k + 1) % n
        (ox, oy), (ox2, oy2), (ix, iy), (ix2, iy2) = outer[k], outer[j], inner[k], inner[j]
        c.face(((ox, oy, 46.0), (ox2, oy2, 46.0), (ix2, iy2, 44.0), (ix, iy, 44.0)), "roof_membrane")
        c.face(((ix, iy, 42.5), (ix2, iy2, 42.5), (ox2, oy2, 44.0), (ox, oy, 44.0)), "white_steel")
        c.face(((ox, oy, 44.0), (ox2, oy2, 44.0), (ox2, oy2, 46.0), (ox, oy, 46.0)), "white_steel")
        c.face(((ix2, iy2, 42.5), (ix, iy, 42.5), (ix, iy, 44.0), (ix2, iy2, 44.0)), "white_steel")
    # Its legs down to the rim.
    for k in range(0, n, 4):
        ox, oy = outer[k]
        tube(c, (ox * 0.99, oy * 0.99, 38.0), (ox * 0.99, oy * 0.99, 44.0), 0.7, "white_steel", 6)
    c.finish(parent=root)
    # The four masts at the corners, and their cables.
    mm = Mesh("masts")
    for qx, qy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        t = math.atan2(qy * B, qx * A)
        bx, by = math.cos(t) * (A + 14), math.sin(t) * (B + 14)
        top = (bx * 0.97, by * 0.97, 90.0)
        tube(mm, (bx, by, 0), top, 2.2, "white_steel", 8)
        for d in (-0.32, -0.16, 0.0, 0.16, 0.32):
            ix, iy = math.cos(t + d) * (A - 30), math.sin(t + d) * (B - 30)
            tube(mm, top, (ix, iy, 44.6), 0.25, "steel", 4)
        mm.lathe([(0.0, 90.0), (2.6, 90.0), (0.0, 94.0)], (top[0], top[1]), "white_steel", segs=8)
    mm.finish(parent=root)
    return root


# =============================================================================
# The spectator bank (Imola's Tosa, the Hungaroring, Spielberg, Austin's Turn 1)
# =============================================================================

HILL_H = 24.0


def hill_height(x, y):
    """The bank: its face rising from the front (y +10) to its crest (y -40),
    falling away behind; its ends rounded down to the ground."""
    fall_x = smooth((110 - abs(x)) / 40)
    t = (10 - y) / 50
    face = smooth(t) if t <= 1 else max(0.0, 1 - (t - 1) * 1.6)
    return HILL_H * face * fall_x


def build_hillside():
    """A long grass bank (220 m) with concrete terraces stepped into its
    face over the middle 140 m, a fence along its foot, a path along the
    crest, a few trees on top."""
    clear()
    root = empty("hillside")
    s = Mesh("slope")
    s.upward = True
    xs = [-110 + 220 * i / 36 for i in range(37)]
    ys = [12 - 84 * k / 18 for k in range(19)]
    grid = [[(x, y, hill_height(x, y)) for y in ys] for x in xs]
    for i in range(len(xs) - 1):
        for k in range(len(ys) - 1):
            s.face((grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1]), "grass")
    s.finish(parent=root)
    t = Mesh("terraces")
    for k in range(11):
        y = 6 - k * 3.6
        z = hill_height(0, y - 1.8)
        # A narrow concrete step at the front of each grass ledge.
        t.box((-70, y - 1.0, max(0.0, z - 2.0)), (70, y, z + 0.35), "concrete" if k % 2 else "concrete_dark")
        # Fans along the ledge, on the grass behind the step.
        t.box((-68, y - 2.6, z + 0.2), (68, y - 1.4, z + 1.6), "crowd")
        # A bench rail along each terrace.
        t.box((-69, y - 0.6, z + 0.35), (69, y - 0.3, z + 1.0), "steel")
    for x in (-70, -35, 0, 35, 70):
        for k in range(22):
            y = 6 - k * 1.8
            z = hill_height(0, y)
            t.box((x - 1.2, y - 1.8, max(0.0, z - 1.0)), (x + 1.2, y, z + 0.5), "concrete")
    # The fence along the foot and the path along the crest.
    for k in range(45):
        x = -108 + k * 216 / 44
        t.box((x - 0.08, 11.6, 0), (x + 0.08, 11.8, 2.6), "steel")
    t.box((-108, 11.6, 2.4), (108, 11.8, 2.6), "steel")
    t.box((-80, -41, HILL_H - 0.2), (80, -37, HILL_H + 0.25), "concrete_dark")
    t.finish(parent=root)
    tr = Mesh("trees")
    for k, x in enumerate((-95, -82, -64, -50, -22, -8, 18, 36, 58, 77, 92)):
        y = -48 - (k % 3) * 6
        z = hill_height(x, y)
        tr.lathe([(0.0, z), (0.4, z), (0.4, z + 3), (4.5, z + 4), (4.0, z + 8), (2.2, z + 11), (0.0, z + 12.5)], (x, y), "planting", segs=7, smooth=False)
    tr.finish(parent=root)
    return root


# =============================================================================
# Barcelona: the main grandstand
# =============================================================================

def build_barcelona_grandstand():
    """The main grandstand opposite the pits: 240 m, a lower tier rising to
    a concourse with its openings, an upper tier above, the back wall, and a
    roof cantilevered toward the track from steel trusses standing on it."""
    clear()
    root = empty("barcelona_grandstand")
    s = Mesh("stand")
    L = 120.0
    for k in range(16):
        y1 = 14.0 - 1.4 * k
        s.box((-L, y1 - 1.4, 0), (L, y1, 2.0 + 0.62 * (k + 1)), ("concrete", "crowd", "crowd", "seat", "crowd")[k % 5], skip=("-z",))
    s.box((-L, -10.4, 0), (L, -8.4, 14.0), "concrete", skip=("-z",))
    for k in range(20):
        x = -L + 6 + k * (2 * L - 12) / 19
        s.box((x - 2, -8.5, 11.0), (x + 2, -8.3, 13.6), "glass")
    for k in range(13):
        y1 = -10.4 - 1.5 * k
        s.box((-L, y1 - 1.5, 0), (L, y1, 14.6 + 0.8 * (k + 1)), ("concrete", "crowd", "seat", "crowd")[k % 4], skip=("-z",))
    s.box((-L, -34.0, 0), (L, -29.9, 27.0), "concrete", skip=("-z",))
    s.box((-L - 1, -34, 0), (-L, 15, 2.6), "concrete_dark")
    s.box((L, -34, 0), (L + 1, 15, 2.6), "concrete_dark")
    s.finish(parent=root)
    r = Mesh("roof")
    # The deck: from the back wall's top out over the seats, falling a little.
    r.face([(-L - 2, -34.0, 30.0), (-L - 2, 12.0, 27.6), (L + 2, 12.0, 27.6), (L + 2, -34.0, 30.0)], "roof_membrane")
    r.face([(L + 2, -34.0, 29.2), (L + 2, 12.0, 26.8), (-L - 2, 12.0, 26.8), (-L - 2, -34.0, 29.2)], "white_steel")
    r.face([(-L - 2, 12.0, 26.8), (L + 2, 12.0, 26.8), (L + 2, 12.0, 27.6), (-L - 2, 12.0, 27.6)], "white_steel")
    r.face([(L + 2, -34.0, 29.2), (-L - 2, -34.0, 29.2), (-L - 2, -34.0, 30.0), (L + 2, -34.0, 30.0)], "white_steel")
    r.face([(-L - 2, -34.0, 29.2), (-L - 2, 12.0, 26.8), (-L - 2, 12.0, 27.6), (-L - 2, -34.0, 30.0)], "white_steel")
    r.face([(L + 2, 12.0, 26.8), (L + 2, -34.0, 29.2), (L + 2, -34.0, 30.0), (L + 2, 12.0, 27.6)], "white_steel")
    # Trusses on top, every 20 m: a triangle of steel from a mast at the
    # back over the deck, its bars between.
    for k in range(13):
        x = -L + k * 20
        mast = (x, -33.0, 33.0)
        tip = (x, 11.0, 28.0)
        foot = (x, -33.0, 30.0)
        tube(r, (x, -33.0, 0.0), mast, 0.5, "steel", 6)
        tube(r, mast, tip, 0.3, "steel", 5)
        for f in (0.25, 0.5, 0.75):
            p = (x, -33.0 + 44 * f, 33.0 - 5.0 * f)
            q = (x, -33.0 + 44 * f, 30.0 - 2.4 * f + 0.1)
            tube(r, p, q, 0.18, "steel", 4)
        tube(r, foot, tip, 0.2, "steel", 4)
    r.finish(parent=root)
    return root


# =============================================================================
# Montreal: the Biosphere
# =============================================================================

def build_biosphere():
    """76 m across, cut at 62 m: a double-layer geodesic lattice (triangles
    outside, the hexagons of its dual inside), on a ring
    plinth, the museum's floors inside it."""
    clear()
    root = empty("biosphere")
    R = 38.0
    cz = 62.0 - R
    ico = bmesh.new()
    bmesh.ops.create_icosphere(ico, subdivisions=4, radius=1.0)
    ico.verts.ensure_lookup_table()
    ico.faces.ensure_lookup_table()
    cut = 0.6
    lat = Mesh("lattice")

    def clip(a, b):
        """A bar from a to b, cut at the plinth (None if all below)."""
        if a.z < cut and b.z < cut:
            return None
        if a.z < cut:
            a = a + (b - a) * ((cut - a.z) / (b.z - a.z))
        if b.z < cut:
            b = b + (a - b) * ((cut - b.z) / (a.z - b.z))
        return a, b

    centre = Vector((0, 0, cz))
    for e in ico.edges:
        a = centre + e.verts[0].co * R
        b = centre + e.verts[1].co * R
        c = clip(a, b)
        if c:
            tube(lat, c[0], c[1], 0.34, "white_steel", 3)
    # The inner hexagons: bars between neighbouring faces' centres, 2 m in
    # (a coarser sphere's, so the model stays light to download).
    ico.free()
    ico = bmesh.new()
    bmesh.ops.create_icosphere(ico, subdivisions=3, radius=1.0)
    mids = {f.index: centre + f.calc_center_median().normalized() * (R - 2.0) for f in ico.faces}
    for e in ico.edges:
        fs = e.link_faces
        if len(fs) == 2:
            c = clip(mids[fs[0].index], mids[fs[1].index])
            if c:
                tube(lat, c[0], c[1], 0.26, "steel", 3)
    lat.finish(parent=root)
    ico.free()
    p = Mesh("plinth")
    ringR = math.sqrt(R * R - (cz - cut) ** 2)
    p.lathe([(ringR + 3.0, 0.0), (ringR + 3.0, 1.2), (ringR - 4.0, 1.2), (ringR - 4.0, 0.0)], (0, 0), "concrete", segs=40, smooth=False)
    p.finish(parent=root)
    inner = Mesh("museum")
    for z, w in ((0, 22), (9, 18), (17, 14)):
        inner.box((-w, -w * 0.7, z), (w, w * 0.7, z + 5.5), "concrete")
        inner.box((-w - 0.1, -w * 0.7 - 0.1, z + 2.0), (w + 0.1, w * 0.7 + 0.1, z + 4.8), "glass")
    inner.finish(parent=root)
    return root


# =============================================================================
# Spielberg: the steel bull
# =============================================================================

def cone(m, a, b, r0, r1, role, sides=8):
    """A tapering bar from a (radius r0) to b (r1), closed at its ends."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(side).normalized()
    v = d.cross(u)
    ra = [a + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r0 for k in range(sides)]
    rb = [b + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r1 for k in range(sides)]
    for k in range(sides):
        j = (k + 1) % sides
        m.face((ra[k], ra[j], rb[j], rb[k]), role)
    m.face(list(reversed(ra)), role)
    m.face(rb, role)


# The bull's body, tail to muzzle: (x, centre height, half-width, half-height).
BULL_BODY = [
    (-6.8, 7.3, 0.9, 1.1), (-6.2, 7.3, 1.6, 1.9), (-4.8, 7.1, 1.95, 2.2), (-2.4, 6.9, 2.0, 2.3),
    (0.0, 7.1, 2.1, 2.5), (1.8, 7.5, 2.05, 2.9), (3.2, 7.0, 1.8, 2.7), (4.4, 6.1, 1.45, 2.0),
    (5.4, 5.2, 1.15, 1.6), (6.4, 4.5, 1.0, 1.3), (7.3, 3.9, 0.85, 0.9), (7.8, 3.6, 0.55, 0.55),
]


def build_bull():
    """A charging bull, about 14 m long: its head down and horns forward and
    up, the hump of its shoulders high over a deep chest, tail raised,
    forelegs braced and hind legs driving; in dark steel, faceted like the
    plates of the real sculpture (a body lofted through its sections, the
    legs and horns tapering bars); on a rough rock plinth. Generic: no mark."""
    clear()
    root = empty("spielberg_bull")
    k = 0.85
    base = 1.6
    at = lambda x, y, z: (x * k, y * k, z * k + base)
    m = Mesh("bull")
    n = 14
    rings = []
    for x, cz, hw, hh in BULL_BODY:
        ring = []
        for i in range(n):
            t = 2 * math.pi * i / n
            c, sn = math.cos(t), math.sin(t)
            # A rounded box section, flatter on the back.
            yy = hw * math.copysign(abs(c) ** 0.7, c)
            zz = hh * math.copysign(abs(sn) ** 0.8, sn) * (0.9 if sn > 0 else 1.0)
            ring.append(at(x, yy, cz + zz))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            m.face((r0[i], r0[j], r1[j], r1[i]), "bronze")
    m.face(list(reversed(rings[0])), "bronze")
    m.face(rings[-1], "bronze")
    for side in (1, -1):
        # Forelegs braced forward, hind legs driving back.
        cone(m, at(2.6, side * 1.3, 5.6), at(3.5, side * 1.45, 3.0), 1.05 * k, 0.75 * k, "bronze")
        cone(m, at(3.5, side * 1.45, 3.0), at(4.6, side * 1.5, 0.35), 0.72 * k, 0.5 * k, "bronze")
        cone(m, at(-4.7, side * 1.35, 6.6), at(-4.1, side * 1.5, 3.6), 1.5 * k, 0.85 * k, "bronze")
        cone(m, at(-4.1, side * 1.5, 3.6), at(-6.3, side * 1.55, 0.35), 0.8 * k, 0.48 * k, "bronze")
        # The horns, out and then forward and up.
        cone(m, at(6.5, side * 0.8, 5.3), at(7.0, side * 2.3, 5.8), 0.42 * k, 0.32 * k, "bronze", 6)
        cone(m, at(7.0, side * 2.3, 5.8), at(7.9, side * 2.7, 7.0), 0.32 * k, 0.08 * k, "bronze", 6)
    cone(m, at(-6.6, 0, 7.8), at(-8.0, 0, 9.4), 0.32 * k, 0.2 * k, "bronze", 6)
    cone(m, at(-8.0, 0, 9.4), at(-8.6, 0, 10.4), 0.2 * k, 0.12 * k, "bronze", 6)
    m.finish(parent=root)
    p = Mesh("plinth")
    rock = []
    for i in range(14):
        t = 2 * math.pi * i / 14
        r = 1.0 + 0.08 * math.sin(3 * t) + 0.05 * math.cos(5 * t)
        rock.append((math.cos(t) * 9.0 * r, math.sin(t) * 4.2 * r))
    p.prism(rock, 0.0, base, "stone_dark")
    p.finish(parent=root)
    return root


# =============================================================================
# Zandvoort: the Hugenholtz bowl
# =============================================================================

def build_hugenholtz():
    """The bowl of terraces round the outside of the hairpin: concrete steps
    with orange benches following the curve, a dune behind them with marram
    grass, its crest above the top row. In six pieces along the arc
    (terraces_k, dune_k), so the game claims the ground piece by piece and
    the hairpin sits inside the curve."""
    clear()
    root = empty("hugenholtz")
    terr = empty("terraces", parent=root)
    dunes = empty("dune", parent=root)
    C = Vector((0.0, 44.0))
    r_in, rows, tread, rise = 34.0, 10, 1.6, 1.0
    span = math.radians(52)
    pieces, per = 6, 5
    pt = lambda a, r: (C.x + math.sin(a) * r, C.y - math.cos(a) * r)
    r_top = r_in + tread * rows
    prof = [(0.0, 1.0), (2.5, 1.0 + rise * rows + 0.6), (6.0, 1.0 + rise * rows + 2.5), (11.0, 13.0), (19.0, 0.0)]
    for pc in range(pieces):
        a_lo = -span + 2 * span * pc / pieces
        a_hi = -span + 2 * span * (pc + 1) / pieces
        angles = [a_lo + (a_hi - a_lo) * i / per for i in range(per + 1)]
        t = Mesh(f"terraces_{pc}")
        for k in range(rows):
            r0 = r_in + tread * k
            r1 = r0 + tread
            z = 1.2 + rise * (k + 1)
            role = "concrete" if k % 4 == 0 else "seat_orange"
            for a0, a1 in zip(angles, angles[1:]):
                p0, p1, p2, p3 = pt(a0, r0), pt(a1, r0), pt(a1, r1), pt(a0, r1)
                t.face([(*p3, z), (*p2, z), (*p1, z), (*p0, z)], role)
                t.face([(*p0, z), (*p1, z), (*p1, z - rise if k else 0), (*p0, z - rise if k else 0)], "concrete" if k % 4 == 0 else "crowd")
            if k == rows - 1:
                for a0, a1 in zip(angles, angles[1:]):
                    p2, p3 = pt(a1, r1), pt(a0, r1)
                    t.face([(*p3, 0), (*p2, 0), (*p2, z), (*p3, z)], "concrete")
            for side, a in ((-1, angles[0]), (1, angles[-1])):
                p0, p3 = pt(a, r0), pt(a, r1)
                q = [(*p0, 0), (*p3, 0), (*p3, z), (*p0, z)]
                t.face(q if side > 0 else list(reversed(q)), "concrete")
        for a in angles[:-1]:
            x, y = pt(a, r_in - 0.3)
            t.box((x - 0.06, y - 0.06, 0), (x + 0.06, y + 0.06, 2.3), "steel")
        t.finish(parent=terr)
        d = Mesh(f"dune_{pc}")
        d.upward = True
        dangles = [a_lo + (a_hi - a_lo) * i / per for i in range(per + 1)]
        rings = [[(*pt(a, r_top + dr), z) for a in dangles] for dr, z in prof]
        for r0, r1 in zip(rings, rings[1:]):
            for i in range(per):
                d.face((r0[i + 1], r0[i], r1[i], r1[i + 1]), "sand")
        for idx in (0, per):
            side = [row[idx] for row in rings]
            d.face(side if idx == 0 else list(reversed(side)), "sand")
        d.finish(parent=dunes)
    g = Mesh("marram")
    for i in range(40):
        a = -span + 2 * span * ((i * 0.618) % 1.0)
        dr = 4 + (i * 7.3) % 8
        x, y = pt(a, r_top + dr)
        z = min(13.0, 1.0 + rise * rows + 2.5 if dr < 11 else 13.0 * (1 - (dr - 11) / 8))
        g.lathe([(0.0, z - 0.4), (1.2, z - 0.4), (1.6, z + 0.4), (0.0, z + 1.6)], (x, y), "grass", segs=5, smooth=False)
    g.finish(parent=dunes)
    return root


# =============================================================================
# Baku: the Flame Towers, the old city
# =============================================================================

def flame(m, cx, cy, R, H, turn):
    """A Flame Tower: a curved, flame-shaped plan (a rounded triangle, one
    corner drawn out), the shaft rising straight, then the plan shrinking
    and its centre drifting toward the drawn-out corner to a curved tip."""
    n = 30
    rings = []
    levels = [H * (k / 26) ** 0.9 for k in range(27)]
    for z in levels:
        t = z / H
        s = 1.0 if t < 0.45 else max(0.03, (1 - ((t - 0.45) / 0.55) ** 1.4)) ** 0.75
        drift = R * 0.5 * max(0.0, (t - 0.45) / 0.55) ** 1.6
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            r = R * (1.0 + 0.16 * math.cos(3 * a) + 0.22 * max(0.0, math.cos(a)) ** 3)
            x, y = math.cos(a) * r * s + drift, math.sin(a) * r * s * 0.86
            c, sn = math.cos(turn), math.sin(turn)
            ring.append((cx + x * c - y * sn, cy + x * sn + y * c, z))
        rings.append(ring)
    m.loft(rings, "facade_blue", cap_top=False)
    tip = rings[-1]
    mx = sum(p[0] for p in tip) / n
    my = sum(p[1] for p in tip) / n
    for i in range(n):
        j = (i + 1) % n
        m.face((tip[i], tip[j], (mx, my, H + 0.5)), "facade_blue")


def build_flame_towers():
    """Three towers on the hill above the boulevard: 182, 165 and 152 m, in
    a triangle, their glass faces curving up to the flames' tips."""
    clear()
    root = empty("flame_towers")
    for name, cx, cy, R, H, turn in (("flame_1", 0.0, -30.0, 24.0, 182.0, math.radians(100)),
                                     ("flame_2", -58.0, 8.0, 21.0, 165.0, math.radians(140)),
                                     ("flame_3", 56.0, 6.0, 20.0, 152.0, math.radians(60))):
        m = Mesh(name)
        flame(m, cx, cy, R, H, turn)
        m.box((cx - R * 1.2, cy - R * 1.1, 0), (cx + R * 1.2, cy + R * 1.1, 6.0), "stone")
        m.finish(parent=root)
    return root


def crenellate(m, x0, x1, y0, y1, z, every=2.4):
    """Merlons along a wall top from x0 to x1 (between y0 and y1)."""
    k = int((x1 - x0) / every)
    for i in range(k):
        x = x0 + (i + 0.25) * (x1 - x0) / k
        m.box((x, y0, z), (x + every * 0.5, y1, z + 1.5), "stone")


def build_old_city():
    """The old city's walls along the circuit (220 m): stone, crenellated,
    round towers every 40 m, the double gate; and behind them the Maiden
    Tower (29.5 m, 16.5 m across) with its buttress and slit windows."""
    clear()
    root = empty("baku_old_city")
    w = Mesh("walls")
    L = 110.0
    w.box((-L, -2.5, 0), (L, 2.5, 9.0), "stone_dark", skip=("-z",))
    w.box((-L, -2.0, 9.0), (L, 2.0, 9.3), "stone")
    crenellate(w, -L, L, 1.4, 2.6, 9.0)
    crenellate(w, -L, L, -2.6, -1.4, 9.0)
    for x in (-L, -70.0, -30.0, 30.0, 70.0, L):
        w.lathe([(6.0, 0.0), (5.6, 9.0), (5.6, 11.2), (6.2, 11.4), (6.2, 11.6)], (x, 1.0), "stone_dark", segs=16, smooth=False)
        w.face([(x + math.cos(2 * math.pi * i / 16) * 6.2, 1.0 + math.sin(2 * math.pi * i / 16) * 6.2, 11.6) for i in range(16)], "stone")
        for i in range(10):
            a = 2 * math.pi * i / 10
            c, s = math.cos(a), math.sin(a)
            w.box((x + c * 5.6 - 0.6, 1.0 + s * 5.6 - 0.6, 11.6), (x + c * 5.6 + 0.6, 1.0 + s * 5.6 + 0.6, 13.0), "stone")
    # The double gate: its two arches in a raised gatehouse.
    w.box((-8.0, -3.5, 0), (8.0, 3.5, 13.0), "stone", skip=("-z",))
    crenellate(w, -8.0, 8.0, 2.4, 3.6, 13.0, every=2.0)
    for gx in (-6.0, 1.0):
        slab_xz(w, [(gx, 0.0), (gx + 5.0, 0.0), (gx + 5.0, 5.0), (gx + 4.3, 6.6), (gx + 2.5, 7.4), (gx + 0.7, 6.6), (gx, 5.0)], 3.45, 3.62, "gear")
    w.finish(parent=root)
    t = Mesh("maiden_tower")
    cy = -42.0
    t.lathe([(8.25, 0.0), (8.1, 27.0), (8.25, 27.2), (8.25, 29.5), (0.0, 29.5)], (0.0, cy), "stone", segs=24, smooth=False)
    # The buttress: a wedge standing out of one side, full height.
    t.prism([(6.0, cy - 4.5), (14.5, cy - 2.4), (14.5, cy + 2.4), (6.0, cy + 4.5)], 0.0, 27.5, "stone")
    for z in (6.0, 12.0, 18.0, 24.0):
        for a in (math.radians(70), math.radians(110), math.radians(200)):
            x, y = math.cos(a) * 8.15, cy + math.sin(a) * 8.15
            t.box((x - 0.35, y - 0.35, z), (x + 0.35, y + 0.35, z + 1.6), "gear")
    t.finish(parent=root)
    return root


# =============================================================================
# Austin: the observation tower
# =============================================================================

def build_cota_tower():
    """77 m: the core (lift and stairs) rising to the observation deck at
    70 m, its glass band and roof; eighteen red steel tubes falling from the
    top in a veil, flaring out to the ground on the stage side (-Y)."""
    clear()
    root = empty("cota_tower")
    c = Mesh("core")
    c.lathe([(4.2, 0.0), (3.6, 68.0), (0.0, 68.0)], (0, 0), "white_steel", segs=16, smooth=False)
    c.box((-3.0, 3.4, 2.0), (-1.0, 4.4, 67.0), "glass")
    c.box((-9.0, -6.0, 0), (9.0, 6.0, 4.0), "concrete")
    c.finish(parent=root)
    d = Mesh("deck")
    d.lathe([(0.0, 68.0), (5.0, 68.0), (11.5, 68.6), (12.0, 69.4), (12.0, 69.6), (0.0, 69.6)], (0, 0), "white_steel", segs=24, smooth=False)
    d.lathe([(0.0, 69.6), (11.6, 69.6), (11.6, 73.2), (0.0, 73.2)], (0, 0), "glass", segs=24, smooth=False)
    d.lathe([(0.0, 73.2), (12.6, 73.2), (12.6, 74.0), (2.0, 75.6), (0.6, 77.0), (0.0, 77.0)], (0, 0), "white_steel", segs=24, smooth=False)
    d.finish(parent=root)
    v = Mesh("veil")
    for i in range(18):
        a = math.radians(-160 + 140 * i / 17)
        pts = []
        for k in range(13):
            s = k / 12
            r = 12.5 + 34.0 * s ** 1.4 + 6.0 * math.sin(math.pi * s)
            z = 76.0 * (1 - s) ** 1.15
            pts.append((math.cos(a) * r, math.sin(a) * r, max(0.0, z)))
        polyline(v, pts, 0.42, "red_steel", 6)
    v.finish(parent=root)
    return root


# =============================================================================
# Mexico City: the stadium section
# =============================================================================

def build_foro_sol():
    """The horseshoe of stands round the stadium section: steep rows on an
    arc (inner radius 64 m), rising to 30 m, a canopy over the top rows, and
    four floodlight towers behind."""
    clear()
    root = empty("foro_sol")
    C = Vector((0.0, 74.0))
    r_in, rows, tread, rise = 64.0, 22, 1.9, 1.25
    span = math.radians(78)
    n = 32
    s = Mesh("stands")
    angles = [-span + 2 * span * i / n for i in range(n + 1)]
    pt = lambda a, r: (C.x + math.sin(a) * r, C.y - math.cos(a) * r)
    for k in range(rows):
        r0 = r_in + tread * k
        r1 = r0 + tread
        z = 2.0 + rise * (k + 1)
        role = "concrete" if k in (0, 11) else "seat"
        for a0, a1 in zip(angles, angles[1:]):
            p0, p1, p2, p3 = pt(a0, r0), pt(a1, r0), pt(a1, r1), pt(a0, r1)
            s.face([(*p3, z), (*p2, z), (*p1, z), (*p0, z)], role)
            s.face([(*p0, z), (*p1, z), (*p1, z - rise if k else 0), (*p0, z - rise if k else 0)], "concrete" if k in (0, 11) else "crowd")
    r_out = r_in + tread * rows
    top = 2.0 + rise * rows
    for a0, a1 in zip(angles, angles[1:]):
        p2, p3 = pt(a1, r_out), pt(a0, r_out)
        s.face([(*p3, 0), (*p2, 0), (*p2, top + 1.5), (*p3, top + 1.5)], "concrete")
        p0, p1 = pt(a0, r_out - 0.6), pt(a1, r_out - 0.6)
        s.face([(*p0, top), (*p1, top), (*p1, top + 1.5), (*p0, top + 1.5)], "concrete")
        s.face([(*p3, top + 1.5), (*p2, top + 1.5), (*p1, top + 1.5), (*p0, top + 1.5)], "concrete")
    for k in range(rows):
        r0 = r_in + tread * k
        z = 2.0 + rise * (k + 1)
        for sign, a in ((-1, angles[0]), (1, angles[-1])):
            p0, p3 = pt(a, r0), pt(a, r0 + tread)
            q = [(*p0, 0), (*p3, 0), (*p3, z), (*p0, z)]
            s.face(q if sign > 0 else list(reversed(q)), "concrete")
    s.finish(parent=root)
    # The canopy over the top rows, on posts.
    c = Mesh("canopy")
    for a0, a1 in zip(angles, angles[1:]):
        p0, p1 = pt(a0, r_out - 16), pt(a1, r_out - 16)
        p2, p3 = pt(a1, r_out + 1), pt(a0, r_out + 1)
        c.face([(*p0, top + 9), (*p1, top + 9), (*p2, top + 11), (*p3, top + 11)], "roof_membrane")
        c.face([(*p3, top + 10.2), (*p2, top + 10.2), (*p1, top + 8.2), (*p0, top + 8.2)], "white_steel")
        c.face([(*p3, top + 10.2), (*p3, top + 11), (*p2, top + 11), (*p2, top + 10.2)], "white_steel")
        c.face([(*p0, top + 8.2), (*p1, top + 8.2), (*p1, top + 9), (*p0, top + 9)], "white_steel")
    for side, a in ((-1, angles[0]), (1, angles[-1])):
        p0, p3 = pt(a, r_out - 16), pt(a, r_out + 1)
        q = [(*p0, top + 8.2), (*p3, top + 10.2), (*p3, top + 11), (*p0, top + 9)]
        c.face(q if side < 0 else list(reversed(q)), "white_steel")
    for a in angles[::4]:
        x, y = pt(a, r_out - 0.3)
        tube(c, (x, y, top + 1.5), (x, y, top + 10.3), 0.4, "white_steel", 6)
    c.finish(parent=root)
    li = Mesh("lights")
    for a in (-span * 0.9, -span * 0.3, span * 0.3, span * 0.9):
        x, y = pt(a, r_out + 8)
        tube(li, (x, y, 0), (x, y, 50.0), 1.0, "steel", 8)
        hx, hy = pt(a, r_out + 7)
        li.box((hx - 5, hy - 1.0, 46.0), (hx + 5, hy + 1.0, 51.0), "window_lit", rot=Matrix.Rotation(-a, 3, "Z"), about=(hx, hy, 48))
    li.finish(parent=root)
    return root


# =============================================================================
# Las Vegas: the Sphere and the Strip
# =============================================================================

def planet(v):
    """The image on the Sphere: a planet in space, its oceans and lands under
    swirling cloud (an abstract image of its own, no mark)."""
    c = Vector((v.x, v.y, v.z - SPHERE_CZ)).normalized()
    # The globe faces the circuit (+Y), a little turned and tilted.
    g = Matrix.Rotation(0.35, 3, "X") @ Matrix.Rotation(-0.5, 3, "Z") @ c
    land = (math.sin(3.1 * g.x + 1.3) * math.sin(2.7 * g.y + 0.4) * math.sin(3.4 * g.z + 2.1)
            + 0.45 * math.sin(6.3 * g.x - 1.1) * math.sin(5.8 * g.z + 0.7) + 0.25 * math.sin(9.1 * g.y + 2.4))
    cloud = 0.5 + 0.5 * math.sin(4.0 * g.z + 2.0 * math.sin(3.0 * g.x + 1.5 * g.y))
    ocean = Vector((0.02, 0.12, 0.42)).lerp(Vector((0.05, 0.3, 0.62)), max(0.0, min(1.0, land + 0.6)))
    ground = Vector((0.22, 0.42, 0.18)).lerp(Vector((0.62, 0.52, 0.32)), max(0.0, min(1.0, (land - 0.2) * 2.5)))
    # Soft edges everywhere: the screen is sampled at its vertices.
    col = ocean.lerp(ground, smooth((land - 0.05) / 0.35))
    col = col.lerp(Vector((0.92, 0.95, 1.0)), smooth((abs(g.z) - 0.8) / 0.15))
    col = col.lerp(Vector((0.95, 0.96, 1.0)), smooth((cloud - 0.62) / 0.3) * 0.85)
    # The limb darkens toward the edge of the disc as seen from the front.
    lit = 0.35 + 0.65 * max(0.0, c.y * 0.8 + c.x * 0.3 + 0.2)
    return tuple(min(1.0, x * lit) for x in col)


SPHERE_R = 78.5
SPHERE_CZ = 112.0 - SPHERE_R


def build_sphere():
    """157 m wide, 112 m tall: a sphere cut where it meets its base, its
    whole skin a screen (here a planet), on a dark ring of a plinth."""
    clear()
    root = empty("vegas_sphere")
    s = Mesh("sphere")
    lo = math.asin((0.0 - SPHERE_CZ) / SPHERE_R)
    prof = []
    for k in range(57):
        a = lo + (math.pi / 2 - lo) * k / 56
        prof.append((SPHERE_R * math.cos(a), SPHERE_CZ + SPHERE_R * math.sin(a)))
    prof[-1] = (0.0, SPHERE_CZ + SPHERE_R)
    s.lathe(prof, (0, 0), "screen", segs=96)
    s.finish(parent=root, colour=planet)
    b = Mesh("base")
    r0 = prof[0][0]
    b.lathe([(r0 + 6.0, 0.0), (r0 + 6.0, 2.0), (r0 - 2.0, 2.0), (r0 - 2.0, 0.0)], (0, 0), "dark_glass", segs=56, smooth=False)
    b.finish(parent=root)
    return root


def build_strip():
    """Along the Strip: a curved slab of bronze glass (187 m), a Y-plan
    tower of gold glass (120 m), and far off the 350 m observation tower:
    its tapering shaft, the pod with its lit glass bands, the mast."""
    clear()
    root = empty("vegas_strip")
    c = Mesh("curved_slab")
    arc = [(-120 + math.sin(a) * 150, 150 - math.cos(a) * 150 - 140) for a in [math.radians(-12 + 24 * k / 12) for k in range(13)]]
    back = [(-120 + math.sin(a) * 170, 150 - math.cos(a) * 170 - 140) for a in [math.radians(-12 + 24 * k / 12) for k in range(13)]]
    facade_tower(c, list(reversed(arc)) + back, 0, 187, "facade_bronze")
    # Its crown: a band of light round the top, and a podium at its foot.
    c.prism([(x * 1.0, y) for x, y in list(reversed(arc)) + back], 187, 190, "window_lit")
    c.box((-150, -150, 0), (-90, -126, 14), "dark_glass")
    c.finish(parent=root)
    y = Mesh("y_tower")
    for k in range(3):
        a = math.radians(90 + 120 * k)
        ux, uy = math.cos(a), math.sin(a)
        px, py = -uy, ux
        L, W = 52.0, 11.0
        pts = [(px * W, py * W), (px * W + ux * L, py * W + uy * L), (-px * W + ux * L, -py * W + uy * L), (-px * W, -py * W)]
        facade_tower(y, [(30 + x, -40 + yy) for x, yy in pts], 0, 120.0 - 8 * k, "facade_bronze")
        y.prism([(30 + x, -40 + yy) for x, yy in pts], 120.0 - 8 * k, 122.0 - 8 * k, "window_lit")
    y.prism([(30 + 13 * math.cos(2 * math.pi * k / 6), -40 + 13 * math.sin(2 * math.pi * k / 6)) for k in range(6)], 0, 124.0, "facade_bronze")
    y.finish(parent=root)
    n = Mesh("needle")
    nx, ny = 150.0, -110.0
    for k in range(3):
        a = 2 * math.pi * k / 3
        tube(n, (nx + math.cos(a) * 11, ny + math.sin(a) * 11, 0), (nx + math.cos(a) * 5, ny + math.sin(a) * 5, 262), 3.6, "concrete", 10)
    n.lathe([(0.0, 258), (6.0, 258), (16.0, 262), (24.0, 268), (25.0, 274), (22.0, 280), (25.0, 284), (24.0, 288), (12.0, 292), (5.0, 294), (0.0, 294)], (nx, ny), "concrete", segs=24, smooth=False)
    for z0, r in ((268.5, 24.4), (280.5, 22.4)):
        n.lathe([(0.0, z0), (r, z0), (r + 0.3, z0 + 0.4), (r + 0.3, z0 + 3.4), (r, z0 + 3.8), (0.0, z0 + 3.8)], (nx, ny), "window_lit", segs=24, smooth=False)
    n.lathe([(0.0, 294), (3.0, 294), (1.6, 330), (0.6, 350), (0.0, 352)], (nx, ny), "white_steel", segs=8, smooth=False)
    n.finish(parent=root)
    return root


# =============================================================================
# Losail: the floodlit grandstand, Lusail's towers
# =============================================================================

def build_losail_grandstand():
    """The main grandstand: 200 m of seats under a canopy of white fabric
    vaults spanning front to back between masts, the boxes' glass along the
    back; floodlight pylons at either end and behind."""
    clear()
    root = empty("losail_grandstand")
    s = Mesh("stand")
    L = 100.0
    for k in range(18):
        y1 = 10.0 - 1.2 * k
        s.box((-L, y1 - 1.2, 0), (L, y1, 2.2 + 0.7 * (k + 1)), ("concrete", "crowd", "crowd", "seat", "crowd", "crowd")[k % 6], skip=("-z",))
    s.box((-L, -16.0, 0), (L, -11.6, 18.0), "concrete", skip=("-z",))
    s.box((-L + 1, -11.65, 12.0), (L - 1, -11.55, 16.6), "glass")
    s.finish(parent=root)
    c = Mesh("canopy")
    bays = 10
    for b in range(bays):
        x0 = -L + 2 * L * b / bays
        x1 = x0 + 2 * L / bays
        # A vault across the bay: its crown along the middle, edges down.
        prof = [(0.0, 0.0), (0.2, 1.6), (0.5, 2.4), (0.8, 1.6), (1.0, 0.0)]
        rows_top = []
        rows_bot = []
        for f in (0.0, 0.25, 0.5, 0.75, 1.0):
            y = -16.0 + 30.0 * f
            z = 24.0 - 3.0 * f
            rows_top.append([(x0 + (x1 - x0) * u, y, z + h) for u, h in prof])
            rows_bot.append([(x0 + (x1 - x0) * u, y, z + h - 0.5) for u, h in prof])
        for r0, r1 in zip(rows_top, rows_top[1:]):
            for i in range(len(prof) - 1):
                c.face((r0[i], r0[i + 1], r1[i + 1], r1[i]), "sail_shade")
        for r0, r1 in zip(rows_bot, rows_bot[1:]):
            for i in range(len(prof) - 1):
                c.face((r1[i], r1[i + 1], r0[i + 1], r0[i]), "sail_shade")
        for rt, rb, flip in ((rows_top[0], rows_bot[0], True), (rows_top[-1], rows_bot[-1], False)):
            for i in range(len(prof) - 1):
                q = [rt[i], rt[i + 1], rb[i + 1], rb[i]]
                c.face(q if flip else list(reversed(q)), "sail_shade")
        for f in range(4):
            q = [rows_top[f][0], rows_top[f + 1][0], rows_bot[f + 1][0], rows_bot[f][0]]
            c.face(list(reversed(q)), "sail_shade")
            q = [rows_top[f][-1], rows_top[f + 1][-1], rows_bot[f + 1][-1], rows_bot[f][-1]]
            c.face(q, "sail_shade")
        tube(c, (x0, -15.0, 0.0), (x0, -15.0, 26.0), 0.45, "white_steel", 6)
        tube(c, (x0, -15.0, 26.0), (x0, 13.5, 21.2), 0.25, "white_steel", 4)
    tube(c, (L, -15.0, 0.0), (L, -15.0, 26.0), 0.45, "white_steel", 6)
    c.finish(parent=root)
    p = Mesh("pylons")
    for x, y in ((-L - 14, 0.0), (L + 14, 0.0), (-40.0, -30.0), (40.0, -30.0)):
        tube(p, (x, y, 0), (x, y, 40.0), 0.8, "steel", 8)
        p.box((x - 4.5, y - 0.6, 37.0), (x + 4.5, y + 0.9, 42.0), "window_lit")
        p.box((x - 4.7, y - 1.0, 36.6), (x + 4.7, y - 0.6, 42.4), "gear")
    p.finish(parent=root)
    return root


def crescent(m, sign, H):
    """A crescent tower: the plan a crescent moon (its horns toward +Y), the
    tower curving outward (away from the other) as it climbs, like a blade."""
    n = 26
    rings = []
    for k in range(25):
        z = H * k / 24
        t = z / H
        lean = sign * (24.0 + 26.0 * t ** 1.6)
        scale = 1.0 - 0.35 * t ** 2.2
        ring = []
        for i in range(n):
            a = math.radians(200 + 140 * i / (n - 1))
            ring.append((lean + math.cos(a) * 30 * scale, math.sin(a) * 30 * scale + 10, z))
        for i in range(n):
            a = math.radians(340 - 140 * i / (n - 1))
            ring.append((lean + math.cos(a) * 22 * scale, math.sin(a) * 22 * scale + 2 * scale + 10, z))
        rings.append(ring)
    m.loft(rings, "facade", cap_top=True)


def build_lusail_towers():
    """Lusail's twin crescent towers (about 200 m), back to back, curving
    apart as they rise like two blades."""
    clear()
    root = empty("lusail_towers")
    for name, sign in (("crescent_1", -1), ("crescent_2", 1)):
        m = Mesh(name)
        crescent(m, sign, 200.0)
        m.finish(parent=root)
    return root


# =============================================================================
# Yas Marina: half the hotel under its gridshell
# =============================================================================

def gridshell_z(x, y):
    """The gridshell's surface: from the ground on the far side (y -40) up
    over the block to its crest over the block's front, still high at its
    track-side edge (y +8), where in life it runs on over the track; its
    ends rounded down."""
    t = (y + 40.0) / 48.0
    ends = smooth((62.0 - abs(x)) / 12.0)
    return 0.5 + 60.0 * math.sin(min(1.0, max(0.0, t)) * math.pi * 0.62) ** 0.3 * ends


def build_yas_hotel():
    """Half of the hotel the circuit runs through: a curved block of twelve
    storeys (about 44 m) under the gridshell, a free-form lattice of steel
    diamonds with glass panels in it, lit at night. In life its other half
    stands across the track, joined by a bridge over it; here the halves
    stand either side and the bridge is left out."""
    clear()
    root = empty("yas_hotel")
    b = Mesh("block")
    plan = [(x, -4.0 - 5.0 * math.cos(x / 50 * math.pi / 2)) for x in [-50 + 100 * k / 12 for k in range(13)]]
    back = [(x, y - 18.0) for x, y in reversed(plan)]
    facade_tower(b, plan + back, 0, 44.0, "facade")
    b.finish(parent=root)
    g = Mesh("gridshell")
    nx, ny = 24, 10
    xs = [-62 + 124 * i / nx for i in range(nx + 1)]
    ys = [-40 + 48 * k / ny for k in range(ny + 1)]
    surf = [[(x, y, gridshell_z(x, y)) for y in ys] for x in xs]
    # The diamonds: bars along both diagonals of the grid.
    for i in range(nx):
        for k in range(ny):
            tube(g, surf[i][k], surf[i + 1][k + 1], 0.45, "gridshell", 4)
            tube(g, surf[i + 1][k], surf[i][k + 1], 0.45, "gridshell", 4)
    g.finish(parent=root)
    # The glass in it: a thin closed shell just under the bars.
    p = Mesh("panels")
    top = [[(x, y, z - 0.25) for x, y, z in row] for row in surf]
    bot = [[(x, y, z - 0.45) for x, y, z in row] for row in surf]
    for i in range(nx):
        for k in range(ny):
            p.face([top[i][k], top[i + 1][k], top[i + 1][k + 1], top[i][k + 1]], "dark_glass")
            p.face([bot[i][k + 1], bot[i + 1][k + 1], bot[i + 1][k], bot[i][k]], "dark_glass")
    edge = [(i, 0) for i in range(nx)] + [(nx, k) for k in range(ny)] + [(i, ny) for i in range(nx, 0, -1)] + [(0, k) for k in range(ny, 0, -1)]
    for (i, k), (i2, k2) in zip(edge, edge[1:] + edge[:1]):
        p.face([top[i][k], bot[i][k], bot[i2][k2], top[i2][k2]], "dark_glass")
    p.finish(parent=root)
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
    (build_melbourne, "melbourne_skyline", (300, 325), True, False, [("front", (-20, 520, 120), (-20, 0, 150))], False),
    (build_shanghai, "shanghai_grandstand", (45, 60), True, False, [("front", (40, 330, 60), (0, 0, 25))], False),
    (build_fountain, "jeddah_fountain", (250, 275), False, False, [("front", (0, 520, 60), (0, 0, 130))], True),
    (build_miami_stadium, "miami_stadium", (80, 100), True, False, [("front", (120, 420, 120), (0, 0, 20))], False),
    (build_hillside, "hillside", (16, 34), True, False, [("front", (40, 140, 20), (0, -10, 10))], False),
    (build_barcelona_grandstand, "barcelona_grandstand", (20, 34), True, False, [("front", (60, 170, 30), (0, 0, 12))], False),
    (build_biosphere, "biosphere", (60, 66), False, False, [("front", (40, 130, 30), (0, 0, 28))], False),
    (build_bull, "spielberg_bull", (9, 14), False, False, [("front", (6, 26, 6), (0, 0, 6)), ("side", (22, 14, 5), (0, 0, 6))], False),
    (build_hugenholtz, "hugenholtz", (10, 26), True, False, [("front", (0, 120, 25), (0, 20, 5))], False),
    (build_flame_towers, "flame_towers", (178, 192), True, False, [("front", (40, 420, 60), (0, 0, 95))], False),
    (build_old_city, "baku_old_city", (28, 34), False, False, [("front", (40, 80, 14), (0, -10, 8))], False),
    (build_cota_tower, "cota_tower", (74, 80), False, False, [("front", (40, 150, 30), (0, -10, 38))], False),
    (build_foro_sol, "foro_sol", (30, 60), True, False, [("front", (0, 160, 40), (0, 20, 10))], False),
    (build_sphere, "vegas_sphere", (108, 116), False, True, [("front", (0, 330, 50), (0, 0, 55))], True),
    (build_strip, "vegas_strip", (340, 360), True, False, [("front", (0, 560, 80), (0, -40, 150))], True),
    (build_losail_grandstand, "losail_grandstand", (18, 45), True, False, [("front", (40, 130, 20), (0, 0, 14))], True),
    (build_lusail_towers, "lusail_towers", (185, 215), True, False, [("front", (0, 480, 60), (0, 0, 100))], True),
    (build_yas_hotel, "yas_hotel", (50, 70), True, False, [("front", (40, 170, 30), (0, 0, 30))], True),
)

for build, name, top, uvs, colours, shots, night in MODELS:
    if ONLY and name not in ONLY:
        continue
    root = build()
    check(name, root, 40000, top)
    export(root, f"{name}.glb", uvs=uvs, colours=colours)
    preview(root, name, shots, night=night)
