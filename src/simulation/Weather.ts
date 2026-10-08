import {farmyards} from './Farmyards';
import type {SimulationState} from './SimulationCore';
import {randomUint} from './Random';
export const weatherClasses=['Mild','Normal','Harsh','Severe'] as const;
export type WeatherClass=typeof weatherClasses[number];
export type WeatherProfile={probabilityBps:number;foodProductionBps:number;materialsProductionBps?:number;residentConsumptionBps?:number;cattleConsumptionBps?:number;cattleConsumptionMultiplier:number;tentMortalityBps:number;exposedCattleMortalityBps:number;travelDurationBps:number;travelRiskBps:number};
export type WeatherConfig={enabled:boolean;profiles:Record<WeatherClass,WeatherProfile>};
export type WeatherState={version:1;config:WeatherConfig;regions:Record<string,{winter:number;class:WeatherClass}>};
const profile=(probabilityBps:number,foodProductionBps:number,cattleConsumptionMultiplier:number,tentMortalityBps:number,exposedCattleMortalityBps:number,travelDurationBps:number,travelRiskBps:number):WeatherProfile=>({probabilityBps,foodProductionBps,cattleConsumptionMultiplier,tentMortalityBps,exposedCattleMortalityBps,travelDurationBps,travelRiskBps});
export const defaultWeatherConfig:WeatherConfig={enabled:true,profiles:{Mild:profile(2000,11000,1,0,0,10000,0),Normal:profile(5500,10000,1,0,0,10000,0),Harsh:{...profile(2000,0,1,50,500,12500,500),materialsProductionBps:0,residentConsumptionBps:15000,cattleConsumptionBps:15000},Severe:profile(500,5000,3,200,1500,15000,1500)}};
export function initializeWeather(state:SimulationState,overrides:Partial<WeatherConfig>={}):void {
    state.weather={version:1,config:structuredClone({...defaultWeatherConfig,...overrides}),regions:{}};
    validateWeather(state,false);determineWeather(state);
}
export function determineWeather(state:SimulationState):void {
    const weather=state.weather;if(!weather?.config.enabled||!state.landing)return;
    const regionId=state.landing.region.id;
    if(weather.regions[regionId]?.winter===state.time.winter)return;
    const roll=randomUint(state),scale=4294967296;let threshold=0;
    const kind=weatherClasses.find(c=>{threshold+=weather.config.profiles[c].probabilityBps;return roll<Math.floor(threshold*scale/10000);})!;
    weather.regions[regionId]={winter:state.time.winter,class:kind};
    state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type:'WinterWeatherDetermined',details:{regionId,winter:state.time.winter,weatherClass:kind}});
}
export function inspectWeather(state:SimulationState){
    const current=state.landing?state.weather?.regions[state.landing.region.id]:undefined;
    return {enabled:state.weather?.config.enabled??false,regionId:state.landing?.region.id??null,winter:current?.winter??state.time.winter,class:current?.class??null,modifiers:current?structuredClone(state.weather!.config.profiles[current.class]):null};
}
export function validateWeather(state:SimulationState,requireCurrent=true):void {
    const weather=state.weather;if(!weather)return;
    if(weather.version!==1||!state.landing||!weather.config||typeof weather.config.enabled!=='boolean'||Object.keys(weather.config).sort().join(',')!=='enabled,profiles')throw new Error('Invalid weather configuration');
    if(!weather.config.profiles||Object.keys(weather.config.profiles).sort().join(',')!==[...weatherClasses].sort().join(','))throw new Error('Invalid weather classes');
    let total=0;
    for(const kind of weatherClasses){
        const p=weather.config.profiles[kind];
        if(!p||Object.keys(defaultWeatherConfig.profiles.Normal).some(key=>!Object.hasOwn(p,key))||Object.keys(p).some(key=>!Object.hasOwn(defaultWeatherConfig.profiles.Normal,key)&&!['materialsProductionBps','residentConsumptionBps','cattleConsumptionBps'].includes(key)))throw new Error('Invalid weather profile');
        for(const [key,value] of Object.entries(p))if(!Number.isSafeInteger(value)||value<0||value>(['probabilityBps','tentMortalityBps','exposedCattleMortalityBps','travelRiskBps'].includes(key)?10000:key==='cattleConsumptionMultiplier'?100:100000))throw new Error('Invalid weather modifier');
        total+=p.probabilityBps;
    }
    if(total!==10000||!weather.regions||typeof weather.regions!=='object'||Array.isArray(weather.regions))throw new Error('Invalid weather distribution');
    const ids=Object.keys(weather.regions);
    if(!weather.config.enabled&&ids.length)throw new Error('Disabled weather cannot have active regions');
    if(weather.config.enabled&&requireCurrent&&(ids.length!==1||ids[0]!==state.landing.region.id))throw new Error('Missing region weather');
    for(const [id,current] of Object.entries(weather.regions))if(id!==state.landing.region.id||!current||current.winter!==state.time.winter||!weatherClasses.includes(current.class)||Object.keys(current).sort().join(',')!=='class,winter')throw new Error('Invalid current weather');
}
export function weatherProfile(state:SimulationState):WeatherProfile {
    const current=state.landing?state.weather?.regions[state.landing.region.id]:undefined;
    return state.weather?.config.enabled&&current?state.weather.config.profiles[current.class]:defaultWeatherConfig.profiles.Normal;
}
/** Outcomes on an incoming boundary still carry the outgoing weather Winter. */
export function weatherFacts(state:SimulationState):Record<string,unknown> {
    const w=inspectWeather(state);return w.enabled?{weatherClass:w.class,weatherWinter:w.winter,regionId:w.regionId}:{};
}
export function permanentlySheltered(state:SimulationState,id:string):boolean {
    const home=Object.values(state.households).find(h=>h.memberIds.includes(id));
    const residence=home?.residenceId?state.residences[home.residenceId]:undefined;
    return residence?.kind==='house'&&residence.buildingId!==null&&state.buildings[residence.buildingId]?.kind==='house';
}
export function personaWeatherExposure(state:SimulationState,id:string):number {return permanentlySheltered(state,id)?0:weatherProfile(state).tentMortalityBps;}

export function inspectWeatherExposure(state:SimulationState) {
    const residents=Object.values(state.personas).filter(p=>p.deathWinter===null);
    const cattle=Object.values(state.landing?.cattle??{}).filter(c=>c.deathWinter===null);
    const active=new Set(farmyards(state).map(f=>f.id));
    return {residentIds:residents.filter(p=>!permanentlySheltered(state,p.id)).map(p=>p.id).sort(),cattleIds:cattle.filter(c=>c.farmyardId===null||!active.has(c.farmyardId)).map(c=>c.id).sort()};
}
