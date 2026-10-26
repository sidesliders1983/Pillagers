import { gatheringOffer, weddingCandidates } from '../simulation/CulturalEvents';
import type { WeddingCandidate } from '../simulation/CulturalEvents';
import type { SimulationEvent, SimulationState } from '../simulation/SimulationCore';
import { eventOrdinal } from '../lore/AttentionHistory';
import type { AttentionRecord } from '../lore/AttentionHistory';

export interface WeddingInvitationMetadata {
    version: 1;
    observedThrough: number;
    pendingSourceIds: string[];
}

/** Presentation decisions are independent of whether their historical notification was read. */
export class WeddingInvitationHistory {
    constructor(private metadata: WeddingInvitationMetadata) {}

    static restore(value: WeddingInvitationMetadata | undefined, state: SimulationState,
        unread: readonly (AttentionRecord & { read: boolean })[] = []): WeddingInvitationHistory {
        if (value === undefined) {
            const unreadIds = new Set(unread.filter(record => !record.read).map(record => record.eventId));
            const pendingSourceIds = unreadIds.size && state.culture ? weddingCandidates(state)
                .filter(candidate => !candidate.celebratedEventId && unreadIds.has(candidate.sourceEventId))
                .map(candidate => candidate.sourceEventId) : [];
            return new WeddingInvitationHistory({ version: 1, observedThrough: state.events.length, pendingSourceIds });
        }
        if (!value || value.version !== 1 || !Number.isSafeInteger(value.observedThrough) ||
            value.observedThrough < 0 || value.observedThrough > state.events.length ||
            !Array.isArray(value.pendingSourceIds) || value.pendingSourceIds.length > value.observedThrough ||
            new Set(value.pendingSourceIds).size !== value.pendingSourceIds.length)
            throw new Error('Invalid wedding invitation presentation state.');
        // Validate against the recorded prefix once at import, including accepted wedding receipts.
        const eligible = new Set(weddingCandidates({ ...state, events: state.events.slice(0, value.observedThrough) })
            .filter(candidate => !candidate.celebratedEventId).map(candidate => candidate.sourceEventId));
        if (value.pendingSourceIds.some(id => typeof id !== 'string' || !eligible.has(id)))
            throw new Error('Invalid wedding invitation source reference.');
        return new WeddingInvitationHistory(structuredClone(value));
    }

    reconcile(state: SimulationState): WeddingCandidate[] {
        if (!state.culture) {
            this.metadata.observedThrough = state.events.length;
            this.metadata.pendingSourceIds = [];
            return [];
        }
        const pending = new Map(this.sourceEvents(state).map(event => [event.id, event]));
        for (let index = this.metadata.observedThrough; index < state.events.length; index++) {
            const event = state.events[index];
            if (event.type === 'PartnershipFormed') {
                const pair = this.pair(event);
                if (!pair || !this.currentSource(state, event)) continue;
                for (const [id, previous] of pending)
                    if (this.pair(previous) === pair) pending.delete(id);
                pending.set(event.id, event);
            } else if (event.type === 'CulturalGatheringHeld' && event.details?.occasion === 'wedding') {
                pending.delete(String(event.details.sourceEventId));
            }
        }
        this.metadata.observedThrough = state.events.length;
        // Only unresolved actual sources enter the canonical offer reader. Resolved history stays
        // behind the cursor, so ordinary refreshes never rebuild an all-history relationship graph.
        if (pending.size === 0) {
            this.metadata.pendingSourceIds = [];
            return [];
        }
        const candidates = weddingCandidates({ ...state, events: [...pending.values()] });
        this.metadata.pendingSourceIds = candidates.map(candidate => candidate.sourceEventId);
        return candidates;
    }

    offer(state: SimulationState, sourceId: string) {
        return gatheringOffer({ ...state, events: this.sourceEvents(state) }, 'wedding', sourceId);
    }
    resolve(sourceId: string): void {
        this.metadata.pendingSourceIds = this.metadata.pendingSourceIds.filter(id => id !== sourceId);
    }
    save(): WeddingInvitationMetadata { return structuredClone(this.metadata); }

    private sourceEvents(state: SimulationState): SimulationEvent[] {
        return this.metadata.pendingSourceIds.flatMap(id => {
            const event = state.events[eventOrdinal(id) - 1];
            return event?.id === id && event.type === 'PartnershipFormed' ? [event] : [];
        });
    }
    private currentSource(state: SimulationState, event: SimulationEvent): boolean {
        // A large catch-up command can append years of sources at once. Keep only current living
        // pairs within the wedding window before constructing the bounded canonical read context.
        const [first, second] = event.details!.participants as string[];
        const a = state.personas[first], b = state.personas[second];
        const elapsed = (state.time.winter - event.time.winter) * state.ticksPerWinter + state.time.tick - event.time.tick;
        return elapsed >= 0 && elapsed < state.ticksPerWinter && !!a && !!b &&
            a.deathWinter === null && b.deathWinter === null && a.partnerId === b.id && b.partnerId === a.id;
    }
    private pair(event: SimulationEvent): string | undefined {
        const ids = event.details?.participants;
        if (Array.isArray(ids) && ids.length === 2 && ids.every(id => typeof id === 'string') && ids[0] !== ids[1])
            return JSON.stringify([...ids].sort());
    }
}
