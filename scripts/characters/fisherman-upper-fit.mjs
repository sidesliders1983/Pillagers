import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { loadTypeScript } from '../load-typescript.mjs';
import { createSurfaceQuery } from './outfit-surface-binding.mjs';
const smooth = (minimum, maximum, value) => {
    const t = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
    return t * t * (3 - 2 * t);
};
function strongestFour(mixture) {
    const kept = [...mixture].filter(([, weight]) => weight > 1e-8)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const total = kept.reduce((sum, [, weight]) => sum + weight, 0);
    assert.ok(total > 0);
    return {
        joints: Array.from({ length: 4 }, (_, i) => kept[i]?.[0] ?? 0),
        weights: Array.from({ length: 4 }, (_, i) => (kept[i]?.[1] ?? 0) / total),
    };
}
function refreshNormals(primitive) {
    const positions = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices().getArray();
    const values = new Float32Array(positions.getCount() * 3);
    for (let face = 0; face < indices.length; face += 3) {
        const corners = Array.from(indices.subarray(face, face + 3));
        const [a, b, c] = corners.map(vertex => new Vector3(...positions.getElement(vertex, [])));
        const normal = b.sub(a).cross(c.sub(a));
        for (const vertex of corners) {
            values[vertex * 3] += normal.x;
            values[vertex * 3 + 1] += normal.y;
            values[vertex * 3 + 2] += normal.z;
        }
    }
    const normals = primitive.getAttribute('NORMAL');
    for (let vertex = 0; vertex < positions.getCount(); vertex++) {
        const normal = new Vector3().fromArray(values, vertex * 3);
        if (normal.lengthSq() > 1e-14)
            normals.setElement(vertex, normal.normalize().toArray());
    }
}
/** Fit the collar and shoulder surface to the runtime body's actual four-weight skin. */
export async function createFishermanUpperFit(recipe) {
    globalThis.self ??= globalThis;
    globalThis.createImageBitmap ??= async () => ({ width: 2048, height: 2048, close() { } });
    await MeshoptDecoder.ready;
    const { MeshyHuman } = loadTypeScript(new URL('../../src/characters/MeshyHuman.ts', import.meta.url));
    const { defaultDNA } = loadTypeScript(new URL('../../src/characters/CharacterDNA.ts', import.meta.url));
    const { meshyHumanAssetIdentity } = loadTypeScript(new URL('../../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
    const bodyBytes = await readFile('public' + meshyHumanAssetIdentity[0].path);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength), '');
    const model = new MeshyHuman(gltf, { ...defaultDNA(), age: 32 }, 0);
    const fit = model.fit;
    assert.equal(fit.nativeSkeleton.bones.length, 44);
    const skinJoints = fit.sourceGeometry.getAttribute('skinIndex');
    const skinWeights = fit.sourceGeometry.getAttribute('skinWeight');
    const transforms = recipe.bones.map(bone => new Matrix4().fromArray(bone.authoringWorld)
        .multiply(new Matrix4().fromArray(bone.nativeWorld).invert()));
    const positions = [];
    for (let vertex = 0; vertex < skinJoints.count; vertex++) {
        const matrix = new Matrix4();
        matrix.elements.fill(0);
        for (let channel = 0; channel < 4; channel++) {
            const joint = skinJoints.getComponent(vertex, channel);
            const weight = skinWeights.getComponent(vertex, channel);
            transforms[joint].elements.forEach((value, element) => matrix.elements[element] += value * weight);
        }
        const point = new Vector3().fromArray(fit.source.positions, vertex * 3).applyMatrix4(matrix);
        positions.push(...point.toArray());
    }
    const indices = [];
    for (let face = 0; face < fit.source.indices.length; face += 3) {
        const corners = fit.source.indices.slice(face, face + 3);
        if (corners.every(vertex => positions[vertex * 3 + 1] > 1.12
            && positions[vertex * 3 + 1] < 1.47))
            indices.push(...corners);
    }
    const surface = { positions, indices, triangles: indices.length / 3 };
    const query = createSurfaceQuery(surface);
    const cache = new WeakMap();
    const report = { bodySha256: meshyHumanAssetIdentity[0].sha256,
        runtimeInfluences: 4, vertices: 0, maximumCorrectionMetres: 0,
        collarTargetClearanceMetres: .008, shoulderTargetClearanceMetres: .015,
        collarBlend: .80, shoulderBlend: .65, strategy: 'continuous-damped-surface-field' };
    return {
        report,
        contactAt(point) { return query.closest(point); },
        conform(primitive) {
            const positions = primitive.getAttribute('POSITION');
            const normals = primitive.getAttribute('NORMAL');
            const records = [];
            const excessive = [];
            for (let vertex = 0; vertex < positions.getCount(); vertex++) {
                const point = new Vector3(...positions.getElement(vertex, []));
                const amount = smooth(1.20, 1.30, point.y)
                    * (1 - smooth(.26, .34, Math.abs(point.x)));
                if (amount === 0)
                    continue;
                const contact = query.closest(point);
                const normal = new Vector3(...normals.getElement(vertex, []));
                const collar = point.y > 1.34 && Math.abs(point.x) < .14;
                // Apply a continuous field to both fabric surfaces. Hard projection collapsed
                // inner and outer shells onto almost the same triangles.
                const clearance = collar ? .008 : .015;
                const target = contact.point.clone().addScaledVector(contact.normal, clearance);
                const result = point.clone().lerp(target, amount * (collar ? .80 : .65));
                // Preserve a real inner clearance at the collar. Damping alone can leave
                // the innermost cloth shell inside the body's neck surface.
                if (collar) {
                    const finalContact = query.closest(result);
                    const signed = result.clone().sub(finalContact.point).dot(finalContact.normal);
                    if (signed < .006)
                        result.addScaledVector(finalContact.normal, .006 - signed);
                }
                const distance = result.distanceTo(point);
                if (distance >= .070)
                    excessive.push({ vertex, point: point.toArray(), target: target.toArray(), distance, amount });
                report.vertices++;
                report.maximumCorrectionMetres = Math.max(report.maximumCorrectionMetres, distance);
                positions.setElement(vertex, result.toArray());
                // Only the exposed collar needs the body's exact skin field. Extending
                // nearest-body weights into the armpit jumps between torso and arm.
                const skinAmount = amount * smooth(1.30, 1.34, point.y)
                    * (1 - smooth(.14, .18, Math.abs(point.x)));
                records[vertex] = { contact, amount: skinAmount };
            }
            excessive.sort((a, b) => b.distance - a.distance);
            assert.equal(excessive.length, 0, 'Upper-fit source exceeds the unchanged 7 cm bound: ' + JSON.stringify({ count: excessive.length, worst: excessive.slice(0, 3) }));
            cache.set(primitive, records);
            refreshNormals(primitive);
        },
        influences(primitive, vertex, fallback) {
            const record = cache.get(primitive)?.[vertex];
            if (!record)
                return fallback;
            const mixture = new Map();
            for (let channel = 0; channel < 4; channel++) {
                mixture.set(fallback.joints[channel], (mixture.get(fallback.joints[channel]) ?? 0)
                    + fallback.weights[channel] * (1 - record.amount));
            }
            for (let corner = 0; corner < 3; corner++) {
                const bodyVertex = indices[record.contact.anchor.triangle * 3 + corner];
                for (let channel = 0; channel < 4; channel++) {
                    const joint = skinJoints.getComponent(bodyVertex, channel);
                    const weight = skinWeights.getComponent(bodyVertex, channel)
                        * record.contact.anchor.barycentric[corner] * record.amount;
                    mixture.set(joint, (mixture.get(joint) ?? 0) + weight);
                }
            }
            return strongestFour(mixture);
        },
        dispose() { model.dispose(); },
    };
}
