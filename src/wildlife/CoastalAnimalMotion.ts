import { Bone, Quaternion, Vector3, type Group } from 'three';

interface JointPose {
    bone: Bone;
    rest: Quaternion;
    pitch: Vector3;
    yaw: Vector3;
    roll: Vector3;
}

export interface CoastalAnimalRig {
    species: 'otter' | 'puffin';
    joints: Map<string, JointPose>;
    activity: number;
}

/** Named joints belong to the supplied, hash-pinned coastal animal rigs. */
export function coastalAnimalRig(model: Group, species: string): CoastalAnimalRig | undefined {
    if (species !== 'otter' && species !== 'puffin') return undefined;
    const names = species === 'otter'
        ? ['004', '003', '021', '028', '027', '033', '032', '013', '012', '018', '017', '008', '007', '006']
        : ['006', '017', '016', '010', '009', '014', '013', '022', '027'];
    model.updateMatrixWorld(true);
    const joints = new Map<string, JointPose>();
    for (const name of names) {
        const bone = model.getObjectByName('Bone_' + name) as Bone | undefined;
        if (!bone?.isBone) throw new Error('Missing ' + species + ' motion joint: Bone_' + name);
        const parentInverse = bone.parent!.getWorldQuaternion(new Quaternion()).invert();
        joints.set(name, {
            bone,
            rest: bone.quaternion.clone(),
            pitch: new Vector3(1, 0, 0).applyQuaternion(parentInverse),
            yaw: new Vector3(0, 1, 0).applyQuaternion(parentInverse),
            roll: new Vector3(0, 0, 1).applyQuaternion(parentInverse),
        });
    }
    return { species, joints, activity: 0 };
}

interface MotionFrame {
    time: number;
    delta: number;
    phase: number;
    moving: boolean;
    water: boolean;
    speed: number;
}

const rotation = new Quaternion();

/** Restore bind-relative joints each frame, so looping motion never accumulates distortion. */
export function poseCoastalAnimal(rig: CoastalAnimalRig, frame: MotionFrame) {
    const { time, phase, moving, water, speed } = frame;
    rig.activity += ((moving ? 1 : 0) - rig.activity) * Math.min(1, frame.delta * 5);
    for (const joint of rig.joints.values()) joint.bone.quaternion.copy(joint.rest);
    const turn = (name: string, axis: 'pitch' | 'yaw' | 'roll', angle: number) => {
        const joint = rig.joints.get(name)!;
        joint.bone.quaternion.premultiply(rotation.setFromAxisAngle(joint[axis], angle));
    };
    const activity = rig.activity;

    if (rig.species === 'otter') {
        const cycle = time * (water ? 5 : 6 * Math.max(.5, speed)) + phase;
        const amplitude = activity * (water ? .65 : .5);
        // Diagonal pairs walk on shore; opposite fore/hind pairs paddle in water.
        const pairs = [['028', '027'], ['033', '032'], ['013', '012'], ['018', '017']];
        pairs.forEach(([upper, lower], index) => {
            const offset = water ? (index < 2 ? 0 : Math.PI)
                : (index === 0 || index === 3 ? 0 : Math.PI);
            const stride = Math.sin(cycle + offset);
            turn(upper, 'pitch', stride * amplitude);
            turn(lower, 'pitch', -Math.max(0, stride) * amplitude * .8);
        });
        const breath = Math.sin(time * 2.2 + phase);
        turn('004', 'pitch', breath * .025 + Math.sin(cycle) * activity * .055);
        turn('003', 'roll', Math.sin(cycle) * activity * (water ? .07 : .025));
        turn('021', 'yaw', Math.sin(time * .8 + phase) * .14);
        turn('021', 'pitch', breath * .035);
        for (const [index, name] of ['008', '007', '006'].entries()) {
            turn(name, 'yaw', Math.sin(cycle - index * .55)
                * ((water ? .22 : .10) * activity + .045));
        }
    } else {
        const cycle = time * (water ? 5 : 8) + phase;
        for (const [index, [upper, lower]] of [['010', '009'], ['014', '013']].entries()) {
            const stride = Math.sin(cycle + index * Math.PI) * activity;
            turn(upper, 'pitch', stride * (water ? .45 : .3));
            turn(lower, 'pitch', -Math.max(0, stride) * .25);
        }
        turn('006', 'roll', Math.sin(cycle) * activity * .045);
        turn('017', 'yaw', Math.sin(time * .75 + phase) * .22);
        turn('016', 'pitch', Math.sin(time * 1.1 + phase) * .07);
        // Keep the authored folded wings close to the body during paddling and breathing.
        const feather = Math.sin(time * 2 + phase) * .025;
        turn('022', 'roll', feather);
        turn('027', 'roll', -feather);
    }
}
