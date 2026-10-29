export { availableOccupationIds } from './Mechanics';
import { bindMining, validateMining, applyMiningCommand, requireMiningAdvance, stepMining, migrateMining } from './Mining';
import type { MiningState, MiningCommand } from './Mining';
export { inspectMining } from './Mining';
import { initializeTrade, validateTrade, applyMerchantCommand, type MerchantCommand, type TradeState, type TradeConfig } from './VisitingMerchants';
import {
    stepWildlifeSightings, validateWildlife, validateWildlifeSighting, wildlifeSighting, assertWildlifeWorld,
    initializeWildlifeSightings as bindWildlifeSightings, type WildlifeState,
} from './WildlifeSightings';
import { applySmitheryCommand, validateSmithery, type SmitheryState, type SmitheryCommand } from './Smithery';
import { seededRandom } from '../characters/seededRandom';
import { assertIslandClanWorld, type IslandClanLandscape } from './IslandClans';
import { applySpatialCommand, stepSpatialExpeditions, requireSpatialAdvance, validateSpatialExpeditions } from './SpatialExpeditions';
import { applyLongshipCommand, type LongshipCommand } from './LongshipTransport';
import type { PhysicalExpeditionContext, SpatialExpeditionCommand } from './SpatialExpeditions';
export { exploreOffer, startExpeditionOffer, inspectSpatialExpeditions } from './SpatialExpeditions';
export { islandMissionOffer, inspectIslandMissions } from './IslandMissions';
import { dispatchIslandMission, type IslandMissionCommand } from './IslandMissions';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { assertDiscoveryWorld, createClanDiscovery, commitClanObservation, validateClanDiscovery, type ClanDiscovery } from './ClanDiscovery';
import { birthdayCalendarMode, validateBirthdayCalendar, validatePersonaDates } from './BirthdayCalendar';
import type { BirthdayCalendar, BirthdayCalendarMode } from './BirthdayCalendar';
export type { BirthdayCalendarMode } from './BirthdayCalendar';
import { foundingTime, type FoundingPhase } from './FoundingPhase';
export type { FoundingPhase } from './FoundingPhase';
import { setCampfire, validateCampfire } from './Campfire';
import type { CampfireState, CampfireCommand } from './Campfire';
export { inspectCampfire } from './Campfire';
export { inspectLivestockBreeding } from './LivestockBreeding';
export { inspectIslandMissionLivestock } from './MissionLivestock';
import {initializeSocial, validateSocial} from './PersonalityLifeEvents';
import type {SocialState, SocialConfig} from './PersonalityLifeEvents';
export {defaultSocialConfig, socialProbabilities} from './PersonalityLifeEvents';
import { initializeCulture, useCulturalOccasions, applyCultureCommand, validateCulture, isCulturalEvent } from './CulturalEvents';
import type { CultureConfig, CultureState, CultureCommand } from './CulturalEvents';
export { defaultCultureConfig, gatheringOffer, inspectCulture, availableCulturalParticipants, weddingCandidates } from './CulturalEvents';
export type { CultureConfig, CultureCommand, CultureState, CulturalOccasion, CulturalParticipant, WeddingCandidate } from './CulturalEvents';
import { initializeContextualSupport, validateContextualSupport } from './ContextualSupport';
import type { ContextualSupportState, ContextualSupportConfig } from './ContextualSupport';
export { defaultContextualSupportConfig } from './ContextualSupport';
export type { ContextualSupportState, ContextualSupportConfig } from './ContextualSupport';
import {personaIdentity} from './Identity';
import {initializeWorld,validateWorld,applyExpeditionCommand,personaAway,namespaceTarget} from './WorldExpeditions';
import type {WorldState,ExpeditionCommand,ExpeditionConfig} from './WorldExpeditions';
export {inspectWorld,missionOffer,defaultExpeditionConfig,missionTypes,personaAway} from './WorldExpeditions';
import {initializeWeather,validateWeather,useSeasonalWeatherProduction} from './Weather';
import type {WeatherState,WeatherConfig} from './Weather';
export {inspectWeather,inspectWeatherExposure,weatherProductionModifiers,defaultWeatherConfig,weatherClasses} from './Weather';
import {eventFacts} from './EventFacts';
import {farmyards,reconcileFarmyards} from './Farmyards';
export {inspectBuilding, inspectWork, occupationAptitude, occupationIds} from './Mechanics';
export {caregiverEligible, isProvidingCare} from './FamilyMechanics';
export {landingSummary} from './Landing';
import {createCampaign as generateCampaign, isLandingCommand, applyLandingCommand, validateLanding, migrateLanding} from './Landing';
import type {LandingState, LandingCommand, LandingConfig} from './Landing';
import type { LivestockRules } from './LivestockSpecies';
import { validateSpecialistStocks, type SpecialistStocks } from './SpecialistStocks';
export type CampaignLivestockRules = {
    player?: LivestockRules;
    targetClans?: Record<string, LivestockRules>;
};
export {canPartner} from './FamilyMechanics';
import {availableOccupationIds,initializeMechanics, stepMechanicsTick, isMechanicsCommand, applyMechanicsCommand, recordOccupationChange, validateMechanics, migrateMechanics} from './Mechanics';
import type {MechanicsState, PrototypeConfig, MechanicsCommand} from './Mechanics';
import {personaAge} from './PersonaAge';
export {personaAge} from './PersonaAge';
import {CharacterDNA, parseCharacterDNA} from '../characters/CharacterDNA';
import {generateCharacterDNA} from '../characters/generateCharacterDNA';
export const ticksPerWinter = 1000;
export type Occupation = 'farmer' | 'herder' | 'fisher' | 'hunter' | 'textileWorker' | 'smith' | 'woodworker' | 'boatbuilder' | 'trader' | 'leatherAndJewelleryMaker' | 'miner';
export type GameTime = {winter: number; tick: number};
export type Persona = {
    id: string; name: string; birthWinter: number; birthTick?: number; deathWinter: number | null; deathTick?: number;
    originClanId: string; dna: CharacterDNA; parentIds: string[]; partnerId: string | null;
    occupation: Occupation | null;
    occupationHistory: {occupation: Occupation; startedAt: GameTime; endedAt: GameTime | null}[];
    workProgress: number;
};
export type SimulationEvent = {id: string; time: GameTime; type: string; personaId?: string; details?: Record<string, unknown>};
export type SimulationState = {
    mining?: MiningState;
    trade?: TradeState;
    culture?: CultureState;
    contextualSupport?: ContextualSupportState;
    wildlife?: WildlifeState;
    specialistStocks?: SpecialistStocks;
    smithery?: SmitheryState;
    discovery?: ClanDiscovery;
    birthdayCalendar?: BirthdayCalendar;
    foundingPhase?: FoundingPhase;
    campfire?: CampfireState; social?: SocialState; entityPrefix?:string;personaArchive?:Record<string,Persona>;world?:WorldState; weather?:WeatherState; landing?: LandingState; mechanics?: MechanicsState; schemaVersion: 1; seed: number; rngState: number; ticksPerWinter: number; time: GameTime;
    clan: {id: string; name: string}; personas: Record<string, Persona>;
    families: Record<string, {id: string; memberIds: string[]}>;
    households: Record<string, {id: string; memberIds: string[]; residenceId: string | null}>;
    residences: Record<string, {id: string; kind: 'house' | 'tent'; buildingId: string | null}>;
    buildings: Record<string, {id: string; kind: 'house' | 'farmyard'; specialization: Occupation | null}>;
    stocks: {food: number; materials: number}; events: SimulationEvent[];
};
export function createCampaign(
    seed: number, overrides: Partial<LandingConfig> = {},
    mechanicsOverrides: Partial<PrototypeConfig> = {}, weatherOverrides: Partial<WeatherConfig> = {},
    expeditionOverrides: Partial<ExpeditionConfig> = {}, socialOverrides: Partial<SocialConfig> = {},
    targetLandingConfigs: Record<string, LandingConfig> = {}, foundingPhase?: FoundingPhase,
    calendarMode?: BirthdayCalendarMode, livestock?: CampaignLivestockRules,
    cultureOverrides: Partial<CultureConfig> = {},
    contextualSupportOverrides: Partial<ContextualSupportConfig> = {},
    tradeOverrides: Partial<TradeConfig> = {},
): SimulationState {
    // Player defaults are separate from the shared Landing factory used by CPU clans and QA.
    const state = generateCampaign(seed, {initialFood: 15, ...overrides}, mechanicsOverrides, foundingPhase, calendarMode, livestock?.player);
    initializeWeather(state, weatherOverrides);
    // A restarted world can contain new neighbours; inherit the first saved CPU rules for those.
    const savedTargetDefault = Object.keys(targetLandingConfigs).sort().map(id => targetLandingConfigs[id])[0];
    const savedLivestockDefault = Object.keys(livestock?.targetClans ?? {}).sort()
        .map(id => livestock!.targetClans![id])[0];
    initializeWorld(state, (targetSeed, clanId) => {
        const targetConfig = targetLandingConfigs[clanId] ?? savedTargetDefault ?? overrides;
        const targetLivestock = structuredClone(livestock?.targetClans?.[clanId] ??
            savedLivestockDefault ?? livestock?.player);
        // Only physical two-clan binding excludes the player's founding species.
        if (targetLivestock?.version === 2) delete targetLivestock.founding.excludedSpecies;
        const target = generateCampaign(targetSeed, targetConfig, mechanicsOverrides, foundingPhase, calendarMode, targetLivestock);
        initializeWeather(target, weatherOverrides);
        initializeCulture(target, cultureOverrides);
        return target;
    }, expeditionOverrides);
    initializeSocial(state, socialOverrides);
    initializeCulture(state, cultureOverrides);
    initializeContextualSupport(state, contextualSupportOverrides);
    initializeTrade(state, tradeOverrides);
    validateState(state);
    return state;
}
/** Explicit new-campaign binding; importing a historical save never adds deposits. */
export function initializePhysicalMining(input: SimulationState, world: WorldBlueprint, worldId: string): SimulationState {
    validateState(input);
    if (!input.mining) {
        const start = foundingTime(input.foundingPhase);
        if (input.time.winter !== start.winter || input.time.tick !== start.tick)
            throw new Error('Mining must be selected when creating a new campaign.');
    }
    const state = structuredClone(input);
    bindMining(state, world, worldId);
    validateState(state);
    return state;
}
export function initializeWildlifeSightings(input: SimulationState, world: WorldBlueprint, worldId: string) {
    validateState(input);
    const state = bindWildlifeSightings(input, world, worldId);
    validateState(state);
    return state;
}
/** Explicit new-world binding. This configuration step consumes no RNG, resources or game time. */
export function initializePhysicalDiscovery(input: SimulationState,
    world: Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'settlement'>, worldId: string): SimulationState {
    validateState(input);
    if (input.discovery) {
        assertDiscoveryWorld(input.discovery, world, worldId);
        return structuredClone(input);
    }
    const state = structuredClone(input);
    const observers = [{ id: 'founding-settlement', kind: 'settlement' as const, ...world.settlement.center }];
    if (world.settlement.harbor) observers.push({ id: 'founding-landing', kind: 'settlement', ...world.settlement.harbor });
    state.discovery = createClanDiscovery(world, worldId, state.clan.id, observers,
        state.time.winter * state.ticksPerWinter + state.time.tick);
    validateState(state);
    return state;
}
/** Explicit fresh-campaign migration; existing graph campaigns are never silently reinterpreted. */
export function initializeIslandClans(input: SimulationState, world: IslandClanLandscape, worldId: string): SimulationState {
    validateState(input);
    assertIslandClanWorld(input, world, worldId);
    if (input.world?.version === 2) return structuredClone(input);
    const founding = foundingTime(input.foundingPhase);
    if (input.discovery || input.time.winter !== founding.winter || input.time.tick !== founding.tick ||
        !input.world || Object.keys(input.world.groups).length || Object.keys(input.world.missions).length)
        throw new Error('Physical rival clans require a fresh campaign; existing worlds retain their saved meaning.');
    const state = initializePhysicalDiscovery(input, world, worldId);
    const clanId = 'island-rival';
    const random = seededRandom(state.seed, 'island-rival-clan-v1');
    const targetSeed = Math.floor(random() * 4294967296);
    const targetRules = Object.keys(input.world.targetClans).sort()
        .map(id => input.world!.targetClans[id].landing?.config)[0];
    const livestock = structuredClone(Object.keys(input.world.targetClans).sort()
        .map(id => input.world!.targetClans[id].landing?.livestock)[0] ?? input.landing?.livestock);
    if (livestock?.version === 2 && input.landing?.livestock?.version === 2)
        livestock.founding.excludedSpecies = Object.values(input.landing.cattle)[0].species!;
    const target = generateCampaign(targetSeed, targetRules, state.mechanics?.config,
        state.foundingPhase, birthdayCalendarMode(state), livestock);
    initializeWeather(target, state.weather?.config);
    initializeSocial(target, state.social?.config ?? {});
    initializeCulture(target, state.culture?.config);
    initializeContextualSupport(target, state.contextualSupport?.config ?? { enabled: false });
    const rival = namespaceTarget(target, clanId);
    rival.clan.name = 'Island community';
    state.world = { version: 2, config: structuredClone(input.world.config),
        groups: {}, missions: {}, regions: {}, knowledge: {}, targetClans: { [clanId]: rival },
        island: { version: 1, worldId, siteId: world.rivalSite!.candidateId, clanId,
            foundedAt: state.time.winter * state.ticksPerWinter + state.time.tick } };
    state.discovery = commitClanObservation(state.discovery!, world, worldId, clanId,
        [{ id: 'rival-settlement', kind: 'settlement', ...world.rivalSite!.center }],
        state.world.island!.foundedAt);
    validateState(state);
    return state;
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
export function createSettlement(seed:number, overrides:Partial<PrototypeConfig> = {}, socialOverrides:Partial<SocialConfig> = {}):SimulationState {
    const state=createFixtureClan(seed); state.personas.einar.dna.sex='male';state.personas.liv.dna.sex='female';state.personas.astrid.dna.sex='female';
    state.mechanics=initializeMechanics(state,overrides);
    for(const child of Object.values(state.personas))for(const parentId of child.parentIds){
        const parent=state.personas[parentId],info=state.mechanics.people[parentId];
        if(parent.dna.sex==='female'&&(info.lastBirthWinter===null||child.birthWinter>info.lastBirthWinter)){info.lastBirthWinter=child.birthWinter;info.childcareUntilWinter=child.birthWinter+state.mechanics.config.childcareWinters;}
    }
    initializeSocial(state,socialOverrides);validateState(state); return state;
}
export type SimulationCommand = MiningCommand | {type: 'UseSeasonalWeatherProduction'} | {type: 'UseCulturalOccasions'} | MerchantCommand | CultureCommand | SmitheryCommand | LongshipCommand | IslandMissionCommand | SpatialExpeditionCommand | CampfireCommand | ExpeditionCommand | LandingCommand | MechanicsCommand | {type: 'AdvanceTicks'; ticks: number} | {type: 'AdvanceWinter'} | {type: 'AssignOccupation'; personaId: string; occupation: Occupation | null};
function integer(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer`);
}
function emit(state: SimulationState, type: string, personaId?: string, details?: Record<string, unknown>) {
    state.events.push({id: `event-${state.events.length + 1}`, time: {...state.time}, type,
        ...(personaId ? {personaId} : {}), ...(details||personaId?{details:eventFacts(state,details,personaId)}:{})});
}
export function applyCommand(input: SimulationState, command: SimulationCommand, context?: PhysicalExpeditionContext): SimulationState {
    validateState(input);
    if (command.type === 'UseCulturalOccasions') {
        const state = structuredClone(input);
        useCulturalOccasions(state);
        validateState(state);
        return state;
    }
    if (command.type === 'UseSeasonalWeatherProduction') {
        const state = structuredClone(input);
        useSeasonalWeatherProduction(state);
        validateState(state);
        return state;
    }
    if (command.type === 'BarterWithMerchant') {
        const state = structuredClone(input);
        applyMerchantCommand(state, command);
        validateState(state);
        return state;
    }
    if (command.type === 'SponsorGathering') {
        const state = structuredClone(input);
        applyCultureCommand(state, command);
        validateState(state);
        return state;
    }
    if (command.type === 'AssignMiner' || command.type === 'RecallMiner' || command.type === 'BuildMine') {
        const state = structuredClone(input);
        applyMiningCommand(state, command, context);
        validateState(state);
        return state;
    }
    if (command.type === 'SetSmitheryTarget' || command.type === 'AssignEquipment') {
        const state = structuredClone(input);
        applySmitheryCommand(state, command);
        validateState(state);
        return state;
    }
    if (command.type === 'BoardLongship' || command.type === 'DisembarkLongship' || command.type === 'LoadLongshipFood') {
        const state = structuredClone(input);
        applyLongshipCommand(state, command, context);
        validateState(state);
        return state;
    }
    if (command.type === 'DispatchIslandMission') {
        const state = structuredClone(input);
        dispatchIslandMission(state, command, context);
        validateState(state);
        return state;
    }
    if (command.type === 'StartExpedition' || command.type === 'CancelExpedition' ||
        command.type === 'ExploreArea' || command.type === 'RecallExpedition' ||
        command.type === 'CreateExplorationGroup' || command.type === 'SetExplorationMember') {
        const state = structuredClone(input);
        applySpatialCommand(state, command, context);
        validateState(state);
        return state;
    }
    if (command.type === 'SetCampfire') {
        const state = structuredClone(input);
        setCampfire(state, command.lit);
        validateState(state);
        return state;
    }
    if(['CreateExpeditionGroup','EditExpeditionGroup','DispatchExpedition'].includes(command.type)){const state=structuredClone(input);applyExpeditionCommand(state,command as ExpeditionCommand);validateState(state);return state;}
    if(isLandingCommand(command)){const state=structuredClone(input);applyLandingCommand(state,command as LandingCommand);reconcileFarmyards(state,farmyards(input).map(f=>f.id));validateState(state);return state;}
    if(isMechanicsCommand(command)){const state=structuredClone(input);applyMechanicsCommand(state,command as MechanicsCommand);reconcileFarmyards(state,farmyards(input).map(f=>f.id));validateState(state);return state;}
    if (command.type === 'AssignOccupation') {
        const occupations = availableOccupationIds(input);
        if(personaAway(input,command.personaId))throw new Error('Persona away on expedition');
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
    if (state.mechanics) {
        requireMiningAdvance(state, context);
        requireSpatialAdvance(state, context);
        assertWildlifeWorld(state, context);
        for (let index = 0; index < ticks; index++) {
            stepMechanicsTick(state);
            stepMining(state);
            const missions = stepSpatialExpeditions(state, context);
            stepWildlifeSightings(state, context, missions);
        }
        validateState(state);
        return state;
    }
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
    migrateLanding(state);migrateMechanics(state);migrateMining(state);
    validateState(state); return state;
}

function validateState(state: SimulationState): void {
    if (!state || state.schemaVersion !== 1) throw new Error('Unsupported simulation save');
    integer(state.seed, 'Seed'); integer(state.rngState, 'RNG state');
    if (state.seed > 0xffffffff || state.rngState > 0xffffffff) throw new Error('Seed/RNG state must be uint32');
    if (state.ticksPerWinter !== ticksPerWinter) throw new Error('Unsupported tick scale');
    integer(state.time.winter, 'Winter'); integer(state.time.tick, 'Tick');
    if (state.time.winter < 800 || state.time.tick >= ticksPerWinter) throw new Error('Invalid calendar');
    if (state.foundingPhase !== undefined) {
        const start = foundingTime(state.foundingPhase);
        if (state.time.winter === start.winter && state.time.tick < start.tick)
            throw new Error('Campaign time precedes its founding phase.');
    }
    integer(state.stocks.food, 'Food'); integer(state.stocks.materials, 'Materials');
    validateSpecialistStocks(state);
    validateMining(state);
    validateSmithery(state);
    validateWildlife(state);
    if (!state.clan.id || !state.clan.name || !Array.isArray(state.events)) throw new Error('Invalid clan/events');
    const occupations = availableOccupationIds(state);
    const timeValue = (time: GameTime) => {
        integer(time.winter, 'History Winter'); integer(time.tick, 'History tick');
        if (time.winter < 0 || time.tick >= ticksPerWinter || time.winter > state.time.winter || (time.winter === state.time.winter && time.tick > state.time.tick)) throw new Error('Invalid history time');
        return time.winter * ticksPerWinter + time.tick;
    };
    for (const [id, person] of Object.entries(state.personas)) {
        if (id !== person.id || !person.name || !person.originClanId) throw new Error('Invalid persona identity');
        validatePersonaDates(state,person);
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
        for (const parent of person.parentIds) if (parent === id || !personaIdentity(state,parent)) throw new Error('Unknown parent');
        if (person.partnerId !== null && !personaIdentity(state,person.partnerId)) throw new Error('Unknown partner');
    }
    for (const [id, family] of Object.entries(state.families)) {
        if (family.id !== id || !Array.isArray(family.memberIds) || family.memberIds.some(member => !personaIdentity(state,member))) throw new Error('Invalid family');
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
    const culturalEvents: SimulationEvent[] = [];
    const merchantEvents: SimulationEvent[] = [];
    let previousEventTime = 0;
    let wildlifeSequence = 0;
    const wildlifeFirsts = new Map<string, string>();
    state.events.forEach((event, index) => {
        if (['MerchantArrived', 'MerchantDeparted', 'MerchantBartered'].includes(event.type)) merchantEvents.push(event);
        if (isCulturalEvent(event) || event.type === 'SupportCompleted' || (state.culture !== undefined &&
            ['PartnershipFormed', 'CampfireFuelConsumed', 'CampfireChanged'].includes(event.type)))
            culturalEvents.push(event);
        validateWildlifeSighting(event, state);
        const sighting = wildlifeSighting(event);
        if (sighting) {
            if (sighting.encounterKey !== 'wildlife-' + ++wildlifeSequence ||
                sighting.firstForClan !== !wildlifeFirsts.has(sighting.speciesId))
                throw new Error('Invalid wildlife encounter ordering.');
            if (sighting.firstForClan) wildlifeFirsts.set(sighting.speciesId, event.id);
        }
        const timestamp = timeValue(event.time);
        if (timestamp < previousEventTime) throw new Error('Backwards events');
        previousEventTime = timestamp;
        if (event.personaId && !personaIdentity(state,event.personaId)) throw new Error('Unknown event persona');
        if (event.id !== `event-${index + 1}` || !event.type) throw new Error('Invalid event identity');
        integer(event.time.winter, 'Event Winter'); integer(event.time.tick, 'Event tick');
        if (event.time.tick >= ticksPerWinter || event.time.winter < 800 || event.time.winter > state.time.winter || (event.time.winter === state.time.winter && event.time.tick > state.time.tick)) throw new Error('Invalid event time');
    });
    if (state.wildlife && (state.wildlife.nextEncounter !== wildlifeSequence + 1 ||
        Object.keys(state.wildlife.firstDiscoveries).length !== wildlifeFirsts.size ||
        [...wildlifeFirsts].some(([species, id]) => state.wildlife!.firstDiscoveries[species] !== id)))
        throw new Error('Wildlife first discoveries do not match history.');
    for(const [id,p] of Object.entries(state.personaArchive??{})){if(id!==p.id||!p.name||!p.originClanId)throw new Error('Invalid historical identity');parseCharacterDNA(p.dna);integer(p.birthWinter,'Historical birth');validatePersonaDates(state,p);}
    validateBirthdayCalendar(state);
    validateCampfire(state);
    validateCulture(state, culturalEvents);
    validateTrade(state, merchantEvents);
    validateSocial(state);
    validateContextualSupport(state);
    validateMechanics(state);
    if (state.discovery !== undefined) {
        validateClanDiscovery(state.discovery, state.time.winter * state.ticksPerWinter + state.time.tick);
        if (!Object.hasOwn(state.discovery.clans, state.clan.id))
            throw new Error('Missing owning clan discovery.');
    }
    validateLanding(state);validateWeather(state);validateWorld(state,validateState);validateSpatialExpeditions(state);
}

export function canApplyCommand(state:SimulationState,command:SimulationCommand):boolean {
    try{applyCommand(state,command);return true;}catch{return false;}
}
export { inspectCattle, inspectLivestock } from './Livestock';
export type { LivestockSpecies, LivestockProfile, LivestockProfiles } from './LivestockSpecies';
export type { LivestockAnimal } from './Landing';

/** Explicit setup for headless species trials; this does not select or create founding animals. */
export function configureLivestock(
    input: SimulationState, profiles: import('./LivestockSpecies').LivestockProfiles,
): SimulationState {
    validateState(input);
    if (!input.landing) throw new Error('Livestock rules require a landing campaign');
    const founding = foundingTime(input.foundingPhase);
    if (input.time.winter !== founding.winter || input.time.tick !== founding.tick)
        throw new Error('Livestock profile setup requires the saved founding phase');
    const state = structuredClone(input);
    state.landing!.livestock = { version: 1, profiles: structuredClone(profiles) };
    validateState(state);
    return state;
}
