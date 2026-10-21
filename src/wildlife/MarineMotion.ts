import { Bone, Group, Quaternion, Vector3 } from 'three';

interface MarineJoint {
    bone: Bone;
    rest: Quaternion;
    pitch: Vector3;
}
export function whaleTailRig(model: Group): MarineJoint[] {
    model.updateMatrixWorld(true);
    return ['026', '024', '022', '020', '018'].map(id => {
        const bone = model.getObjectByName('Bone_' + id) as Bone;
        if (!bone?.isBone) throw new Error('Missing humpback tail joint: ' + id);
        return { bone, rest: bone.quaternion.clone(),
            pitch: new Vector3(1, 0, 0).applyQuaternion(bone.parent!.getWorldQuaternion(new Quaternion()).invert()) };
    });
}
const turn = new Quaternion();
export function poseWhaleTail(joints: ReturnType<typeof whaleTailRig>, time: number, arch: number) {
    joints.forEach((joint, index) => {
        joint.bone.quaternion.copy(joint.rest).premultiply(turn.setFromAxisAngle(joint.pitch,
            Math.sin(time * .7 - index * .45) * .012 + arch * .16));
    });
}

export interface OtterFloatRig {
    model: Group;
    space: Group;
    joints: { bone: Bone; base: Quaternion }[];
    applied: boolean;
}
export function otterFloatRig(model: Group, space: Group): OtterFloatRig {
    return { model, space, applied: false,
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
