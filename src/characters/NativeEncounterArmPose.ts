import { Bone, Box3, Group, Matrix4, Mesh, Quaternion, SkinnedMesh, Vector3 } from 'three';

interface WeightedInterval { min: number[]; max: number[]; }
interface SkinEnvelope {
    mesh: SkinnedMesh;
    dominant: number;
    dominantBind: Matrix4;
    influences: Map<number, WeightedInterval>;
    residual: WeightedInterval;
    upperArm: boolean;
    bounds: Box3;
}

const interval = (): WeightedInterval => ({min: [0, 0, 0, 0], max: [0, 0, 0, 0]});
function includeWeightedPoint(bounds: WeightedInterval, point: Vector3, weight: number) {
    for (const [axis, value] of [point.x, point.y, point.z, 1].entries()) {
        const coordinate = value * weight;
        bounds.min[axis] = Math.min(bounds.min[axis], coordinate);
        bounds.max[axis] = Math.max(bounds.max[axis], coordinate);
    }
}

/** Dominant-bone boxes plus weighted influence intervals conservatively bound the fitted skin. */
export class NativeEncounterBodyEnvelope {
    private envelopes: SkinEnvelope[] = [];

    constructor(meshes: readonly SkinnedMesh[], encoding: Matrix4) {
        const skeleton = meshes[0].skeleton;
        const bindPoint = (suffix: string) => {
            const joint = skeleton.bones.findIndex(bone => bone.name.endsWith(suffix));
            return new Vector3().setFromMatrixPosition(encoding.clone()
                .multiply(skeleton.boneInverses[joint].clone().invert()));
        };
        const leftShoulder = bindPoint('LeftArm'), rightShoulder = bindPoint('RightArm');
        const armBottom = Math.min(bindPoint('LeftForeArm').y, bindPoint('RightForeArm').y);
        const shoulderWidth = leftShoulder.x - rightShoulder.x;
        const hipHeight = bindPoint('Hips').y;
        for (const mesh of meshes) {
            const indices = mesh.geometry.getAttribute('skinIndex');
            const weights = mesh.geometry.getAttribute('skinWeight');
            if (!indices || !weights) continue;
            const used = new Set(mesh.geometry.index?.array ??
                Array.from({length: indices.count}, (_, vertex) => vertex));
            const boxes = new Map<string, SkinEnvelope>();
            for (const vertex of used) {
                let dominantSlot = 0;
                for (let influence = 1; influence < 4; influence++) {
                    if (weights.getComponent(vertex, influence) > weights.getComponent(vertex, dominantSlot))
                        dominantSlot = influence;
                }
                const dominant = indices.getComponent(vertex, dominantSlot);
                const name = mesh.skeleton.bones[dominant]?.name ?? '';
                // Upper-body props do not need a mount widened by unrelated feet or leg stances.
                if (/ForeArm|Hand|Leg|Foot|Toe/.test(name)) continue;
                const basePosition = Mesh.prototype.getVertexPosition.call(mesh, vertex, new Vector3());
                const native = basePosition.clone().applyMatrix4(encoding);
                // Tunic sleeve seams can be weighted mainly to Spine; retain their geometric arm region.
                const sleeve = native.y >= armBottom - shoulderWidth / 4 &&
                    native.y <= Math.max(leftShoulder.y, rightShoulder.y) + shoulderWidth / 4 &&
                    (native.x < rightShoulder.x || native.x > leftShoulder.x);
                const upperArm = /Arm|Shoulder/.test(name) || sleeve;
                const activeJoints = Array.from({length: 4}, (_, influence) => influence)
                    .filter(influence => weights.getComponent(vertex, influence) > 0)
                    .map(influence => indices.getComponent(vertex, influence)).sort((a, b) => a - b);
                const region = [native.x >= 0, native.y >= hipHeight, native.z >= 0].join(':');
                const key = dominant + ':' + upperArm + ':' + region + ':' + activeJoints.join(',');
                let envelope = boxes.get(key);
                if (!envelope) {
                    envelope = {mesh, dominant, dominantBind: mesh.skeleton.boneInverses[dominant].clone().invert(),
                        upperArm, bounds: new Box3(),
                        influences: new Map(), residual: interval()};
                    boxes.set(key, envelope);
                }
                const base = basePosition.applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[dominant]);
                envelope.bounds.expandByPoint(base);
                let total = 0;
                for (let influence = 0; influence < 4; influence++) {
                    const weight = weights.getComponent(vertex, influence);
                    const joint = indices.getComponent(vertex, influence);
                    total += weight;
                    if (joint === dominant || weight <= 0) continue;
                    let contribution = envelope.influences.get(joint);
                    if (!contribution) {
                        contribution = {min: [Infinity, Infinity, Infinity, Infinity],
                            max: [-Infinity, -Infinity, -Infinity, -Infinity]};
                        envelope.influences.set(joint, contribution);
                    }
                    includeWeightedPoint(contribution, base, weight);
                }
                includeWeightedPoint(envelope.residual, base, total - 1);
            }
            this.envelopes.push(...boxes.values());
        }
    }

    bounds(frame: Group, includeUpperArms = true): Box3 {
        const bounds = new Box3();
        this.forEachPosedEnvelope(frame, includeUpperArms, posed => bounds.union(posed));
        return bounds;
    }

    support(frame: Group, direction: Vector3, includeUpperArms = true): number {
        let maximum = -Infinity;
        this.forEachPosedEnvelope(frame, includeUpperArms, posed => {
            const point = new Vector3(direction.x >= 0 ? posed.max.x : posed.min.x,
                direction.y >= 0 ? posed.max.y : posed.min.y,
                direction.z >= 0 ? posed.max.z : posed.min.z);
            maximum = Math.max(maximum, point.dot(direction));
        });
        return maximum;
    }

    private forEachPosedEnvelope(frame: Group, includeUpperArms: boolean, visit: (bounds: Box3) => void) {
        const inverse = frame.matrixWorld.clone().invert();
        const boneMatrices = new Map<SkinnedMesh, Map<number, Matrix4>>();
        for (const envelope of this.envelopes) {
            if (!includeUpperArms && envelope.upperArm) continue;
            const outer = inverse.clone().multiply(envelope.mesh.matrixWorld)
                .multiply(envelope.mesh.bindMatrixInverse);
            let bones = boneMatrices.get(envelope.mesh);
            if (!bones) { bones = new Map(); boneMatrices.set(envelope.mesh, bones); }
            const boneMatrix = (joint: number) => {
                let matrix = bones!.get(joint);
                if (!matrix) {
                    matrix = outer.clone().multiply(envelope.mesh.skeleton.bones[joint].matrixWorld);
                    bones!.set(joint, matrix);
                }
                return matrix;
            };
            const dominant = boneMatrix(envelope.dominant);
            const posed = new Box3();
            const {min, max} = envelope.bounds;
            for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z])
                posed.expandByPoint(new Vector3(x, y, z).applyMatrix4(dominant));
            const addError = (matrix: Matrix4, contribution: WeightedInterval) => {
                for (let row = 0; row < 3; row++) {
                    let low = 0, high = 0;
                    for (let column = 0; column < 4; column++) {
                        const value = matrix.elements[column * 4 + row];
                        low += value * (value >= 0 ? contribution.min[column] : contribution.max[column]);
                        high += value * (value >= 0 ? contribution.max[column] : contribution.min[column]);
                    }
                    posed.min.setComponent(row, posed.min.getComponent(row) + low);
                    posed.max.setComponent(row, posed.max.getComponent(row) + high);
                }
            };
            for (const [joint, contribution] of envelope.influences) {
                const delta = boneMatrix(joint).clone().multiply(envelope.mesh.skeleton.boneInverses[joint])
                    .multiply(envelope.dominantBind);
                for (let element = 0; element < 16; element++)
                    delta.elements[element] -= dominant.elements[element];
                addError(delta, contribution);
            }
            // Quantized skin weights need not sum to exactly one; retain their actual residual.
            const residual = dominant.clone();
            for (let row = 0; row < 3; row++) residual.elements[12 + row] -= outer.elements[12 + row];
            addError(residual, envelope.residual);
            visit(posed);
        }
    }
}

export function rotateNativeBoneWorld(bone: Bone, rotation: Quaternion, update: () => void) {
    const parent = bone.parent!.getWorldQuaternion(new Quaternion());
    bone.quaternion.premultiply(parent.clone().invert().multiply(rotation).multiply(parent));
    update();
}

/** Solve only existing shoulder/elbow joints; the hand retains its prepared prop grip. */
export function placeNativeArm(
    upper: Bone, forearm: Bone, wrist: Bone, target: Vector3, pole: Vector3, update: () => void,
) {
    const shoulder = upper.getWorldPosition(new Vector3());
    const elbow = forearm.getWorldPosition(new Vector3());
    const hand = wrist.getWorldPosition(new Vector3());
    const upperLength = shoulder.distanceTo(elbow), lowerLength = elbow.distanceTo(hand);
    const direction = target.clone().sub(shoulder);
    const distance = Math.max(Math.abs(upperLength - lowerLength) + 1e-6,
        Math.min(direction.length(), upperLength + lowerLength - 1e-6));
    direction.normalize();
    const destination = shoulder.clone().addScaledVector(direction, distance);
    const bend = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize();
    const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    const elbowTarget = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, height);
    rotateNativeBoneWorld(upper, new Quaternion().setFromUnitVectors(elbow.clone().sub(shoulder).normalize(),
        elbowTarget.clone().sub(shoulder).normalize()), update);
    const currentElbow = forearm.getWorldPosition(new Vector3());
    rotateNativeBoneWorld(forearm, new Quaternion().setFromUnitVectors(
        wrist.getWorldPosition(new Vector3()).sub(currentElbow).normalize(),
        destination.sub(currentElbow).normalize()), update);
}

/** A rigid hand prop's baked native metre coordinates share this exact public skin transform. */
export function nativePropFrame(mesh: SkinnedMesh, joint: number, encoding: Matrix4, frame: Group) {
    return frame.matrixWorld.clone().invert().multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse)
        .multiply(mesh.skeleton.bones[joint].matrixWorld).multiply(mesh.skeleton.boneInverses[joint])
        .multiply(mesh.bindMatrix).multiply(encoding.clone().invert());
}
