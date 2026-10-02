"""Cut the head and neck out of MakeHuman's base mesh and write head.json
(docs/superpowers/specs/2026-10-01-driver-faces-design.md).

  python3 tools/blender/makehuman/extract.py <cache dir from fetch.py>

Our own reader of MakeHuman's data formats (a Wavefront OBJ, and targets as
lines of "vertex dx dy dz"); the data is CC0 1.0. Coordinates stay MakeHuman's
(decimetres, Y up, facing +Z, +X the figure's left); build_driver.py moves them
onto the figure.

head.json holds:
- verts: the head and neck in the base shape (a young adult male, a little
  more muscular than average, the three ethnic targets at a third each, the
  eyes a little more open and the mouth's corners a little up);
- quads (or triangles) and their UVs, as MakeHuman maps them;
- helpers: MakeHuman's eye and eyelash helper geometry, which every target
  moves too (the eyeballs and the lashes follow the face);
- keys: each shape key as sparse deltas {vertex: [dx, dy, dz]} over the
  vertices kept (body and helpers alike), less the movement of the neck's
  foot, so a key reshapes the head without lifting it off the shoulders.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CUT_Y = 5.6  # keep every body face wholly above this height (decimetres)
HELPERS = ["helper-l-eye", "helper-r-eye", "helper-l-eyelashes-1", "helper-r-eyelashes-1",
           "helper-l-eyelashes-2", "helper-r-eyelashes-2"]

# The base shape: (target, weight).
BASE = [
    ("macrodetails/universal-male-young-averagemuscle-averageweight", 0.5),
    ("macrodetails/universal-male-young-maxmuscle-averageweight", 0.5),
    ("macrodetails/african-male-young", 1 / 3),
    ("macrodetails/asian-male-young", 1 / 3),
    ("macrodetails/caucasian-male-young", 1 / 3),
    # A rested, pleasant face: the eyes a little more open, the corners of
    # the mouth a little up (MakeHuman's default reads tired and glum).
    ("eyes/l-eye-height2-incr", 0.3),
    ("eyes/r-eye-height2-incr", 0.3),
    ("mouth/mouth-angles-up", 0.35),
]


def both(t):
    """A target on both sides of the face."""
    return [(t.replace("{s}", "l"), 1.0), (t.replace("{s}", "r"), 1.0)]


def one(t):
    return [(t, 1.0)]


# Bipolar keys: name -> (the targets for +1, the targets for -1). The key is
# written as name_incr and name_decr.
BIPOLAR = {
    "head_width": (one("head/head-scale-horiz-incr"), one("head/head-scale-horiz-decr")),
    "face_length": (one("head/head-scale-vert-incr"), one("head/head-scale-vert-decr")),
    "head_depth": (one("head/head-scale-depth-incr"), one("head/head-scale-depth-decr")),
    "head_age": (one("head/head-age-incr"), one("head/head-age-decr")),
    "head_fat": (one("head/head-fat-incr"), one("head/head-fat-decr")),
    "jaw_width": (one("chin/chin-bones-incr"), one("chin/chin-bones-decr")),
    "chin_width": (one("chin/chin-width-incr"), one("chin/chin-width-decr")),
    "chin_prominent": (one("chin/chin-prominent-incr"), one("chin/chin-prominent-decr")),
    "chin_height": (one("chin/chin-height-incr"), one("chin/chin-height-decr")),
    "cheekbones": (both("cheek/{s}-cheek-bones-incr"), both("cheek/{s}-cheek-bones-decr")),
    "cheek_volume": (both("cheek/{s}-cheek-volume-incr"), both("cheek/{s}-cheek-volume-decr")),
    "nose_length": (one("nose/nose-scale-vert-incr"), one("nose/nose-scale-vert-decr")),
    "nose_width": (one("nose/nose-scale-horiz-incr"), one("nose/nose-scale-horiz-decr")),
    "nose_depth": (one("nose/nose-scale-depth-incr"), one("nose/nose-scale-depth-decr")),
    "nose_hump": (one("nose/nose-hump-incr"), one("nose/nose-hump-decr")),
    "nose_tip": (one("nose/nose-point-up"), one("nose/nose-point-down")),
    "nose_flare": (one("nose/nose-flaring-incr"), one("nose/nose-flaring-decr")),
    "nose_volume": (one("nose/nose-volume-incr"), one("nose/nose-volume-decr")),
    "brow_forward": (one("eyebrows/eyebrows-trans-forward"), one("eyebrows/eyebrows-trans-backward")),
    "brow_height": (one("eyebrows/eyebrows-trans-up"), one("eyebrows/eyebrows-trans-down")),
    "brow_angle": (one("eyebrows/eyebrows-angle-up"), one("eyebrows/eyebrows-angle-down")),
    "forehead_height": (one("forehead/forehead-scale-vert-incr"), one("forehead/forehead-scale-vert-decr")),
    "forehead_slope": (one("forehead/forehead-trans-forward"), one("forehead/forehead-trans-backward")),
    "lips_volume": ([("mouth/mouth-upperlip-volume-incr", 1.0), ("mouth/mouth-lowerlip-volume-incr", 1.0)],
                    [("mouth/mouth-upperlip-volume-decr", 1.0), ("mouth/mouth-lowerlip-volume-decr", 1.0)]),
    "mouth_width": (one("mouth/mouth-scale-horiz-incr"), one("mouth/mouth-scale-horiz-decr")),
    "mouth_corners": (one("mouth/mouth-angles-up"), one("mouth/mouth-angles-down")),
    "eye_size": (both("eyes/{s}-eye-scale-incr"), both("eyes/{s}-eye-scale-decr")),
    "eye_angle": (both("eyes/{s}-eye-eyefold-angle-up"), both("eyes/{s}-eye-eyefold-angle-down")),
    "eye_open": (both("eyes/{s}-eye-height2-incr"), both("eyes/{s}-eye-height2-decr")),
    "eye_bag": (both("eyes/{s}-eye-bag-incr"), both("eyes/{s}-eye-bag-decr")),
    "eye_spacing": (both("eyes/{s}-eye-trans-out"), both("eyes/{s}-eye-trans-in")),
    "ear_size": (both("ears/{s}-ear-scale-incr"), both("ears/{s}-ear-scale-decr")),
    "ear_out": (both("ears/{s}-ear-wing-incr"), both("ears/{s}-ear-wing-decr")),
    "neck_width": (one("neck/neck-scale-horiz-incr"), one("neck/neck-scale-horiz-decr")),
}
# Unipolar keys (0..1).
UNIPOLAR = {f"head_{s}": one(f"head/head-{s}") for s in ("square", "oval", "round", "triangular", "invertedtriangular", "rectangular", "diamond")}
UNIPOLAR["chin_cleft"] = one("chin/chin-cleft-incr")
# The keys that move the whole head, held at the neck's foot (see main()).
ANCHORED = {"face_length", "head_depth"}
# The ethnic blend, as differences from the even mix in the base shape.
ETHNIC = ("african", "asian", "caucasian")

FILES = sorted({t for t, _ in BASE}
               | {t for pair in BIPOLAR.values() for side in pair for t, _ in side}
               | {t for ts in UNIPOLAR.values() for t, _ in ts})


def read_obj(path):
    V, VT, F, FT, FG = [], [], [], [], []
    group = None
    for line in open(path):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vt "):
            VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith("g "):
            group = line.split()[1]
        elif line.startswith("f "):
            corners = [c.split("/") for c in line.split()[1:]]
            F.append([int(c[0]) - 1 for c in corners])
            FT.append([int(c[1]) - 1 if len(c) > 1 and c[1] else -1 for c in corners])
            FG.append(group)
    return V, VT, F, FT, FG


def read_target(cache, name):
    out = {}
    for line in open(os.path.join(cache, "targets", name + ".target")):
        if line.startswith("#") or not line.strip():
            continue
        a = line.split()
        out[int(a[0])] = [float(x) for x in a[1:4]]
    return out


def main(cache):
    V, VT, F, FT, FG = read_obj(os.path.join(cache, "3dobjs", "base.obj"))
    cached = {}

    def target(name):
        if name not in cached:
            cached[name] = read_target(cache, name)
        return cached[name]

    def mix(parts):
        out = {}
        for name, w in parts:
            for i, d in target(name).items():
                o = out.setdefault(i, [0.0, 0.0, 0.0])
                for k in range(3):
                    o[k] += w * d[k]
        return out

    for i, d in mix(BASE).items():
        for k in range(3):
            V[i][k] += d[k]

    faces = [k for k, g in enumerate(FG) if g == "body" and all(V[i][1] > CUT_Y for i in F[k])]
    helper_faces = {h: [k for k, g in enumerate(FG) if g == h] for h in HELPERS}
    keep = sorted({i for k in faces for i in F[k]} | {i for fs in helper_faces.values() for k in fs for i in F[k]})
    index = {v: n for n, v in enumerate(keep)}
    uv_keep = sorted({t for k in faces for t in FT[k]} | {t for fs in helper_faces.values() for k in fs for t in FT[k]})
    uv_index = {t: n for n, t in enumerate(uv_keep)}

    # The neck's foot: the lowest sixth of the body kept. The keys that scale
    # or move the whole head (MakeHuman's ethnic targets change the figure's
    # height, lifting the head several centimetres; the face's length and
    # depth scale it about its middle) are moved so this stays put, and the
    # neck always stands in the suit's collar. The local ones are left as
    # MakeHuman made them.
    ys = sorted(V[i][1] for k in faces for i in F[k])
    foot = [i for i in {i for k in faces for i in F[k]} if V[i][1] <= ys[len(ys) // 6]]

    def sparse(d, anchored=False):
        t = [0.0, 0.0, 0.0]
        if anchored:
            t = [sum(d.get(i, (0.0, 0.0, 0.0))[k] for i in foot) / len(foot) for k in range(3)]
        out = {}
        for i in keep:
            v = [x - y for x, y in zip(d.get(i, (0.0, 0.0, 0.0)), t)]
            if max(abs(x) for x in v) > 2e-4:
                out[index[i]] = [round(x, 5) for x in v]
        return out

    keys = {}
    for name, (plus, minus) in BIPOLAR.items():
        keys[name + "_incr"] = sparse(mix(plus), name in ANCHORED)
        keys[name + "_decr"] = sparse(mix(minus), name in ANCHORED)
    for name, parts in UNIPOLAR.items():
        keys[name] = sparse(mix(parts))
    for e in ETHNIC:
        parts = [(f"macrodetails/{e}-male-young", 1.0)] + [(f"macrodetails/{o}-male-young", -1 / 3) for o in ETHNIC]
        keys[f"ethnic_{e}"] = sparse(mix(parts), True)

    doc = {
        "source": "MakeHuman base mesh hm08 and targets, makehumancommunity/makehuman@" + os.environ.get("MH_COMMIT", "a8bc2d54ff0ac92e78ff71431b1023eda42bf482") + ", CC0 1.0",
        "units": "decimetres, Y up, facing +Z, +X the figure's left",
        "verts": [[round(x, 5) for x in V[i]] for i in keep],
        "uvs": [[round(x, 5) for x in VT[t]] for t in uv_keep],
        "faces": [[index[i] for i in F[k]] for k in faces],
        "face_uvs": [[uv_index[t] for t in FT[k]] for k in faces],
        "helpers": {h: {"faces": [[index[i] for i in F[k]] for k in fs], "face_uvs": [[uv_index[t] for t in FT[k]] for k in fs]}
                    for h, fs in helper_faces.items()},
        "keys": keys,
    }
    out = os.path.join(HERE, "head.json")
    with open(out, "w") as f:
        json.dump(doc, f, separators=(",", ":"))
    print("wrote", out, len(keep), "verts", len(faces), "faces", len(keys), "keys", os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/makehuman")
