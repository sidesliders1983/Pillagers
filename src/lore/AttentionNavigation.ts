import type { SimulationState } from '../simulation/SimulationCore';
import { eventOrdinal, type AttentionRecord, type AttentionTarget } from './AttentionHistory';

/** Resolve on click against the current campaign, never trust a stale rendered destination. */
export function resolveAttentionTarget(state: SimulationState, target?: AttentionTarget): AttentionTarget | null {
    if (!target) return null;
    if (target.kind === 'persona') return state.personas[target.id]?.deathWinter === null ? target : null;
    if (target.kind === 'household') return state.households[target.id]?.memberIds.some(id => state.personas[id]?.deathWinter === null) ? target : null;
    if (target.kind === 'building') return state.buildings[target.id] ? target : null;
    if (target.kind === 'livestock') return state.landing?.cattle[target.id]?.deathWinter === null ? target : null;
    if (target.kind === 'site') return state.world?.islandIntel?.sites[target.id] ? target : null;
    if (target.kind === 'surface') return target;
    if (target.kind === 'wildlife') return state.events[eventOrdinal(target.id) - 1]?.id === target.id && state.events[eventOrdinal(target.id) - 1]?.type === 'WildlifeSighted' ? target : null;
    const mission = state.world?.spatial?.missions[target.id] ?? state.world?.missions[target.id];
    return mission && mission.status !== 'Returned' && state.world?.groups[mission.groupId] &&
        mission.memberIds.some(id => state.personas[id]?.deathWinter === null) ? { kind: 'expedition', id: mission.groupId } : null;
}
export interface AttentionNavigation {
    target: (target: AttentionTarget, record?: AttentionRecord) => void;
    family?: (personaId: string) => void;
}
