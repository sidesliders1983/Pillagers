import { inspectTerritory } from '../simulation/TerritorialAwareness';
import { inspectSpatialExpeditions } from '../simulation/SpatialExpeditions';
import { encounterDescription } from './MissionOutcomeView';
import type { SimulationState } from '../simulation/SimulationCore';

const escape = (value: string) => value.replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Reuse the existing group recall action for a legitimately observed incident. */
export function territoryNotice(state: SimulationState, groupId?: string, owner: 'expedition' | 'island' = 'expedition') {
    const incidents = inspectTerritory(state).incidents.filter(incident => incident.phase !== 'Closed' &&
        incident.intrudingClanId === state.clan.id && (!groupId || incident.groupId === groupId));
    const missions = inspectSpatialExpeditions(state).missions;
    return incidents.map(incident => {
        const physical = missions.find(mission => mission.id === incident.missionId);
        const heading = incident.phase === 'Suspicious' ? 'Residents are watching this group' :
            incident.phase === 'Alerted' ? 'Settlement warning' : physical?.encounter ?
                'Settlement encounter' : 'Settlement warning · Engagement requested';
        const text = incident.phase === 'Suspicious' ? 'The group has been seen near the settlement.' :
            incident.phase === 'Alerted' ? 'Residents have asked the group to leave. Withdraw to end the intrusion.' :
                physical?.encounter ? encounterDescription(physical) :
                    'Residents have mobilised. On-site combat is not available yet. Return home to withdraw.';
        const mission = state.world?.spatial?.missions[incident.missionId];
        const canReturn = mission && !['Prepared', 'Returned', 'Returning', 'Stranded', 'Lost'].includes(mission.status);
        const action = owner === 'island' ? 'data-island-return' : 'data-recall="' + escape(incident.groupId) + '"';
        return '<section class="fjord-expedition-description" role="status" data-territory-incident="' + escape(incident.id) + '">' +
            '<strong>' + heading + '</strong><p>' + text + '</p>' +
            (canReturn ? '<button type="button" ' + action + '>Withdraw group</button>' : '') + '</section>';
    }).join('');
}
