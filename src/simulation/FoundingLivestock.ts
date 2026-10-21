import { seededRandom } from '../characters/seededRandom';
import type { SimulationState } from './SimulationCore';
import { animalProfile, livestockSpeciesIds, validateLivestockRules } from './LivestockSpecies';
import type { LivestockRules } from './LivestockSpecies';

/** Called once, before the factual landing event. Loading never calls this factory. */
export function initializeFoundingLivestock(state: SimulationState, rules?: LivestockRules): void {
    const landing = state.landing!;
    landing.livestock = structuredClone(rules ?? { version: 1, profiles: {} });
    validateLivestockRules(state);
    const founding = landing.livestock;
    const pool = founding.version === 2 ? founding.founding.species ?? livestockSpeciesIds : livestockSpeciesIds;
    const candidates = pool.filter(species =>
        founding.version !== 2 || species !== founding.founding.excludedSpecies);
    const random = seededRandom(state.seed, 'founding-livestock-v1');
    const species = founding.version === 2 ? candidates[Math.floor(random() * candidates.length)] : 'cattle';
    for (let index = 1; index <= 3; index++) {
        const id = `${species === 'cattle' ? 'cattle' : 'livestock'}-${index}`;
        const animal = {
            id, species, sex: index === 3 ? 'male' as const : 'female' as const,
            birthWinter: 797, deathWinter: null, parentIds: [], origin: 'founding' as const,
            lastCalvingWinter: null, farmyardId: null, foodProgress: 0,
        };
        if (founding.version === 2) {
            const profile = animalProfile(state, animal);
            animal.birthWinter = state.time.winter - Math.max(profile.adultAge, profile.fertileMinAge);
        }
        landing.cattle[id] = animal;
    }
}
