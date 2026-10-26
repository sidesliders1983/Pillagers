import { wildlifeSightingText } from './WildlifeHistory';
import type {SimulationEvent} from '../simulation/SimulationCore';
import { isLivestockEvent, recordedLivestock } from './LivestockNarrative';
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
const animalName = (event: SimulationEvent) => recordedLivestock(event)?.name ?? 'Recorded livestock';
const animalBorn: Template = (event, details) => str(details, 'livestockId') || str(details, 'cattleId') ? animalName(event) + ' was born.' : null;
const animalDied: Template = (event, details) => str(details, 'livestockId') || str(details, 'cattleId') ? animalName(event) + ' died.' : null;
const animalSlaughtered: Template = (event, details) =>
    (str(details, 'livestockId') || str(details, 'cattleId')) && number(details, 'food') !== null ?
        `${animalName(event)} was slaughtered for ${details.food} Food${number(details, 'hides') ? ` and ${details.hides} Hides` : ''}.` : null;
const animalAssigned: Template = (event, details) => {
    if (!(str(details, 'livestockId') || str(details, 'cattleId')) ||
        !(details.farmyardId === null || str(details, 'farmyardId'))) return null;
    if (details.farmyardId === null) return animalName(event) + ' was unassigned from its Farmyard.';
    const home = housingReference(details, 'building', details.farmyardId, 'a Farmyard');
    return animalName(event) + ' was assigned to ' + (home === 'a Farmyard' ? home : 'the Farmyard at ' + home) + '.';
};
function supportContext(event: SimulationEvent, details: Facts) {
    const participants = ids(details, 'participants');
    const helperId = str(details, 'helperId'), recipientId = str(details, 'recipientId');
    if (details.supportVersion !== 1 || !str(details, 'offerId') || !str(details, 'sourceEventId') ||
        !str(details, 'householdId') || !helperId || !recipientId || helperId === recipientId ||
        participants?.length !== 2 || !participants.includes(helperId) || !participants.includes(recipientId))
        return null;
    const housing = details.housingResidents as Facts | undefined;
    const home = housingReference(details, 'building', housing?.buildingId, 'a home');
    return { helper: person(event, helperId), recipient: person(event, recipientId),
        loss: 'after the collapse of ' + home };
}
/** Registry contains only supported recorded facts; unknown types stay in Raw Events. */
const templates:Record<string,Template>={
    SupportOffered: (event, details) => {
        const context = supportContext(event, details);
        return context ? context.helper + ' offered support to ' + context.recipient + ' ' + context.loss + '.' : null;
    },
    SupportAccepted: (event, details) => {
        const context = supportContext(event, details);
        return context && str(details, 'offeredEventId') ? context.recipient + ' accepted support from ' +
            context.helper + ' ' + context.loss + '.' : null;
    },
    SupportDeclined: (event, details) => {
        const context = supportContext(event, details);
        return context && str(details, 'offeredEventId') ? context.recipient + ' declined support from ' +
            context.helper + ' ' + context.loss + '.' : null;
    },
    SupportEnded: (event, details) => {
        const context = supportContext(event, details);
        return context && str(details, 'offeredEventId') && details.reason === 'unavailable' ?
            'The support offer from ' + context.helper + ' to ' + context.recipient + ' ' + context.loss +
            ' ended because a participant was unavailable.' : null;
    },
    SupportCompleted: (event, details) => {
        const context = supportContext(event, details);
        if (!context || !str(details, 'offeredEventId') || !str(details, 'acceptedEventId') ||
            ![0, 1].includes(Number(details.supportContribution))) return null;
        const contribution = details.supportContribution === 1 ?
            '; one shared prepared weather assessment was added.' :
            '; the shared prepared weather assessments were already at capacity.';
        return context.helper + ' completed support for ' + context.recipient + ' ' + context.loss + contribution;
    },
    CultureWeatherSupportApplied: (_event, d) => {
        const participants = ids(d, 'participants');
        const sources = ids(d, 'sourceEventIds');
        if (d.cultureVersion !== 1 || !['Harsh', 'Severe'].includes(String(d.weatherClass)) ||
            !participants?.length || !sources?.length || !Array.isArray(d.riskInputs) ||
            d.riskInputs.length !== participants.length || !d.riskInputs.every((input, index) => {
                const risk = input as Facts | undefined;
                return risk && risk.personaId === participants[index] &&
                    number(risk, 'baselineWeatherExposureBps') !== null &&
                    number(risk, 'weatherExposureBps') !== null &&
                    Number(risk.weatherExposureBps) < Number(risk.baselineWeatherExposureBps);
            })) return null;
        return 'Prepared community support reduced assessed weather-exposure risk for ' +
            participants.length + ' residents during ' + d.weatherClass + ' weather.';
    },
    CulturalGatheringHeld: (_event, d) => {
        const participants = ids(d, 'participants');
        const cost = number(d, 'foodCost');
        if (d.cultureVersion !== 1 || typeof d.occasion !== 'string' ||
            !['storytelling_music', 'communal_ceremony', 'wedding'].includes(d.occasion) || !cost ||
            !participants || participants.length < 3 || participants.length > 8 ||
            new Set(participants).size !== participants.length || !Array.isArray(d.people) ||
            d.people.length !== participants.length) return null;
        const names: string[] = [];
        for (const [index, id] of participants.entries()) {
            const fact = d.people[index] as Facts | undefined;
            if (!fact || fact.id !== id || !str(fact, 'name') || number(fact, 'age') === null) return null;
            names.push(str(fact, 'name')!);
        }
        const materials = number(d, 'materialsCost') ?? 0;
        const payment = cost + ' Food' + (materials ? ' and ' + materials +
            (materials === 1 ? ' Material' : ' Materials') : '');
        if (d.occasion === 'wedding') {
            const spouses = ids(d, 'spouseIds');
            if (!str(d, 'sourceEventId') || spouses?.length !== 2 || spouses[0] === spouses[1] ||
                !spouses.every(id => participants.includes(id))) return null;
            const spouseNames = spouses.map(id => names[participants.indexOf(id)]);
            const guests = names.filter((_name, index) => !spouses.includes(participants[index]));
            const guestNames = guests.length === 1 ? guests[0] :
                guests.slice(0, -1).join(', ') + ' and ' + guests.at(-1);
            return spouseNames.join(' and ') + ' held a wedding celebration with ' +
                guestNames + ', using ' + payment + '.';
        }
        const people = names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
        const occasion = d.occasion === 'communal_ceremony' ? 'a communal ceremony' : 'storytelling and music';
        return people + ' gathered for ' + occasion + ', using ' + payment + '.';
    },
    EquipmentCrafted: (_e, d) => str(d, 'creatorName') && str(d, 'itemName') &&
        number(d, 'materials') !== null && number(d, 'hides') !== null ?
        `${d.creatorName} made ${d.units} ${d.itemName} using ${d.materials} Materials${d.hides ? ` and ${d.hides} Hides` : ''}.` : null,
    EquipmentAssigned: (_e, d) => str(d, 'name') && str(d, 'slot') && str(d, 'itemName') ?
        `${d.name} changed their ${d.slot}: ${d.itemName}.` : null,
    EquipmentLost: (_e, d) => str(d, 'name') && ids(d, 'itemNames') ?
        `${d.name}'s carried equipment was lost: ${ids(d, 'itemNames')!.join(', ')}.` : null,
    EquipmentRecovered: (_e, d) => str(d, 'name') && ids(d, 'itemNames') ?
        `Clan storage recovered equipment assigned to ${d.name}: ${ids(d, 'itemNames')!.join(', ')} (${d.reason}).` : null,
    EquipmentTargetSet: (_e, d) => str(d, 'itemName') && number(d, 'target') !== null ?
        `The clan set its ${d.itemName} stock target to ${d.target}.` : null,
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
    CattleBorn: animalBorn, LivestockBorn: animalBorn,
    CattleDied: animalDied, LivestockDied: animalDied,
    FoundingPartyLanded:(_e,d)=>{const founders=ids(d,'founderIds');return founders?`The founding party of ${founders.length} residents arrived.`:null;},
    FoundingPartnershipPresent:(e,d)=>{const p=ids(d,'participants');return p?.length===2?`${person(e,p[0])} and ${person(e,p[1])} were already partners at arrival.`:null;},
    OccupationAssigned:(e,d)=>{const name=person(e,e.personaId),role=str(d,'occupation');return name&&(d.occupation===null||role&&occupationLabels[role])?d.occupation===null?`${name} no longer had an assigned occupation.`:`${name} became a ${occupationLabels[role!]}.`:null;},
    OccupationReleased:(e)=>{const name=person(e,e.personaId);return name?`Career decisions for ${name} returned to autonomy.`:null;},
    PartnershipFormed:(e,d)=>{const p=ids(d,'participants');return p&&p.length>=2?`${person(e,p[0])} and ${person(e,p[1])} became partners.`:null;},
    ChildBorn:(e,d)=>{const parents=ids(d,'parentIds'),name=person(e,e.personaId);return name&&parents?.length===2?`${name} was born to ${person(e,parents[0])} and ${person(e,parents[1])}.`:null;},
    FoundingLongshipKept:(_e,d)=>str(d,'longshipId')?'Our longship was retained.':null,
    FoundingLongshipSalvaged:(_e,d)=>str(d,'longshipId')&&number(d,'materials')!==null?`Our longship was salvaged for ${d.materials} Materials.`:null,
    CattleSlaughtered: animalSlaughtered, LivestockSlaughtered: animalSlaughtered,
    CattleAssigned: animalAssigned, LivestockAssigned: animalAssigned,
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
    LongshipFoodLoaded:(_e,d)=>str(d,'groupName')?`${d.groupName} loaded ${d.foodCost} Food from clan stocks aboard the longship.`:null,
    LongshipEmbarked:(_e,d)=>str(d,'groupName')?`${d.groupName} embarked on the longship.`:null,
    LongshipDisembarked:(_e,d)=>str(d,'groupName')?`${d.groupName} disembarked on safe shore.`:null,
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
    LivestockFoodConsumed:(_e,d)=>number(d,'units')!==null&&number(d,'shortfall')!==null?`The herd consumed ${d.units} Food; the recorded shortfall was ${d.shortfall} Food.`:null,
};
export function projectChronicle(events:readonly SimulationEvent[],currentWinter?:number):ChronicleWinter[] {
    const winters=new Map<number,SimulationEvent[]>();
    for(const event of events){const list=winters.get(event.time.winter)??[];list.push(event);winters.set(event.time.winter,list);}
    if(currentWinter!==undefined){const first=events.length?events.reduce((first,event)=>Math.min(first,event.time.winter),events[0].time.winter):currentWinter;for(let winter=first;winter<=currentWinter;winter++)if(!winters.has(winter))winters.set(winter,[]);}
    return [...winters].sort(([a],[b])=>b-a).map(([winter,ledger])=>{
        const output=ledger.filter(e=>e.type==='ResourceProduced'&&['food','materials'].includes(String(e.details?.resource))&&number(e.details??{},'units')!==null);
        const herd=ledger.filter(e=>(e.type==='CattleFoodProduced'||e.type==='LivestockResourceProduced'&&
            ['food','materials'].includes(String(e.details?.resource)))&&number(e.details??{},'units')!==null);
        const entries:ChronicleEntry[]=[];
        for(const event of ledger){
            const d=event.details??{};let text:string|null=null,sourceEventIds=[event.id],templateId=event.type,routine=false;
            const aggregate=event.type==='ResourceProduced'?output:herd.includes(event)?herd:null;
            if(aggregate){
                if(event!==aggregate[0])continue;
                sourceEventIds=aggregate.map(e=>e.id);routine=true;templateId+= '.winter-total';
                if(aggregate===herd){
                    const parts = (['food','materials'] as const).flatMap(resource => {
                        const records = aggregate.filter(e => (e.type === 'CattleFoodProduced' ? 'food' : e.details!.resource) === resource);
                        const total = records.reduce((sum,e) => sum + Number(e.details!.units),0);
                        return records.length && Number.isSafeInteger(total) ? [total + ' ' + (resource === 'food' ? 'Food' : 'Materials')] : [];
                    });
                    if (parts.length) text = 'The herd produced ' + parts.join(' and ') + ' this Winter.';
                }
                else {const total=(resource:string)=>aggregate.filter(e=>e.details!.resource===resource).reduce((n,e)=>n+Number(e.details!.units),0);const food=total('food'),materials=total('materials');if(Number.isSafeInteger(food)&&Number.isSafeInteger(materials)){const parts=[];if(aggregate.some(e=>e.details!.resource==='food'))parts.push(`${food} Food`);if(aggregate.some(e=>e.details!.resource==='materials'))parts.push(`${materials} Materials`);text=`The settlement produced ${parts.join(' and ')} this Winter.`;}}
            }else {text=event.type === 'WildlifeSighted' ? wildlifeSightingText(event) : Object.hasOwn(templates,event.type)?templates[event.type](event,d):null;routine=['FoodConsumed','CattleFoodConsumed','LivestockFoodConsumed'].includes(event.type) ||
                event.type === 'WildlifeSighted' && !event.details?.firstForClan;}
            if (text) {
                const templateVersion = ['FoundingLongshipKept', 'FoundingLongshipSalvaged']
                    .includes(event.type) || isLivestockEvent(event.type) ? 2 : 1;
                entries.push({ winter, text, sourceEventIds, templateId, templateVersion, routine });
            }
        }
        return {winter,entries};
    });
}

/** Personal formatting reuses the factual registry, with neutral labels for unnamed destinations. */
export function personalChronicleEntry(event: SimulationEvent): ChronicleEntry | null {
    if (event.type === 'WildlifeSighted') {
        const text = wildlifeSightingText(event, true);
        return text ? { winter: event.time.winter, text, sourceEventIds: [event.id],
            templateId: 'chronicle.WildlifeSighted', templateVersion: 1, routine: !event.details?.firstForClan } : null;
    }
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
