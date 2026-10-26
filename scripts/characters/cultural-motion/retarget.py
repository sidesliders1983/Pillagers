"""Extract the already-generated SMPL-H motion in the original native bone frames."""

import argparse
import hashlib
import json
import pathlib
import sys

import bpy


def parse_arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=pathlib.Path, required=True)
    parser.add_argument('--source-directory', type=pathlib.Path, required=True)
    parser.add_argument('--native', type=pathlib.Path, required=True)
    parser.add_argument('--output-directory', type=pathlib.Path, required=True)
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return parser.parse_args(arguments)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_poses(arguments, manifest, source_clip):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=str(arguments.native))
    target = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
    target.name = 'NativeHumanRig'
    idle = next(action for action in bpy.data.actions if action.name.startswith('Idle_02'))
    target.animation_data_clear()
    target.animation_data_create()
    target.animation_data.action = idle
    if hasattr(idle, 'slots') and len(idle.slots):
        target.animation_data.action_slot = idle.slots[0]
    target_rest = {
        name: target.matrix_world @ target.data.bones[name].matrix_local
        for name in target.data.bones.keys()
    }

    previous_objects = set(bpy.data.objects)
    source_path = arguments.source_directory / source_clip['file']
    bpy.ops.import_scene.fbx(filepath=str(source_path), automatic_bone_orientation=True)
    source = next(obj for obj in bpy.data.objects
                  if obj not in previous_objects and obj.type == 'ARMATURE')
    source.name = 'GeneratedMotionRig'
    start, end = map(int, source.animation_data.action.frame_range)
    frame_count = int(round(end - start)) + 1
    upper_body = {
        name: source_name
        for name, source_name in manifest['semanticMapping'].items()
        if not any(part in name for part in ['Hips', 'UpLeg', 'Leg', 'Foot', 'ToeBase'])
    }
    ordered = sorted(upper_body, key=lambda name: len(target.data.bones[name].parent_recursive))
    hand_names = ['L_Wrist', 'R_Wrist', 'L_Thumb1', 'R_Thumb1', 'L_Middle1', 'R_Middle1']
    frames = []
    scene.frame_set(1)
    for index in range(frame_count):
        scene.frame_set(start + index)
        # Native Idle keeps root and lower body. Source upper orientations are presentation only.
        for name in ordered:
            source_bone = source.pose.bones[upper_body[name]]
            target_bone = target.pose.bones[name]
            world_rotation = (source.matrix_world @ source_bone.matrix).to_quaternion()
            current_world = target.matrix_world @ target_bone.matrix
            desired_world = world_rotation.to_matrix().to_4x4()
            desired_world.translation = current_world.translation
            target_bone.matrix = target.matrix_world.inverted() @ desired_world
            bpy.context.view_layer.update()
        poses = {
            name: [list(row) for row in target.matrix_world @ bone.matrix]
            for name, bone in target.pose.bones.items()
        }
        source_hands = {
            name: list((source.matrix_world @ source.pose.bones[name].matrix).translation)
            for name in hand_names
        }
        frames.append({'time': index / 30, 'worldMatrices': poses, 'sourceHands': source_hands})

    result = {
        'clip': source_clip['name'],
        'fps': 30,
        'duration': (frame_count - 1) / 30,
        'upperBodyOnly': True,
        'mappedUpperBones': len(upper_body),
        'nativeRestWorld': {
            name: [list(row) for row in matrix]
            for name, matrix in target_rest.items()
        },
        'frames': frames,
    }
    output = arguments.output_directory / (source_clip['name'] + '-native-world-poses.json')
    output.write_text(json.dumps(result) + '\n', encoding='utf-8')
    return {'name': source_clip['name'], 'frames': frame_count, 'upperBodyBones': len(upper_body)}


def main():
    arguments = parse_arguments()
    manifest = json.loads(arguments.manifest.read_text(encoding='utf-8-sig'))
    expected = manifest['intermediateNative']['uncompressed']['sha256']
    if digest(arguments.native) != expected:
        raise RuntimeError('Decoded native source differs from its pinned identity.')
    for source_clip in manifest['sources']:
        if digest(arguments.source_directory / source_clip['file']) != source_clip['sha256']:
            raise RuntimeError('Generated motion source identity differs: ' + source_clip['file'])
    results = [extract_poses(arguments, manifest, clip) for clip in manifest['sources']]
    print(json.dumps({'extracted': results}))


if __name__ == '__main__':
    main()
