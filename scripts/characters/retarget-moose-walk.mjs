import assert from 'node:assert/strict';
import { AnimationMixer, Box3, Matrix3, Quaternion, Vector3 } from 'three';

// The original Elk rig has extra shoulder, neck and hoof joints. Adjacent entries
// may share a donor rotation, retaining the Elk's authored segment lengths.
const mapping = {
    Bone_000: ['Hips'], Bone_001: ['Hips'], Bone_007: ['Hips'],
    Bone_006: ['Hips', 'chest', .5], Bone_005: ['chest'], Bone_004: ['chest'],
    Bone_022: ['chest'], Bone_021: ['chest', 'head', .5],
    Bone_020: ['head'], Bone_019: ['head'], Bone_018: ['head'],
    Bone_003: ['tail'], Bone_002: ['tailstart'],
    Bone_028: ['frontleg'], Bone_027: ['frontleg'], Bone_026: ['frontleg0'],
    Bone_025: ['frontleg1'], Bone_024: ['frontleg2'], Bone_023: ['frontleg2'],
    Bone_034: ['R_frontleg'], Bone_033: ['R_frontleg'], Bone_032: ['R_frontleg0'],
    Bone_031: ['R_frontleg1'], Bone_030: ['R_frontleg2'], Bone_029: ['R_frontleg2'],
    Bone_012: ['backleg'], Bone_011: ['backleg0'], Bone_010: ['backleg1'],
    Bone_009: ['backleg2'], Bone_008: ['backleg2'],
    Bone_017: ['R_backleg'], Bone_016: ['R_backleg0'], Bone_015: ['R_backleg1'],
    Bone_014: ['R_backleg2'], Bone_013: ['R_backleg2'],
};

/** Bake the supplied Meshy lynx gait onto the original moose skin, without moving
 * its horizontal root, changing bind matrices or copying the lynx's proportions. */
export function retargetMooseWalk(doc, target, donor) {
    assert.equal(donor.animations.length, 1, 'Expected the reviewed one-second lynx walk');
    const duration = donor.animations[0].duration;
    assert.ok(Math.abs(duration - 1) < .001);
    target.scene.updateMatrixWorld(true);
    donor.scene.updateMatrixWorld(true);
    const sourceBones = new Map();
    donor.scene.traverse(bone => {
        if (bone.isBone) sourceBones.set(bone.name, {
            bone, inverseBindRotation: bone.getWorldQuaternion(new Quaternion()).invert(),
        });
    });
    const joints = [];
    target.scene.traverse(bone => {
        if (!bone.isBone) return;
        assert.ok(mapping[bone.name], 'Unmapped moose bone: ' + bone.name);
        joints.push({ bone, position: bone.position.clone(), rotation: bone.quaternion.clone(),
            world: bone.getWorldQuaternion(new Quaternion()), values: [] });
    });
    assert.equal(joints.length, 35);
    const root = joints.find(joint => joint.bone.name === 'Bone_000');
    const ground = new Box3().setFromObject(target.scene, true).min.y;
    const inverseRoot = new Matrix3().setFromMatrix4(root.bone.parent.matrixWorld).invert();
    const mixer = new AnimationMixer(donor.scene);
    mixer.clipAction(donor.animations[0]).play();
    const delta = name => {
        const source = sourceBones.get(name);
        assert.ok(source, 'Missing donor joint: ' + name);
        return source.bone.getWorldQuaternion(new Quaternion()).multiply(source.inverseBindRotation);
    };
    const times = [], rootValues = [];
    // Dense contact samples prevent interpolated root height dipping through the
    // floor when support passes between hooves in the longer-legged target rig.
    const samples = 240;
    for (let frame = 0; frame <= samples; frame++) {
        const time = duration * frame / samples;
        times.push(time);
        mixer.setTime(time);
        donor.scene.updateMatrixWorld(true);
        for (const joint of joints) {
            joint.bone.position.copy(joint.position);
            joint.bone.quaternion.copy(joint.rotation);
        }
        target.scene.updateMatrixWorld(true);
        for (const joint of joints) {
            const [name, other, blend] = mapping[joint.bone.name];
            const motion = delta(name);
            if (other) motion.slerp(delta(other), blend);
            const desired = motion.multiply(joint.world);
            joint.bone.quaternion.copy(joint.bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired));
            joint.bone.updateWorldMatrix(false, true);
            joint.bone.quaternion.toArray(joint.values, frame * 4);
        }
        target.scene.updateMatrixWorld(true);
        const lowest = new Box3().setFromObject(target.scene, true).min.y;
        root.bone.position.add(new Vector3(0, ground - lowest, 0).applyMatrix3(inverseRoot));
        root.bone.position.toArray(rootValues, frame * 3);
    }
    mixer.stopAllAction();
    const buffer = doc.getRoot().listBuffers()[0];
    const nodes = new Map(doc.getRoot().listNodes().map(node => [node.getName(), node]));
    const accessor = (type, values) => doc.createAccessor().setType(type)
        .setArray(new Float32Array(values)).setBuffer(buffer);
    const input = accessor('SCALAR', times);
    const walk = doc.createAnimation('Walk');
    const add = (animation, node, path, output, keyframes = input) => {
        const sampler = doc.createAnimationSampler().setInterpolation('LINEAR').setInput(keyframes).setOutput(output);
        animation.addSampler(sampler).addChannel(doc.createAnimationChannel()
            .setTargetNode(node).setTargetPath(path).setSampler(sampler));
    };
    const idle = doc.createAnimation('Idle'), idleTime = accessor('SCALAR', [0, duration]);
    for (const joint of joints) {
        const node = nodes.get(joint.bone.name);
        add(walk, node, 'rotation', accessor('VEC4', joint.values));
        const rest = joint.rotation.toArray();
        add(idle, node, 'rotation', accessor('VEC4', [...rest, ...rest]), idleTime);
    }
    add(walk, nodes.get(root.bone.name), 'translation', accessor('VEC3', rootValues));
    const restPosition = root.position.toArray();
    add(idle, nodes.get(root.bone.name), 'translation', accessor('VEC3', [...restPosition, ...restPosition]), idleTime);
    return { operation: 'Retarget Lynx-animated.glb Walk onto all 35 original Elk joints; preserve bind geometry and lengths, plant the lowest hoof, and retain neutral Idle',
        donorDuration: duration, sampledFrames: times.length, mappedJoints: joints.length };
}
