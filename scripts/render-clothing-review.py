"""Render imported geometry unchanged, from the front/side/back. Blender CLI."""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

p = argparse.ArgumentParser()
p.add_argument('source', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--front', type=float, default=1)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()))
points = [o.matrix_world @ Vector(v) for o in bpy.context.scene.objects if o.type == 'MESH' for v in o.bound_box]
low = Vector([min(v[i] for v in points) for i in range(3)])
high = Vector([max(v[i] for v in points) for i in range(3)])
centre = (low + high) / 2
height = high.z - low.z
a.output.mkdir(parents=True, exist_ok=True)
(a.output / 'bounds.json').write_text(json.dumps({'min': list(low), 'max': list(high)}, indent=2))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 4
scene.cycles.use_denoising = False
scene.render.resolution_x = 480
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.threads_mode = 'FIXED'
scene.render.threads = 3
scene.world.color = (.7, .7, .7)
scene.render.film_transparent = True
bpy.ops.object.light_add(type='AREA', location=centre + Vector((-2, 3, 4)) * height)
bpy.context.object.data.energy = 600
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = height * 4
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = height * 1.15
scene.camera = camera
for label, direction in [('front', (0, a.front, 0)), ('side', (1, 0, 0)), ('back', (0, -a.front, 0))]:
    camera.location = centre + Vector(direction) * height * 3
    camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str((a.output / (label + '.png')).resolve())
    bpy.ops.render.render(write_still=True)
