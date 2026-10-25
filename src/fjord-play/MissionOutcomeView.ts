import type { SimulationEvent, SimulationState } from '../simulation/SimulationCore';
import type { EquipmentResult } from '../simulation/Smithery';
import { renderEquipmentReport } from './SmitheryView';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Expand an existing historical record; never re-resolve or embellish its result. */
export function renderMissionOutcome(state: SimulationState, event: SimulationEvent): string {
    const details = event.details;
    if (event.type !== 'ExpeditionReturned' || !details || typeof details.success !== 'boolean') return '';
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
        <h4>${escape(details.mission)} · ${details.success ? 'Succeeded' : 'Failed'}</h4>
        <p>${escape(details.summary)}</p>
        <p>Recovered: ${escape(details.food)} Food · ${escape(details.materials)} Materials ·
            ${count(details.cattleIds)} livestock · ${count(details.personaIds)} people.</p>
        <p>Returned crew: ${names(details.survivorIds)}.<br>Casualties: ${names(details.casualtyIds)}.</p>
        ${details.equipment ? renderEquipmentReport(details.equipment as EquipmentResult) : ''}
        ${livestock.length ? '<p>Recorded livestock: ' + livestock.join(', ') + '.</p>' : ''}
        <p class="fjord-caption">These are the recorded transfers and losses from this mission. No recovered assets is a valid result.</p>
    </section>`;
}
