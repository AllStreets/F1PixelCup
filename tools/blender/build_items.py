"""Build the power-up models and export one GLB each to assets/items/.

Run inside Blender (through the MCP server, or Blender's Text editor):

    import os; os.environ["F1_ITEMS_OUT"] = "<repo>/assets/items"
    exec(open("<repo>/tools/blender/build_items.py").read())

Units are the game's own (the F1 car is about 25 long), Z up, X forward; the
glTF export turns that into Three.js's Y up. Materials are named by role --
box_glass, box_frame, box_mark, oil, carbon_weave, tyre, tyre_band, rim,
fia_blue, fia_white, sc_paint, sc_glass, sc_trim, sc_stripe, sc_lamp, sc_head,
sc_tail -- and the game may swap in its own (the oil's thin-film texture, the
carbon weave). The safety car's two roof lamps are separate objects,
lamp_L and lamp_R, so the game can flash them.

Footprints match the meshes they replace (see r3d/powerups.js and
r3d/track.js buildItemBox): box 11 cube, oil pool about 29 x 24, debris about
12.8 x 8.4 (origin in its middle), Undercut tyre radius 3.2, Steward puck
radius 4.5, safety car about 26.5 x 10.1. Budgets: under 3k triangles each,
the safety car (one on track at most) under 5k.

Colours are written as sRGB hex values (as the icon style guide gives them)
and converted to linear, which is what Blender's Base Color and glTF's
baseColorFactor hold. Only the box glass is double-sided.

Built with Blender 5.2: the item box's "?" uses Blender's built-in font, so a
different Blender version may draw it slightly differently. The script clears
the scene first, so it refuses to run in a saved .blend file unless
F1_BUILD_FORCE=1 is set.
"""
import bpy
import bmesh
import math
import os
from mathutils import Matrix

OUT = os.environ.get("F1_ITEMS_OUT", "")


def reset():
    if bpy.data.filepath and os.environ.get("F1_BUILD_FORCE") != "1":
        raise RuntimeError(f"build_items.py clears the scene; {bpy.data.filepath} is open. Use a new file, or set F1_BUILD_FORCE=1.")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.collections):
        for block in list(coll):
            coll.remove(block)


def principled(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def mat(name, color, metal=0.0, rough=0.4, emit=0.0, alpha=1.0):
    """color is sRGB (0-1 per channel, as in a hex code); stored linear."""
    color = tuple(linear(c) for c in color)
    m = bpy.data.materials.new(name)
    # Closed meshes cull their back faces; only see-through glass shows both.
    m.use_backface_culling = alpha >= 1
    m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emit
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except (AttributeError, TypeError):
            pass
    m.diffuse_color = (*color, alpha)
    return m


reset()
MATS = {
    "box_glass": mat("box_glass", (0.85, 0.04, 0.03), 0.0, 0.12, emit=0.25, alpha=0.7),
    "box_frame": mat("box_frame", (1.0, 0.93, 0.78), 0.3, 0.25, emit=0.6),
    "box_mark": mat("box_mark", (1.0, 0.97, 0.9), 0.0, 0.3, emit=2.2),
    "oil": mat("oil", (0.02, 0.02, 0.03), 0.1, 0.08),
    "carbon_weave": mat("carbon_weave", (0.05, 0.055, 0.065), 0.5, 0.28),
    "tyre": mat("tyre", (0.025, 0.025, 0.025), 0.0, 0.85),
    "tyre_band": mat("tyre_band", (0.91, 0.0, 0.18), 0.0, 0.5),
    "rim": mat("rim", (0.75, 0.77, 0.8), 0.95, 0.22),
    "fia_blue": mat("fia_blue", (0.0, 0.33, 0.9), 0.55, 0.22, emit=0.35),
    "fia_white": mat("fia_white", (0.94, 0.96, 1.0), 0.1, 0.3, emit=0.4),
    "sc_paint": mat("sc_paint", (0.79, 0.81, 0.84), 0.9, 0.2),
    "sc_glass": mat("sc_glass", (0.03, 0.045, 0.06), 0.3, 0.04),
    "sc_trim": mat("sc_trim", (0.06, 0.065, 0.07), 0.2, 0.55),
    "sc_stripe": mat("sc_stripe", (0.0, 0.63, 0.42), 0.3, 0.35),
    "sc_lamp": mat("sc_lamp", (1.0, 0.63, 0.0), 0.0, 0.3, emit=3.0),
    "sc_head": mat("sc_head", (1.0, 0.96, 0.86), 0.0, 0.2, emit=2.0),
    "sc_tail": mat("sc_tail", (1.0, 0.08, 0.06), 0.0, 0.3, emit=2.0),
}


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def link(name, bm, material, coll, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    me.materials.append(MATS[material])
    for p in me.polygons:
        p.use_smooth = smooth
    return ob


def planar_uv(ob, size):
    """Top-down UVs over a size x size square centred on the origin."""
    me = ob.data
    uv = me.uv_layers.new(name="UVMap")
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (co.x / size + 0.5, co.y / size + 0.5)


def bevel(ob, width, segments=3, material_offset=0, harden=True):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.material = material_offset
    mod.harden_normals = harden
    return mod


def loft(name, stations, coll, material, segs=32, exp=3.0, smooth=True):
    """stations: (x, halfwidth, zbottom, ztop). Superellipse rings, capped."""
    bm = bmesh.new()
    rings = []
    for x, hw, zb, zt in stations:
        zc, hh = (zb + zt) / 2, (zt - zb) / 2
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            c, s = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((x, hw * math.copysign(abs(c) ** (2 / exp), c), zc + hh * math.copysign(abs(s) ** (2 / exp), s))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, material, coll, smooth)


def box(name, center, size, material, coll):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = center[0] + v.co.x * size[0]
        v.co.y = center[1] + v.co.y * size[1]
        v.co.z = center[2] + v.co.z * size[2]
    return link(name, bm, material, coll)


def tyre(name, r, width, coll, band=True, seg=48, steps=10):
    """A slick: rounded tread profile swept round the Y axis, closed by an inner
    barrel, with a compound band on each sidewall and a rim, as one object with
    its origin on the axle."""
    bm = bmesh.new()
    rin = r * 0.6
    prof = [(rin, -width / 2)]
    for i in range(steps + 1):
        a = -math.pi / 2 + math.pi * i / steps
        prof.append((r - 0.12 * r + 0.12 * r * math.cos(a), (width / 2) * math.sin(a)))
    prof.append((rin, width / 2))
    rings = []
    for k in range(seg):
        t = 2 * math.pi * k / seg
        rings.append([bm.verts.new((rr * math.cos(t), yy, rr * math.sin(t))) for rr, yy in prof])
    for k in range(seg):
        a, b = rings[k], rings[(k + 1) % seg]
        for i in range(len(prof) - 1):
            bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
        # The inner barrel: no seeing into the tyre past the rim.
        bm.faces.new((a[-1], b[-1], b[0], a[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, "tyre", coll, smooth=True)
    ob.data.materials.append(MATS["tyre_band"])
    ob.data.materials.append(MATS["rim"])
    if band:
        for p in ob.data.polygons:
            c = p.center
            rad = math.hypot(c.x, c.z)
            if abs(abs(c.y) - width / 2) < width * 0.25 and r * 0.7 < rad < r * 0.8:
                p.material_index = 1
    # Rim discs and a hub on each side.
    bm = bmesh.new()
    for sgn in (1, -1):
        ret = bmesh.ops.create_circle(bm, cap_ends=True, segments=seg, radius=rin * 1.01)
        for v in ret["verts"]:
            v.co = (v.co.x, sgn * width * 0.34, v.co.y)
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=rin * 0.2, radius2=rin * 0.14, depth=width * 0.12,
                              matrix=Matrix.Translation((0, sgn * width * 0.38, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    rim = link(name + "_rim", bm, "rim", coll)
    join(ob, [rim])
    return ob


def join(target, others):
    bpy.ops.object.select_all(action="DESELECT")
    for o in others:
        o.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    return target


# --- Item box: red glass with a solid bevelled frame and a "?" inside ----------
C_BOX = collection("item_box")
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=11.0)
cube = link("item_box", bm, "box_glass", C_BOX)
cube.data.materials.append(MATS["box_frame"])
bevel(cube, 1.1, segments=4, material_offset=1)
# The mark: one "?" in the middle, drawn with the text tool and turned into a
# mesh, facing +X. The game keeps it turned to the camera while the glass
# spins round it, so it always reads (marks on the faces showed through the
# glass mirrored). Its origin is the box's centre.
bpy.ops.object.text_add(location=(0, 0, 0))
mark = bpy.context.active_object
mark.data.body = "?"
mark.data.align_x = "CENTER"
mark.data.align_y = "CENTER"
mark.data.size = 8.4
mark.data.extrude = 0.45
mark.data.bevel_depth = 0.16
# Few enough polygons for fifteen boxes a circuit.
mark.data.resolution_u = 3
mark.data.bevel_resolution = 1
mark.rotation_euler = (math.pi / 2, 0, math.pi / 2)
bpy.ops.object.convert(target="MESH")
mark.data.materials.clear()
mark.data.materials.append(MATS["box_mark"])
# Bake the upright turn into the mesh: the game sets the mark's yaw itself.
bpy.ops.object.select_all(action="DESELECT")
mark.select_set(True)
bpy.context.view_layer.objects.active = mark
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
for c in mark.users_collection:
    c.objects.unlink(mark)
C_BOX.objects.link(mark)
mark.name = "item_box_mark"

# --- Oil pool: an irregular puddle, domed a touch, flush with the road --------
C_OIL = collection("oil")
bm = bmesh.new()
n = 72
centre = bm.verts.new((0, 0, 0.22))
edge = []
for i in range(n):
    a = 2 * math.pi * i / n
    rad = 12.2 + 1.6 * math.sin(3 * a + 0.4) + 0.9 * math.sin(5 * a + 1.3) + 0.5 * math.sin(9 * a + 2.1)
    edge.append(bm.verts.new((rad * math.cos(a) * 1.06, rad * math.sin(a) * 0.92, 0.0)))
mid = []
for i, v in enumerate(edge):
    mid.append(bm.verts.new((v.co.x * 0.72, v.co.y * 0.72, 0.16)))
for i in range(n):
    j = (i + 1) % n
    bm.faces.new((edge[i], edge[j], mid[j], mid[i]))
    bm.faces.new((mid[i], mid[j], centre))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
oil = link("oil", bm, "oil", C_OIL, smooth=True)
planar_uv(oil, 30.0)

# --- Debris: three carbon shards --------------------------------------------
C_DEB = collection("debris")
shards = []
for k, (pts, off, rot) in enumerate([
    ([(-4.6, -1.4), (-0.4, -3.2), (3.8, -0.6), (1.0, 2.6), (-3.2, 2.0)], (0.0, 0.0, 0.0), 0.0),
    ([(-2.0, -1.0), (2.4, -1.8), (1.6, 1.6), (-1.4, 1.2)], (4.4, 2.6, 0.8), 0.7),
    ([(-1.6, -0.8), (1.8, -0.6), (0.2, 1.6)], (-4.0, 2.8, -0.6), -0.5),
]):
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in pts]
    f = bm.faces.new(vs)
    ret = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, 0.45))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    s = link(f"shard_{k}", bm, "carbon_weave", C_DEB)
    planar_uv(s, 10.0)
    bevel(s, 0.12, segments=2)
    s.rotation_euler = (0.25 * (k - 1), 0.35 * k, rot)
    s.location = off
    shards.append(s)
debris = join(shards[0], shards[1:])
debris.name = "debris"
# Turn about its own middle: the game tumbles it.
bpy.ops.object.select_all(action="DESELECT")
debris.select_set(True)
bpy.context.view_layer.objects.active = debris
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
debris.location = (0, 0, 0)

# --- Undercut: a fresh soft, rolling -----------------------------------------
C_UND = collection("undercut")
und = tyre("undercut", 3.2, 2.4, C_UND)

# --- Steward Penalty: a blue puck with a white ring inlay ----------------------
C_STW = collection("steward")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=4.5, radius2=4.5, depth=2.4)
puck = link("steward", bm, "fia_blue", C_STW, smooth=False)
bevel(puck, 0.5, segments=3)
# The ring inlay: a flat band on the top face, wound to face up.
bm = bmesh.new()
outer = [bm.verts.new((3.4 * math.cos(2 * math.pi * i / 48), 3.4 * math.sin(2 * math.pi * i / 48), 1.22)) for i in range(48)]
inn = [bm.verts.new((2.7 * math.cos(2 * math.pi * i / 48), 2.7 * math.sin(2 * math.pi * i / 48), 1.22)) for i in range(48)]
for i in range(48):
    j = (i + 1) % 48
    bm.faces.new((outer[i], outer[j], inn[j], inn[i]))
ring = link("steward_ring", bm, "fia_white", C_STW)
steward = join(puck, [ring])
steward.name = "steward"

# --- Safety car: a modern GT, long bonnet and fastback --------------------------
C_SC = collection("safety_car")
body = loft("sc_body", [
    # Arch bulges over the wheels (x = +-8) and a waist between them.
    (13.0, 3.2, 1.4, 2.9),
    (12.3, 4.1, 1.0, 3.5),
    (10.6, 4.6, 0.85, 3.95),
    (8.0, 4.95, 0.85, 4.2),
    (5.5, 4.7, 0.85, 4.4),
    (2.0, 4.6, 0.85, 4.65),
    (-2.0, 4.65, 0.85, 4.8),
    (-5.5, 4.85, 0.85, 4.85),
    (-8.0, 5.05, 0.85, 4.9),
    (-10.4, 4.8, 0.95, 4.8),
    (-12.3, 4.2, 1.25, 4.6),
    (-13.0, 3.5, 1.7, 4.2),
], C_SC, "sc_paint", segs=32, exp=3.2)
glass = loft("sc_glass", [
    (4.2, 3.4, 4.3, 4.5),
    (2.0, 3.7, 4.4, 7.0),
    (-0.8, 3.65, 4.5, 8.0),
    (-3.4, 3.45, 4.5, 7.85),
    (-6.4, 3.2, 4.5, 6.6),
    (-9.0, 2.8, 4.5, 5.3),
    (-10.2, 2.3, 4.5, 4.85),
], C_SC, "sc_glass", segs=32, exp=3.6)
roof = loft("sc_roof", [
    (0.4, 3.0, 7.35, 7.55),
    (-1.0, 3.35, 7.85, 8.2),
    (-3.4, 3.2, 7.7, 8.05),
    (-5.6, 2.9, 6.95, 7.15),
], C_SC, "sc_paint", segs=24, exp=4.0)
parts = [glass, roof]
# Grille, splitter, diffuser, side skirts, ducktail lip.
parts.append(box("sc_grille", (12.95, 0, 2.1), (0.3, 5.2, 1.3), "sc_trim", C_SC))
parts.append(box("sc_splitter", (12.4, 0, 0.9), (1.6, 8.6, 0.3), "sc_trim", C_SC))
parts.append(box("sc_diffuser", (-12.7, 0, 1.3), (1.2, 7.4, 1.0), "sc_trim", C_SC))
for sgn in (1, -1):
    parts.append(box(f"sc_skirt_{sgn}", (0, sgn * 4.62, 1.0), (9.0, 0.3, 0.5), "sc_trim", C_SC))
    parts.append(box(f"sc_stripe_{sgn}", (0.0, sgn * 4.72, 3.3), (9.0, 0.12, 0.5), "sc_stripe", C_SC))
    parts.append(box(f"sc_head_{sgn}", (12.55, sgn * 3.25, 3.2), (0.6, 1.9, 0.45), "sc_head", C_SC))
    parts.append(box(f"sc_mirror_{sgn}", (2.6, sgn * 4.3, 5.4), (0.9, 0.9, 0.5), "sc_paint", C_SC))
parts.append(box("sc_lip", (-12.3, 0, 4.95), (1.0, 7.8, 0.18), "sc_trim", C_SC))
# One full-width LED tail light.
parts.append(box("sc_tail", (-12.95, 0, 4.0), (0.3, 7.2, 0.32), "sc_tail", C_SC))
# The light bar's base; the two lamps stay separate objects so they can flash.
parts.append(box("sc_bar", (-1.2, 0, 8.45), (1.8, 6.6, 0.45), "sc_trim", C_SC))
for sgn, label in ((1, "L"), (-1, "R")):
    lamp = box(f"lamp_{label}", (-1.2, sgn * 1.75, 8.95), (1.5, 2.6, 0.7), "sc_lamp", C_SC)
    bevel(lamp, 0.2, segments=2)
car = join(body, parts)
car.name = "sc_body"
bevel(car, 0.08, segments=1, harden=False)
for x in (8.0, -8.0):
    for sgn in (1, -1):
        w = tyre(f"sc_wheel_{'F' if x > 0 else 'R'}{'L' if sgn > 0 else 'R'}", 2.35, 1.8, C_SC, band=False, seg=20, steps=6)
        w.location = (x, sgn * 4.0, 2.35)

# --- Export: one GLB per collection ----------------------------------------------
if OUT:
    os.makedirs(OUT, exist_ok=True)
    for coll, name in ((C_BOX, "item_box"), (C_OIL, "oil"), (C_DEB, "debris"), (C_UND, "undercut"),
                       (C_STW, "steward"), (C_SC, "safety_car")):
        bpy.ops.object.select_all(action="DESELECT")
        for o in coll.objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = coll.objects[0]
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format="GLB",
                                  use_selection=True, export_apply=True, export_yup=True)
        print("exported", name)
