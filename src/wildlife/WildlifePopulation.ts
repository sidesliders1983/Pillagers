import { planWildlifeTerritories } from './WildlifeTerritories';
import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { identitySample } from '../characters/seededRandom';
import { wildlifeSpecies, wildlifeTerritoryGap, type HabitatTag, type WildlifeVariant } from './WildlifeSpecies';
import { WildlifeHabitats } from './WildlifeHabitats';
export interface WildlifeActor {
    id: string;
    species: string;
    variant: WildlifeVariant;
    anchor: Point2;
    position: {
        x: number;
        y: number;
        z: number;
    };
    target: Point2 | null;
    heading: number;
    bank: number;
    state: 'idle' | 'roam' | 'glide' | 'swim' | 'rest' | 'flee' | 'alert';
    habitat: HabitatTag;
    phase: number;
    orbitRadius: number;
    speed: number;
    wait: number;
    decisions: number;
    fleeUntil: number;
    escapeWait: number;
    climbRate: number;
    flapEffort: number;
}
/** Small ambient population; no mutations to world generation, campaign state or simulation entropy. */
export class WildlifePopulation {
    readonly habitats: WildlifeHabitats;
    readonly actors: WildlifeActor[] = [];
    readonly diagnostics: string[] = [];
    time = 0;
    private humans: readonly Point2[] = [];
    constructor(readonly world: WorldBlueprint) {
        this.habitats = new WildlifeHabitats(world);
        const available = new Map(wildlifeSpecies.flatMap(species => species.variants.map(variant => [variant,
            this.habitats.candidates.filter(point => this.habitats.valid(point, variant)
                && (species.group !== 'solo' || [world.settlement.center, ...(world.rivalSite ? [world.rivalSite.center] : [])].every(center => Math.hypot(point.x - center.x, point.z - center.z) >= variant.avoidSettlement + variant.radius)))] as const)));
        const territories = planWildlifeTerritories(world, available, wildlifeSpecies.filter(species => species.group === 'solo').map(species => species.variants[0]));
        // Reserve scarce inland habitats first. Coastal gulls retain their harbour reference.
        const ordered = [...wildlifeSpecies].sort((a, b) => a.group === 'solo' && b.group === 'solo'
            ? available.get(a.variants[0])!.length - available.get(b.variants[0])!.length
            : a.group === 'solo' ? -1 : b.group === 'solo' ? 1 : 0);
        for (const species of ordered) {
            let group: Point2 | undefined;
            const habitats = new Map(species.variants.map(variant => [variant.id,
                available.get(variant)!]));
            for (const variant of species.variants) {
                const candidates = (species.group === 'solo' ? territories.has(variant) ? [territories.get(variant)!] : [] : habitats.get(variant.id)!).filter(point => !group || species.group === 'solo'
                    || Math.hypot(point.x - group.x, point.z - group.z) <= (species.groupRadius ?? 24));
                const reference = group ?? world.settlement.harbor ?? world.settlement.center;
                const solo = species.group === 'solo';
                candidates.sort((a, b) => Math.hypot(a.x - reference.x, a.z - reference.z)
                    - Math.hypot(b.x - reference.x, b.z - reference.z));
                for (let i = 0; i < variant.count; i++) {
                    const id = species.id + ':' + variant.id + ':' + i;
                    const random = (key: string) => identitySample(world.config.seed, 'wildlife.' + id + '.' + key);
                    let chosen: Point2 | undefined;
                    const limit = solo ? candidates.length : Math.min(candidates.length, variant.movement === 'air' ? 100 : 48);
                    const start = solo ? 0 : Math.floor(random('spawn') * limit);
                    for (let attempt = 0; attempt < limit; attempt++) {
                        const point = candidates[(start + attempt) % limit];
                        if (solo && this.actors.some(other => other.variant.movement === 'ground' &&
                            Math.hypot(point.x - other.anchor.x, point.z - other.anchor.z)
                                < variant.radius + other.variant.radius + wildlifeTerritoryGap))
                            continue;
                        if (solo && [world.settlement.center, ...(world.rivalSite ? [world.rivalSite.center] : [])].some(center => Math.hypot(point.x - center.x, point.z - center.z) < variant.avoidSettlement + variant.radius))
                            continue;
                        // A mixed land/water group needs a shared coastal anchor with room on both sides.
                        if (!group && species.group !== 'solo' && species.variants.some(member => !habitats.get(member.id)!.some(candidate => Math.hypot(candidate.x - point.x, candidate.z - point.z)
                            <= (species.groupRadius ?? 24))))
                            continue;
                        if (this.actors.some(other => Math.hypot(point.x - other.position.x, point.z - other.position.z)
                            < variant.clearance + other.variant.clearance + .35))
                            continue;
                        if (group && species.group !== 'solo' && variant.movement !== 'air'
                            && Math.hypot(point.x - group.x, point.z - group.z) > (species.groupRadius ?? 24))
                            continue;
                        if (variant.movement === 'air') {
                            const radius = variant.radius * (.75 + random('radius') * .4);
                            if (Array.from({ length: 32 }, (_, sample) => sample * Math.PI / 16).some(angle => !this.habitats.inBounds({ x: point.x + Math.sin(angle) * radius,
                                z: point.z + Math.cos(angle) * radius }, 3)))
                                continue;
                        }
                        chosen = point;
                        break;
                    }
                    if (!chosen) {
                        this.diagnostics.push(id + ': no valid habitat; no forced fallback');
                        continue;
                    }
                    group ??= chosen;
                    const habitat = this.habitats.sample(chosen.x, chosen.z).tags.find(tag => variant.habitats.includes(tag))!;
                    this.actors.push({ id, species: species.id, variant, anchor: { x: chosen.x, z: chosen.z },
                        position: { x: chosen.x, y: this.habitats.surface.surfaceHeightAt(chosen.x, chosen.z), z: chosen.z },
                        target: null, heading: random('heading') * Math.PI * 2, bank: 0,
                        state: variant.movement === 'air' ? 'glide' : variant.movement === 'water' ? 'swim' : 'idle',
                        habitat, phase: random('phase') * Math.PI * 2,
                        orbitRadius: variant.radius * (.75 + random('radius') * .4),
                        speed: variant.speed * (.8 + random('speed') * .4),
                        wait: 1 + random('wait') * 6, decisions: 0, fleeUntil: 0, escapeWait: 0, climbRate: 0, flapEffort: 0 });
                }
            }
        }
        this.advance(0, true);
    }
    setHumans(positions: readonly Point2[]) {
        this.humans = positions.filter(point => Number.isFinite(point.x) && Number.isFinite(point.z));
    }
    private threat(actor: WildlifeActor) {
        const range = actor.variant.shyDistance;
        if (!range)
            return undefined;
        let nearest: Point2 | undefined, distance = range;
        for (const human of this.humans) {
            const gap = Math.hypot(actor.position.x - human.x, actor.position.z - human.z);
            if (gap < distance) {
                nearest = human;
                distance = gap;
            }
        }
        return nearest;
    }
    private escape(actor: WildlifeActor, human: Point2) {
        const away = Math.atan2(actor.position.x - human.x, actor.position.z - human.z);
        for (const distance of [8, 4, 2, 1])
            for (const offset of [0, -.4, .4, -.8, .8, -1.25, 1.25]) {
                const target = { x: actor.position.x + Math.sin(away + offset) * distance,
                    z: actor.position.z + Math.cos(away + offset) * distance };
                if (Math.hypot(target.x - actor.anchor.x, target.z - actor.anchor.z) > actor.variant.radius)
                    continue;
                if (!this.habitats.segmentValid(actor.position, target, actor.variant))
                    continue;
                return target;
            }
        return null;
    }
    private random(actor: WildlifeActor, key: string) {
        return identitySample(this.world.config.seed, 'wildlife.' + actor.id + '.' + actor.decisions + '.' + key);
    }
    advance(delta: number, running: boolean) {
        if (!Number.isFinite(delta) || delta < 0 || delta > 1)
            throw new RangeError('Wildlife delta must be between 0 and 1 second.');
        if (!running)
            return;
        this.time += delta;
        for (const actor of this.actors) {
            const v = actor.variant;
            if (v.movement === 'air') {
                const previousHeight = actor.position.y;
                const angle = actor.phase + this.time * actor.speed / actor.orbitRadius;
                actor.position.x = actor.anchor.x + Math.sin(angle) * actor.orbitRadius;
                actor.position.z = actor.anchor.z + Math.cos(angle) * actor.orbitRadius * .8;
                let ground = this.world.waterLevel;
                for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    ground = Math.max(ground, this.habitats.surface.surfaceHeightAt(actor.position.x + dx * v.clearance, actor.position.z + dz * v.clearance));
                }
                const range = v.flightHeight!;
                const height = range[0] + (range[1] - range[0]) * this.random(actor, 'altitude');
                actor.position.y = ground + Math.max(12, height + (3 + this.random(actor, 'vertical') * 5)
                    * Math.sin(this.time * .15 + actor.phase));
                actor.climbRate = delta > 0 ? (actor.position.y - previousHeight) / delta : 0;
                const effort = Math.max(0, Math.min(1, (actor.climbRate - .08) / .5));
                actor.flapEffort += (effort - actor.flapEffort) * Math.min(1, delta * 4);
                actor.heading = Math.atan2(Math.cos(angle), -Math.sin(angle) * .8);
                actor.bank = -.12 - .04 * Math.sin(angle);
                continue;
            }
            const validHere = this.habitats.valid(actor.position, v);
            if (!validHere) {
                actor.state = 'rest';
                actor.target = null;
                continue;
            }
            const human = this.threat(actor);
            actor.escapeWait -= delta;
            if (human) {
                const startled = actor.fleeUntil <= this.time;
                actor.fleeUntil = this.time + 6;
                if (startled || actor.escapeWait <= 0) {
                    actor.target = this.escape(actor, human);
                    actor.escapeWait = .8;
                }
                actor.state = actor.target ? 'flee' : 'alert';
            }
            const fleeing = this.time < actor.fleeUntil;
            if (fleeing && !actor.target) {
                actor.wait = 8;
                actor.state = 'alert';
            }
            actor.wait -= delta;
            if (!fleeing && !actor.target && actor.wait <= 0 && actor.speed > 0) {
                actor.decisions++;
                for (let attempt = 0; attempt < 20; attempt++) {
                    const angle = this.random(actor, 'angle' + attempt) * Math.PI * 2;
                    const distance = 2 + this.random(actor, 'distance' + attempt) * Math.min(9, v.radius * .6);
                    const target = { x: actor.position.x + Math.sin(angle) * distance,
                        z: actor.position.z + Math.cos(angle) * distance };
                    if (Math.hypot(target.x - actor.anchor.x, target.z - actor.anchor.z) > v.radius)
                        continue;
                    if (!this.habitats.segmentValid(actor.position, target, v))
                        continue;
                    actor.target = target;
                    break;
                }
                actor.wait = 3 + this.random(actor, 'rest') * 9;
            }
            if (actor.target) {
                const dx = actor.target.x - actor.position.x, dz = actor.target.z - actor.position.z;
                const distance = Math.hypot(dx, dz), step = Math.min(distance, (fleeing ? v.fleeSpeed ?? actor.speed * 2.5 : actor.speed) * delta);
                const next = { x: actor.position.x + dx / (distance || 1) * step,
                    z: actor.position.z + dz / (distance || 1) * step };
                if (this.habitats.valid(next, v)) {
                    actor.position.x = next.x;
                    actor.position.z = next.z;
                    const desired = Math.atan2(dx, dz);
                    const difference = Math.atan2(Math.sin(desired - actor.heading), Math.cos(desired - actor.heading));
                    actor.heading += difference * Math.min(1, delta * 4);
                    actor.state = fleeing ? 'flee' : v.movement === 'water' ? 'swim' : 'roam';
                }
                else
                    actor.target = null;
                if (distance < .02)
                    actor.target = null;
            }
            else
                actor.state = fleeing ? 'alert' : v.movement === 'water' ? 'swim' : 'idle';
            actor.position.y = v.movement === 'water' ? this.world.waterLevel
                : this.habitats.surface.surfaceHeightAt(actor.position.x, actor.position.z);
        }
    }
    inspect() {
        return this.actors.map(actor => ({ id: actor.id, species: actor.species, variant: actor.variant.id,
            movement: actor.variant.movement, habitat: actor.habitat, state: actor.state,
            position: { ...actor.position }, anchor: { ...actor.anchor }, radius: actor.variant.radius,
            heading: actor.heading, climbRate: actor.climbRate, wingEffort: actor.flapEffort,
            shyDistance: actor.variant.shyDistance ?? null,
            flightHeight: actor.variant.flightHeight ?? null }));
    }
}
