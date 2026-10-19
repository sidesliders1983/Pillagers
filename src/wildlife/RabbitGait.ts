import type { Point2 } from '../world-generation/WorldBlueprint';

export interface RabbitHop {
    phase: number;
    duration: number;
    amplitude: number;
    lift: number;
    active: boolean;
    from: Point2;
    to: Point2;
    startHeading: number;
}

const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};

/** Feet gather before propulsion; most horizontal travel occurs during flight. */
export function rabbitHopProgress(phase: number) {
    return smooth((phase - .18) / .68);
}

export function rabbitHopLift(phase: number) {
    const flight = (phase - .30) / .42;
    return flight > 0 && flight < 1 ? 4 * flight * (1 - flight) : 0;
}

export function rabbitHopDuration(speed: number) {
    return Math.max(.42, Math.min(.7, .7 - (speed - .5) * .20));
}

/** Advance complete bounded strides, finishing each landing before redirecting or resting. */
export function advanceRabbitHop(actor: {
    position: { x: number; y: number; z: number };
    target: Point2 | null;
    heading: number;
    hop?: RabbitHop;
}, delta: number, speed: number, valid: (point: Point2) => boolean) {
    let remaining = delta;
    while (remaining > 1e-9) {
        if (!actor.hop?.active) {
            if (!actor.target) break;
            const dx = actor.target.x - actor.position.x, dz = actor.target.z - actor.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance < .02) { actor.target = null; break; }
            const duration = rabbitHopDuration(speed);
            const length = Math.min(distance, speed * duration);
            const to = { x: actor.position.x + dx / distance * length,
                z: actor.position.z + dz / distance * length };
            if (!valid(to)) { actor.target = null; break; }
            actor.hop = {
                phase: 0, duration, amplitude: speed > 1 ? .085 : .06, lift: 0, active: true,
                from: { x: actor.position.x, z: actor.position.z }, to, startHeading: actor.heading,
            };
        }
        const hop = actor.hop;
        const step = Math.min(remaining, (1 - hop.phase) * hop.duration);
        const phase = Math.min(1, hop.phase + step / hop.duration);
        const progress = rabbitHopProgress(phase);
        const next = { x: hop.from.x + (hop.to.x - hop.from.x) * progress,
            z: hop.from.z + (hop.to.z - hop.from.z) * progress };
        if (!valid(next)) {
            hop.active = false; hop.lift = 0; hop.phase = 0;
            actor.target = null;
            break;
        }
        hop.phase = phase;
        hop.lift = rabbitHopLift(phase) * hop.amplitude;
        actor.position.x = next.x;
        actor.position.z = next.z;
        const desired = Math.atan2(hop.to.x - hop.from.x, hop.to.z - hop.from.z);
        const turn = Math.atan2(Math.sin(desired - hop.startHeading), Math.cos(desired - hop.startHeading));
        actor.heading = hop.startHeading + turn * smooth(phase / .18);
        remaining -= step;
        if (phase < 1 - 1e-9) break;
        hop.active = false;
        hop.lift = 0;
        if (actor.target && Math.hypot(actor.target.x - next.x, actor.target.z - next.z) < .02)
            actor.target = null;
    }
}
