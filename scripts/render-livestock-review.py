"""Render fixed walking and fallen poses from decoded published runtime assets."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def render_all(directory, output):
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for source in sorted(directory.glob('*.glb')):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(source))
        scene = bpy.context.scene
        arm = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
        for track in arm.animation_data.nla_tracks:
            track.mute = True
        actions = {name: next(action for action in bpy.data.actions if action.name == name)
                   for name in ['Walk', 'Death']}
        mesh = next(obj for obj in scene.objects if obj.type == 'MESH')
        arm.animation_data.action = actions['Walk']
        scene.frame_set(int(actions['Walk'].frame_range[1] * .25))
        bpy.context.view_layer.update()
        evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        vertices = [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices]
        low = Vector(tuple(min(point[axis] for point in vertices) for axis in range(3)))
        high = Vector(tuple(max(point[axis] for point in vertices) for axis in range(3)))
        center = (low + high) * .5
        extent = max(high - low)
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 12
        scene.render.resolution_x = 512
        scene.render.resolution_y = 384
        scene.render.resolution_percentage = 100
        scene.world = bpy.data.worlds.new('Studio')
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.3, .36, .4, 1)
        scene.world.node_tree.nodes['Background'].inputs[1].default_value = .8
        bpy.ops.object.camera_add(location=center + Vector((1.5, -2, .85)) * extent)
        camera = bpy.context.object
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = extent * 1.65
        camera.data.clip_start = .001
        scene.camera = camera
        bpy.ops.object.light_add(type='AREA', location=center + Vector((-1, -2, 3)) * extent)
        bpy.context.object.data.energy = 350 * extent ** 2
        bpy.context.object.data.size = extent * 3
        bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, -.005))
        for name in ['Walk', 'Death']:
            arm.animation_data.action = actions[name]
            end = actions[name].frame_range[1]
            scene.frame_set(int(end * .25) if name == 'Walk' else int(end))
            bpy.context.view_layer.update()
            scene.render.filepath = str(output / (source.stem + '-' + name.lower() + '.png'))
            bpy.ops.render.render(write_still=True)
            records.append({'asset': source.stem, 'clip': name, 'frame': scene.frame_current,
                            'decodedSourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                            'file': Path(scene.render.filepath).name})
        (output / 'renders.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    render_all(args.input.resolve(), args.output.resolve())
