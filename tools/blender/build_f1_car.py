"""Build the F1 car used by the 3D renderer and export it to assets/f1_car.glb.

Run inside Blender (through the MCP server, or Blender's Text editor).
The body is lofted from superellipse cross-sections, so it reads as one
smooth shell rather than a stack of boxes.

Axes: X forward, Y left, Z up, metres. The origin sits on the ground under
the middle of the car. Materials are named by role (livery_body, livery_trim,
helmet, ...) so the game can recolour one model into all ten liveries. The
four wheels are separate objects with their origin on the axle, so the game
can spin and steer them.
"""
import bpy
import bmesh
import math
import os

OUT = os.environ.get("F1_CAR_OUT", "")


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for block in list(coll):
            coll.remove(block)


def principled(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def mat(name, color, metal=0.0, rough=0.4, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*color, 1)
    return m


reset()
MATS = {
    "livery_body": mat("livery_body", (0.75, 0.0, 0.0), 0.35, 0.28),
    "livery_trim": mat("livery_trim", (1.0, 0.8, 0.0), 0.25, 0.3),
    "carbon": mat("carbon", (0.03, 0.03, 0.035), 0.2, 0.4),
    "tyre": mat("tyre", (0.025, 0.025, 0.025), 0.0, 0.9),
    "tyre_band": mat("tyre_band", (0.95, 0.8, 0.05), 0.0, 0.6),
    "rim": mat("rim", (0.12, 0.12, 0.13), 0.9, 0.3),
    "helmet": mat("helmet", (1.0, 1.0, 1.0), 0.1, 0.2),
    "visor": mat("visor", (0.02, 0.02, 0.03), 0.8, 0.1),
    "halo": mat("halo", (0.05, 0.05, 0.06), 0.6, 0.35),
    "rain_light": mat("rain_light", (1.0, 0.06, 0.03), 0.0, 0.3, emit=4.0),
}


def link(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(MATS[material])
    return ob


def loft(name, stations, segs=28, material="livery_body", exp=2.6, smooth=True):
    """stations: (x, halfwidth, zbottom, ztop[, ycentre]). Superellipse rings, capped."""
    bm = bmesh.new()
    rings = []
    for st in stations:
        x, hw, zb, zt = st[:4]
        yc = st[4] if len(st) > 4 else 0.0
        zc, hh = (zb + zt) / 2, (zt - zb) / 2
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            c, s = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((
                x,
                yc + hw * math.copysign(abs(c) ** (2 / exp), c),
                zc + hh * math.copysign(abs(s) ** (2 / exp), s),
            )))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = link(name, bm, material)
    for p in ob.data.polygons:
        p.use_smooth = smooth
    return ob


def wing(name, x, z, span, chord, thick, material="carbon", pitch=0.0, yc=0.0):
    """A thin cambered plane: lofted along Y so the section is an aerofoil-ish lozenge."""
    bm = bmesh.new()
    prof = []
    n = 10
    for i in range(n + 1):  # upper surface, leading edge -> trailing edge
        t = i / n
        prof.append((x + chord / 2 - chord * t, z + thick * math.sin(math.pi * t) * (1 - 0.4 * t)))
    for i in range(n - 1, 0, -1):  # lower surface back to the front
        t = i / n
        prof.append((x + chord / 2 - chord * t, z - thick * 0.25 * math.sin(math.pi * t)))
    cx = x
    rings = []
    for y in (yc - span / 2, yc + span / 2):
        ring = []
        for px, pz in prof:
            dx, dz = px - cx, pz - z
            rx = dx * math.cos(pitch) - dz * math.sin(pitch)
            rz = dx * math.sin(pitch) + dz * math.cos(pitch)
            ring.append(bm.verts.new((cx + rx, y, z + rz)))
        rings.append(ring)
    k = len(prof)
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, material)


def plate(name, x, y, z, sx, sy, sz, material="carbon"):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x + v.co.x * sx
        v.co.y = y + v.co.y * sy
        v.co.z = z + v.co.z * sz
    return link(name, bm, material)


def rod(name, a, b, r=0.018, material="carbon"):
    ax, ay, az = a
    bx, by, bz = b
    bm = bmesh.new()
    length = math.dist(a, b)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r, radius2=r, depth=length)
    ob = link(name, bm, material)
    ob.location = ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    d = (bx - ax, by - ay, bz - az)
    from mathutils import Vector
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(d))
    return ob


# --- Monocoque, nose, engine cover and airbox: one continuous shell ----------
loft("chassis", [
    (2.98, 0.04, 0.16, 0.20),
    (2.80, 0.09, 0.13, 0.27),
    (2.35, 0.14, 0.13, 0.38),
    (1.80, 0.19, 0.13, 0.50),
    (1.25, 0.25, 0.11, 0.61),
    (0.75, 0.31, 0.09, 0.67),
    (0.25, 0.34, 0.08, 0.69),
    (-0.25, 0.33, 0.08, 0.76),
    (-0.55, 0.30, 0.08, 1.02),
    (-0.95, 0.26, 0.08, 0.98),
    (-1.45, 0.20, 0.10, 0.80),
    (-1.95, 0.13, 0.14, 0.60),
    (-2.30, 0.09, 0.18, 0.46),
    (-2.48, 0.06, 0.22, 0.38),
], segs=36)

# Cockpit opening: a dark recessed tub over the top of the monocoque.
loft("cockpit", [
    (0.42, 0.05, 0.62, 0.66),
    (0.30, 0.20, 0.60, 0.705),
    (-0.10, 0.23, 0.60, 0.72),
    (-0.38, 0.19, 0.62, 0.74),
    (-0.46, 0.05, 0.66, 0.74),
], segs=24, material="carbon")

# Airbox intake mouth above the driver's head.
loft("airbox_mouth", [
    (-0.47, 0.11, 0.86, 1.00),
    (-0.52, 0.12, 0.85, 1.01),
], segs=20, material="carbon")

# Shark fin down the engine cover, in the trim colour.
loft("shark_fin", [
    (-0.95, 0.01, 0.9, 0.97),
    (-1.5, 0.01, 0.74, 0.90),
    (-2.2, 0.01, 0.46, 0.84),
], segs=8, material="livery_trim", exp=8, smooth=False)

# --- Sidepods (coke-bottle taper toward the gearbox) ------------------------
for side, sgn in (("L", 1), ("R", -1)):
    loft(f"sidepod_{side}", [
        (0.55, 0.10, 0.22, 0.44, sgn * 0.54),
        (0.40, 0.22, 0.14, 0.50, sgn * 0.60),
        (0.00, 0.26, 0.10, 0.52, sgn * 0.62),
        (-0.55, 0.22, 0.10, 0.46, sgn * 0.56),
        (-1.10, 0.14, 0.10, 0.36, sgn * 0.44),
        (-1.60, 0.07, 0.12, 0.28, sgn * 0.30),
    ], segs=28, exp=3.4)
    # Dark intake mouth at the front of each pod.
    loft(f"pod_inlet_{side}", [
        (0.56, 0.08, 0.27, 0.43, sgn * 0.55),
        (0.52, 0.09, 0.26, 0.44, sgn * 0.56),
    ], segs=16, material="carbon", exp=3.4)
    plate(f"mirror_{side}", 0.45, sgn * 0.47, 0.74, 0.06, 0.11, 0.04, "livery_body")
    rod(f"mirror_arm_{side}", (0.47, sgn * 0.33, 0.64), (0.45, sgn * 0.43, 0.73), 0.01)

# --- Floor ------------------------------------------------------------------
bm = bmesh.new()
outline = [(1.2, 0.30), (0.8, 0.78), (-0.9, 0.80), (-1.5, 0.66), (-2.2, 0.52),
           (-2.2, -0.52), (-1.5, -0.66), (-0.9, -0.80), (0.8, -0.78), (1.2, -0.30)]
top = [bm.verts.new((x, y, 0.07)) for x, y in outline]
bot = [bm.verts.new((x, y, 0.045)) for x, y in outline]
bm.faces.new(top)
bm.faces.new(list(reversed(bot)))
for i in range(len(outline)):
    j = (i + 1) % len(outline)
    bm.faces.new((top[i], bot[i], bot[j], top[j]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
link("floor", bm, "carbon")
# Diffuser strakes at the back.
for i, y in enumerate((-0.4, -0.15, 0.15, 0.4)):
    plate(f"diffuser_{i}", -2.25, y, 0.14, 0.4, 0.015, 0.16)
plate("diffuser_roof", -2.28, 0, 0.23, 0.36, 0.9, 0.015)

# --- Front wing -------------------------------------------------------------
wing("fw_main", 2.72, 0.08, 1.90, 0.42, 0.035, "carbon")
wing("fw_flap1", 2.58, 0.15, 1.70, 0.30, 0.028, "livery_body", pitch=-0.25)
wing("fw_flap2", 2.47, 0.22, 1.50, 0.24, 0.024, "livery_trim", pitch=-0.45)
for side, sgn in (("L", 1), ("R", -1)):
    plate(f"fw_endplate_{side}", 2.62, sgn * 0.95, 0.15, 0.55, 0.02, 0.2, "livery_body")
    rod(f"fw_pylon_{side}", (2.7, sgn * 0.08, 0.1), (2.6, sgn * 0.06, 0.24), 0.02)

# --- Rear wing --------------------------------------------------------------
wing("rw_main", -2.38, 0.86, 1.02, 0.34, 0.05, "carbon", pitch=0.12)
wing("rw_drs", -2.52, 0.97, 1.00, 0.22, 0.03, "livery_trim", pitch=0.45)
wing("rw_beam", -2.35, 0.42, 0.80, 0.22, 0.025, "carbon", pitch=0.1)
for side, sgn in (("L", 1), ("R", -1)):
    plate(f"rw_endplate_{side}", -2.42, sgn * 0.52, 0.70, 0.52, 0.025, 0.62, "livery_body")
rod("rw_pillar", (-2.4, 0, 0.38), (-2.4, 0, 0.86), 0.025)
plate("rain_light", -2.53, 0, 0.30, 0.03, 0.08, 0.06, "rain_light")

# --- Halo -------------------------------------------------------------------
cu = bpy.data.curves.new("halo", "CURVE")
cu.dimensions = "3D"
cu.bevel_depth = 0.028
cu.bevel_resolution = 3
sp = cu.splines.new("NURBS")
pts = [(-0.40, 0.25, 0.70), (-0.30, 0.27, 0.86), (0.05, 0.24, 0.91), (0.28, 0.0, 0.90),
       (0.05, -0.24, 0.91), (-0.30, -0.27, 0.86), (-0.40, -0.25, 0.70)]
sp.points.add(len(pts) - 1)
for p, co in zip(sp.points, pts):
    p.co = (*co, 1)
sp.use_endpoint_u = True
sp.order_u = 4
halo = bpy.data.objects.new("halo", cu)
bpy.context.collection.objects.link(halo)
cu.materials.append(MATS["halo"])
rod("halo_strut", (0.45, 0, 0.68), (0.27, 0, 0.895), 0.022, "halo")

# --- Driver -----------------------------------------------------------------
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.135)
for v in bm.verts:
    v.co.x *= 1.12
    v.co.z += 0.74
    v.co.x += -0.12
helmet = link("helmet", bm, "helmet")
for p in helmet.data.polygons:
    p.use_smooth = True
loft("visor", [
    (-0.03, 0.095, 0.745, 0.785),
    (0.005, 0.085, 0.75, 0.78),
], segs=16, material="visor")

# --- Suspension ---------------------------------------------------------------
FRONT_X, REAR_X, TRACK_Y, R_FRONT, R_REAR = 1.85, -1.72, 0.80, 0.355, 0.36
for side, sgn in (("L", 1), ("R", -1)):
    rod(f"f_upper_{side}", (1.95, sgn * 0.18, 0.46), (FRONT_X, sgn * (TRACK_Y - 0.12), 0.45))
    rod(f"f_lower_{side}", (1.70, sgn * 0.17, 0.20), (FRONT_X, sgn * (TRACK_Y - 0.12), 0.24))
    rod(f"f_push_{side}", (1.75, sgn * 0.15, 0.52), (FRONT_X, sgn * (TRACK_Y - 0.14), 0.22))
    rod(f"r_upper_{side}", (-1.60, sgn * 0.14, 0.45), (REAR_X, sgn * (TRACK_Y - 0.14), 0.48))
    rod(f"r_lower_{side}", (-1.45, sgn * 0.14, 0.18), (REAR_X, sgn * (TRACK_Y - 0.14), 0.22))


# --- Wheels (separate objects, origin on the axle) --------------------------
def wheel(name, x, y, r, width):
    bm = bmesh.new()
    seg = 40
    # Tyre: a rounded ring profile swept around the axle (Y axis).
    prof = []
    rin = r * 0.62
    for i in range(9):
        a = -math.pi / 2 + math.pi * i / 8
        prof.append((r - 0.05 + 0.05 * math.cos(a), (width / 2) * math.sin(a)))
    prof = [(rin, -width / 2)] + prof + [(rin, width / 2)]
    rings = []
    for k in range(seg):
        t = 2 * math.pi * k / seg
        rings.append([bm.verts.new((rr * math.cos(t), yy, rr * math.sin(t))) for rr, yy in prof])
    for k in range(seg):
        a, b = rings[k], rings[(k + 1) % seg]
        for i in range(len(prof) - 1):
            bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tyre = link(name, bm, "tyre")
    for p in tyre.data.polygons:
        p.use_smooth = True
    tyre.data.materials.append(MATS["tyre_band"])
    tyre.data.materials.append(MATS["rim"])
    # Compound band on the sidewalls, then the rim disc.
    for p in tyre.data.polygons:
        c = p.center
        rad = math.hypot(c.x, c.z)
        if abs(abs(c.y) - width / 2) < width * 0.2 and r * 0.74 < rad < r * 0.82:
            p.material_index = 1
    bm = bmesh.new()
    for sgn in (1, -1):
        ret = bmesh.ops.create_circle(bm, cap_ends=True, segments=seg, radius=rin * 1.01)
        for v in ret["verts"]:
            v.co = (v.co.x, sgn * width * 0.36, v.co.y)
    rim = link(name + "_rim", bm, "rim")
    # Join the rim into the tyre so a wheel is one object.
    bpy.ops.object.select_all(action="DESELECT")
    rim.select_set(True)
    tyre.select_set(True)
    bpy.context.view_layer.objects.active = tyre
    bpy.ops.object.join()
    tyre.location = (x, y, r)
    return tyre


wheel("wheel_FL", FRONT_X, TRACK_Y, R_FRONT, 0.30)
wheel("wheel_FR", FRONT_X, -TRACK_Y, R_FRONT, 0.30)
wheel("wheel_RL", REAR_X, TRACK_Y - 0.02, R_REAR, 0.40)
wheel("wheel_RR", REAR_X, -(TRACK_Y - 0.02), R_REAR, 0.40)

# --- Join everything that is not a wheel into one body ---------------------
bpy.ops.object.select_all(action="DESELECT")
for o in bpy.data.objects:
    if o.type == "CURVE":
        o.select_set(True)
bpy.context.view_layer.objects.active = halo
bpy.ops.object.convert(target="MESH")
bpy.ops.object.select_all(action="DESELECT")
body = None
for o in bpy.data.objects:
    if o.type == "MESH" and not o.name.startswith("wheel_"):
        o.select_set(True)
        body = body or o
bpy.context.view_layer.objects.active = bpy.data.objects["chassis"]
bpy.ops.object.join()
car = bpy.context.active_object
car.name = "car_body"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

if OUT:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True)
    print("exported", OUT)
