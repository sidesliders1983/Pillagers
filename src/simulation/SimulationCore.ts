import {farmyards,reconcileFarmyards} from './Farmyards';
export {inspectBuilding, inspectWork, occupationAptitude, occupationIds} from './Mechanics';
export {caregiverEligible} from './FamilyMechanics';
export {landingSummary} from './Landing';
import {createCampaign as generateCampaign, isLandingCommand, applyLandingCommand, validateLanding, migrateLanding} from './Landing';
import type {LandingState, LandingCommand, LandingConfig} from './Landing';
export {canPartner} from './FamilyMechanics';
import {initializeMechanics, stepMechanicsTick, isMechanicsCommand, applyMechanicsCommand, recordOccupationChange, validateMechanics, migrateMechanics} from './Mechanics';
import type {MechanicsState, PrototypeConfig, MechanicsCommand} from './Mechanics';
import {personaAge} from './PersonaAge';
export {personaAge} from './PersonaAge';
import {CharacterDNA, parseCharacterDNA} from '../characters/CharacterDNA';
import {generateCharacterDNA} from '../characters/generateCharacterDNA';
export const ticksPerWinter = 1000;
export type Occupation = 'farmer' | 'herder' | 'fisher' | 'hunter' | 'textileWorker' | 'smith' | 'woodworker' | 'boatbuilder' | 'trader' | 'leatherAndJewelleryMaker';
export type GameTime = {winter: number; tick: number};
export type Persona = {
    id: string; name: string; birthWinter: number; deathWinter: number | null;
    originClanId: string; dna: CharacterDNA; parentIds: string[]; partnerId: string | null;
    occupation: Occupation | null;
    occupationHistory: {occupation: Occupation; startedAt: GameTime; endedAt: GameTime | null}[];
    workProgress: number;
};
export type SimulationEvent = {id: string; time: GameTime; type: string; personaId?: string; details?: Record<string, unknown>};
export type SimulationState = {
    landing?: LandingState; mechanics?: MechanicsState; schemaVersion: 1; seed: number; rngState: number; ticksPerWinter: number; time: GameTime;
    clan: {id: string; name: string}; personas: Record<string, Persona>;
    families: Record<string, {id: string; memberIds: string[]}>;
    households: Record<string, {id: string; memberIds: string[]; residenceId: string | null}>;
    residences: Record<string, {id: string; kind: 'house' | 'tent'; buildingId: string | null}>;
    buildings: Record<string, {id: string; kind: 'house' | 'farmyard'; specialization: Occupation | null}>;
    stocks: {food: number; materials: number}; events: SimulationEvent[];
};
export function createCampaign(seed:number, overrides:Partial<LandingConfig>={}, mechanicsOverrides:Partial<PrototypeConfig>={}):SimulationState {
    const state=generateCampaign(seed,overrides,mechanicsOverrides);validateState(state);return state;
}
export function createFixtureClan(seed: number): SimulationState {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be uint32');
    const person = (id: string, name: string, birthWinter: number, offset: number): Persona => ({
        id, name, birthWinter, deathWinter: null, originClanId: 'fixture',
        dna: {...generateCharacterDNA((seed + offset) >>> 0), age: 800 - birthWinter},
        parentIds: [], partnerId: null, occupation: null, occupationHistory: [], workProgress: 0,
    });
    const einar = person('einar', 'Einar', 768, 0), liv = person('liv', 'Liv', 770, 1), astrid = person('astrid', 'Astrid', 800, 2);
    einar.partnerId = 'liv'; liv.partnerId = 'einar'; astrid.parentIds = ['einar', 'liv'];
    return {schemaVersion: 1, seed, rngState: seed, ticksPerWinter, time: {winter: 800, tick: 0},
        clan: {id: 'fixture', name: 'Fixture settlement'}, personas: {einar, liv, astrid},
        families: {family: {id: 'family', memberIds: ['einar', 'liv', 'astrid']}},
        households: {home: {id: 'home', memberIds: ['einar', 'liv', 'astrid'], residenceId: 'residence'}},
        residences: {residence: {id: 'residence', kind: 'house', buildingId: 'house'}},
        buildings: {house: {id: 'house', kind: 'house', specialization: null}},
        stocks: {food: 20, materials: 10}, events: [{id: 'event-1', time: {winter: 800, tick: 0}, type: 'ClanInitialized'}]};
}
export function createSettlement(seed:number, overrides:Partial<PrototypeConfig> = {}):SimulationState {
    const state=createFixtureClan(seed); state.personas.einar.dna.sex='male';state.personas.liv.dna.sex='female';state.personas.astrid.dna.sex='female';
    state.mechanics=initializeMechanics(state,overrides);
    for(const child of Object.values(state.personas))for(const parentId of child.parentIds){
        const parent=state.personas[parentId],info=state.mechanics.people[parentId];
        if(parent.dna.sex==='female'&&(info.lastBirthWinter===null||child.birthWinter>info.lastBirthWinter)){info.lastBirthWinter=child.birthWinter;info.childcareUntilWinter=child.birthWinter+state.mechanics.config.childcareWinters;}
    }
    validateState(state); return state;
}
export type SimulationCommand = LandingCommand | MechanicsCommand | {type: 'AdvanceTicks'; ticks: number} | {type: 'AdvanceWinter'} | {type: 'AssignOccupation'; personaId: string; occupation: Occupation | null};
function integer(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer`);
}
function emit(state: SimulationState, type: string, personaId?: string, details?: Record<string, unknown>) {
    state.events.push({id: `event-${state.events.length + 1}`, time: {...state.time}, type,
        ...(personaId ? {personaId} : {}), ...(details ? {details} : {})});
}
export function applyCommand(input: SimulationState, command: SimulationCommand): SimulationState {
    validateState(input);
    if(isLandingCommand(command)){const state=structuredClone(input);applyLandingCommand(state,command as LandingCommand);reconcileFarmyards(state,farmyards(input).map(f=>f.id));validateState(state);return state;}
    if(isMechanicsCommand(command)){const state=structuredClone(input);applyMechanicsCommand(state,command as MechanicsCommand);reconcileFarmyards(state,farmyards(input).map(f=>f.id));validateState(state);return state;}
    if (command.type === 'AssignOccupation') {
        const occupations: Occupation[] = ['farmer', 'herder', 'fisher', 'hunter', 'textileWorker', 'smith', 'woodworker', 'boatbuilder', 'trader', 'leatherAndJewelleryMaker'];
        const person = input.personas[command.personaId];
        if (!person || person.deathWinter !== null) throw new Error('Persona must be alive');
        if (input.mechanics && command.occupation!==null && personaAge(input,person.id)<input.mechanics.config.workAge)throw new Error('Persona below work age');
        if (command.occupation !== null && !occupations.includes(command.occupation)) throw new Error('Unknown occupation');
        const state = structuredClone(input), target = state.personas[command.personaId];
        recordOccupationChange(state,target.id,command.occupation);
        if (target.occupation === command.occupation) return state;
        const active = target.occupationHistory.at(-1);
        if (active && active.endedAt === null) active.endedAt = {...state.time};
        target.occupation = command.occupation;
        if (command.occupation !== null) target.occupationHistory.push({occupation: command.occupation, startedAt: {...state.time}, endedAt: null});
        emit(state, 'OccupationAssigned', target.id, {occupation: command.occupation, name: target.name, age: personaAge(state, target.id)});
        reconcileFarmyards(state,farmyards(input).map(f=>f.id));validateState(state);
        return state;
    }
    const ticks = command.type === 'AdvanceWinter' ? input.ticksPerWinter : command.type === 'AdvanceTicks' ? command.ticks : NaN;
    integer(ticks, 'Ticks');
    const total = input.time.tick + ticks;
    integer(total, 'Total ticks');
    integer(input.time.winter + Math.floor(total / input.ticksPerWinter), 'Winter');
    const state = structuredClone(input);
    if(state.mechanics){for(let index=0;index<ticks;index++)stepMechanicsTick(state);validateState(state); return state;}
    const winter = state.time.winter + Math.floor(total / state.ticksPerWinter);
    while (state.time.winter < winter) {
        state.time = {winter: state.time.winter + 1, tick: 0};
        emit(state, 'WinterAdvanced');
    }
    state.time.tick = total % state.ticksPerWinter;
    validateState(state); return state;
}
export function advanceWinter(state: SimulationState): SimulationState {
    return applyCommand(state, {type: 'AdvanceWinter'});
}

export function serializeState(state: SimulationState): string {validateState(state); return JSON.stringify(state);}
export function reconstructState(serialized: string): SimulationState {
    const state = JSON.parse(serialized) as SimulationState;
    migrateLanding(state);migrateMechanics(state);
    validateState(state); return state;
}

function validateState(state: SimulationState): void {
    if (!state || state.schemaVersion !== 1) throw new Error('Unsupported simulation save');
    integer(state.seed, 'Seed'); integer(state.rngState, 'RNG state');
    if (state.seed > 0xffffffff || state.rngState > 0xffffffff) throw new Error('Seed/RNG state must be uint32');
    if (state.ticksPerWinter !== ticksPerWinter) throw new Error('Unsupported tick scale');
    integer(state.time.winter, 'Winter'); integer(state.time.tick, 'Tick');
    if (state.time.winter < 800 || state.time.tick >= ticksPerWinter) throw new Error('Invalid calendar');
    integer(state.stocks.food, 'Food'); integer(state.stocks.materials, 'Materials');
    if (!state.clan.id || !state.clan.name || !Array.isArray(state.events)) throw new Error('Invalid clan/events');
    const occupations = ['farmer', 'herder', 'fisher', 'hunter', 'textileWorker', 'smith', 'woodworker', 'boatbuilder', 'trader', 'leatherAndJewelleryMaker'];
    const timeValue = (time: GameTime) => {
        integer(time.winter, 'History Winter'); integer(time.tick, 'History tick');
        if (time.winter < 0 || time.tick >= ticksPerWinter || time.winter > state.time.winter || (time.winter === state.time.winter && time.tick > state.time.tick)) throw new Error('Invalid history time');
        return time.winter * ticksPerWinter + time.tick;
    };
    for (const [id, person] of Object.entries(state.personas)) {
        if (id !== person.id || !person.name || !person.originClanId) throw new Error('Invalid persona identity');
        integer(person.birthWinter, 'Birth Winter'); integer(person.workProgress, 'Work progress');
        if (person.birthWinter > state.time.winter) throw new Error('Future birth');
        if (person.deathWinter !== null) {
            integer(person.deathWinter, 'Death Winter');
            if (person.deathWinter < person.birthWinter || person.deathWinter > state.time.winter) throw new Error('Invalid death');
        }
        parseCharacterDNA(person.dna);
        if (!Array.isArray(person.parentIds) || !Array.isArray(person.occupationHistory)) throw new Error('Invalid persona history');
        if (person.occupation !== null && !occupations.includes(person.occupation)) throw new Error('Unknown occupation');
        let previousEnd = 0;
        person.occupationHistory.forEach((entry, index) => {
            if (!occupations.includes(entry.occupation)) throw new Error('Invalid occupation history');
            const start = timeValue(entry.startedAt);
            if (start < previousEnd) throw new Error('Overlapping occupation history');
            if (entry.endedAt === null) {
                if (index !== person.occupationHistory.length - 1 || entry.occupation !== person.occupation) throw new Error('Invalid active occupation');
                previousEnd = timeValue(state.time);
            } else {
                previousEnd = timeValue(entry.endedAt);
                if (previousEnd < start) throw new Error('Backwards occupation history');
            }
        });
        if (person.occupation !== null && person.occupationHistory.at(-1)?.endedAt !== null) throw new Error('Missing active occupation');
        for (const parent of person.parentIds) if (parent === id || !Object.hasOwn(state.personas, parent)) throw new Error('Unknown parent');
        if (person.partnerId !== null && !Object.hasOwn(state.personas, person.partnerId)) throw new Error('Unknown partner');
    }
    for (const [id, family] of Object.entries(state.families)) {
        if (family.id !== id || !Array.isArray(family.memberIds) || family.memberIds.some(member => !Object.hasOwn(state.personas, member))) throw new Error('Invalid family');
    }
    for (const [id, household] of Object.entries(state.households)) {
        if (household.id !== id || !Array.isArray(household.memberIds) || household.memberIds.some(member => !Object.hasOwn(state.personas, member))) throw new Error('Invalid household');
        if (household.residenceId !== null && !Object.hasOwn(state.residences, household.residenceId)) throw new Error('Unknown residence');
    }
    for (const [id, residence] of Object.entries(state.residences)) {
        if (residence.id !== id || !['house', 'tent'].includes(residence.kind)) throw new Error('Invalid residence');
        if (residence.buildingId !== null && !Object.hasOwn(state.buildings, residence.buildingId)) throw new Error('Unknown building');
    }
    for (const [id, building] of Object.entries(state.buildings)) if (id !== building.id || building.kind !== 'house') throw new Error('Invalid building');
    let previousEventTime = 0;
    state.events.forEach((event, index) => {
        const timestamp = timeValue(event.time);
        if (timestamp < previousEventTime) throw new Error('Backwards events');
        previousEventTime = timestamp;
        if (event.personaId && !Object.hasOwn(state.personas, event.personaId)) throw new Error('Unknown event persona');
        if (event.id !== `event-${index + 1}` || !event.type) throw new Error('Invalid event identity');
        integer(event.time.winter, 'Event Winter'); integer(event.time.tick, 'Event tick');
        if (event.time.tick >= ticksPerWinter || event.time.winter < 800 || event.time.winter > state.time.winter || (event.time.winter === state.time.winter && event.time.tick > state.time.tick)) throw new Error('Invalid event time');
    });
    validateMechanics(state);
    validateLanding(state);
}

export function canApplyCommand(state:SimulationState,command:SimulationCommand):boolean {
    try{applyCommand(state,command);return true;}catch{return false;}
}
