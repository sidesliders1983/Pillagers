import type { LandingConfig, Cattle } from './Landing';
import type { SimulationState } from './SimulationCore';

export const livestockSpeciesVersion = 1;
export const livestockSpeciesIds = ['cattle', 'chicken', 'pig', 'sheep', 'goat', 'goose'] as const;
export type LivestockSpecies = typeof livestockSpeciesIds[number];
type ConfiguredSpecies = Exclude<LivestockSpecies, 'cattle'>;

/** Identity vocabulary is independent of unapproved species economics. */
export const livestockSpecies = {
    cattle: { name: 'Cattle', female: 'Cow', male: 'Bull' },
    chicken: { name: 'Chicken', female: 'Hen', male: 'Rooster' },
    pig: { name: 'Pig', female: 'Sow', male: 'Boar' },
    sheep: { name: 'Sheep', female: 'Ewe', male: 'Ram' },
    goat: { name: 'Goat', female: 'Doe', male: 'Buck' },
    goose: { name: 'Goose', female: 'Goose', male: 'Gander' },
} as const;

export type LivestockProfile = {
    youngAdultAge: number;
    adultAge: number;
    adultFood: number;
    youngFood: number;
    femaleFoodPerWinter: number;
    maleFoodPerWinter: number;
    femaleMaterialsPerWinter: number;
    maleMaterialsPerWinter: number;
    exposedProductivityBps: number;
    youngSlaughterFood: number;
    youngAdultSlaughterFood: number;
    slaughterFood: number;
    birthChanceBps: number;
    fertileMinAge: number;
    fertileMaxAge: number;
    birthInterval: number;
    mortalityBands: { minAge: number; chanceBps: number }[];
    crowdingBps: number;
    weatherMortalityBps: number;
    /** 10,000 units occupy the space of one existing adult head of cattle. */
    capacityWeightBps: number;
};

export type LivestockProfiles = Partial<Record<ConfiguredSpecies, LivestockProfile>>;
export type LivestockRules = { version: 1; profiles: LivestockProfiles };

/** Missing species in earlier cattle saves has one explicit versioned meaning. */
export function animalSpecies(animal: Cattle): LivestockSpecies {
    return animal.species ?? 'cattle';
}

/** Existing cattle coefficients remain authoritative in their saved Landing configuration. */
function cattleProfile(config: LandingConfig): LivestockProfile {
    return {
        youngAdultAge: config.cattleYoungAdultAge, adultAge: config.cattleAdultAge,
        adultFood: config.adultCattleFood, youngFood: config.calfFood,
        femaleFoodPerWinter: config.cowFoodPerWinter, maleFoodPerWinter: 0,
        femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0,
        exposedProductivityBps: config.exposedProductivityBps,
        youngSlaughterFood: 5, youngAdultSlaughterFood: 10, slaughterFood: config.slaughterFood,
        birthChanceBps: config.cattleBirthChanceBps,
        fertileMinAge: config.cattleFertileMinAge, fertileMaxAge: config.cattleFertileMaxAge,
        birthInterval: config.cattleBirthInterval,
        mortalityBands: [
            { minAge: 0, chanceBps: config.cattleMortalityYoungBps },
            { minAge: 2, chanceBps: config.cattleMortalityAdultBps },
            { minAge: 10, chanceBps: config.cattleMortalityOlderBps },
            { minAge: 15, chanceBps: config.cattleMortalityOldBps },
        ],
        crowdingBps: config.cattleCrowdingBps, weatherMortalityBps: config.cattleWeatherMortalityBps,
        capacityWeightBps: 10000,
    };
}

export function animalProfile(state: SimulationState, animal: Cattle): LivestockProfile {
    const species = animalSpecies(animal);
    if (species === 'cattle') return cattleProfile(state.landing!.config);
    const profile = state.landing?.livestock?.profiles[species];
    if (!profile) throw new Error('Livestock species requires explicit saved rules: ' + species);
    return profile;
}

export function validateLivestockRules(state: SimulationState): void {
    const rules = state.landing?.livestock;
    if (rules === undefined) return;
    if (!rules || rules.version !== livestockSpeciesVersion || !rules.profiles ||
        typeof rules.profiles !== 'object' || Array.isArray(rules.profiles))
        throw new Error('Unsupported livestock rules');
    for (const [species, profile] of Object.entries(rules.profiles)) {
        if (species === 'cattle' || !livestockSpeciesIds.includes(species as LivestockSpecies) ||
            !profile || !Array.isArray(profile.mortalityBands))
            throw new Error('Invalid livestock profile');
        const fields: (keyof Omit<LivestockProfile, 'mortalityBands'>)[] = [
            'youngAdultAge', 'adultAge', 'adultFood', 'youngFood',
            'femaleFoodPerWinter', 'maleFoodPerWinter',
            'femaleMaterialsPerWinter', 'maleMaterialsPerWinter', 'exposedProductivityBps',
            'youngSlaughterFood', 'youngAdultSlaughterFood', 'slaughterFood',
            'birthChanceBps', 'fertileMinAge', 'fertileMaxAge', 'birthInterval',
            'crowdingBps', 'weatherMortalityBps', 'capacityWeightBps',
        ];
        if (Object.keys(profile).length !== fields.length + 1)
            throw new Error('Incomplete livestock profile');
        for (const field of fields) {
            const value = profile[field];
            const maximum = field.endsWith('Bps') && field !== 'capacityWeightBps' ? 10000 : 1000000;
            if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
                throw new Error('Invalid livestock profile value: ' + field);
        }
        if (profile.youngAdultAge < 1 || profile.adultAge < profile.youngAdultAge ||
            profile.fertileMinAge < profile.adultAge || profile.fertileMaxAge < profile.fertileMinAge ||
            profile.birthInterval < 1 || profile.capacityWeightBps < 1)
            throw new Error('Invalid livestock lifecycle or capacity');
        let lastAge = -1;
        if (!profile.mortalityBands.length || profile.mortalityBands[0].minAge !== 0)
            throw new Error('Livestock mortality must include age zero');
        for (const band of profile.mortalityBands) {
            if (!band || Object.keys(band).length !== 2 || !Number.isSafeInteger(band.minAge) ||
                band.minAge <= lastAge || band.minAge > 1000000 ||
                !Number.isSafeInteger(band.chanceBps) || band.chanceBps < 0 || band.chanceBps > 10000)
                throw new Error('Invalid livestock mortality bands');
            lastAge = band.minAge;
        }
    }
}

export function validateAnimalSpecies(state: SimulationState): void {
    const landing = state.landing;
    if (!landing) return;
    for (const [id, animal] of Object.entries(landing.cattleArchive ?? {})) {
        if (!animal || animal.id !== id) throw new Error('Invalid archived livestock identity');
        if (landing.cattle[id]) throw new Error('Duplicate active and archived livestock identity');
    }
    for (const animal of Object.values({ ...landing.cattleArchive, ...landing.cattle })) {
        if (!livestockSpeciesIds.includes(animalSpecies(animal)))
            throw new Error('Unknown livestock species');
        animalProfile(state, animal);
    }
}
