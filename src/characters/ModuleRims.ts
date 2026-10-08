import {BufferAttribute, BufferGeometry, Vector3} from 'three';
import type {Matrix4} from 'three';
import type {ModuleBindingV2, SurfaceAnchor} from './BodyFitAdapter';
import type {MeshyBodyFitAdapter} from './MeshyBodyFitAdapter';
import {anchorPoint} from './MeshyBodyFitAdapter';
import {bodyOpeningLoops, openingArcCorners} from './OpeningSections';

/** Include every body-LOD opening corner in the owned clothing boundary. */
export function sewModuleOpenings(
    source: BufferGeometry, binding: ModuleBindingV2, fit: MeshyBodyFitAdapter,
) {
    if (!binding.coverageRimContacts?.length) return source;
    const contacts = new Set(binding.coverageRimContacts);
    const surface = fit.source;
    const sections = (binding.coverageClipPlanes ?? []).map(plane => ({
        normal: new Vector3(...plane.normal), constant: plane.constant,
        loops: bodyOpeningLoops(surface, plane),
    }));
    const count = source.getAttribute('position').count;
    const attributes = Object.entries(source.attributes);
    const arrays = new Map(attributes.map(([name, attribute]) => [name,
        Array.from({length: count * attribute.itemSize}, (_, i) =>
            attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize)),
    ]));
    const positions = source.getAttribute('position');
    const world = (vertex: number) =>
        new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(fit.encoding);
    const inverse = fit.encoding.clone().invert();
    const indices: number[] = [];
    const base = source.index ? Array.from(source.index.array)
        : Array.from({length: count}, (_, vertex) => vertex);
    let appended = 0;
    const add = (a: number, b: number, fraction: number, anchor: SurfaceAnchor) => {
        const vertex = count + appended++;
        for (const [name, attribute] of attributes) {
            const list = arrays.get(name)!;
            for (let k = 0; k < attribute.itemSize; k++) {
                list.push(list[a * attribute.itemSize + k] * (1 - fraction)
                    + list[b * attribute.itemSize + k] * fraction);
            }
        }
        const point = anchorPoint(surface, anchor).applyMatrix4(inverse);
        arrays.get('position')!.splice(vertex * 3, 3, ...point.toArray());
        const values = new Map<number, number>();
        const bodyIndices = fit.sourceGeometry.getAttribute('skinIndex');
        const bodyWeights = fit.sourceGeometry.getAttribute('skinWeight');
        for (let k = 0; k < 3; k++) {
            const bodyVertex = surface.indices[anchor.triangle * 3 + k];
            for (let j = 0; j < 4; j++) {
                const joint = bodyIndices.getComponent(bodyVertex, j);
                const weight = bodyWeights.getComponent(bodyVertex, j) * anchor.barycentric[k];
                values.set(joint, (values.get(joint) ?? 0) + weight);
            }
        }
        const top = [...values].filter(([, weight]) => weight > 0)
            .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
        const total = top.reduce((sum, [, weight]) => sum + weight, 0);
        for (let k = 0; k < 4; k++) {
            arrays.get('skinIndex')![vertex * 4 + k] = top[k]?.[0] ?? 0;
            arrays.get('skinWeight')![vertex * 4 + k] = (top[k]?.[1] ?? 0) / total;
        }
        return vertex;
    };
    for (let triangle = 0; triangle < base.length; triangle += 3) {
        const face = base.slice(triangle, triangle + 3);
        let sewn = false;
        for (let k = 0; k < 3; k++) {
            const a = face[k];
            const b = face[(k + 1) % 3];
            const opposite = face[(k + 2) % 3];
            if (!contacts.has(a) || !contacts.has(b)) continue;
            const A = world(a);
            const B = world(b);
            const section = sections.find(value => Math.abs(A.dot(value.normal) + value.constant) < 1e-6
                && Math.abs(B.dot(value.normal) + value.constant) < 1e-6);
            if (!section) continue;
            const interior = openingArcCorners(section.loops, A, B);
            if (!interior.length) continue;
            let previous = a;
            for (const point of interior) {
                const vertex = add(a, b, point.t, point.anchor);
                indices.push(previous, vertex, opposite);
                previous = vertex;
            }
            indices.push(previous, b, opposite);
            sewn = true;
            break;
        }
        if (!sewn) indices.push(...face);
    }
    source.userData.sharedOpeningVertices = [...binding.coverageRimContacts];
    if (!appended) return source;
    const geometry = new BufferGeometry();
    for (const [name, attribute] of attributes) {
        const values = arrays.get(name)!;
        const typed = name === 'skinIndex' ? new Uint16Array(values) : new Float32Array(values);
        geometry.setAttribute(name, new BufferAttribute(typed, attribute.itemSize));
    }
    geometry.setIndex(indices);
    geometry.userData.sharedOpeningCorners = appended;
    geometry.userData.sharedOpeningVertices = [
        ...binding.coverageRimContacts, ...Array.from({length: appended}, (_, i) => count + i),
    ];
    geometry.computeBoundingSphere();
    return geometry;
}

/** Give joined corners byte-identical bind positions and native influences.
 * Metre-to-quantized round trips otherwise leave tiny cracks that open when posed.
 */
export function weldModuleOpeningCorners(
    body: BufferGeometry, clothing: BufferGeometry, encoding: Matrix4,
) {
    const vertices: number[] = clothing.userData.sharedOpeningVertices ?? [];
    if (!vertices.length) return;
    const tolerance = 0.000002;
    const bodyPositions = body.getAttribute('position');
    const clothingPositions = clothing.getAttribute('position');
    const bodyIndices = body.getAttribute('skinIndex');
    const bodyWeights = body.getAttribute('skinWeight');
    const clothingIndices = clothing.getAttribute('skinIndex');
    const clothingWeights = clothing.getAttribute('skinWeight');
    const buckets = new Map<string, {vertex: number; point: Vector3}[]>();
    const cell = (point: Vector3) => point.toArray().map(value => Math.floor(value / tolerance));
    for (const vertex of new Set<number>(body.index!.array)) {
        const point = new Vector3().fromBufferAttribute(bodyPositions, vertex).applyMatrix4(encoding);
        const key = cell(point).join(',');
        const bucket = buckets.get(key) ?? [];
        bucket.push({vertex, point});
        buckets.set(key, bucket);
    }
    const influenceError = (a: number, b: number) => {
        const delta = new Map<number, number>();
        for (let k = 0; k < 4; k++) {
            const bodyJoint = bodyIndices.getComponent(a, k);
            const clothingJoint = clothingIndices.getComponent(b, k);
            delta.set(bodyJoint, (delta.get(bodyJoint) ?? 0) + bodyWeights.getComponent(a, k));
            delta.set(clothingJoint, (delta.get(clothingJoint) ?? 0) - clothingWeights.getComponent(b, k));
        }
        return [...delta.values()].reduce((sum, value) => sum + Math.abs(value), 0);
    };
    for (const vertex of vertices) {
        const point = new Vector3().fromBufferAttribute(clothingPositions, vertex).applyMatrix4(encoding);
        const [x, y, z] = cell(point);
        let match: number | undefined;
        let bestError = Infinity;
        let bestDistance = Infinity;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            for (const candidate of buckets.get([x + dx, y + dy, z + dz].join(',')) ?? []) {
                const distance = point.distanceToSquared(candidate.point);
                if (distance > tolerance * tolerance) continue;
                const error = influenceError(candidate.vertex, vertex);
                if (error < bestError || error === bestError && distance < bestDistance) {
                    match = candidate.vertex;
                    bestError = error;
                    bestDistance = distance;
                }
            }
        }
        if (match === undefined) throw new Error('Shared clothing opening has no visible body corner');
        clothingPositions.setXYZ(vertex, bodyPositions.getX(match), bodyPositions.getY(match), bodyPositions.getZ(match));
        for (let k = 0; k < 4; k++) {
            clothingIndices.setComponent(vertex, k, bodyIndices.getComponent(match, k));
            clothingWeights.setComponent(vertex, k, bodyWeights.getComponent(match, k));
        }
    }
    clothingPositions.needsUpdate = true;
    clothingIndices.needsUpdate = true;
    clothingWeights.needsUpdate = true;
}
