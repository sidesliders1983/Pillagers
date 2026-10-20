import type { SimulationState } from '../simulation/SimulationCore';
import { inspectLivestockBreeding } from '../simulation/LivestockBreeding';
import { animalSpecies } from '../simulation/LivestockSpecies';
import { housingName } from '../simulation/HousingNames';

const escape = (value: string) => value.replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const constraints = {
    'missing-male': 'No fertile male', 'missing-female': 'No fertile female',
    'birth-interval': 'Birth interval active for some females',
    capacity: 'No room for the next birth', feeding: 'Feeding shortfall at this breeding boundary',
};

export function renderLivestockBreeding(state: SimulationState,
    filter: { farmyardId?: string | null; species?: string } = {}) {
    const rows = inspectLivestockBreeding(state).species.filter(row => !filter.species || row.species === filter.species);
    return `<details class="livestock-breeding"><summary>Breeding stock</summary>` +
        rows.map(row => {
            const herds = row.herds.filter(herd => !Object.hasOwn(filter, 'farmyardId') || herd.farmyardId === filter.farmyardId);
            if (!herds.length) return '';
            return `<section><strong>${escape(row.speciesName)}</strong>` +
                (row.separated ? '<p>Compatible animals are in separate herds.</p>' : '') +
                herds.map(herd => `<p>${herd.farmyardId === null ? 'Unassigned herd' : escape(housingName(state, 'building', herd.farmyardId))}: ` +
                    `${herd.living} living · ${herd.structuralPairs} age-eligible combination${herd.structuralPairs === 1 ? '' : 's'}.</p>` +
                    (herd.constraints.length ? `<p>${herd.constraints.map(key => constraints[key]).join(' · ')}.</p>` : '') +
                    (herd.youngFemaleIds.length || herd.youngMaleIds.length ? `<p>Possible young replacements: ` +
                        `${herd.youngFemaleIds.length} female, ${herd.youngMaleIds.length} male; not yet breeding age.</p>` : '') +
                    (herd.pastWindowIds.length ? `<p>${herd.pastWindowIds.length} past the breeding age window.</p>` : '')).join('') +
                '</section>';
        }).join('') + '<p class="fjord-caption">Partners must share a herd and species. An age-eligible pair does not guarantee a birth.</p></details>';
}

/** Nonblocking consequence of the actual preview command, not an automatic management policy. */
export function slaughterBreedingWarning(state: SimulationState, next: SimulationState, id: string) {
    const animal = state.landing?.cattle[id];
    if (!animal || animal.deathWinter !== null) return '';
    const species = animalSpecies(animal), location = animal.farmyardId;
    const herd = (value: SimulationState) => inspectLivestockBreeding(value).species
        .find(row => row.species === species)?.herds.find(herd => herd.farmyardId === location);
    if (!herd(state)?.structuralPairs || herd(next)?.structuralPairs) return '';
    const remaining = herd(next);
    const young = !remaining?.maleIds.length ? remaining?.youngMaleIds.length : remaining?.youngFemaleIds.length;
    return 'This removes the last age-eligible breeding combination for this species in this herd.' +
        (young ? ' A possible young replacement is not yet breeding age.' : '');
}
