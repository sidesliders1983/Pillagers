import type {SimulationState} from './SimulationCore';
/** Farmyard is a live function of an occupied permanent home, not another building. */
export function farmyards(state:SimulationState) {
    if(!state.mechanics)return [];
    return Object.values(state.households).flatMap(home=>{
        const residence=home.residenceId?state.residences[home.residenceId]:null;
        const building=residence?.buildingId?state.buildings[residence.buildingId]:null;
        if(residence?.kind!=='house'||building?.kind!=='house'||!home.memberIds.some(id=>state.personas[id].deathWinter===null&&state.personas[id].occupation==='farmer'))return [];
        const occupants=Object.values(state.landing?.cattle??{}).filter(c=>c.deathWinter===null&&c.farmyardId===building.id).length;
        const capacity=state.landing?.config.farmyardCapacity??4;
        return [{id:building.id,householdId:home.id,capacity,occupants,overcrowding:Math.max(0,occupants-capacity)}];
    });
}
export function reconcileFarmyards(state:SimulationState,previousIds:string[]):void {
    const current=farmyards(state),ids=new Set(current.map(f=>f.id));
    for(const cattle of Object.values(state.landing?.cattle??{}))if(cattle.farmyardId!==null&&!ids.has(cattle.farmyardId))cattle.farmyardId=null;
    for(const id of [...new Set([...previousIds,...ids])].sort())if(previousIds.includes(id)!==ids.has(id))state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type:'FarmyardFunctionChanged',details:{buildingId:id,active:ids.has(id)}});
}
