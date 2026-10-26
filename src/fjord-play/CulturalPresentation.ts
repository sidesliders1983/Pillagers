import { gatheringOffer, type SimulationState } from '../simulation/SimulationCore';
import type { LivingWorldController } from './LivingWorldController';

export interface CulturalPresentationFrame {
    id: string;
    sequence: number;
    phase: 'approach' | 'gathering' | 'response' | 'ended';
    phaseElapsedSeconds: number;
    position: { x: number; y: number; z: number };
    stagedParticipants: number;
    participantKeys: string[];
    visible: boolean;
}

/** Transient staging of an accepted fact. Loading history never starts another performance. */
export class CulturalPresentation {
    private seenSequence: number;
    private current?: CulturalPresentationFrame;
    private disposed = false;

    constructor(state: Readonly<SimulationState>, private readonly motion: LivingWorldController,
        private readonly position: { x: number; y: number; z: number }) {
        this.seenSequence = (state.culture?.nextSequence ?? 1) - 1;
    }

    accept(state: Readonly<SimulationState>, limit: 6 | 8, visible: boolean): boolean {
        if (this.disposed || !state.culture || state.culture.nextSequence <= this.seenSequence + 1)
            return false;
        this.seenSequence = state.culture.nextSequence - 1;
        this.finish();
        const event = state.events.find(item => item.id === state.culture!.lastGatheringEventId);
        if (!visible || event?.type !== 'CulturalGatheringHeld' ||
            event.details?.gatheringSequence !== this.seenSequence) return false;
        const available = new Set(gatheringOffer(state).participantIds);
        const ids = (event.details.participants as string[]).filter(id => available.has(id));
        const keys = this.motion.beginGathering(event.id, ids.map(id => 'persona:' + id), limit);
        if (keys.length < 3) { this.motion.releaseGathering(); return false; }
        this.current = { id: event.id, sequence: this.seenSequence, phase: 'approach',
            phaseElapsedSeconds: 0, position: { ...this.position }, stagedParticipants: keys.length,
            participantKeys: keys, visible: true };
        return true;
    }

    advance(seconds: number, running: boolean, visible: boolean) {
        const current = this.current;
        if (!current) return;
        if (!visible) { this.finish(); return; }
        const staged = this.motion.inspectGathering()?.participants.filter(person => !person.dropped) ?? [];
        if (staged.length < 3) { this.finish(); return; }
        const present = current.phase === 'approach' ? staged : staged.filter(person => person.arrived);
        current.participantKeys = present.map(person => person.key);
        current.stagedParticipants = present.length;
        if (!running || !Number.isFinite(seconds) || seconds <= 0) return;
        current.phaseElapsedSeconds += Math.min(seconds, 1);
        if (current.phase === 'approach') {
            const arrived = staged.filter(person => person.arrived);
            // Actual routes can take over a minute. Start with a real small audience;
            // more distant attendees need not hold everyone at their destination.
            if (arrived.length >= 3) {
                current.participantKeys = arrived.map(person => person.key);
                current.stagedParticipants = arrived.length;
                current.phase = 'gathering';
                current.phaseElapsedSeconds = 0;
            } else if (current.phaseElapsedSeconds >= 120) this.finish();
        } else if (current.phase === 'gathering' && current.phaseElapsedSeconds >= 4) {
            current.phase = 'response';
            current.phaseElapsedSeconds = 0;
        } else if (current.phase === 'response' && current.phaseElapsedSeconds >= 3) this.finish();
    }

    inspect(): CulturalPresentationFrame | null {
        return this.current ? structuredClone(this.current) : null;
    }

    private finish() {
        if (this.current) this.motion.releaseGathering();
        this.current = undefined;
    }

    dispose() {
        this.finish();
        this.disposed = true;
    }
}
