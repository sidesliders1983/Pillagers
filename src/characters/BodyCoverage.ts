import {BufferAttribute, BufferGeometry, Vector3, type InterleavedBufferAttribute,
    type TypedArrayConstructor} from 'three';
import type {BodySurface, SurfaceAnchor} from './BodyFitAdapter';

export interface BodyCutPlane {
    regions: string[];
    regionMatch?: 'all' | 'any';
    normal: number[];
    constant: number;
}

/** Drop unreferenced copies before merging coverage fragments. Only the first
 * fragment retains the native prefix used by fitting and source correspondence.
 * All drawn corner values, morphs, UV seams and native influences stay exact. */
export function compactCoverageGeometry(geometry: BufferGeometry, retainedPrefix = 0) {
    const index = geometry.index;
    if (!index) return geometry;
    const count = geometry.getAttribute('position').count;
    if (!Number.isInteger(retainedPrefix) || retainedPrefix < 0 || retainedPrefix > count)
        throw new Error('Invalid retained native vertex prefix.');
    const remap = new Int32Array(count).fill(-1);
    const retained: number[] = [];
    for (let vertex = 0; vertex < retainedPrefix; vertex++) {
        remap[vertex] = retained.length;
        retained.push(vertex);
    }
    for (let corner = 0; corner < index.count; corner++) {
        const vertex = index.getX(corner);
        if (!Number.isInteger(vertex) || vertex < 0 || vertex >= count)
            throw new Error('Coverage references an invalid native vertex.');
        if (remap[vertex] === -1) {
            remap[vertex] = retained.length;
            retained.push(vertex);
        }
    }
    if (retained.length === count) return geometry;
    const copy = (attribute: BufferAttribute | InterleavedBufferAttribute) => {
        const interleaved = attribute as InterleavedBufferAttribute;
        const packed = attribute as BufferAttribute;
        const shared = interleaved.isInterleavedBufferAttribute === true;
        const source = shared ? interleaved.data.array : packed.array;
        const ArrayType = source.constructor as TypedArrayConstructor;
        const values = new ArrayType(retained.length * attribute.itemSize);
        const stride = shared ? interleaved.data.stride : attribute.itemSize;
        const offset = shared ? interleaved.offset : 0;
        for (let vertex = 0; vertex < retained.length; vertex++)
            for (let component = 0; component < attribute.itemSize; component++)
                values[vertex * attribute.itemSize + component] =
                    source[retained[vertex] * stride + offset + component];
        const result = new BufferAttribute(values, attribute.itemSize, attribute.normalized);
        result.name = attribute.name;
        result.setUsage(shared ? interleaved.data.usage : packed.usage);
        if (!shared) result.gpuType = packed.gpuType;
        return result;
    };
    for (const [name, attribute] of Object.entries(geometry.attributes))
        geometry.setAttribute(name, copy(attribute));
    for (const [name, targets] of Object.entries(geometry.morphAttributes))
        geometry.morphAttributes[name as keyof typeof geometry.morphAttributes] = targets?.map(copy);
    geometry.setIndex(Array.from(index.array, vertex => remap[vertex]));
    if (geometry.userData.coverageWeights) {
        geometry.userData.coverageWeights = geometry.userData.coverageWeights
            .filter((value: {vertex: number}) => remap[value.vertex] !== -1)
            .map((value: {vertex: number}) => ({...value, vertex: remap[value.vertex]}));
    }
    geometry.boundingBox = null;
    geometry.computeBoundingSphere();
    return geometry;
}

/** Own the coverage mesh and sew its cut edges to the module's exact LOD contacts. */
export function maskedBodyGeometry(
    source: BufferGeometry,
    surface: Omit<BodySurface, 'regions'> & {regions: readonly string[]},
    covered: ReadonlySet<number>,
    planes: readonly BodyCutPlane[] = [],
    rims: readonly SurfaceAnchor[] = [],
) {
    return createBodyCoverageBuilder(source)(surface, covered, planes, rims);
}

/** Decode each source attribute once for a synchronous set of body fragments.
 * Each fragment still owns its mutable arrays. This is not a cross-resident cache:
 * the next refit reads fresh geometry, morphs, weights and in-place source edits. */
export function createBodyCoverageBuilder(source: BufferGeometry) {
    const attributes = Object.entries(source.attributes);
    const morphs = new Map<string, { name: string; index: number }>();
    for (const [name, targets] of Object.entries(source.morphAttributes)) {
        for (const [index, attribute] of (targets ?? []).entries()) {
            const key = 'morph:' + name + ':' + index;
            morphs.set(key, { name, index });
            attributes.push([key, attribute]);
        }
    }
    const decoded = new Map(attributes.map(([name, attribute]) => [name, coverageValues(attribute)]));
    return (
        surface: Omit<BodySurface, 'regions'> & {regions: readonly string[]},
        covered: ReadonlySet<number>,
        planes: readonly BodyCutPlane[] = [],
        rims: readonly SurfaceAnchor[] = [],
        retainedPrefix?: number,
    ) => buildBodyFragment(source, attributes, morphs, decoded, surface, covered, planes, rims, retainedPrefix);
}

function coverageValues(attribute: BufferAttribute | InterleavedBufferAttribute) {
    // Float morph buffers already store their final values. Preserve existing accessor
    // semantics for normalized, interleaved and specialized attributes.
    if (!attribute.normalized && !('isInterleavedBufferAttribute' in attribute)
        && !('isFloat16BufferAttribute' in attribute)
        && attribute.getComponent === BufferAttribute.prototype.getComponent) return Array.from(attribute.array);
    return Array.from({length: attribute.count * attribute.itemSize}, (_, index) =>
        attribute.getComponent(Math.floor(index / attribute.itemSize), index % attribute.itemSize));
}

function buildBodyFragment(
    source: BufferGeometry,
    attributes: [string, BufferAttribute | InterleavedBufferAttribute][],
    morphs: Map<string, {name: string; index: number}>,
    decoded: ReadonlyMap<string, number[]>,
    surface: Omit<BodySurface, 'regions'> & {regions: readonly string[]},
    covered: ReadonlySet<number>,
    planes: readonly BodyCutPlane[],
    rims: readonly SurfaceAnchor[],
    retainedPrefix?: number,
) {
    // Native values stay in the read-only decoded snapshot. Only newly cut corners need
    // append buffers; most fragment vertices are discarded during compaction below.
    const arrays = new Map(attributes.map(([name]) => [name, [] as number[]]));
    const points = Array.from({length: surface.positions.length / 3}, (_, vertex) =>
        new Vector3().fromArray(surface.positions, vertex * 3));
    const originalCount = points.length;
    const valueAt = (name: string, vertex: number, component: number, itemSize: number) =>
        vertex < originalCount ? decoded.get(name)![vertex * itemSize + component]
            : arrays.get(name)![(vertex - originalCount) * itemSize + component];
    const indices: number[] = [];
    const coverageWeights: {vertex: number; influences: [number, number][]}[] = [];
    const rimPoints = new Map<number, Vector3[]>();
    for (const anchor of rims) {
        const point = new Vector3();
        for (let k = 0; k < 3; k++) {
            point.addScaledVector(points[surface.indices[anchor.triangle * 3 + k]], anchor.barycentric[k]);
        }
        const list = rimPoints.get(anchor.triangle) ?? [];
        if (!list.some(other => point.distanceToSquared(other) < 1e-14)) list.push(point);
        rimPoints.set(anchor.triangle, list);
    }

    // Keep the full native mixture through successive cuts. Reduce only the final
    // rendered vertex; blending already-reduced cuts discards source influences twice.
    const nativeInfluences: Map<number, number>[] = new Array(originalCount);
    const influencesAt = (vertex: number) => {
        if (nativeInfluences[vertex]) return nativeInfluences[vertex];
        const values = new Map<number, number>();
        for (let k = 0; k < 4; k++) {
            const joint = decoded.get('skinIndex')![vertex * 4 + k];
            const weight = decoded.get('skinWeight')![vertex * 4 + k];
            values.set(joint, (values.get(joint) ?? 0) + weight);
        }
        nativeInfluences[vertex] = values;
        return values;
    };
    const mix = (a: number, b: number, fraction: number) => {
        const vertex = points.length;
        points.push(points[a].clone().lerp(points[b], fraction));
        for (const [name, attribute] of attributes) {
            const list = arrays.get(name)!;
            for (let k = 0; k < attribute.itemSize; k++) {
                list.push(valueAt(name, a, k, attribute.itemSize) * (1 - fraction)
                    + valueAt(name, b, k, attribute.itemSize) * fraction);
            }
        }
        const joints = arrays.get('skinIndex')!;
        const weights = arrays.get('skinWeight')!;
        const merged = new Map<number, number>();
        for (const [sourceVertex, amount] of [[a, 1 - fraction], [b, fraction]]) {
            for (const [joint, weight] of influencesAt(sourceVertex)) {
                merged.set(joint, (merged.get(joint) ?? 0) + weight * amount);
            }
        }
        nativeInfluences.push(merged);
        coverageWeights.push({vertex, influences: [...merged]});
        const top = [...merged].filter(([, weight]) => weight > 0)
            .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
        const total = top.reduce((sum, [, weight]) => sum + weight, 0);
        for (let k = 0; k < 4; k++) {
            joints[(vertex - originalCount) * 4 + k] = top[k]?.[0] ?? 0;
            weights[(vertex - originalCount) * 4 + k] = (top[k]?.[1] ?? 0) / total;
        }
        const normals = arrays.get('normal');
        if (normals) {
            const normal = new Vector3().fromArray(normals, (vertex - originalCount) * 3).normalize();
            normals.splice((vertex - originalCount) * 3, 3, ...normal.toArray());
        }
        return vertex;
    };

    for (let triangle = 0; triangle < surface.triangles; triangle++) {
        if (covered.has(triangle)) continue;
        const originalCorners = [...surface.indices.slice(triangle * 3, triangle * 3 + 3)];
        let polygon = [...originalCorners];
        for (const plane of planes) {
            // Select the original face, never unlabelled corners inserted by another cut.
            const matches = originalCorners.map(vertex => plane.regions.includes(surface.regions[vertex]));
            const selected = plane.regionMatch === 'any' ? matches.some(Boolean) : matches.every(Boolean);
            if (!selected) continue;
            const normal = new Vector3(...plane.normal);
            const distance = (vertex: number) => points[vertex].dot(normal) + plane.constant;
            const next: number[] = [];
            for (let k = 0; k < polygon.length; k++) {
                const a = polygon[k];
                const b = polygon[(k + 1) % polygon.length];
                const da = distance(a);
                const db = distance(b);
                if (da >= 0) next.push(a);
                if ((da >= 0) !== (db >= 0)) next.push(mix(a, b, da / (da - db)));
            }
            polygon = next;
            if (!polygon.length) break;
        }
        // Subdivide the body edge at shared contacts instead of offsetting clothing.
        const contacts = rimPoints.get(triangle);
        if (contacts && polygon.length) {
            const next: number[] = [];
            for (let k = 0; k < polygon.length; k++) {
                const a = polygon[k];
                const b = polygon[(k + 1) % polygon.length];
                const edge = points[b].clone().sub(points[a]);
                const length = edge.lengthSq();
                next.push(a);
                if (!length) continue;
                const cuts = contacts.map(point => ({point,
                    fraction: point.clone().sub(points[a]).dot(edge) / length,
                })).filter(({point, fraction}) => fraction > 1e-7 && fraction < 1 - 1e-7
                    && points[a].clone().addScaledVector(edge, fraction).distanceToSquared(point) < 1e-12)
                    .sort((a, b) => a.fraction - b.fraction);
                for (const {fraction} of cuts) next.push(mix(a, b, fraction));
            }
            polygon = next;
            // Fan from a surviving source corner rather than from the collinear rim.
            const first = polygon.findIndex(vertex => vertex < originalCount);
            if (first > 0) polygon = [...polygon.slice(first), ...polygon.slice(0, first)];
        }
        for (let k = 1; k + 1 < polygon.length; k++) {
            indices.push(polygon[0], polygon[k], polygon[k + 1]);
        }
    }
    const geometry = new BufferGeometry();
    geometry.morphTargetsRelative = source.morphTargetsRelative;
    const retained: number[] = [];
    const remap = new Int32Array(points.length).fill(-1);
    const prefix = retainedPrefix ?? points.length;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > points.length)
        throw new Error('Invalid retained native vertex prefix.');
    for (let vertex = 0; vertex < prefix; vertex++) {
        remap[vertex] = retained.length;
        retained.push(vertex);
    }
    for (const vertex of indices) if (remap[vertex] === -1) {
        remap[vertex] = retained.length;
        retained.push(vertex);
    }
    for (const [name, attribute] of attributes) {
        const count = retained.length * attribute.itemSize;
        const typed = name === 'skinIndex' ? new Uint16Array(count) : new Float32Array(count);
        for (let index = 0; index < retained.length; index++)
            for (let component = 0; component < attribute.itemSize; component++)
                typed[index * attribute.itemSize + component] =
                    valueAt(name, retained[index], component, attribute.itemSize);
        const copied = new BufferAttribute(typed, attribute.itemSize);
        copied.name = attribute.name;
        const morph = morphs.get(name);
        if (morph) {
            const targets = geometry.morphAttributes as Record<string, BufferAttribute[]>;
            (targets[morph.name] ??= [])[morph.index] = copied;
        } else geometry.setAttribute(name, copied);
    }
    geometry.setIndex(indices.map(vertex => remap[vertex]));
    geometry.userData.coverageWeights = coverageWeights.filter(value => remap[value.vertex] !== -1)
        .map(value => ({...value, vertex: remap[value.vertex]}));
    geometry.computeBoundingSphere();
    return geometry;
}
