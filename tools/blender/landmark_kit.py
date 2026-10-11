"""The mesh kit shared by the trackside landmark builds (build_landmarks_2025.py,
build_vegas.py): faces gathered by role into one object, UVs in metres, the
tube and lathe helpers, and the build's check, export and preview.

Imported by a build script that Blender runs headless; it reads the same
environment as they do: F1_LANDMARKS_OUT (where to export) and
F1_LANDMARKS_PREVIEW (where to render previews)."""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

OUT = os.environ.get("F1_LANDMARKS_OUT", "")
PREVIEW = os.environ.get("F1_LANDMARKS_PREVIEW", "")
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


