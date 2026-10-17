import { AnimationMixer, Matrix4, Quaternion, Vector3 } from 'three';
/** Read only the source-authored fingers; body fitting continues to use the original neutral rig. */
export function nativeFingerPose(source) {
    const saved = [];
    source.scene.traverse(node => saved.push({ node, p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone() }));
    const clip = source.animations.find(clip => clip.name === 'Idle_02');
    if (!clip)
        throw new Error('Native grasp reference clip is missing');
    const mixer = new AnimationMixer(source.scene), action = mixer.clipAction(clip);
    try {
        action.play();
        action.time = .6;
        mixer.update(0);
        return new Map(saved.filter(({ node }) => /Hand(Thumb|Middle)[123]$/.test(node.name)).map(({ node }) => [node.name, node.quaternion.clone()]));
    }
    finally {
        mixer.stopAllAction();
        mixer.uncacheRoot(source.scene);
        for (const { node, p, q, s } of saved) {
            node.position.copy(p);
            node.quaternion.copy(q);
            node.scale.copy(s);
        }
        source.scene.updateMatrixWorld(true);
    }
}
/** Place the shaft through the measured curved finger chain instead of guessing a wrist offset. */
export function nativeToolGrip(fit, left, fingerPose) {
    const bones = fit.nativeSkeleton.bones, side = left ? 'Left' : 'Right';
    const named = (side, suffix) => bones.find(bone => bone.name === 'mixamorig' + side + 'Hand' + suffix);
    const suffixes = ['Thumb1', 'Thumb2', 'Thumb3', 'Middle1', 'Middle2', 'Middle3'];
    const saved = bones.map(bone => bone.quaternion.clone());
    fit.rootForModulesUpdate();
    const restWorld = new Map(bones.map(bone => [bone, bone.getWorldQuaternion(new Quaternion())]));
    const point = bone => bone.getWorldPosition(new Vector3());
    try {
        for (const suffix of suffixes) {
            const bone = named('Right', suffix);
            bone.quaternion.copy(fingerPose.get(bone.name));
        }
        fit.rootForModulesUpdate();
        if (left) {
            // The source Idle closes the right hand and leaves the left loose. Mirror its actual joint deltas.
            const deltas = suffixes.map(suffix => {
                const bone = named('Right', suffix);
                return bone.getWorldQuaternion(new Quaternion()).multiply(restWorld.get(bone).clone().invert());
            });
            bones.forEach((bone, index) => bone.quaternion.copy(saved[index]));
            fit.rootForModulesUpdate();
            for (const [index, suffix] of suffixes.entries()) {
                const bone = named('Left', suffix), delta = deltas[index];
                const reflected = new Quaternion(delta.x, -delta.y, -delta.z, delta.w);
                const target = reflected.multiply(restWorld.get(bone));
                const parent = bone.parent.getWorldQuaternion(new Quaternion());
                bone.quaternion.copy(parent.invert().multiply(target));
                fit.rootForModulesUpdate();
            }
        }
        const a = point(named(side, 'Middle1')), b = point(named(side, 'Middle2')), c = point(named(side, 'Middle3'));
        const ab = b.clone().sub(a), ac = c.clone().sub(a), cross = ab.clone().cross(ac);
        if (cross.lengthSq() < 1e-9)
            throw new Error('Native grasp has no measurable finger curvature');
        const centre = a.clone().add(cross.clone().cross(ab).multiplyScalar(ac.lengthSq())
            .add(ac.clone().cross(cross).multiplyScalar(ab.lengthSq())).divideScalar(2 * cross.lengthSq()));
        const axis = cross.normalize();
        if (axis.z < 0)
            axis.negate();
        const z = new Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
        const x = axis.clone().cross(z).normalize();
        const rotation = new Matrix4().makeBasis(x, axis, z);
        const wrist = named(side, ''), forearm = bones[left ? 10 : 23];
        const fingers = suffixes.map(suffix => { const bone = named(side, suffix); return { joint: bones.indexOf(bone), rotation: bone.quaternion.toArray() }; });
        const diagnostics = Object.fromEntries(['', 'Thumb1', 'Thumb2', 'Thumb3', 'Thumb4', 'Middle1', 'Middle2', 'Middle3', 'Middle4'].map(suffix => [suffix || 'wrist', point(named(side, suffix)).toArray()]));
        const curlAxis = new Vector3(-1, 0, 0).applyQuaternion(forearm.getWorldQuaternion(new Quaternion()).invert());
        forearm.rotateOnAxis(curlAxis, .65);
        return { centre, rotation, diagnostics, pose: { wristJoint: bones.indexOf(wrist),
                wristRotation: saved[bones.indexOf(wrist)].toArray(), forearmJoint: bones.indexOf(forearm),
                forearmRotation: forearm.quaternion.toArray(), forearmBlend: .8,
                upperArmJoint: left ? 9 : 22, upperArmRotation: saved[left ? 9 : 22].toArray(), upperArmBlend: .85,
                fingers, axis: axis.toArray(), fingerRadius: centre.distanceTo(b) } };
    }
    finally {
        bones.forEach((bone, index) => bone.quaternion.copy(saved[index]));
        fit.rootForModulesUpdate();
    }
}
