"""The Earth the Las Vegas Sphere shows (r3d/landmarks.js sphereScreen): NASA's
Blue Marble, sized for the Sphere at track distance and packed as a model the
game's loader fetches with the venue.

  python3 tools/sphere/fetch_earth.py [--cache DIR]

Sources (NASA Earth Observatory / Visible Earth; NASA imagery is in the
public domain), fetched 2026-10-12:

- colour: Blue Marble Next Generation with topography and bathymetry,
  December 2004, 5400x2700 equirectangular
  https://visibleearth.nasa.gov/images/73909
  (file world.topo.bathy.200412.3x5400x2700.jpg)
- clouds: Blue Marble clouds, 2048x1024 equirectangular
  https://visibleearth.nasa.gov/images/57747
  (file cloud_combined_2048.jpg)

Writes assets/landmarks/vegas_earth.glb: two materials, `earth` (the colour
map at 2048x1024) and `clouds` (the cloud map at 1024x512, grey), their
images inside the file, on a single triangle nothing draws.
"""
import argparse
import io
import json
import os
import struct
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SOURCES = {
    "earth": "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg",
    "clouds": "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg",
}
# Each map's size in the model and its JPEG quality (the colour map under 400 KB).
SIZES = {"earth": ((2048, 1024), 74), "clouds": ((1024, 512), 70)}


def source(name, cache):
    path = os.path.join(cache, os.path.basename(SOURCES[name])) if cache else None
    if path and os.path.exists(path):
        return open(path, "rb").read()
    data = urllib.request.urlopen(urllib.request.Request(SOURCES[name], headers={"User-Agent": "F1PixelCup-build/1.0"}), timeout=300).read()
    if path:
        open(path, "wb").write(data)
    return data


def sized(name, cache):
    size, quality = SIZES[name]
    im = Image.open(io.BytesIO(source(name, cache)))
    im = im.convert("L" if name == "clouds" else "RGB").resize(size, Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="")
    args = ap.parse_args()
    images = {name: sized(name, args.cache) for name in SOURCES}
    tri = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
    chunks = [tri, *images.values()]
    views, blob = [], b""
    for c in chunks:
        blob += b"\0" * (-len(blob) % 4)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(c)})
        blob += c
    blob += b"\0" * (-len(blob) % 4)
    names = list(images)
    doc = {
        "asset": {"version": "2.0", "generator": "tools/sphere/fetch_earth.py", "copyright": "NASA Earth Observatory / Visible Earth (public domain)"},
        "scene": 0, "scenes": [{"name": "vegas_earth", "nodes": [0]}], "nodes": [{"name": "vegas_earth", "children": [1 + k for k in range(len(names))]}, *[{"name": n, "mesh": k} for k, n in enumerate(names)]],
        "meshes": [{"name": n, "primitives": [{"attributes": {"POSITION": 0}, "material": k}]} for k, n in enumerate(names)],
        "materials": [{"name": n, "pbrMetallicRoughness": {"baseColorTexture": {"index": k}, "metallicFactor": 0, "roughnessFactor": 1}} for k, n in enumerate(names)],
        "textures": [{"source": k, "sampler": 0} for k in range(len(names))],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 33071}],
        "images": [{"name": n, "mimeType": "image/jpeg", "bufferView": 1 + k} for k, n in enumerate(names)],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 0]}],
        "bufferViews": views, "buffers": [{"byteLength": len(blob)}],
    }
    body = json.dumps(doc, separators=(",", ":")).encode()
    body += b" " * (-len(body) % 4)
    out = os.path.join(ROOT, "assets", "landmarks", "vegas_earth.glb")
    with open(out, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(body) + 8 + len(blob)))
        f.write(struct.pack("<I4s", len(body), b"JSON") + body)
        f.write(struct.pack("<I4s", len(blob), b"BIN\0") + blob)
    print({n: len(v) // 1024 for n, v in images.items()}, "KB;", os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main()
