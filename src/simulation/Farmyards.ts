import {eventFacts} from './EventFacts';
import type {SimulationState} from './SimulationCore';
import { animalProfile } from './LivestockSpecies';
import type { LivestockAnimal } from './Landing';

/** The outdoor herd has explicit space only under the new, saved breeding contract. */
export function livestockHerdSpace(state: SimulationState, animal: LivestockAnimal) {
    if (animal.farmyardId !== null) {
        const yard = farmyards(state).find(yard => yard.id === animal.farmyardId);
        if (!yard) return null;
        return { occupiedUnits: Math.round(yard.occupancy * 10000),
            capacityUnits: yard.capacity * 10000, overcrowdingUnits: yard.overcrowdingUnits };
    }
    const rules = state.landing?.livestock;
    if (rules?.version !== 2) return null;
    const occupiedUnits = Object.values(state.landing!.cattle)
        .filter(member => member.deathWinter === null && member.farmyardId === null)
        .reduce((units, member) => units + animalProfile(state, member).capacityWeightBps, 0);
    const capacityUnits = rules.breeding.unassignedCapacityUnits;
    return { occupiedUnits, capacityUnits, overcrowdingUnits: Math.max(0, occupiedUnits - capacityUnits) };
}
/** Farmyard is a live function of an occupied permanent home, not another building. */
export function farmyards(state:SimulationState) {
    if(!state.mechanics)return [];
    return Object.values(state.households).flatMap(home=>{
        const residence=home.residenceId?state.residences[home.residenceId]:null;
        const building=residence?.buildingId?state.buildings[residence.buildingId]:null;
        if(residence?.kind!=='house'||building?.kind!=='house'||!home.memberIds.some(id=>state.personas[id].deathWinter===null&&state.personas[id].occupation==='farmer'))return [];
        const animals = Object.values(state.landing?.cattle ?? {})
            .filter(animal => animal.deathWinter === null && animal.farmyardId === building.id);
        const occupants = animals.length;
        const occupiedUnits = animals.reduce((units, animal) =>
            units + animalProfile(state, animal).capacityWeightBps, 0);
        const capacity=state.landing?.config.farmyardCapacity??4;
        const overcrowdingUnits = Math.max(0, occupiedUnits - capacity * 10000);
        return [{ id: building.id, householdId: home.id, capacity, occupants,
            occupancy: occupiedUnits / 10000, overcrowding: overcrowdingUnits / 10000,
            overcrowdingUnits }];
    });
}
export function reconcileFarmyards(state:SimulationState,previousIds:string[]):void {
    const current=farmyards(state),ids=new Set(current.map(f=>f.id));
    for(const cattle of Object.values(state.landing?.cattle??{}))if(cattle.farmyardId!==null&&!ids.has(cattle.farmyardId))cattle.farmyardId=null;
    for(const id of [...new Set([...previousIds,...ids])].sort())if(previousIds.includes(id)!==ids.has(id))state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type:'FarmyardFunctionChanged',details:eventFacts(state,{buildingId:id,active:ids.has(id)})});
}
