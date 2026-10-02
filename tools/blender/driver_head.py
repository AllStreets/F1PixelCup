"""The driver's bare head for the podium: the face, eyes, brows, lashes, hair
styles and facial hair (docs/superpowers/specs/2026-10-01-driver-faces-design.md).

Built from MakeHuman's CC0 base mesh and targets, cut out by
tools/blender/makehuman/extract.py into head.json. build_driver.py calls
build(), then skins the head to the rig and puts the rest on the head bone.

Hair, beards and brows are thin shells laid on the skin. Each vertex carries
what r3d/driver.js needs to grow strands out of it as stacked layers (fur
shells): _TIP, the offset from the skin to the hair's outer surface; _FLOW,
the way the strands lie; _HAIR, (how far inside the hair's edge, 0 at the
edge and 1 well inside; the strand coordinates across and along, metres).
Every one of them is bound to the head's surface (_BIND, _BARY), so a
driver's face shape reshapes his hair and beard with it.

Coordinates: the figure's (metres, facing +X, Y left, Z up).
"""
import bmesh
import bpy
import json
import math
import os
import random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
HEAD = json.load(open(os.path.join(HERE, "makehuman", "head.json")))

# MakeHuman's male stands 17.3 dm; ours 1.78 m.
S = 1.78 / 17.304
CROWN = 1.762      # the top of the bare head
NECK_CUT = 1.425   # the neck runs down into the suit to here
OX = -0.02         # the head's offset forward, so its neck stands over the body's
# The suit's collar: the top of its lip. Below the jaw the neck is fitted
# inside it (build() passes the collar's real outline, build_driver.py's).
COLLAR_TOP = 1.475
FIT_FROM, FIT_TO = 1.54, 1.49


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


class Collar:
    """The collar's outline round the neck: its centre and its radius at
    every bearing, from points on its top edge."""

    def __init__(self, pts):
        self.cx = sum(p[0] for p in pts) / len(pts)
        self.cy = sum(p[1] for p in pts) / len(pts)
        self.table = sorted((math.atan2(p[1] - self.cy, p[0] - self.cx), math.hypot(p[0] - self.cx, p[1] - self.cy)) for p in pts)

    def radius(self, a):
        t = self.table
        for (a0, r0), (a1, r1) in zip(t + [(t[0][0] + 2 * math.pi, t[0][1])], t[1:] + [(t[0][0] + 2 * math.pi, t[0][1])]):
            if a0 <= a <= a1 or a0 <= a + 2 * math.pi <= a1:
                aa = a if a0 <= a <= a1 else a + 2 * math.pi
                return r0 + (r1 - r0) * (aa - a0) / max(1e-9, a1 - a0)
        return t[0][1]


def default_collar():
    """An ellipse, for tools that load this module without the body."""
    return Collar([(0.004 + 0.062 * math.cos(2 * math.pi * k / 48), 0.064 * math.sin(2 * math.pi * k / 48)) for k in range(48)])


def fit(v, collar):
    """Fit a point of the lower neck into the collar: MakeHuman's neck widens
    into the shoulders, so below the jaw every point further out than the
    collar is drawn in to it and down into the suit (further out, further
    down, so the surface never folds), and the neck's foot is eased out to
    meet the collar's edge."""
    t = smoothstep(FIT_FROM, FIT_TO, v.z)
    if t <= 0:
        return v
    dx, dy = v.x - collar.cx, v.y - collar.cy
    a = math.atan2(dy, dx)
    rho = math.hypot(dx, dy)
    lim = collar.radius(a) - 0.0015
    z = v.z
    if rho > lim:
        z -= (rho - lim) * 1.4 * t
        # (Drawn in by how far down it ends, so a point dropped below the
        # collar's lip is wholly inside it.)
        t = max(t, smoothstep(FIT_FROM, FIT_TO, z))
        new = rho + (lim - rho) * t
    else:
        new = rho + (lim - rho) * t * smoothstep(1.508, COLLAR_TOP, v.z)
    k = new / max(rho, 1e-9)
    return Vector((collar.cx + dx * k, collar.cy + dy * k, z))


RAW = [P(p) for p in HEAD["verts"]]
KEY_NAMES = list(HEAD["keys"].keys())
VERTS, KEYS = [], {}


def setup(collar):
    """The head's vertices and every shape key, with the neck fitted to
    this collar."""
    VERTS[:] = [fit(v, collar) for v in RAW]
    KEYS.clear()
    # Where the neck meets the collar no key moves it: each key is fitted on
    # its own, and several together could push the neck through the collar
    # or open a gap round it. (The keys fade out over the centimetre above.)
    hold = lambda v: smoothstep(COLLAR_TOP + 0.007, COLLAR_TOP + 0.018, v.z)
    for name, deltas in HEAD["keys"].items():
        KEYS[name] = {int(i): (fit(RAW[int(i)] + D(d), collar) - VERTS[int(i)]) * hold(VERTS[int(i)]) for i, d in deltas.items()}


setup(default_collar())


def key_mag(name, idx):
    d = KEYS[name].get(idx)
    return d.length if d else 0.0


def helper_ids(name):
    return sorted({i for f in HEAD["helpers"][name]["faces"] for i in f})


# --- The head and neck --------------------------------------------------------
def head_faces():
    return [k for k, f in enumerate(HEAD["faces"]) if all(VERTS[i].z > NECK_CUT for i in f)]


def head_mesh(mats):
    faces = head_faces()
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
    return ob, used


class Surface:
    """The head's skin, for laying things on it: nearest points and rays,
    with smooth normals, and the triangle (three head vertex ids) and
    barycentric weights each point is bound by."""

    def __init__(self, used):
        self.used = set(used)
        faces = [f for f in HEAD["faces"] if all(i in self.used for i in f)]
        self.tris = []
        for f in faces:
            for k in range(1, len(f) - 1):
                self.tris.append((f[0], f[k], f[k + 1]))
        self.bvh = BVHTree.FromPolygons(VERTS, self.tris)
        normals = [Vector() for _ in VERTS]
        for f in faces:
            pts = [VERTS[i] for i in f]
            n = (pts[2] - pts[0]).cross(pts[3 % len(pts)] - pts[1])
            for i in f:
                normals[i] += n
        self.normals = [n.normalized() if n.length > 0 else Vector((0, 0, 1)) for n in normals]

    def _at(self, loc, fi):
        a, b, c = self.tris[fi]
        w = barycentric(loc, VERTS[a], VERTS[b], VERTS[c])
        n = (self.normals[a] * w[0] + self.normals[b] * w[1] + self.normals[c] * w[2]).normalized()
        return loc, n, (a, b, c), w

    def nearest(self, p):
        loc, _, fi, _ = self.bvh.find_nearest(p)
        return self._at(loc, fi)

    def ray(self, origin, direction, dist=1.0):
        loc, _, fi, _ = self.bvh.ray_cast(origin, direction, dist)
        if loc is None:
            return None
        return self._at(loc, fi)


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


def bind(me, binds):
    """_BIND (three head vertex ids) and _BARY (their weights) per vertex."""
    ids = me.attributes.new("_BIND", "FLOAT_VECTOR", "POINT")
    bary = me.attributes.new("_BARY", "FLOAT_VECTOR", "POINT")
    for k, (tri, w) in enumerate(binds):
        ids.data[k].vector = tri
        bary.data[k].vector = w


def landmarks():
    """Points on the face, in the figure's space, found from where the
    targets act."""
    def centroid(name, lo=0.5, side=0):
        top = max((d.length for d in KEYS[name].values()), default=0)
        pts = [VERTS[i] for i, d in KEYS[name].items() if d.length > top * lo and side * VERTS[i].y >= 0]
        return sum(pts, Vector()) / len(pts)
    eye = sum((VERTS[i] for i in helper_ids("helper-l-eye")), Vector()) / len(helper_ids("helper-l-eye"))
    mouth = centroid("lips_volume_incr")
    ear = centroid("ear_size_incr", 0.4, 1)
    nose = centroid("nose_volume_incr")
    front = [v for v in VERTS if abs(v.y) < 0.01]
    chin = min((v for v in front if v.x > mouth.x - 0.03), key=lambda v: v.z)
    return {"eye": eye, "mouth": mouth, "ear": ear, "nose": nose, "chin": chin}


def masks(ob, used, L):
    """_MASKS on the skin: lips, beard, warmth (cheeks, nose, ears), eye
    sockets; and _SCALP, where hair grows."""
    def norm(name):
        top = max(KEYS[name][i].length for i in used if i in KEYS[name])
        return lambda i: key_mag(name, i) / top
    lips, cheek, nose, ear, bag = (norm(n) for n in ("lips_volume_incr", "cheek_volume_incr", "nose_volume_incr", "ear_out_incr", "eye_bag_incr"))
    attr = ob.data.attributes.new("_MASKS", "FLOAT_COLOR", "POINT")
    scalp_attr = ob.data.attributes.new("_SCALP", "FLOAT", "POINT")
    eyes = [L["eye"], L["eye"] * Vector((1, -1, 1))]
    for n, i in enumerate(used):
        v = VERTS[i]
        r = smoothstep(0.2, 0.55, lips(i))
        g = beard_area(v, L) * (1 - r)
        b = max(0.8 * smoothstep(0.1, 0.7, cheek(i)), 0.7 * smoothstep(0.15, 0.8, nose(i)), 0.9 * smoothstep(0.1, 0.6, ear(i)), 0.5 * r)
        # The socket: the lids and the hollow round them.
        d = min((v - e).length for e in eyes)
        a = max(smoothstep(0.1, 0.6, bag(i)) * 0.7, 1 - smoothstep(0.016, 0.026, d))
        attr.data[n].color = (r, g, b, a)
        scalp_attr.data[n].value = scalp_region(v, ear_mask(i))


def occlusion(me, points, normals, surface, rays=48, reach=0.045):
    """_AO: how open the sky over each point is, 0..1, from rays round its
    normal against the head (closer hits shade more): the eye sockets, the
    corners of the mouth and nose, under the chin, the eyeballs under the
    lids."""
    dirs = []
    golden = math.pi * (3 - math.sqrt(5))
    for k in range(rays):
        z = 1 - (k + 0.5) / rays
        r = math.sqrt(max(0.0, 1 - z * z))
        dirs.append(Vector((math.cos(golden * k) * r, math.sin(golden * k) * r, z)))
    attr = me.attributes.new("_AO", "FLOAT", "POINT")
    for k, (p, n) in enumerate(zip(points, normals)):
        n = n.normalized()
        t = n.orthogonal().normalized()
        b = n.cross(t)
        open_ = 0.0
        total = 0.0
        for d in dirs:
            w = d.z  # cosine-weighted
            ray = (t * d.x + b * d.y + n * d.z).normalized()
            loc, _, _, dist = surface.bvh.ray_cast(p + n * 0.0006, ray, reach)
            open_ += w * (1.0 if loc is None else smoothstep(0.0, reach, dist))
            total += w
        attr.data[k].value = open_ / total


# --- Eyes -----------------------------------------------------------------------
def eye_frame(side):
    idx = helper_ids(f"helper-{side.lower()}-eye")
    c = sum((VERTS[i] for i in idx), Vector()) / len(idx)
    r = sum((VERTS[i] - c).length for i in idx) / len(idx)
    return idx, c, r


IRIS_R = 0.0062   # the visible iris, about 12 mm across


def ball(side):
    """The eyeball: MakeHuman's helper is a sphere 32 mm across, roomier than
    an eye (about 24 mm); ours is 29 mm, a little smaller than the helper,
    its front where the helper's is, so it fills the socket's corners
    without breaking through the lids round it."""
    _, c, r = eye_frame(side)
    R = r * 0.9
    return c + Vector((r * 0.94 - R, 0, 0)), R


def iris_image():
    """An iris: fibres running out from the pupil, crypts, a darker ring at
    the limbus, a lighter collarette; grey, so the material's colour tints it."""
    n = 256
    img = bpy.data.images.new("iris", n, n, alpha=False)
    rnd = random.Random(16)
    fib = [rnd.random() for _ in range(900)]
    crypt = [(rnd.random() * 2 * math.pi, 0.4 + 0.45 * rnd.random(), 0.03 + 0.04 * rnd.random()) for _ in range(40)]
    px = [0.0] * (n * n * 4)
    for y in range(n):
        for x in range(n):
            u, v = (x + 0.5) / n * 2 - 1, (y + 0.5) / n * 2 - 1
            r = math.hypot(u, v)
            ang = math.atan2(v, u)
            a = (ang / (2 * math.pi)) % 1.0
            k = a * 900
            f = fib[int(k) % 900] * (1 - (k % 1)) + fib[(int(k) + 1) % 900] * (k % 1)
            g = 0.6 + 0.4 * f
            for ca, cr, cs in crypt:
                da = (ang - ca + math.pi) % (2 * math.pi) - math.pi
                g *= 1 - 0.35 * math.exp(-((da * r / cs) ** 2 + ((r - cr) / (cs * 1.6)) ** 2))
            g *= 1.0 + 0.3 * math.exp(-((r - 0.5) / 0.06) ** 2)      # the collarette
            g *= 0.75 + 0.25 * smoothstep(0.3, 0.5, r)                # darker round the pupil
            g *= 1 - 0.7 * smoothstep(0.8, 0.98, r)                   # the limbal ring
            g = 0.015 if r < 0.3 else g * smoothstep(0.3, 0.33, r) + 0.015
            o = (y * n + x) * 4
            px[o:o + 4] = (g, g, g, 1.0)
    img.pixels = px
    img.pack()
    return img


def eye(side, mats):
    """An eyeball: the sclera, the iris disc set into it, and a clear cornea
    over the iris. Shape keys move it with the face, as they move its helper;
    only the eye's own size scales it, as much as the lids round it open."""
    idx, c0, r = eye_frame(side)
    c, R = ball(side)
    bm = bmesh.new()
    segs, rings = 36, 18
    IRIS = math.asin(IRIS_R / R)
    fwd = Vector((1, 0, 0))

    def sph(theta, phi, rad=R):
        return c + Vector((math.cos(theta), math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi))) * rad

    thetas = [IRIS + (math.pi - IRIS) * k / rings for k in range(rings + 1)]
    grid = [[bm.verts.new(sph(t, 2 * math.pi * j / segs)) for j in range(segs)] for t in thetas]
    for a, b in zip(grid, grid[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((a[j], a[k], b[k], b[j]))
    sclera_faces = len(bm.faces)
    lim = R * math.sin(IRIS)
    depth = R * math.cos(IRIS) - R * 0.03
    ring_r = [lim * t for t in (1.0, 0.75, 0.5, 0.3, 0.12)]
    iris_rings = []
    for rr in ring_r:
        iris_rings.append([bm.verts.new(c + fwd * (depth + R * 0.025 * (1 - rr / lim)) + Vector((0, math.cos(2 * math.pi * j / segs), math.sin(2 * math.pi * j / segs))) * rr) for j in range(segs)])
    centre = bm.verts.new(c + fwd * (depth + R * 0.025))
    edge = grid[0]
    for j in range(segs):
        k = (j + 1) % segs
        bm.faces.new((edge[j], edge[k], iris_rings[0][k], iris_rings[0][j]))
    for a, b in zip(iris_rings, iris_rings[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((a[j], a[k], b[k], b[j]))
    for j in range(segs):
        bm.faces.new((iris_rings[-1][j], iris_rings[-1][(j + 1) % segs], centre))
    iris_first = sclera_faces + segs
    corn = []
    for k in range(6):
        t = IRIS * 1.12 * (1 - k / 6)
        bulge = 1 + 0.06 * (1 - (t / (IRIS * 1.12)) ** 2)
        corn.append([bm.verts.new(sph(t, 2 * math.pi * j / segs, R * bulge)) for j in range(segs)])
    tip = bm.verts.new(c + fwd * R * 1.06)
    cornea_first = len(bm.faces)
    for a, b in zip(corn, corn[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((a[j], a[k], b[k], b[j]))
    for j in range(segs):
        bm.faces.new((corn[-1][j], corn[-1][(j + 1) % segs], tip))
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
    # How each shape key moves and scales the eye, as the node's extras
    # (glTF's axes: Y up, Z toward the figure's right): {key: [dx, dy, dz,
    # scale - 1]} about its centre. r3d/driver.js moves the eye by them; a
    # few numbers in place of a morph target per key.
    lids = [i for i in range(len(VERTS)) if (VERTS[i] - c0).length < r * 1.45 and i not in idx and (VERTS[i] - c0).x > 0]
    keys = {}
    for name in KEY_NAMES:
        moved = [VERTS[i] + KEYS[name].get(i, Vector()) for i in idx]
        c2 = sum(moved, Vector()) / len(moved)
        # (A key that stretches the head one way stretches the helper too;
        # an eyeball stays round and its size, so only its centre moves.)
        r2 = r
        if name.startswith("eye_size"):
            # The eye's own size: as much as the lids round it open or close.
            lc = sum((VERTS[i] for i in lids), Vector()) / len(lids)
            lm = [VERTS[i] + KEYS[name].get(i, Vector()) for i in lids]
            lc2 = sum(lm, Vector()) / len(lm)
            spread = sum((p - lc).length for p in (VERTS[i] for i in lids)) / len(lids)
            spread2 = sum((p - lc2).length for p in lm) / len(lm)
            r2 = r * spread2 / spread
        d = c2 - c0
        if d.length < 1e-5 and abs(r2 - r) < 1e-5:
            continue
        keys[name] = [round(d.x, 6), round(d.z, 6), round(-d.y, 6), round(r2 / r - 1, 6)]
    ob["eye_keys"] = keys
    ob["eye_centre"] = [c.x, c.z, -c.y]
    return ob


def opening(side, surface, steps=72):
    """The eye's opening as seen from the front: round the eye's centre, the
    furthest out a ray from straight ahead still reaches the eyeball before
    the skin. Returns [(angle, the lid's edge on the skin, its normal, its
    binding)] going round."""
    c, R = ball(side)
    out = []
    for k in range(steps):
        a = 2 * math.pi * k / steps
        d = Vector((0, math.cos(a), math.sin(a)))
        lo, hi = 0.0, R * 1.2
        for _ in range(22):
            mid = (lo + hi) / 2
            o = c + d * mid + Vector((0.2, 0, 0))
            hit = surface.ray(o, Vector((-1, 0, 0)))
            # Where the ray meets the eyeball's sphere, if it does.
            q = mid / R
            ball_x = c.x + R * math.sqrt(max(0.0, 1 - q * q)) if q < 1 else None
            if ball_x is not None and (hit is None or ball_x > hit[0].x):
                lo = mid
            else:
                hi = mid
        o = c + d * (hi + 0.0004) + Vector((0.2, 0, 0))
        hit = surface.ray(o, Vector((-1, 0, 0)))
        if hit is None:
            raise RuntimeError("the eye's lid edge was not found")
        out.append((a, hit))
    return out


# --- Strand textures ---------------------------------------------------------------
def strand_image(name, w, h, strokes, seed):
    """Fine hairs drawn as anti-aliased strokes on a clear ground: white, so
    the material's colour tints them; their coverage is the alpha.
    strokes(rnd) yields polylines [(x, y), ...] with a width and an alpha."""
    import numpy as np
    rnd = random.Random(seed)
    alpha = np.zeros((h, w), dtype=np.float32)
    shade = np.ones((h, w), dtype=np.float32)
    for pts, width, a, tone in strokes(rnd, w, h):
        total = sum(math.hypot(x1 - x0, y1 - y0) for (x0, y0), (x1, y1) in zip(pts, pts[1:]))
        run = 0.0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            seg = math.hypot(x1 - x0, y1 - y0)
            n = max(2, int(seg * 2))
            for k in range(n):
                t = k / n
                x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                along = (run + seg * t) / max(total, 1e-6)
                rr = width * (1 - 0.75 * along) * 0.5 + 0.3
                for yy in range(int(y - rr - 1), int(y + rr + 2)):
                    for xx in range(int(x - rr - 1), int(x + rr + 2)):
                        if 0 <= xx < w and 0 <= yy < h:
                            cov = max(0.0, min(1.0, rr + 0.5 - math.hypot(xx + 0.5 - x, yy + 0.5 - y)))
                            if cov > 0:
                                new = a * cov
                                alpha[yy, xx] = alpha[yy, xx] + new * (1 - alpha[yy, xx])
                                shade[yy, xx] = min(shade[yy, xx], tone)
            run += seg
    img = bpy.data.images.new(name, w, h, alpha=True)
    px = np.zeros((h, w, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = shade
    px[..., 3] = np.clip(alpha, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def lash_strokes(rnd, W, H):
    """Lashes from the lid (v = 0) out to their tips (v = 1), curling, in
    small clumps, longest a little outward of the middle of the lid. The
    left half of the texture is the upper lid's, the right the lower's,
    sparser."""
    for k in range(190):
        lower = k >= 140
        u = rnd.random()
        x0 = (u * 0.5 + (0.5 if lower else 0.0)) * W
        length = H * (0.45 + 0.55 * math.sin(math.pi * min(1.0, u * 1.1) ** 0.8)) * rnd.uniform(0.7, 1.0)
        lean = (u - 0.45) * 30 + rnd.uniform(-5, 5)
        pts = []
        for j in range(7):
            t = j / 6
            pts.append((x0 + lean * t * t, 1 + length * t))
        yield pts, rnd.uniform(1.2, 1.7) if lower else rnd.uniform(1.5, 2.2), 0.8 if lower else 1.0, rnd.uniform(0.85, 1.0)


# --- Lashes -------------------------------------------------------------------------
def lashes(mats, surface):
    """Lashes along the edge of each lid: a strip from the lid's edge out and
    forward, curling away from the eye; the upper lid's long and full, the
    lower lid's short and sparse. Bound to the lid, so they open and close
    with it."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    binds = []
    fwd = Vector((1, 0, 0))
    for side in ("L", "R"):
        _, c, _ = eye_frame(side)
        rim = opening(side, surface)
        sgn = 1 if side == "L" else -1
        # The corners: the opening's inner (nose) and outer ends.
        inner = min(range(len(rim)), key=lambda k: sgn * rim[k][1][0].y)
        outer = max(range(len(rim)), key=lambda k: sgn * rim[k][1][0].y)
        for upper in (True, False):
            # From the inner corner to the outer, over the top or under.
            ks = []
            k = inner
            step = -1 if upper == (sgn > 0) else 1
            while k != outer:
                ks.append(k)
                k = (k + step) % len(rim)
            ks.append(outer)
            length = 0.0062 if upper else 0.0022
            rows = []
            for n, k in enumerate(ks):
                t = n / (len(ks) - 1)
                loc, nrm, tri, w = rim[k][1]
                out = (loc - c)
                out.x = 0
                out.normalize()
                # Fuller toward the outer corner, none right at the corners.
                ln = length * (0.25 + 0.75 * math.sin(math.pi * min(1.0, t * 1.05)) ** 0.7)
                root = loc + fwd * 0.0004 - out * 0.0003
                # Out from the lid's edge, then curling away from the eye.
                mid = root + (fwd * 0.92 + out * 0.25).normalized() * ln * 0.5
                tip = root + (fwd * 0.62 + out * 0.78).normalized() * ln
                col = [bm.verts.new(p) for p in (root, mid, tip)]
                for _ in col:
                    binds.append((tri, w))
                rows.append((col, t))
            for (a, ta), (b, tb) in zip(rows, rows[1:]):
                for j in range(2):
                    f = bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
                    vs = [(ta, j / 2), (tb, j / 2), (tb, (j + 1) / 2), (ta, (j + 1) / 2)]
                    for loop, (uu, vv) in zip(f.loops, vs):
                        loop[uv].uv = (uu * 0.5 + (0 if upper else 0.5), vv)
    me = bpy.data.meshes.new("lashes")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mats["lashes"])
    for p in me.polygons:
        p.use_smooth = True
    bind(me, binds)
    ob = bpy.data.objects.new("lashes", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# --- Hair, beards and brows: shells for strands ------------------------------------------
def noise3(p, seed=0):
    """Smooth noise, -1..1."""
    from mathutils import noise
    return noise.noise(p + Vector((seed * 17.3, seed * 5.1, seed * 9.7)))


def tangent(d, n):
    t = d - n * d.dot(n)
    return t.normalized() if t.length > 1e-6 else n.orthogonal().normalized()


def attach(me, data, mats, material, name, variants=None):
    """The strand attributes and the binding, and the object. data holds a
    record per vertex: its bind, and {tip, flow, edge, st} (as _TIP, _FLOW,
    _HAIR), or with `variants`, one such record per variant (as _TIP_<V>,
    _FLOW_<V>, _HAIR_<V>: several styles sharing one shell; the figure
    draws its own)."""
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mats[material])
    for v in variants or [None]:
        suffix = f"_{v.upper()}" if v else ""
        tip = me.attributes.new("_TIP" + suffix, "FLOAT_VECTOR", "POINT")
        flow = me.attributes.new("_FLOW" + suffix, "FLOAT_VECTOR", "POINT")
        hair = me.attributes.new("_HAIR" + suffix, "FLOAT_VECTOR", "POINT")
        for k, rec in enumerate(data):
            s = rec[v] if v else rec
            tip.data[k].vector = s["tip"]
            flow.data[k].vector = s["flow"]
            hair.data[k].vector = (s["edge"], s["st"][0], s["st"][1])
    bind(me, [rec["bind"] for rec in data])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def skin_shell(name, mats, material, surface, styles, cuts=0):
    """One shell on the head's own faces for several styles, wherever any of
    them grows hair. styles: {name: (region, tip, flow, st)}, where region(v)
    is 0 at that style's edge, 1 well inside it and below 0 outside, so its
    strands' edge follows it smoothly across each face (the shader leaves
    out what is outside); tip(v, n), the offset to the hair's outer surface;
    flow(v, n), the way it lies; st(v), its strand coordinates. Subdivided
    `cuts` times, rounded, where the head's faces are large (the scalp's are
    about 1.5 cm)."""
    faces = [f for f in HEAD["faces"] if all(i in surface.used for i in f)]
    edge = {i: max(r(VERTS[i]) for r, _, _, _ in styles.values()) for i in surface.used}
    faces = [f for f in faces if max(edge[i] for i in f) > 0.0]
    vids = sorted({i for f in faces for i in f})
    local = {i: n for n, i in enumerate(vids)}
    bm = bmesh.new()
    vs = [bm.verts.new(VERTS[i]) for i in vids]
    for f in faces:
        bm.faces.new([vs[local[i]] for i in f])
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True, smooth=1.0)
    data = []
    for v in bm.verts:
        loc, n, tri, w = surface.nearest(v.co)
        # Never inside the skin.
        p = v.co if (v.co - loc).dot(n) > 0 else loc
        v.co = p + n * 0.0003
        rec = {"bind": (tri, w)}
        for k, (region, tip, flow, st) in styles.items():
            rec[k] = {"tip": tip(p, n), "flow": flow(p, n), "edge": region(p), "st": st(p)}
        data.append(rec)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return attach(me, data, mats, material, name, list(styles))


# --- The scalp and its hairline ------------------------------------------------------
HC = Vector((0.025, 0.0, 1.655))  # about the middle of the skull


def azimuth(v):
    """Round the head from the front (0) to the back (pi), either side."""
    return math.atan2(abs(v.y), v.x - HC.x)


# The hairline's height round the head (radians from the front, metres):
# across the forehead, back at the temples, down the sideburn in front of the
# ear, over the ear and down behind it to the nape.
HAIRLINE = [(0.0, 1.716), (0.3, 1.713), (0.55, 1.705), (0.75, 1.69), (0.9, 1.672), (1.05, 1.656), (1.18, 1.632),
            (1.27, 1.63), (1.33, 1.648), (1.45, 1.66), (1.62, 1.656), (1.8, 1.62), (2.1, 1.59), (2.5, 1.578), (math.pi, 1.575)]


def lerp_table(table, x):
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return table[-1][1]


EAR_TOP = [1.0]


def ear_mask(i):
    """The ear itself: where the target that swings it out from the head acts
    (the ear's size target also swells the scalp round it)."""
    return key_mag("ear_out_incr", i) / EAR_TOP[0]


EAR_IDS = []
EAR_TREE = [None]


def ear_near(v):
    """How much of the ear is here: the ear's own mask at the nearest of its
    vertices, faded over a few millimetres."""
    if EAR_TREE[0] is None:
        from mathutils.kdtree import KDTree
        tree = KDTree(len(EAR_IDS))
        for k, (i, _) in enumerate(EAR_IDS):
            tree.insert(VERTS[i], k)
        tree.balance()
        EAR_TREE[0] = tree
    _, k, dist = EAR_TREE[0].find(v)
    if k is None:
        return 0.0
    return EAR_IDS[k][1] * (1 - smoothstep(0.003, 0.008, dist))


def hairline_depth(v, lower=lambda phi: 0.0):
    """How far above the hairline this point of the skin is (metres; below
    it, negative), with the hairline lowered by `lower` round the head
    (lower(phi): phi round from the front, positive to the figure's left);
    the ears are never under hair."""
    phi = math.atan2(v.y, v.x - HC.x)
    # (The strands thin out over the first few millimetres in, so the edge
    # starts a little below the line.)
    d = v.z - (lerp_table(HAIRLINE, abs(phi)) - lower(phi)) + 0.004
    return d - 0.25 * ear_near(v)


def scalp_region(v, ear=0.0):
    """How much of this point of the skin grows hair, 0..1 (the scalp's
    shading round the hairline)."""
    z_h = lerp_table(HAIRLINE, azimuth(v))
    return smoothstep(z_h - 0.003, z_h + 0.006, v.z) * (1 - smoothstep(0.08, 0.25, ear))


CROWN_PT = Vector((-0.03, 0.0, 1.757))  # the whorl, back of the crown
PART_Y = 0.024                          # a side part, on the figure's left
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def top_of(v):
    """0 at the hairline round the sides, 1 on top of the head."""
    return smoothstep(1.68, 1.75, v.z)


def front_of(v):
    return smoothstep(0.0, 0.11, v.x)


def crown_st(v):
    """Strand coordinates radiating from the crown: across (round it) and
    along (away from it), metres."""
    d = v - CROWN_PT
    return (math.atan2(d.y, d.x) * 0.06, d.length)


def back_st(v):
    """Strand coordinates running front to back: across (round the head from
    side to side, over the top) and along (front to back)."""
    return (math.atan2(v.y, v.z - HC.z + 0.06) * 0.09, -v.x)


def crown_flow(v, n):
    return tangent(v - CROWN_PT - Z * 0.02, n)


def back_flow(v, n):
    # Up and back off the forehead, back over the top, down at the back.
    return tangent(-X + Z * (0.9 * front_of(v) * top_of(v) - 0.6 * (1 - top_of(v))), n)


def hair_styles(mats, surface):
    """Every hair style on one shell over the scalp ("hair"), and the bun the
    braids are tied into ("hair_bun")."""
    styles = {}

    def style(name, tip, flow, st, lower=lambda phi: 0.0, edge=0.012, ramp=0.025, lumps=0.0, cut=None):
        # The hair is thinner at its edge, its full depth only `ramp` in:
        # it grows out of the hairline, never stands up from it like a wall.
        # And it lies in locks a couple of centimetres across, some fuller
        # than others (`lumps`), never one smooth dome.
        def tip_(p, n):
            lock = 1 + lumps * (noise3(p * 55.0) + 0.5 * noise3(p * 120.0, 2))
            return tip(p, n) * lock * (0.3 + 0.7 * smoothstep(0.0, ramp, hairline_depth(p, lower)))
        # (`cut`: a further edge inside the hair, such as a part, 0 on it.)
        region = lambda v: min(hairline_depth(v, lower) / edge, cut(v) if cut else 9.0)
        styles[name] = (region, tip_, flow, st)

    # A buzz cut: a few millimetres all over.
    style("buzz", lambda p, n: n * 0.0022, crown_flow, crown_st, edge=0.005)
    # A short crop: short at the sides, a little longer on top, lying from the crown.
    style("crop", lambda p, n: n * (0.004 + 0.008 * top_of(p)) + crown_flow(p, n) * 0.006 * top_of(p), crown_flow, crown_st, lumps=0.25)
    # Swept up and back: volume rising off the forehead, short at the sides.
    style("swept", lambda p, n: n * (0.005 + 0.009 * top_of(p) + 0.006 * top_of(p) * front_of(p))
          + back_flow(p, n) * 0.016 * top_of(p) + Z * 0.002 * front_of(p) * top_of(p), back_flow, back_st, ramp=0.035, lumps=0.4)
    # Textured, a fringe brushed forward and over to the figure's right,
    # falling furthest just right of the middle of the forehead.
    textured_flow = lambda p, n: tangent((p - CROWN_PT) + X * 0.08 * front_of(p) - Y * 0.05 * front_of(p) - Z * 0.03, n)
    style("textured", lambda p, n: n * (0.005 + 0.009 * top_of(p) + 0.003 * front_of(p)) + textured_flow(p, n) * 0.014 * top_of(p),
          textured_flow, crown_st, lower=lambda phi: 0.024 * math.exp(-((phi + 0.22) / 0.42) ** 2), edge=0.018, lumps=0.5)
    # Curly: a deeper layer of tight curls.
    style("curly", lambda p, n: n * (0.009 + 0.017 * top_of(p)), crown_flow, crown_st, lumps=0.5)
    # Longer, swept back, down over the collar at the back.
    style("long_back", lambda p, n: n * (0.007 + 0.018 * top_of(p) + 0.008 * front_of(p) * top_of(p))
          + back_flow(p, n) * 0.02 * (0.3 + 0.7 * top_of(p)) + Z * 0.006 * front_of(p) * top_of(p),
          back_flow, back_st, lower=lambda phi: 0.03 * smoothstep(1.9, 2.6, abs(phi)), lumps=0.35)
    # Braids: rows from the hairline straight back, into a bun. (The shader
    # raises each row and plaits it; this is the rows' full height.)
    style("braids", lambda p, n: n * 0.0075, lambda p, n: tangent(-X - Z * 0.4 * (1 - top_of(p)), n), back_st, edge=0.006)
    # A side part on the figure's left: from the part the hair is combed
    # across the top to the right and down, and down to the left; a thin
    # line of scalp along the part.
    def side_flow(p, n):
        right = PART_Y - p.y
        return tangent(-Y * math.copysign(1.0, right) * (0.3 + top_of(p)) - X * 0.35 - Z * 0.5 * (1 - top_of(p)), n)
    part = lambda p: 9.0 if p.x < -0.02 or p.z < 1.7 else (abs(p.y - PART_Y) - 0.0012) / 0.0035
    style("side_part", lambda p, n: n * (0.005 + 0.01 * top_of(p) + 0.006 * top_of(p) * front_of(p) * smoothstep(0.0, 0.03, PART_Y - p.y))
          + side_flow(p, n) * 0.014 * top_of(p), side_flow, lambda p: (p.x, abs(p.y - PART_Y)), lumps=0.3, cut=part)
    # A straight fringe, combed forward from the crown over the forehead.
    fringe_flow = lambda p, n: tangent((p - CROWN_PT) + X * 0.12 * front_of(p) - Z * 0.05 * front_of(p), n)
    style("fringe", lambda p, n: n * (0.006 + 0.01 * top_of(p)) + fringe_flow(p, n) * 0.016 * (0.4 + 0.6 * top_of(p)),
          fringe_flow, crown_st, lower=lambda phi: (0.026 + 0.008 * math.sin(phi * 23.0) * math.sin(phi * 9.0 + 1.0)) * (1 - smoothstep(0.55, 0.95, abs(phi))),
          edge=0.022, lumps=0.55)
    # Tousled: fuller, the locks lying every which way.
    messy_flow = lambda p, n: tangent((p - CROWN_PT).normalized() + Vector((noise3(p * 40.0, 4), noise3(p * 40.0, 5), noise3(p * 40.0, 6))) * 1.3, n)
    style("messy", lambda p, n: n * (0.008 + 0.014 * top_of(p)) + messy_flow(p, n) * 0.01 * top_of(p), messy_flow, crown_st,
          lower=lambda phi: 0.012 * (1 - smoothstep(0.4, 0.9, abs(phi))), lumps=0.85)
    return [skin_shell("hair", mats, "hair", surface, styles, cuts=1), bun(mats, surface)]


def bun(mats, surface):
    """The braids gathered into a bun at the back of the crown: a knot of
    coiled braid."""
    centre = Vector((-0.083, 0.0, 1.708))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=16, radius=0.03)
    data = []
    for v in bm.verts:
        d = v.co.copy()
        v.co = centre + Vector((d.x * 0.75, d.y * 1.15, d.z * 1.0))
        r = (v.co - centre).normalized()
        _, _, tri, w = surface.nearest(v.co)
        data.append({"tip": r * 0.003, "flow": tangent(Vector((0, -r.z, r.y)), r), "edge": 1.0,
                     "st": (math.atan2(d.z, d.y) * 0.03, d.x), "bind": (tri, w)})
    me = bpy.data.meshes.new("hair_bun")
    bm.to_mesh(me)
    bm.free()
    return attach(me, data, mats, "hair", "hair_bun")


# --- Facial hair ------------------------------------------------------------------
def beard_area(v, L):
    """How much this point of the skin grows a beard, 0..1."""
    eye, mouth, ear, chin = L["eye"], L["mouth"], L["ear"], L["chin"]
    # How far round from the mouth toward the ear, 0 at the front.
    side = min(1.0, max(0.0, (mouth.x - v.x) / max(1e-4, mouth.x - ear.x)))
    # The upper edge: across the cheek below the cheekbone, up to the
    # sideburn by the ear.
    top = (eye.z - 0.044) * (1 - side) + (ear.z + 0.006) * side
    upper = 1 - smoothstep(top - 0.012, top + 0.006, v.z)
    # The lower edge: trimmed close under the chin, rising along the jaw to
    # its angle under the ear (never down the throat).
    low = (chin.z - 0.01) * (1 - side) + (ear.z - 0.07) * side
    lower = smoothstep(low - 0.006, low + 0.004, v.z)
    # Not behind the ear's front.
    front = smoothstep(ear.x - 0.004, ear.x + 0.01, v.x)
    # The upper cheek beside the nose stays bare.
    nose_side = 1 - (1 - smoothstep(0.022, 0.034, abs(v.y))) * smoothstep(mouth.z + 0.012, mouth.z + 0.022, v.z)
    return upper * lower * front * nose_side


def beards(mats, surface, L):
    """Facial hair: shells over the beard's area of the skin."""
    mouth, chin = L["mouth"], L["chin"]
    down = lambda v, n: tangent(-Z + X * 0.35, n)
    lips = lambda v: (1 - smoothstep(0.024, 0.03, abs(v.y))) * smoothstep(mouth.z - 0.007, mouth.z - 0.004, v.z) * (1 - smoothstep(mouth.z + 0.003, mouth.z + 0.006, v.z))
    chin_w = lambda v: smoothstep(mouth.z - 0.01, chin.z - 0.006, v.z) * (1 - smoothstep(0.012, 0.04, abs(v.y)))
    area = lambda v: beard_area(v, L) * (1 - lips(v))
    beard_st = lambda v: (math.atan2(v.y, v.x - 0.04) * 0.06, v.z)
    # A moustache joined at the corners of the mouth to a beard on the chin,
    # and a short beard along the jaw; the cheeks above the jaw bare.
    ear = L["ear"]
    side = lambda v: min(1.0, max(0.0, (mouth.x - v.x) / max(1e-4, mouth.x - ear.x)))
    upper_lip = lambda v: smoothstep(mouth.z + 0.003, mouth.z + 0.007, v.z) * (1 - smoothstep(mouth.z + 0.015, mouth.z + 0.02, v.z)) * (1 - smoothstep(0.027, 0.033, abs(v.y)))
    corners = lambda v: smoothstep(0.018, 0.023, abs(v.y)) * (1 - smoothstep(0.031, 0.037, abs(v.y))) * (1 - smoothstep(mouth.z + 0.008, mouth.z + 0.014, v.z))
    # (Trimmed close under the chin, not down the throat.)
    on_chin = lambda v: (1 - smoothstep(0.03, 0.038, abs(v.y))) * (1 - smoothstep(mouth.z - 0.011, mouth.z - 0.006, v.z)) * smoothstep(chin.z - 0.014, chin.z - 0.006, v.z)

    def jawline(v):
        # A narrow strip along the jaw's edge, trimmed tidy.
        top = (chin.z + 0.006) * (1 - side(v)) + (ear.z - 0.044) * side(v)
        low = top - 0.011
        return (1 - smoothstep(top - 0.004, top + 0.004, v.z)) * smoothstep(low - 0.004, low + 0.004, v.z)
    tache = lambda v: area(v) * min(1.0, max(upper_lip(v), corners(v), on_chin(v), jawline(v)))
    tache_flow = lambda v, n: tangent(-Z + Y * (1.0 if v.y > 0 else -1.0) * 0.8 * upper_lip(v) + X * 0.3, n)
    styles = {
        "short_beard": (area, lambda v, n: n * (0.0025 + 0.002 * chin_w(v)) + down(v, n) * 0.0015, down, beard_st),
        "full_beard": (lambda v: min(1.0, area(v) * 1.3),
                       lambda v, n: n * (0.0055 + 0.006 * chin_w(v)) + down(v, n) * 0.004 - Z * 0.004 * chin_w(v), down, beard_st),
        "moustache": (tache, lambda v, n: n * (0.0014 + 0.0005 * upper_lip(v) + 0.0006 * chin_w(v)) + tache_flow(v, n) * 0.0004,
                      tache_flow, beard_st),
    }
    return [skin_shell("beard", mats, "beard", surface, styles)]


# --- Brows ---------------------------------------------------------------------------
def brows(mats, surface, L):
    """A patch over each brow ridge for the brow's hairs: rising near the
    nose, lying outward along the arch. The patch is roomy; each driver's
    brow is drawn inside it by its own shape (r3d/driver.js), from _BROW:
    how far along the brow, 0 at its inner end and 1 at its tail, and how
    far above (or below) its middle line, metres. _HAIR's edge is a plain
    brow's shape, for what draws without one."""
    eye_c = L["eye"]
    bm = bmesh.new()
    data = []
    cols, rows = 32, 12
    for sgn in (1, -1):
        grid = []
        for i in range(cols + 1):
            t = i / cols
            y = sgn * (0.007 + (abs(eye_c.y) + 0.03 - 0.007) * t)
            # The middle line: nearly straight, rising a little to two thirds
            # of the way out, the tail dropping a little.
            zc = eye_c.z + 0.0172 + 0.002 * math.sin(math.pi * min(1.0, t / 1.3)) - 0.003 * max(0.0, t - 0.75) / 0.25
            half = 0.0056 * (1 - 0.5 * max(0.0, t - 0.4) / 0.6) * (0.8 + 0.2 * smoothstep(0.0, 0.15, t))
            col = []
            for j in range(rows + 1):
                vm = (j / rows * 2 - 1) * BROW_ROOM
                z = zc + vm
                hit = surface.ray(Vector((0.35, y, z)), Vector((-1, 0, 0)))
                if hit is None:
                    raise RuntimeError("a brow missed the face")
                loc, n, tri, w = hit
                # A plain brow: inside its height, and between its two ends.
                e = (1 - smoothstep(0.35, 1.0, abs(vm) / half)) * smoothstep(0.0, 0.16, t) * (1 - smoothstep(0.86, 1.0, t))
                # Near the nose the hairs stand up, further out they lie outward.
                rise = 1 - smoothstep(0.05, 0.35, t)
                f = tangent(Y * sgn * (1 - rise) + Z * (rise * 1.3 + 0.25), n)
                col.append(bm.verts.new(loc + n * 0.0003))
                # Strand coordinates on the brow itself (metres along it and
                # across it), turned with the hairs: across the brow where
                # they stand up, along it where they lie outward.
                um = t * (abs(eye_c.y) + 0.023)
                data.append({"tip": n * 0.001 + f * 0.0026, "flow": f, "edge": e,
                             "st": (vm + (um - vm) * rise, um + (vm - um) * rise), "bind": (tri, w), "brow": (t, vm, 0.0)})
            grid.append(col)
        for i in range(cols):
            for j in range(rows):
                q = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])
                bm.faces.new(q if sgn < 0 else tuple(reversed(q)))
    me = bpy.data.meshes.new("brows")
    bm.to_mesh(me)
    bm.free()
    brow = me.attributes.new("_BROW", "FLOAT_VECTOR", "POINT")
    for k, rec in enumerate(data):
        brow.data[k].vector = rec["brow"]
    return attach(me, data, mats, "brows", "brows")


# How far the brow's patch reaches above and below its middle line: room for
# the thickest, most arched brow a look may ask for (faces.js).
BROW_ROOM = 0.0125


def build(mats, collar_pts=None):
    """Every part of the bare head, as objects in the figure's space."""
    if collar_pts:
        setup(Collar(collar_pts))
    head, used = head_mesh(mats)
    vid = head.data.attributes.new("_VID", "FLOAT", "POINT")
    for n, i in enumerate(used):
        vid.data[n].value = i
    EAR_TOP[0] = max(key_mag("ear_out_incr", i) for i in used)
    EAR_IDS[:] = [(i, smoothstep(0.1, 0.3, ear_mask(i))) for i in used if ear_mask(i) > 0.1]
    EAR_TREE[0] = None
    L = landmarks()
    masks(head, used, L)
    surface = Surface(used)
    occlusion(head.data, [VERTS[i] for i in used], [surface.normals[i] for i in used], surface)
    textured(mats["eye_iris"], iris_image())
    textured(mats["lashes"], strand_image("lash_hairs", 512, 64, lash_strokes, 9))
    eyes = [eye("L", mats), eye("R", mats)]
    for e in eyes:
        occlusion(e.data, [v.co for v in e.data.vertices], [v.normal for v in e.data.vertices], surface)
    parts = [head, *eyes, lashes(mats, surface), brows(mats, surface, L)]
    parts += hair_styles(mats, surface)
    parts += beards(mats, surface, L)
    return head, parts


def textured(mat_, img):
    nt = mat_.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if img.alpha_mode != "NONE" and "Alpha" in tex.outputs:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
