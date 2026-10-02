"""Download the MakeHuman data files the driver's head is made from, pinned to
one commit (docs/superpowers/specs/2026-10-01-driver-faces-design.md).

MakeHuman's assets (the base mesh and the targets) are CC0 1.0: see the
repository's LICENSE.md, section C, and LICENSE.ASSETS.md, and the header of
every file. Only data files are fetched; none of MakeHuman's (AGPL) code.

  python3 tools/blender/makehuman/fetch.py <cache dir>

Then extract.py turns them into head.json, which is committed.
"""
import os
import sys
import urllib.request

COMMIT = "a8bc2d54ff0ac92e78ff71431b1023eda42bf482"
BASE = f"https://raw.githubusercontent.com/makehumancommunity/makehuman/{COMMIT}/makehuman/data/"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import FILES  # noqa: E402


def main(cache):
    for rel in ["3dobjs/base.obj"] + [f"targets/{t}.target" for t in FILES]:
        out = os.path.join(cache, rel)
        if os.path.exists(out):
            continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with urllib.request.urlopen(BASE + rel) as r, open(out, "wb") as f:
            f.write(r.read())
        print("fetched", rel)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/makehuman")
