import { housingName } from './HousingNames';
import type { SimulationState } from './SimulationCore';
import { personaAge } from './PersonaAge';
import { livestockIdentity } from './LivestockNames';
export type HousingResidents = {
    version: 1;
    householdIds: string[];
    buildingId: string | null;
    residenceId: string | null;
    residentIds: string[];
    people: {
        id: string;
        name: string;
        age: number;
    }[];
};
/** Freeze presentation designations at recording time alongside existing historical people. */
export function eventFacts(
    state: SimulationState, details: Record<string, unknown> = {}, personaId?: string
): Record<string, unknown> {
    const ids = [...(personaId ? [personaId] : []),
        ...(Array.isArray(details.participants) ? details.participants : [])]
        .filter((id): id is string => typeof id === 'string');
    const people = [...new Set(ids)].filter(id => state.personas[id]).map(id => ({
        id, name: state.personas[id].name, age: personaAge(state, id)
    }));
    const householdId = typeof details.householdId === 'string' ? details.householdId : undefined;
    const names: Record<string, unknown> = { version: 1 };
    const buildingId = details.buildingId ?? details.farmyardId;
    if (typeof buildingId === 'string' && state.buildings[buildingId]) {
        names.building = {
            id: buildingId, name: housingName(state, 'building', buildingId, householdId)
        };
    }
    if (householdId && state.households[householdId])
        names.household = { id: householdId, name: housingName(state, 'household', householdId) };
    if (typeof details.residenceId === 'string' && state.residences[details.residenceId]) {
        names.residence = {
            id: details.residenceId,
            name: housingName(state, 'residence', details.residenceId, householdId)
        };
    }
    const affectedHomes = Object.values(state.households).filter(home => {
        if (householdId) return home.id === householdId;
        if (typeof buildingId === 'string')
            return !!home.residenceId && state.residences[home.residenceId]?.buildingId === buildingId;
        return typeof details.residenceId === 'string' && home.residenceId === details.residenceId;
    });
    const residentIds = [...new Set(affectedHomes.flatMap(home => home.memberIds))]
        .filter(id => state.personas[id]?.deathWinter === null);
    const housingResidents = details.housingResidents ??
        (householdId || typeof buildingId === 'string' || typeof details.residenceId === 'string' ? {
            version: 1, householdIds: affectedHomes.map(home => home.id),
            buildingId: typeof buildingId === 'string' ? buildingId : null,
            residenceId: typeof details.residenceId === 'string' ? details.residenceId : null,
            residentIds, people: residentIds.map(id => ({ id, name: state.personas[id].name, age: personaAge(state, id) }))
        } : undefined);
    // Salvage/collapse capture before deletion; do not overwrite that snapshot afterwards.
    const housingNames = details.housingNames ?? (Object.keys(names).length > 1 ? names : undefined);
    const animalIds = [details.livestockId, details.cattleId,
        ...(Array.isArray(details.livestockIds) ? details.livestockIds : []),
        ...(Array.isArray(details.cattleIds) ? details.cattleIds : [])]
        .filter((id): id is string => typeof id === 'string');
    const livestock = details.livestock ?? (state.landing?.livestock && animalIds.length ? {
        version: 1, recordedClanId: state.clan.id,
        animals: [...new Set(animalIds)].filter(id =>
            state.landing?.cattle[id] || state.landing?.cattleArchive?.[id])
            .map(id => livestockIdentity(state, id)),
    } : undefined);
    return { ...details,
        ...(people.length ? { people } : {}),
        ...(housingNames ? { housingNames } : {}),
        ...(housingResidents ? { housingResidents } : {}),
        ...(livestock ? { livestock } : {})
    };
}
