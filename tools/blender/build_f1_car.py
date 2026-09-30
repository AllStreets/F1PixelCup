"""Build the F1 car used by the 3D renderer and export it to assets/f1_car.glb.

Car v2 (docs/superpowers/specs/2026-09-30-car-v2-design.md): the 2025 shape --
a slim nose on a four-element front wing, letterbox sidepod inlets over a deep
undercut and a steep downwash ramp, a wide floor with edge wings and fences,
a blade roll hoop, a spoon rear wing with a beam wing below, 18-inch wheels
with covers, lettered tyres and baked ambient occlusion. Original, after the
look of the class, not any one team's car.

Run headless, so it never touches an open Blender session:

  F1_CAR_OUT=assets/f1_car.glb Blender -b --factory-startup -P tools/blender/build_f1_car.py

Axes: X forward, Y left, Z up, metres. The origin sits on the ground under
the middle of the car. Materials are named by role (livery_body, livery_trim,
helmet, ...) so the game can recolour one model into all ten liveries. The
four wheels and the DRS flap (`drs_flap`, origin on its leading edge) are
separate objects, so the game can spin and steer the wheels and open the flap.

The helmet (material `helmet`, with the rear spoiler) has equirectangular UVs
(its visor is painted on, not modelled):
u runs round the head with the front at u = 0.5 (the seam at the back), v up
to the crown. r3d/car.js paints each driver's design onto it.

The tyre's sidewall band (material `tyre_band`) has UVs for its lettering:
u runs round the tyre (TYRE_REPEATS times), v across the band from the rim
out. r3d/car.js prints the wordmark in the compound's colour.

Ambient occlusion is baked by Cycles into a vertex colour (COLOR_0), lifted
so nothing goes black; r3d/car.js multiplies it into every material.

The colours below are linear values, tuned by eye on the car as it renders;
the game recolours the livery and paints the helmet itself.

The script clears the scene first, so it refuses to run over any work (a
saved .blend, or unsaved changes) unless F1_BUILD_FORCE=1 is set.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from f1parts import helmet_bmesh, spoiler_bmesh, spoiler_uvs  # noqa: E402

OUT = os.environ.get("F1_CAR_OUT", "")
TYRE_REPEATS = 4
# The share of the baked occlusion kept: 1 - AO_LIFT is the darkest a corner goes.
AO_LIFT = 0.38


def reset():
    if (bpy.data.filepath or bpy.data.is_dirty) and os.environ.get("F1_BUILD_FORCE") != "1":
        raise RuntimeError("build_f1_car.py clears the scene, and this one has work in it (saved or not). Use a new file, or set F1_BUILD_FORCE=1.")
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


def smooth(ob, on=True):
    for p in ob.data.polygons:
        p.use_smooth = on
    return ob


def loft_rings(name, rings, material="livery_body", cap=True, smooth_it=True):
    """rings: lists of (x, y, z) points, the same count each, lofted in order and capped."""
    bm = bmesh.new()
    vrings = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for r0, r1 in zip(vrings, vrings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap:
        bm.faces.new(list(reversed(vrings[0])))
        bm.faces.new(vrings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return smooth(link(name, bm, material), smooth_it)


def superellipse(x, hw, zb, zt, segs, exp, yc=0.0):
    zc, hh = (zb + zt) / 2, (zt - zb) / 2
    out = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c, s = math.cos(a), math.sin(a)
        out.append((x, yc + hw * math.copysign(abs(c) ** (2 / exp), c), zc + hh * math.copysign(abs(s) ** (2 / exp), s)))
    return out


def loft(name, stations, segs=28, material="livery_body", exp=2.6, smooth_it=True):
    """stations: (x, halfwidth, zbottom, ztop[, ycentre]). Superellipse rings, capped."""
    rings = [superellipse(st[0], st[1], st[2], st[3], segs, exp, st[4] if len(st) > 4 else 0.0) for st in stations]
    return loft_rings(name, rings, material, smooth_it=smooth_it)


def closed_spline(points, per=4):
    """A closed Catmull-Rom curve through (y, z) control points, `per` samples per span."""
    n = len(points)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2
                       + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)
                for d in range(2)))
    return out


def plate(name, x, y, z, sx, sy, sz, material="carbon", rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
        if rot:
            v.co = Matrix.Rotation(rot[1], 3, rot[0]) @ v.co
        v.co += Vector((x, y, z))
    return link(name, bm, material)


def rod(name, a, b, r=0.018, material="carbon"):
    bm = bmesh.new()
    length = math.dist(a, b)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r, radius2=r, depth=length)
    ob = link(name, bm, material)
    ob.location = tuple((a[i] + b[i]) / 2 for i in range(3))
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(tuple(b[i] - a[i] for i in range(3))))
    return ob


def aerofoil(chord, thick, n=10):
    """(dx, dz) round the section, leading edge at dx = +chord/2."""
    prof = []
    for i in range(n + 1):
        t = i / n
        prof.append((chord / 2 - chord * t, thick * math.sin(math.pi * t) * (1 - 0.4 * t)))
    for i in range(n - 1, 0, -1):
        t = i / n
        prof.append((chord / 2 - chord * t, -thick * 0.25 * math.sin(math.pi * t)))
    return prof


def wing(name, x, z, span, chord, thick, material="carbon", pitch=0.0, yc=0.0, stations=2, shape=None):
    """A wing element lofted along Y. `shape(u)` for u in [-1, 1] across the span
    returns (dx, dz, pitch_add, chord_scale): how the element sweeps and rises
    toward its tips (a front wing curling up, a spoon rear wing)."""
    rings = []
    for s in range(stations):
        u = -1 + 2 * s / (stations - 1)
        dx, dz, dp, cs = shape(u) if shape else (0.0, 0.0, 0.0, 1.0)
        p = pitch + dp
        ring = []
        for px, pz in aerofoil(chord * cs, thick):
            rx = px * math.cos(p) - pz * math.sin(p)
            rz = px * math.sin(p) + pz * math.cos(p)
            ring.append((x + dx + rx, yc + u * span / 2, z + dz + rz))
        rings.append(ring)
    return loft_rings(name, rings, material, smooth_it=True)


# --- Monocoque, nose and engine cover: one continuous shell ------------------
# The 2025 nose is long and slim, its tip reaching the second wing element.
loft("chassis", [
    (3.02, 0.035, 0.15, 0.20),
    (2.90, 0.07, 0.13, 0.25),
    (2.55, 0.11, 0.12, 0.32),
    (2.10, 0.15, 0.12, 0.41),
    (1.60, 0.20, 0.11, 0.52),
    (1.10, 0.26, 0.10, 0.61),
    (0.60, 0.30, 0.09, 0.66),
    (0.10, 0.31, 0.08, 0.68),
    (-0.30, 0.28, 0.08, 0.80),
    (-0.52, 0.25, 0.08, 1.00),
    (-0.80, 0.20, 0.09, 0.96),
    (-1.20, 0.155, 0.10, 0.78),
    (-1.65, 0.12, 0.13, 0.60),
    (-2.05, 0.09, 0.17, 0.47),
    (-2.42, 0.06, 0.22, 0.38),
], segs=40)

# Cockpit opening: a dark recessed tub over the top of the monocoque.
loft("cockpit", [
    (0.42, 0.05, 0.62, 0.66),
    (0.30, 0.20, 0.60, 0.705),
    (-0.10, 0.225, 0.60, 0.72),
    (-0.32, 0.19, 0.62, 0.76),
    (-0.40, 0.05, 0.66, 0.76),
], segs=24, material="carbon")

# Airbox intake over the driver's head, and the blade roll hoop above it.
loft("airbox_mouth", [
    (-0.43, 0.10, 0.86, 1.00),
    (-0.48, 0.11, 0.85, 1.01),
], segs=20, material="carbon")
loft("roll_hoop", [
    (-0.46, 0.012, 0.98, 1.07),
    (-0.58, 0.016, 0.96, 1.10),
    (-0.72, 0.012, 0.94, 1.02),
], segs=10, material="livery_trim", exp=6)

# A small fin down the engine cover (the 2025 cars keep only a trace of one).
loft("shark_fin", [
    (-0.95, 0.008, 0.9, 0.95),
    (-1.5, 0.008, 0.74, 0.84),
    (-2.1, 0.008, 0.48, 0.68),
], segs=8, material="livery_trim", exp=8, smooth_it=False)

# --- Sidepods: letterbox inlet, deep undercut, steep downwash ramp ----------
# Each station is a section on the car's right (y > 0), mirrored for the left:
# inner top against the tub, the rounded top, the outer shoulder, and below it
# the undercut sweeping back in and down to the floor.
SIDEPOD = [
    # x,     inner y, top z, outer y, shoulder z, undercut y, undercut z, floor z
    (0.62, 0.30, 0.62, 0.74, 0.50, 0.44, 0.40, 0.14),
    (0.45, 0.30, 0.64, 0.80, 0.52, 0.42, 0.36, 0.11),
    (0.10, 0.30, 0.60, 0.80, 0.49, 0.40, 0.30, 0.09),
    (-0.35, 0.29, 0.45, 0.70, 0.37, 0.38, 0.22, 0.09),
    (-0.85, 0.24, 0.31, 0.52, 0.25, 0.33, 0.15, 0.09),
    (-1.30, 0.19, 0.24, 0.36, 0.20, 0.26, 0.13, 0.10),
    (-1.62, 0.15, 0.21, 0.23, 0.17, 0.19, 0.13, 0.12),
]


def pod_section(x, yi, zt, yo, zs, yu, zu, zf, sgn):
    # A flat top, a squared outer shoulder, then the undercut: the pod's
    # underside sweeping back in, high, toward the tub.
    ctrl = [
        (yi, zf + 0.02), (yi - 0.01, zt - 0.05), (yi + (yo - yi) * 0.3, zt), (yo - 0.08, zt - 0.005),
        (yo - 0.01, zt - 0.035), (yo, zs + 0.02), (yo - 0.04, zs - 0.035), (yu + 0.06, zu + 0.02),
        (yu, zu), (yi + 0.04, zf + 0.005),
    ]
    return [(x, sgn * y, z) for y, z in closed_spline(ctrl, per=3)]


for side, sgn in (("L", 1), ("R", -1)):
    loft_rings(f"sidepod_{side}", [pod_section(*st, sgn) for st in SIDEPOD])
    # The letterbox inlet: a dark mouth set into the front of the pod, high and narrow.
    x0, yi, zt, yo, zs = SIDEPOD[0][:5]
    loft(f"pod_inlet_{side}", [
        (x0 + 0.012, (yo - yi) * 0.34, zs + 0.02, zt - 0.03, sgn * (yi + (yo - yi) * 0.55)),
        (x0 - 0.02, (yo - yi) * 0.32, zs + 0.025, zt - 0.035, sgn * (yi + (yo - yi) * 0.55)),
    ], segs=20, material="carbon", exp=5)
    # Cooling louvres down the ramp.
    for k in range(6):
        x = -0.45 - 0.11 * k
        plate(f"louvre_{k}_{side}", x, sgn * 0.5, 0.47 - 0.035 * k, 0.045, 0.2, 0.012, "carbon", rot=("Y", 0.35))
    # Mirrors on stalks off the pod's shoulder.
    plate(f"mirror_{side}", 0.42, sgn * 0.62, 0.76, 0.05, 0.13, 0.045, "livery_body")
    rod(f"mirror_arm_{side}", (0.44, sgn * 0.52, 0.6), (0.42, sgn * 0.58, 0.74), 0.01)

# --- Floor: wide and flat, its edge visible under the undercut ---------------
bm = bmesh.new()
outline = [(1.30, 0.28), (1.05, 0.72), (0.85, 0.86), (-0.70, 0.86), (-1.20, 0.72), (-1.45, 0.60),
           (-2.25, 0.52), (-2.25, -0.52), (-1.45, -0.60), (-1.20, -0.72), (-0.70, -0.86), (0.85, -0.86),
           (1.05, -0.72), (1.30, -0.28)]
top = [bm.verts.new((x, y, 0.07)) for x, y in outline]
bot = [bm.verts.new((x, y, 0.045)) for x, y in outline]
bm.faces.new(top)
bm.faces.new(list(reversed(bot)))
for i in range(len(outline)):
    j = (i + 1) % len(outline)
    bm.faces.new((top[i], bot[i], bot[j], top[j]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
link("floor", bm, "carbon")
for side, sgn in (("L", 1), ("R", -1)):
    # The edge wing: a slim element along each side of the floor, curling up.
    plate(f"edge_wing_{side}", -0.05, sgn * 0.89, 0.10, 1.5, 0.05, 0.012, "carbon", rot=("X", sgn * 0.5))
    plate(f"floor_edge_{side}", -0.05, sgn * 0.865, 0.085, 1.6, 0.012, 0.05, "carbon")
    # Floor fences at the front, curving outward.
    for k, y in enumerate((0.34, 0.45, 0.55, 0.64)):
        plate(f"fence_{k}_{side}", 1.08 - 0.03 * k, sgn * y, 0.12, 0.28, 0.01, 0.10 + 0.02 * k, "carbon", rot=("Z", sgn * (0.12 + 0.05 * k)))
# The diffuser: a ramp up to the rear crash structure, with strakes.
plate("diffuser_roof", -2.02, 0, 0.18, 0.5, 1.0, 0.012, "carbon", rot=("Y", 0.28))
for i, y in enumerate((-0.45, -0.25, -0.08, 0.08, 0.25, 0.45)):
    plate(f"diffuser_{i}", -2.05, y, 0.13, 0.5, 0.012, 0.14, "carbon")
# T-camera and antenna.
plate("t_cam", -0.66, 0, 1.06, 0.1, 0.08, 0.03, "livery_trim")
rod("antenna", (-1.0, 0, 0.93), (-1.05, 0, 1.07), 0.006, "carbon")
# Cockpit: steering wheel and headrest pads.
plate("steering_wheel", 0.2, 0, 0.72, 0.03, 0.2, 0.08, "carbon")
for side, sgn in (("L", 1), ("R", -1)):
    plate(f"headrest_{side}", -0.26, sgn * 0.185, 0.76, 0.22, 0.06, 0.06, "livery_trim")
rod("exhaust", (-2.3, 0, 0.37), (-2.55, 0, 0.37), 0.045, "halo")

# --- Front wing: four elements sweeping up and back into curled endplates ---
def fw_shape(k):
    def shape(u):
        a = abs(u)
        # Outboard the elements rise and pitch up; the inboard neutral section stays low.
        lift = max(0.0, (a - 0.25) / 0.75) ** 1.6
        return (-0.035 * lift * (k + 1), 0.028 * lift * (k + 1), 0.25 * lift, 1.0 - 0.15 * lift)
    return shape


FW = [  # x, z, chord, thick, pitch, material
    (2.80, 0.075, 0.46, 0.030, 0.00, "carbon"),
    (2.62, 0.115, 0.30, 0.022, -0.22, "carbon"),
    (2.50, 0.155, 0.24, 0.020, -0.38, "livery_body"),
    (2.41, 0.195, 0.19, 0.018, -0.55, "livery_trim"),
]
for k, (x, z, chord, thick, pitch, m) in enumerate(FW):
    wing(f"fw_el{k}", x, z, 1.9, chord, thick, m, pitch=pitch, stations=17, shape=fw_shape(k))
for side, sgn in (("L", 1), ("R", -1)):
    # The endplate: low at the front, curving up and in to meet the elements' tips.
    loft_rings(f"fw_endplate_{side}", [
        [(x, sgn * (0.955 - 0.03 * t), z) for t, z in ((0, 0.04), (0, 0.16 + 0.1 * t2), (1, 0.16 + 0.1 * t2), (1, 0.04))]
        for x, t2 in ((3.02, 0.0), (2.8, 0.35), (2.55, 0.75), (2.36, 1.0))
    ], "livery_body", smooth_it=False)
    plate(f"fw_footplate_{side}", 2.7, sgn * 0.90, 0.05, 0.6, 0.12, 0.012, "carbon")
    rod(f"fw_pylon_{side}", (2.78, sgn * 0.07, 0.09), (2.7, sgn * 0.05, 0.2), 0.018)
rod("pitot", (2.95, 0, 0.21), (3.16, 0, 0.22), 0.006, "carbon")
for side, sgn in (("L", 1), ("R", -1)):
    plate(f"nose_cam_{side}", 2.05, sgn * 0.16, 0.42, 0.1, 0.035, 0.03, "carbon")

# --- Rear wing: a spoon mainplane with rounded tips, the DRS flap, a beam wing
def spoon(u):
    a = abs(u)
    # The middle stands a little proud and the tips curve down into the endplates.
    return (0.0, 0.03 * (1 - a * a) - 0.05 * max(0.0, (a - 0.8) / 0.2) ** 2, 0.0, 1.0 + 0.12 * (1 - a * a))


wing("rw_main", -2.36, 0.84, 1.0, 0.34, 0.05, "carbon", pitch=0.12, stations=15, shape=spoon)
wing("rw_drs", -2.50, 0.96, 0.96, 0.21, 0.028, "livery_trim", pitch=0.45, stations=11, shape=lambda u: (0.0, 0.02 * (1 - u * u), 0.0, 1.0))
# The DRS flap is its own object, pivoting on its leading edge, so the game
# can open it. The profile runs from x + chord/2 (leading edge) and is pitched
# about (x, z); this is that leading edge after the pitch (at the centre of the span).
_drs_x, _drs_z, _drs_chord, _drs_pitch = -2.50, 0.96 + 0.02, 0.21, 0.45
_lead = (_drs_x + (_drs_chord / 2) * math.cos(_drs_pitch), 0.0, _drs_z + (_drs_chord / 2) * math.sin(_drs_pitch))
_flap = bpy.data.objects["rw_drs"]
_flap.name = "drs_flap"
bpy.context.scene.cursor.location = _lead
bpy.ops.object.select_all(action="DESELECT")
_flap.select_set(True)
bpy.context.view_layer.objects.active = _flap
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
# Endplates that round over at the top-front into the wing's tips.
for side, sgn in (("L", 1), ("R", -1)):
    prof = [(-2.17, 0.42), (-2.17, 0.88)]
    for t in range(1, 7):
        a = (math.pi / 2) * t / 6
        prof.append((-2.27 + 0.10 * math.cos(a), 0.88 + 0.12 * math.sin(a)))
    prof += [(-2.62, 1.02), (-2.68, 0.96), (-2.68, 0.42)]
    rings = [[(x, sgn * y, z) for x, z in prof] for y in (0.49, 0.515)]
    loft_rings(f"rw_endplate_{side}", rings, "livery_body", smooth_it=False)
# Beam wing: two elements low at the back.
wing("beam_upper", -2.40, 0.40, 0.84, 0.18, 0.02, "carbon", pitch=0.25, stations=9, shape=lambda u: (0.0, 0.02 * (1 - u * u), 0.0, 1.0))
wing("beam_lower", -2.28, 0.33, 0.84, 0.16, 0.02, "carbon", pitch=0.12, stations=9, shape=lambda u: (0.0, 0.015 * (1 - u * u), 0.0, 1.0))
# The pillar holding the wing, and the DRS actuator pod on top of it.
rod("rw_pillar", (-2.38, 0, 0.36), (-2.4, 0, 0.84), 0.022)
loft("drs_actuator", [(-2.3, 0.02, 0.86, 0.9), (-2.4, 0.03, 0.85, 0.93), (-2.5, 0.02, 0.87, 0.92)], segs=10, material="carbon")
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
for side, sgn in (("L", 1), ("R", -1)):
    plate(f"halo_fairing_{side}", -0.1, sgn * 0.25, 0.905, 0.3, 0.035, 0.012, "livery_body", rot=("X", sgn * -0.25))

# --- Driver -----------------------------------------------------------------
# The helmet and its spoiler (f1parts.py: the same shell the drivers wear).
# The visor is painted onto the helmet (r3d/car.js), so it follows the shell.
smooth(link("helmet", helmet_bmesh(-0.12, 0.74), "helmet"))
spoiler = smooth(link("helmet_spoiler", spoiler_bmesh(-0.12, 0.74), "helmet"))
spoiler_uvs(spoiler)

# --- Suspension ---------------------------------------------------------------
FRONT_X, REAR_X, TRACK_Y = 1.85, -1.72, 0.80
# 18-inch rims, 720 mm tyres.
R_TYRE, R_RIM = 0.36, 0.235
for side, sgn in (("L", 1), ("R", -1)):
    rod(f"f_upper_{side}", (1.95, sgn * 0.18, 0.46), (FRONT_X, sgn * (TRACK_Y - 0.12), 0.45))
    rod(f"f_lower_{side}", (1.70, sgn * 0.17, 0.20), (FRONT_X, sgn * (TRACK_Y - 0.12), 0.24))
    rod(f"f_push_{side}", (1.75, sgn * 0.15, 0.52), (FRONT_X, sgn * (TRACK_Y - 0.14), 0.22))
    rod(f"r_upper_{side}", (-1.60, sgn * 0.14, 0.45), (REAR_X, sgn * (TRACK_Y - 0.14), 0.48))
    rod(f"r_lower_{side}", (-1.45, sgn * 0.14, 0.18), (REAR_X, sgn * (TRACK_Y - 0.14), 0.22))
    # Brake-duct fairings inside the wheels, and the wheel-wake winglets over the fronts.
    plate(f"f_duct_{side}", FRONT_X, sgn * (TRACK_Y - 0.19), 0.36, 0.26, 0.05, 0.2, "carbon")
    plate(f"r_duct_{side}", REAR_X, sgn * (TRACK_Y - 0.23), 0.36, 0.26, 0.05, 0.22, "carbon")
    plate(f"winglet_{side}", FRONT_X - 0.02, sgn * (TRACK_Y - 0.1), 0.76, 0.3, 0.12, 0.012, "carbon", rot=("Y", -0.18))
    rod(f"winglet_stay_{side}", (FRONT_X, sgn * (TRACK_Y - 0.18), 0.55), (FRONT_X - 0.02, sgn * (TRACK_Y - 0.12), 0.75), 0.01)


# --- Wheels (separate objects, origin on the axle) --------------------------
def wheel(name, x, y, r, rin, width):
    seg = 48
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    # Tyre: a rounded profile swept round the axle (Y). A low-profile 18-inch
    # tyre: the sidewall from the rim out is short.
    prof = [(rin, -width / 2)]
    for i in range(9):
        a = -math.pi / 2 + math.pi * i / 8
        prof.append((r - 0.04 + 0.04 * math.cos(a), (width / 2) * math.sin(a)))
    prof.append((rin, width / 2))
    rings = []
    for k in range(seg + 1):
        t = 2 * math.pi * k / seg
        rings.append([bm.verts.new((rr * math.cos(t), yy, rr * math.sin(t))) for rr, yy in prof])
    last = len(prof) - 2
    for k in range(seg):
        a, b = rings[k], rings[k + 1]
        for i in range(len(prof) - 1):
            f = bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
            # The sidewall band: the first and last spans of the profile (rim to shoulder).
            on_band = i in (0, last)
            f.material_index = 1 if on_band else 0
            for loop, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                u = kk / seg * TYRE_REPEATS
                if on_band:
                    # v from the rim (0) out to the shoulder (1); the inboard wall reads mirrored.
                    rr = prof[ii][0]
                    v = min(max((rr - rin) / (prof[1][0] - rin), 0.0), 1.0)
                    loop[uv_layer].uv = (u if i == 0 else -u, v)
                else:
                    loop[uv_layer].uv = (u, ii / len(prof))
    bmesh.ops.remove_doubles(bm, verts=[v for ring in (rings[0], rings[-1]) for v in ring], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tyre = smooth(link(name, bm, "tyre"))
    tyre.data.materials.append(MATS["tyre_band"])
    tyre.data.materials.append(MATS["rim"])
    # Rim, brake drum and the flat 2025 wheel cover (outboard).
    bm = bmesh.new()
    for sgn in (1, -1):
        ret = bmesh.ops.create_circle(bm, cap_ends=True, segments=seg, radius=rin * 1.01)
        for v in ret["verts"]:
            v.co = (v.co.x, sgn * width * 0.40, v.co.y)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=rin * 0.55, radius2=rin * 0.55, depth=width * 0.7,
                          matrix=Matrix.Rotation(math.pi / 2, 4, "X"))
    for sgn in (1, -1):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=rin * 0.16, radius2=rin * 0.1, depth=0.02,
                              matrix=Matrix.Translation((0, sgn * width * 0.42, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    rim = link(name + "_rim", bm, "rim")
    for p in rim.data.polygons:
        p.material_index = 0
    bpy.ops.object.select_all(action="DESELECT")
    rim.select_set(True)
    tyre.select_set(True)
    bpy.context.view_layer.objects.active = tyre
    bpy.ops.object.join()
    tyre.location = (x, y, r)
    return tyre


wheels = [
    wheel("wheel_FL", FRONT_X, TRACK_Y, R_TYRE, R_RIM, 0.30),
    wheel("wheel_FR", FRONT_X, -TRACK_Y, R_TYRE, R_RIM, 0.30),
    wheel("wheel_RL", REAR_X, TRACK_Y - 0.02, R_TYRE, R_RIM, 0.40),
    wheel("wheel_RR", REAR_X, -(TRACK_Y - 0.02), R_TYRE, R_RIM, 0.40),
]

# --- Join everything that is not a wheel into one body ---------------------
bpy.ops.object.select_all(action="DESELECT")
for o in bpy.data.objects:
    if o.type == "CURVE":
        o.select_set(True)
bpy.context.view_layer.objects.active = halo
bpy.ops.object.convert(target="MESH")
bpy.ops.object.select_all(action="DESELECT")
for o in bpy.data.objects:
    if o.type == "MESH" and not o.name.startswith("wheel_") and o.name != "drs_flap":
        o.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects["chassis"]
bpy.ops.object.join()
car = bpy.context.active_object
car.name = "car_body"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


# --- Ambient occlusion, baked into a vertex colour ---------------------------
def bake_ao(objects):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    try:
        scene.cycles.device = "CPU"
    except Exception:
        pass
    # A ground plane, so the underside and the floor are occluded as on track.
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    ground = bpy.context.active_object
    for ob in objects:
        attr = ob.data.color_attributes.new("AO", "BYTE_COLOR", "POINT")
        ob.data.color_attributes.active_color = attr
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        # Lifted, so a crease is shaded, never black.
        for d in attr.data:
            c = d.color
            ao = c[0]
            k = 1 - AO_LIFT * (1 - ao)
            d.color = (k, k, k, 1)
    bpy.data.objects.remove(ground, do_unlink=True)


bake_ao([car, bpy.data.objects["drs_flap"], *wheels])

if OUT:
    bpy.ops.object.select_all(action="SELECT")
    kwargs = dict(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_vertex_color="ACTIVE")
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs, export_colors=True)
    print("exported", OUT)
