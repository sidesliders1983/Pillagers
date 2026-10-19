import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { identitySample } from '../characters/seededRandom';
import { wildlifeSpecies, type HabitatTag, type WildlifeVariant } from './WildlifeSpecies';
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
    state: 'idle' | 'roam' | 'glide' | 'swim' | 'rest';
    habitat: HabitatTag;
    phase: number;
    orbitRadius: number;
    speed: number;
    wait: number;
    decisions: number;
}
/** Small ambient population; no mutations to world generation, campaign state or simulation entropy. */
export class WildlifePopulation {
    readonly habitats: WildlifeHabitats;
    readonly actors: WildlifeActor[] = [];
    readonly diagnostics: string[] = [];
    time = 0;
    constructor(readonly world: WorldBlueprint) {
        this.habitats = new WildlifeHabitats(world);
        for (const species of wildlifeSpecies) {
            let group: Point2 | undefined;
            const habitats = new Map(species.variants.map(variant => [variant.id,
                this.habitats.candidates.filter(point => this.habitats.valid(point, variant))]));
            for (const variant of species.variants) {
                const candidates = habitats.get(variant.id)!.filter(point => !group || species.group === 'solo'
                    || Math.hypot(point.x - group.x, point.z - group.z) <= (species.groupRadius ?? 24));
                const reference = group ?? world.settlement.harbor ?? world.settlement.center;
                candidates.sort((a, b) => Math.hypot(a.x - reference.x, a.z - reference.z)
                    - Math.hypot(b.x - reference.x, b.z - reference.z));
                for (let i = 0; i < variant.count; i++) {
                    const id = species.id + ':' + variant.id + ':' + i;
                    const random = (key: string) => identitySample(world.config.seed, 'wildlife.' + id + '.' + key);
                    let chosen: Point2 | undefined;
                    const limit = Math.min(candidates.length, variant.movement === 'air' ? 100 : 48);
                    const start = Math.floor(random('spawn') * limit);
                    for (let attempt = 0; attempt < limit; attempt++) {
                        const point = candidates[(start + attempt) % limit];
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
                        wait: 1 + random('wait') * 6, decisions: 0 });
                }
            }
        }
        this.advance(0, true);
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
            actor.wait -= delta;
            if (!actor.target && actor.wait <= 0 && actor.speed > 0) {
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
                const distance = Math.hypot(dx, dz), step = Math.min(distance, actor.speed * delta);
                const next = { x: actor.position.x + dx / (distance || 1) * step,
                    z: actor.position.z + dz / (distance || 1) * step };
                if (this.habitats.valid(next, v)) {
                    actor.position.x = next.x;
                    actor.position.z = next.z;
                    const desired = Math.atan2(dx, dz);
                    const difference = Math.atan2(Math.sin(desired - actor.heading), Math.cos(desired - actor.heading));
                    actor.heading += difference * Math.min(1, delta * 4);
                    actor.state = v.movement === 'water' ? 'swim' : 'roam';
                }
                else
                    actor.target = null;
                if (distance < .02)
                    actor.target = null;
            }
            else
                actor.state = v.movement === 'water' ? 'swim' : 'idle';
            actor.position.y = v.movement === 'water' ? this.world.waterLevel
                : this.habitats.surface.surfaceHeightAt(actor.position.x, actor.position.z);
        }
    }
    inspect() {
        return this.actors.map(actor => ({ id: actor.id, species: actor.species, variant: actor.variant.id,
            movement: actor.variant.movement, habitat: actor.habitat, state: actor.state,
            position: { ...actor.position }, anchor: { ...actor.anchor }, radius: actor.variant.radius,
            heading: actor.heading, flightHeight: actor.variant.flightHeight ?? null }));
    }
}
