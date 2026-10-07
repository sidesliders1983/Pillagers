import type {SimulationState} from './SimulationCore';
export function personaAge(state: SimulationState, personaId: string): number {
    const person = state.personas[personaId];
    if (!person) throw new Error('Unknown persona');
    return (person.deathWinter ?? state.time.winter) - person.birthWinter;
}
