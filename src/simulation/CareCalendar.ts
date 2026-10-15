import type { PersonaMechanics } from './Mechanics';
import type { SimulationState } from './SimulationCore';

export function careEndpoint(state: SimulationState, info: PersonaMechanics): number {
    return info.childcareUntilWinter * state.ticksPerWinter + (info.childcareUntilTick ?? 0);
}
export function careActive(state: SimulationState, info: PersonaMechanics): boolean {
    // Legacy records end at the annual boundary; exact dates only need a tick comparison in that year.
    return info.childcareUntilWinter > state.time.winter ||
        info.childcareUntilWinter === state.time.winter && (info.childcareUntilTick ?? 0) > state.time.tick;
}
export function endCare(state: SimulationState, info: PersonaMechanics): void {
    if (careActive(state, info)) {
        info.childcareUntilWinter = state.time.winter;
        if (info.childcareUntilTick !== undefined) info.childcareUntilTick = state.time.tick;
    }
    info.caregiverId = null;
    info.caregiverLocked = false;
}
