import {eventFacts} from './EventFacts';
import {canPartner} from './FamilyMechanics';
import {farmyards} from './Farmyards';
import type {SimulationState, Occupation} from './SimulationCore';
import {initializeMechanics} from './Mechanics';
import type {PrototypeConfig} from './Mechanics';
import {generateCharacterDNA} from '../characters/generateCharacterDNA';
import {characterName, fullName} from '../characters/naming/generateName';
import {cattleSheltered} from './Livestock';
import {seededRandom} from '../characters/seededRandom';

export type LandingConfig = {initialFood:number;initialMaterials:number;longshipSalvage:number;cattleAdultAge:number;cattleYoungAdultAge:number;adultCattleFood:number;calfFood:number;cowFoodPerWinter:number;exposedProductivityBps:number;farmyardCapacity:number;slaughterFood:number;foundingCoupleChanceBps:number;foundingCoupleCap:number;cattleBirthChanceBps:number;cattleFertileMinAge:number;cattleFertileMaxAge:number;cattleBirthInterval:number;cattleMortalityYoungBps:number;cattleMortalityAdultBps:number;cattleMortalityOlderBps:number;cattleMortalityOldBps:number;cattleCrowdingBps:number;cattleWeatherMortalityBps:number;};
export const defaultLandingConfig:LandingConfig={initialFood:30,initialMaterials:5,longshipSalvage:20,cattleAdultAge:2,cattleYoungAdultAge:1,adultCattleFood:1,calfFood:0,cowFoodPerWinter:4,exposedProductivityBps:5000,farmyardCapacity:4,slaughterFood:15,foundingCoupleChanceBps:5000,foundingCoupleCap:3,cattleBirthChanceBps:5000,cattleFertileMinAge:2,cattleFertileMaxAge:12,cattleBirthInterval:2,cattleMortalityYoungBps:200,cattleMortalityAdultBps:50,cattleMortalityOlderBps:500,cattleMortalityOldBps:1500,cattleCrowdingBps:200,cattleWeatherMortalityBps:0};
export type Cattle = {id:string;sex:'female'|'male';birthWinter:number;deathWinter:number|null;parentIds:string[];origin:'founding'|'reproduction';lastCalvingWinter:number|null;farmyardId:string|null;foodProgress:number};
export type LandingState = {version:3;config:LandingConfig;region:{id:string;settledByClanId:string|null};founderIds:string[];longships:Record<string,{id:string;acquiredWinter:number;salvagedWinter:number|null}>;cattle:Record<string,Cattle>};

export function createCampaign(seed:number, overrides:Partial<LandingConfig>={}, mechanicsOverrides:Partial<PrototypeConfig>={}):SimulationState {
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed must be uint32');
    const config={...defaultLandingConfig,...overrides};
    for(const value of Object.values(config))if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid landing configuration');
    const state:SimulationState={schemaVersion:1,seed,rngState:seed,ticksPerWinter:1000,time:{winter:800,tick:0},clan:{id:'founding-clan',name:'Landing party'},personas:{},families:{},households:{},residences:{},buildings:{},stocks:{food:config.initialFood,materials:config.initialMaterials},events:[]};
    const random=seededRandom(seed,'founding-party-v1');
    const sexes:('female'|'male')[]=['female','female','female','female','male','male','male','male',random()<.5?'female':'male',random()<.5?'female':'male'];
    for(let i=sexes.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[sexes[i],sexes[j]]=[sexes[j],sexes[i]];}
    const roles:Occupation[]=['farmer','fisher','hunter','woodworker'];
    for(let i=0;i<10;i++){
        const id=`founder-${i+1}`,age=18+Math.floor(random()*23),dna={...generateCharacterDNA(Math.floor(random()*4294967296)),sex:sexes[i],age};
        const occupation=roles[Math.floor(random()*roles.length)],experience=Math.floor(random()*Math.min(6,age-15));
        state.personas[id]={id,name:fullName(characterName(dna)),birthWinter:800-age,deathWinter:null,originClanId:state.clan.id,dna,parentIds:[],partnerId:null,occupation,occupationHistory:[{occupation,startedAt:{winter:800-experience,tick:0},endedAt:null}],workProgress:0};
        state.households[id]={id,memberIds:[id],residenceId:`tent-${id}`};
        state.residences[`tent-${id}`]={id:`tent-${id}`,kind:'tent',buildingId:null};
    }
    state.mechanics=initializeMechanics(state,mechanicsOverrides);
    state.landing={version:3,config,region:{id:'landing-region',settledByClanId:null},founderIds:Object.keys(state.personas),longships:{'founding-longship':{id:'founding-longship',acquiredWinter:800,salvagedWinter:null}},cattle:{}};
    for(let i=1;i<=3;i++)state.landing.cattle[`cattle-${i}`]={id:`cattle-${i}`,sex:i===3?'male':'female',birthWinter:797,deathWinter:null,parentIds:[],origin:'founding',lastCalvingWinter:null,farmyardId:null,foodProgress:0};
    state.events.push({id:'event-1',time:{...state.time},type:'FoundingPartyLanded',details:{regionId:'landing-region',founderIds:[...state.landing.founderIds],longshipIds:['founding-longship'],cattleIds:Object.keys(state.landing.cattle),stocks:{...state.stocks}}});
    // A separate stream preserves individual founder identities when pairing settings change.
    const pairRandom=seededRandom(seed,'founding-couples-v1');
    const available=Object.keys(state.personas);
    for(let i=available.length-1;i>0;i--){const j=Math.floor(pairRandom()*(i+1));[available[i],available[j]]=[available[j],available[i]];}
    let couples=0;
    while(available.length>0&&couples<config.foundingCoupleCap){
        const aId=available.shift()!;
        const index=available.findIndex(bId=>canPartner(state,aId,bId));
        if(index<0)continue;
        const bId=available.splice(index,1)[0];
        if(pairRandom()*10000>=config.foundingCoupleChanceBps)continue;
        state.personas[aId].partnerId=bId;state.personas[bId].partnerId=aId;
        const [homeId,retiredHomeId]=[aId,bId].sort((a,b)=>Number(a.split('-')[1])-Number(b.split('-')[1]));
        state.households[homeId].memberIds.push(retiredHomeId);
        delete state.residences[state.households[retiredHomeId].residenceId!];delete state.households[retiredHomeId];
        const familyId=`founding-family-${++couples}`;
        state.families[familyId]={id:familyId,memberIds:[aId,bId]};
        emit(state,'FoundingPartnershipPresent',{participants:[aId,bId],householdId:homeId});
    }
    return state;
}

export type LandingCommand={type:'KeepLongship'|'SalvageLongship';longshipId:string}|{type:'AssignCattle';cattleId:string;farmyardId:string|null}|{type:'SlaughterCattle';cattleId:string};
export function isLandingCommand(command:{type:string}):boolean {return ['KeepLongship','SalvageLongship','AssignCattle','SlaughterCattle'].includes(command.type);}
function emit(state:SimulationState,type:string,details:Record<string,unknown>):void {
    state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type,details:eventFacts(state,details)});
}
export function applyLandingCommand(state:SimulationState,command:LandingCommand):void {
    const landing=state.landing;if(!landing)throw new Error('No landing assets');
    if(command.type==='SlaughterCattle'){
        const cattle=landing.cattle[command.cattleId];if(!cattle||cattle.deathWinter!==null)throw new Error('Living cattle required');
        const farmyardId=cattle.farmyardId;cattle.deathWinter=state.time.winter;cattle.farmyardId=null;state.stocks.food+=landing.config.slaughterFood;
        emit(state,'CattleSlaughtered',{cattleId:cattle.id,food:landing.config.slaughterFood,parentIds:[...cattle.parentIds],sex:cattle.sex,age:state.time.winter-cattle.birthWinter,farmyardId});return;
    }
    if(command.type==='AssignCattle'){
        const cattle=landing.cattle[command.cattleId];if(!cattle||cattle.deathWinter!==null)throw new Error('Living cattle required');
        if(command.farmyardId!==null&&!farmyards(state).some(f=>f.id===command.farmyardId))throw new Error('Active farmer household in a permanent home required');
        cattle.farmyardId=command.farmyardId;
        emit(state,'CattleAssigned',{cattleId:cattle.id,farmyardId:command.farmyardId});return;
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
    return {winter:state.time.winter,founders:landing.founderIds.length,food:state.stocks.food,materials:state.stocks.materials,longships,maritimeCapable:longships>0,cattle:Object.values(landing.cattle).filter(c=>c.deathWinter===null).length,buildings:Object.keys(state.buildings).length,farmyards:farmyards(state),unshelteredCattle:Object.values(landing.cattle).filter(c=>c.deathWinter===null&&!cattleSheltered(state,c)).length};
}

export function validateLanding(state:SimulationState):void {
    const landing=state.landing;if(!landing)return;
    const fail=(message:string):never=>{throw new Error(message);};
    const uint=(n:number,max=Number.MAX_SAFE_INTEGER):void=>{if(!Number.isSafeInteger(n)||n<0||n>max)fail('Invalid landing integer');};
    if(landing.version!==3||!state.mechanics)fail('Unsupported landing state');
    if(!landing.config||Object.keys(landing.config).length!==Object.keys(defaultLandingConfig).length)fail('Invalid landing config');
    for(const key of Object.keys(defaultLandingConfig) as (keyof LandingConfig)[])uint(landing.config[key],(key.endsWith('Bps'))?10000:key==='foundingCoupleCap'?3:key==='cowFoodPerWinter'?1000000:1000000000);
    if(landing.config.cattleFertileMinAge<landing.config.cattleAdultAge||landing.config.cattleFertileMaxAge<landing.config.cattleFertileMinAge||landing.config.cattleBirthInterval<1)fail('Invalid cattle fertility configuration');
    if(landing.config.farmyardCapacity===0||landing.config.cattleYoungAdultAge===0||landing.config.cattleYoungAdultAge>landing.config.cattleAdultAge||landing.config.calfFood>landing.config.adultCattleFood)fail('Invalid cattle configuration');
    if(!landing.region?.id||![null,state.clan.id].includes(landing.region.settledByClanId))fail('Invalid landing region');
    if(!Array.isArray(landing.founderIds)||landing.founderIds.length!==10||new Set(landing.founderIds).size!==10||landing.founderIds.some(id=>!Object.hasOwn(state.personas,id)))fail('Invalid founders');
    if(!landing.longships||!landing.cattle)fail('Missing founding assets');
    for(const [id,ship] of Object.entries(landing.longships)){
        if(ship.id!==id)fail('Invalid longship identity');uint(ship.acquiredWinter,state.time.winter);
        if(ship.salvagedWinter!==null){uint(ship.salvagedWinter,state.time.winter);if(ship.salvagedWinter<ship.acquiredWinter)fail('Invalid salvage date');}
    }
    for(const [id,cattle] of Object.entries(landing.cattle)){
        if(cattle.id!==id||!['female','male'].includes(cattle.sex)||!['founding','reproduction'].includes(cattle.origin)||!Array.isArray(cattle.parentIds))fail('Invalid cattle identity');
        if(cattle.lastCalvingWinter!==null){uint(cattle.lastCalvingWinter,state.time.winter);if(cattle.sex!=='female'||cattle.lastCalvingWinter<cattle.birthWinter)fail('Invalid calving date');}
        uint(cattle.birthWinter,state.time.winter);uint(cattle.foodProgress,state.ticksPerWinter*10000-1);
        if(cattle.deathWinter!==null){uint(cattle.deathWinter,state.time.winter);if(cattle.deathWinter<cattle.birthWinter||cattle.farmyardId!==null)fail('Invalid cattle death');}
        if(cattle.farmyardId!==null&&!farmyards(state).some(f=>f.id===cattle.farmyardId))fail('Invalid cattle shelter');
        if(new Set(cattle.parentIds).size!==cattle.parentIds.length||(cattle.origin==='founding'?cattle.parentIds.length!==0:cattle.parentIds.length!==2))fail('Invalid cattle genealogy');
        if(cattle.origin==='reproduction'&&(landing.cattle[cattle.parentIds[0]]?.sex!=='female'||landing.cattle[cattle.parentIds[1]]?.sex!=='male'))fail('Invalid cattle genealogy');
        for(const parent of cattle.parentIds)if(!Object.hasOwn(landing.cattle,parent)||landing.cattle[parent].birthWinter>=cattle.birthWinter)fail('Invalid cattle genealogy');
    }
    for(const residence of Object.values(state.residences))if(residence.buildingId!==null&&state.buildings[residence.buildingId]?.kind!=='house')fail('Residence needs a house');
}

/** Explicit upgrade of the superseded standalone-building prototype, on detached JSON only. */
export function migrateLanding(state:SimulationState):void {
    const landing=state.landing;
    if(!landing)return;
    // Earlier extension-2 saves retain their existing households; no relationships are rerolled.
    if((landing.version as number)===1||(landing.version as number)===2){
        if(!Object.hasOwn(landing.config,'foundingCoupleChanceBps'))landing.config.foundingCoupleChanceBps=defaultLandingConfig.foundingCoupleChanceBps;
        if(!Object.hasOwn(landing.config,'foundingCoupleCap'))landing.config.foundingCoupleCap=defaultLandingConfig.foundingCoupleCap;
    }
    if((landing.version as number)===1){
    if(!state.mechanics||!Array.isArray(state.events))throw new Error('Invalid old landing save');
    const config=landing.config as LandingConfig&{farmyardCost?:number};
    if(!Number.isSafeInteger(config.farmyardCost)||config.farmyardCost!<0)throw new Error('Invalid old Farmyard cost');
    const retiredIds:string[]=[];
    for(const building of Object.values(state.buildings))if(building.kind==='farmyard'){
        const info=state.mechanics.buildings[building.id];
        if(!info||!Number.isSafeInteger(info.investedMaterials)||info.investedMaterials<0)throw new Error('Invalid old Farmyard investment');
        if(Object.values(state.residences).some(r=>r.buildingId===building.id))throw new Error('Old Farmyard cannot be a residence');
        retiredIds.push(building.id);
        delete state.buildings[building.id];delete state.mechanics.buildings[building.id];
    }
    for(const cattle of Object.values(landing.cattle))if(cattle.farmyardId!==null&&retiredIds.includes(cattle.farmyardId))cattle.farmyardId=null;
    delete config.farmyardCost;(landing as unknown as {version:number}).version=2;
    emit(state,'FarmyardModelMigrated',{retiredBuildingIds:retiredIds.sort()});
    }
    if((landing.version as number)===2){
        Object.assign(landing.config,{cattleYoungAdultAge:Math.min(1,landing.config.cattleAdultAge),"cattleBirthChanceBps": 5000, "cattleFertileMinAge": Math.max(2,landing.config.cattleAdultAge), "cattleFertileMaxAge": Math.max(12,landing.config.cattleAdultAge), "cattleBirthInterval": 2, "cattleMortalityYoungBps": 200, "cattleMortalityAdultBps": 50, "cattleMortalityOlderBps": 500, "cattleMortalityOldBps": 1500, "cattleCrowdingBps": 200, "cattleWeatherMortalityBps": 0},{cattleBirthChanceBps:0,cattleMortalityYoungBps:0,cattleMortalityAdultBps:0,cattleMortalityOlderBps:0,cattleMortalityOldBps:0,cattleCrowdingBps:0});
        for(const cattle of Object.values(landing.cattle))cattle.lastCalvingWinter=null;
        landing.version=3;
    }
}
