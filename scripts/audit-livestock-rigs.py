"""Inspect supplied Meshy rigs and render their bind and imported walking poses."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def points(mesh):
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices]


def audit(source_root, output):
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for species in ['Goat', 'Pig', 'Sheep']:
        for source in sorted((source_root / species).glob('*.glb')):
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.import_scene.gltf(filepath=str(source))
            scene = bpy.context.scene
            arm = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
            mesh = next(obj for obj in scene.objects if obj.type == 'MESH')
            action = arm.animation_data.action if arm.animation_data else None
            record = {
                'source': str(source),
                'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'triangles': sum(len(face.vertices) - 2 for face in mesh.data.polygons),
                'armatureMatrix': [list(row) for row in arm.matrix_world],
                'bones': [{
                    'name': bone.name,
                    'parent': bone.parent.name if bone.parent else None,
                    'head': list(arm.matrix_world @ bone.head_local),
                    'tail': list(arm.matrix_world @ bone.tail_local),
                } for bone in arm.data.bones],
                'importedAction': action.name if action else None,
                'frames': list(action.frame_range) if action else None,
            }
            scene.render.engine = 'CYCLES'
            scene.cycles.samples = 12
            scene.render.resolution_x = 640
            scene.render.resolution_y = 480
            scene.render.resolution_percentage = 100
            scene.world = bpy.data.worlds.new('Neutral studio')
            scene.world.use_nodes = True
            scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.35, .39, .43, 1)
            scene.world.node_tree.nodes['Background'].inputs[1].default_value = .7
            arm.animation_data.action = None
            for bone in arm.pose.bones:
                bone.matrix_basis.identity()
            bpy.context.view_layer.update()
            vertices = points(mesh)
            low = Vector(tuple(min(p[i] for p in vertices) for i in range(3)))
            high = Vector(tuple(max(p[i] for p in vertices) for i in range(3)))
            center = (low + high) * .5
            extent = max(high - low)
            record['bindBounds'] = [list(low), list(high)]
            bpy.ops.object.camera_add(location=center + Vector((1.8, -1.6, .65)) * extent)
            camera = bpy.context.object
            camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
            camera.data.type = 'ORTHO'
            camera.data.clip_start = extent * .0001
            camera.data.clip_end = extent * 500
            camera.data.ortho_scale = extent * 1.6
            scene.camera = camera
            bpy.ops.object.light_add(type='AREA', location=center + Vector((1, -2, 3)) * extent)
            bpy.context.object.data.energy = 250 * extent ** 2
            bpy.context.object.data.shape = 'DISK'
            bpy.context.object.data.size = extent * 3
            bpy.ops.mesh.primitive_plane_add(size=extent * 200, location=(0, 0, low.z - .002))
            for label, frame in [('bind', None), ('walk-start', 1), ('walk-middle', int(action.frame_range[1] * .5) if action else 1)]:
                arm.animation_data.action = action if frame else None
                if frame:
                    scene.frame_set(frame)
                bpy.context.view_layer.update()
                record[label] = {
                    'hips': list(arm.matrix_world @ arm.pose.bones['Hips'].head),
                    'chest': list(arm.matrix_world @ arm.pose.bones['chest'].head),
                }
                scene.render.filepath = str(output / (source.stem.lower() + '-' + label + '.png'))
                bpy.ops.render.render(write_still=True)
            records.append(record)
            (output / 'source-rigs.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    audit(args.source_root, args.output.resolve())
