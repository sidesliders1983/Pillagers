import type {SimulationState, Occupation} from './SimulationCore';
import {initializeMechanics} from './Mechanics';
import type {PrototypeConfig} from './Mechanics';
import {generateCharacterDNA} from '../characters/generateCharacterDNA';
import {characterName, fullName} from '../characters/naming/generateName';
import {cattleSheltered} from './Livestock';
import {seededRandom} from '../characters/seededRandom';

export type LandingConfig = {initialFood:number;initialMaterials:number;longshipSalvage:number;cattleAdultAge:number;adultCattleFood:number;calfFood:number;cowFoodPerWinter:number;exposedProductivityBps:number;farmyardCost:number;farmyardCapacity:number;slaughterFood:number};
export const defaultLandingConfig:LandingConfig={initialFood:30,initialMaterials:5,longshipSalvage:20,cattleAdultAge:2,adultCattleFood:1,calfFood:0,cowFoodPerWinter:4,exposedProductivityBps:5000,farmyardCost:10,farmyardCapacity:4,slaughterFood:15};
export type Cattle = {id:string;sex:'female'|'male';birthWinter:number;deathWinter:number|null;parentIds:string[];origin:'founding';farmyardId:string|null;foodProgress:number};
export type LandingState = {version:1;config:LandingConfig;region:{id:string;settledByClanId:string|null};founderIds:string[];longships:Record<string,{id:string;acquiredWinter:number;salvagedWinter:number|null}>;cattle:Record<string,Cattle>};

export function createCampaign(seed:number, overrides:Partial<LandingConfig>={}, mechanicsOverrides:Partial<PrototypeConfig>={}):SimulationState {
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed must be uint32');
    const config={...defaultLandingConfig,...overrides};
    for(const value of Object.values(config))if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid landing configuration');
    const state:SimulationState={schemaVersion:1,seed,rngState:seed,ticksPerWinter:1000,time:{winter:800,tick:0},clan:{id:'founding-clan',name:'Landing party'},personas:{},families:{},households:{},residences:{},buildings:{},stocks:{food:config.initialFood,materials:config.initialMaterials},events:[]};
    const random=seededRandom(seed,'founding-party-v1');
    const sexes:('female'|'male')[]=['female','female','female','female','male','male','male','male',random()<.5?'female':'male',random()<.5?'female':'male'];
    for(let i=sexes.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[sexes[i],sexes[j]]=[sexes[j],sexes[i]];}
    const roles:Occupation[]=['farmer','fisher','hunter','textileWorker','smith','woodworker','boatbuilder','leatherAndJewelleryMaker'];
    for(let i=0;i<10;i++){
        const id=`founder-${i+1}`,age=18+Math.floor(random()*23),dna={...generateCharacterDNA(Math.floor(random()*4294967296)),sex:sexes[i],age};
        const occupation=roles[Math.floor(random()*roles.length)],experience=Math.floor(random()*Math.min(6,age-15));
        state.personas[id]={id,name:fullName(characterName(dna)),birthWinter:800-age,deathWinter:null,originClanId:state.clan.id,dna,parentIds:[],partnerId:null,occupation,occupationHistory:[{occupation,startedAt:{winter:800-experience,tick:0},endedAt:null}],workProgress:0};
        state.households[id]={id,memberIds:[id],residenceId:`tent-${id}`};
        state.residences[`tent-${id}`]={id:`tent-${id}`,kind:'tent',buildingId:null};
    }
    state.mechanics=initializeMechanics(state,mechanicsOverrides);
    state.landing={version:1,config,region:{id:'landing-region',settledByClanId:null},founderIds:Object.keys(state.personas),longships:{'founding-longship':{id:'founding-longship',acquiredWinter:800,salvagedWinter:null}},cattle:{}};
    for(let i=1;i<=3;i++)state.landing.cattle[`cattle-${i}`]={id:`cattle-${i}`,sex:i===3?'male':'female',birthWinter:797,deathWinter:null,parentIds:[],origin:'founding',farmyardId:null,foodProgress:0};
    state.events.push({id:'event-1',time:{...state.time},type:'FoundingPartyLanded',details:{regionId:'landing-region',founderIds:[...state.landing.founderIds],longshipIds:['founding-longship'],cattleIds:Object.keys(state.landing.cattle),stocks:{...state.stocks}}});
    return state;
}

export type LandingCommand={type:'KeepLongship'|'SalvageLongship';longshipId:string}|{type:'EstablishFarmyard'}|{type:'SlaughterCattle';cattleId:string};
export function isLandingCommand(command:{type:string}):boolean {return ['KeepLongship','SalvageLongship','EstablishFarmyard','SlaughterCattle'].includes(command.type);}
function emit(state:SimulationState,type:string,details:Record<string,unknown>):void {
    state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type,details});
}
export function applyLandingCommand(state:SimulationState,command:LandingCommand):void {
    const landing=state.landing;if(!landing)throw new Error('No landing assets');
    if(command.type==='SlaughterCattle'){
        const cattle=landing.cattle[command.cattleId];if(!cattle||cattle.deathWinter!==null)throw new Error('Living cattle required');
        cattle.deathWinter=state.time.winter;cattle.farmyardId=null;state.stocks.food+=landing.config.slaughterFood;
        emit(state,'CattleSlaughtered',{cattleId:cattle.id,food:landing.config.slaughterFood});return;
    }
    if(command.type==='EstablishFarmyard'){
        if(state.stocks.materials<landing.config.farmyardCost)throw new Error('Insufficient Materials');
        let n=1;while(Object.hasOwn(state.buildings,`farmyard-${n}`)||state.events.some(e=>e.details?.buildingId===`farmyard-${n}`))n++;
        const id=`farmyard-${n}`;state.stocks.materials-=landing.config.farmyardCost;
        state.buildings[id]={id,kind:'farmyard',specialization:null};
        state.mechanics!.buildings[id]={debtWinters:0,investedMaterials:landing.config.farmyardCost,upgradeLevel:0};
        for(const cattle of Object.values(landing.cattle))if(cattle.deathWinter===null&&!cattleSheltered(state,cattle))cattle.farmyardId=id;
        landing.region.settledByClanId=state.clan.id;
        emit(state,'FarmyardEstablished',{buildingId:id,cost:landing.config.farmyardCost,cattleIds:Object.values(landing.cattle).filter(c=>c.farmyardId===id).map(c=>c.id).sort()});return;
    }
    const ship=landing.longships[command.longshipId];
    if(!ship||ship.salvagedWinter!==null)throw new Error('Longship unavailable');
    if(command.type==='KeepLongship'){emit(state,'FoundingLongshipKept',{longshipId:ship.id});return;}
    ship.salvagedWinter=state.time.winter;state.stocks.materials+=landing.config.longshipSalvage;
    emit(state,'FoundingLongshipSalvaged',{longshipId:ship.id,materials:landing.config.longshipSalvage});
}
export function landingSummary(state:SimulationState) {
    const landing=state.landing;if(!landing)throw new Error('No landing assets');
    const longships=Object.values(landing.longships).filter(s=>s.salvagedWinter===null).length;
    return {winter:state.time.winter,founders:landing.founderIds.length,food:state.stocks.food,materials:state.stocks.materials,longships,maritimeCapable:longships>0,cattle:Object.values(landing.cattle).filter(c=>c.deathWinter===null).length,buildings:Object.keys(state.buildings).length,farmyards:Object.values(state.buildings).filter(b=>b.kind==='farmyard').map(b=>{const occupants=Object.values(landing.cattle).filter(c=>c.deathWinter===null&&c.farmyardId===b.id).length;return {id:b.id,capacity:landing.config.farmyardCapacity,occupants,overcrowding:Math.max(0,occupants-landing.config.farmyardCapacity)};}),unshelteredCattle:Object.values(landing.cattle).filter(c=>c.deathWinter===null&&!cattleSheltered(state,c)).length};
}

export function validateLanding(state:SimulationState):void {
    const landing=state.landing;if(!landing)return;
    const fail=(message:string):never=>{throw new Error(message);};
    const uint=(n:number,max=Number.MAX_SAFE_INTEGER):void=>{if(!Number.isSafeInteger(n)||n<0||n>max)fail('Invalid landing integer');};
    if(landing.version!==1||!state.mechanics)fail('Unsupported landing state');
    if(!landing.config||Object.keys(landing.config).length!==Object.keys(defaultLandingConfig).length)fail('Invalid landing config');
    for(const key of Object.keys(defaultLandingConfig) as (keyof LandingConfig)[])uint(landing.config[key],key==='exposedProductivityBps'?10000:key==='cowFoodPerWinter'?1000000:1000000000);
    if(landing.config.farmyardCapacity===0||landing.config.cattleAdultAge===0||landing.config.calfFood>landing.config.adultCattleFood)fail('Invalid cattle configuration');
    if(!landing.region?.id||![null,state.clan.id].includes(landing.region.settledByClanId))fail('Invalid landing region');
    if(!Array.isArray(landing.founderIds)||landing.founderIds.length!==10||new Set(landing.founderIds).size!==10||landing.founderIds.some(id=>!Object.hasOwn(state.personas,id)))fail('Invalid founders');
    if(!landing.longships||!landing.cattle)fail('Missing founding assets');
    for(const [id,ship] of Object.entries(landing.longships)){
        if(ship.id!==id)fail('Invalid longship identity');uint(ship.acquiredWinter,state.time.winter);
        if(ship.salvagedWinter!==null){uint(ship.salvagedWinter,state.time.winter);if(ship.salvagedWinter<ship.acquiredWinter)fail('Invalid salvage date');}
    }
    for(const [id,cattle] of Object.entries(landing.cattle)){
        if(cattle.id!==id||!['female','male'].includes(cattle.sex)||cattle.origin!=='founding'||!Array.isArray(cattle.parentIds))fail('Invalid cattle identity');
        uint(cattle.birthWinter,state.time.winter);uint(cattle.foodProgress,state.ticksPerWinter*10000-1);
        if(cattle.deathWinter!==null){uint(cattle.deathWinter,state.time.winter);if(cattle.deathWinter<cattle.birthWinter||cattle.farmyardId!==null)fail('Invalid cattle death');}
        if(cattle.farmyardId!==null&&state.buildings[cattle.farmyardId]?.kind!=='farmyard')fail('Invalid cattle shelter');
        for(const parent of cattle.parentIds)if(!Object.hasOwn(landing.cattle,parent)||landing.cattle[parent].birthWinter>=cattle.birthWinter)fail('Invalid cattle genealogy');
    }
    for(const building of Object.values(state.buildings))if(building.kind==='farmyard'&&(building.specialization!==null||state.mechanics!.buildings[building.id]?.upgradeLevel!==0))fail('Unsupported Farmyard specialization');
    for(const residence of Object.values(state.residences))if(residence.buildingId!==null&&state.buildings[residence.buildingId]?.kind!=='house')fail('Residence needs a house');
}
