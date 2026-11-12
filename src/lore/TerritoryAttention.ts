import type { AttentionAdapter } from './AttentionHistory';
import type { SimulationEvent } from '../simulation/SimulationCore';

const eventTypes = new Set(['TerritoryIncidentOpened', 'TerritoryIncidentChanged', 'TerritoryIncidentClosed']);
const reference = (value: unknown): value is string => typeof value === 'string' &&
    value.length > 0 && value.length <= 256;

/** Factual player-visible wording never derives names from the private defender roster. */
export function territoryHistoryText(event: SimulationEvent): string | null {
    const details = event.details;
    if (!eventTypes.has(event.type) || details?.version !== 1 || details.observedByPlayer !== true ||
        !reference(details.incidentId) || !reference(details.missionId)) return null;
    const { phase, reason } = details;
    if ((event.type === 'TerritoryIncidentClosed') !== (phase === 'Closed')) return null;
    if (phase === 'Suspicious' && reason === 'perimeter-sighting')
        return 'An expedition party was noticed near the settlement perimeter.';
    if (phase === 'Alerted' && reason === 'settlement-intrusion')
        return 'The settlement warned the expedition party to withdraw.';
    if (phase === 'Hostile' && reason === 'warning-ignored')
        return 'The expedition party ignored the settlement warning and the encounter became hostile.';
    if (phase === 'Hostile' && reason === 'observed-pillage')
        return 'The settlement observed Pillage beginning and the encounter became hostile.';
    if (phase === 'Closed') {
        if (reason === 'lost-contact')
            return 'The settlement lost contact with the expedition party and the incident ended.';
        if (reason === 'party-returned')
            return 'The expedition party returned home and the incident ended.';
        if (reason === 'party-unavailable')
            return 'The expedition party was no longer available and the incident ended.';
        if (reason === 'observers-unavailable')
            return 'The settlement observers were no longer available and the incident ended.';
    }
    return null;
}

export const territoryAttentionAdapter: AttentionAdapter = event => {
    const headline = territoryHistoryText(event), details = event.details;
    if (!headline || !details) return null;
    const actorIds = Array.isArray(details.participants)
        ? [...new Set(details.participants.filter(reference))] : [];
    return { eventId: event.id, incidentId: details.incidentId as string, canonicalType: event.type,
        category: 'expedition', severity: 'noteworthy', time: { ...event.time }, actorIds,
        headline, shortText: headline, target: { kind: 'expedition', id: details.missionId as string } };
};
