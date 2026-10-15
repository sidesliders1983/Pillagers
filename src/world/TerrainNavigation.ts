import { BackSide, BufferAttribute, DoubleSide, Matrix4, Mesh, Ray, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { TerrainField } from '../world-generation/WorldBlueprint';

interface NavigationSurface {
    intersect(ray: Ray, target: Vector3): Vector3 | null | undefined;
    refreshIndex(): void;
}
const surfaces = new WeakMap<Object3D, NavigationSurface>();

/** Bind the canonical builder's existing six vertices per cell; no copied geometry or BVH. */
export function registerTerrainNavigation(mesh: Mesh, terrain: TerrainField) {
    const geometry = mesh.geometry, positions = geometry.getAttribute('position');
    if (!(positions instanceof BufferAttribute)) return;
    const gridVertices = (terrain.columns - 1) * (terrain.rows - 1) * 6;
    const positionVersion = positions.version;
    const inverse = new Matrix4(), localRay = new Ray();
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    const hit = new Vector3(), nearest = new Vector3();
    let index = geometry.index, indexVersion = index?.version;
    let drawStart = geometry.drawRange.start, drawCount = geometry.drawRange.count;
    let groups = JSON.stringify(geometry.groups);
    const entry: NavigationSurface = {
        refreshIndex() {
            index = geometry.index;
            indexVersion = index?.version;
            drawStart = geometry.drawRange.start;
            drawCount = geometry.drawRange.count;
            groups = JSON.stringify(geometry.groups);
        },
        intersect(ray, target) {
            const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            // Unknown edits retain Three's ordinary raycast rather than trusting stale grid metadata.
            if (mesh.geometry !== geometry || geometry.getAttribute('position') !== positions ||
                positions.version !== positionVersion || geometry.index !== index ||
                index?.version !== indexVersion || geometry.drawRange.start !== drawStart ||
                geometry.drawRange.count !== drawCount || JSON.stringify(geometry.groups) !== groups ||
                positions.count < gridVertices ||
                Object.keys(geometry.morphAttributes).length || !material ||
                Array.isArray(mesh.material) && mesh.material.some(value => value.side !== material.side))
                return undefined;
            mesh.updateWorldMatrix(true, false);
            if (mesh.matrixWorld.determinant() === 0) return undefined;
            localRay.copy(ray).applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
            let nearestDistance = Infinity;
            const triangle = (vertex: number) => {
                a.fromBufferAttribute(positions, vertex);
                b.fromBufferAttribute(positions, vertex + 1);
                c.fromBufferAttribute(positions, vertex + 2);
                const point = material.side === BackSide ? localRay.intersectTriangle(c, b, a, true, hit) :
                    localRay.intersectTriangle(a, b, c, material.side !== DoubleSide, hit);
                if (!point) return false;
                const distance = point.distanceToSquared(localRay.origin);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearest.copy(point);
                }
                return true;
            };
            // The builder appends eight deep-sea continuation triangles outside the grid.
            for (let vertex = gridVertices; vertex < positions.count; vertex += 3) triangle(vertex);
            const { origin, direction } = localRay, { bounds, spacing, columns, rows } = terrain;
            let enter = 0, leave = Infinity;
            for (const [axis, minimum, maximum] of [
                ['x', bounds.minX, bounds.maxX], ['z', bounds.minZ, bounds.maxZ],
            ] as const) {
                if (direction[axis] === 0) {
                    if (origin[axis] < minimum || origin[axis] > maximum) leave = -1;
                } else {
                    const first = (minimum - origin[axis]) / direction[axis];
                    const last = (maximum - origin[axis]) / direction[axis];
                    enter = Math.max(enter, Math.min(first, last));
                    leave = Math.min(leave, Math.max(first, last));
                }
            }
            if (enter <= leave) {
                let col = Math.max(0, Math.min(columns - 2,
                    Math.floor((origin.x + direction.x * enter - bounds.minX) / spacing)));
                let row = Math.max(0, Math.min(rows - 2,
                    Math.floor((origin.z + direction.z * enter - bounds.minZ) / spacing)));
                // Traverse only the cells crossed by this ray, in near-to-far order.
                for (let visited = 0; visited < columns + rows + 2; visited++) {
                    const vertex = (row * (columns - 1) + col) * 6;
                    const first = triangle(vertex), second = triangle(vertex + 3);
                    if (first || second) break;
                    const nextX = direction.x === 0 ? Infinity :
                        (bounds.minX + (col + (direction.x > 0 ? 1 : 0)) * spacing - origin.x) / direction.x;
                    const nextZ = direction.z === 0 ? Infinity :
                        (bounds.minZ + (row + (direction.z > 0 ? 1 : 0)) * spacing - origin.z) / direction.z;
                    const next = Math.min(nextX, nextZ);
                    if (next >= leave || !Number.isFinite(next)) break;
                    if (nextX === next) col += Math.sign(direction.x);
                    if (nextZ === next) row += Math.sign(direction.z);
                    if (col < 0 || col >= columns - 1 || row < 0 || row >= rows - 1) break;
                }
            }
            return nearestDistance === Infinity ? null : target.copy(nearest).applyMatrix4(mesh.matrixWorld);
        },
    };
    surfaces.set(mesh, entry);
}

/** Only the builder's material-mask index update can refresh an existing registration. */
export function refreshTerrainNavigationIndex(mesh: Mesh) { surfaces.get(mesh)?.refreshIndex(); }
export function releaseTerrainNavigation(mesh: Mesh) { surfaces.delete(mesh); }

/** Undefined requests the native fallback; null is a verified miss of the registered surface. */
export function intersectNavigationTerrain(surface: Object3D, ray: Ray, target: Vector3) {
    return surfaces.get(surface)?.intersect(ray, target);
}

