import type {SimulationState} from './SimulationCore';
import {personaAge} from './PersonaAge';
/** Capture identity at recording time; projections never consult mutable personas. */
export function eventFacts(state:SimulationState,details:Record<string,unknown>={},personaId?:string):Record<string,unknown> {
    const ids=[...(personaId?[personaId]:[]),...(Array.isArray(details.participants)?details.participants:[])].filter((id):id is string=>typeof id==='string');
    const people=[...new Set(ids)].filter(id=>state.personas[id]).map(id=>({id,name:state.personas[id].name,age:personaAge(state,id)}));
    return {...details,...(people.length?{people}:{})};
}
