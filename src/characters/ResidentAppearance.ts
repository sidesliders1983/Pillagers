import { personaAge, type SimulationState } from '../simulation/SimulationCore';
import { projectFacialIdentity } from './FacialIdentity';

/** Both the world and portraits read the same recorded person, including archives.
 * Native body authoring supports ages through 100; the UI retains the actual age. */
export function projectResidentAppearance(state: SimulationState, personaId: string) {
    const person = state.personas[personaId] ?? state.personaArchive?.[personaId];
    if (!person) return undefined;
    return {
        dna: { ...structuredClone(person.dna), age: Math.min(100, personaAge(state, personaId)) },
        face: projectFacialIdentity(state, personaId),
    };
}
