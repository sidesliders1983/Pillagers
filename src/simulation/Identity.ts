import type {Persona,SimulationState} from './SimulationCore';
/** Historical identities are not residents and never produce, consume or reproduce. */
export function personaIdentity(state:SimulationState,id:string):Persona|undefined{return state.personas[id]??state.personaArchive?.[id];}
