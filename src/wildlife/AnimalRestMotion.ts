import { Bone, Quaternion, Vector3, type Group } from 'three';

interface RestProfile {
    head: number;
    lookRate: number;
    breath: number;
    breathRate: number;
    tail: number;
}

const profiles = new Map<string, RestProfile>([
    ['brown-bear', { head: .12, lookRate: .45, breath: .008, breathRate: 1.5, tail: 0 }],
    ['wolf', { head: .18, lookRate: .65, breath: .012, breathRate: 1.8, tail: .035 }],
    ['red-fox', { head: .24, lookRate: .8, breath: .014, breathRate: 2.4, tail: .065 }],
    ['lynx', { head: .22, lookRate: .6, breath: .012, breathRate: 2, tail: .02 }],
    ['moose', { head: .06, lookRate: .4, breath: .006, breathRate: 1.4, tail: 0 }],
    ['reindeer', { head: .12, lookRate: .45, breath: .008, breathRate: 1.5, tail: .015 }],
    ['otter', { head: .18, lookRate: .65, breath: .018, breathRate: 2.1, tail: .035 }],
    ['seal', { head: .16, lookRate: .45, breath: .012, breathRate: 1.5, tail: 0 }],
]);

interface IdleJoint {
    bone: Bone;
    base: Quaternion;
}
export interface AnimalRestRig {
    space: Group;
    species: string;
    profile: RestProfile;
    joints: Map<string, IdleJoint>;
    applied: boolean;
}

/** Additive resting motion over authored neutral frames, separate from locomotion. */
export function animalRestRig(model: Group, space: Group, species: string): AnimalRestRig | undefined {
    const profile = profiles.get(species);
    if (!profile) return undefined;
    const joints = new Map<string, IdleJoint>();
    const names = profile.tail > 0 ? ['chest', 'head', 'tailstart', 'tail1', 'tail2'] : ['chest', 'head'];
    for (const name of names) {
        const rigName = species === 'moose' ? name === 'chest' ? 'Bone_005' : 'Bone_020' : name;
        const bone = model.getObjectByName(rigName) as Bone | undefined;
        if (!bone?.isBone) throw new Error('Missing ' + species + ' rest joint: ' + name);
        joints.set(name, { bone, base: new Quaternion() });
    }
    return { space, species, profile, joints, applied: false };
}

/** Remove our last overlay before the mixer evaluates, including repeated samples of the same time. */
export function clearAnimalRest(rig: AnimalRestRig) {
    if (!rig.applied) return;
    for (const joint of rig.joints.values()) joint.bone.quaternion.copy(joint.base);
    rig.applied = false;
}

export function poseAnimalRest(rig: AnimalRestRig, time: number, phase: number) {
    clearAnimalRest(rig);
    for (const joint of rig.joints.values()) joint.base.copy(joint.bone.quaternion);
    rig.space.updateWorldMatrix(true, true);
    const basis = rig.space.getWorldQuaternion(new Quaternion());
    const turn = (name: string, axis: Vector3, angle: number) => {
        const bone = rig.joints.get(name)!.bone;
        const localAxis = axis.clone().applyQuaternion(basis)
            .applyQuaternion(bone.parent!.getWorldQuaternion(new Quaternion()).invert());
        bone.quaternion.premultiply(new Quaternion().setFromAxisAngle(localAxis, angle));
        bone.updateWorldMatrix(false, true);
    };
    const pitch = new Vector3(1, 0, 0), yaw = new Vector3(0, 1, 0);
    const profile = rig.profile;
    const breath = Math.sin(time * profile.breathRate + phase);
    turn('chest', pitch, breath * profile.breath);
    turn('head', yaw, Math.sin(time * profile.lookRate + phase) * profile.head);
    turn('head', pitch, Math.sin(time * 1.1 + phase) * profile.head * .25);
    if (profile.tail > 0)
        for (const [index, name] of ['tailstart', 'tail1', 'tail2'].entries())
            turn(name, yaw, Math.sin(time * 1.2 + phase - index * .5) * profile.tail);
    rig.applied = true;
}
