import type { SimulationState } from './SimulationCore';

export type CampfireState = { version: 1; lit: boolean; fuelTicks: number };
export type CampfireCommand = { type: 'SetCampfire'; lit: boolean };

export function inspectCampfire(state: SimulationState) {
    return { lit: state.campfire?.lit ?? false, fuelTicks: state.campfire?.fuelTicks ?? 0 };
}

function emit(state: SimulationState, type: string, details: Record<string, unknown>) {
    state.events.push({ id: `event-${state.events.length + 1}`, time: { ...state.time }, type, details });
}

function refuel(state: SimulationState) {
    if (state.stocks.materials < 1) return false;
    state.stocks.materials--;
    state.campfire!.fuelTicks = state.ticksPerWinter;
    emit(state, 'CampfireFuelConsumed', { units: 1, fuelTicks: state.ticksPerWinter });
    return true;
}

export function setCampfire(state: SimulationState, lit: boolean) {
    if (!state.mechanics) throw new Error('Gameplay settlement required');
    if (typeof lit !== 'boolean') throw new Error('Campfire state must be on or off');
    state.campfire ??= { version: 1, lit: false, fuelTicks: 0 };
    if (state.campfire.lit === lit) return;
    if (lit && state.campfire.fuelTicks === 0 && !refuel(state))
        throw new Error('Lighting the campfire requires 1 Material');
    state.campfire.lit = lit;
    emit(state, 'CampfireChanged', { lit, reason: 'player' });
}

/** Pay before a burning tick, ahead of that tick's work and annual building upkeep. */
export function stepCampfire(state: SimulationState) {
    const fire = state.campfire;
    if (!fire?.lit) return;
    if (fire.fuelTicks === 0 && !refuel(state)) {
        fire.lit = false;
        emit(state, 'CampfireChanged', { lit: false, reason: 'out-of-fuel' });
        return;
    }
    fire.fuelTicks--;
}

export function validateCampfire(state: SimulationState) {
    const fire = state.campfire;
    if (fire === undefined) return;
    if (!state.mechanics || fire === null || fire.version !== 1 || typeof fire.lit !== 'boolean' ||
        !Number.isSafeInteger(fire.fuelTicks) || fire.fuelTicks < 0 || fire.fuelTicks > state.ticksPerWinter)
        throw new Error('Invalid campfire save');
}
