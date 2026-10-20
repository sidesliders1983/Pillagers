import type { SimulationState } from './SimulationCore';
import type { Cattle } from './Landing';
import { animalProfile, animalSpecies, livestockSpecies, livestockSpeciesIds } from './LivestockSpecies';
import { livestockHerdSpace } from './Farmyards';

export function livestockBreedingAge(state: SimulationState, animal: Cattle) {
    const age = (animal.deathWinter ?? state.time.winter) - animal.birthWinter;
    const profile = animalProfile(state, animal);
    return age < profile.fertileMinAge ? 'young' as const :
        age > profile.fertileMaxAge ? 'past-window' as const : 'within-window' as const;
}

export function ageEligibleForBreeding(state: SimulationState, animal: Cattle) {
    return animal.deathWinter === null && livestockBreedingAge(state, animal) === 'within-window';
}

/** Same-boundary facts only. An old shortage is not a persistent biological flag. */
export function livestockFeedingBlocked(state: SimulationState) {
    const rules = state.landing?.livestock;
    if (rules?.version !== 2 || !rules.breeding.requireFed) return false;
    for (let index = state.events.length - 1; index >= 0; index--) {
        const event = state.events[index];
        if (event.time.winter !== state.time.winter || event.time.tick !== state.time.tick) break;
        if (['FoodConsumed', 'CattleFoodConsumed', 'LivestockFoodConsumed'].includes(event.type) &&
            Number(event.details?.shortfall) > 0) return true;
    }
    return false;
}

export function livestockBirthIntervalReady(state: SimulationState, mother: Cattle) {
    return mother.lastCalvingWinter === null ||
        state.time.winter - mother.lastCalvingWinter >= animalProfile(state, mother).birthInterval;
}

export function livestockBirthSpaceReady(state: SimulationState, mother: Cattle) {
    const rules = state.landing?.livestock;
    if (rules?.version !== 2 || !rules.breeding.capacityLimited) return true;
    const space = livestockHerdSpace(state, mother);
    return !!space && space.occupiedUnits + animalProfile(state, mother).capacityWeightBps <= space.capacityUnits;
}

export function compatibleLivestockPartner(mother: Cattle, candidate: Cattle) {
    return candidate.sex === 'male' && animalSpecies(candidate) === animalSpecies(mother) &&
        candidate.farmyardId === mother.farmyardId;
}

export type BreedingConstraint = 'missing-male' | 'missing-female' | 'birth-interval' | 'capacity' | 'feeding';

/** Own-clan read model. It never reads rival state, draws randomness or stores derived biology. */
export function inspectLivestockBreeding(state: SimulationState) {
    const living = Object.values(state.landing?.cattle ?? {}).filter(animal => animal.deathWinter === null);
    const feedingBlocked = livestockFeedingBlocked(state);
    const species = livestockSpeciesIds.flatMap(species => {
        const animals = living.filter(animal => animalSpecies(animal) === species);
        if (!animals.length) return [];
        const locations = [...new Set(animals.map(animal => animal.farmyardId))];
        const herds = locations.map(farmyardId => {
            const herd = animals.filter(animal => animal.farmyardId === farmyardId);
            const fertile = herd.filter(animal => ageEligibleForBreeding(state, animal));
            const femaleIds = fertile.filter(animal => animal.sex === 'female').map(animal => animal.id);
            const maleIds = fertile.filter(animal => animal.sex === 'male').map(animal => animal.id);
            const young = herd.filter(animal => livestockBreedingAge(state, animal) === 'young');
            const constraints: BreedingConstraint[] = [];
            if (!maleIds.length) constraints.push('missing-male');
            if (!femaleIds.length) constraints.push('missing-female');
            const mothers = fertile.filter(animal => animal.sex === 'female');
            if (mothers.some(mother => !livestockBirthIntervalReady(state, mother))) constraints.push('birth-interval');
            if (mothers.some(mother => !livestockBirthSpaceReady(state, mother))) constraints.push('capacity');
            if (feedingBlocked) constraints.push('feeding');
            const readyFemaleIds = maleIds.length && !feedingBlocked ? mothers.filter(mother =>
                livestockBirthIntervalReady(state, mother) && livestockBirthSpaceReady(state, mother))
                .map(mother => mother.id) : [];
            return { farmyardId, living: herd.length, femaleIds, maleIds,
                structuralPairs: femaleIds.length * maleIds.length, readyFemaleIds,
                youngFemaleIds: young.filter(animal => animal.sex === 'female').map(animal => animal.id),
                youngMaleIds: young.filter(animal => animal.sex === 'male').map(animal => animal.id),
                pastWindowIds: herd.filter(animal => livestockBreedingAge(state, animal) === 'past-window')
                    .map(animal => animal.id),
                space: livestockHerdSpace(state, herd[0]), constraints };
        });
        const structuralPairs = herds.reduce((sum, herd) => sum + herd.structuralPairs, 0);
        return [{ species, speciesName: livestockSpecies[species].name, living: animals.length, structuralPairs,
            separated: structuralPairs === 0 && herds.some(herd => herd.femaleIds.length > 0) &&
                herds.some(herd => herd.maleIds.length > 0), herds }];
    });
    return { species, feedingBlocked };
}
