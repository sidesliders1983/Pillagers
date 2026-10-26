import type { SoundEmitter, SoundPoint } from './Soundscape';

export type CulturalSoundPhase = 'approach' | 'gathering' | 'response' | 'ended';
export interface CulturalSoundPresentation {
    id: string;
    sequence?: number;
    phase: CulturalSoundPhase;
    phaseElapsedSeconds: number;
    position: SoundPoint;
    visible: boolean;
    stagedParticipants: number;
}
export interface CulturalSoundFrame {
    presentation?: CulturalSoundPresentation;
    running: boolean;
    hidden: boolean;
    sampleRate: number | null;
    ready(cueId: string): boolean;
}

/** Presents an explicitly accepted current gathering; it never reads Core history. */
export class CulturalSounds {
    private acceptedId?: string;
    private phases = new Set<CulturalSoundPhase>();
    private source?: SoundEmitter;
    constructor(private lastSequence = 0) {}

    start(event: { id: string; sequence: number }): boolean {
        if (!event.id || !Number.isSafeInteger(event.sequence) || event.sequence <= this.lastSequence) return false;
        this.lastSequence = event.sequence;
        this.acceptedId = event.id;
        this.phases.clear();
        return true;
    }

    clear(): void {
        this.acceptedId = undefined;
        this.phases.clear();
    }

    sample(frame: CulturalSoundFrame) {
        const previous = this.source;
        this.source = undefined;
        const prepareCueIds: string[] = [];
        const presentation = frame.presentation;
        if (!presentation || presentation.id !== this.acceptedId)
            return { sources: [], prepareCueIds, fresh: false, invalidated: !!previous };
        const available = presentation.visible &&
            Number.isSafeInteger(presentation.stagedParticipants) && presentation.stagedParticipants > 0 &&
            frame.running && !frame.hidden && frame.sampleRate !== null &&
            Number.isFinite(frame.sampleRate) && frame.sampleRate > 0 &&
            Object.values(presentation.position).every(Number.isFinite);
        if (available && presentation.phase === 'approach') {
            for (const cue of ['culture-murmur', 'culture-applause'])
                if (!frame.ready(cue)) prepareCueIds.push(cue);
        }
        const cue = presentation.phase === 'gathering' ? 'culture-murmur' :
            presentation.phase === 'response' ? 'culture-applause' : undefined;
        if (cue) {
            const first = !this.phases.has(presentation.phase);
            this.phases.add(presentation.phase);
            const event = presentation.id + ':' + presentation.phase;
            const timely = Number.isFinite(presentation.phaseElapsedSeconds) &&
                presentation.phaseElapsedSeconds >= 0 && presentation.phaseElapsedSeconds <= .5;
            if (available && frame.ready(cue) && ((first && timely) || previous?.event === event)) {
                this.source = { id: 'culture:' + presentation.id, cue, permitted: true,
                    position: { ...presentation.position }, event };
            }
        }
        const fresh = !!this.source && this.source.event !== previous?.event;
        const invalidated = !!previous && previous.event !== this.source?.event;
        return { sources: this.source ? [this.source] : [], prepareCueIds, fresh, invalidated };
    }
}
