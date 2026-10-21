import { BufferGeometry, Float32BufferAttribute, Matrix3, SkinnedMesh, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { facialAxes, type FacialAxis, type FacialShapeV1 } from './FacialIdentity';
import type { MeshyBodyFitAdapter } from './MeshyBodyFitAdapter';

export const facialPresentationAxes = ['feminine', 'juvenile'] as const;
export type FacialPresentationAxis = typeof facialPresentationAxes[number];
export const nativeFacialAxes = [...facialAxes, ...facialPresentationAxes] as const;
export type FacialPresentation = Record<FacialPresentationAxis, number>;

const prepared = new WeakMap<BufferGeometry, BufferGeometry>();
const smooth = (low: number, high: number, value: number) => {
    const amount = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return amount * amount * (3 - 2 * amount);
};
const bell = (value: number, center: number, radius: number) =>
    Math.exp(-(((value - center) / radius) ** 2));

/** Bounded offsets in the audited native metre bind frame. The neck blend reaches
 * exactly zero at 1.44 m; no gameplay/personality parameter enters this field. */
export function nativeFacialOffset(point: Vector3, axis: FacialAxis | FacialPresentationAxis,
    target = new Vector3()) {
    const { x, y, z } = point;
    const head = smooth(1.44, 1.465, y) * (1 - smooth(.14, .18, Math.abs(x)));
    const front = smooth(.025, .075, z);
    target.set(0, 0, 0);
    if (axis === 'faceWidth') target.x = x * .10;
    if (axis === 'faceLength') target.y = (y - 1.44) * .07;
    // The coarse LODs have a long, thin triangle across the lower jaw/neck.
    // Fade jaw breadth toward the back of that seam rather than shearing it.
    if (axis === 'jawWidth') target.x = x * .18 * bell(y, 1.465, .025) * smooth(.02, .075, z);
    if (axis === 'chinProjection') target.z = .006 * bell(y, 1.454, .017) * bell(x, 0, .045) * front;
    if (axis === 'noseWidth') target.x = x * .20 * bell(x, 0, .027) * bell(y, 1.505, .020) * front;
    if (axis === 'noseProjection') target.z = .007 * bell(x, 0, .019) * bell(y, 1.505, .018) * front;
    if (axis === 'eyeSpacing') {
        target.x = Math.sign(x) * .0035 * bell(Math.abs(x), .037, .02)
            * bell(y, 1.542, .014) * front;
    }
    // These source-specific art correctives sit above the unchanged neck seam.
    // Neither belongs to the inherited identity or gameplay DNA.
    if (axis === 'feminine') {
        target.x = -x * .11 * bell(y, 1.465, .034) * front;
        target.z = -.004 * bell(y, 1.550, .014) * front
            - .001 * bell(y, 1.490, .025) * front;
    }
    if (axis === 'juvenile') {
        target.x = -x * .16 * bell(y, 1.466, .037) * front
            + x * .035 * bell(y, 1.570, .04);
        target.y = .004 * bell(y, 1.455, .026) * front;
        target.z = -.0015 * bell(y, 1.505, .023) * front
            - .002 * bell(y, 1.550, .014) * front;
    }
    return target.multiplyScalar(head);
}

function prepareGeometry(mesh: SkinnedMesh): BufferGeometry {
    const original = mesh.geometry;
    const cached = prepared.get(original);
    if (cached) return cached;
    if (Object.keys(original.morphAttributes).length)
        throw new Error('The facial proof requires the audited native body without authored morphs.');
    mesh.updateWorldMatrix(true, false);
    mesh.skeleton.update();
    const encoding = mesh.skeleton.bones[0].matrixWorld.clone()
        .multiply(mesh.skeleton.boneInverses[0]);
    const inverse = new Matrix3().setFromMatrix4(encoding.clone().invert());
    const positions = original.getAttribute('position');
    const geometry = new BufferGeometry();
    geometry.name = original.name + ':facial-identity-v1';
    // Baseline positions, UVs, joints, weights and index remain shared with the source.
    for (const [name, attribute] of Object.entries(original.attributes)) {
        geometry.setAttribute(name, attribute);
    }
    geometry.setIndex(original.index);
    geometry.groups = original.groups.map(group => ({ ...group }));
    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = [];
    geometry.morphAttributes.normal = [];
    const baseline = new Float32Array(positions.count * 3);
    const sourcePoints: Vector3[] = [];
    for (let index = 0; index < positions.count; index++) {
        baseline.set([positions.getX(index), positions.getY(index), positions.getZ(index)], index * 3);
        sourcePoints.push(mesh.getVertexPosition(index, new Vector3()));
    }
    const normalGeometry = new BufferGeometry();
    normalGeometry.setIndex(original.index);
    normalGeometry.setAttribute('position', new Float32BufferAttribute(baseline, 3));
    normalGeometry.computeVertexNormals();
    const baseNormals = normalGeometry.getAttribute('normal').clone();
    for (const axis of nativeFacialAxes) {
        const deltas = new Float32Array(baseline.length);
        const deformed = baseline.slice();
        for (let index = 0; index < positions.count; index++) {
            const delta = nativeFacialOffset(sourcePoints[index], axis).applyMatrix3(inverse);
            deltas.set(delta.toArray(), index * 3);
            for (let component = 0; component < 3; component++) {
                deformed[index * 3 + component] += deltas[index * 3 + component];
            }
        }
        const position = new Float32BufferAttribute(deltas, 3);
        position.name = axis;
        geometry.morphAttributes.position.push(position);
        normalGeometry.setAttribute('position', new Float32BufferAttribute(deformed, 3));
        normalGeometry.computeVertexNormals();
        const changed = normalGeometry.getAttribute('normal');
        const normals = new Float32Array(deltas.length);
        for (let index = 0; index < changed.count; index++) {
            for (let component = 0; component < 3; component++) {
                normals[index * 3 + component] = changed.getComponent(index, component)
                    - baseNormals.getComponent(index, component);
            }
        }
        geometry.morphAttributes.normal.push(new Float32BufferAttribute(normals, 3));
    }
    // This temporary CPU helper never owns the source's shared index buffer.
    normalGeometry.setIndex(null);
    normalGeometry.dispose();
    geometry.computeBoundingBox();
    geometry.boundingBox!.expandByScalar(.04);
    geometry.computeBoundingSphere();
    geometry.boundingSphere!.radius += .04;
    prepared.set(original, geometry);
    return geometry;
}

/** One lazily prepared geometry per original LOD, never a unique body per resident. */
export function nativeFacialSource(source: GLTF): GLTF {
    const scene = clone(source.scene) as GLTF['scene'];
    let skins = 0;
    scene.traverse(node => {
        if (!(node as SkinnedMesh).isSkinnedMesh) return;
        const mesh = node as SkinnedMesh;
        skins++;
        mesh.geometry = prepareGeometry(mesh);
        mesh.updateMorphTargets();
    });
    if (skins !== 1) throw new Error('Facial identity requires the audited single native body skin.');
    return { ...source, scene };
}

/** Existing module fitting owns these buffers. Apply the same bind-space field
 * once per real refit; source assets, native joints and per-frame animation stay intact. */
export function fitNativeFacialModule(mesh: SkinnedMesh, fit: MeshyBodyFitAdapter, face: FacialShapeV1) {
    const positions = mesh.geometry.getAttribute('position');
    const inverse = fit.encoding.clone().invert();
    const point = new Vector3(), delta = new Vector3(), offset = new Vector3();
    let changedVertices = 0, maximumMeters = 0;
    for (let vertex = 0; vertex < positions.count; vertex++) {
        point.fromBufferAttribute(positions, vertex).applyMatrix4(fit.encoding);
        delta.set(0, 0, 0);
        for (const axis of facialAxes)
            delta.addScaledVector(nativeFacialOffset(point, axis, offset), face.axes[axis]);
        for (const axis of facialPresentationAxes)
            delta.addScaledVector(nativeFacialOffset(point, axis, offset), fit.facialPresentation?.[axis] ?? 0);
        const distance = delta.length();
        if (distance < 1e-9) continue;
        maximumMeters = Math.max(maximumMeters, distance);
        point.add(delta).applyMatrix4(inverse);
        positions.setXYZ(vertex, point.x, point.y, point.z);
        changedVertices++;
    }
    if (changedVertices) {
        positions.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
    }
    mesh.userData.facialCorrective = { version: face.version, changedVertices, maximumMeters };
}
