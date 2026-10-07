import {farmyards} from './Farmyards';
import type {SimulationState} from './SimulationCore';
import type {Cattle} from './Landing';
export function cattleSheltered(state:SimulationState,cattle:Cattle):boolean {return cattle.farmyardId!==null&&farmyards(state).some(f=>f.id===cattle.farmyardId);}
function emit(state:SimulationState,type:string,details:Record<string,unknown>):void {state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type,details});}
export function cattleFoodNeed(state:SimulationState):number {
    const landing=state.landing;if(!landing)return 0;
    return Object.values(landing.cattle).reduce((need,c)=>need+(c.deathWinter===null?(state.time.winter-c.birthWinter>=landing.config.cattleAdultAge?landing.config.adultCattleFood:landing.config.calfFood):0),0);
}
export function stepCattleOutput(state:SimulationState):void {
    const landing=state.landing;if(!landing)return;
    const winter=state.time.tick===0?state.time.winter-1:state.time.winter;
    for(const id of Object.keys(landing.cattle).sort()){
        const cow=landing.cattle[id];if(cow.deathWinter!==null||cow.sex!=='female'||winter-cow.birthWinter<landing.config.cattleAdultAge)continue;
        cow.foodProgress+=landing.config.cowFoodPerWinter*(cattleSheltered(state,cow)?10000:landing.config.exposedProductivityBps);
        const scale=state.ticksPerWinter*10000,units=Math.floor(cow.foodProgress/scale);
        if(units){cow.foodProgress%=scale;state.stocks.food+=units;emit(state,'CattleFoodProduced',{cattleId:id,units,sheltered:cattleSheltered(state,cow)});}
    }
}
export function consumeCattleFood(state:SimulationState):void {
    if(!state.landing)return;
    const need=cattleFoodNeed(state),units=Math.min(need,state.stocks.food);state.stocks.food-=units;
    emit(state,'CattleFoodConsumed',{units,required:need,shortfall:need-units,cattleIds:Object.values(state.landing.cattle).filter(c=>c.deathWinter===null).map(c=>c.id).sort()});
}
