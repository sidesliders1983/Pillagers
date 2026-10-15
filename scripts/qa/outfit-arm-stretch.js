import {Vector3} from 'three';

/** Capture diagnostics for sleeve triangles; this does not approve whole clothing fit. */
export function createArmStretchMeasure(fit) {
    const records = fit.meshes.map(record => {
        const mesh = record.mesh;
        const rest = Array.from({length: record.vertices.length}, (_, vertex) =>
            mesh.getVertexPosition(vertex, new Vector3()));
        const indices = mesh.geometry.index;
        const triangles = [];
        for (let triangle = 0; triangle < (indices?.count ?? rest.length) / 3; triangle++) {
            const corners = [0, 1, 2].map(corner => indices
                ? indices.getX(triangle * 3 + corner) : triangle * 3 + corner);
            if (!corners.some(vertex => Math.abs(record.vertices[vertex].x) > .215
                && record.vertices[vertex].y > .9 && record.vertices[vertex].y < 1.2)) continue;
            triangles.push({corners, lengths: corners.map((vertex, corner) =>
                rest[vertex].distanceTo(rest[corners[(corner + 1) % 3]]))});
        }
        const vertices = [...new Set(triangles.flatMap(triangle => triangle.corners))];
        return {mesh, triangles, vertices};
    });
    return () => {
        let checkedTriangles = 0, stretchedTriangles = 0, maximumRatio = 0;
        for (const {mesh, triangles, vertices} of records) {
            const posed = new Map(vertices.map(vertex => [vertex,
                mesh.getVertexPosition(vertex, new Vector3())]));
            for (const {corners, lengths} of triangles) {
                let stretched = false;
                corners.forEach((vertex, corner) => {
                    const length = posed.get(vertex).distanceTo(posed.get(corners[(corner + 1) % 3]));
                    const ratio = length / Math.max(.003, lengths[corner]);
                    maximumRatio = Math.max(maximumRatio, ratio);
                    if (ratio > 4 && length > .05) stretched = true;
                });
                checkedTriangles++;
                if (stretched) stretchedTriangles++;
            }
        }
        return {checkedTriangles, stretchedTriangles, maximumRatio,
            thresholds: {maximumRatio: 4, minimumPosedEdgeMetres: .05, minimumRestEdgeMetres: .003},
            qualification: 'Detects long stretched sleeve triangles. This is not approval of skin penetration, cuff fit or whole-garment deformation.'};
    };
}
