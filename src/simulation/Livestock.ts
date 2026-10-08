import {weatherProfile,weatherFacts} from './Weather';
import {farmyards} from './Farmyards';
import type {SimulationState} from './SimulationCore';
import type {Cattle} from './Landing';
export function cattleSheltered(state:SimulationState,cattle:Cattle):boolean {return cattle.farmyardId!==null&&farmyards(state).some(f=>f.id===cattle.farmyardId);}
function emit(state:SimulationState,type:string,details:Record<string,unknown>):void {state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type,details});}
export function cattleFoodNeed(state:SimulationState):number {
    const landing=state.landing;if(!landing)return 0;
    return Object.values(landing.cattle).reduce((need,c)=>need+(c.deathWinter===null?(state.time.winter-c.birthWinter>=landing.config.cattleAdultAge?landing.config.adultCattleFood*weatherProfile(state).cattleConsumptionMultiplier:landing.config.calfFood):0),0);
}
export function stepCattleOutput(state:SimulationState):void {
    const landing=state.landing;if(!landing)return;
    const winter=state.time.tick===0?state.time.winter-1:state.time.winter;
    const shelteredIds=new Set(farmyards(state).map(f=>f.id));
    for(const id of Object.keys(landing.cattle).sort()){
        const cow=landing.cattle[id];if(cow.deathWinter!==null||cow.sex!=='female'||winter-cow.birthWinter<landing.config.cattleAdultAge)continue;
        const sheltered=cow.farmyardId!==null&&shelteredIds.has(cow.farmyardId);
        cow.foodProgress+=landing.config.cowFoodPerWinter*Math.floor((sheltered?10000:landing.config.exposedProductivityBps)*weatherProfile(state).foodProductionBps/10000);
        const scale=state.ticksPerWinter*10000,units=Math.floor(cow.foodProgress/scale);
        if(units){cow.foodProgress%=scale;state.stocks.food+=units;emit(state,'CattleFoodProduced',{cattleId:id,units,sheltered,...weatherFacts(state)});}
    }
}
export function consumeCattleFood(state:SimulationState):void {
    if(!state.landing)return;
    const need=cattleFoodNeed(state),units=Math.min(need,state.stocks.food);state.stocks.food-=units;
    emit(state,'CattleFoodConsumed',{units,required:need,shortfall:need-units,...weatherFacts(state),cattleIds:Object.values(state.landing.cattle).filter(c=>c.deathWinter===null).map(c=>c.id).sort()});
}
export function inspectCattle(state:SimulationState,id:string) {
    const cattle=state.landing?.cattle[id];if(!cattle)throw new Error('Unknown cattle');
    const age=(cattle.deathWinter??state.time.winter)-cattle.birthWinter;
    const slaughterFood=age<state.landing!.config.cattleYoungAdultAge?5:age<state.landing!.config.cattleAdultAge?10:state.landing!.config.slaughterFood;
    return {...cattle,age,slaughterFood,stage:age<state.landing!.config.cattleYoungAdultAge?'Young':age<state.landing!.config.cattleAdultAge?'Young Adult':'Adult',sheltered:cattle.deathWinter===null&&cattleSheltered(state,cattle),overcrowding:farmyards(state).find(f=>f.id===cattle.farmyardId)?.overcrowding??0,mortalityRiskBps:cattle.deathWinter===null?cattleMortalityRisk(state,cattle):0};
}

export function resolveCattleBirths(state:SimulationState,chance:(bps:number)=>boolean):void {
    const landing=state.landing;if(!landing)return;
    const config=landing.config,winter=state.time.winter;
    const eligible=Object.values(landing.cattle).filter(c=>c.deathWinter===null&&winter-c.birthWinter>=config.cattleFertileMinAge&&winter-c.birthWinter<=config.cattleFertileMaxAge).sort((a,b)=>a.id.localeCompare(b.id));
    for(const mother of eligible.filter(c=>c.sex==='female')){
        if(mother.lastCalvingWinter!==null&&winter-mother.lastCalvingWinter<config.cattleBirthInterval)continue;
        const father=eligible.find(c=>c.sex==='male'&&c.farmyardId===mother.farmyardId);
        if(!father||!chance(config.cattleBirthChanceBps))continue;
        let n=Object.keys(landing.cattle).length+1;while(landing.cattle[`cattle-${n}`])n++;
        const calf:Cattle={id:`cattle-${n}`,sex:chance(5000)?'female':'male',birthWinter:winter,deathWinter:null,parentIds:[mother.id,father.id],origin:'reproduction',lastCalvingWinter:null,farmyardId:mother.farmyardId,foodProgress:0};
        landing.cattle[calf.id]=calf;mother.lastCalvingWinter=winter;
        emit(state,'CattleBorn',{cattleId:calf.id,parentIds:[...calf.parentIds],sex:calf.sex,age:0,farmyardId:calf.farmyardId});
    }
}

export function cattleMortalityRisk(state:SimulationState,cattle:Cattle):number {
    const config=state.landing!.config,age=state.time.winter-cattle.birthWinter;
    const base=age<2?config.cattleMortalityYoungBps:age<10?config.cattleMortalityAdultBps:age<15?config.cattleMortalityOlderBps:config.cattleMortalityOldBps;
    const crowding=farmyards(state).find(f=>f.id===cattle.farmyardId)?.overcrowding??0;
    return Math.min(10000,base+crowding*config.cattleCrowdingBps+config.cattleWeatherMortalityBps+(cattleSheltered(state,cattle)?0:weatherProfile(state).exposedCattleMortalityBps));
}
export function resolveCattleMortality(state:SimulationState,chance:(bps:number)=>boolean):void {
    if(!state.landing)return;
    // Snapshot risks before removing animals: every herd member faces the same occupancy.
    const deaths=Object.values(state.landing.cattle).filter(c=>c.deathWinter===null).sort((a,b)=>a.id.localeCompare(b.id)).map(c=>({c,risk:cattleMortalityRisk(state,c),sheltered:cattleSheltered(state,c),weatherExposureBps:cattleSheltered(state,c)?0:weatherProfile(state).exposedCattleMortalityBps})).filter(({risk})=>chance(risk));
    for(const {c,risk,sheltered,weatherExposureBps} of deaths){
        const farmyardId=c.farmyardId;c.deathWinter=state.time.winter;c.farmyardId=null;
        emit(state,'CattleDied',{cattleId:c.id,parentIds:[...c.parentIds],sex:c.sex,age:state.time.winter-c.birthWinter,farmyardId,mortalityRiskBps:risk,...(state.weather?.config.enabled?{sheltered,weatherExposureBps,...weatherFacts(state)}:{})});
    }
}
