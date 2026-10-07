import {resolveMortality,defaultMortalityBands} from './Mortality';
import type {MortalityBand} from './Mortality';
import {farmyards,reconcileFarmyards} from './Farmyards';
import {cattleFoodNeed, stepCattleOutput, consumeCattleFood} from './Livestock';
import {prohibitedKinship, resolvePartnerships, resolveBirths, isCaregiver, isProvidingCare, assignCaregiver, resolveCaregivers} from './FamilyMechanics';
import {traitKeys} from '../characters/CharacterDNA';
import type {CoreTraits, TraitKey} from '../characters/CharacterDNA';
import type {Occupation, SimulationState} from './SimulationCore';
import {personaAge} from './PersonaAge';
export const occupationIds: Occupation[] = ['farmer','herder','fisher','hunter','textileWorker','smith','woodworker','boatbuilder','trader','leatherAndJewelleryMaker'];
export type JobPrototype = {resource:'food'|'materials'|null; unitsPerWinter:number; weights:number[]; preferences:number[]};
export type PrototypeConfig = {
    mortalityBands:MortalityBand[];
    foodAdultAge:number; ageFullProductivityThrough:number; agePenaltyBpsPerWinter:number; ageProductivityFloorBps:number; collapseDebtWinters:number; salvageBps:number;
    dominantLegacyChanceBps:number;
    fertilityMinAge:number; fertilityMaxAge:number; birthCooldownWinters:number; childcareWinters:number;
    careerMinimumGainBps:number; experienceRetentionBpsPerWinter:number;
    apprenticeshipBonusBps:number; apprenticeshipTicks:number;
    switchProductivityBps:number; switchTicks:number;
    houseCost:number; baseUpkeep:number; upgradeCosts:number[]; upgradeBonusBps:number[]; tentProductivityBps:number;
    workAge:number; adultAge:number; childFood:number; adultFood:number; workPerUnit:number;
    fertilityChanceBps:number; partnershipChanceBps:number; careerReviewWinters:number;
    occupations:Record<Occupation,JobPrototype>;
};
const job = (resource:JobPrototype['resource'], unitsPerWinter:number, weights:number[], preferences:number[]):JobPrototype => ({resource,unitsPerWinter,weights,preferences});
export const defaultPrototypeConfig: PrototypeConfig = {
    mortalityBands:defaultMortalityBands,
    foodAdultAge:16,ageFullProductivityThrough:49,agePenaltyBpsPerWinter:200,ageProductivityFloorBps:5000,collapseDebtWinters:3,salvageBps:5000,
    dominantLegacyChanceBps:2500,
    fertilityMinAge:18,fertilityMaxAge:40,birthCooldownWinters:2,childcareWinters:5,
    careerMinimumGainBps:1000,experienceRetentionBpsPerWinter:100,
    apprenticeshipBonusBps:1000,apprenticeshipTicks:1000,
    switchProductivityBps:7500,switchTicks:1000,
    houseCost:10,baseUpkeep:1,upgradeCosts:[5,10,20],upgradeBonusBps:[0,2500,5000,7500],tentProductivityBps:5000,
    workAge:16,adultAge:18,childFood:1,adultFood:2,workPerUnit:10000000,
    fertilityChanceBps:2500,partnershipChanceBps:1000,careerReviewWinters:5,
    occupations: {
        farmer:job('food',10,[.3,.2,.2,.05,.25],[.7,.6,.6,.35,.25]),
        herder:job(null,0,[.2,.2,.2,.1,.3],[.6,.6,.6,.4,.3]),
        fisher:job('food',10,[.25,.35,.15,.05,.2],[.7,.8,.6,.4,.3]),
        hunter:job('food',10,[.2,.35,.15,.25,.05],[.7,.85,.6,.7,.35]),
        textileWorker:job(null,0,[.1,.35,.3,.05,.2],[.4,.8,.75,.35,.3]),
        smith:job(null,0,[.4,.1,.25,.05,.2],[.85,.5,.8,.3,.55]),
        woodworker:job('materials',5,[.25,.25,.3,.05,.15],[.7,.75,.8,.35,.35]),
        boatbuilder:job(null,0,[.25,.2,.4,.05,.1],[.7,.7,.9,.35,.35]),
        trader:job(null,0,[.05,.1,.3,.35,.2],[.4,.6,.8,.85,.25]),
        leatherAndJewelleryMaker:job(null,0,[.1,.35,.3,.1,.15],[.45,.85,.8,.45,.3]),
    },
};
export type PersonaMechanics={dominantLegacy:Partial<Record<TraitKey,string>>; lastBirthWinter:number|null; childcareUntilWinter:number; caregiverId:string|null; caregiverLocked:boolean; caregiverWorkedWinter:number|null; occupationLocked:boolean; switchedUntilTick:number; progress:Partial<Record<Occupation,number>>};
export type MechanicsState = {version:2; config:PrototypeConfig; people:Record<string,PersonaMechanics>; buildings:Record<string,{debtWinters:number; investedMaterials:number; upgradeLevel:number}>};
export function initializeMechanics(state:SimulationState, overrides:Partial<PrototypeConfig> = {}):MechanicsState {
    return {version:2,config:structuredClone({...defaultPrototypeConfig,...overrides}), people:Object.fromEntries(Object.keys(state.personas).map(id=>[id,newPersonaMechanics()])), buildings:Object.fromEntries(Object.keys(state.buildings).map(id=>[id,{debtWinters:0,investedMaterials:10,upgradeLevel:0}]))};
}
function emit(state:SimulationState,type:string,personaId?:string,details?:Record<string,unknown>) {
    state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type,...(personaId?{personaId}:{}),...(details?{details}:{})});
}
function aptitude(traits:CoreTraits, job:JobPrototype):number {
    const fit = traitKeys.reduce((sum,key,index)=>sum+job.weights[index]*(1-Math.abs(traits[key]-job.preferences[index])),0);
    return Math.round((.15+.85*fit)*10000);
}
export function foodNeed(state:SimulationState):number {
    const config=state.mechanics!.config;
    return cattleFoodNeed(state)+Object.keys(state.personas).sort().reduce((total,id)=>total+(state.personas[id].deathWinter===null?(personaAge(state,id)<config.foodAdultAge?config.childFood:config.adultFood):0),0);
}
export function occupationAptitude(state:SimulationState,id:string,role:Occupation):number {
    if(!state.mechanics||!Object.hasOwn(state.personas,id)||!occupationIds.includes(role))throw new Error('Unknown persona/occupation');
    return aptitude(state.personas[id].dna.traits,state.mechanics.config.occupations[role]);
}
export function inspectWork(state:SimulationState,id:string) {
    const person=state.personas[id];if(!person||!state.mechanics)throw new Error('Gameplay persona required');
    const config=state.mechanics.config,role=person.occupation;
    const reason=person.deathWinter!==null?'deceased':isProvidingCare(state,id)?'childcare':personaAge(state,id)<config.workAge?'underage':role===null?'unassigned':config.occupations[role].resource===null?'inactive-role':null;
    if(role===null)return {aptitudeBps:0,productivityBps:0,unitsPerWinter:0,resource:null,progress:0,reason};
    const job=config.occupations[role];
        let efficiency=aptitude(person.dna.traits,job);
        const parentExperience=person.parentIds.some(parent=>occupationExperience(state,parent,role)>=config.apprenticeshipTicks);
        if(parentExperience)efficiency=Math.floor(efficiency*(10000+config.apprenticeshipBonusBps)/10000);
        const age=personaAge(state,id);
        efficiency=Math.floor(efficiency*Math.max(config.ageProductivityFloorBps,10000-Math.max(0,age-config.ageFullProductivityThrough)*config.agePenaltyBpsPerWinter)/10000);
        const home=Object.values(state.households).find(h=>h.memberIds.includes(id));
                const residence=home?.residenceId?state.residences[home.residenceId]:undefined;
        if(!residence || residence.kind==='tent')efficiency=Math.floor(efficiency*config.tentProductivityBps/10000);
        const building=residence?.buildingId?state.buildings[residence.buildingId]:undefined;
        if(building?.specialization===role)efficiency=Math.floor(efficiency*(10000+config.upgradeBonusBps[state.mechanics!.buildings[building.id].upgradeLevel])/10000);
    const control=state.mechanics!.people[id];
        if(simulationTick(state)<control.switchedUntilTick)efficiency=Math.floor(efficiency*config.switchProductivityBps/10000);

    return {aptitudeBps:aptitude(person.dna.traits,job),productivityBps:reason===null?efficiency:0,unitsPerWinter:job.unitsPerWinter,resource:job.resource,progress:person.workProgress/config.workPerUnit,reason};
}
export function inspectBuilding(state:SimulationState,id:string) {
    const building=state.buildings[id],info=state.mechanics?.buildings[id];if(!building||!info)throw new Error('Unknown gameplay building');
    const occupied=(building.kind==='farmyard'&&Object.values(state.landing?.cattle??{}).some(c=>c.deathWinter===null&&c.farmyardId===id))||Object.values(state.households).some(h=>h.memberIds.some(p=>state.personas[p].deathWinter===null)&&h.residenceId!==null&&state.residences[h.residenceId]?.buildingId===id);
    return {occupied,upkeep:state.mechanics!.config.baseUpkeep+info.upgradeLevel,debtWinters:info.debtWinters,upgradeLevel:info.upgradeLevel,investedMaterials:info.investedMaterials};
}
export function stepMechanicsTick(state:SimulationState):void {
    const config=state.mechanics!.config;
    let previousFarmyards=farmyards(state).map(f=>f.id);
    for(const id of Object.keys(state.personas))if(isCaregiver(state,id))state.mechanics!.people[id].caregiverWorkedWinter=state.time.winter;
    const unavailable=new Set(Object.keys(state.personas).filter(id=>state.mechanics!.people[id].caregiverWorkedWinter===state.time.winter));
    const produced:{id:string;resource:'food'|'materials';units:number}[]=[];
    for(const id of Object.keys(state.personas).sort()) {
        const person=state.personas[id], role=person.occupation;
        if(isProvidingCare(state,id) || person.deathWinter!==null || role===null || personaAge(state,id)<config.workAge)continue;
        const work=inspectWork(state,id),job=config.occupations[role];
        if(job.resource===null)continue;
        const efficiency=work.productivityBps;
        const control=state.mechanics!.people[id];
        person.workProgress+=job.unitsPerWinter*efficiency;
        const units=Math.floor(person.workProgress/config.workPerUnit);
        if(units){person.workProgress%=config.workPerUnit;state.stocks[job.resource]+=units;produced.push({id,resource:job.resource,units});}
        control.progress[role]=person.workProgress;
    }
    state.time.tick++;
    if(state.time.tick===state.ticksPerWinter){state.time.tick=0;state.time.winter++;}
    for(const output of produced)emit(state,'ResourceProduced',output.id,{resource:output.resource,units:output.units});
    stepCattleOutput(state);
    if(state.time.tick===0) {
        emit(state,'WinterAdvanced');
        if(resolveMortality(state,bps=>chance(state,bps),(type,id,details)=>emit(state,type,id,details))){
            reconcileFarmyards(state,previousFarmyards);previousFarmyards=farmyards(state).map(f=>f.id);
        }
        consumeCattleFood(state);
        const need=foodNeed(state)-cattleFoodNeed(state), consumed=Math.min(need,state.stocks.food);state.stocks.food-=consumed;
        emit(state,'FoodConsumed',undefined,{units:consumed,shortfall:need-consumed});
        for(const id of Object.keys(state.buildings).sort()) {
            const {occupied,upkeep}=inspectBuilding(state,id);
            const building=state.mechanics!.buildings[id];
            if(occupied&&state.stocks.materials>=upkeep){state.stocks.materials-=upkeep;building.debtWinters=0;emit(state,'BuildingMaintained',undefined,{buildingId:id,units:upkeep});}
            else {
                building.debtWinters++;
                emit(state,'MaintenanceDebtIncreased',undefined,{buildingId:id,debtWinters:building.debtWinters,reason:occupied?'unpaid':'vacant'});
                if(building.debtWinters===config.collapseDebtWinters){
                    const salvage=Math.floor(building.investedMaterials*config.salvageBps/10000);state.stocks.materials+=salvage;
                    for(const residence of Object.values(state.residences))if(residence.buildingId===id){residence.kind='tent';residence.buildingId=null;}
                    for(const cattle of Object.values(state.landing?.cattle??{}))if(cattle.farmyardId===id)cattle.farmyardId=null;
                    delete state.buildings[id];delete state.mechanics!.buildings[id];
                    emit(state,'BuildingCollapsed',undefined,{buildingId:id,salvage});
                }
            }
        }
        reviewCareers(state);
        resolvePartnerships(state,bps=>chance(state,bps),householdId=>applyMechanicsCommand(state,{type:'HouseHousehold',householdId}),(type,personaId,details)=>emit(state,type,personaId,details));
        resolveBirths(state,bps=>chance(state,bps),()=>randomUint(state),()=>foodNeed(state),id=>{state.mechanics!.people[id]=newPersonaMechanics();},(type,personaId,details)=>emit(state,type,personaId,details),unavailable);
        resolveCaregivers(state,(type,personaId,details)=>emit(state,type,personaId,details));
        reconcileFarmyards(state,previousFarmyards);
    }
}

export type MechanicsCommand = {type:'AssignResidence'; householdId:string; residenceId:string|null}
    | {type:'SpecializeBuilding';buildingId:string;occupation:Occupation|null}
    | {type:'AssignCaregiver';motherId:string;caregiverId:string|null} | {type:'ReleaseOccupation';personaId:string} | {type:'UpgradeBuilding';buildingId:string} | {type:'BuildHouse'|'HouseHousehold';householdId:string};
export function isMechanicsCommand(command:{type:string}):boolean {return ['AssignResidence','SpecializeBuilding','UpgradeBuilding','BuildHouse','HouseHousehold','ReleaseOccupation','AssignCaregiver'].includes(command.type);}
export function applyMechanicsCommand(state:SimulationState,command:MechanicsCommand):void {
    if(!state.mechanics)throw new Error('Mechanics must be initialized');
    if(command.type==='AssignCaregiver'){assignCaregiver(state,command.motherId,command.caregiverId,true,(type,personaId,details)=>emit(state,type,personaId,details));return;}
    if(command.type==='ReleaseOccupation'){
        if(!state.personas[command.personaId]||state.personas[command.personaId].deathWinter!==null)throw new Error('Persona must be alive');
        state.mechanics.people[command.personaId].occupationLocked=false;emit(state,'OccupationReleased',command.personaId);return;
    }
    if(command.type==='SpecializeBuilding'||command.type==='UpgradeBuilding') {
        const building=state.buildings[command.buildingId];if(!building||building.kind!=='house')throw new Error('House required');
        const info=state.mechanics.buildings[building.id];
    if(command.type==='SpecializeBuilding'){
            if(command.occupation!==null&&!occupationIds.includes(command.occupation))throw new Error('Unknown occupation');
            building.specialization=command.occupation;emit(state,'BuildingSpecialized',undefined,{buildingId:building.id,occupation:command.occupation});
        } else {
            const cost=state.mechanics.config.upgradeCosts[info.upgradeLevel];
            if(cost===undefined)throw new Error('Maximum upgrade level');
            if(building.specialization===null)throw new Error('Specialization required');
            if(state.stocks.materials<cost)throw new Error('Insufficient Materials');
            state.stocks.materials-=cost;info.investedMaterials+=cost;info.upgradeLevel++;
            emit(state,'BuildingUpgraded',undefined,{buildingId:building.id,level:info.upgradeLevel,cost});
        }
        return;
    }
    const home=state.households[command.householdId];if(!home)throw new Error('Unknown household');
    if(command.type==='BuildHouse'||command.type==='HouseHousehold') {
        if(command.type==='HouseHousehold'){
            const vacant=Object.keys(state.residences).sort().find(id=>state.residences[id].kind==='house'&&!Object.values(state.households).some(h=>h.residenceId===id));
            if(vacant){applyMechanicsCommand(state,{type:'AssignResidence',householdId:home.id,residenceId:vacant});return;}
            if(state.stocks.materials<state.mechanics.config.houseCost){applyMechanicsCommand(state,{type:'AssignResidence',householdId:home.id,residenceId:null});return;}
        }
        const cost=state.mechanics.config.houseCost;if(state.stocks.materials<cost)throw new Error('Insufficient Materials');
        let n=1;while(Object.hasOwn(state.buildings,`house-${n}`)||Object.hasOwn(state.residences,`house-${n}`))n++;
        const id=`house-${n}`;state.stocks.materials-=cost;
        state.buildings[id]={id,kind:'house',specialization:null};
        state.mechanics.buildings[id]={debtWinters:0,investedMaterials:cost,upgradeLevel:0};
        state.residences[id]={id,kind:'house',buildingId:id};
        if(state.landing)state.landing.region.settledByClanId=state.clan.id;
        emit(state,'HouseBuilt',undefined,{buildingId:id,cost});
        applyMechanicsCommand(state,{type:'AssignResidence',householdId:home.id,residenceId:id});return;
    }
    if(command.type!=='AssignResidence')throw new Error('Unknown mechanics command');
    let residenceId=command.residenceId;
    if(residenceId===null){
        residenceId=`tent-${home.id}`;
        state.residences[residenceId]??={id:residenceId,kind:'tent',buildingId:null};
    }
    if(!state.residences[residenceId])throw new Error('Unknown residence');
    if(Object.values(state.households).some(h=>h.id!==home.id&&h.residenceId===residenceId))throw new Error('Residence already occupied');
    const buildingId=state.residences[residenceId].buildingId;
    if(buildingId!==null&&Object.values(state.households).some(h=>h.id!==home.id&&h.residenceId!==null&&state.residences[h.residenceId]?.buildingId===buildingId))throw new Error('Building already occupied');
    home.residenceId=residenceId;
    emit(state,'ResidenceAssigned',undefined,{householdId:home.id,residenceId});
}

function simulationTick(state:SimulationState):number {return (state.time.winter-800)*state.ticksPerWinter+state.time.tick;}
export function recordOccupationChange(state:SimulationState,id:string,next:Occupation|null,locked=true):void {
    if(!state.mechanics)return;
    const person=state.personas[id], info=state.mechanics.people[id];
    if(next!==null&&isCaregiver(state,id))throw new Error('Caregiver unavailable for work');
    info.occupationLocked=locked;
    if(person.occupation===next)return;
    if(person.occupation!==null)info.progress[person.occupation]=person.workProgress;
    person.workProgress=next===null?0:info.progress[next]??0;
    if(person.occupationHistory.length>0)info.switchedUntilTick=simulationTick(state)+state.mechanics.config.switchTicks;
}

function occupationExperience(state:SimulationState,id:string,role:Occupation):number {
    return state.personas[id].occupationHistory.filter(entry=>entry.occupation===role).reduce((ticks,entry)=>{
        const end=entry.endedAt??state.time;
        return ticks+(end.winter-entry.startedAt.winter)*state.ticksPerWinter+end.tick-entry.startedAt.tick;
    },0);
}

function reviewCareers(state:SimulationState):void {
    const config=state.mechanics!.config;
    if(config.careerReviewWinters===0||(state.time.winter-800)%config.careerReviewWinters!==0)return;
    const foodShort=state.stocks.food<foodNeed(state);
    const materialNeed=Object.values(state.households).reduce((sum,h)=>{
        const residence=h.residenceId?state.residences[h.residenceId]:undefined;
        return sum+(residence?.buildingId?config.baseUpkeep+state.mechanics!.buildings[residence.buildingId].upgradeLevel:config.houseCost);
    },0);
    const resource=foodShort?'food':state.stocks.materials<materialNeed?'materials':null;if(resource===null)return;
    for(const id of Object.keys(state.personas).sort()){
        const person=state.personas[id],info=state.mechanics!.people[id];
        if(isProvidingCare(state,id)||person.deathWinter!==null||personaAge(state,id)<config.workAge||info.occupationLocked)continue;
        const candidates=occupationIds.filter(role=>config.occupations[role].resource===resource).map(role=>({role,fit:aptitude(person.dna.traits,config.occupations[role])})).sort((a,b)=>b.fit-a.fit||occupationIds.indexOf(a.role)-occupationIds.indexOf(b.role));
        const best=candidates[0];if(!best||best.role===person.occupation)continue;
        if(person.occupation!==null){
            const currentFit=aptitude(person.dna.traits,config.occupations[person.occupation]);
            const retention=Math.floor(occupationExperience(state,id,person.occupation)/state.ticksPerWinter)*config.experienceRetentionBpsPerWinter;
            if(best.fit-currentFit<config.careerMinimumGainBps+retention)continue;
        }
        recordOccupationChange(state,id,best.role,false);
        const active=person.occupationHistory.at(-1);if(active?.endedAt===null)active.endedAt={...state.time};
        person.occupation=best.role;person.occupationHistory.push({occupation:best.role,startedAt:{...state.time},endedAt:null});
        emit(state,'OccupationAssigned',id,{occupation:best.role,name:person.name,age:personaAge(state,id),autonomous:true});
    }
}

function randomUint(state:SimulationState):number {state.rngState=(Math.imul(state.rngState,1664525)+1013904223)>>>0;return state.rngState;}
function chance(state:SimulationState,bps:number):boolean {if(bps===0)return false;return randomUint(state)<Math.floor(bps*4294967296/10000);}

export function newPersonaMechanics():PersonaMechanics {return {dominantLegacy:{},occupationLocked:false,switchedUntilTick:0,progress:{},lastBirthWinter:null,childcareUntilWinter:0,caregiverId:null,caregiverLocked:false,caregiverWorkedWinter:null};}

/** Legacy economics keeps its saved rules and random stream; only new campaigns enable mortality. */
export function migrateMechanics(state:SimulationState):void {
    const mechanics=state.mechanics;
    if(mechanics&&(mechanics.version as number)===1){
        if(Object.hasOwn(mechanics.config,'mortalityBands'))throw new Error('Unexpected legacy mortality option');
        mechanics.config.mortalityBands=[{minAge:0,chanceBps:0}];mechanics.version=2;
    }
}

export function validateMechanics(state:SimulationState):void {
    const mechanics=state.mechanics;if(!mechanics)return;
    const fail=(message:string):never=>{throw new Error(message);};
    const uint=(n:number,label:string,max=Number.MAX_SAFE_INTEGER):void=>{if(!Number.isSafeInteger(n)||n<0||n>max)fail(`Invalid ${label}`);};
    if(mechanics.version!==2)fail('Unknown mechanics version');
    const config=mechanics.config;
    for(const [key,expected] of Object.entries(defaultPrototypeConfig)){
        const value=config[key as keyof PrototypeConfig];
        if(typeof expected==='number')uint(value as number,key,key.endsWith('Bps')?10000:1000000000000);
    }
    if(!Array.isArray(config.mortalityBands)||!config.mortalityBands.length||config.mortalityBands[0].minAge!==0)fail('Invalid mortality curve');
    config.mortalityBands.forEach((band,index)=>{
        if(!band||Object.keys(band).length!==2)fail('Invalid mortality band');
        uint(band.minAge,'mortality age',1000000000000);uint(band.chanceBps,'mortality chance',10000);
        if(index&&band.minAge<=config.mortalityBands[index-1].minAge)fail('Unordered mortality curve');
    });
    if(!config.workPerUnit||!config.collapseDebtWinters||config.fertilityMaxAge<config.fertilityMinAge)fail('Invalid work/calendar scale');
    for(const key of Object.keys(config))if(!Object.hasOwn(defaultPrototypeConfig,key))fail('Unknown prototype option');
    if(!Array.isArray(config.upgradeCosts)||config.upgradeCosts.length!==3||!Array.isArray(config.upgradeBonusBps)||config.upgradeBonusBps.length!==4)fail('Invalid upgrade prototype');
    config.upgradeCosts.forEach(n=>uint(n,'upgrade cost',1000000000));config.upgradeBonusBps.forEach(n=>uint(n,'upgrade bonus',10000));
    if(Object.keys(config.occupations).length!==occupationIds.length)fail('Invalid occupation prototypes');
    for(const role of occupationIds){
        const job=config.occupations[role];if(!job||![null,'food','materials'].includes(job.resource))fail('Invalid job resource');
        uint(job.unitsPerWinter,'job units',1000000);
        if(job.resource===null&&job.unitsPerWinter!==0)fail('Inactive role cannot produce');
        for(const vector of [job.weights,job.preferences])if(!Array.isArray(vector)||vector.length!==traitKeys.length||vector.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))fail('Invalid aptitude vector');
        if(Math.abs(job.weights.reduce((sum,n)=>sum+n,0)-1)>1e-9)fail('Aptitude weights must sum to one');
    }
    if(!mechanics.people||Object.keys(mechanics.people).length!==Object.keys(state.personas).length)fail('Missing persona mechanics');
    const householdMembers=new Set<string>(),occupiedResidences=new Set<string>(),occupiedBuildings=new Set<string>();
    for(const home of Object.values(state.households)){
        for(const id of home.memberIds){if(householdMembers.has(id))fail('Persona belongs to multiple households');householdMembers.add(id);}
        if(home.memberIds.length&&home.residenceId!==null){
            if(occupiedResidences.has(home.residenceId))fail('Residence occupied by multiple households');occupiedResidences.add(home.residenceId);
            const building=state.residences[home.residenceId].buildingId;
            if(building!==null){if(occupiedBuildings.has(building))fail('Building occupied by multiple households');occupiedBuildings.add(building);}
        }
    }
    const carers=new Set<string>();
    for(const id of Object.keys(state.personas)){
        const person=state.personas[id],info=mechanics.people[id];if(!info)fail('Missing persona mechanics');
        if(!householdMembers.has(id)&&person.deathWinter===null)fail('Living persona needs a household');
        if(typeof info.occupationLocked!=='boolean'||typeof info.caregiverLocked!=='boolean')fail('Invalid player control');
        uint(info.switchedUntilTick,'switch timestamp');uint(info.childcareUntilWinter,'childcare endpoint');
        if(info.caregiverWorkedWinter!==null){uint(info.caregiverWorkedWinter,'caregiver participation');if(info.caregiverWorkedWinter>state.time.winter)fail('Future caregiving');}
        if(info.lastBirthWinter!==null){uint(info.lastBirthWinter,'last birth');if(info.lastBirthWinter>state.time.winter||info.lastBirthWinter<person.birthWinter)fail('Invalid last birth');}
        if(!info.progress||!info.dominantLegacy)fail('Missing work/legacy records');
        for(const [role,progress] of Object.entries(info.progress)){if(!occupationIds.includes(role as Occupation))fail('Unknown work progress role');uint(progress,'work progress',config.workPerUnit-1);}
        uint(person.workProgress,'active work progress',config.workPerUnit-1);
        if(person.occupation!==null&&person.workProgress!==(info.progress[person.occupation]??0))fail('Inconsistent work progress');
        for(const [trait,parent] of Object.entries(info.dominantLegacy))if(!traitKeys.includes(trait as TraitKey)||!person.parentIds.includes(parent))fail('Invalid dominant legacy source');
        if(info.caregiverId!==null){
            const donor=state.personas[info.caregiverId];
            if(!donor||donor.deathWinter!==null||donor.dna.sex!=='female'||donor.occupation!==null||personaAge(state,donor.id)<config.adultAge||donor.id===id||info.childcareUntilWinter<=state.time.winter)fail('Invalid caregiver');
            if(carers.has(donor.id))fail('Caregiver serves multiple groups');carers.add(donor.id);
        }
        for(const parent of person.parentIds)if(state.personas[parent].birthWinter>=person.birthWinter)fail('Invalid genealogy chronology');
        if(person.partnerId!==null&&(state.personas[person.partnerId].partnerId!==id||prohibitedKinship(state,id,person.partnerId)))fail('Invalid partnership');
    }
    if(!mechanics.buildings||Object.keys(mechanics.buildings).length!==Object.keys(state.buildings).length)fail('Missing building mechanics');
    for(const id of Object.keys(state.buildings)){
        const info=mechanics.buildings[id];if(!info)fail('Missing building mechanics');
        uint(info.debtWinters,'maintenance debt',config.collapseDebtWinters-1);uint(info.upgradeLevel,'upgrade level',3);uint(info.investedMaterials,'investment',Math.floor(Number.MAX_SAFE_INTEGER/10000));
        const specialization=state.buildings[id].specialization;if(specialization!==null&&!occupationIds.includes(specialization))fail('Invalid specialization');
    }
}
