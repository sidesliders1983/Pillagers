import type { SimulationState } from './SimulationCore';
import { inspectLivestock } from './Livestock';
import { livestockBreedingAge } from './LivestockBreeding';
import type { livestockIdentity } from './LivestockNames';

/** Returned receipts only. This projection never inspects a rival inventory. */
export function inspectIslandMissionLivestock(state: SimulationState, missionId: string) {
    const task = state.world?.spatial?.missions[missionId]?.task;
    if (task?.type !== 'Pillage' || !task.result) return [];
    const event = state.events.find(event => event.type === 'ExpeditionReturned' &&
        event.details?.missionId === missionId);
    const facts = event?.details?.livestock as { version?: number;
        animals?: ReturnType<typeof livestockIdentity>[] } | undefined;
    return task.result.cattleIds.map(id => {
        const animal = state.landing?.cattle[id];
        const recorded = facts?.version === 1 && Array.isArray(facts.animals) ?
            facts.animals.find(record => record.id === id) : undefined;
        return { id, returnedAt: event ? { ...event.time } : null, sourceEventId: event?.id ?? null,
            atReturn: recorded ? structuredClone(recorded) : null,
            current: animal ? { ...inspectLivestock(state, id),
                breedingAge: animal.deathWinter !== null ? 'deceased' as const : livestockBreedingAge(state, animal) } : null,
            inspectable: !!animal || !!state.landing?.cattleArchive?.[id] };
    });
}
