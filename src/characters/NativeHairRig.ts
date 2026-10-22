import {Bone, Matrix4, Quaternion, Ray, Skeleton, SkinnedMesh, Triangle, Vector3} from 'three';
import type {NativeHairRigBinding} from './BodyFitAdapter';
import type {MeshyBodyFitAdapter} from './MeshyBodyFitAdapter';
import {meshyNativeRig} from './MeshyNativeRig';

interface GarmentContact {
    column: number;
    corners: number[];
    weights: Vector3;
    point: Vector3;
}

/** A module-owned chain reuses the native bones without modifying their skeleton. */
export class NativeHairRig {
    readonly skeleton: Skeleton;
    private bones: Bone[];
    private head: Bone;
    private back: Bone;
    private headBindInverse: Matrix4;
    private backBindInverse: Matrix4;
    private rest: Vector3[];
    private draped: Vector3[];
    private lengths: number[];
    private points: Vector3[];
    private headPose = new Matrix4();
    private backPose = new Matrix4();
    private backInverse = new Matrix4();
    private headRotation = new Quaternion();
    private parentRotation = new Quaternion();
    private rotation = new Quaternion();
    private direction = new Vector3();
    private originalDirection = new Vector3();
    private local = new Vector3();
    private target = new Vector3();
    private profile: [number, number][];
    private rotationMatrix = new Matrix4();
    private garmentVertices: {mesh: SkinnedMesh; vertex: number; point: Vector3}[] = [];
    private garmentSamples: GarmentContact[] = [];
    private garmentMeshes: SkinnedMesh[] = [];
    private garmentColumns: GarmentContact[][] = [];
    private envelope: number[] = [];

    constructor(private fit: MeshyBodyFitAdapter, readonly binding: NativeHairRigBinding) {
        this.head = fit.nativeSkeleton.bones[binding.headJoint];
        this.back = fit.nativeSkeleton.bones[binding.backJoint];
        this.profile = binding.rearProfile.map(row => [...row]);
        const headBind = new Matrix4().fromArray(meshyNativeRig[binding.headJoint].matrix);
        this.headBindInverse = headBind.clone().invert();
        this.backBindInverse = new Matrix4().fromArray(meshyNativeRig[binding.backJoint].matrix).invert();
        this.rest = binding.bones.map(bone => new Vector3(...bone.position));
        this.draped = this.rest.map(point => new Vector3(point.x, point.y,
            Math.min(point.z, this.rearAt(point.y))));
        this.points = this.draped.map(point => point.clone());
        this.lengths = this.draped.slice(1).map((point, i) => point.distanceTo(this.draped[i]));
        this.bones = binding.bones.map((definition, index) => {
            const bone = new Bone();
            bone.name = definition.name;
            const parentBind = index ? new Matrix4().makeTranslation(...binding.bones[index - 1].position) : headBind;
            const local = parentBind.clone().invert().multiply(new Matrix4().makeTranslation(...definition.position));
            local.decompose(bone.position, bone.quaternion, bone.scale);
            return bone;
        });
        this.head.add(this.bones[0]);
        for (let i = 1; i < this.bones.length; i++) this.bones[i - 1].add(this.bones[i]);
        const inverses = this.bones.map((_, i) => new Matrix4()
            .makeTranslation(...binding.bones[i].position).invert().multiply(fit.encoding));
        this.skeleton = new Skeleton([...fit.nativeSkeleton.bones, ...this.bones],
            [...fit.nativeSkeleton.boneInverses.map(matrix => matrix.clone()), ...inverses]);
    }

    private rearAt(y: number) {
        const profile = this.profile;
        if (y <= profile[0][0]) return profile[0][1];
        for (let i = 1; i < profile.length; i++) {
            const a = profile[i - 1], b = profile[i];
            if (y <= b[0]) return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
        }
        return profile[profile.length - 1][1];
    }

    private keepBehindBack(point: Vector3) {
        this.local.copy(point).applyMatrix4(this.backInverse);
        const profile = this.profile;
        if (Math.abs(this.local.x) > .3 || this.local.y < profile[0][0] - .1
            || this.local.y > profile[profile.length - 1][0]) return;
        const rear = this.rearAt(this.local.y);
        if (this.local.z > rear) {
            this.local.z = rear;
            point.copy(this.local).applyMatrix4(this.backPose);
        }
    }

    lastClearanceWork?: { possibleIntersections: number; testedIntersections: number; temporaryCandidateBytes: number };
    /** Rebuild only at equip/DNA refit, using the actual selected garment surface. */
    configureClearance(garments: SkinnedMesh[]) {
        this.back.updateWorldMatrix(true, false);
        const inverse = this.back.matrixWorld.clone().multiply(this.backBindInverse).invert();
        const heights = this.binding.rearProfile.map(row => row[0]);
        const minimumY = Math.min(...heights) - 1e-10, maximumY = Math.max(...heights) + 1e-10;
        // At most 256 KiB of candidate indices across this refit. An unusually
        // dense source falls back to the exhaustive query rather than growing a cache.
        let remainingCandidates = 65_536;
        const surfaces = garments.map(mesh => {
            mesh.updateWorldMatrix(true, false);
            const points = Array.from({length: mesh.geometry.attributes.position.count}, (_, vertex) =>
                mesh.localToWorld(mesh.getVertexPosition(vertex, new Vector3())).applyMatrix4(inverse));
            const indices = mesh.geometry.index?.array;
            const count = indices?.length ?? points.length;
            // Every ray is parallel to +Z at X=0/.04/.065 and a declared profile height.
            // Reject triangles outside that strip once; retain native query/order inside it.
            let selected: number[] | undefined = [];
            for (let i = 0; i < count; i += 3) {
                const a = points[indices?.[i] ?? i], b = points[indices?.[i + 1] ?? i + 1];
                const c = points[indices?.[i + 2] ?? i + 2];
                if (Math.min(a.x, b.x, c.x) > .065 + 1e-10 || Math.max(a.x, b.x, c.x) < -1e-10
                    || Math.min(a.y, b.y, c.y) > maximumY || Math.max(a.y, b.y, c.y) < minimumY) continue;
                if (selected.length === remainingCandidates) { selected = undefined; break; }
                selected.push(i);
            }
            const candidates = selected && Uint32Array.from(selected);
            remainingCandidates -= candidates?.length ?? 0;
            return {mesh, points, indices, candidates};
        });
        const ray = new Ray(new Vector3(), new Vector3(0, 0, 1)), hit = new Vector3();
        const work = this.lastClearanceWork = { possibleIntersections: 0, testedIntersections: 0,
            temporaryCandidateBytes: surfaces.reduce((sum, surface) => sum + (surface.candidates?.byteLength ?? 0), 0) };
        this.garmentVertices = [];
        this.garmentSamples = [];
        this.garmentMeshes = garments;
        const vertices = new Map<SkinnedMesh, Map<number, number>>();
        const remember = (mesh: SkinnedMesh, vertex: number) => {
            let cached = vertices.get(mesh);
            if (!cached) {cached = new Map(); vertices.set(mesh, cached);}
            let index = cached.get(vertex);
            if (index === undefined) {
                index = this.garmentVertices.length;
                this.garmentVertices.push({mesh, vertex, point: new Vector3()});
                cached.set(vertex, index);
            }
            return index;
        };
        for (const [y] of this.binding.rearProfile) {
            for (const [column, x] of [0, .04, .065].entries()) {
                let rear = Infinity;
                let sample: {mesh: SkinnedMesh; vertices: number[]; weights: Vector3} | undefined;
                ray.origin.set(x, y, -2);
                for (const surface of surfaces) {
                    const indices = surface.indices;
                    const count = indices?.length ?? surface.points.length;
                    work.possibleIntersections += count / 3;
                    const candidates = surface.candidates;
                    const selectedCount = candidates?.length ?? count / 3;
                    work.testedIntersections += selectedCount;
                    for (let cursor = 0; cursor < selectedCount; cursor++) {
                        const i = candidates?.[cursor] ?? cursor * 3;
                        const a = surface.points[indices?.[i] ?? i];
                        const b = surface.points[indices?.[i + 1] ?? i + 1];
                        const c = surface.points[indices?.[i + 2] ?? i + 2];
                        if (ray.intersectTriangle(a, b, c, false, hit) && hit.z < rear) {
                            rear = hit.z;
                            sample = {mesh: surface.mesh, vertices: [0, 1, 2].map(k => indices?.[i + k] ?? i + k),
                                weights: new Triangle(a, b, c).getBarycoord(hit, new Vector3())!};
                        }
                    }
                }
                if (sample) this.garmentSamples.push({column,
                    corners: sample.vertices.map(vertex => remember(sample.mesh, vertex)),
                    weights: sample.weights, point: new Vector3()});
            }
        }
        this.garmentColumns = [0, 1, 2].map(column => this.garmentSamples.filter(sample => sample.column === column));
    }

    private updateClearance() {
        for (const mesh of this.garmentMeshes) mesh.updateWorldMatrix(true, false);
        for (const value of this.garmentVertices) {
            value.mesh.getVertexPosition(value.vertex, value.point);
            value.point.applyMatrix4(value.mesh.matrixWorld).applyMatrix4(this.backInverse);
        }
        for (const sample of this.garmentSamples) {
            sample.point.set(0, 0, 0);
            for (let k = 0; k < 3; k++) sample.point.addScaledVector(
                this.garmentVertices[sample.corners[k]].point, sample.weights.getComponent(k));
        }
        const columns = this.garmentColumns;
        for (const samples of columns) samples.sort((a, b) => a.point.y - b.point.y);
        const envelope = this.envelope;
        envelope.length = 0;
        for (let index = 0; index < this.profile.length; index++) {
            const y = this.profile[index][0];
            let rear = this.binding.rearProfile[index][1];
            for (const samples of columns) {
                for (let i = 1; i < samples.length; i++) {
                    const a = samples[i - 1].point, b = samples[i].point;
                    if (y < a.y || y > b.y || b.y - a.y < .00001) continue;
                    const z = a.z + (b.z - a.z) * (y - a.y) / (b.y - a.y);
                    rear = Math.min(rear, z - this.binding.radius - .008);
                }
            }
            envelope.push(rear);
        }
        for (let i = 0; i < this.profile.length; i++) {
            let rear = envelope[i];
            if (this.garmentSamples.length) {
                // A braid cross-section also spans height. Inflate the sampled clothing
                // envelope vertically as well as horizontally by the declared radius.
                for (let j = 0; j < this.profile.length; j++) {
                    if (Math.abs(this.profile[j][0] - this.profile[i][0]) <= this.binding.radius) {
                        rear = Math.min(rear, envelope[j]);
                    }
                }
            }
            this.profile[i][1] = rear;
        }
        for (let i = 0; i < this.draped.length; i++) {
            this.draped[i].copy(this.rest[i]);
            this.draped[i].z = Math.min(this.rest[i].z, this.rearAt(this.rest[i].y));
            if (i) this.lengths[i - 1] = this.draped[i].distanceTo(this.draped[i - 1]);
        }
    }

    /** Deterministic pose constraints: sampling a clip does not depend on frame history. */
    pose() {
        this.fit.nativeSkeleton.bones[0].updateWorldMatrix(true, true);
        this.headPose.copy(this.head.matrixWorld).multiply(this.headBindInverse);
        this.backPose.copy(this.back.matrixWorld).multiply(this.backBindInverse);
        this.backInverse.copy(this.backPose).invert();
        this.updateClearance();
        this.headRotation.setFromRotationMatrix(this.rotationMatrix.extractRotation(this.headPose));
        const scale = Math.cbrt(Math.abs(this.headPose.determinant()));
        for (let i = 0; i < this.points.length; i++) {
            const point = this.points[i];
            point.copy(this.draped[i]).applyMatrix4(this.headPose);
            this.target.copy(this.draped[i]).applyMatrix4(this.backPose);
            point.lerp(this.target, i / (this.points.length - 1) * .85);
            this.keepBehindBack(point);
        }
        for (let pass = 0; pass < 4; pass++) {
            for (let i = 1; i < this.points.length; i++) {
                this.direction.copy(this.points[i]).sub(this.points[i - 1]).normalize();
                this.points[i].copy(this.points[i - 1]).addScaledVector(this.direction, this.lengths[i - 1] * scale);
                this.keepBehindBack(this.points[i]);
            }
        }
        for (let i = 0; i < this.bones.length; i++) {
            const next = i < this.bones.length - 1 ? i + 1 : i;
            const previous = i < this.bones.length - 1 ? i : i - 1;
            this.originalDirection.copy(this.rest[next]).sub(this.rest[previous])
                .normalize().applyQuaternion(this.headRotation);
            this.direction.copy(this.points[next]).sub(this.points[previous]).normalize();
            this.rotation.setFromUnitVectors(this.originalDirection, this.direction).multiply(this.headRotation);
            const bone = this.bones[i], parent = bone.parent!;
            bone.position.copy(this.points[i]);
            parent.worldToLocal(bone.position);
            bone.quaternion.copy(parent.getWorldQuaternion(this.parentRotation).invert()).multiply(this.rotation);
            bone.updateMatrixWorld(true);
        }
        this.skeleton.update();
    }

    inspect() {
        return {strategy: 'native-head-and-back-chain', nativeBones: this.fit.nativeSkeleton.bones.length,
            bones: this.bones.map((bone, i) => ({name: bone.name, position: this.points[i].toArray()})),
            fixedColor: this.binding.fixedColor.color, garmentContactSamples: this.garmentSamples.length};
    }

    dispose() {
        this.bones[0].removeFromParent();
        this.skeleton.dispose();
    }
}
