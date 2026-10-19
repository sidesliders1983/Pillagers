import type { SimulationState } from './SimulationCore';
import { animalProfile, animalSpecies, livestockSpecies } from './LivestockSpecies';

type Names = {
    events: number;
    active: number;
    labels: Map<string, string>;
};
const cache = new WeakMap<SimulationState, Names>();

/** Local arrival order reserves a title even after death or departure.
 * Existing event identities are the source; reading a name never edits a save or draws RNG.
 */
export function livestockName(state: SimulationState, id: string): string {
    const active = Object.keys(state.landing?.cattle ?? {}).length;
    let names = cache.get(state);
    if (!names || names.events > state.events.length) {
        names = { events: 0, active: 0, labels: new Map() };
    }
    const labels = names.labels;
    const remember = (value: unknown) => {
        if (typeof value === 'string' && !labels.has(value))
            labels.set(value, 'Livestock ' + (labels.size + 1));
    };
    // Append-only within one canonical command; do not rescan the full history per event.
    for (let index = names.events; index < state.events.length; index++) {
        const details = state.events[index].details;
        if (Array.isArray(details?.cattleIds)) details.cattleIds.forEach(remember);
        if (typeof details?.cattleId === 'string') remember(details.cattleId);
        if (Array.isArray(details?.livestockIds)) details.livestockIds.forEach(remember);
        if (typeof details?.livestockId === 'string') remember(details.livestockId);
    }
    if (names.active !== active || !labels.has(id)) {
        // Imported ancestor snapshots never owned locally do not consume local titles.
        Object.keys(state.landing?.cattle ?? {})
            .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).forEach(remember);
    }
    names.events = state.events.length;
    names.active = active;
    cache.set(state, names);
    return names.labels.get(id) ?? 'Recorded livestock';
}

/** The biological descriptor is recorded at the event's Winter, separate from its local title. */
export function livestockIdentity(state: SimulationState, id: string) {
    const animal = state.landing?.cattle[id] ?? state.landing?.cattleArchive?.[id];
    if (!animal) throw new Error('Unknown livestock');
    const species = animalSpecies(animal), descriptor = livestockSpecies[species];
    const profile = animalProfile(state, animal);
    const age = (animal.deathWinter ?? state.time.winter) - animal.birthWinter;
    return {
        id, name: livestockName(state, id), species, speciesName: descriptor.name,
        sex: animal.sex, sexTerm: descriptor[animal.sex], birthWinter: animal.birthWinter,
        age, stage: age < profile.youngAdultAge ? 'Young' : age < profile.adultAge ? 'Young Adult' : 'Adult',
        parentIds: [...animal.parentIds], origin: animal.origin,
    };
}
