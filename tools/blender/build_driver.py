"""Build the race driver figure used by the podium ceremony, and export it to
assets/driver.glb (docs/superpowers/specs/2026-09-30-car-v2-design.md).

Run headless, so it never touches an open Blender session:

  F1_DRIVER_OUT=assets/driver.glb Blender -b --factory-startup -P tools/blender/build_driver.py

Set F1_DRIVER_PREVIEW=<dir> to also render every pose there for review.

A driver in a race suit, about 1.78 m tall, standing on the ground at the
origin and facing +X (Y left, Z up, metres). The figure is a jointed rig:
each part is its own rounded mesh parented to its bone, so it holds its shape
in any pose, needs no skin weights, and exports to glTF as a node hierarchy
three.js animates directly.

Materials by role, recoloured per team and driver as the car is (r3d/car.js):
suit, suit_trim, gloves, boots, balaclava, helmet (the car's shell and UVs,
f1parts.py, so each driver's painted design carries over), and the props'
trophy, bottle and foil.

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from f1parts import helmet_bmesh, spoiler_bmesh, spoiler_uvs  # noqa: E402

OUT = os.environ.get("F1_DRIVER_OUT", "")
PREVIEW = os.environ.get("F1_DRIVER_PREVIEW", "")
FPS = 30

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
    "suit": mat("suit", (0.7, 0.0, 0.0), 0.0, 0.55),
    "suit_trim": mat("suit_trim", (0.9, 0.9, 0.9), 0.0, 0.5),
    "gloves": mat("gloves", (0.08, 0.08, 0.09), 0.0, 0.6),
    "boots": mat("boots", (0.05, 0.05, 0.06), 0.1, 0.45),
    "balaclava": mat("balaclava", (0.85, 0.85, 0.83), 0.0, 0.8),
    "helmet": mat("helmet", (1.0, 1.0, 1.0), 0.1, 0.2),
    "trophy": mat("trophy", (1.0, 0.72, 0.22), 1.0, 0.22),
    "bottle": mat("bottle", (0.02, 0.12, 0.05), 0.0, 0.08),
    "foil": mat("foil", (0.95, 0.75, 0.2), 1.0, 0.3),
}


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


def loft(name, stations, material, side=Vector((0, 1, 0)), segs=20, exp=2.4, caps=True):
    """stations: (point, halfwidth, halfdepth) along a path; rounded at both ends."""
    bm = bmesh.new()
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
        # Domed ends: a centre point pushed out along the path.
        for rg, p, d in ((rings[0], pts[0], (pts[0] - pts[1]).normalized()), (rings[-1], pts[-1], (pts[-1] - pts[-2]).normalized())):
            r = min(stations[0][1], stations[0][2]) if rg is rings[0] else min(stations[-1][1], stations[-1][2])
            tip = bm.verts.new(p + d * r * 0.6)
            for i in range(segs):
                j = (i + 1) % segs
                f = bm.faces.new((rg[i], rg[j], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, material)


def capsule(name, a, b, ra, rb, material, n=5):
    a, b = Vector(a), Vector(b)
    return loft(name, [(a.lerp(b, t / (n - 1)), ra + (rb - ra) * t / (n - 1), ra + (rb - ra) * t / (n - 1)) for t in range(n)], material,
                side=Vector((0, 1, 0)) if abs((b - a).normalized().y) < 0.9 else Vector((1, 0, 0)))


def ball(centre, r):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r)
    for v in bm.verts:
        v.co += Vector(centre)
    return bm


# --- The rest pose: joints (metres) -----------------------------------------
J = {
    "hips": Vector((0, 0, 0.94)),
    "chest": Vector((0, 0, 1.22)),
    "neck": Vector((0, 0, 1.46)),
    "head": Vector((0, 0, 1.56)),
    "crown": Vector((0, 0, 1.80)),
}
for s, sgn in (("L", 1), ("R", -1)):
    J[f"shoulder_{s}"] = Vector((0, sgn * 0.205, 1.42))
    J[f"elbow_{s}"] = Vector((0.0, sgn * 0.245, 1.13))
    J[f"wrist_{s}"] = Vector((0.03, sgn * 0.255, 0.88))
    J[f"fingers_{s}"] = Vector((0.04, sgn * 0.26, 0.79))
    J[f"hip_{s}"] = Vector((0, sgn * 0.1, 0.92))
    J[f"knee_{s}"] = Vector((0.02, sgn * 0.11, 0.51))
    J[f"ankle_{s}"] = Vector((0, sgn * 0.11, 0.1))
    J[f"toe_{s}"] = Vector((0.17, sgn * 0.11, 0.04))

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
ORDER = [b[0] for b in BONES]

parts = []


def part(ob, bone):
    parts.append((ob, bone))
    return ob


# --- The body ------------------------------------------------------------------
# Pelvis and torso, the suit's main colour; a collar and a belt in the trim.
# One continuous shape from the hips to the shoulders (the hips move with the
# spine, the chest with the chest bone; they overlap at the waist).
part(loft("pelvis", [((0, 0, 0.80), 0.1, 0.09), ((0, 0, 0.86), 0.165, 0.11), ((0, 0, 0.95), 0.175, 0.115), ((0, 0, 1.08), 0.158, 0.108)], "suit"), "spine")
part(loft("torso", [((0, 0, 1.0), 0.156, 0.106), ((0, 0, 1.16), 0.165, 0.115), ((0.01, 0, 1.3), 0.188, 0.125),
                    ((0.0, 0, 1.39), 0.2, 0.118), ((0, 0, 1.45), 0.15, 0.1), ((0, 0, 1.48), 0.09, 0.08)], "suit"), "chest")
part(loft("belt", [((0, 0, 0.995), 0.172, 0.118), ((0, 0, 1.035), 0.17, 0.117)], "suit_trim", caps=False), "spine")
part(loft("collar", [((0, 0, 1.455), 0.075, 0.07), ((0, 0, 1.49), 0.07, 0.066)], "suit_trim", caps=False), "chest")
# The side panels down the torso, in the trim colour.
for s, sgn in (("L", 1), ("R", -1)):
    part(loft(f"torso_panel_{s}", [((0, sgn * 0.16, 1.04), 0.012, 0.05), ((0, sgn * 0.178, 1.25), 0.012, 0.06), ((0, sgn * 0.19, 1.38), 0.012, 0.05)], "suit_trim", side=Vector((0, 1, 0))), "chest")
part(capsule("neck", (0, 0, 1.44), (0, 0, 1.54), 0.052, 0.05, "balaclava"), "head")
# The head is the helmet (the face behind the visor is never seen); its skirt
# sits down on the collar.
HC = J["head"] + Vector((0.01, 0, 0.1))
part(link("helmet", helmet_bmesh(HC.x, HC.z), "helmet"), "head")
sp = link("helmet_spoiler", spoiler_bmesh(HC.x, HC.z), "helmet")
spoiler_uvs(sp)
part(sp, "head")

for s, sgn in (("L", 1), ("R", -1)):
    # Rounded joints, so a bent arm or leg reads as one limb, not segments.
    part(link(f"shoulder_ball_{s}", ball(J[f"shoulder_{s}"], 0.066), "suit"), f"upper_arm_{s}")
    part(link(f"elbow_ball_{s}", ball(J[f"elbow_{s}"], 0.048), "suit"), f"forearm_{s}")
    part(link(f"knee_ball_{s}", ball(J[f"knee_{s}"], 0.064), "suit"), f"shin_{s}")
    part(capsule(f"upper_arm_{s}", J[f"shoulder_{s}"], J[f"elbow_{s}"], 0.058, 0.048, "suit"), f"upper_arm_{s}")
    part(capsule(f"forearm_{s}", J[f"elbow_{s}"], J[f"wrist_{s}"] + Vector((0, 0, 0.02)), 0.046, 0.037, "suit"), f"forearm_{s}")
    # The trim's stripe down the outside of the arm.
    out = Vector((0, sgn * 0.045, 0))
    part(capsule(f"arm_stripe_{s}", J[f"shoulder_{s}"] + out * 1.1 + Vector((0, 0, -0.04)), J[f"elbow_{s}"] + out * 0.95, 0.015, 0.013, "suit_trim"), f"upper_arm_{s}")
    # Gloved hand: a flattened mitt with a thumb.
    w, f = J[f"wrist_{s}"], J[f"fingers_{s}"]
    part(loft(f"hand_{s}", [(w, 0.035, 0.022), (w.lerp(f, 0.5), 0.042, 0.026), (f, 0.036, 0.02)], "gloves", side=Vector((1, 0, 0))), f"hand_{s}")
    part(capsule(f"thumb_{s}", w + Vector((0.03, -sgn * 0.005, -0.02)), w + Vector((0.055, -sgn * 0.01, -0.06)), 0.013, 0.011, "gloves"), f"hand_{s}")
    part(capsule(f"thigh_{s}", J[f"hip_{s}"] + Vector((0, 0, 0.03)), J[f"knee_{s}"], 0.085, 0.062, "suit"), f"thigh_{s}")
    part(capsule(f"shin_{s}", J[f"knee_{s}"], J[f"ankle_{s}"] + Vector((0, 0, 0.05)), 0.058, 0.045, "suit"), f"shin_{s}")
    legout = Vector((0, sgn * 0.075, 0))
    part(capsule(f"leg_stripe_{s}", J[f"hip_{s}"] + legout, J[f"knee_{s}"] + legout * 0.72, 0.017, 0.014, "suit_trim"), f"thigh_{s}")
    part(capsule(f"shin_stripe_{s}", J[f"knee_{s}"] + legout * 0.7, J[f"ankle_{s}"] + legout * 0.55 + Vector((0, 0, 0.08)), 0.014, 0.012, "suit_trim"), f"shin_{s}")
    # Boots: from the ankle forward to the toe, flat soled.
    a, t = J[f"ankle_{s}"], J[f"toe_{s}"]
    part(loft(f"boot_{s}", [(a + Vector((-0.07, 0, -0.02)), 0.045, 0.05), (a + Vector((0.02, 0, -0.04)), 0.05, 0.055),
                            (t + Vector((-0.04, 0, -0.005)), 0.045, 0.035), (t + Vector((0.02, 0, -0.01)), 0.035, 0.025)], "boots", side=Vector((0, 1, 0))), f"foot_{s}")

# --- Props on the right hand ---------------------------------------------------
def lathe(name, profile, material, centre, segs=28):
    """profile: (radius, height) pairs from the bottom up, turned about Z."""
    bm = bmesh.new()
    rings = []
    for r, h in profile:
        rings.append([bm.verts.new((centre.x + r * math.cos(2 * math.pi * k / segs), centre.y + r * math.sin(2 * math.pi * k / segs), centre.z + h)) for k in range(segs)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((r0[k], r0[j], r1[j], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm, material)


grip = J["fingers_R"].lerp(J["wrist_R"], 0.4)
# The trophy: a cup on a stem and a plinth, gripped at the stem.
# (Built upside down: the hand points down at rest and up when it lifts the
# trophy, so the cup ends up on top.)
trophy = lathe("trophy", [(0.08, -0.21), (0.085, -0.2), (0.075, -0.1), (0.03, -0.03), (0.016, 0.0), (0.02, 0.08), (0.05, 0.09), (0.05, 0.12)], "trophy", grip)
for s, sgn in ((0, 1), (1, -1)):
    capsule(f"trophy_handle_{s}", grip + Vector((0, sgn * 0.08, -0.17)), grip + Vector((0, sgn * 0.11, -0.1)), 0.008, 0.008, "trophy")
    bpy.context.view_layer.objects.active = trophy
    h = bpy.data.objects[f"trophy_handle_{s}"]
    bpy.ops.object.select_all(action="DESELECT")
    h.select_set(True)
    trophy.select_set(True)
    bpy.ops.object.join()
part(trophy, "hand_R")
# The bottle: champagne green, gold foil at the neck, held by its body.
# (Its neck runs along the fingers, so it points where the hand points.)
bottle = lathe("bottle", [(0.042, 0.14), (0.045, 0.12), (0.045, -0.02), (0.035, -0.06), (0.016, -0.1), (0.015, -0.15), (0.013, -0.16)], "bottle", grip)
foil = lathe("foil", [(0.0165, -0.1), (0.0175, -0.16), (0.012, -0.17)], "foil", grip)
bpy.ops.object.select_all(action="DESELECT")
foil.select_set(True)
bottle.select_set(True)
bpy.context.view_layer.objects.active = bottle
bpy.ops.object.join()
part(bottle, "hand_R")

# --- Parent every part to its bone, keeping it where it is ---------------------
bpy.context.view_layer.update()
for ob, bone in parts:
    mw = ob.matrix_world.copy()
    ob.parent = rig
    ob.parent_type = "BONE"
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = mw

# --- Poses ---------------------------------------------------------------------
bpy.context.view_layer.objects.active = rig
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
        aim(f"upper_arm_{s}", (0.05, sgn * 0.14, -1))
        aim(f"forearm_{s}", (0.18, sgn * 0.06, -1))


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
    aim("upper_arm_R", (0.55, -0.3, 0.35 + shake))
    aim("forearm_R", (0.8, -0.05, 0.6 + shake))
    aim("hand_R", (0.6, 0.0, 0.8))
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
                              export_animations=True, export_animation_mode="NLA_TRACKS")
    print("exported", OUT)
