export type SoundBus = 'ambience' | 'world' | 'interface';
export type SoundPoint = { x: number; y: number; z: number };
export interface SoundCue {
    id: string;
    bus: SoundBus;
    variants: readonly string[];
    gain: number;
    loop: boolean;
    cooldown: readonly [number, number];
    range: number;
    priority: number;
    limit: number;
    pitch: readonly [number, number];
    loopStart?: number;
    loopEnd?: number;
    contactOffset?: number;
}
export interface SoundEmitter {
    id: string;
    cue: string;
    permitted: boolean;
    position?: SoundPoint;
    /** Current action marker only; unchanged markers never replay on refresh. */
    event?: string;
    revision?: number;
    /** Local geography/season blend, independent of canonical rules and bus volume. */
    weight?: number;
}
export interface SoundCamera {
    focus: SoundPoint;
    forward: { x: number; z: number };
    distance: number;
}
export type SoundVoice = { source: SoundEmitter; cue: SoundCue; gain: number; variant: string; pitch: number };
export const soundLimits = { cadence: .2, emitters: 128, beds: 3, local: 8, fading: 2,
    buffers: 32, decodedBytes: 24 * 1024 * 1024, fileBytes: 4 * 1024 * 1024 } as const;
const distance = (a: SoundPoint, b: SoundPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function soundGain(cue: SoundCue, source: SoundEmitter, listener: SoundPoint,
    cameraDistance: number, paused: boolean) {
    if (!source.permitted || (paused && cue.bus === 'world')) return 0;
    if (cue.bus === 'world' && (!source.position || !Object.values(source.position).every(Number.isFinite))) return 0;
    const separation = source.position ? distance(listener, source.position) : 0;
    const fade = cue.bus === 'world' ? Math.max(0, 1 - separation / cue.range) *
        Math.min(1, 40 / Math.max(40, cameraDistance)) : 1;
    const weight = source.weight === undefined ? 1 :
        Number.isFinite(source.weight) ? Math.max(0, Math.min(1, source.weight)) : 0;
    return cue.gain * weight * fade * (paused && cue.bus === 'ambience' ? .4 : 1);
}

/** Presentation-only decisions in real seconds. Never receives a campaign or Core RNG. */
export class Soundscape {
    private cues: Map<string, SoundCue>;
    private next = new Map<string, number>();
    private previous = new Map<string, number>();
    private markers = new Map<string, string>();
    private selected = new Set<string>();
    private loopVariants = new Map<string, { revision: string; variant: string }>();
    private listener?: SoundPoint;
    private last = 0;
    constructor(cues: readonly SoundCue[], private random = Math.random) {
        this.cues = new Map(cues.map(cue => [cue.id, cue]));
    }
    update(now: number, camera: SoundCamera, emitters: readonly SoundEmitter[], paused: boolean) {
        const valid = Object.values(camera.focus).every(Number.isFinite) && Number.isFinite(camera.distance);
        const target = valid ? { ...camera.focus, y: camera.focus.y + 1.7 } : this.listener ?? { x: 0, y: 0, z: 0 };
        const jumped = !!this.listener && distance(this.listener, target) > 48;
        const mix = !this.listener || jumped ? 1 : 1 - Math.exp(-Math.max(0, now - this.last) / .15);
        const position = this.listener ? {
            x: this.listener.x + (target.x - this.listener.x) * mix,
            y: this.listener.y + (target.y - this.listener.y) * mix,
            z: this.listener.z + (target.z - this.listener.z) * mix,
        } : target;
        this.listener = position;
        this.last = now;
        const length = Math.hypot(camera.forward.x, camera.forward.z);
        const forward = length > .001 && Number.isFinite(length) ?
            { x: camera.forward.x / length, z: camera.forward.z / length } : { x: 0, z: -1 };
        const listener = { position, forward, jumped, valid };
        const voices: SoundVoice[] = [];
        const sources = emitters.slice(0, soundLimits.emitters);
        const present = new Set(sources.map(source => source.id));
        for (const id of this.markers.keys()) if (!present.has(id)) this.markers.delete(id);
        for (const id of this.loopVariants.keys()) if (!present.has(id)) this.loopVariants.delete(id);
        const candidates: { source: SoundEmitter; cue: SoundCue; fade: number; score: number }[] = [];
        for (const source of sources) {
            const cue = this.cues.get(source.cue);
            if (!valid || !cue || !source.permitted || (paused && cue.bus === 'world')) continue;
            if (cue.bus === 'world' && !source.position) continue;
            if (source.position && !Object.values(source.position).every(Number.isFinite)) continue;
            const gain = soundGain(cue, source, position, camera.distance, paused);
            const fade = cue.gain > 0 ? gain / cue.gain : 0;
            if (!(fade > 0) || (!cue.loop && now < (this.next.get(cue.id) ?? -Infinity))) continue;
            const marker = `${source.cue}:${source.revision ?? 0}:${source.event}`;
            if (source.event !== undefined && this.markers.get(source.id) === marker) continue;
            candidates.push({ source, cue, fade,
                score: cue.priority + fade + (this.selected.has(source.id) ? .15 : 0) });
        }
        candidates.sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id));
        const families = new Map<string, number>();
        const localBudget = camera.distance > 160 ? 2 : camera.distance > 80 ? 4 : soundLimits.local;
        let beds = 0, local = 0;
        for (const { source, cue, fade } of candidates) {
            const count = families.get(cue.id) ?? 0;
            if (count >= Math.min(4, cue.limit) ||
                (cue.bus === 'ambience' ? beds >= soundLimits.beds : local >= localBudget)) continue;
            if (!cue.loop && now < (this.next.get(cue.id) ?? -Infinity)) continue;
            const last = this.previous.get(cue.id) ?? -1;
            const index = cue.variants.length <= 1 ? 0 :
                (last + 1 + Math.floor(this.random() * (cue.variants.length - 1))) % cue.variants.length;
            const revision = `${cue.id}:${source.revision ?? 0}`;
            const cached = this.loopVariants.get(source.id);
            const variant = (cue.loop && cached?.revision === revision ? cached.variant : undefined) ?? cue.variants[index];
            if (!variant) continue;
            if (!cue.loop) {
                this.previous.set(cue.id, index);
                const interval = cue.cooldown[0] + this.random() * (cue.cooldown[1] - cue.cooldown[0]);
                const density = camera.distance > 160 ? 2 : camera.distance > 80 ? 1.5 : 1;
                this.next.set(cue.id, now + interval * density);
                if (source.event !== undefined)
                    this.markers.set(source.id, `${source.cue}:${source.revision ?? 0}:${source.event}`);
            } else this.loopVariants.set(source.id, { revision, variant });
            families.set(cue.id, count + 1);
            if (cue.bus === 'ambience') beds++;
            else local++;
            voices.push({ source, cue, gain: cue.gain * fade, variant,
                pitch: cue.pitch[0] + this.random() * (cue.pitch[1] - cue.pitch[0]) });
        }
        this.selected = new Set(voices.map(voice => voice.source.id));
        return { listener, voices };
    }
}
