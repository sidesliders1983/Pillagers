import { availableCulturalParticipants, type SimulationState } from '../simulation/SimulationCore';
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
    private requiredKeys: string[] = [];
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
        const available = new Set(availableCulturalParticipants(state).map(person => person.id));
        const recorded = event.details.participants as string[];
        const required = event.details.occasion === 'wedding' && Array.isArray(event.details.spouseIds) ?
            event.details.spouseIds.filter((id): id is string => typeof id === 'string') : [];
        if (event.details.occasion === 'wedding' && (required.length !== 2 || new Set(required).size !== 2 ||
            required.some(id => !recorded.includes(id) || !available.has(id)))) return false;
        // Low still stages at most six bodies, but it cannot replace the actual couple with guests.
        const ids = [...required, ...recorded.filter(id => available.has(id) && !required.includes(id))];
        const requiredKeys = required.map(id => 'persona:' + id);
        const keys = this.motion.beginGathering(event.id, ids.map(id => 'persona:' + id), limit);
        if (keys.length < 3 || requiredKeys.some(key => !keys.includes(key))) {
            this.motion.releaseGathering();
            return false;
        }
        this.requiredKeys = requiredKeys;
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
        if (staged.length < 3 || this.requiredKeys.some(key => !staged.some(person => person.key === key))) {
            this.finish();
            return;
        }
        const present = current.phase === 'approach' ? staged : staged.filter(person => person.arrived);
        if (current.phase !== 'approach' && (present.length < 3 ||
            this.requiredKeys.some(key => !present.some(person => person.key === key)))) {
            this.finish();
            return;
        }
        current.participantKeys = present.map(person => person.key);
        current.stagedParticipants = present.length;
        if (!running || !Number.isFinite(seconds) || seconds <= 0) return;
        current.phaseElapsedSeconds += Math.min(seconds, 1);
        if (current.phase === 'approach') {
            const arrived = staged.filter(person => person.arrived);
            // Ordinary guests may still be approaching, but a wedding requires its actual couple.
            if (arrived.length >= 3 && this.requiredKeys.every(key => arrived.some(person => person.key === key))) {
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
        this.requiredKeys = [];
    }

    dispose() {
        this.finish();
        this.disposed = true;
    }
}
