import type { SoundEmitter, SoundPoint } from './Soundscape';

export interface WorkSoundActivity {
    id: string;
    position: SoundPoint;
    target: string;
    generation: string;
    loop: number;
    clip: string;
    time: number;
    duration: number;
}

/** Samples current visual phases, never production receipts or missed events. */
export class WorkContacts {
    private previous = new Map<string, { action: string; time: number; now: number; event?: string }>();
    sample(now: number, activities: readonly WorkSoundActivity[], running: boolean) {
        const sources: SoundEmitter[] = [];
        const next = new Map<string, { action: string; time: number; now: number; event?: string }>();
        let fresh = false;
        if (running) for (const activity of activities.slice(0, 32)) {
            if (activity.clip !== 'Attack' || !(activity.duration > 0) ||
                !Number.isFinite(activity.time) || !Object.values(activity.position).every(Number.isFinite)) continue;
            const action = activity.generation + ':' + activity.target + ':' + activity.loop;
            const previous = this.previous.get(activity.id);
            const same = previous?.action === action;
            let event = same ? previous.event : undefined;
            // Source measurement: Human_LOD2 Attack forward hand reach at 37.5%.
            // This is a provisional visual marker, not a new axe collision mechanic.
            const marker = activity.duration * .375;
            if (same && now >= previous.now && now - previous.now <= .25 &&
                previous.time < marker && activity.time >= marker) {
                event = action + ':reach';
                fresh = true;
            }
            next.set(activity.id, { action, time: activity.time, now, event });
            if (event) sources.push({ id: 'work:' + activity.id, cue: 'axe-impact',
                position: activity.position, permitted: true, event });
        }
        const invalidated = [...this.previous].some(([id, previous]) =>
            previous.event !== undefined && previous.event !== next.get(id)?.event);
        this.previous = next;
        return { fresh, invalidated, sources };
    }
}
