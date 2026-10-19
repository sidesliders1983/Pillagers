import type { SimulationState } from './SimulationCore';
import type { LivestockAnimal } from './Landing';
import { animalProfile, animalSpecies } from './LivestockSpecies';

/** Clan-owned crafting inputs, separate from the two universal HUD resources. */
export type SpecialistStocks = { version: 1; hides: number };

export function slaughterHides(state: SimulationState, animal: LivestockAnimal): number {
    const rules = state.landing?.livestock;
    if (rules?.version !== 2 || state.time.winter - animal.birthWinter < animalProfile(state, animal).adultAge)
        return 0;
    return rules.hides[animalSpecies(animal)];
}

export function creditHides(state: SimulationState, units: number): void {
    if (!units) return;
    state.specialistStocks ??= { version: 1, hides: 0 };
    state.specialistStocks.hides += units;
}

export function validateSpecialistStocks(state: SimulationState): void {
    const stocks = state.specialistStocks;
    if (stocks !== undefined && (!stocks || stocks.version !== 1 || Object.keys(stocks).length !== 2 ||
        !Number.isSafeInteger(stocks.hides) || stocks.hides < 0))
        throw new Error('Invalid specialist stocks');
}
