import {Vector3} from 'three';
import type {BodySurface, SurfaceAnchor} from './BodyFitAdapter';
import type {BodyCutPlane} from './BodyCoverage';

export interface OpeningLoop {
    points: {point: Vector3; anchor: SurfaceAnchor}[];
    distances: number[];
    length: number;
}

/** Follow real section edges, including non-convex notches that polar sorting skips. */
export function bodyOpeningLoops(surface: BodySurface, plane: BodyCutPlane): OpeningLoop[] {
    const normal = new Vector3(...plane.normal);
    const points: OpeningLoop['points'] = [];
    const edges = new Set<string>();
    const register = (point: Vector3, anchor: SurfaceAnchor) => {
        const existing = points.findIndex(value => value.point.distanceToSquared(point) < 1e-12);
        if (existing >= 0) return existing;
        points.push({point, anchor});
        return points.length - 1;
    };
    for (let triangle = 0; triangle < surface.triangles; triangle++) {
        const ids = surface.indices.slice(triangle * 3, triangle * 3 + 3);
        const matches = ids.map(vertex => plane.regions.includes(surface.regions[vertex]));
        if (!(plane.regionMatch === 'any' ? matches.some(Boolean) : matches.every(Boolean))) continue;
        const corners = ids.map(vertex => new Vector3().fromArray(surface.positions, vertex * 3));
        const distances = corners.map(point => point.dot(normal) + plane.constant);
        const cuts: number[] = [];
        for (let k = 0; k < 3; k++) {
            const next = (k + 1) % 3;
            if ((distances[k] >= 0) === (distances[next] >= 0)) continue;
            const fraction = distances[k] / (distances[k] - distances[next]);
            const barycentric: [number, number, number] = [0, 0, 0];
            barycentric[k] = 1 - fraction;
            barycentric[next] = fraction;
            const point = corners[k].clone().lerp(corners[next], fraction);
            cuts.push(register(point, {triangle, barycentric, offset: [0, 0, 0]}));
        }
        if (cuts.length === 2 && cuts[0] !== cuts[1]) {
            edges.add(cuts.sort((a, b) => a - b).join(','));
        }
    }
    const neighbours = new Map<number, number[]>();
    for (const edge of edges) {
        const [a, b] = edge.split(',').map(Number);
        neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
        neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
    }
    if ([...neighbours.values()].some(values => values.length !== 2)) {
        throw new Error('Body opening section is not a closed manifold loop');
    }
    const unseen = new Set(neighbours.keys());
    const loops: OpeningLoop[] = [];
    while (unseen.size) {
        const first = unseen.values().next().value!;
        const ordered: number[] = [];
        let previous = -1;
        let current = first;
        do {
            ordered.push(current);
            unseen.delete(current);
            const next = neighbours.get(current)!.find(vertex => vertex !== previous)!;
            previous = current;
            current = next;
        } while (current !== first);
        const loop = ordered.map(vertex => points[vertex]);
        const distances = [0];
        for (let k = 0; k < loop.length; k++) {
            distances.push(distances[k] + loop[k].point.distanceTo(loop[(k + 1) % loop.length].point));
        }
        loops.push({points: loop, distances, length: distances.at(-1)!});
    }
    return loops;
}

/** Corners on the shorter boundary arc between two successive garment contacts. */
export function openingArcCorners(loops: OpeningLoop[], a: Vector3, b: Vector3) {
    const project = (loop: OpeningLoop, point: Vector3) => {
        let best = {distance: Infinity, along: 0};
        for (let k = 0; k < loop.points.length; k++) {
            const origin = loop.points[k].point;
            const edge = loop.points[(k + 1) % loop.points.length].point.clone().sub(origin);
            const fraction = Math.max(0, Math.min(1, point.clone().sub(origin).dot(edge) / edge.lengthSq()));
            const distance = origin.clone().addScaledVector(edge, fraction).distanceToSquared(point);
            if (distance < best.distance) {
                best = {distance, along: loop.distances[k] + edge.length() * fraction};
            }
        }
        return best;
    };
    let selected: {loop: OpeningLoop; start: number; end: number; error: number} | undefined;
    for (const loop of loops) {
        const start = project(loop, a);
        const end = project(loop, b);
        const error = start.distance + end.distance;
        if (!selected || error < selected.error) selected = {loop, start: start.along, end: end.along, error};
    }
    if (!selected || selected.error > 1e-10) {
        throw new Error('Garment edge is outside its body opening: '
            + JSON.stringify({a: a.toArray(), b: b.toArray(), error: selected?.error}));
    }
    const {loop, start, end} = selected;
    const forward = (end - start + loop.length) % loop.length;
    const delta = forward <= loop.length / 2 ? forward : forward - loop.length;
    if (Math.abs(delta) < 1e-8) return [];
    return loop.points.map((point, k) => {
        const offset = delta > 0
            ? (loop.distances[k] - start + loop.length) % loop.length
            : -((start - loop.distances[k] + loop.length) % loop.length);
        return {...point, t: offset / delta};
    }).filter(point => point.t > 1e-6 && point.t < 1 - 1e-6
        && point.point.distanceTo(a) > 1e-6 && point.point.distanceTo(b) > 1e-6)
        .sort((a, b) => a.t - b.t);
}
