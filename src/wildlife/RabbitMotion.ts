import { Bone, Quaternion, Vector3, type Group } from 'three';
import type { Point2 } from '../world-generation/WorldBlueprint';
import type { RabbitHop } from './RabbitGait';

interface RestJoint {
    bone: Bone;
    rotation: Quaternion;
    position: Vector3;
}
interface Paw {
    upper: Bone;
    lower: Bone;
    end: Bone;
    toe: Bone;
    rest: Vector3;
    direction: Vector3;
    fore: boolean;
}
export interface RabbitRig {
    space: Group;
    joints: Map<string, RestJoint>;
    paws: Paw[];
}

/** These named chains belong to the supplied bunny.glb, retained in the asset manifest. */
export function rabbitRig(model: Group, space: Group): RabbitRig {
    const joints = new Map<string, RestJoint>();
    model.traverse(node => {
        if (!(node as Bone).isBone) return;
        const bone = node as Bone;
        joints.set(bone.name, { bone, rotation: bone.quaternion.clone(), position: bone.position.clone() });
    });
    const joint = (name: string) => {
        const value = joints.get('Bone_' + name);
        if (!value) throw new Error('Missing rabbit joint: Bone_' + name);
        return value.bone;
    };
    space.updateWorldMatrix(true, true);
    const chains: readonly (readonly [string, string, string, string, boolean])[] = [
        ['027', '026', '025', '024', true], ['032', '031', '030', '029', true],
        ['010', '009', '008', '007', false], ['015', '014', '013', '012', false],
    ];
    const paws = chains.map(([upper, lower, end, toe, fore]) => {
        const endBone = joint(end), toeBone = joint(toe);
        const rest = space.worldToLocal(endBone.getWorldPosition(new Vector3()));
        const direction = space.worldToLocal(toeBone.getWorldPosition(new Vector3())).sub(rest);
        return { upper: joint(upper), lower: joint(lower),
            end: endBone, toe: toeBone, rest, direction, fore };
    });
    return { space, joints, paws };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
function curve(keys: readonly (readonly [number, number])[], phase: number) {
    for (let i = 1; i < keys.length; i++) {
        if (phase > keys[i][0]) continue;
        const [a, value] = keys[i - 1], [b, next] = keys[i];
        return value + (next - value) * smooth((phase - a) / (b - a));
    }
    return keys[keys.length - 1][1];
}

/** Convert world rotations into the current parent frame, preserving every authored bone length. */
function rotateWorld(bone: Bone, turn: Quaternion) {
    const parent = bone.parent!.getWorldQuaternion(new Quaternion());
    const local = parent.clone().invert().multiply(turn).multiply(parent);
    bone.quaternion.premultiply(local);
    bone.updateWorldMatrix(false, true);
}

function pointAt(bone: Bone, child: Bone, direction: Vector3) {
    const current = child.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3()));
    if (current.lengthSq() < 1e-12 || direction.lengthSq() < 1e-12) return;
    rotateWorld(bone, new Quaternion().setFromUnitVectors(current.normalize(), direction.clone().normalize()));
}

function solvePaw(paw: Paw, target: Vector3, pole: Vector3, footDirection: Vector3) {
    const a = paw.upper.getWorldPosition(new Vector3());
    const b = paw.lower.getWorldPosition(new Vector3());
    const c = paw.end.getWorldPosition(new Vector3());
    const upperLength = a.distanceTo(b), lowerLength = b.distanceTo(c);
    const direction = target.clone().sub(a);
    const distance = Math.max(Math.abs(upperLength - lowerLength) + 1e-5,
        Math.min(upperLength + lowerLength - 1e-5, direction.length()));
    direction.normalize();
    const along = (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const bend = pole.clone().addScaledVector(direction, -pole.dot(direction));
    if (bend.lengthSq() < 1e-8) bend.set(0, 1, 0).addScaledVector(direction, -direction.y);
    if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0).addScaledVector(direction, -direction.x);
    bend.normalize();
    const middle = a.clone().addScaledVector(direction, along).addScaledVector(bend, height);
    pointAt(paw.upper, paw.lower, middle.sub(a));
    const lower = paw.lower.getWorldPosition(new Vector3());
    pointAt(paw.lower, paw.end, target.clone().sub(lower));
    pointAt(paw.end, paw.toe, footDirection);
}

function supportWeight(phase: number, fore: boolean) {
    const release = fore ? .12 : .28, releaseDuration = fore ? .14 : .12;
    const landing = fore ? .58 : .66, landingDuration = fore ? .12 : .18;
    return phase < .5 ? 1 - smooth((phase - release) / releaseDuration)
        : smooth((phase - landing) / landingDuration);
}

interface RabbitPoseFrame {
    time: number;
    phase: number;
    position: Point2;
    heading: number;
    hop?: RabbitHop;
    ground: (x: number, z: number) => number;
}

/** GIF-inspired gather, hind push, flight, fore landing and hind recovery, with planted support paws. */
export function poseRabbit(rig: RabbitRig, frame: RabbitPoseFrame) {
    const { space, joints } = rig;
    for (const rest of joints.values()) {
        rest.bone.quaternion.copy(rest.rotation);
        rest.bone.position.copy(rest.position);
    }
    space.updateWorldMatrix(true, true);
    const active = !!frame.hop?.active;
    const phase = active ? frame.hop!.phase : 0;
    const basis = space.getWorldQuaternion(new Quaternion());
    const turn = (name: string, axis: Vector3, angle: number) =>
        rotateWorld(joints.get('Bone_' + name)!.bone,
            new Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(basis), angle));
    const pitch = new Vector3(1, 0, 0), yaw = new Vector3(0, 1, 0);
    const body = joints.get('Bone_000')!.bone;
    const breathing = Math.sin(frame.time * 2 + frame.phase) * .0015;
    const compression = active ? curve([[0, 0], [.16, -.012], [.32, .003],
        [.5, .005], [.72, 0], [.82, -.014], [1, 0]], phase) : 0;
    const world = body.getWorldPosition(new Vector3());
    world.add(new Vector3(0, compression + breathing, 0).applyQuaternion(basis));
    body.position.copy(body.parent!.worldToLocal(world));
    body.updateWorldMatrix(false, true);
    const back = active ? curve([[0, .25], [.16, .4], [.32, .08],
        [.5, .35], [.68, .48], [.82, .35], [1, .25]], phase) : .25;
    turn('020', pitch, back * .65);
    turn('019', pitch, back * .35);
    turn('021', pitch, active ? curve([[0, .02], [.3, -.1], [.5, .07], [.72, -.04], [1, .02]], phase) : .02);
    turn('021', yaw, Math.sin(frame.time * .6 + frame.phase) * (active ? .015 : .06));
    const ear = active ? curve([[0, 0], [.3, -.12], [.5, -.22], [.75, .08], [1, 0]], phase) : 0;
    turn('037', pitch, ear + Math.max(0, Math.sin(frame.time * .7 + frame.phase)) ** 16 * .08);
    turn('040', pitch, ear + Math.max(0, Math.sin(frame.time * .65 + frame.phase + 2)) ** 16 * .08);

    for (const paw of rig.paws) {
        const flight = Math.sin(Math.PI * clamp((phase - (paw.fore ? .12 : .28)) / (paw.fore ? .58 : .56)));
        const local = paw.rest.clone();
        if (active) {
            local.y += flight * (paw.fore ? .045 : .04);
            local.z -= flight * .04;
        }
        const target = space.localToWorld(local);
        const contact = active ? supportWeight(phase, paw.fore) : 1;
        const anchor = active ? phase < .5 ? frame.hop!.from : frame.hop!.to : frame.position;
        const heading = active ? phase < .5 ? frame.hop!.startHeading
            : Math.atan2(frame.hop!.to.x - frame.hop!.from.x, frame.hop!.to.z - frame.hop!.from.z)
            : frame.heading;
        const ground = new Vector3(
            anchor.x + Math.cos(heading) * paw.rest.x + Math.sin(heading) * paw.rest.z,
            0,
            anchor.z - Math.sin(heading) * paw.rest.x + Math.cos(heading) * paw.rest.z,
        );
        ground.y = frame.ground(ground.x, ground.z) + paw.rest.y;
        target.lerp(ground, contact);
        const pole = new Vector3(0, 0, paw.fore ? -1 : 1).applyQuaternion(basis);
        solvePaw(paw, target, pole, paw.direction.clone().applyQuaternion(basis));
    }
}
