import type { SeededLivestockRules } from '../simulation/LivestockSpecies';

// Owner-approved four-species Fjord start, #238 (20 October 2026).
// Coefficients are copied unchanged from the #219 soft-crowding candidate.
// Historical QA coefficients remain independent records; deferred birds cannot found new Fjord clans.
const common = {
    youngAdultAge: 1, adultAge: 2, adultFood: 1, youngFood: 0,
    femaleFoodPerWinter: 0, maleFoodPerWinter: 0,
    femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0,
    exposedProductivityBps: 5000,
    youngSlaughterFood: 2, youngAdultSlaughterFood: 5, slaughterFood: 10,
    birthChanceBps: 3000, fertileMinAge: 2, fertileMaxAge: 10, birthInterval: 2,
    mortalityBands: [{ minAge: 0, chanceBps: 200 }, { minAge: 2, chanceBps: 100 },
        { minAge: 10, chanceBps: 500 }, { minAge: 14, chanceBps: 1500 }],
    crowdingBps: 200, weatherMortalityBps: 0, capacityWeightBps: 10000,
};
export const fjordLivestockRules: SeededLivestockRules = {
    version: 2,
    profiles: {
        chicken: { ...common, adultAge: 1, fertileMinAge: 1, fertileMaxAge: 6,
            femaleFoodPerWinter: 4, birthChanceBps: 4500, birthInterval: 1,
            youngSlaughterFood: 1, youngAdultSlaughterFood: 2, slaughterFood: 2,
            capacityWeightBps: 1000,
            mortalityBands: [{ minAge: 0, chanceBps: 300 }, { minAge: 1, chanceBps: 100 },
                { minAge: 6, chanceBps: 1000 }, { minAge: 9, chanceBps: 2500 }] },
        pig: { ...common, fertileMaxAge: 8, birthChanceBps: 4000, birthInterval: 1,
            youngSlaughterFood: 3, youngAdultSlaughterFood: 10, slaughterFood: 20,
            mortalityBands: [{ minAge: 0, chanceBps: 200 }, { minAge: 2, chanceBps: 100 },
                { minAge: 8, chanceBps: 800 }, { minAge: 12, chanceBps: 2000 }] },
        sheep: { ...common, femaleFoodPerWinter: 2, birthInterval: 1,
            femaleMaterialsPerWinter: 1, maleMaterialsPerWinter: 1,
            capacityWeightBps: 7500 },
        goat: { ...common, femaleFoodPerWinter: 4, birthInterval: 1, capacityWeightBps: 7500,
            mortalityBands: [{ minAge: 0, chanceBps: 200 }, { minAge: 2, chanceBps: 100 },
                { minAge: 9, chanceBps: 500 }, { minAge: 13, chanceBps: 1500 }] },
        goose: { ...common, adultAge: 1, fertileMinAge: 1, fertileMaxAge: 8,
            femaleFoodPerWinter: 3, birthChanceBps: 3500, birthInterval: 1,
            youngSlaughterFood: 1, youngAdultSlaughterFood: 3, slaughterFood: 5,
            capacityWeightBps: 2000,
            mortalityBands: [{ minAge: 0, chanceBps: 300 }, { minAge: 1, chanceBps: 100 },
                { minAge: 8, chanceBps: 800 }, { minAge: 12, chanceBps: 2000 }] },
    },
    founding: { version: 1, species: ['cattle', 'pig', 'sheep', 'goat'] },
    breeding: { requireFed: true, capacityLimited: false, unassignedCapacityUnits: 40000 },
    hides: { cattle: 1, chicken: 0, pig: 1, sheep: 1, goat: 1, goose: 0 },
};
