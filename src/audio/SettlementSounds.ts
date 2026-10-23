import type { SoundEmitter, SoundPoint } from './Soundscape';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

export interface SoundActor {
    id: string;
    kind: 'livestock' | 'wildlife';
    position: SoundPoint;
    observable: boolean;
    species: string;
    sex?: string;
    stage?: string;
    movement?: string;
}
export interface SettlementSoundFrame {
    focus: SoundPoint;
    season: string;
    weather: string | null;
    now: number;
    known(x: number, z: number): boolean;
    visible(x: number, z: number): boolean;
    fire?: { id: string; position: SoundPoint; lit: boolean };
    actors: readonly SoundActor[];
}

/** Presentation inputs only. No campaign state, ledger or canonical RNG access. */
export class SettlementSounds {
    private coastCells = new Map<string, number[]>();
    private wind = new Map<string, number>();
    private previousTime?: number;
    constructor(private geography: Pick<WorldBlueprint, 'waterLevel' | 'coast'>) {
        // Index immutable geography once. Audio never scans the terrain grid.
        geography.coast.forEach(({ a, b }, index) => {
            for (let x = Math.floor(Math.min(a.x, b.x) / 64); x <= Math.floor(Math.max(a.x, b.x) / 64); x++)
                for (let z = Math.floor(Math.min(a.z, b.z) / 64); z <= Math.floor(Math.max(a.z, b.z) / 64); z++) {
                    const key = x + ':' + z, cell = this.coastCells.get(key) ?? [];
                    cell.push(index);
                    this.coastCells.set(key, cell);
                }
        });
    }

    private shoreWeight(frame: SettlementSoundFrame) {
        let nearest = 70;
        const seen = new Set<number>();
        const cellX = Math.floor(frame.focus.x / 64), cellZ = Math.floor(frame.focus.z / 64);
        for (let x = cellX - 2; x <= cellX + 2; x++)
            for (let z = cellZ - 2; z <= cellZ + 2; z++)
                for (const index of this.coastCells.get(x + ':' + z) ?? []) {
                    if (seen.has(index) || seen.size >= 512) continue;
                    seen.add(index);
                    const { a, b } = this.geography.coast[index];
                    const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
                    const t = length ? Math.max(0, Math.min(1,
                        ((frame.focus.x - a.x) * dx + (frame.focus.z - a.z) * dz) / length)) : 0;
                    const px = a.x + t * dx, pz = a.z + t * dz;
                    if (frame.known(px, pz)) nearest = Math.min(nearest,
                        Math.hypot(px - frame.focus.x, pz - frame.focus.z));
                }
        return 1 - nearest / 70;
    }

    project(frame: SettlementSoundFrame): SoundEmitter[] {
        const sources: SoundEmitter[] = [];
        const winter = frame.weather === 'Harsh' || frame.weather === 'Severe' ? 'harsh' : 'normal';
        // Autumn's supplied attribution currently identifies Sea Wave. Keep it out
        // of the wind mix until the source is corrected, rather than relabel a wave.
        const selected = frame.season === 'Winter' ? 'wind-' + winter + '-winter' :
            frame.season === 'Spring' ? 'wind-spring' : frame.season === 'Summer' ? 'wind-summer' : '';
        const blend = this.previousTime === undefined ? 1 :
            1 - Math.exp(-Math.max(0, Math.min(1, frame.now - this.previousTime)) / 1.2);
        this.previousTime = frame.now;
        if (selected && !this.wind.has(selected)) this.wind.set(selected, 0);
        for (const [cue, previous] of this.wind) {
            const weight = previous + ((cue === selected ? 1 : 0) - previous) * blend;
            if (weight < .001) { this.wind.delete(cue); continue; }
            this.wind.set(cue, weight);
            sources.push({ id: cue, cue, permitted: true, weight });
        }
        const shore = this.shoreWeight(frame);
        if (shore > 0) sources.push({ id: 'local-shore', cue: 'sea-waves', permitted: true, weight: shore });
        const visible = (p: SoundPoint) => frame.visible(p.x, p.z);
        if (frame.fire?.lit && visible(frame.fire.position)) sources.push({
            id: frame.fire.id, cue: 'campfire', position: frame.fire.position, permitted: true,
        });
        for (const actor of frame.actors.slice(0, 128)) {
            if (!actor.observable || !visible(actor.position)) continue;
            if (actor.kind === 'wildlife' && actor.species === 'great-black-backed-gull') sources.push({
                id: actor.id, cue: 'gull', position: actor.position, permitted: true,
            });
            // The supplied seal recording is an airborne shore call, not underwater audio.
            if (actor.kind === 'wildlife' && actor.species === 'seal' && actor.movement === 'shore')
                sources.push({ id: actor.id, cue: 'seal', position: actor.position, permitted: true });
            if (actor.kind === 'livestock' && actor.stage === 'Adult') {
                const cue = actor.species === 'cattle' ? (actor.sex === 'female' ? 'cow' : undefined) :
                    ['sheep', 'goat', 'pig'].includes(actor.species) ? actor.species : undefined;
                if (cue) sources.push({ id: actor.id, cue, position: actor.position, permitted: true });
            }
        }
        return sources;
    }
}
