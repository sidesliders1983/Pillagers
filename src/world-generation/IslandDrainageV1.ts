// Frozen first-pass algorithm for explicit fjordside-island-v0.3b replay.
// New formation changes belong in the unversioned module, not this compatibility copy.
import type { GlacialValley, Point2, TerrainField } from './WorldBlueprint';

/** Priority flood resolves small depressions for drainage only; it never raises the canonical ground. */
export function islandDrainage(terrain: TerrainField, waterLevel: number, random: () => number): GlacialValley[] {
    const stride = 4, spacing = terrain.spacing * stride;
    const columns = (terrain.columns - 1) / stride + 1, rows = (terrain.rows - 1) / stride + 1;
    const original = Array.from({ length: columns * rows }, (_, i) =>
        terrain.heights[Math.floor(i / columns) * stride * terrain.columns + (i % columns) * stride]);
    const point = (i: number): Point2 => ({
        x: terrain.bounds.minX + i % columns * spacing,
        z: terrain.bounds.minZ + Math.floor(i / columns) * spacing
    });
    const neighbors = (i: number) => {
        const result: number[] = [], col = i % columns, row = Math.floor(i / columns);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dz) || col + dx < 0 || col + dx >= columns || row + dz < 0 || row + dz >= rows) continue;
            result.push(i + dx + dz * columns);
        }
        return result;
    };
    const filled = [...original], visited = new Uint8Array(original.length);
    const heap: number[] = [];
    const before = (a: number, b: number) => filled[a] < filled[b] || (filled[a] === filled[b] && a < b);
    const push = (cell: number) => {
        heap.push(cell);
        let i = heap.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (before(heap[parent], heap[i])) break;
            [heap[parent], heap[i]] = [heap[i], heap[parent]];
            i = parent;
        }
    };
    const pop = () => {
        const result = heap[0], last = heap.pop()!;
        if (heap.length) {
            heap[0] = last;
            let i = 0;
            while (i * 2 + 1 < heap.length) {
                let child = i * 2 + 1;
                if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
                if (before(heap[i], heap[child])) break;
                [heap[i], heap[child]] = [heap[child], heap[i]];
                i = child;
            }
        }
        return result;
    };
    for (let i = 0; i < original.length; i++) {
        if (original[i] <= waterLevel) {
            visited[i] = 1;
            push(i);
        }
    }
    while (heap.length) {
        const cell = pop();
        for (const next of neighbors(cell)) if (!visited[next]) {
            visited[next] = 1;
            filled[next] = Math.max(original[next], filled[cell] + .001);
            push(next);
        }
    }
    const downstream = new Int32Array(original.length).fill(-1);
    const upstream: number[][] = Array.from({ length: original.length }, () => []);
    for (let i = 0; i < original.length; i++) if (original[i] > waterLevel) {
        let bestSlope = 0;
        for (const next of neighbors(i)) {
            const a = point(i), b = point(next);
            const slope = (filled[i] - filled[next]) / Math.hypot(a.x - b.x, a.z - b.z);
            if (slope > bestSlope) {
                bestSlope = slope;
                downstream[i] = next;
            }
        }
        if (downstream[i] >= 0) upstream[downstream[i]].push(i);
    }
    const accumulation = original.map(height => height > waterLevel ? 1 : 0);
    const ordered = original.map((_, i) => i).sort((a, b) => filled[b] - filled[a] || a - b);
    for (const cell of ordered) if (downstream[cell] >= 0) accumulation[downstream[cell]] += accumulation[cell];
    const longestBranch = (end: number) => {
        const path = [end];
        while (upstream[path.at(-1)!].length) {
            const children = upstream[path.at(-1)!];
            const next = [...children].sort((a, b) => accumulation[b] - accumulation[a] || a - b)[0];
            path.push(next);
        }
        return path.reverse();
    };
    const outlets = ordered.filter(i => original[i] > waterLevel && downstream[i] >= 0 &&
        original[downstream[i]] <= waterLevel).sort((a, b) => accumulation[b] - accumulation[a] || a - b);
    const maximum = 2 + Math.floor(random() * 3), selected: number[] = [];
    const valleys: GlacialValley[] = [];
    for (const outlet of outlets) {
        if (selected.length >= maximum) break;
        const mouth = point(outlet);
        if (selected.some(other => Math.hypot(point(other).x - mouth.x, point(other).z - mouth.z) < 140)) continue;
        const cells = longestBranch(outlet);
        if (cells.length < 15 || original[cells[0]] < waterLevel + 25) continue;
        cells.push(downstream[outlet]);
        const rawPoints = cells.map(point);
        const points = rawPoints.map((p, i) => i === 0 || i === rawPoints.length - 1 ? p : ({
            x: (rawPoints[i-1].x + 2*p.x + rawPoints[i+1].x) / 4,
            z: (rawPoints[i-1].z + 2*p.z + rawPoints[i+1].z) / 4
        }));
        const lengths = [0];
        for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] +
            Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
        const total = lengths.at(-1)!;
        const source = original[cells[0]] - waterLevel;
        const floorHeights = lengths.map(distance => {
            const t = distance / total;
            const floor = t < .2 ? 1 + (source - 1) * (1 - t / .2) ** 2 :
                1 - (t - .2) / .8 * 10;
            return waterLevel + floor;
        });
        const mouthWidth = 60 + random() * 28;
        const widths = lengths.map(distance => 20 + (mouthWidth - 20) * Math.sqrt(distance / total));
        const id = 'valley-' + (selected.length + 1);
        valleys.push({ id, parentId: null, points, floorHeights, widths });
        selected.push(outlet);
        // Tributaries follow donor branches in the same drainage graph and meet a real trunk node.
        const mainCells = new Set(cells);
        const branches = cells.flatMap((cell, index) => upstream[cell]
            .filter(child => !mainCells.has(child) && accumulation[child] >= 4)
            .map(child => ({ child, index, cell })))
            .sort((a, b) => accumulation[b.child] - accumulation[a.child] || a.child - b.child);
        for (const branch of branches.slice(0, 2)) {
            const tributary = [...longestBranch(branch.child), branch.cell];
            if (tributary.length < 4) continue;
            const endHeight = floorHeights[branch.index];
            const startHeight = Math.max(endHeight, original[tributary[0]]);
            valleys.push({ id: id + '-tributary-' + branch.child, parentId: id,
                points: tributary.map((cell, i) => i === tributary.length - 1 ? points[branch.index] : point(cell)),
                floorHeights: tributary.map((_, i) => endHeight +
                    (startHeight - endHeight) * (1 - i / (tributary.length - 1)) ** 1.5),
                widths: tributary.map((_, i) => 9 + 17 * i / (tributary.length - 1)) });
        }
    }
    return valleys;
}
