"""Build the race driver figure used by the podium ceremony, and export it to
assets/driver.glb (docs/superpowers/specs/2026-10-01-driver-v2-design.md).

Run headless, so it never touches an open Blender session:

  F1_DRIVER_OUT=assets/driver.glb Blender -b --factory-startup -P tools/blender/build_driver.py

Set F1_DRIVER_PREVIEW=<dir> to also render every pose there for review.

A driver in a race suit, about 1.78 m tall, standing on the ground at the
origin and facing +X (Y left, Z up, metres).

The body (torso, arms, legs, neck) is one smooth mesh skinned to a 16-bone
rig: overlapping lofts with real proportions, merged by a voxel remesh,
smoothed and reduced. Its rest pose is an A-pose, so the arms never fuse into
the torso. Each vertex is weighted to the loft it came from, smoothed across
the joints. The suit's trim, the cuffs and the balaclava are painted on the
body by region. The hands, the boots and the helmet are rigid, each on its
bone.

Materials by role, recoloured per team and driver as the car is (r3d/car.js,
r3d/driver.js): suit, suit_trim, gloves, boots, balaclava, helmet (the car's
shell and UVs, f1parts.py, so each driver's painted design carries over), and
the props' trophy, bottle and foil.

Animations (glTF actions): stand, wave, arms_up, trophy, spray. The props
(trophy, bottle) are separate objects on the right hand; the game shows the
one a pose uses.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from f1parts import helmet_bmesh, spoiler_bmesh, spoiler_uvs  # noqa: E402
import driver_head  # noqa: E402

OUT = os.environ.get("F1_DRIVER_OUT", "")
PREVIEW = os.environ.get("F1_DRIVER_PREVIEW", "")
FPS = 30
BODY_TRIS = 14000

if (bpy.data.filepath or bpy.data.is_dirty) and os.environ.get("F1_BUILD_FORCE") != "1":
    raise RuntimeError("build_driver.py clears the scene, and this one has work in it. Use a new file, or set F1_BUILD_FORCE=1.")
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
    for block in list(coll):
        coll.remove(block)
scene = bpy.context.scene
scene.render.fps = FPS


def mat(name, color, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*color, 1)
    return m


MATS = {
    "suit": mat("suit", (0.7, 0.0, 0.0), 0.0, 0.62),
    "suit_trim": mat("suit_trim", (0.9, 0.9, 0.9), 0.0, 0.55),
    "gloves": mat("gloves", (0.08, 0.08, 0.09), 0.0, 0.6),
    "boots": mat("boots", (0.05, 0.05, 0.06), 0.1, 0.45),
    "balaclava": mat("balaclava", (0.85, 0.85, 0.83), 0.0, 0.85),
    "helmet": mat("helmet", (1.0, 1.0, 1.0), 0.1, 0.2),
    "trophy": mat("trophy", (1.0, 0.72, 0.22), 1.0, 0.22),
    "bottle": mat("bottle", (0.02, 0.12, 0.05), 0.0, 0.08),
    "foil": mat("foil", (0.95, 0.75, 0.2), 1.0, 0.3),
    # The bare head (driver_head.py); each recoloured per driver.
    "skin": mat("skin", (0.62, 0.42, 0.32), 0.0, 0.5),
    "eye_sclera": mat("eye_sclera", (0.74, 0.69, 0.65), 0.0, 0.25),
    "eye_iris": mat("eye_iris", (0.35, 0.45, 0.3), 0.0, 0.3),
    "eye_cornea": mat("eye_cornea", (1.0, 1.0, 1.0), 0.0, 0.02),
    "lashes": mat("lashes", (0.03, 0.025, 0.02), 0.0, 0.6),
    "brows": mat("brows", (0.08, 0.06, 0.04), 0.0, 0.6),
    "hair": mat("hair", (0.08, 0.06, 0.04), 0.0, 0.45),
    "beard": mat("beard", (0.08, 0.06, 0.04), 0.0, 0.6),
}
_cornea = next(n for n in MATS["eye_cornea"].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
_cornea.inputs["Alpha"].default_value = 0.12


def link(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(MATS[material])
    for p in me.polygons:
        p.use_smooth = True
    return ob


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def ring(centre, axis, side, hw, hd, segs=20, exp=2.4):
    """A superellipse ring round `axis` at `centre`: `hw` across `side`, `hd`
    across the third direction."""
    third = axis.cross(side).normalized()
    out = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c, s = math.cos(a), math.sin(a)
        out.append(centre + side * (hw * math.copysign(abs(c) ** (2 / exp), c))
                   + third * (hd * math.copysign(abs(s) ** (2 / exp), s)))
    return out


def loft_bm(stations, side=Vector((0, 1, 0)), segs=20, exp=2.4, caps=True, bm=None):
    """stations: (point, halfwidth, halfdepth) along a path; domed at both ends."""
    bm = bm or bmesh.new()
    rings = []
    pts = [Vector(p) for p, _, _ in stations]
    for i, (p, hw, hd) in enumerate(stations):
        a = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        sd = (side - a * side.dot(a)).normalized()
        rings.append([bm.verts.new(v) for v in ring(Vector(p), a, sd, hw, hd, segs, exp)])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if caps:
        for rg, p, d, st in ((rings[0], pts[0], (pts[0] - pts[1]).normalized(), stations[0]),
                             (rings[-1], pts[-1], (pts[-1] - pts[-2]).normalized(), stations[-1])):
            r = min(st[1], st[2])
            # Two rings in, then the tip: a rounder dome than a single fan.
            mid = [bm.verts.new(p + (v.co - p) * 0.7 + d * r * 0.55) for v in rg]
            for i in range(segs):
                j = (i + 1) % segs
                bm.faces.new((rg[i], rg[j], mid[j], mid[i]))
            tip = bm.verts.new(p + d * r * 0.8)
            for i in range(segs):
                j = (i + 1) % segs
                bm.faces.new((mid[i], mid[j], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def loft(name, stations, material, side=Vector((0, 1, 0)), segs=20, exp=2.4, caps=True):
    return link(name, loft_bm(stations, side, segs, exp, caps), material)


def tube(a, b, radii, side, segs=12, bm=None):
    """A rounded limb from a to b, its radius at evenly spaced stations."""
    a, b = Vector(a), Vector(b)
    n = len(radii)
    st = []
    for k, r in enumerate(radii):
        if isinstance(r, tuple):
            hw, hd = r
        else:
            hw = hd = r
        st.append((a.lerp(b, k / (n - 1)), hw, hd))
    return loft_bm(st, side, segs, 2.2, True, bm)


# --- The rest pose: joints (metres), an A-pose ------------------------------
A = math.radians(45)
J = {
    "hips": Vector((0, 0, 0.94)),
    "chest": Vector((0, 0, 1.22)),
    "neck": Vector((0, 0, 1.46)),
    "head": Vector((0, 0, 1.56)),
    "crown": Vector((0, 0, 1.80)),
}
ARM_DIR = {}
for s, sgn in (("L", 1), ("R", -1)):
    d = Vector((0, sgn * math.sin(A), -math.cos(A)))
    ARM_DIR[s] = d
    J[f"shoulder_{s}"] = Vector((0, sgn * 0.18, 1.40))
    J[f"elbow_{s}"] = J[f"shoulder_{s}"] + d * 0.29
    J[f"wrist_{s}"] = J[f"elbow_{s}"] + d * 0.255
    J[f"fingers_{s}"] = J[f"wrist_{s}"] + d * 0.09
    J[f"hip_{s}"] = Vector((0, sgn * 0.095, 0.92))
    J[f"knee_{s}"] = Vector((0.02, sgn * 0.115, 0.51))
    J[f"ankle_{s}"] = Vector((0, sgn * 0.12, 0.095))
    J[f"toe_{s}"] = Vector((0.17, sgn * 0.12, 0.03))

# --- Armature ---------------------------------------------------------------
arm_data = bpy.data.armatures.new("driver_rig")
rig = bpy.data.objects.new("driver", arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
BONES = [  # name, head joint, tail joint, parent
    ("root", Vector((0, 0, 0)), J["hips"], None),
    ("spine", J["hips"], J["chest"], "root"),
    ("chest", J["chest"], J["neck"], "spine"),
    ("head", J["neck"], J["crown"], "chest"),
]
for s in ("L", "R"):
    BONES += [
        (f"upper_arm_{s}", J[f"shoulder_{s}"], J[f"elbow_{s}"], "chest"),
        (f"forearm_{s}", J[f"elbow_{s}"], J[f"wrist_{s}"], f"upper_arm_{s}"),
        (f"hand_{s}", J[f"wrist_{s}"], J[f"fingers_{s}"], f"forearm_{s}"),
        (f"thigh_{s}", J[f"hip_{s}"], J[f"knee_{s}"], "root"),
        (f"shin_{s}", J[f"knee_{s}"], J[f"ankle_{s}"], f"thigh_{s}"),
        (f"foot_{s}", J[f"ankle_{s}"], J[f"toe_{s}"], f"shin_{s}"),
    ]
for name, head, tail, parent in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = head, tail
    if parent:
        eb.parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")
BONE_NAMES = [b[0] for b in BONES]

# --- The body: lofts, one per bone they follow ---------------------------------
# Torso stations: (point, half width across Y, half depth across X).
X = Vector((1, 0, 0))
SOURCES = []  # (bone, bmesh)


def src(bone, bm):
    SOURCES.append((bone, bm))


src("root", loft_bm([((-0.005, 0, 0.79), 0.1, 0.075), ((-0.01, 0, 0.84), 0.162, 0.105), ((-0.012, 0, 0.92), 0.176, 0.116), ((-0.005, 0, 1.0), 0.16, 0.104)]))
src("spine", loft_bm([((0, 0, 0.97), 0.158, 0.102), ((0.005, 0, 1.07), 0.15, 0.098), ((0.01, 0, 1.17), 0.158, 0.108)]))
# The top of the chest slopes down from the collar to the shoulders like
# the trapezius under the suit, and the collar stands up round the neck: a
# band nearly upright, never a flat ledge with the neck flaring into it.
src("chest", loft_bm([((0.008, 0, 1.12), 0.152, 0.104), ((0.014, 0, 1.24), 0.168, 0.12), ((0.008, 0, 1.33), 0.176, 0.118),
                      ((0.0, 0, 1.385), 0.172, 0.104), ((0, 0, 1.408), 0.152, 0.094), ((0, 0, 1.428), 0.118, 0.082),
                      ((0, 0, 1.446), 0.082, 0.068), ((0, 0, 1.462), 0.062, 0.058), ((0, 0, 1.49), 0.058, 0.056)]))
src("head", loft_bm([((0.004, 0, 1.45), 0.056, 0.056), ((0.01, 0, 1.52), 0.054, 0.058), ((0.012, 0, 1.59), 0.05, 0.054)], segs=16))
for s, sgn in (("L", 1), ("R", -1)):
    d = ARM_DIR[s]
    sh, el, wr = J[f"shoulder_{s}"], J[f"elbow_{s}"], J[f"wrist_{s}"]
    # The deltoid and upper arm, starting inside the shoulder so it merges.
    src(f"upper_arm_{s}", tube(sh - d * 0.03, el, [0.058, 0.064, 0.058, 0.052, 0.047, 0.044], X, 16))
    src(f"forearm_{s}", tube(el, wr + d * 0.012, [0.044, 0.048, 0.045, 0.039, (0.034, 0.028), (0.032, 0.026)], X, 16))
    hp, kn, an = J[f"hip_{s}"], J[f"knee_{s}"], J[f"ankle_{s}"]
    src(f"thigh_{s}", tube(hp + Vector((0, sgn * 0.005, 0.05)), kn, [0.09, 0.088, 0.08, 0.07, 0.061, 0.055], X, 16))
    src(f"shin_{s}", tube(kn, an + Vector((0, 0, 0.03)),
                         [0.054, (0.056, 0.06), (0.055, 0.062), 0.048, 0.04, 0.037], Vector((0, 1, 0)), 16))

# Each bone's loft as an object, for the remesh and for the weights.
src_objs = []
trees = {}
for i, (bone, bm) in enumerate(SOURCES):
    trees.setdefault(bone, []).append(BVHTree.FromBMesh(bm))
    me = bpy.data.meshes.new(f"src_{i}")
    bm.to_mesh(me)
    ob = bpy.data.objects.new(f"src_{i}", me)
    scene.collection.objects.link(ob)
    src_objs.append(ob)
body = join(src_objs, "body")

# Merge the lofts into one surface, smooth the creases, and reduce.
rm = body.modifiers.new("remesh", "REMESH")
rm.mode = "VOXEL"
rm.voxel_size = 0.0055
sm = body.modifiers.new("smooth", "LAPLACIANSMOOTH")
sm.iterations = 6
sm.lambda_factor = 0.6
sm.use_volume_preserve = True
bpy.context.view_layer.objects.active = body
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)

# Then remesh again, coarser, over the smoothed shape: an even grid of quads
# at the triangle budget shades smoothly, where a decimated mesh blotches.
rm2 = body.modifiers.new("regrid", "REMESH")
rm2.mode = "VOXEL"
rm2.voxel_size = 0.0178
sm2 = body.modifiers.new("smooth2", "LAPLACIANSMOOTH")
sm2.iterations = 2
sm2.lambda_factor = 0.4
sm2.use_volume_preserve = True
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)

# --- Paint the suit by region -------------------------------------------------
for name in ("suit", "suit_trim", "gloves", "balaclava"):
    body.data.materials.append(MATS[name])
SLOT = {name: i for i, name in enumerate(("suit", "suit_trim", "gloves", "balaclava"))}


def nearest_bone(co):
    best, bone = 1e9, None
    for b, ts in trees.items():
        for t in ts:
            hit = t.find_nearest(co)
            if hit[0] is not None and hit[3] < best:
                best, bone = hit[3], b
    return bone


def radial(c, a, axis):
    """The direction from the axis through `a` out to the point `c`."""
    v = c - a
    return (v - axis * v.dot(axis)).normalized()


STRIPE = math.radians(19)  # half the stripe's width round the limb
LEGS = {}
for s, sgn in (("L", 1), ("R", -1)):
    LEGS[f"thigh_{s}"] = (J[f"hip_{s}"], (J[f"knee_{s}"] - J[f"hip_{s}"]).normalized())
    LEGS[f"shin_{s}"] = (J[f"knee_{s}"], (J[f"ankle_{s}"] - J[f"knee_{s}"]).normalized())


def arm_up(s):
    sgn = 1 if s == "L" else -1
    return Vector((0, sgn * math.cos(A), math.sin(A)))


def leg_out(bone):
    sgn = 1 if bone.endswith("L") else -1
    _, axis = LEGS[bone]
    o = Vector((0, sgn, 0))
    return (o - axis * o.dot(axis)).normalized()


def region(c, bone):
    side = 1 if c.y > 0 else -1
    s = "L" if side > 0 else "R"
    if c.z > 1.478 and abs(c.y) < 0.12:
        return "balaclava"
    if c.z > 1.458 and abs(c.y) < 0.12:
        return "suit_trim"  # the collar band
    if bone in ("root", "spine", "chest") and 0.985 < c.z < 1.03:
        return "suit_trim"  # the belt
    if bone in ("spine", "chest") and abs(c.x) < 0.032 and abs(c.y) > 0.1 and 1.05 < c.z < 1.37:
        return "suit_trim"  # the side panels
    if bone in ("chest", f"upper_arm_{s}") and c.z > 1.37 and 0.09 < abs(c.y) < 0.215 and abs(c.x) < 0.02:
        return "suit_trim"  # the epaulettes
    if bone.startswith("forearm") and (c - J[f"elbow_{s}"]).dot(ARM_DIR[s]) > 0.255 * 0.86:
        return "gloves"  # the glove's cuff
    if bone.startswith(("upper_arm", "forearm")) and radial(c, J[f"shoulder_{s}"], ARM_DIR[s]).dot(arm_up(s)) > math.cos(STRIPE):
        return "suit_trim"  # the stripe down the outside of the arm
    if bone in LEGS and c.z > 0.16:
        a, axis = LEGS[bone]
        if radial(c, a, axis).dot(leg_out(bone)) > math.cos(STRIPE):
            return "suit_trim"  # the stripe down the outside of the leg
    return "suit"


# Cut the mesh along every region's edge, each plane only where that edge is.
bm = bmesh.new()
bm.from_mesh(body.data)


def cut(co, no, where):
    faces = [f for f in bm.faces if where(f.calc_center_median())]
    if not faces:
        return
    edges = list({e for f in faces for e in f.edges})
    verts = list({v for f in faces for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=verts + edges + faces, plane_co=co, plane_no=no, dist=1e-5)


Z = Vector((0, 0, 1))
near_neck = lambda c: abs(c.y) < 0.13 and 1.4 < c.z < 1.52
cut(Vector((0, 0, 1.478)), Z, near_neck)
cut(Vector((0, 0, 1.458)), Z, near_neck)
torso = lambda c: abs(c.y) < 0.21 and 0.9 < c.z < 1.42
for z in (0.985, 1.03, 1.05, 1.37):
    cut(Vector((0, 0, z)), Z, torso)
for x in (0.032, -0.032):
    cut(Vector((x, 0, 0)), X, lambda c: abs(c.y) > 0.09 and 1.0 < c.z < 1.4)
for x in (0.02, -0.02):
    cut(Vector((x, 0, 0)), X, lambda c: c.z > 1.33 and 0.06 < abs(c.y) < 0.25)
for y in (0.09, -0.09, 0.215, -0.215):
    cut(Vector((0, y, 0)), Vector((0, 1, 0)), lambda c: c.z > 1.33 and abs(c.x) < 0.05)
for s, sgn in (("L", 1), ("R", -1)):
    d, sh = ARM_DIR[s], J[f"shoulder_{s}"]
    arm = lambda c, sgn=sgn, sh=sh, d=d: sgn * c.y > 0.17 and 0 < (c - sh).dot(d) < 0.6
    cut(J[f"elbow_{s}"] + d * 0.255 * 0.86, d, arm)
    up = arm_up(s)
    w = d.cross(up).normalized()
    for k in (1, -1):
        r = up * math.cos(STRIPE) + w * math.sin(STRIPE) * k
        cut(sh, d.cross(r).normalized(), arm)
    for bone in (f"thigh_{s}", f"shin_{s}"):
        a, axis = LEGS[bone]
        o = leg_out(bone)
        w = axis.cross(o).normalized()
        span = (J[f"knee_{s}"] - J[f"hip_{s}"]).length if bone.startswith("thigh") else (J[f"ankle_{s}"] - J[f"knee_{s}"]).length
        leg = lambda c, a=a, axis=axis, span=span, sgn=sgn: sgn * c.y > 0.0 and c.z < 0.97 and -0.02 < (c - a).dot(axis) < span + 0.02
        for k in (1, -1):
            r = o * math.cos(STRIPE) + w * math.sin(STRIPE) * k
            cut(a, axis.cross(r).normalized(), leg)
    cut(Vector((0, 0, 0.16)), Z, lambda c, sgn=sgn: sgn * c.y > 0 and c.z < 0.3)

bmesh.ops.triangulate(bm, faces=bm.faces[:])
for f in bm.faces:
    c = f.calc_center_median()
    f.material_index = SLOT[region(c, nearest_bone(c))]
    f.smooth = True
bm.to_mesh(body.data)
bm.free()
body.data.validate()
print("body triangles", len(body.data.polygons))

# --- Skin weights: the loft each vertex came from, smoothed across the joints ---
mesh = body.data
nbrs = [[] for _ in mesh.vertices]
for e in mesh.edges:
    a, b = e.vertices
    nbrs[a].append(b)
    nbrs[b].append(a)
W = []
for v in mesh.vertices:
    W.append({nearest_bone(v.co): 1.0})
for _ in range(12):
    nxt = []
    for i, w in enumerate(W):
        acc = {k: 0.5 * x for k, x in w.items()}
        nb = nbrs[i]
        for j in nb:
            for k, x in W[j].items():
                acc[k] = acc.get(k, 0.0) + 0.5 * x / len(nb)
        nxt.append(acc)
    W = nxt
groups = {b: body.vertex_groups.new(name=b) for b in BONE_NAMES}
for i, w in enumerate(W):
    top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    total = sum(x for _, x in top)
    for b, x in top:
        if x / total > 0.01:
            groups[b].add([i], x / total, "REPLACE")
body.parent = rig
mod = body.modifiers.new("rig", "ARMATURE")
mod.object = rig

# --- The rigid parts ---------------------------------------------------------
parts = []


def part(ob, bone):
    parts.append((ob, bone))
    return ob


# The helmet (the car's shell) sits down over the balaclava.
HC = J["head"] + Vector((0.01, 0, 0.078))
part(link("helmet", helmet_bmesh(HC.x, HC.z), "helmet"), "head")
sp = link("helmet_spoiler", spoiler_bmesh(HC.x, HC.z), "helmet")
spoiler_uvs(sp)
part(sp, "head")

# The bare head (shown when the helmet is off): the head and neck are skinned,
# the head bone above the jaw blending into the chest down the neck; the eyes,
# lashes, brows, hair and beards ride on the head bone.
# The suit's collar: a band standing up round the neck, rolled over at its
# top, rising out of the slope of the shoulders (the body's own trim band is
# under it). Rings of (height, half width, half depth), out and up, over the
# lip and back down inside.
COLLAR_RINGS = [(1.432, 0.066, 0.061), (1.454, 0.0645, 0.0602), (1.471, 0.0636, 0.0596), (1.4765, 0.0618, 0.0578),
                (1.4775, 0.0598, 0.0558), (1.475, 0.0584, 0.0544), (1.458, 0.0582, 0.0542)]
COLLAR_X = 0.002


def collar_band(segs=48):
    bm = bmesh.new()
    rows = []
    for z, hw, hd in COLLAR_RINGS:
        rows.append([bm.verts.new((COLLAR_X + hd * math.cos(2 * math.pi * k / segs), hw * math.sin(2 * math.pi * k / segs), z))
                     for k in range(segs)])
    for a, b in zip(rows, rows[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((a[k], a[j], b[j], b[k]))
    return bm


collar_ob = link("collar", collar_band(), "suit_trim")
# Outward on the outside, inward (toward the neck) on the inside: the band's
# winding runs that way round, checked rather than assumed.
collar_ob.data.update()
if collar_ob.data.polygons[0].normal.dot(Vector((collar_ob.data.polygons[0].center.x - COLLAR_X, collar_ob.data.polygons[0].center.y, 0))) < 0:
    for poly in collar_ob.data.polygons:
        poly.flip()
part(collar_ob, "chest")
# The neck is fitted inside the collar's lip.
z_in, hw_in, hd_in = COLLAR_RINGS[-2]
collar = [(COLLAR_X + hd_in * math.cos(2 * math.pi * k / 48), hw_in * math.sin(2 * math.pi * k / 48)) for k in range(48)]
head_skin, head_parts = driver_head.build(MATS, collar)
hg = head_skin.vertex_groups.new(name="head")
cg = head_skin.vertex_groups.new(name="chest")
# (The bend is all below the beard and the hair, which ride the head bone
# rigidly: the skin under them must move exactly as they do.)
LOWEST_HAIR = min(min((ob.matrix_world @ v.co).z for v in ob.data.vertices) for ob in head_parts if ob.name in ("hair", "beard"))
if LOWEST_HAIR < 1.505:
    raise RuntimeError(f"hair reaches down to {LOWEST_HAIR:.3f} m, into the neck's bend")
for v in head_skin.data.vertices:
    w = driver_head.smoothstep(1.477, 1.505, v.co.z)
    hg.add([v.index], w, "REPLACE")
    if w < 1:
        cg.add([v.index], 1 - w, "REPLACE")
head_skin.parent = rig
head_skin.modifiers.new("rig", "ARMATURE").object = rig
for ob in head_parts:
    if ob is not head_skin:
        part(ob, "head")


def hand(s, sgn):
    """A gloved hand: palm, four fingers in two segments curled a little,
    and a thumb on the forward side."""
    d = ARM_DIR[s]
    w = J[f"wrist_{s}"]
    palm_n = Vector((0, -sgn * math.cos(A), -math.sin(A)))  # the way the palm faces
    fwd = Vector((1, 0, 0))  # the thumb's side
    bm = bmesh.new()
    loft_bm([(w - d * 0.01, 0.033, 0.022), (w + d * 0.035, 0.043, 0.02), (w + d * 0.08, 0.044, 0.016)], fwd, 14, 2.6, True, bm)
    for k, across in enumerate((0.03, 0.01, -0.01, -0.029)):
        length = (0.046, 0.05, 0.047, 0.038)[k]
        base = w + d * 0.078 + fwd * across
        # Curled toward the palm, more at the second joint.
        dir1 = (d * math.cos(math.radians(22)) + palm_n * math.sin(math.radians(22))).normalized()
        mid = base + dir1 * length * 0.55
        dir2 = (d * math.cos(math.radians(55)) + palm_n * math.sin(math.radians(55))).normalized()
        tip = mid + dir2 * length * 0.45
        r = 0.0095 if k < 3 else 0.0085
        tube(base, mid, [r, r * 0.98, r * 0.95], fwd, 10, bm)
        tube(mid, tip, [r * 0.95, r * 0.9, r * 0.82], fwd, 10, bm)
    tb = w + d * 0.025 + fwd * 0.035 + palm_n * 0.008
    tdir = (d * 0.7 + fwd * 0.55 + palm_n * 0.35).normalized()
    tm = tb + tdir * 0.035
    tt = tm + (d * 0.85 + palm_n * 0.5).normalized() * 0.03
    tube(tb, tm, [0.013, 0.012, 0.011], fwd, 10, bm)
    tube(tm, tt, [0.011, 0.0105, 0.009], fwd, 10, bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(f"hand_{s}", bm, "gloves")


def boot(s):
    """A race boot: sole, heel, toe box, and a collar up over the ankle."""
    a = J[f"ankle_{s}"]
    base = Vector((a.x, a.y, 0))
    bm = bmesh.new()
    loft_bm([(base + Vector((-0.085, 0, 0.058)), 0.04, 0.056), (base + Vector((-0.04, 0, 0.07)), 0.046, 0.07),
             (base + Vector((0.04, 0, 0.056)), 0.05, 0.054), (base + Vector((0.12, 0, 0.037)), 0.047, 0.035),
             (base + Vector((0.19, 0, 0.026)), 0.034, 0.023)], Vector((0, 1, 0)), 18, 2.6, True, bm)
    # The sole, a touch wider, flat on the ground.
    loft_bm([(base + Vector((-0.09, 0, 0.009)), 0.042, 0.009), (base + Vector((0.0, 0, 0.009)), 0.051, 0.009),
             (base + Vector((0.13, 0, 0.009)), 0.05, 0.009), (base + Vector((0.2, 0, 0.009)), 0.034, 0.009)],
            Vector((0, 1, 0)), 18, 3.0, True, bm)
    # The collar over the ankle, into the trouser leg.
    loft_bm([(base + Vector((-0.012, 0, 0.06)), 0.05, 0.056), (base + Vector((-0.008, 0, 0.13)), 0.046, 0.05),
             (base + Vector((-0.006, 0, 0.17)), 0.043, 0.046)], Vector((0, 1, 0)), 18, 2.4, True, bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(f"boot_{s}", bm, "boots")


for s, sgn in (("L", 1), ("R", -1)):
    part(hand(s, sgn), f"hand_{s}")
    part(boot(s), f"foot_{s}")


# --- Props on the right hand ---------------------------------------------------
def lathe(name, profile, material, centre, axis, segs=28):
    """profile: (radius, height) pairs, turned about `axis` through `centre`."""
    axis = axis.normalized()
    u = axis.orthogonal().normalized()
    v = axis.cross(u)
    bm = bmesh.new()
    rings = []
    for r, h in profile:
        rings.append([bm.verts.new(centre + axis * h + (u * math.cos(2 * math.pi * k / segs) + v * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((r0[k], r0[j], r1[j], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, material), u


dR = ARM_DIR["R"]
palmR = Vector((0, math.cos(A), -math.sin(A)))
grip = J["wrist_R"] + dR * 0.055 + palmR * 0.03
# Heights run against the hand: the cup and the bottle's neck lie past the
# fingers, so when the hand points up the cup is on top.
up = -dR
# The trophy: a cup on a stem and a plinth, gripped at the stem.
trophy, tu = lathe("trophy", [(0.08, -0.21), (0.085, -0.2), (0.075, -0.1), (0.03, -0.03), (0.016, 0.0), (0.02, 0.08), (0.05, 0.09), (0.05, 0.12)], "trophy", grip, up)
handles = []
for sg in (1, -1):
    handles.append(link(f"trophy_handle_{sg}", tube(grip + tu * sg * 0.08 + up * -0.17, grip + tu * sg * 0.11 + up * -0.1, [0.008, 0.008, 0.008], X, 8), "trophy"))
trophy = join([trophy] + handles, "trophy")
part(trophy, "hand_R")
# The bottle: champagne green, gold foil at the neck, held by its body.
bottle, _ = lathe("bottle", [(0.042, 0.14), (0.045, 0.12), (0.045, -0.02), (0.035, -0.06), (0.016, -0.1), (0.015, -0.15), (0.013, -0.16)], "bottle", grip, up)
foil, _ = lathe("foil", [(0.0165, -0.1), (0.0175, -0.16), (0.012, -0.17)], "foil", grip, up)
bottle = join([bottle, foil], "bottle")
part(bottle, "hand_R")

# --- Parent every rigid part to its bone, keeping it where it is ---------------
bpy.context.view_layer.update()
for ob, bone in parts:
    mw = ob.matrix_world.copy()
    ob.parent = rig
    ob.parent_type = "BONE"
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = mw

# --- Poses ---------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="POSE")
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"


def reset_pose():
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    bpy.context.view_layer.update()


def aim(bone, direction, twist=0.0):
    """Turn a bone (after its parents are posed) to point along `direction`
    in the rig's space, with an optional twist about itself."""
    pb = rig.pose.bones[bone]
    bpy.context.view_layer.update()
    m = pb.matrix.copy()
    cur = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    rot = q.to_matrix().to_4x4()
    if twist:
        rot = rot @ Matrix.Rotation(twist, 4, cur)
    t = Matrix.Translation(m.translation)
    pb.matrix = t @ rot @ t.inverted() @ m
    bpy.context.view_layer.update()


def key_all(frame):
    for pb in rig.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def up_v(side_sign, spread=0.45, fwd=0.05):
    return Vector((fwd, side_sign * spread, 1.0))


# Each pose: frames, and for each keyframe a function that poses the rig.
def stand(breath):
    rig.pose.bones["root"].location = Vector((0, 0, 0))
    aim("chest", (0.02 * breath, 0, 1))
    for s, sgn in (("L", 1), ("R", -1)):
        aim(f"upper_arm_{s}", (0.04, sgn * 0.2, -1))
        aim(f"forearm_{s}", (0.16, sgn * 0.1, -1))


def wave(t):
    stand(0)
    aim("upper_arm_R", (0.15, -0.75, 0.75))
    aim("forearm_R", (0.1, -0.25 + 0.35 * math.sin(t), 1.0))
    aim("hand_R", (0.05, -0.2 + 0.3 * math.sin(t), 1.0))


# (The root bone points up, so its own Y is the world's up: a bob is along Y.)
def arms_up(t):
    rig.pose.bones["root"].location = Vector((0, 0.03 * abs(math.sin(t)), 0))
    aim("chest", (0.0, 0, 1))
    aim("head", (0.08, 0, 1))
    for s, sgn in (("L", 1), ("R", -1)):
        aim(f"upper_arm_{s}", up_v(sgn, 0.55 + 0.05 * math.sin(t)))
        aim(f"forearm_{s}", up_v(sgn, 0.35))
        aim(f"hand_{s}", up_v(sgn, 0.3))


def trophy_up(t):
    rig.pose.bones["root"].location = Vector((0, 0.02 * abs(math.sin(t)), 0))
    aim("chest", (-0.03, 0, 1))
    aim("head", (0.12, 0, 1))
    aim("upper_arm_R", (0.08, -0.32, 1.0))
    aim("forearm_R", (0.02, 0.12, 1.0))
    aim("hand_R", (0.0, 0.05, 1.0))
    aim("upper_arm_L", (0.08, 0.32, 1.0))
    aim("forearm_L", (0.02, -0.28, 1.0))
    aim("hand_L", (0.0, -0.3, 0.8))


def spray(t):
    stand(0)
    aim("chest", (0.05, 0, 1))
    shake = 0.12 * math.sin(t * 3)
    # The bottle out in front and to the side, pointing forward and up, away
    # from the helmet: spraying, not drinking.
    aim("upper_arm_R", (0.45, -0.55, 0.2 + shake))
    aim("forearm_R", (0.6, -0.6, 0.35 + shake))
    aim("hand_R", (0.7, -0.4, 0.45))
    aim("upper_arm_L", (0.4, 0.25, -0.4))
    aim("forearm_L", (0.7, -0.1, 0.1))


# Each pose: its length in frames, how often it is keyed (the spray's shake
# is quick: keyed every frame, or its keys would all fall on its zeros), and
# the function that poses it.
POSES = {
    "stand": (60, 5, lambda f: stand(math.sin(2 * math.pi * f / 60))),
    "wave": (40, 4, lambda f: wave(2 * math.pi * f / 40)),
    "arms_up": (40, 4, lambda f: arms_up(2 * math.pi * f / 40)),
    "trophy": (60, 5, lambda f: trophy_up(2 * math.pi * f / 60)),
    "spray": (30, 1, lambda f: spray(2 * math.pi * f / 30)),
}
rig.animation_data_create()
actions = {}
BOOTS = [bpy.data.objects["boot_L"], bpy.data.objects["boot_R"]]


def lowest_boot():
    bpy.context.view_layer.update()
    return min((b.matrix_world @ v.co).z for b in BOOTS for v in b.data.vertices)


for name, (length, every, pose) in POSES.items():
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    for f in range(0, length + 1, every):
        reset_pose()
        pose(f)
        # Standing on the podium, never in it.
        low = lowest_boot()
        if low < -0.005:
            raise RuntimeError(f"{name} frame {f}: a boot is {-low * 100:.1f} cm below the ground")
        key_all(f)
    actions[name] = act
    # Each action on its own NLA track, so the exporter writes them all.
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    track.mute = True
rig.animation_data.action = None
reset_pose()
bpy.ops.object.mode_set(mode="OBJECT")

# --- Preview renders -------------------------------------------------------------
if PREVIEW:
    engines = [i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 700, 900
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs["Color"].default_value = (0.3, 0.32, 0.36, 1)
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(40))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (3.4, 1.6, 1.3)
    cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    props = {"trophy": bpy.data.objects["trophy"], "spray": bpy.data.objects["bottle"]}
    for name, (length, _every, pose) in POSES.items():
        rig.animation_data.action = actions[name]
        for pname, pob in (("trophy", props["trophy"]), ("spray", props["spray"])):
            pob.hide_render = pname != name
        scene.frame_set(length // 4 + 1)
        scene.render.filepath = os.path.join(PREVIEW, f"driver_{name}.png")
        bpy.ops.render.render(write_still=True)
    rig.animation_data.action = None
    for pob in props.values():
        pob.hide_render = False
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)

if OUT:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                              export_animations=True, export_animation_mode="NLA_TRACKS",
                              export_morph=True, export_morph_normal=False, export_try_sparse_sk=True,
                              export_vertex_color="NONE",
                              export_attributes=True, export_extras=True)
    print("exported", OUT)
