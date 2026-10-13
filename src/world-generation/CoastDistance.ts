import type { CoastSegment, Point2 } from './WorldBlueprint';

interface CoastNode {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    segments?: readonly CoastSegment[];
    children?: readonly CoastNode[];
}

/** Exact nearest-segment queries, bounded by a spatial hierarchy over the canonical coast. */
export function createCoastDistance(coast: readonly CoastSegment[]) {
    const build = (segments: readonly CoastSegment[]): CoastNode => {
        const node: CoastNode = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
        for (const { a, b } of segments) {
            node.minX = Math.min(node.minX, a.x, b.x);
            node.maxX = Math.max(node.maxX, a.x, b.x);
            node.minZ = Math.min(node.minZ, a.z, b.z);
            node.maxZ = Math.max(node.maxZ, a.z, b.z);
        }
        if (segments.length <= 8) node.segments = segments;
        else {
            const axis = node.maxX - node.minX > node.maxZ - node.minZ ? 'x' : 'z';
            const ordered = [...segments].sort((a, b) => a.a[axis] + a.b[axis] - b.a[axis] - b.b[axis]);
            const middle = Math.floor(ordered.length / 2);
            node.children = [build(ordered.slice(0, middle)), build(ordered.slice(middle))];
        }
        return node;
    };
    const root = build(coast);
    return (p: Point2) => {
        let nearest = Infinity;
        const lowerBound = (node: CoastNode) => Math.hypot(
            Math.max(node.minX - p.x, 0, p.x - node.maxX), Math.max(node.minZ - p.z, 0, p.z - node.maxZ));
        const visit = (node: CoastNode) => {
            if (lowerBound(node) >= nearest) return;
            if (node.segments) for (const { a, b } of node.segments) {
                const dx = b.x - a.x, dz = b.z - a.z;
                const squared = dx * dx + dz * dz;
                const t = squared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / squared)) : 0;
                nearest = Math.min(nearest, Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz));
            }
            if (node.children) {
                const [a, b] = node.children;
                if (lowerBound(a) <= lowerBound(b)) {
                    visit(a);
                    visit(b);
                } else {
                    visit(b);
                    visit(a);
                }
            }
        };
        visit(root);
        return nearest;
    };
}
