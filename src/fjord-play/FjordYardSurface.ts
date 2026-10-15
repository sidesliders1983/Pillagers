import { Box3, Mesh, Object3D, Raycaster, Vector3 } from 'three';

type Point = { x: number; z: number };
type Obstacle = [Point, Point, Point];

function segmentDistance(point: Point, a: Point, b: Point) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1,
        ((point.x - a.x) * dx + (point.z - a.z) * dz) / Math.max(1e-12, dx * dx + dz * dz)));
    return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

function triangleDistance(point: Point, triangle: Obstacle) {
    const [a, b, c] = triangle;
    const cross = (p: Point, q: Point, r: Point) =>
        (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    const signs = [cross(a, b, point), cross(b, c, point), cross(c, a, point)];
    if (Math.abs(cross(a, b, c)) > 1e-8 &&
        (signs.every(value => value >= 0) || signs.every(value => value <= 0))) return 0;
    return Math.min(segmentDistance(point, a, b), segmentDistance(point, b, c),
        segmentDistance(point, c, a));
}

/** Source fences, walls and props constrain the stage collision footprint, not only its ground pivot. */
export function createFjordYardSurface(yard: Object3D, house: Object3D | undefined, base: number) {
    yard.updateWorldMatrix(true, true);
    const enclosure = new Box3().setFromObject(yard);
    const cells = new Map<string, Obstacle[]>();
    const cellKey = (x: number, z: number) => Math.floor(x) + ',' + Math.floor(z);
    for (const source of [yard, house]) source?.traverse(node => {
        if (!(node instanceof Mesh)) return;
        const positions = node.geometry.getAttribute('position'), indices = node.geometry.index;
        const count = indices?.count ?? positions.count;
        for (let i = 0; i < count; i += 3) {
            const vertices = [0, 1, 2].map(offset => new Vector3()
                .fromBufferAttribute(positions, indices ? indices.getX(i + offset) : i + offset)
                .applyMatrix4(node.matrixWorld));
            // Ignore low floor facets and foliage wholly above the cattle's occupied height.
            if (Math.max(...vertices.map(v => v.y)) <= base + .35 ||
                Math.min(...vertices.map(v => v.y)) > base + 1.5) continue;
            const triangle = vertices.map(v => ({ x: v.x, z: v.z })) as Obstacle;
            for (let x = Math.floor(Math.min(...vertices.map(v => v.x)));
                x <= Math.floor(Math.max(...vertices.map(v => v.x))); x++) {
                for (let z = Math.floor(Math.min(...vertices.map(v => v.z)));
                    z <= Math.floor(Math.max(...vertices.map(v => v.z))); z++) {
                    const key = cellKey(x, z), list = cells.get(key) ?? [];
                    list.push(triangle);
                    cells.set(key, list);
                }
            }
        }
    });
    const samples = new Map<string, number | null>();
    return (x: number, z: number, clearance: number) => {
        // The authored floor includes an outer garden apron beyond its actual fence.
        if (x < enclosure.min.x + 1 + clearance || x > enclosure.max.x - 1 - clearance ||
            z < enclosure.min.z + 1 + clearance || z > enclosure.max.z - 1 - clearance) return null;
        const key = x.toFixed(3) + ',' + z.toFixed(3) + ',' + clearance.toFixed(3);
        if (samples.has(key)) return samples.get(key)!;
        const point = { x, z }, nearby = new Set<Obstacle>();
        for (let cx = Math.floor(x - clearance); cx <= Math.floor(x + clearance); cx++) {
            for (let cz = Math.floor(z - clearance); cz <= Math.floor(z + clearance); cz++) {
                for (const triangle of cells.get(cellKey(cx, cz)) ?? []) nearby.add(triangle);
            }
        }
        let floor: number | null = null;
        if (![...nearby].some(triangle => triangleDistance(point, triangle) < clearance)) {
            const hit = new Raycaster(new Vector3(x, base + 20, z), new Vector3(0, -1, 0))
                .intersectObject(yard, true)[0];
            if (hit && hit.point.y <= base + .35 && (!hit.face || hit.face.normal.y >= .7)) {
                floor = hit.point.y;
            }
        }
        // Evict one old point rather than making every recent route probe cold at once.
        if (samples.size >= 16000) samples.delete(samples.keys().next().value!);
        samples.set(key, floor);
        return floor;
    };
}
