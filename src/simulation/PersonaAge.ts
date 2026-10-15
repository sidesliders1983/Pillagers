import { personaIdentity } from './Identity';
import type { GameTime, SimulationState } from './SimulationCore';

/** Completed years; historical queries never age a person beyond their recorded death. */
export function personaAge(state: SimulationState, personaId: string, at?: GameTime): number {
    const person = personaIdentity(state, personaId);
    if (!person) throw new Error('Unknown persona');
    if (!at && !state.personas[personaId] && person.deathWinter === null) {
        for (let index = state.events.length - 1; index >= 0; index--) {
            const event = state.events[index];
            if (event.type === 'PersonaTransferredOut' &&
                (event.personaId === personaId || event.details?.personaId === personaId)) {
                at = event.time;
                break;
            }
        }
        if (!at) throw new Error('Historical age has no observed date.');
    }
    at ??= state.time;
    const death = person.deathWinter === null ? at : { winter: person.deathWinter, tick: person.deathTick ?? 0 };
    const end = death.winter < at.winter || death.winter === at.winter && death.tick < at.tick ? death : at;
    return end.winter - person.birthWinter - (end.tick < (person.birthTick ?? 0) ? 1 : 0);
}
