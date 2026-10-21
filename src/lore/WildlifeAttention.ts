import type { AttentionAdapter } from './AttentionHistory';
import { createAttentionMetadata, attentionRead, type AttentionMetadata } from './AttentionState';
import { wildlifeSighting } from '../simulation/WildlifeSightings';
import { wildlifeNoun, wildlifeSightingText } from './WildlifeHistory';
import type { SimulationState } from '../simulation/SimulationCore';
import type { AttentionRecord } from './AttentionHistory';

/** First discoveries join #216; subsequent encounters remain factual Chronicle entries. */
export const wildlifeAttentionAdapter: AttentionAdapter = event => {
    const sighting = wildlifeSighting(event), headline = wildlifeSightingText(event);
    if (!sighting || !headline) return null;
    return { eventId: event.id, canonicalType: event.type, category: 'discovery',
        severity: sighting.firstForClan ? 'noteworthy' : 'ambient', time: { ...event.time },
        actorIds: [...sighting.witnessPersonaIds], headline,
        shortText: sighting.groupName + ' sighted ' + wildlifeNoun(sighting.speciesId) + ' on their journey.',
        target: { kind: 'wildlife', id: event.id } };
};

/** Import-only migration of prototype #226 saves; new saves have only the shared metadata. */
export function migrateWildlifeAttention(value: unknown, state: SimulationState,
    retained: readonly AttentionRecord[]): AttentionMetadata {
    const firsts = Object.values(state.wildlife?.firstDiscoveries ?? {});
    if (!Array.isArray(value) || value.length > 11 || new Set(value).size !== value.length ||
        value.some(id => typeof id !== 'string' || !firsts.includes(id)))
        throw new Error('Invalid legacy wildlife discovery read state.');
    const metadata = createAttentionMetadata(0);
    metadata.readIds = retained.filter(record => record.canonicalType !== 'WildlifeSighted' || value.includes(record.eventId))
        .map(record => record.eventId);
    return metadata;
}

export const readWildlifeDiscoveries = (state: SimulationState, metadata: AttentionMetadata) =>
    Object.values(state.wildlife?.firstDiscoveries ?? {}).filter(id => attentionRead(metadata, id));
