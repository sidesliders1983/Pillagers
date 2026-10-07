import type {SimulationState} from './SimulationCore';
/** Shared saved uint32 stream; disabled features must not draw. */
export function randomUint(state:SimulationState):number {state.rngState=(Math.imul(state.rngState,1664525)+1013904223)>>>0;return state.rngState;}
