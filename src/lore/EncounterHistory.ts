import type { SimulationEvent } from '../simulation/SimulationCore';

export const encounterHistoryTypes = new Set([
    'EncounterContact', 'EncounterCommitted', 'EncounterWithdrawalRequested', 'EncounterResolved',
    'MissionCargoCaptured', 'MissionCargoLost', 'MissionCargoDelivered', 'ExpeditionLost', 'ExploreAreaLost',
    'ExpeditionTravelHazard',
]);
const reference = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const units = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const references = (value: unknown): value is string[] => Array.isArray(value) && value.every(reference);

function cargoText(totals: { food: number; materials: number; cattle: number; people: number }): string {
    const parts = [totals.food ? totals.food + ' Food' : '',
        totals.materials ? totals.materials + ' Materials' : '',
        totals.cattle ? totals.cattle + ' cattle' : '',
        totals.people ? totals.people + (totals.people === 1 ? ' person' : ' people') : ''].filter(Boolean);
    return parts.join(', ') || 'no cargo';
}

/** Render only witnessed summaries. Private action rolls, opposing identities and stocks stay raw. */
export function encounterHistoryText(event: SimulationEvent): string | null {
    const details = event.details;
    if (!encounterHistoryTypes.has(event.type) || !details || !reference(details.missionId)) return null;
    const group = reference(details.groupName) ? details.groupName : 'An expedition';
    if (event.type === 'ExpeditionLost' || event.type === 'ExploreAreaLost') {
        const lost = event.type === 'ExpeditionLost' ? details.success === false : details.outcome === 'Lost';
        return lost && references(details.survivorIds) && details.survivorIds.length === 0 ?
            group + ' was lost before returning home.' : null;
    }
    if (event.type === 'ExpeditionTravelHazard') {
        if (!units(details.riskBps) || details.riskBps === 0 || details.riskBps > 10000 ||
            !references(details.casualtyIds)) return null;
        const count = details.casualtyIds.length;
        return group + ' encountered hazardous travel weather; ' + (count > 0 ?
            count + (count === 1 ? ' expedition member died.' : ' expedition members died.') :
            'no expedition casualty was recorded.');
    }
    if (!reference(details.encounterId)) return null;
    if (event.type === 'EncounterContact') return group + ' reached the operation site.';
    if (event.type === 'EncounterCommitted') {
        const count = details.observedDefenderCount;
        return units(count) && count > 0 ? group + ' engaged ' + count +
            (count === 1 ? ' observed defender.' : ' observed defenders.') : null;
    }
    if (event.type === 'EncounterWithdrawalRequested') {
        if (details.withdrawingSide === 'defender')
            return 'The observed defenders began disengaging from the on-site encounter.';
        return details.withdrawingSide === 'attacker' ?
            group + ' began disengaging from the on-site encounter.' : null;
    }
    if (event.type === 'EncounterResolved') {
        if (details.outcome === 'won') return group + ' prevailed in the on-site encounter.';
        if (details.outcome === 'withdrew') return group + ' withdrew from the on-site encounter.';
        if (details.outcome === 'lost') return group + "'s on-site encounter ended in loss.";
        if (details.outcome === 'undefended' && details.observedDefenderCount === 0)
            return group + ' completed the on-site encounter without meeting a defender.';
        return null;
    }
    if (event.type === 'MissionCargoCaptured') {
        if (!Array.isArray(details.slots)) return null;
        const totals = { food: 0, materials: 0, cattle: 0, people: 0 };
        for (const slot of details.slots) {
            if (!slot || typeof slot !== 'object' || slot.status !== 'held' || !units(slot.units) || slot.units === 0)
                return null;
            if (slot.kind === 'Food') totals.food += slot.units;
            else if (slot.kind === 'Materials') totals.materials += slot.units;
            else if (slot.kind === 'Cattle' && reference(slot.entityId)) totals.cattle += slot.units;
            else if (slot.kind === 'People' && reference(slot.entityId)) totals.people += slot.units;
            else return null;
        }
        return 'An expedition secured ' + cargoText(totals) + ' in transit; it has not reached home.';
    }
    if (event.type === 'MissionCargoLost') {
        if (!units(details.units) || details.units === 0 || typeof details.released !== 'boolean') return null;
        const totals = { food: 0, materials: 0, cattle: 0, people: 0 };
        if (details.kind === 'Food') totals.food = details.units;
        else if (details.kind === 'Materials') totals.materials = details.units;
        else if (details.kind === 'Cattle') totals.cattle = details.units;
        else if (details.kind === 'People') totals.people = details.units;
        else return null;
        return details.released ? 'An expedition released ' + cargoText(totals) + ' in transit.' :
            'Cargo lost in transit before reaching home: ' + cargoText(totals) + '.';
    }
    if (event.type === 'MissionCargoDelivered') {
        if (!units(details.food) || !units(details.materials) ||
            !references(details.cattleIds) || !references(details.personaIds)) return null;
        return 'An expedition brought ' + cargoText({ food: details.food, materials: details.materials,
            cattle: details.cattleIds.length, people: details.personaIds.length }) + ' home.';
    }
    return null;
}
