import { wildlifeSighting, type WildlifeSighting } from '../simulation/WildlifeSightings';
import type { SimulationEvent } from '../simulation/SimulationCore';
import type { SoundManifest } from './FjordAudio';
import type { SoundActor } from './SettlementSounds';
import { soundGain, type SoundCamera, type SoundEmitter } from './Soundscape';

interface Encounter {
    event: string;
    sighting: WildlifeSighting;
    expires: number;
}
interface ActiveCall {
    source: SoundEmitter;
    species: string;
    expires: number;
}

/** Reads only newly published encounters. Historical events never become ambient calls. */
export class WildlifeSounds {
    private cursor: number;
    private lastId?: string;
    private pending: Encounter[] = [];
    private calls = new Map<string, ActiveCall>();
    constructor(events: readonly SimulationEvent[], private manifest: SoundManifest) {
        this.cursor = events.length;
        this.lastId = events.at(-1)?.id;
    }

    append(events: readonly SimulationEvent[], context: {
        clanId: string; worldId: string; tick: number; now: number; active: boolean;
    }) {
        const replaced = events.length < this.cursor ||
            this.cursor > 0 && events[this.cursor - 1]?.id !== this.lastId;
        if (!context.active || replaced) this.clear();
        if (context.active && !replaced) {
            // A fast-forward/import must not create an unbounded audio catch-up queue.
            for (let i = Math.max(this.cursor, events.length - 256); i < events.length; i++) {
                const event = events[i], sighting = wildlifeSighting(event);
                if (!sighting || sighting.clanId !== context.clanId || sighting.worldId !== context.worldId ||
                    sighting.occurredAtTick > context.tick || context.tick - sighting.occurredAtTick > 5) continue;
                this.pending.push({ event: event.id, sighting, expires: context.now + 1 });
            }
            this.pending = this.pending.slice(-32);
        }
        this.cursor = events.length;
        this.lastId = events.at(-1)?.id;
    }

    clear() {
        this.pending = [];
        this.calls.clear();
    }

    sample(now: number, camera: SoundCamera, actors: readonly SoundActor[], active: boolean): SoundEmitter[] {
        if (!active) { this.clear(); return []; }
        const observed = new Map(actors.slice(0, 64).filter(actor => actor.kind === 'wildlife' &&
            actor.observable).map(actor => [actor.id, actor]));
        const listener = { ...camera.focus, y: camera.focus.y + 1.7 };
        for (const encounter of this.pending) {
            if (now > encounter.expires) continue;
            const sighting = encounter.sighting;
            const actor = observed.get(sighting.wildlifeInstanceId);
            if (!actor || actor.species !== sighting.speciesId || !['rabbit', 'wolf', 'lynx'].includes(actor.species)) continue;
            // Lynx uses the owner's chosen bobcat placeholder; its conflicting source link remains documented.
            const cue = this.manifest.cues.find(cue => cue.id === actor.species);
            if (!cue) continue;
            const source = { id: 'sighting:' + actor.id, cue: cue.id,
                event: encounter.event, permitted: true, position: actor.position };
            if (!(soundGain(cue, source, listener, camera.distance, false) > 0)) continue;
            const seconds = Math.max(...this.manifest.assets.filter(asset => cue.variants.includes(asset.id))
                .map(asset => asset.seconds));
            this.calls.set(actor.id, { source, species: actor.species, expires: now + seconds + .2 });
        }
        this.pending = [];
        const sources: SoundEmitter[] = [];
        for (const [id, call] of this.calls) {
            const actor = observed.get(id), cue = this.manifest.cues.find(cue => cue.id === call.source.cue);
            const source = { ...call.source, position: actor?.position };
            if (!actor || actor.species !== call.species || now > call.expires || !cue ||
                !(soundGain(cue, source, listener, camera.distance, false) > 0)) this.calls.delete(id);
            else sources.push(source);
        }
        return sources;
    }
}
