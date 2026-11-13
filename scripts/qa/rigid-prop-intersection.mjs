import { Ray, Vector3 } from 'three';

/** Exact finite edge/triangle crossings between two posed rigid props, in both directions. */
export function createRigidPropIntersectionMeasure(left, right) {
    const surfaces = [left, right].map(mesh => {
        if (!mesh?.isSkinnedMesh) throw new Error('The actual fitted skinned prop is required.');
        const indices = mesh.geometry.getIndex();
        if (!indices) throw new Error('The reviewed prop needs its original indexed triangles.');
        const triangles = [], edges = new Map();
        for (let index = 0; index < indices.count; index += 3) {
            const vertices = [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)];
            triangles.push(vertices);
            for (let offset = 0; offset < 3; offset++) {
                const a = vertices[offset], b = vertices[(offset + 1) % 3];
                edges.set(Math.min(a, b) + ':' + Math.max(a, b), [a, b]);
            }
        }
        return { mesh, triangles, edges: [...edges.values()] };
    });
    return () => {
        const posed = surfaces.map(({ mesh, triangles, edges }) => {
            mesh.updateWorldMatrix(true, false);
            mesh.skeleton.bones[0].updateWorldMatrix(true, true);
            const positions = mesh.geometry.getAttribute('position');
            const points = Array.from({ length: positions.count }, (_, vertex) =>
                mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld));
            return { points, edges, triangles: triangles.map(vertices => {
                const [a, b, c] = vertices.map(vertex => points[vertex]);
                return { a, b, c,
                    minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x),
                    minY: Math.min(a.y, b.y, c.y), maxY: Math.max(a.y, b.y, c.y),
                    minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z) };
            }) };
        });
        const outgoing = segmentCrossings(posed[0], posed[1].triangles);
        const incoming = segmentCrossings(posed[1], posed[0].triangles);
        return { leftEdgesAgainstRight: outgoing.count, rightEdgesAgainstLeft: incoming.count,
            intersections: outgoing.count + incoming.count,
            firstHit: outgoing.firstHit ?? incoming.firstHit };
    };
}

function segmentCrossings(surface, triangles) {
    const ray = new Ray(), direction = new Vector3(), hitPoint = new Vector3();
    let count = 0, firstHit;
    // Ignore boundary-only contacts within 0.1 micrometre, not finite interior crossings.
    const epsilon = 1e-7;
    for (const [start, end] of surface.edges) {
        const a = surface.points[start], b = surface.points[end];
        const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
        const minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
        direction.copy(b).sub(a);
        const length = direction.length();
        if (length < epsilon) continue;
        ray.set(a, direction.divideScalar(length));
        for (const triangle of triangles) {
            if (minX > triangle.maxX + epsilon || maxX < triangle.minX - epsilon ||
                minY > triangle.maxY + epsilon || maxY < triangle.minY - epsilon ||
                minZ > triangle.maxZ + epsilon || maxZ < triangle.minZ - epsilon) continue;
            if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hitPoint)) continue;
            const distance = hitPoint.distanceTo(a);
            if (distance <= epsilon || distance >= length - epsilon) continue;
            count++;
            firstHit ??= hitPoint.toArray();
        }
    }
    return { count, firstHit };
}
