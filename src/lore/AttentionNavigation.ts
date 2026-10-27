import { wildlifeSighting } from '../simulation/WildlifeSightings';
import { wildlifeSpecies } from '../wildlife/WildlifeSpecies';
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
    if (target.kind === 'surface') return target.id === 'trade' && !state.trade ? null : target;
    if (target.kind === 'wildlife') return state.events[eventOrdinal(target.id) - 1]?.id === target.id && state.events[eventOrdinal(target.id) - 1]?.type === 'WildlifeSighted' ? target : null;
    const mission = state.world?.spatial?.missions[target.id] ?? state.world?.missions[target.id];
    return mission && mission.status !== 'Returned' && state.world?.groups[mission.groupId] &&
        mission.memberIds.some(id => state.personas[id]?.deathWinter === null) ? { kind: 'expedition', id: mission.groupId } : null;
}
export interface AttentionNavigation {
    target: (target: AttentionTarget, record?: AttentionRecord) => void;
    family?: (personaId: string) => void;
    sighting?: (eventId: string) => void;
}


/** An on-click request identifies the recorded actor; present-day availability belongs to the live renderer. */
export function resolveWildlifeFocus(state: Readonly<SimulationState>, eventId: string) {
    const event = state.events[eventOrdinal(eventId) - 1];
    const sighting = event?.id === eventId ? wildlifeSighting(event) : undefined;
    if (!sighting || sighting.clanId !== state.clan.id || sighting.worldId !== state.wildlife?.worldId ||
        sighting.worldId !== state.discovery?.worldId) return;
    return { target: { worldId: sighting.worldId, speciesId: sighting.speciesId,
        wildlifeInstanceId: sighting.wildlifeInstanceId },
        label: wildlifeSpecies.find(species => species.id === sighting.speciesId)!.label };
}
