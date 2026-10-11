import type { SimulationState } from './SimulationCore';

export type HousingKind = 'household' | 'building' | 'residence';

/** Every living member is named; this display label assigns no household head or new identity. */
export function housingName(
    state: SimulationState, kind: HousingKind, id: string, householdId?: string
): string {
    let household = householdId ? state.households[householdId] : undefined;
    if (!household) {
        household = kind === 'household' ? state.households[id] :
            Object.values(state.households).find(home => {
                if (kind === 'residence') return home.residenceId === id;
                const residence = home.residenceId ? state.residences[home.residenceId] : undefined;
                return residence?.buildingId === id;
            });
    }
    const names = (household?.memberIds ?? []).flatMap(memberId => {
        const person = state.personas[memberId];
        return person && person.deathWinter === null ? [person.name] : [];
    });
    const noun = kind === 'household' ? 'household' :
        kind === 'residence' && state.residences[id]?.kind === 'tent' ? 'tent' : 'home';
    if (!names.length) return 'A ' + noun;
    const members = names.length === 1 ? names[0] :
        names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
    return members + '’s ' + noun;
}
