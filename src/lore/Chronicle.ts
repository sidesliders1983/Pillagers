import type {SimulationEvent} from '../simulation/SimulationCore';
export type ChronicleEntry={winter:number;text:string;sourceEventIds:string[];templateId:string;templateVersion:number;routine:boolean};
export type ChronicleWinter={winter:number;entries:ChronicleEntry[]};
type Facts=Record<string,unknown>;
const str=(d:Facts,key:string):string|null=>typeof d[key]==='string'&&d[key]!==''?d[key] as string:null;
const number=(d:Facts,key:string):number|null=>Number.isSafeInteger(d[key])&&(d[key] as number)>=0?d[key] as number:null;
const ids=(d:Facts,key:string):string[]|null=>Array.isArray(d[key])&&(d[key] as unknown[]).every(id=>typeof id==='string')?d[key] as string[]:null;
function person(e:SimulationEvent,id?:string):string|null {
    const d=e.details??{};
    if(id&&Array.isArray(d.people)){
        const fact=d.people.find(p=>p&&typeof p==='object'&&(p as Facts).id===id) as Facts|undefined;
        if(fact&&str(fact,'name'))return str(fact,'name');
    }
    if((!id||id===e.personaId)&&str(d,'name'))return str(d,'name');
    return id?`resident ${id}`:null;
}
const occupationLabels:Record<string,string>={farmer:'farmer',herder:'herder',fisher:'fisher',hunter:'hunter',woodworker:'woodworker',smith:'smith',textileWorker:'textile worker',boatbuilder:'boatbuilder',trader:'trader',leatherAndJewelleryMaker:'leather and jewellery maker'};
type Template=(e:SimulationEvent,d:Facts)=>string|null;
/** Registry contains only supported recorded facts; unknown types stay in Raw Events. */
const templates:Record<string,Template>={
    FoundingPartyLanded:(_e,d)=>{const founders=ids(d,'founderIds');return founders?`The founding party of ${founders.length} residents arrived.`:null;},
    FoundingPartnershipPresent:(e,d)=>{const p=ids(d,'participants');return p?.length===2?`${person(e,p[0])} and ${person(e,p[1])} were already partners at arrival.`:null;},
    OccupationAssigned:(e,d)=>{const name=person(e,e.personaId),role=str(d,'occupation');return name&&(d.occupation===null||role&&occupationLabels[role])?d.occupation===null?`${name} no longer had an assigned occupation.`:`${name} became a ${occupationLabels[role!]}.`:null;},
    OccupationReleased:(e)=>{const name=person(e,e.personaId);return name?`Career decisions for ${name} returned to autonomy.`:null;},
    PartnershipFormed:(e,d)=>{const p=ids(d,'participants');return p&&p.length>=2?`${person(e,p[0])} and ${person(e,p[1])} became partners.`:null;},
    ChildBorn:(e,d)=>{const parents=ids(d,'parentIds'),name=person(e,e.personaId);return name&&parents?.length===2?`${name} was born to ${person(e,parents[0])} and ${person(e,parents[1])}.`:null;},
    FoundingLongshipKept:(_e,d)=>str(d,'longshipId')?`Longship ${d.longshipId} was retained.`:null,
    FoundingLongshipSalvaged:(_e,d)=>str(d,'longshipId')&&number(d,'materials')!==null?`Longship ${d.longshipId} was salvaged for ${d.materials} Materials.`:null,
    CattleSlaughtered:(_e,d)=>str(d,'cattleId')&&number(d,'food')!==null?`Animal ${d.cattleId} was slaughtered for ${d.food} Food.`:null,
    CattleAssigned:(_e,d)=>str(d,'cattleId')&&(d.farmyardId===null||str(d,'farmyardId'))?d.farmyardId===null?`Animal ${d.cattleId} was unassigned from its Farmyard.`:`Animal ${d.cattleId} was assigned to Farmyard ${d.farmyardId}.`:null,
    FarmyardFunctionChanged:(_e,d)=>str(d,'buildingId')&&typeof d.active==='boolean'?d.active?`Home ${d.buildingId} gained the Farmyard function.`:`Home ${d.buildingId} lost the Farmyard function.`:null,
    HouseBuilt:(_e,d)=>str(d,'buildingId')&&number(d,'cost')!==null?`Permanent home ${d.buildingId} was completed${str(d,'householdId')?` for household ${d.householdId}`:''} for ${d.cost} Materials.`:null,
    ResidenceAssigned:(_e,d)=>str(d,'householdId')&&str(d,'residenceId')?`Household ${d.householdId} moved to ${d.kind==='tent'?'tent ':''}${d.residenceId}.`:null,
    BuildingSpecialized:(_e,d)=>{const role=str(d,'occupation');return str(d,'buildingId')&&(d.occupation===null||role&&occupationLabels[role])?d.occupation===null?`Home ${d.buildingId} no longer had a specialization.`:`Home ${d.buildingId} was specialized for ${occupationLabels[role!]} work.`:null;},
    BuildingUpgraded:(_e,d)=>str(d,'buildingId')&&number(d,'level')!==null&&number(d,'cost')!==null?`Home ${d.buildingId} reached upgrade level ${d.level} for ${d.cost} Materials.`:null,
    MaintenanceDebtIncreased:(_e,d)=>str(d,'buildingId')&&number(d,'debtWinters')!==null&&['unpaid','vacant'].includes(String(d.reason))?`Home ${d.buildingId} accumulated ${d.debtWinters} Winters of maintenance debt (${d.reason==='unpaid'?'unpaid upkeep':'vacant'}).`:null,
    BuildingSalvaged:(_e,d)=>str(d,'buildingId')&&number(d,'salvage')!==null?`Home ${d.buildingId} was salvaged for ${d.salvage} Materials.`:null,
    BuildingCollapsed:(_e,d)=>str(d,'buildingId')&&number(d,'salvage')!==null?`Home ${d.buildingId} collapsed; ${d.salvage} Materials were salvaged.`:null,
    CaregiverAssigned:(e,d)=>{const mother=person(e,e.personaId);return mother&&(d.caregiverId===null||str(d,'caregiverId'))?d.caregiverId===null?`The mother was assigned to childcare for ${mother}.`:`${person(e,d.caregiverId as string)} was assigned as caregiver for ${mother}.`:null;},
    FoodConsumed:(_e,d)=>number(d,'units')!==null&&number(d,'shortfall')!==null?`Residents consumed ${d.units} Food; the recorded shortfall was ${d.shortfall} Food.`:null,
    CattleFoodConsumed:(_e,d)=>number(d,'units')!==null&&number(d,'shortfall')!==null?`The herd consumed ${d.units} Food; the recorded shortfall was ${d.shortfall} Food.`:null,
};
export function projectChronicle(events:readonly SimulationEvent[],currentWinter?:number):ChronicleWinter[] {
    const winters=new Map<number,SimulationEvent[]>();
    for(const event of events){const list=winters.get(event.time.winter)??[];list.push(event);winters.set(event.time.winter,list);}
    if(currentWinter!==undefined){const first=events.length?events.reduce((first,event)=>Math.min(first,event.time.winter),events[0].time.winter):currentWinter;for(let winter=first;winter<=currentWinter;winter++)if(!winters.has(winter))winters.set(winter,[]);}
    return [...winters].sort(([a],[b])=>b-a).map(([winter,ledger])=>{
        const output=ledger.filter(e=>e.type==='ResourceProduced'&&['food','materials'].includes(String(e.details?.resource))&&number(e.details??{},'units')!==null);
        const herd=ledger.filter(e=>e.type==='CattleFoodProduced'&&number(e.details??{},'units')!==null);
        const entries:ChronicleEntry[]=[];
        for(const event of ledger){
            const d=event.details??{};let text:string|null=null,sourceEventIds=[event.id],templateId=event.type,routine=false;
            const aggregate=event.type==='ResourceProduced'?output:event.type==='CattleFoodProduced'?herd:null;
            if(aggregate){
                if(event!==aggregate[0])continue;
                sourceEventIds=aggregate.map(e=>e.id);routine=true;templateId+= '.winter-total';
                if(event.type==='CattleFoodProduced'){const total=aggregate.reduce((n,e)=>n+Number(e.details!.units),0);if(Number.isSafeInteger(total))text=`The herd produced ${total} Food this Winter.`;}
                else {const total=(resource:string)=>aggregate.filter(e=>e.details!.resource===resource).reduce((n,e)=>n+Number(e.details!.units),0);const food=total('food'),materials=total('materials');if(Number.isSafeInteger(food)&&Number.isSafeInteger(materials)){const parts=[];if(aggregate.some(e=>e.details!.resource==='food'))parts.push(`${food} Food`);if(aggregate.some(e=>e.details!.resource==='materials'))parts.push(`${materials} Materials`);text=`The settlement produced ${parts.join(' and ')} this Winter.`;}}
            }else {text=Object.hasOwn(templates,event.type)?templates[event.type](event,d):null;routine=['FoodConsumed','CattleFoodConsumed'].includes(event.type);}
            if(text)entries.push({winter,text,sourceEventIds,templateId,templateVersion:1,routine});
        }
        return {winter,entries};
    });
}
