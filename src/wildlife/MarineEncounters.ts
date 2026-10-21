import { identitySample } from '../characters/seededRandom';
import type { Point2 } from '../world-generation/WorldBlueprint';
import type { WildlifeActor } from './WildlifePopulation';
import type { WildlifeHabitats } from './WildlifeHabitats';
import type { WildlifeVariant } from './WildlifeSpecies';

export interface MarineRoute {
    from: Point2;
    to: Point2;
    length: number;
    minimumDepth: number;
}
export interface MarineMotion {
    elapsed: number;
    cooldown: number;
    cycle: number;
    routeIndex: number;
    special: boolean;
}
export const marineStages = ['approach', 'surface', 'dive', 'submerged', 'surface', 'dive', 'exit'] as const;
const whaleDurations = [14, 28, 14, 14, 20, 14, 16];
const orcaDurations = [10, 24, 8, 12, 20, 8, 10];
const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};
const pulse = (value: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, value)));
const durations = (variant: WildlifeVariant) => variant.asset === 'orca' ? orcaDurations : whaleDurations;
export const marineDuration = (variant: WildlifeVariant) => durations(variant).reduce((sum, n) => sum + n, 0);

/** A bounded list of straight, fully checked sea corridors, connected to the map edge.
 * No enclosed lake can qualify, and no route search occurs during an encounter. */
export function planMarineRoutes(habitats: WildlifeHabitats, variant: WildlifeVariant): MarineRoute[] {
    const bounds = habitats.world.terrain.bounds;
    const margin = variant.clearance + 2;
    const starts = habitats.candidates.filter(point =>
        Math.min(point.x - bounds.minX, bounds.maxX - point.x,
            point.z - bounds.minZ, bounds.maxZ - point.z) <= margin + 12
        && habitats.valid(point, variant));
    const random = (key: string) => identitySample(habitats.world.config.seed, 'wildlife.marine.route.' + variant.asset + key);
    starts.sort((a, b) => a.coastDistance + random(a.x + ':' + a.z) * 24
        - b.coastDistance - random(b.x + ':' + b.z) * 24);
    const routes: MarineRoute[] = [];
    const length = marineDuration(variant) * variant.speed;
    for (const start of starts.slice(0, 48)) {
        for (let direction = 0; direction < 16; direction++) {
            const angle = direction * Math.PI / 8;
            const to = { x: start.x + Math.sin(angle) * length, z: start.z + Math.cos(angle) * length };
            if (!habitats.inBounds(to, margin)) continue;
            let minimumDepth = Infinity;
            let valid = true;
            // Two-metre samples plus a body-length clearance envelope at every sample.
            for (let distance = 0; distance <= length; distance += 2) {
                const fraction = distance / length;
                const point = { x: start.x + (to.x - start.x) * fraction,
                    z: start.z + (to.z - start.z) * fraction };
                if (!habitats.valid(point, variant)) { valid = false; break; }
                minimumDepth = Math.min(minimumDepth,
                    habitats.world.waterLevel - habitats.surface.surfaceHeightAt(point.x, point.z));
            }
            if (!valid || !habitats.valid(to, variant)) continue;
            routes.push({ from: { x: start.x, z: start.z }, to, length, minimumDepth });
            if (routes.length >= 24) break;
        }
        if (routes.length >= 24) break;
    }
    const coast = (route: MarineRoute) => habitats.coastDistance({
        x: (route.from.x + route.to.x) * .5, z: (route.from.z + route.to.z) * .5,
    });
    // Prefer a coastal passage where it is deep enough, while retaining several seeded routes.
    return routes.sort((a, b) => coast(a) - coast(b)).slice(0, 6);
}

export function initialMarineMotion(seed: number, id: string, variant: WildlifeVariant): MarineMotion {
    const range = variant.encounter!.initialDelay;
    return { elapsed: 0, cycle: 0, routeIndex: 0, special: false,
        cooldown: range[0] + (range[1] - range[0]) * identitySample(seed, 'wildlife.' + id + '.arrival') };
}

export function marineStage(variant: WildlifeVariant, elapsed: number) {
    const times = durations(variant);
    let start = 0;
    for (let index = 0; index < times.length; index++) {
        if (elapsed < start + times[index]) return { index, start, duration: times[index],
            progress: (elapsed - start) / times[index], state: marineStages[index] };
        start += times[index];
    }
    return { index: 6, start, duration: times[6], progress: 1, state: 'exit' as const };
}

/** Pure presentation pose, also used to gate physical sightings below the surface. */
export function marinePose(actor: WildlifeActor) {
    const motion = actor.marine!;
    const orca = actor.variant.asset === 'orca';
    const hidden = orca ? -2.4 : -3.3;
    const cruise = orca ? -.45 : -1.15;
    if (actor.state === 'absent') return { offset: hidden, pitch: 0, tail: 0,
        visible: false, spout: 0, blowAge: -1, splash: 0, wake: 0 };
    const stage = marineStage(actor.variant, motion.elapsed);
    let offset = hidden, pitch = 0, tail = 0, spout = 0, blowAge = -1, splash = 0, wake = 0;
    if (stage.state === 'surface') {
        const rise = smooth((motion.elapsed - stage.start) / 6);
        offset = hidden + (cruise - hidden) * rise;
        pitch = -.07 * Math.sin(Math.PI * rise);
        wake = rise;
        if (!orca && stage.index === 1) {
            const age = (motion.elapsed - stage.start - 7) / 2.5;
            if (age >= 0 && age <= 1) {
                blowAge = age;
                spout = smooth(age / .12) * (1 - smooth((age - .25) / .75));
            }
        }
        else if (orca && motion.special && stage.index === 4) {
            const rise = pulse((motion.elapsed - stage.start - 8) / 6);
            pitch -= rise * .4;
            offset += rise * .45;
        }
    } else if (stage.state === 'dive') {
        const dive = smooth(stage.progress);
        offset = cruise + (hidden - cruise) * dive;
        pitch = .14 * Math.sin(Math.PI * stage.progress);
        wake = 1 - dive;
        if (!orca) {
            // Rise, briefly show the fluke, then lower it faster into the water.
            const fluke = smooth(stage.progress / .45) * (1 - smooth((stage.progress - .55) / .35));
            tail = fluke * (motion.special ? .8 : .1);
            if (motion.special) splash = pulse((stage.progress - .73) / .24);
        }
    }
    const top = orca ? 1.8 + Math.max(0, -pitch) * 3.5 : 1.4 + tail * 4;
    return { offset, pitch, tail, spout, blowAge, splash, wake, visible: offset + top > .05 };
}

/** Same actor slots and canonical clock as all other wildlife. Camera never enters this decision. */
export function advanceMarine(actor: WildlifeActor, delta: number, seed: number,
    routes: readonly MarineRoute[], habitats: WildlifeHabitats) {
    const motion = actor.marine!;
    const random = (key: string) => identitySample(seed, 'wildlife.' + actor.id + '.' + motion.cycle + '.' + key);
    if (actor.state === 'absent') {
        motion.cooldown -= delta;
        if (motion.cooldown > 0) return;
        // Any repositioning occurs wholly submerged, before the approach starts at the edge.
        motion.routeIndex = Math.floor(random('route') * routes.length);
        motion.special = random('special') < (actor.variant.asset === 'orca' ? .25 : .12);
        motion.elapsed = -motion.cooldown;
        motion.cooldown = 0;
        actor.state = 'approach';
    } else motion.elapsed += delta;
    if (motion.elapsed >= marineDuration(actor.variant)) {
        actor.state = 'absent';
        motion.cycle++;
        const range = actor.variant.encounter!.cooldown;
        motion.cooldown = range[0] + (range[1] - range[0]) * random('cooldown');
        motion.elapsed = 0;
        return;
    }
    const route = routes[motion.routeIndex];
    const fraction = motion.elapsed * actor.speed / route.length;
    actor.position.x = route.from.x + (route.to.x - route.from.x) * fraction;
    actor.position.z = route.from.z + (route.to.z - route.from.z) * fraction;
    actor.heading = Math.atan2(route.to.x - route.from.x, route.to.z - route.from.z);
    actor.state = marineStage(actor.variant, motion.elapsed).state;
    actor.position.y = habitats.world.waterLevel + marinePose(actor).offset;
}

export function wildlifeObservable(actor: WildlifeActor) {
    return !actor.marine || marinePose(actor).visible;
}
