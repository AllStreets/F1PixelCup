# Blender MCP setup

Lets Claude Code drive Blender (model, texture, light, render, export glTF)
for the planned 3D overhaul.

## What is already installed

- Blender **5.2.2 LTS** at `/Applications/Blender.app` (verified working)
- Addon `blender_mcp.py` in
  `~/Library/Application Support/Blender/5.2/scripts/addons/`
  (installed with `mcp-for-blender install-addon`)
- `.mcp.json` in the repo root registers the MCP server for this project

## The one gotcha: architecture

This is an arm64 Mac, but the `uvx` first on PATH is Anaconda's **x86_64**
build. Left alone it resolves an x86_64 Python, finds no prebuilt wheel for
`cryptography`, tries to compile it from Rust source, and fails.

`.mcp.json` therefore pins a native arm64 interpreter:

    uvx --python /opt/homebrew/opt/python@3.14/bin/python3.14 \
        --from mcp-for-blender mcp-for-blender

If you ever move or upgrade that Python, update `.mcp.json` to match.

## Using it

1. Start Blender with the socket server:

       ./tools/start-blender-mcp.sh

   A Blender window opens and the server listens on `localhost:9876`.
   The addon will NOT run under `blender --background` - it needs a GUI
   event loop to execute queued commands.

2. Start (or restart) Claude Code in this directory. It will ask you to
   approve the project-scoped `blender` MCP server.

3. Leave Blender open for as long as you want Claude to drive it.

## What the addon can do

- `execute_code` - arbitrary Blender Python (modelling, materials, render)
- `get_scene_info`, `get_object_info`, `export_scene` (glTF out, for Three.js)
- **Poly Haven** - free HDRIs, textures and models, no API key
- **Sketchfab**, **Poly Pizza** - model libraries, need API keys
- **Rodin / Hyper3D** and **Hunyuan3D** - AI text-to-3D generation

So car models do not have to be hand-coded in Python - they can be pulled
from a library or generated, then exported to glTF.

## The car model

`tools/blender/build_f1_car.py` builds the car from lofted cross-sections and
exports `assets/f1_car.glb`. Materials are named by role (`livery_body`,
`livery_trim`, `helmet`, ...) and `render3d.js` recolours them per team, so
one model covers the whole grid. To rebuild, with the MCP server running:

    import os
    os.environ["F1_CAR_OUT"] = "<repo>/assets/f1_car.glb"
    exec(open("<repo>/tools/blender/build_f1_car.py").read())

## Removing it

Delete `.mcp.json`, `tools/start-blender-mcp.sh`, this file, and
`~/Library/Application Support/Blender/5.2/scripts/addons/blender_mcp.py`.
