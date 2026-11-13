import { Ray, Triangle, Vector3 } from 'three';

const topologies = new WeakMap();

/** Exact finite edge/triangle crossings between two posed indexed meshes, in both directions. */
export function createRigidPropIntersectionMeasure(left, right, options = {}) {
    const surfaces = [left, right].map((mesh, side) => {
        const topology = meshTopology(mesh);
        const filter = side === 0 ? options.leftTriangleFilter : options.rightTriangleFilter;
        const allowed = new Uint8Array(topology.triangles.length);
        const edges = new Map();
        for (const triangle of topology.triangles) {
            if (filter && !filter(triangle.vertices, triangle.index)) continue;
            allowed[triangle.index] = 1;
            const vertices = triangle.vertices;
            for (let offset = 0; offset < 3; offset++) {
                const a = vertices[offset], b = vertices[(offset + 1) % 3];
                edges.set(Math.min(a, b) + ':' + Math.max(a, b), [a, b]);
            }
        }
        return { mesh, side, topology, allowed, edges: [...edges.values()] };
    });
    // Share a fresh cache across pairs of the same pose; each actual mesh is skinned once.
    return (poseCache = new Map()) => {
        const posed = surfaces.map(surface => ({ ...surface,
            geometry: sampleGeometry(surface.mesh, surface.topology, poseCache) }));
        const outgoing = segmentCrossings(posed[0], posed[1], options);
        const incoming = segmentCrossings(posed[1], posed[0], options);
        return { leftEdgesAgainstRight: outgoing.count, rightEdgesAgainstLeft: incoming.count,
            intersections: outgoing.count + incoming.count, allowedContacts: outgoing.allowed + incoming.allowed,
            firstHit: outgoing.firstHit?.point ?? incoming.firstHit?.point,
            firstHitDetails: outgoing.firstHit ? { ...outgoing.firstHit, direction: 'left-to-right' }
                : incoming.firstHit ? { ...incoming.firstHit, direction: 'right-to-left' } : undefined };
    };
}

function meshTopology(mesh) {
    if (!mesh?.isSkinnedMesh) throw new Error('The actual fitted skinned mesh is required.');
    const cached = topologies.get(mesh);
    if (cached) {
        if (cached.source !== mesh.geometry) throw new Error('Recreate the contact probe after a geometry change.');
        return cached;
    }
    const indices = mesh.geometry.getIndex(), positions = mesh.geometry.getAttribute('position');
    if (!indices) throw new Error('The reviewed mesh needs its actual indexed triangles.');
    const points = Array.from({ length: positions.count }, (_, vertex) =>
        new Vector3().fromBufferAttribute(positions, vertex));
    const triangles = [];
    for (let index = 0; index < indices.count; index += 3) {
        const triangle = { index: index / 3,
            vertices: [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)] };
        updateTriangle(triangle, points);
        triangles.push(triangle);
    }
    const result = { source: mesh.geometry, points, triangles, tree: triangleTree([...triangles]) };
    topologies.set(mesh, result);
    return result;
}

function sampleGeometry(mesh, topology, poseCache) {
    let geometry = poseCache.get(mesh);
    if (geometry) return geometry;
    if (topology.source !== mesh.geometry) throw new Error('The fitted geometry changed during the contact review.');
    mesh.updateWorldMatrix(true, false);
    mesh.skeleton.bones[0].updateWorldMatrix(true, true);
    for (let vertex = 0; vertex < topology.points.length; vertex++)
        mesh.getVertexPosition(vertex, topology.points[vertex]).applyMatrix4(mesh.matrixWorld);
    for (const triangle of topology.triangles) updateTriangle(triangle, topology.points);
    refitTree(topology.tree);
    geometry = { points: topology.points, tree: topology.tree };
    poseCache.set(mesh, geometry);
    return geometry;
}

function updateTriangle(triangle, points) {
    const a = triangle.a = points[triangle.vertices[0]];
    const b = triangle.b = points[triangle.vertices[1]];
    const c = triangle.c = points[triangle.vertices[2]];
    triangle.minX = Math.min(a.x, b.x, c.x);
    triangle.maxX = Math.max(a.x, b.x, c.x);
    triangle.minY = Math.min(a.y, b.y, c.y);
    triangle.maxY = Math.max(a.y, b.y, c.y);
    triangle.minZ = Math.min(a.z, b.z, c.z);
    triangle.maxZ = Math.max(a.z, b.z, c.z);
}

function boundsOf(parts) {
    const bounds = { minX: Infinity, minY: Infinity, minZ: Infinity,
        maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    for (const part of parts) expand(bounds, part);
    return bounds;
}

function expand(bounds, part) {
    bounds.minX = Math.min(bounds.minX, part.minX);
    bounds.maxX = Math.max(bounds.maxX, part.maxX);
    bounds.minY = Math.min(bounds.minY, part.minY);
    bounds.maxY = Math.max(bounds.maxY, part.maxY);
    bounds.minZ = Math.min(bounds.minZ, part.minZ);
    bounds.maxZ = Math.max(bounds.maxZ, part.maxZ);
}

function triangleTree(triangles) {
    if (!triangles.length) return null;
    const bounds = boundsOf(triangles);
    if (triangles.length <= 12) return { ...bounds, triangles };
    const width = bounds.maxX - bounds.minX, height = bounds.maxY - bounds.minY, depth = bounds.maxZ - bounds.minZ;
    const axis = height > width && height >= depth ? 'Y' : depth > width ? 'Z' : 'X';
    const middle = (bounds['min' + axis] + bounds['max' + axis]) / 2;
    let left = [], right = [];
    for (const triangle of triangles) {
        const centre = (triangle['min' + axis] + triangle['max' + axis]) / 2;
        (centre < middle ? left : right).push(triangle);
    }
    if (!left.length || !right.length) {
        const half = Math.floor(triangles.length / 2);
        left = triangles.slice(0, half); right = triangles.slice(half);
    }
    return { ...bounds, left: triangleTree(left), right: triangleTree(right) };
}

function refitTree(node) {
    if (!node) return;
    if (!node.triangles) { refitTree(node.left); refitTree(node.right); }
    node.minX = node.minY = node.minZ = Infinity;
    node.maxX = node.maxY = node.maxZ = -Infinity;
    if (node.triangles) for (const triangle of node.triangles) expand(node, triangle);
    else { expand(node, node.left); expand(node, node.right); }
}

function segmentCrossings(surface, target, options) {
    const ray = new Ray(), direction = new Vector3(), hitPoint = new Vector3();
    let count = 0, allowed = 0, firstHit;
    // Ignore boundary-only contacts within 0.1 micrometre, not finite interior crossings.
    const epsilon = 1e-7;
    for (const [start, end] of surface.edges) {
        const a = surface.geometry.points[start], b = surface.geometry.points[end];
        const bounds = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
            minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
            minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
        direction.copy(b).sub(a);
        const length = direction.length();
        if (length < epsilon) continue;
        ray.set(a, direction.divideScalar(length));
        const pending = [target.geometry.tree];
        while (pending.length) {
            const node = pending.pop();
            if (!node || !overlaps(bounds, node, epsilon)) continue;
            if (!node.triangles) { pending.push(node.left, node.right); continue; }
            for (const triangle of node.triangles) {
                if (!target.allowed[triangle.index] || !overlaps(bounds, triangle, epsilon)) continue;
                if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hitPoint)) continue;
                const distance = hitPoint.distanceTo(a);
                if (distance <= epsilon || distance >= length - epsilon) continue;
                if (options.allowContact) {
                    const fraction = distance / length;
                    const from = { vertices: [start, end], weights: [1 - fraction, fraction] };
                    const barycentric = Triangle.getBarycoord(hitPoint, triangle.a, triangle.b, triangle.c, new Vector3());
                    const to = { vertices: triangle.vertices, weights: barycentric.toArray() };
                    const contact = { point: hitPoint, left: surface.side === 0 ? from : to,
                        right: surface.side === 0 ? to : from };
                    if (options.allowContact(contact)) { allowed++; continue; }
                }
                count++;
                firstHit ??= { point: hitPoint.toArray(), edge: [start, end], triangle: triangle.index };
                if (options.stopAtFirst) return { count, allowed, firstHit };
            }
        }
    }
    return { count, allowed, firstHit };
}

function overlaps(a, b, epsilon) {
    return a.minX <= b.maxX + epsilon && a.maxX >= b.minX - epsilon &&
        a.minY <= b.maxY + epsilon && a.maxY >= b.minY - epsilon &&
        a.minZ <= b.maxZ + epsilon && a.maxZ >= b.minZ - epsilon;
}
