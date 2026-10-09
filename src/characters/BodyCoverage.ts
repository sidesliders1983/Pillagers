import {BufferAttribute, BufferGeometry, Vector3} from 'three';
import type {BodySurface, SurfaceAnchor} from './BodyFitAdapter';

export interface BodyCutPlane {
    regions: string[];
    regionMatch?: 'all' | 'any';
    normal: number[];
    constant: number;
}

/** Own the coverage mesh and sew its cut edges to the module's exact LOD contacts. */
export function maskedBodyGeometry(
    source: BufferGeometry,
    surface: BodySurface,
    covered: ReadonlySet<number>,
    planes: readonly BodyCutPlane[] = [],
    rims: readonly SurfaceAnchor[] = [],
) {
    const attributes = Object.entries(source.attributes);
    const arrays = new Map(attributes.map(([name, attribute]) => [name,
        Array.from({length: attribute.count * attribute.itemSize}, (_, i) =>
            attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize)),
    ]));
    const points = Array.from({length: surface.positions.length / 3}, (_, vertex) =>
        new Vector3().fromArray(surface.positions, vertex * 3));
    const originalCount = points.length;
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
    const nativeInfluences: Map<number, number>[] = points.map((_, vertex) => {
        const values = new Map<number, number>();
        for (let k = 0; k < 4; k++) {
            const joint = source.getAttribute('skinIndex').getComponent(vertex, k);
            const weight = source.getAttribute('skinWeight').getComponent(vertex, k);
            values.set(joint, (values.get(joint) ?? 0) + weight);
        }
        return values;
    });
    const mix = (a: number, b: number, fraction: number) => {
        const vertex = points.length;
        points.push(points[a].clone().lerp(points[b], fraction));
        for (const [name, attribute] of attributes) {
            const list = arrays.get(name)!;
            for (let k = 0; k < attribute.itemSize; k++) {
                list.push(list[a * attribute.itemSize + k] * (1 - fraction)
                    + list[b * attribute.itemSize + k] * fraction);
            }
        }
        const joints = arrays.get('skinIndex')!;
        const weights = arrays.get('skinWeight')!;
        const merged = new Map<number, number>();
        for (const [sourceVertex, amount] of [[a, 1 - fraction], [b, fraction]]) {
            for (const [joint, weight] of nativeInfluences[sourceVertex]) {
                merged.set(joint, (merged.get(joint) ?? 0) + weight * amount);
            }
        }
        nativeInfluences.push(merged);
        coverageWeights.push({vertex, influences: [...merged]});
        const top = [...merged].filter(([, weight]) => weight > 0)
            .sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
        const total = top.reduce((sum, [, weight]) => sum + weight, 0);
        for (let k = 0; k < 4; k++) {
            joints[vertex * 4 + k] = top[k]?.[0] ?? 0;
            weights[vertex * 4 + k] = (top[k]?.[1] ?? 0) / total;
        }
        const normals = arrays.get('normal');
        if (normals) {
            const normal = new Vector3().fromArray(normals, vertex * 3).normalize();
            normals.splice(vertex * 3, 3, ...normal.toArray());
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
    for (const [name, attribute] of attributes) {
        const values = arrays.get(name)!;
        const typed = name === 'skinIndex' ? new Uint16Array(values) : new Float32Array(values);
        geometry.setAttribute(name, new BufferAttribute(typed, attribute.itemSize));
    }
    geometry.setIndex(indices);
    geometry.userData.coverageWeights = coverageWeights;
    geometry.computeBoundingSphere();
    return geometry;
}
