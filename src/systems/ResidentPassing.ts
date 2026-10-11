import { residentMovementConfig } from './SocialEncounters';
type Point = { x: number; z: number };
type Config = typeof residentMovementConfig;

/** Existing Fjordside pair-wide passing geometry; callers retain their terrain authority. */
export function passConversation(position: Point, target: Point,
    pairs: readonly { a: Point; b: Point; clearance?: number }[], config: Config,
    clear: (points: Point[]) => boolean): Point[] | null {
    const dx = target.x - position.x, dz = target.z - position.z, length = Math.hypot(dx, dz);
    if (length < .15) return null;
    const ux = dx / length, uz = dz / length;
    for (const pair of pairs) {
        const cx = (pair.a.x + pair.b.x) / 2, cz = (pair.a.z + pair.b.z) / 2;
        const radius = Math.hypot(pair.a.x - pair.b.x, pair.a.z - pair.b.z) / 2 +
            (pair.clearance ?? 2 * config.radius) + .2;
        const along = (cx - position.x) * ux + (cz - position.z) * uz;
        const cross = (cx - position.x) * uz - (cz - position.z) * ux;
        if (along < 0 || along > Math.min(length, 3) || Math.abs(cross) > radius) continue;
        const preferred = cross > 0 ? -1 : 1;
        for (const side of [preferred, -preferred]) {
            const nx = uz * side, nz = -ux * side;
            const points = [
                { x: cx + nx * radius - ux * .5, z: cz + nz * radius - uz * .5 },
                { x: cx + nx * radius + ux * radius, z: cz + nz * radius + uz * radius },
            ];
            if (clear(points)) return points;
        }
    }
    return null;
}

/** Original committed neighbour pass and rear escape, shared instead of copied into gameplay. */
export function passNeighbours(position: Point, target: Point,
    neighbours: readonly (Point & { radius: number; encounterEligible: boolean })[], config: Config,
    clearRoute: (points: Point[]) => boolean, clearStep: (point: Point) => boolean): Point[] | null {
    const dx = target.x - position.x, dz = target.z - position.z, distance = Math.hypot(dx, dz);
    if (distance < .15) return null;
    const forwardX = dx / distance, forwardZ = dz / distance;
    let needsPass = false, clearance = 2 * config.radius + .2;
    for (const neighbour of neighbours) {
        if (neighbour.encounterEligible) continue;
        const bodyClearance = config.radius + neighbour.radius + .2;
        const lookAhead = bodyClearance + config.speed * config.predictionSeconds;
        // Short waypoints can end inside a neighbour's body. Look past the waypoint
        // by its clearance so both straight destinations and waypoint routes can pass.
        const along = (neighbour.x - position.x) * forwardX + (neighbour.z - position.z) * forwardZ;
        const cross = (neighbour.x - position.x) * forwardZ - (neighbour.z - position.z) * forwardX;
        if (along <= 0 || along > Math.min(distance + bodyClearance, lookAhead) || Math.abs(cross) >= bodyClearance)
            continue;
        needsPass = true;
        clearance = bodyClearance;
        const preferred = cross > 0 ? -1 : 1;
        for (const side of [preferred, -preferred]) {
            const lateralX = forwardZ * side * clearance, lateralZ = -forwardX * side * clearance;
            const points = [
                { x: neighbour.x + lateralX - forwardX * clearance,
                    z: neighbour.z + lateralZ - forwardZ * clearance },
                { x: neighbour.x + lateralX + forwardX * clearance,
                    z: neighbour.z + lateralZ + forwardZ * clearance },
            ];
            if (clearRoute(points) && clearStep(points[0])) return points;
        }
    }
    if (!needsPass) return null;
    const angle = Math.atan2(dx, dz);
    for (const offset of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4,
        -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4, Math.PI]) {
        const exit = { x: position.x + Math.sin(angle + offset) * clearance,
            z: position.z + Math.cos(angle + offset) * clearance };
        if (clearRoute([exit]) && clearStep(exit)) return [exit];
    }
    return null;
}
