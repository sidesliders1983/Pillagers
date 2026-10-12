import { housingName } from './HousingNames';
import type { SimulationState } from './SimulationCore';
import { personaAge } from './PersonaAge';

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
    // Salvage/collapse capture before deletion; do not overwrite that snapshot afterwards.
    const housingNames = details.housingNames ?? (Object.keys(names).length > 1 ? names : undefined);
    return { ...details, ...(people.length ? { people } : {}), ...(housingNames ? { housingNames } : {}) };
}
