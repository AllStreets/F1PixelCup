"""Build the trackside people and export them to assets/people.glb
(docs/superpowers/specs/2026-10-01-trackside-blender-design.md, section 4).

Run headless, so it never touches an open Blender session:

  F1_PEOPLE_OUT=assets/people.glb Blender -b --factory-startup -P tools/blender/build_people.py

Set F1_PEOPLE_PREVIEW=<dir> to also render the line-up there for review.

Low poly figures with the driver figure's proportions (build_driver.py): about
1.75 m, hips at 0.92 m, shoulders at 1.42 m, standing on the ground at the
origin and facing +X (Y left, Z up, metres).

  crowd_a .. crowd_d  four spectators (instanced in three.js by the thousand,
                      so each is under 300 triangles)
  crew                a pit crew member in team kit, with a headset
  photographer        with a long lens on a monopod
  camera_operator     behind a broadcast camera on its tripod
  tv_platform         the scaffold tower the camera crew stands on

Materials by role, recoloured per instance in the game (r3d/people.js): skin,
hair, shirt, trousers, shoes, trim, gear, lens; the platform's steel and deck.

Each figure's parts are marked in its UVs, u = (part + 0.5) / 16, so the
vertex shader can pose it (seated or standing, arms down or waving) about the
joints written to the object's extras (in glTF axes: x forward, y up, z right):

  0 torso  1 head  2 upper_arm_L  3 forearm_L  4 upper_arm_R  5 forearm_R
  6 thigh_L  7 shin_L  8 thigh_R  9 shin_R  10 fixed (props)
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

OUT = os.environ.get("F1_PEOPLE_OUT", "")
PREVIEW = os.environ.get("F1_PEOPLE_PREVIEW", "")

if (bpy.data.filepath or bpy.data.is_dirty) and os.environ.get("F1_BUILD_FORCE") != "1":
    raise RuntimeError("build_people.py clears the scene, and this one has work in it. Use a new file, or set F1_BUILD_FORCE=1.")
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials):
    for block in list(coll):
        coll.remove(block)
scene = bpy.context.scene

PART = {"torso": 0, "head": 1, "upper_arm_L": 2, "forearm_L": 3, "upper_arm_R": 4, "forearm_R": 5,
        "thigh_L": 6, "shin_L": 7, "thigh_R": 8, "shin_R": 9, "fixed": 10}


def mat(name, color, metal=0.0, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*color, 1)
    return m


# Defaults only (the game recolours them per figure).
MATS = {
    "skin": mat("skin", (0.62, 0.42, 0.30), rough=0.6),
    "hair": mat("hair", (0.08, 0.05, 0.03), rough=0.8),
    "shirt": mat("shirt", (0.10, 0.30, 0.70)),
    "trousers": mat("trousers", (0.10, 0.12, 0.18)),
    "shoes": mat("shoes", (0.06, 0.06, 0.07), rough=0.5),
    "trim": mat("trim", (0.95, 0.85, 0.10)),
    "gear": mat("gear", (0.07, 0.07, 0.08), metal=0.2, rough=0.45),
    "lens": mat("lens", (0.86, 0.86, 0.82), rough=0.35),
    "steel": mat("steel", (0.55, 0.57, 0.60), metal=0.7, rough=0.4),
    "deck": mat("deck", (0.22, 0.22, 0.24), rough=0.85),
}


class Figure:
    """Faces gathered with their material and part, then one mesh."""

    def __init__(self, name, roles):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.roles = roles
        self.flat = set()

    def face(self, verts, role, part, smooth=True):
        f = self.bm.faces.new(verts)
        f.material_index = self.roles.index(role)
        f.smooth = smooth
        u = (PART[part] + 0.5) / 16
        for loop in f.loops:
            loop[self.uv].uv = (u, 0.5)
        return f

    def ring(self, centre, axis, side, hw, hd, segs, phase=0.0):
        axis = axis.normalized()
        side = (side - axis * side.dot(axis)).normalized()
        third = axis.cross(side)
        out = []
        for i in range(segs):
            a = 2 * math.pi * (i + phase) / segs
            out.append(self.bm.verts.new(centre + side * hw * math.cos(a) + third * hd * math.sin(a)))
        return out

    def loft(self, stations, role, part, segs, side=Vector((0, 1, 0)), cap_start=False, cap_end=False, smooth=True):
        """stations: (point, halfwidth, halfdepth). Bands between rings, optional fan caps."""
        pts = [Vector(p) for p, _, _ in stations]
        rings = []
        for i, (p, hw, hd) in enumerate(stations):
            a = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
            rings.append(self.ring(Vector(p), a, side, hw, hd, segs))
        for r0, r1 in zip(rings, rings[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                self.face((r0[i], r0[j], r1[j], r1[i]), role, part, smooth)
        if cap_start:
            self.face(list(reversed(rings[0])), role, part, smooth)
        if cap_end:
            tip = self.bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * min(stations[-1][1], stations[-1][2]) * 0.6)
            for i in range(segs):
                self.face((rings[-1][i], rings[-1][(i + 1) % segs], tip), role, part, smooth)
        return rings

    def limb(self, a, b, ra, rb, role, part, segs, cap_end=False, side=Vector((1, 0, 0))):
        if abs(Vector(b - a).normalized().dot(side)) > 0.9:
            side = Vector((0, 1, 0))
        ra = ra if isinstance(ra, tuple) else (ra, ra)
        rb = rb if isinstance(rb, tuple) else (rb, rb)
        return self.loft([(a, *ra), (b, *rb)], role, part, segs, side, cap_end=cap_end)

    def ellipsoid(self, centre, radii, role, part, useg=6, vseg=5, top_from=None, smooth=True):
        """An ellipsoid (or only its part above latitude `top_from`, -1..1)."""
        c = Vector(centre)
        lo = -1.0 if top_from is None else top_from
        lats = [lo + (1 - lo) * k / vseg for k in range(vseg + 1)]
        rows = []
        for s in lats[:-1]:
            r = math.sqrt(max(0.0, 1 - s * s))
            if r < 1e-4:
                rows.append(None)
                continue
            rows.append([self.bm.verts.new(c + Vector((radii[0] * r * math.cos(2 * math.pi * i / useg), radii[1] * r * math.sin(2 * math.pi * i / useg), radii[2] * s))) for i in range(useg)])
        top = self.bm.verts.new(c + Vector((0, 0, radii[2])))
        for r0, r1 in zip(rows, rows[1:]):
            if r0 is None:
                bottom = self.bm.verts.new(c + Vector((0, 0, -radii[2])))
                for i in range(useg):
                    self.face((bottom, r1[(i + 1) % useg], r1[i]), role, part, smooth)
                continue
            for i in range(useg):
                j = (i + 1) % useg
                self.face((r0[i], r0[j], r1[j], r1[i]), role, part, smooth)
        last = rows[-1]
        for i in range(useg):
            self.face((last[i], last[(i + 1) % useg], top), role, part, smooth)
        if top_from is not None and rows[0] is not None:
            self.face(list(reversed(rows[0])), role, part, smooth)

    def box(self, centre, size, role, part, rot=None):
        c = Vector(centre)
        hx, hy, hz = (s / 2 for s in size)
        m = rot or Matrix.Identity(3)
        vs = [self.bm.verts.new(c + m @ Vector((x * hx, y * hy, z * hz)))
              for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.face([vs[i] for i in q], role, part, smooth=False)

    def finish(self, extras=None):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for r in self.roles:
            me.materials.append(MATS[r])
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        for k, v in (extras or {}).items():
            ob[k] = v
        return ob


def gl(v):
    """Blender (x fwd, y left, z up) to glTF (x fwd, y up, z right)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def joints(s, shoulder=0.19, hip=0.095):
    J = {}
    for side, sg in (("L", 1), ("R", -1)):
        J[f"shoulder_{side}"] = Vector((0, sg * shoulder, 1.42)) * s
        J[f"elbow_{side}"] = J[f"shoulder_{side}"] + Vector((0.0, sg * 0.04, -0.29)) * s
        J[f"wrist_{side}"] = J[f"elbow_{side}"] + Vector((0.03, sg * 0.01, -0.25)) * s
        J[f"hip_{side}"] = Vector((0, sg * hip, 0.92)) * s
        J[f"knee_{side}"] = Vector((0.01, sg * (hip + 0.005), 0.50)) * s
        J[f"ankle_{side}"] = Vector((0, sg * (hip + 0.005), 0.085)) * s
    return J


def body(f, J, s, *, girth=1.0, chest=1.0, shoulder=0.19, hip=0.095, segs=6, limb_segs=5, head_segs=(6, 5),
         sleeves="short", top="shirt", legs="trousers", arms_out=None):
    """The figure: pelvis, torso, neck, head, arms and legs. `arms_out`
    (optional) overrides each forearm's end, for a pose built into the mesh."""
    g = girth
    # Pelvis in the trousers, the torso in the shirt over it.
    f.loft([(Vector((0, 0, 0.84 * s)), 0.165 * g * hip / 0.095, 0.105 * g),
            (Vector((0, 0, 1.03 * s)), 0.16 * g * hip / 0.095, 0.105 * g)], legs, "torso", segs, cap_start=True)
    f.loft([(Vector((0.0, 0, 0.98 * s)), 0.172 * g * hip / 0.095, 0.116 * g),
            (Vector((0.01, 0, 1.30 * s)), 0.18 * chest * g, 0.118 * chest * g),
            (Vector((0.0, 0, 1.42 * s)), shoulder * 1.02, 0.10 * g),
            (Vector((0.0, 0, 1.47 * s)), 0.075, 0.06)], top, "torso", segs, cap_end=True)
    f.limb(Vector((0.005, 0, 1.43 * s)), Vector((0.012, 0, 1.56 * s)), 0.05, 0.048, "skin", "torso", 5)
    hs, hv = head_segs
    f.ellipsoid((0.012, 0, 1.635 * s), (0.098, 0.083, 0.112), "skin", "head", hs, hv)
    for side, sg in (("L", 1), ("R", -1)):
        sh, el, wr = J[f"shoulder_{side}"], J[f"elbow_{side}"], J[f"wrist_{side}"]
        if arms_out:
            el, wr = arms_out[side]
        sleeve = top if sleeves in ("short", "long") else "skin"
        f.loft([(sh + Vector((0, -sg * 0.022, -0.005)), 0.056 * g, 0.056 * g), (el, 0.046 * g, 0.046 * g)], sleeve,
               f"upper_arm_{side}", limb_segs, Vector((1, 0, 0)), cap_start=True)
        f.limb(el, wr, 0.044 * g, 0.034, top if sleeves == "long" else "skin", f"forearm_{side}", limb_segs)
        d = (wr - el).normalized()
        f.box(wr + d * 0.055, (0.035, 0.075, 0.11), "skin", f"forearm_{side}",
              rot=Vector((0, 0, 1)).rotation_difference(d).to_matrix())
        hp, kn, an = J[f"hip_{side}"], J[f"knee_{side}"], J[f"ankle_{side}"]
        f.limb(hp + Vector((0, 0, 0.05)), kn, 0.088 * g, 0.058, legs, f"thigh_{side}", limb_segs)
        f.limb(kn, an + Vector((0, 0, 0.02)), 0.056, 0.042, legs, f"shin_{side}", limb_segs)
        f.box(Vector((an.x + 0.055, an.y, 0.045)), (0.27, 0.10, 0.09), "shoes", f"shin_{side}")


def hair_short(f, s, segs=(6, 3)):
    f.ellipsoid((0.0, 0, 1.645 * s), (0.106, 0.091, 0.112), "hair", "head", segs[0], segs[1], top_from=0.1)


CROWD_ROLES = ["skin", "hair", "shirt", "trousers", "shoes"]


def crowd_a():
    """A man in a T-shirt, short hair."""
    s = 1.0
    f = Figure("crowd_a", CROWD_ROLES)
    J = joints(s)
    body(f, J, s)
    hair_short(f, s)
    return f, J


def crowd_b():
    """A woman, a little shorter, her hair long down her back."""
    s = 0.94
    f = Figure("crowd_b", CROWD_ROLES)
    J = joints(s, shoulder=0.175, hip=0.1)
    body(f, J, s, girth=0.92, chest=0.97, shoulder=0.175, hip=0.1)
    hair_short(f, s)
    f.box(Vector((-0.07, 0, 1.47 * s)), (0.06, 0.17, 0.26), "hair", "head")
    return f, J


def crowd_c():
    """A fan in a team cap (the cap in the shirt's colour)."""
    s = 1.01
    f = Figure("crowd_c", CROWD_ROLES)
    J = joints(s)
    body(f, J, s, girth=1.04)
    f.ellipsoid((0.0, 0, 1.655 * s), (0.108, 0.094, 0.10), "hair", "head", 6, 1, top_from=-0.35)
    f.ellipsoid((0.0, 0, 1.67 * s), (0.11, 0.096, 0.085), "shirt", "head", 6, 2, top_from=0.15)
    f.box(Vector((0.115, 0, 1.69 * s)), (0.11, 0.15, 0.012), "shirt", "head")
    return f, J


def crowd_d():
    """A heavier build in a long-sleeved top."""
    s = 1.02
    f = Figure("crowd_d", CROWD_ROLES)
    J = joints(s, shoulder=0.2, hip=0.1)
    body(f, J, s, girth=1.14, chest=1.05, shoulder=0.2, hip=0.1, sleeves="long")
    hair_short(f, s)
    return f, J


def headset(f, s, part="head"):
    f.loft([(Vector((0.0, 0.1, 1.64 * s)), 0.012, 0.012), (Vector((0.0, 0.0, 1.765 * s)), 0.012, 0.012),
            (Vector((0.0, -0.1, 1.64 * s)), 0.012, 0.012)], "gear", part, 4, side=Vector((1, 0, 0)))
    for sg in (1, -1):
        f.ellipsoid((0.0, sg * 0.095, 1.625 * s), (0.04, 0.025, 0.045), "gear", part, 6, 3)
    f.limb(Vector((0.0, 0.1, 1.6 * s)), Vector((0.1, 0.05, 1.56 * s)), 0.006, 0.006, "gear", part, 3)


def crew():
    """Pit crew: overalls in the team's colour (shirt and trousers), the trim
    colour across the shoulders, at the belt and down the legs; a headset."""
    s = 1.0
    f = Figure("crew", ["skin", "hair", "shirt", "trousers", "shoes", "trim", "gear"])
    J = joints(s, shoulder=0.195)
    body(f, J, s, girth=1.06, shoulder=0.195, segs=12, limb_segs=8, head_segs=(10, 7), sleeves="long")
    hair_short(f, s, (10, 3))
    headset(f, s)
    # Trim: a yoke over the shoulders, the belt, and a band round each arm and leg.
    f.loft([(Vector((0.0, 0, 1.335 * s)), 0.19 * 1.06 + 0.006, 0.124 * 1.06 + 0.004),
            (Vector((0.0, 0, 1.39 * s)), 0.197 * 1.0 + 0.004, 0.112 * 1.06 + 0.004)], "trim", "torso", 12)
    f.loft([(Vector((0.0, 0, 1.0 * s)), 0.158 * 1.06 + 0.006, 0.105 * 1.06 + 0.006),
            (Vector((0.0, 0, 1.04 * s)), 0.16 * 1.06 + 0.006, 0.106 * 1.06 + 0.006)], "trim", "torso", 12)
    for side in ("L", "R"):
        sh, el = J[f"shoulder_{side}"], J[f"elbow_{side}"]
        a = sh.lerp(el, 0.45)
        b = sh.lerp(el, 0.6)
        f.limb(a, b, 0.056 * 1.06 + 0.004, 0.054 * 1.06 + 0.004, "trim", f"upper_arm_{side}", 8)
        kn, an = J[f"knee_{side}"], J[f"ankle_{side}"]
        f.limb(kn.lerp(an, 0.25), kn.lerp(an, 0.4), 0.053 + 0.005, 0.05 + 0.005, "trim", f"shin_{side}", 8)
    return f, J


def photographer():
    """A photographer at the corner, the long lens up at the eye on a monopod."""
    s = 1.0
    f = Figure("photographer", ["skin", "hair", "shirt", "trousers", "shoes", "trim", "gear", "lens"])
    J = joints(s)
    eye = Vector((0.10, 0, 1.63))
    # Hands: the right on the camera's grip, the left under the lens.
    arms = {
        "R": (J["shoulder_R"] + Vector((0.18, 0.02, -0.2)), Vector((0.17, -0.07, 1.55))),
        "L": (J["shoulder_L"] + Vector((0.22, -0.02, -0.22)), Vector((0.36, 0.0, 1.53))),
    }
    body(f, J, s, segs=10, limb_segs=7, head_segs=(10, 7), sleeves="short", arms_out=arms)
    hair_short(f, s, (10, 3))
    # The tabard over the shirt (the trim colour), front and back.
    for x in (0.115, -0.115):
        f.box(Vector((x, 0, 1.2)), (0.012, 0.3, 0.34), "trim", "torso")
    # The camera body at the eye, the long lens ahead of it, the hood at its front.
    f.box(eye + Vector((0.13, 0, -0.03)), (0.11, 0.15, 0.12), "gear", "fixed")
    f.limb(eye + Vector((0.18, 0, -0.03)), eye + Vector((0.58, 0, -0.03)), 0.05, 0.065, "lens", "fixed", 10)
    f.limb(eye + Vector((0.58, 0, -0.03)), eye + Vector((0.70, 0, -0.03)), 0.072, 0.072, "gear", "fixed", 10)
    # The monopod from the lens's foot to the ground.
    f.limb(Vector((0.36, 0, 1.53)), Vector((0.40, 0, 0.0)), 0.013, 0.011, "gear", "fixed", 5)
    return f, J


def camera_operator():
    """A TV camera operator behind a broadcast camera on its tripod: the
    camera's lens ahead, its viewfinder at the operator's eye, the pan bar in
    the right hand."""
    s = 1.0
    f = Figure("camera_operator", ["skin", "hair", "shirt", "trousers", "shoes", "gear", "lens"])
    J = joints(s)
    head = Vector((0.62, 0, 1.40))
    arms = {
        "R": (J["shoulder_R"] + Vector((0.16, -0.06, -0.22)), Vector((0.30, -0.2, 1.24))),
        "L": (J["shoulder_L"] + Vector((0.2, 0.02, -0.18)), Vector((0.45, 0.12, 1.42))),
    }
    body(f, J, s, segs=10, limb_segs=7, head_segs=(10, 7), sleeves="long", arms_out=arms)
    hair_short(f, s, (10, 3))
    headset(f, s)
    # The tripod: three legs from the head down to the ground, and the head.
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 3
        foot = head + Vector((math.cos(a) * 0.42, math.sin(a) * 0.42, 0)) - Vector((0, 0, head.z - 0.02))
        f.limb(head - Vector((0, 0, 0.05)), foot, 0.022, 0.016, "gear", "fixed", 5)
    f.limb(head - Vector((0, 0, 0.08)), head + Vector((0, 0, 0.02)), 0.07, 0.06, "gear", "fixed", 8)
    # The camera body, the long box lens, the viewfinder on its arm.
    f.box(head + Vector((0, 0, 0.14)), (0.42, 0.17, 0.24), "gear", "fixed")
    f.box(head + Vector((0.36, 0, 0.12)), (0.36, 0.15, 0.17), "lens", "fixed")
    f.limb(head + Vector((0.54, 0, 0.12)), head + Vector((0.6, 0, 0.12)), 0.07, 0.075, "gear", "fixed", 10)
    f.box(head + Vector((-0.24, 0.06, 0.25)), (0.1, 0.14, 0.11), "gear", "fixed")
    # The pan bar back to the right hand.
    f.limb(head + Vector((-0.1, -0.06, 0.04)), Vector((0.30, -0.2, 1.24)), 0.012, 0.012, "gear", "fixed", 4)
    return f, J


def tv_platform():
    """A scaffold tower: four legs, cross braces, a deck at 3 m with a toe
    board and a rail on three sides, a ladder up the back."""
    deck_z = 3.0
    w = 2.6
    f = Figure("tv_platform", ["steel", "deck"])
    h = w / 2 - 0.05
    corners = [Vector((x, y, 0)) for x in (-h, h) for y in (-h, h)]
    for c in corners:
        f.limb(c, c + Vector((0, 0, deck_z + 1.05)), 0.03, 0.03, "steel", "fixed", 6)
    for z0, z1 in ((0.15, 1.5), (1.5, 2.9)):
        for a, b in ((0, 1), (2, 3), (0, 2), (1, 3)):
            ca, cb = corners[a], corners[b]
            f.limb(ca + Vector((0, 0, z0)), cb + Vector((0, 0, z1)), 0.018, 0.018, "steel", "fixed", 4)
            f.limb(ca + Vector((0, 0, z1)), cb + Vector((0, 0, z1)), 0.02, 0.02, "steel", "fixed", 4)
    f.box(Vector((0, 0, deck_z - 0.05)), (w, w, 0.1), "deck", "fixed")
    # Toe boards and rails on the front and both sides (the back is the ladder's).
    for (cx, cy, sx, sy) in ((h, 0, 0.03, w), (0, h, w, 0.03), (0, -h, w, 0.03)):
        f.box(Vector((cx, cy, deck_z + 0.08)), (sx, sy, 0.16), "deck", "fixed")
        for z in (0.55, 1.05):
            f.box(Vector((cx, cy, deck_z + z)), (max(sx, 0.045), max(sy, 0.045), 0.045), "steel", "fixed")
    for y in (-0.22, 0.22):
        f.limb(Vector((-h - 0.12, y, 0)), Vector((-h - 0.02, y, deck_z + 1.0)), 0.02, 0.02, "steel", "fixed", 4)
    for k in range(1, 11):
        z = k * deck_z / 10
        x = -h - 0.12 + 0.1 * z / (deck_z + 1.0)
        f.limb(Vector((x, -0.22, z)), Vector((x, 0.22, z)), 0.014, 0.014, "steel", "fixed", 4)
    return f, deck_z


BUILT = {}
for build in (crowd_a, crowd_b, crowd_c, crowd_d, crew, photographer, camera_operator):
    fig, J = build()
    extras = {"joints": {k: gl(v) for k, v in J.items() if not k.startswith(("wrist", "ankle"))}}
    BUILT[fig.name] = fig.finish(extras)
platform, deck = tv_platform()
BUILT["tv_platform"] = platform.finish({"deck": deck})

# --- Self-checks -----------------------------------------------------------------
BUDGET = {"crowd_a": 300, "crowd_b": 300, "crowd_c": 300, "crowd_d": 300,
          "crew": 1500, "photographer": 1500, "camera_operator": 1500, "tv_platform": 1500}
for name, ob in BUILT.items():
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    zs = [v.co.z for v in ob.data.vertices]
    print(f"{name}: {tris} triangles, {min(zs):.3f} .. {max(zs):.3f} m")
    if tris > BUDGET[name]:
        raise RuntimeError(f"{name} has {tris} triangles, over its {BUDGET[name]}")
    if min(zs) < -0.002:
        raise RuntimeError(f"{name} goes {-min(zs) * 100:.1f} cm into the ground")

# --- Export ------------------------------------------------------------------------
if OUT:
    bpy.ops.object.select_all(action="DESELECT")
    for ob in BUILT.values():
        ob.location = (0, 0, 0)
        ob.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                              export_extras=True, export_texcoords=True, export_normals=True, export_animations=False)
    print("exported", OUT)

# --- Preview: the line-up --------------------------------------------------------
if PREVIEW:
    import random
    rnd = random.Random(4)
    engines = [i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 800
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs["Color"].default_value = (0.32, 0.34, 0.38, 1)
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(45), math.radians(5), math.radians(60))
    scene.collection.objects.link(sun)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.data.materials.append(mat("floor", (0.2, 0.2, 0.22)))
    skins = [(0.93, 0.76, 0.64), (0.84, 0.62, 0.47), (0.62, 0.42, 0.30), (0.45, 0.29, 0.19), (0.30, 0.19, 0.12)]
    shirts = [(0.75, 0.02, 0.02), (0.95, 0.4, 0.0), (0.02, 0.2, 0.6), (0.95, 0.95, 0.95), (0.1, 0.5, 0.3), (0.95, 0.8, 0.1)]
    temp = []
    order = ["crowd_a", "crowd_b", "crowd_c", "crowd_d", "crew", "photographer", "camera_operator", "tv_platform"]
    for k, name in enumerate(order):
        ob = BUILT[name]
        ob.location = (0, -k * 1.15 + 4.0 - (1.2 if name == "tv_platform" else 0), 0)
        if name == "tv_platform":
            continue
        dressed = []
        for m in ob.data.materials:
            c = m.copy()
            b = next(n for n in c.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            pick = {"skin": skins[k % 5], "shirt": shirts[k % 6], "hair": (0.05 + 0.1 * (k % 3), 0.03 + 0.05 * (k % 3), 0.02),
                    "trousers": (0.12, 0.14, 0.22) if k % 2 else (0.75, 0.68, 0.55)}.get(m.name)
            if name == "crew":
                pick = {"shirt": (0.75, 0.02, 0.02), "trousers": (0.75, 0.02, 0.02), "trim": (1.0, 0.85, 0.0), "skin": skins[1]}.get(m.name, pick)
            if pick:
                b.inputs["Base Color"].default_value = (*pick, 1)
            dressed.append(c)
            temp.append(c)
        for i, c in enumerate(dressed):
            ob.data.materials[i] = c
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    scene.camera = cam
    for tag, loc, aim in (("lineup", (9.5, -3.5, 2.6), (0, -0.4, 1.2)), ("close", (3.4, 3.0, 1.6), (0, 2.3, 1.05))):
        cam.location = loc
        cam.rotation_euler = (Vector(aim) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"people_{tag}.png")
        bpy.ops.render.render(write_still=True)
