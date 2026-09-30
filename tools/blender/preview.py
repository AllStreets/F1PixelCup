"""Render a GLB from a few angles to PNGs, for reviewing a model by eye.

  Blender -b --factory-startup -P tools/blender/preview.py -- model.glb out_prefix [size]

Writes out_prefix_front.png, _side.png, _rear.png and _top3q.png: a studio
floor, a key and a fill light, the model's own materials.
"""
import bpy
import math
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, prefix = argv[0], argv[1]
size = int(argv[2]) if len(argv) > 2 else 900

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.data.objects if o.type == "MESH"]
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in objs:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
centre = (lo + hi) / 2
extent = max((hi - lo).length, 0.5)

scene = bpy.context.scene
engines = [i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else ("BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else engines[0])
scene.render.resolution_x = size
scene.render.resolution_y = int(size * 0.62)
scene.render.film_transparent = False
world = bpy.data.worlds.new("studio")
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.32, 0.34, 0.38, 1)
bg.inputs["Strength"].default_value = 0.8
scene.world = world

bpy.ops.mesh.primitive_plane_add(size=extent * 12, location=(centre.x, centre.y, lo.z))
floor = bpy.context.active_object
fm = bpy.data.materials.new("floor")
fm.use_nodes = True
b = next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
b.inputs["Base Color"].default_value = (0.18, 0.18, 0.2, 1)
b.inputs["Roughness"].default_value = 0.6
floor.data.materials.append(fm)

def light(name, kind, loc, energy, rot=None):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    ob = bpy.data.objects.new(name, data)
    ob.location = loc
    if rot:
        ob.rotation_euler = rot
    scene.collection.objects.link(ob)
    return ob

light("key", "SUN", (0, 0, 10), 4.0, (math.radians(40), math.radians(10), math.radians(35)))
light("fill", "SUN", (0, 0, 10), 1.2, (math.radians(60), math.radians(-20), math.radians(-140)))

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

def shoot(tag, direction, up=0.0):
    d = Vector(direction).normalized()
    cam.location = centre + d * extent * 1.55 + Vector((0, 0, up * extent))
    look = centre - cam.location
    cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{prefix}_{tag}.png"
    bpy.ops.render.render(write_still=True)

# glTF import: the model's forward (+X in Blender build scripts) stays +X.
shoot("top3q", (1.0, 0.9, 0.55))
shoot("side", (0.0, 1.0, 0.12))
shoot("front", (1.0, 0.05, 0.18))
shoot("rear", (-1.0, 0.35, 0.3))
