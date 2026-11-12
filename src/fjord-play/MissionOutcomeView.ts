import type { SimulationEvent, SimulationState } from '../simulation/SimulationCore';
import type { EquipmentResult } from '../simulation/Smithery';
import type { inspectSpatialExpeditions } from '../simulation/SpatialExpeditions';
import { renderEquipmentReport } from './SmitheryView';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Expand an existing historical record; never re-resolve or embellish its result. */
export function renderMissionOutcome(state: SimulationState, event: SimulationEvent): string {
    const details = event.details;
    const lost = event.type === 'ExpeditionLost';
    if ((!lost && event.type !== 'ExpeditionReturned') || !details || typeof details.success !== 'boolean') return '';
    const people = Array.isArray(details.people) ? details.people as { id: string; name: string }[] : [];
    const names = (ids: unknown) => Array.isArray(ids) && ids.length ? ids.map(id =>
        escape(people.find(person => person.id === id)?.name ??
            state.personas[String(id)]?.name ?? state.personaArchive?.[String(id)]?.name ?? 'Recorded resident')).join(', ') : 'None';
    const count = (value: unknown) => Array.isArray(value) ? value.length : 0;
    const missionId = typeof details.missionId === 'string' ? details.missionId : '';
    const receipt = details.livestock as { version?: number; animals?: { name: string }[] } | undefined;
    const livestock = receipt?.version === 1 && Array.isArray(receipt.animals) ?
        receipt.animals.filter(animal => typeof animal.name === 'string').map(animal => escape(animal.name)) : [];
    return `<section class="fjord-mission-outcome" aria-label="Mission result" data-mission-report="${escape(missionId)}">
        <h4>${escape(details.mission)} · ${lost ? 'Expedition lost' : details.success ? 'Succeeded' : 'Failed'}</h4>
        <p>${escape(details.summary)}</p>
        ${lost ? '<p>No party returned and no carried assets were delivered.</p>' :
            `<p>Recovered: ${escape(details.food)} Food · ${escape(details.materials)} Materials ·
                ${count(details.cattleIds)} livestock · ${count(details.personaIds)} people.</p>`}
        <p>${lost ? '' : `Returned crew: ${names(details.survivorIds)}.<br>`}Casualties: ${names(details.casualtyIds)}.</p>
        ${details.equipment ? renderEquipmentReport(details.equipment as EquipmentResult) : ''}
        ${livestock.length ? '<p>Recorded livestock: ' + livestock.join(', ') + '.</p>' : ''}
        <p class="fjord-caption">${lost ? 'These are the recorded mission losses. No homecoming occurred.' :
            'These are the recorded transfers and losses from this mission. No recovered assets is a valid result.'}</p>
    </section>`;
}

type PhysicalMission = ReturnType<typeof inspectSpatialExpeditions>['missions'][number];

/** Only the public own-party and legitimately observed encounter facts enter captions. */
export function encounterDescription(mission: PhysicalMission): string {
    const encounter = mission.encounter;
    if (!encounter) return '';
    const phases = {
        approach: 'Approaching the operation site.',
        contact: 'Waiting for actual defenders to make contact.',
        engaging: 'Engagement in progress. Losses take effect on site.',
        resolved: 'On-site encounter resolved.',
        withdrawing: encounter.withdrawingSide === 'defender' ? 'Observed defenders are withdrawing.' :
            encounter.withdrawingSide === 'attacker' ? 'The expedition is withdrawing.' : 'Withdrawal in progress.',
        returning: 'Survivors are returning home.',
        lost: 'No survivors. No party will return.',
        stranded: 'The return route is blocked. Survivors are stranded.',
        completed: 'Mission concluded.',
    };
    return phases[encounter.phase] + ` ${encounter.activeMemberIds.length} active crew · ` +
        `${encounter.casualtyIds.length} recorded losses.` +
        (encounter.observedDefenderCount === null ? '' :
            ` Observed defenders: ${encounter.observedDefenderCount}.`);
}

export function manifestDescription(mission: PhysicalMission | undefined): string {
    const manifest = mission?.manifest;
    if (!manifest) return '';
    const labels = {
        'in-transit': 'In transit — unavailable in home stocks.',
        empty: 'No available assets were found to carry.',
        delivered: 'Carried assets were delivered home.',
        lost: 'No assets remain to deliver.',
        released: 'Escorted people or livestock were released; no assets remain to deliver.',
    };
    return labels[manifest.status];
}

/** Captured quantities are custody facts; no donor stock or hidden identity lookup is needed. */
export function renderTransitManifest(mission: PhysicalMission | undefined): string {
    const manifest = mission?.manifest;
    if (!manifest) return '';
    return `<section aria-label="Carried assets"><p>${escape(manifestDescription(mission))}</p>
        <p>${manifest.food} Food · ${manifest.materials} Materials ·
            ${manifest.cattleIds.length} livestock · ${manifest.personaIds.length} people.</p></section>`;
}
