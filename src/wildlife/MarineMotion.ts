import { Bone, Group, Quaternion, Vector3, type Mesh } from 'three';

interface MarineJoint {
    bone: Bone;
    rest: Quaternion;
    pitch: Vector3;
}
export function marineTailRig(model: Group, species: string): MarineJoint[] {
    model.updateMatrixWorld(true);
    const names = species === 'orca' ? ['015', '014', '013', '012', '011'] : ['026', '024', '022', '020', '018'];
    return names.map(id => {
        const bone = model.getObjectByName('Bone_' + id) as Bone;
        if (!bone?.isBone) throw new Error('Missing ' + species + ' tail joint: ' + id);
        return { bone, rest: bone.quaternion.clone(),
            pitch: new Vector3(1, 0, 0).applyQuaternion(bone.parent!.getWorldQuaternion(new Quaternion()).invert()) };
    });
}
const turn = new Quaternion();
export function poseMarineTail(joints: ReturnType<typeof marineTailRig>, time: number, arch: number,
    species: string) {
    joints.forEach((joint, index) => {
        joint.bone.quaternion.copy(joint.rest).premultiply(turn.setFromAxisAngle(joint.pitch,
            Math.sin(time * (species === 'orca' ? 1.3 : .7) - index * .45)
                * (species === 'orca' ? .028 : .012) + arch * .28));
    });
}

export interface OtterFloatRig {
    model: Group;
    space: Group;
    joints: { bone: Bone; base: Quaternion }[];
    tailTip: { mesh: Mesh; vertex: number };
    applied: boolean;
}
export function otterFloatRig(model: Group, space: Group): OtterFloatRig {
    model.updateWorldMatrix(true, true);
    let tailTip: OtterFloatRig['tailTip'] | undefined;
    let furthest = Infinity;
    model.traverse(node => {
        if (!('isMesh' in node) || !node.isMesh) return;
        const mesh = node as Mesh;
        const positions = mesh.geometry.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
            // Choose the anatomical tip from immutable mesh coordinates, not the current walk
            // pose. Otherwise re-equipping or sampling a different clip frame can pick a flank.
            const z = positions.getZ(vertex);
            if (z >= furthest) continue;
            furthest = z;
            tailTip = { mesh, vertex };
        }
    });
    if (!tailTip) throw new Error('Missing otter tail surface.');
    return { model, space, tailTip, applied: false,
        joints: ['chest', 'head', 'frontleg', 'R_frontleg'].map(name => {
            const bone = model.getObjectByName(name) as Bone;
            if (!bone?.isBone) throw new Error('Missing otter floating joint: ' + name);
            return { bone, base: new Quaternion() };
        }) };
}
export function clearOtterFloat(rig: OtterFloatRig) {
    if (!rig.applied) return;
    rig.joints.forEach(joint => joint.bone.quaternion.copy(joint.base));
    rig.applied = false;
}
/** Keep the muzzle above the surface and the paws resting over the belly after rolling. */
export function poseOtterFloat(rig: OtterFloatRig, amount: number, time: number) {
    clearOtterFloat(rig);
    rig.model.updateWorldMatrix(true, true);
    const heading = rig.space.getWorldQuaternion(new Quaternion());
    rig.joints.forEach((joint, index) => {
        joint.base.copy(joint.bone.quaternion);
        const angle = (index === 0 ? -.7 : index === 1 ? -.5 : index === 2 ? -.8 : .8)
            * amount + Math.sin(time * 1.3 + index) * .025 * amount;
        const axis = (index < 2 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1))
            .applyQuaternion(heading)
            .applyQuaternion(joint.bone.parent!.getWorldQuaternion(new Quaternion()).invert());
        joint.bone.quaternion.premultiply(turn.setFromAxisAngle(axis, angle));
        joint.bone.updateWorldMatrix(false, true);
    });
    rig.applied = true;
}

/** The real skinned tail tip, rather than the source bounds or a guessed body-height ratio. */
export function otterTailPoint(rig: OtterFloatRig, point: Vector3) {
    rig.space.updateWorldMatrix(true, false);
    // SkinnedMesh.updateMatrixWorld also refreshes the attached bind inverse. Calling only
    // Object3D.updateWorldMatrix leaves the prior root translation in the skin evaluation.
    rig.space.updateMatrixWorld(true);
    rig.tailTip.mesh.getVertexPosition(rig.tailTip.vertex, point);
    return rig.tailTip.mesh.localToWorld(point);
}
