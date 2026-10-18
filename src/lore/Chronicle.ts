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
/** Names must match the recorded reference; never recover them from current occupants. */
function housingReference(
    details: Facts, kind: 'household' | 'building' | 'residence', id: unknown, fallback: string
): string {
    const snapshot = details.housingNames;
    if (!snapshot || typeof snapshot !== 'object' || (snapshot as Facts).version !== 1)
        return fallback;
    const named = (snapshot as Facts)[kind];
    if (!named || typeof named !== 'object') return fallback;
    const reference = named as Facts;
    return reference.id === id && str(reference, 'name') ? reference.name as string : fallback;
}
const occupationLabels:Record<string,string>={farmer:'farmer',herder:'herder',fisher:'fisher',hunter:'hunter',woodworker:'woodworker',smith:'smith',textileWorker:'textile worker',boatbuilder:'boatbuilder',trader:'trader',leatherAndJewelleryMaker:'leather and jewellery maker'};
export function occupationLabel(id: string | null): string {
    return id ? occupationLabels[id] ?? 'Occupation not recorded' : 'No occupation';
}
type Template=(e:SimulationEvent,d:Facts)=>string|null;
/** Registry contains only supported recorded facts; unknown types stay in Raw Events. */
const templates:Record<string,Template>={
    ResidentQuarrelled: (event, details) => {
        const participants = ids(details, 'participants');
        return participants?.length === 2 && str(details, 'incidentId') ?
            person(event, participants[0]) + ' and ' + person(event, participants[1]) + ' quarrelled.' : null;
    },
    MediationAttempted: (event, details) => {
        const participants = ids(details, 'participants');
        if (participants?.length !== 3 || typeof details.success !== 'boolean' || details.mediatorId !== participants[2]) return null;
        return person(event, participants[2]) + ' attempted to mediate the quarrel between ' +
            person(event, participants[0]) + ' and ' + person(event, participants[1]) +
            (details.success ? '; the mediation succeeded.' : '; the quarrel remained unresolved.');
    },
    ResidentsReconciled: (event, details) => {
        const participants = ids(details, 'participants');
        return participants?.length === 2 && str(details, 'openingEventId') ?
            person(event, participants[0]) + ' and ' + person(event, participants[1]) +
            (details.method === 'mediated' ? ' reconciled through mediation.' : ' reconciled without mediation.') : null;
    },
    SocialIncidentEnded: (event, details) => {
        const participants = ids(details, 'participants');
        if (participants?.length !== 2) return null;
        const pair = person(event, participants[0]) + ' and ' + person(event, participants[1]);
        return details.reason === 'expired-unresolved' ? 'The quarrel between ' + pair + ' expired unresolved.' :
            details.reason === 'inactive' ? 'The quarrel between ' + pair + ' became inactive after death or departure.' : null;
    },
    PersonaDied:(e,d)=>{const name=person(e,e.personaId);return name?name+' died'+(str(d,'cause')?' ('+d.cause+')':'')+'.':null;},
    CattleBorn:(_e,d)=>str(d,'cattleId')?'Animal '+d.cattleId+' was born.':null,
    CattleDied:(_e,d)=>str(d,'cattleId')?'Animal '+d.cattleId+' died.':null,
    FoundingPartyLanded:(_e,d)=>{const founders=ids(d,'founderIds');return founders?`The founding party of ${founders.length} residents arrived.`:null;},
    FoundingPartnershipPresent:(e,d)=>{const p=ids(d,'participants');return p?.length===2?`${person(e,p[0])} and ${person(e,p[1])} were already partners at arrival.`:null;},
    OccupationAssigned:(e,d)=>{const name=person(e,e.personaId),role=str(d,'occupation');return name&&(d.occupation===null||role&&occupationLabels[role])?d.occupation===null?`${name} no longer had an assigned occupation.`:`${name} became a ${occupationLabels[role!]}.`:null;},
    OccupationReleased:(e)=>{const name=person(e,e.personaId);return name?`Career decisions for ${name} returned to autonomy.`:null;},
    PartnershipFormed:(e,d)=>{const p=ids(d,'participants');return p&&p.length>=2?`${person(e,p[0])} and ${person(e,p[1])} became partners.`:null;},
    ChildBorn:(e,d)=>{const parents=ids(d,'parentIds'),name=person(e,e.personaId);return name&&parents?.length===2?`${name} was born to ${person(e,parents[0])} and ${person(e,parents[1])}.`:null;},
    FoundingLongshipKept:(_e,d)=>str(d,'longshipId')?'Our longship was retained.':null,
    FoundingLongshipSalvaged:(_e,d)=>str(d,'longshipId')&&number(d,'materials')!==null?`Our longship was salvaged for ${d.materials} Materials.`:null,
    CattleSlaughtered:(_e,d)=>str(d,'cattleId')&&number(d,'food')!==null?`Animal ${d.cattleId} was slaughtered for ${d.food} Food.`:null,
    CattleAssigned: (_e, d) => {
        if (!str(d, 'cattleId') || !(d.farmyardId === null || str(d, 'farmyardId'))) return null;
        if (d.farmyardId === null) return `Animal ${d.cattleId} was unassigned from its Farmyard.`;
        const home = housingReference(d, 'building', d.farmyardId, 'a Farmyard');
        const destination = home === 'a Farmyard' ? home : 'the Farmyard at ' + home;
        return `Animal ${d.cattleId} was assigned to ${destination}.`;
    },
    FarmyardFunctionChanged: (_e, d) => {
        if (!str(d, 'buildingId') || typeof d.active !== 'boolean') return null;
        const home = housingReference(d, 'building', d.buildingId, 'A home');
        return `${home} ${d.active ? 'gained' : 'lost'} the Farmyard function.`;
    },
    HouseBuilt: (_e, d) => {
        if (!str(d, 'buildingId') || number(d, 'cost') === null) return null;
        const home = housingReference(d, 'building', d.buildingId, 'A permanent home');
        const household = str(d, 'householdId') ?
            ' for ' + housingReference(d, 'household', d.householdId, 'a household') : '';
        return `${home} was completed${household} for ${d.cost} Materials.`;
    },
    ResidenceAssigned: (_e, d) => {
        if (!str(d, 'householdId') || !str(d, 'residenceId')) return null;
        const household = housingReference(d, 'household', d.householdId, 'A household');
        const residence = housingReference(d, 'residence', d.residenceId,
            d.kind === 'tent' ? 'a tent' : 'a home');
        return `${household} moved to ${residence}.`;
    },
    BuildingSpecialized: (_e, d) => {
        const role = str(d, 'occupation');
        if (!str(d, 'buildingId') || !(d.occupation === null || role && occupationLabels[role]))
            return null;
        const home = housingReference(d, 'building', d.buildingId, 'A home');
        return d.occupation === null ? `${home} no longer had a specialization.` :
            `${home} was specialized for ${occupationLabels[role!]} work.`;
    },
    BuildingUpgraded: (_e, d) => {
        if (!str(d, 'buildingId') || number(d, 'level') === null || number(d, 'cost') === null)
            return null;
        const home = housingReference(d, 'building', d.buildingId, 'A home');
        return `${home} reached upgrade level ${d.level} for ${d.cost} Materials.`;
    },
    MaintenanceDebtIncreased: (_e, d) => {
        if (!str(d, 'buildingId') || number(d, 'debtWinters') === null ||
            !['unpaid', 'vacant'].includes(String(d.reason))) return null;
        const home = housingReference(d, 'building', d.buildingId, 'A home');
        const reason = d.reason === 'unpaid' ? 'unpaid upkeep' : 'vacant';
        return `${home} accumulated ${d.debtWinters} Winters of maintenance debt (${reason}).`;
    },
    BuildingSalvaged: (_e, d) => {
        if (!str(d, 'buildingId') || number(d, 'salvage') === null) return null;
        const home = housingReference(d, 'building', d.buildingId, 'A home');
        return `${home} was salvaged for ${d.salvage} Materials.`;
    },
    BuildingCollapsed: (_e, d) => {
        if (!str(d, 'buildingId') || number(d, 'salvage') === null) return null;
        const home = housingReference(d, 'building', d.buildingId, 'A home');
        return `${home} collapsed; ${d.salvage} Materials were salvaged.`;
    },
    CaregiverAssigned:(e,d)=>{const mother=person(e,e.personaId);return mother&&(d.caregiverId===null||str(d,'caregiverId'))?d.caregiverId===null?`The mother was assigned to childcare for ${mother}.`:`${person(e,d.caregiverId as string)} was assigned as caregiver for ${mother}.`:null;},
    ExpeditionGroupCreated:(_e,d)=>str(d,'groupName')?`Expedition group ${d.groupName} was formed.`:null,
    ExploreAreaCancelled:(_e,d)=>str(d,'groupName')?`${d.groupName} ended its expedition preparations without leaving home.`:null,
    ExploreAreaPrepared:(_e,d)=>str(d,'groupName')?`${d.groupName} prepared to explore, reserving ${d.foodCost} Food.`:null,
    ExploreAreaSuppliesConsumed:(_e,d)=>str(d,'groupName')?`${d.groupName} opened ${d.units} carried Food for the next part of the journey.`:null,
    ExploreAreaSuppliesDiscarded:(_e,d)=>str(d,'groupName')?`${d.groupName} ended with ${d.units} unused Food; it was not refunded.`:null,
    ExploreAreaSuppliesLost:(_e,d)=>str(d,'groupName')?`${d.groupName} could not recover ${d.units} carried Food.`:null,
    ExploreAreaReturnStarted:(_e,d)=>str(d,'groupName')?`${d.groupName} began returning home: ${d.reason}.`:null,
    ExploreAreaStranded:(_e,d)=>str(d,'groupName')?`${d.groupName} is stranded: ${d.reason}`:null,
    ExploreAreaDeparted:(_e,d)=>str(d,'groupName')?d.carriedSupplies ?
        `${d.groupName} ${d.redirected ? 'changed course' : 'set out to explore'} using the same carried supplies.` :
        (d.redirected ? `${d.groupName} changed course, packing ${d.foodCost} additional Food for exploration and the return home.` :
            `${d.groupName} set out to explore, carrying ${d.foodCost} Food for the round trip.`):null,
    ExploreAreaReturned:(_e,d)=>str(d,'groupName')?`${d.groupName} exploration ended: ${d.outcome}.`:null,
    ExpeditionDeparted:(_e,d)=>str(d,'groupName')&&str(d,'mission')&&(str(d,'destination')||str(d,'regionId'))?`${d.groupName} departed for ${d.mission} towards ${d.destination??d.regionId}, carrying ${d.foodCost} Food.`:null,
    ExpeditionReturned:(_e,d)=>str(d,'mission')&&(str(d,'destination')||str(d,'regionId'))&&typeof d.success==='boolean'?`${d.mission} towards ${d.destination??d.regionId} returned: ${d.success?'completed':'failed'}, ${d.food??0} Food, ${d.materials??0} Materials, ${ids(d,'cattleIds')?.length??0} cattle and ${ids(d,'personaIds')?.length??0} people recovered; ${ids(d,'casualtyIds')?.length??0} casualties.`:null,
    PersonaTransferredIn:(e,d)=>str(d,'name')?`${d.name} arrived from ${d.originClanId}.`:null,
    PersonaTransferredOut:(_e,d)=>str(d,'name')?`${d.name} was transferred to ${d.destinationClanId}.`:null,
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
            if (text) {
                const templateVersion = ['FoundingLongshipKept', 'FoundingLongshipSalvaged']
                    .includes(event.type) ? 2 : 1;
                entries.push({ winter, text, sourceEventIds, templateId, templateVersion, routine });
            }
        }
        return {winter,entries};
    });
}

/** Personal formatting reuses the factual registry, with neutral labels for unnamed destinations. */
export function personalChronicleEntry(event: SimulationEvent): ChronicleEntry | null {
    const details = {...event.details};
    const references = [event.personaId, details.personaId, details.caregiverId,
        ...(Array.isArray(details.participants) ? details.participants : []),
        ...(Array.isArray(details.parentIds) ? details.parentIds : [])]
        .filter((id): id is string => typeof id === 'string');
    const people = Array.isArray(details.people) ? [...details.people] : [];
    for (const id of new Set(references)) {
        if (people.some(person => person && typeof person === 'object' &&
            person.id === id && typeof person.name === 'string' && person.name)) continue;
        const name = id === event.personaId && typeof details.name === 'string' && details.name ?
            details.name : 'A resident (name not recorded)';
        people.push({id, name});
    }
    details.people = people;
    if (['PersonaTransferredIn', 'PersonaTransferredOut'].includes(event.type) && !details.name)
        details.name = 'A resident (name not recorded)';
    if (event.type === 'PersonaTransferredIn') details.originClanId = 'another clan';
    if (event.type === 'PersonaTransferredOut') details.destinationClanId = 'another clan';
    if (['ExpeditionDeparted', 'ExpeditionReturned'].includes(event.type)) details.regionId = 'a region';
    return projectChronicle([{...event, details}])[0]?.entries[0] ?? null;
}
