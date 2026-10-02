"""The driver's bare head for the podium: the face, eyes, brows, lashes, hair
styles and facial hair (docs/superpowers/specs/2026-10-01-driver-faces-design.md).

Built from MakeHuman's CC0 base mesh and targets, cut out by
tools/blender/makehuman/extract.py into head.json. build_driver.py calls
build(), then skins everything it returns to the rig.

Coordinates: the figure's (metres, facing +X, Y left, Z up).
"""
import bmesh
import bpy
import json
import math
import os
import random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
HEAD = json.load(open(os.path.join(HERE, "makehuman", "head.json")))

# MakeHuman's male stands 17.3 dm; ours 1.78 m.
S = 1.78 / 17.304
CROWN = 1.762      # the top of the bare head
NECK_CUT = 1.44   # the neck runs down into the suit to here
OX = -0.02         # the head's offset forward, so its neck stands over the body's
# Below the jaw the neck is gathered into the collar: an ellipse round the
# body's neck, taking in the tops of the shoulders MakeHuman's mesh carries.
COLLAR = {"x": 0.004, "half_width": 0.063, "half_depth": 0.06, "from": 1.524, "to": 1.505}


def _top():
    return max(HEAD["verts"][i][1] for f in HEAD["faces"] for i in f)


OZ = CROWN - _top() * S


def P(p):
    """A MakeHuman point on the figure."""
    return Vector((p[2] * S + OX, p[0] * S, p[1] * S + OZ))


def D(d):
    """A MakeHuman delta on the figure."""
    return Vector((d[2] * S, d[0] * S, d[1] * S))


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def gather(v):
    """Pull a point of the lower neck inside the collar's ellipse."""
    t = smoothstep(COLLAR["from"], COLLAR["to"], v.z)
    if t <= 0:
        return v
    dx, dy = v.x - COLLAR["x"], v.y
    e = math.hypot(dx / COLLAR["half_depth"], dy / COLLAR["half_width"])
    if e <= 0.92:
        return v
    # A soft limit: up to 0.92 of the ellipse unchanged, then easing into it.
    k = 0.92 + 0.08 * math.tanh((e - 0.92) / 0.08)
    f = 1 + (k / e - 1) * t
    return Vector((COLLAR["x"] + dx * f, dy * f, v.z))


RAW = [P(p) for p in HEAD["verts"]]
VERTS = [gather(v) for v in RAW]
KEYS = {name: {int(i): gather(RAW[int(i)] + D(d)) - VERTS[int(i)] for i, d in deltas.items()} for name, deltas in HEAD["keys"].items()}
KEY_NAMES = list(HEAD["keys"].keys())


def key_mag(name, idx):
    d = KEYS[name].get(idx)
    return d.length if d else 0.0


# --- The head and neck --------------------------------------------------------
def head_mesh(mats):
    faces = [k for k, f in enumerate(HEAD["faces"]) if all(VERTS[i].z > NECK_CUT for i in f)]
    used = sorted({i for k in faces for i in HEAD["faces"][k]})
    local = {i: n for n, i in enumerate(used)}
    me = bpy.data.meshes.new("head_skin")
    me.from_pydata([VERTS[i] for i in used], [], [[local[i] for i in HEAD["faces"][k]] for k in faces])
    uv = me.uv_layers.new(name="UVMap")
    li = 0
    for k in faces:
        for t in HEAD["face_uvs"][k]:
            uv.data[li].uv = HEAD["uvs"][t]
            li += 1
    me.validate()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mats["skin"])
    ob = bpy.data.objects.new("head_skin", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.shape_key_add(name="Basis")
    for name in KEY_NAMES:
        sk = ob.shape_key_add(name=name, from_mix=False)
        for i, n in local.items():
            d = KEYS[name].get(i)
            if d:
                sk.data[n].co = VERTS[i] + d
    masks(ob, used)
    return ob, used


def landmarks():
    """Points on the face, in the figure's space, found from where the
    targets act."""
    def centroid(name, lo=0.5):
        top = max((d.length for d in KEYS[name].values()), default=0)
        pts = [VERTS[i] for i, d in KEYS[name].items() if d.length > top * lo and i < len(VERTS)]
        return sum(pts, Vector()) / len(pts)
    eye_idx = {i for f in HEAD["helpers"]["helper-l-eye"]["faces"] for i in f}
    eye = sum((VERTS[i] for i in eye_idx), Vector()) / len(eye_idx)
    mouth = centroid("lips_volume_incr")
    ear = centroid("ear_size_incr", 0.4)
    nose = centroid("nose_volume_incr")
    front = [v for v in VERTS[:len(VERTS)] if abs(v.y) < 0.01]
    chin = min((v for v in front if v.x > mouth.x - 0.03), key=lambda v: v.z)
    return {"eye": eye, "mouth": mouth, "ear": ear, "nose": nose, "chin": chin}


def beard_area(v, L):
    """How much this point of the skin grows a beard, 0..1."""
    eye, mouth, ear, chin = L["eye"], L["mouth"], L["ear"], L["chin"]
    # How far round from the mouth toward the ear, 0 at the front.
    side = min(1.0, max(0.0, (mouth.x - v.x) / max(1e-4, mouth.x - ear.x)))
    # The upper edge: across the cheek below the cheekbone, up to the
    # sideburn by the ear.
    top = (eye.z - 0.034) * (1 - side) + (ear.z + 0.012) * side
    upper = 1 - smoothstep(top - 0.008, top + 0.004, v.z)
    # The lower edge: under the chin and jaw, a little way down the throat.
    lower = smoothstep(chin.z - 0.045, chin.z - 0.03, v.z) if v.x > ear.x + 0.01 else 0.0
    # Not behind the ear's front.
    front = smoothstep(ear.x - 0.002, ear.x + 0.012, v.x)
    # The upper cheek at the front, near the nose, stays bare.
    nose_side = 1 - smoothstep(0.0, 1.0, max(0.0, 1 - (abs(v.y) - 0.022) / 0.012)) * smoothstep(mouth.z + 0.012, mouth.z + 0.022, v.z)
    return upper * lower * front * nose_side


def masks(ob, used):
    """_MASKS: lips, beard, warmth (cheeks, nose, ears), eye sockets."""
    L = landmarks()
    def norm(name):
        top = max(KEYS[name][i].length for i in used if i in KEYS[name])
        return lambda i: key_mag(name, i) / top
    lips, cheek, nose, ear, bag = (norm(n) for n in ("lips_volume_incr", "cheek_volume_incr", "nose_volume_incr", "ear_size_incr", "eye_bag_incr"))
    attr = ob.data.attributes.new("_MASKS", "FLOAT_COLOR", "POINT")
    for n, i in enumerate(used):
        v = VERTS[i]
        r = smoothstep(0.2, 0.55, lips(i))
        g = beard_area(v, L) * (1 - r)
        b = max(0.8 * smoothstep(0.1, 0.7, cheek(i)), 0.7 * smoothstep(0.15, 0.8, nose(i)), 0.9 * smoothstep(0.1, 0.6, ear(i)), 0.5 * r)
        a = smoothstep(0.1, 0.6, bag(i))
        attr.data[n].color = (r, g, b, a)


# --- Eyes -----------------------------------------------------------------------
def helper_points(name):
    idx = sorted({i for f in HEAD["helpers"][name]["faces"] for i in f})
    return idx


def eye_frame(side):
    idx = helper_points(f"helper-{side.lower()}-eye")
    c = sum((VERTS[i] for i in idx), Vector()) / len(idx)
    r = sum((VERTS[i] - c).length for i in idx) / len(idx)
    return idx, c, r


def iris_image():
    """An iris: fibres running out from the pupil, a darker ring at the
    limbus, a lighter collarette; grey, so the material's colour tints it."""
    n = 256
    img = bpy.data.images.new("iris", n, n, alpha=False)
    rnd = random.Random(16)
    fib = [rnd.random() for _ in range(720)]
    px = [0.0] * (n * n * 4)
    for y in range(n):
        for x in range(n):
            u, v = (x + 0.5) / n * 2 - 1, (y + 0.5) / n * 2 - 1
            r = math.hypot(u, v)
            a = (math.atan2(v, u) / (2 * math.pi)) % 1.0
            k = a * 720
            f = fib[int(k) % 720] * (1 - (k % 1)) + fib[(int(k) + 1) % 720] * (k % 1)
            g = 0.62 + 0.38 * f * (0.6 + 0.4 * math.sin(r * 40))
            g *= 1.0 + 0.25 * math.exp(-((r - 0.45) / 0.07) ** 2)    # the collarette
            g *= 1 - 0.55 * smoothstep(0.82, 0.98, r)                # the limbal ring
            g = 0.02 if r < 0.3 else g * smoothstep(0.3, 0.34, r) + 0.02  # the pupil
            o = (y * n + x) * 4
            px[o:o + 4] = (g, g, g, 1.0)
    img.pixels = px
    img.pack()
    return img


def eye(side, mats):
    """An eyeball: the sclera, the iris disc set into it, and a clear cornea."""
    idx, c, r = eye_frame(side)
    R = r * 0.94
    bm = bmesh.new()
    segs, rings = 32, 18
    IRIS = math.radians(31)
    fwd = Vector((1, 0, 0))

    def sph(theta, phi, rad=R):
        return c + Vector((math.cos(theta), math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi))) * rad

    # The sclera, from the back of the eye up to the iris's edge.
    thetas = [IRIS + (math.pi - IRIS) * k / rings for k in range(rings + 1)]
    grid = [[bm.verts.new(sph(t, 2 * math.pi * j / segs)) for j in range(segs)] for t in thetas]
    for a, b in zip(grid, grid[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((a[j], a[k], b[k], b[j]))
    sclera_faces = len(bm.faces)
    # The iris: a disc a little behind the limbus, its UVs round the pupil.
    lim = R * math.sin(IRIS)
    depth = R * math.cos(IRIS) - R * 0.035
    ring_r = [lim * t for t in (1.0, 0.75, 0.5, 0.3, 0.12)]
    iris_rings = []
    for rr in ring_r:
        iris_rings.append([bm.verts.new(c + fwd * (depth + R * 0.03 * (1 - rr / lim)) + Vector((0, math.cos(2 * math.pi * j / segs), math.sin(2 * math.pi * j / segs))) * rr) for j in range(segs)])
    centre = bm.verts.new(c + fwd * (depth + R * 0.03))
    edge = grid[0]
    for j in range(segs):
        k = (j + 1) % segs
        bm.faces.new((edge[j], edge[k], iris_rings[0][k], iris_rings[0][j]))  # the limbus, sclera-coloured
    for a, b in zip(iris_rings, iris_rings[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((a[j], a[k], b[k], b[j]))
    for j in range(segs):
        bm.faces.new((iris_rings[-1][j], iris_rings[-1][(j + 1) % segs], centre))
    iris_first = sclera_faces + segs
    # The cornea: a clear dome over the iris, bulging a little past the eye.
    corn = []
    for k in range(7):
        t = IRIS * 1.08 * (1 - k / 6)
        bulge = 1 + 0.07 * (1 - (t / (IRIS * 1.08)) ** 2)
        corn.append([bm.verts.new(sph(t, 2 * math.pi * j / segs, R * bulge)) for j in range(segs)] if k < 6 else None)
    tip = bm.verts.new(c + fwd * R * 1.07)
    cornea_first = len(bm.faces)
    for a, b in zip(corn[:5], corn[1:6]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((a[j], a[k], b[k], b[j]))
    for j in range(segs):
        bm.faces.new((corn[5][j], corn[5][(j + 1) % segs], tip))
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.new("UVMap")
    for n, f in enumerate(bm.faces):
        f.material_index = 0 if n < iris_first else (1 if n < cornea_first else 2)
        f.smooth = True
        for loop in f.loops:
            p = loop.vert.co - c
            loop[uv].uv = (0.5 + 0.5 * p.y / lim, 0.5 + 0.5 * p.z / lim)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(f"eye_{side}")
    bm.to_mesh(me)
    bm.free()
    for m in ("eye_sclera", "eye_iris", "eye_cornea"):
        me.materials.append(mats[m])
    ob = bpy.data.objects.new(f"eye_{side}", me)
    bpy.context.scene.collection.objects.link(ob)
    # Shape keys: the eye moves and scales with its helper.
    ob.shape_key_add(name="Basis")
    base = [v.co.copy() for v in me.vertices]
    for name in KEY_NAMES:
        moved = [VERTS[i] + KEYS[name].get(i, Vector()) for i in idx]
        c2 = sum(moved, Vector()) / len(moved)
        r2 = sum((p - c2).length for p in moved) / len(moved)
        if (c2 - c).length < 1e-5 and abs(r2 - r) < 1e-5:
            continue
        sk = ob.shape_key_add(name=name, from_mix=False)
        for n, co in enumerate(base):
            sk.data[n].co = c2 + (co - c) * (r2 / r)
    return ob


def lashes(mats):
    """MakeHuman's lash helpers, which the eyelid targets move too."""
    groups = [g for g in HEAD["helpers"] if "eyelashes" in g]
    faces = [f for g in groups for f in HEAD["helpers"][g]["faces"]]
    used = sorted({i for f in faces for i in f})
    local = {i: n for n, i in enumerate(used)}
    me = bpy.data.meshes.new("lashes")
    me.from_pydata([VERTS[i] for i in used], [], [[local[i] for i in f] for f in faces])
    me.validate()
    me.materials.append(mats["lashes"])
    ob = bpy.data.objects.new("lashes", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.shape_key_add(name="Basis")
    for name in KEY_NAMES:
        if not any(i in KEYS[name] for i in used):
            continue
        sk = ob.shape_key_add(name=name, from_mix=False)
        for i, n in local.items():
            sk.data[n].co = VERTS[i] + KEYS[name].get(i, Vector())
    return ob


# --- Binding to the head -------------------------------------------------------
class Binder:
    """The head's surface, for binding: each point of a brow, a hair style or
    a beard is tied to the triangle of the head nearest it, by the triangle's
    three vertex ids (_BIND, the head's _VID) and barycentric weights (_BARY).
    r3d/driver.js moves it by the head's own morph there, so it follows the
    driver's face exactly."""

    def __init__(self, used):
        self.used = set(used)
        faces = [f for f in HEAD["faces"] if all(i in self.used for i in f)]
        self.tris = []
        for f in faces:
            for k in range(1, len(f) - 1):
                self.tris.append((f[0], f[k], f[k + 1]))
        self.bvh = BVHTree.FromPolygons([VERTS[i] for i in range(len(VERTS))], self.tris)

    def nearest(self, p):
        loc, normal, fi, dist = self.bvh.find_nearest(p)
        a, b, c = self.tris[fi]
        w = barycentric(loc, VERTS[a], VERTS[b], VERTS[c])
        return loc, normal.normalized(), (a, b, c), w

    def ray(self, origin, direction):
        loc, normal, fi, dist = self.bvh.ray_cast(origin, direction)
        return loc, (normal.normalized() if normal else None)

    def bind(self, ob):
        me = ob.data
        ids = me.attributes.new("_BIND", "FLOAT_VECTOR", "POINT")
        bary = me.attributes.new("_BARY", "FLOAT_VECTOR", "POINT")
        for v in me.vertices:
            _, _, tri, w = self.nearest(v.co)
            ids.data[v.index].vector = tri
            bary.data[v.index].vector = w


def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = v0.dot(v0), v0.dot(v1), v1.dot(v1)
    d20, d21 = v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-14:
        return (1.0, 0.0, 0.0)
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    return (1 - v - w, v, w)


# --- Strand textures -------------------------------------------------------------
def strand_image(name, w, h, strokes, seed):
    """Fine hairs drawn as anti-aliased strokes on a clear ground: white, so
    the material's colour tints them; their coverage is the alpha.
    strokes(rnd) yields (x0, y0, x1, y1, width, alpha) in pixels."""
    import numpy as np
    rnd = random.Random(seed)
    alpha = np.zeros((h, w), dtype=np.float32)
    shade = np.zeros((h, w), dtype=np.float32)
    for x0, y0, x1, y1, width, a in strokes(rnd):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) * 2))
        for k in range(n + 1):
            t = k / n
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            # Tapered toward the tip.
            r = width * (1 - 0.7 * t) * 0.5 + 0.35
            for yy in range(int(y - r - 1), int(y + r + 2)):
                for xx in range(int(x - r - 1), int(x + r + 2)):
                    if 0 <= xx < w and 0 <= yy < h:
                        cov = max(0.0, min(1.0, r + 0.5 - math.hypot(xx + 0.5 - x, yy + 0.5 - y)))
                        if cov > 0:
                            new = a * cov
                            alpha[yy, xx] = alpha[yy, xx] + new * (1 - alpha[yy, xx])
                            shade[yy, xx] = max(shade[yy, xx], 0.75 + 0.25 * rnd.random())
    img = bpy.data.images.new(name, w, h, alpha=True)
    px = np.zeros((h, w, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = np.where(alpha > 0, shade, 0.8)
    px[..., 3] = np.clip(alpha, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def brow_strokes(rnd):
    """Brow hairs along the strip (u: inner end to tail, v: bottom to top):
    rising near the nose, lying toward the tail further out."""
    W, H = 512, 96
    for _ in range(1500):
        u = rnd.random() ** 0.9
        # The brow is fullest a third of the way out and thins to the tail.
        hgt = H * (0.95 - 0.55 * max(0.0, u - 0.3) / 0.7)
        y0 = (H - hgt) / 2 + rnd.random() * hgt * 0.85
        ang = math.radians(78 - 62 * min(1.0, u / 0.35) + rnd.uniform(-10, 10))
        ln = rnd.uniform(14, 26) * (1 - 0.35 * u)
        x0 = u * (W - 30) + 8
        yield (x0, y0, x0 + math.cos(ang) * ln, y0 + math.sin(ang) * ln * 0.8, rnd.uniform(1.6, 2.4), rnd.uniform(0.75, 1.0))


def lash_strokes(rnd):
    """Lashes from the lid (v = 0) outward, curling a little, longest in the
    middle of the lid."""
    W, H = 512, 64
    for _ in range(260):
        u = rnd.random()
        ln = H * (0.55 + 0.4 * math.sin(math.pi * u)) * rnd.uniform(0.75, 1.0)
        x0 = u * W
        lean = (u - 0.5) * 18
        yield (x0, 1, x0 + lean + rnd.uniform(-3, 3), ln, rnd.uniform(1.4, 2.2), 1.0)


def textured(mat_, img):
    nt = mat_.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if img.alpha_mode != "NONE" and "Alpha" in tex.outputs:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])


# --- Brows -------------------------------------------------------------------------
def brows(mats, binder, L):
    """A strip over each brow ridge, a little off the skin, drawn with hairs."""
    eye_c = L["eye"]
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    cols, rows = 22, 4
    for sgn in (1, -1):
        grid = []
        for i in range(cols + 1):
            t = i / cols
            y = sgn * (0.009 + (abs(eye_c.y) + 0.027 - 0.009) * t)
            # Up from the eye: the arch peaks two thirds of the way out.
            zc = eye_c.z + 0.0155 + 0.006 * math.sin(math.pi * min(1.0, t / 1.3)) - 0.006 * max(0.0, t - 0.75) / 0.25
            half = 0.0058 - 0.0036 * max(0.0, t - 0.3) / 0.7
            col = []
            for j in range(rows + 1):
                s = j / rows
                z = zc - half + 2 * half * s
                hit, n = binder.ray(Vector((0.35, y, z)), Vector((-1, 0, 0)))
                if hit is None:
                    raise RuntimeError("a brow missed the face")
                loc, n2, _, _ = binder.nearest(hit)
                col.append(bm.verts.new(loc + n2 * 0.0007))
            grid.append(col)
        for i in range(cols):
            for j in range(rows):
                q = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])
                f = bm.faces.new(q if sgn > 0 else tuple(reversed(q)))
                for loop in f.loops:
                    ii = next(a for a in range(cols + 1) for b in range(rows + 1) if grid[a][b] is loop.vert)
                    jj = grid[ii].index(loop.vert)
                    loop[uv].uv = (ii / cols, jj / rows)
    # Facing out of the face, as the skin under it does.
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(binder.nearest(f.calc_center_median())[1]) < 0:
            f.normal_flip()
    me = bpy.data.meshes.new("brows")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mats["brows"])
    ob = bpy.data.objects.new("brows", me)
    bpy.context.scene.collection.objects.link(ob)
    binder.bind(ob)
    return ob


def lash_uvs(ob, side_of):
    """u along each lash strip, v from the lid out to the lashes' tips."""
    me = ob.data
    uv = me.uv_layers.new(name="UVMap")
    _, cl, _ = eye_frame("L")
    _, cr, _ = eye_frame("R")
    for p in me.polygons:
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            c = cl if v.y > 0 else cr
            rel = v - c
            u = 0.5 + math.atan2(abs(rel.y), rel.x) / math.pi * 1.2 - 0.3
            uv.data[li].uv = (u, 0.0)
    # v: per strip, from the vertex nearest the eye's centre (the lid) out.
    dist = {}
    for v in me.vertices:
        c = cl if v.co.y > 0 else cr
        dist[v.index] = (v.co - c).length
    for p in me.polygons:
        ds = [dist[me.loops[li].vertex_index] for li in p.loop_indices]
        lo, hi = min(ds), max(ds)
        for li, d in zip(p.loop_indices, ds):
            uv.data[li].uv = (uv.data[li].uv[0], (d - lo) / max(1e-6, hi - lo))


# --- The scalp and its hairline ------------------------------------------------------
HC = Vector((0.03, 0.0, 1.665))  # about the middle of the skull


def azimuth(v):
    """Round the head from the front (0) to the back (pi), either side."""
    return math.atan2(abs(v.y), v.x - HC.x)


# The hairline's height round the head (radians from the front, metres):
# across the forehead, back at the temples, down the sideburn in front of the
# ear, over the ear and down behind it to the nape.
HAIRLINE = [(0.0, 1.716), (0.35, 1.714), (0.6, 1.706), (0.85, 1.688), (1.05, 1.664), (1.17, 1.622),
            (1.27, 1.62), (1.36, 1.668), (1.6, 1.672), (1.85, 1.668), (2.05, 1.625), (2.4, 1.588), (math.pi, 1.578)]


def lerp_table(table, x):
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return table[-1][1]


def ear_mask(i):
    top = EAR_TOP[0]
    return max(key_mag("ear_size_incr", i), key_mag("ear_out_incr", i)) / top if top else 0.0


EAR_TOP = [0.0]


def scalp(v, ear=0.0, lower=lambda phi: 0.0):
    """How much of this point is under the hair, 0..1 (with an optional
    lowering of the hairline round the head, for fringes and long backs)."""
    z_h = lerp_table(HAIRLINE, azimuth(v)) - lower(azimuth(v))
    return smoothstep(z_h - 0.003, z_h + 0.004, v.z) * (1 - smoothstep(0.08, 0.25, ear))


# --- Hair and beards: shells over the scalp and the jaw ---------------------------------------
def tangent(d, n):
    t = d - n * d.dot(n)
    return t.normalized() if t.length > 1e-6 else n.orthogonal().normalized()


def noise3(p, seed=0):
    from mathutils import noise
    return noise.noise(p + Vector((seed * 17.3, seed * 5.1, seed * 9.7)))


def shell(name, mats, material, binder, used, region, thick, flow, lift=None, cuts=1, ridges=None, extra=None):
    """A hair volume: the head's faces where `region` says so, subdivided,
    then lifted off the skin by `thick` (metres) along the normal, plus any
    `lift` (a vector), with clump ridges across the strands' `flow`."""
    faces = [f for f in HEAD["faces"] if all(i in used for i in f) and min(region(VERTS[i], i) for i in f) > 0.0 and max(region(VERTS[i], i) for i in f) > 0.02]
    vids = sorted({i for f in faces for i in f})
    local = {i: n for n, i in enumerate(vids)}
    bm = bmesh.new()
    vs = [bm.verts.new(VERTS[i]) for i in vids]
    for f in faces:
        try:
            bm.faces.new([vs[local[i]] for i in f])
        except ValueError:
            pass
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True, smooth=0.0)
    out_flow = []
    for v in bm.verts:
        loc, n, tri, w = binder.nearest(v.co)
        idx = tri[max(range(3), key=lambda k: w[k])]
        r = region(loc, idx)
        f = flow(loc, n)
        t = thick(loc, n) * r
        if ridges:
            across = f.cross(n)
            spacing, amp = ridges
            q = loc.dot(across) / spacing + 0.6 * noise3(loc * 90)
            t += amp * r * (0.5 + 0.5 * math.cos(2 * math.pi * q)) * (0.6 + 0.4 * noise3(loc * 40, 3))
        p = loc + n * (0.0009 + t)
        if lift:
            p += lift(loc, n) * r
        if extra:
            p += extra(loc, n, f) * r
        v.co = p
        out_flow.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mats[material])
    attr = me.attributes.new("_FLOW", "FLOAT_VECTOR", "POINT")
    for k, f in enumerate(out_flow):
        attr.data[k].vector = f
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    # Facing outward: a shell's normals point away from the head.
    me.update()
    flips = sum(1 for p in me.polygons if p.normal.dot(p.center - HC) < 0)
    if flips > len(me.polygons) / 2:
        for p in me.polygons:
            p.flip()
    binder.bind(ob)
    return ob


CROWN_PT = Vector((-0.025, 0.0, 1.757))  # the whorl, back of the crown


def top_of(v):
    """0 at the hairline round the sides, 1 on top of the head."""
    return smoothstep(1.67, 1.745, v.z)


def front_of(v):
    return smoothstep(0.04, 0.12, v.x)


def hair_styles(mats, binder, used):
    ear = {i: ear_mask(i) for i in used}
    sc = lambda lower=(lambda phi: 0.0): (lambda v, i: scalp(v, ear.get(i, 0.0), lower))
    X, Z = Vector((1, 0, 0)), Vector((0, 0, 1))
    back_flow = lambda v, n: tangent(-X * 1.0 + Z * (0.9 * front_of(v) - 0.5 * (1 - top_of(v))), n)
    crown_flow = lambda v, n: tangent((v - CROWN_PT) + Z * -0.02, n)
    out = []
    # Short crop: an even short layer, falling from the crown.
    out.append(shell("hair_crop", mats, "hair", binder, used, sc(),
                     lambda v, n: 0.004 + 0.007 * top_of(v), crown_flow, ridges=(0.006, 0.0015)))
    # Swept up and back: volume rising off the forehead, short at the sides.
    out.append(shell("hair_swept", mats, "hair", binder, used, sc(),
                     lambda v, n: 0.005 + 0.016 * top_of(v) + 0.016 * top_of(v) * front_of(v),
                     back_flow, ridges=(0.009, 0.004),
                     lift=lambda v, n: Z * 0.008 * front_of(v) * top_of(v)))
    # Textured, a fringe forward over the top of the forehead.
    fringe = lambda phi: 0.017 * (1 - smoothstep(0.35, 0.75, phi))
    out.append(shell("hair_textured", mats, "hair", binder, used, sc(fringe),
                     lambda v, n: 0.005 + 0.012 * top_of(v) + 0.004 * front_of(v),
                     lambda v, n: tangent((v - CROWN_PT) * 1.0 + X * 0.06 * front_of(v) - Z * 0.03, n),
                     ridges=(0.007, 0.0035)))
    # Curly: a deeper layer, broken into curls.
    out.append(shell("hair_curly", mats, "hair", binder, used, sc(),
                     lambda v, n: 0.008 + 0.018 * top_of(v), crown_flow, cuts=2,
                     extra=lambda v, n, f: n * 0.0045 * (noise3(v * 140) + 0.5 * noise3(v * 300, 2))))
    # Longer, swept back, over the collar at the back.
    nape = lambda phi: 0.035 * smoothstep(1.9, 2.6, phi)
    out.append(shell("hair_long_back", mats, "hair", binder, used, sc(nape),
                     lambda v, n: 0.008 + 0.02 * top_of(v) + 0.008 * front_of(v) * top_of(v),
                     back_flow, ridges=(0.011, 0.004),
                     lift=lambda v, n: Z * 0.006 * front_of(v) * top_of(v)))
    out.append(braids(mats, binder, used, sc()))
    return out


def braids(mats, binder, used, region):
    """Braids along the scalp from the hairline back, tied into a bun at the
    back of the crown."""
    X, Z = Vector((1, 0, 0)), Vector((0, 0, 1))
    flow = lambda v, n: tangent(-X + Z * (-0.4 * (1 - top_of(v))), n)
    rows = shell("hair_braids", mats, "hair", binder, used, region, lambda v, n: 0.0035, flow,
                 cuts=2, ridges=(0.011, 0.0045))
    # The bun: a knot of braids at the back of the crown.
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=0.032)
    centre = Vector((-0.074, 0.0, 1.715))
    for v in bm.verts:
        d = v.co.copy()
        # Coiled: wrapped braids round the knot.
        a = math.atan2(d.y, d.z)
        d *= 1 + 0.12 * (0.5 + 0.5 * math.cos(a * 9 + d.x * 160))
        v.co = centre + Vector((d.x * 0.85, d.y * 1.15, d.z * 0.95))
    flow_attr = []
    for v in bm.verts:
        r = v.co - centre
        flow_attr.append(tangent(Vector((0, -r.z, r.y)), r.normalized()))
    me = bpy.data.meshes.new("bun")
    bm.to_mesh(me)
    bm.free()
    attr = me.attributes.new("_FLOW", "FLOAT_VECTOR", "POINT")
    for k, f in enumerate(flow_attr):
        attr.data[k].vector = f
    bun = bpy.data.objects.new("bun", me)
    bpy.context.scene.collection.objects.link(bun)
    me.materials.append(mats["hair"])
    for p in me.polygons:
        p.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    rows.select_set(True)
    bun.select_set(True)
    bpy.context.view_layer.objects.active = rows
    bpy.ops.object.join()
    for name in ("_BIND", "_BARY"):
        if name in rows.data.attributes:
            rows.data.attributes.remove(rows.data.attributes[name])
    binder.bind(rows)
    return rows


def beards(mats, binder, used):
    """Facial hair: shells over the beard's area of the skin."""
    L = landmarks()
    Z = Vector((0, 0, 1))
    area = {i: beard_area(VERTS[i], L) * (1 - smoothstep(0.2, 0.55, key_mag("lips_volume_incr", i) / LIPS_TOP[0])) for i in used}
    down = lambda v, n: tangent(-Z + Vector((0.3, 0, 0)), n)
    mouth, chin = L["mouth"], L["chin"]
    chin_w = lambda v: smoothstep(mouth.z - 0.006, chin.z - 0.01, v.z) * (1 - smoothstep(0.015, 0.045, abs(v.y)))
    upper_lip = lambda v: smoothstep(mouth.z + 0.003, mouth.z + 0.008, v.z) * (1 - smoothstep(mouth.z + 0.017, mouth.z + 0.022, v.z)) * (1 - smoothstep(0.024, 0.032, abs(v.y)))
    out = []
    reg = lambda v, i, f=1.0: min(1.0, area.get(i, 0.0) * f)
    out.append(shell("beard_short_beard", mats, "beard", binder, used, lambda v, i: reg(v, i),
                     lambda v, n: 0.003 + 0.003 * chin_w(v), down, ridges=(0.004, 0.001)))
    out.append(shell("beard_full_beard", mats, "beard", binder, used, lambda v, i: reg(v, i, 1.3),
                     lambda v, n: 0.006 + 0.008 * chin_w(v), down, ridges=(0.005, 0.0018),
                     extra=lambda v, n, f: -Z * 0.006 * chin_w(v)))
    # A moustache and a beard on the chin and along the jaw; bare cheeks.
    jaw = lambda v: smoothstep(mouth.z + 0.004, mouth.z - 0.012, v.z)
    out.append(shell("beard_moustache", mats, "beard", binder, used,
                     lambda v, i: reg(v, i) * max(upper_lip(v), jaw(v)),
                     lambda v, n: 0.0035 + 0.0025 * upper_lip(v) + 0.003 * chin_w(v),
                     lambda v, n: tangent(-Z + Vector((0, 0.8 if v.y > 0 else -0.8, 0)) * upper_lip(v) + Vector((0.3, 0, 0)), n),
                     ridges=(0.0045, 0.0012)))
    return out


LIPS_TOP = [1.0]


def build(mats):
    """Every part of the bare head, as objects in the figure's space."""
    head, used = head_mesh(mats)
    vid = head.data.attributes.new("_VID", "FLOAT", "POINT")
    for n, i in enumerate(used):
        vid.data[n].value = i
    textured(mats["eye_iris"], iris_image())
    textured(mats["brows"], strand_image("brow_hairs", 512, 96, brow_strokes, 7))
    textured(mats["lashes"], strand_image("lash_hairs", 512, 64, lash_strokes, 9))
    EAR_TOP[0] = max(max(key_mag("ear_size_incr", i), key_mag("ear_out_incr", i)) for i in used)
    LIPS_TOP[0] = max(key_mag("lips_volume_incr", i) for i in used)
    binder = Binder(used)
    L = landmarks()
    # _SCALP: where hair grows on the head, for the hairline's soft edge and
    # a buzz cut, shaded on the skin.
    scalp_attr = head.data.attributes.new("_SCALP", "FLOAT", "POINT")
    for n, i in enumerate(used):
        scalp_attr.data[n].value = scalp(VERTS[i], ear_mask(i))
    la = lashes(mats)
    lash_uvs(la, None)
    parts = [head, eye("L", mats), eye("R", mats), la, brows(mats, binder, L)]
    parts += hair_styles(mats, binder, set(used))
    parts += beards(mats, binder, set(used))
    return head, parts
