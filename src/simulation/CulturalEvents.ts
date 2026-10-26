import { ensureCampfireBurning, inspectCampfire } from './Campfire';
import { eventFacts } from './EventFacts';
import { providingCareIds } from './FamilyMechanics';
import { personaAge } from './PersonaAge';
import { personaIdentity } from './Identity';
import { inspectWeather, weatherFacts } from './Weather';
import { personaAway } from './WorldExpeditions';
import type { GameTime, SimulationEvent, SimulationState } from './SimulationCore';

export type CulturalOccasion = 'storytelling_music' | 'communal_ceremony' | 'wedding';
export type CultureConfig = {
    enabled: boolean;
    foodCost: number;
    minParticipants: number;
    maxParticipants: number;
    supportCapacity: number;
    exposureReductionBps: number;
};
/** Owner-approved experimental values; ordinary campaigns remain disabled. */
export const defaultCultureConfig: Readonly<CultureConfig> = {
    enabled: false, foodCost: 3, minParticipants: 3, maxParticipants: 8,
    supportCapacity: 2, exposureReductionBps: 2500,
};
export type CultureState = {
    version: 1;
    config: CultureConfig;
    nextSequence: number;
    supportSourceEventIds: string[];
    lastGatheringEventId: string | null;
};
export type CultureCommand = {
    type: 'SponsorGathering';
    occasion: CulturalOccasion;
    expectedSequence: number;
    quotedFood: number;
    quotedMaterials?: number;
    expectedParticipantIds: string[];
    sourceEventId?: string;
};
export function initializeCulture(state: SimulationState, overrides: Partial<CultureConfig> = {}): void {
    const config = { ...defaultCultureConfig, ...overrides };
    validateConfig(config);
    if (!config.enabled) return;
    state.culture = { version: 1, config, nextSequence: 1,
        supportSourceEventIds: [], lastGatheringEventId: null };
}
export function inspectCulture(state: SimulationState) {
    const culture = state.culture;
    const config = culture?.config ?? defaultCultureConfig;
    return { enabled: !!culture, prototype: true as const, foodCost: config.foodCost,
        minParticipants: config.minParticipants, maxParticipants: config.maxParticipants,
        supportCount: culture?.supportSourceEventIds.length ?? 0,
        supportCapacity: config.supportCapacity, exposureReductionBps: config.exposureReductionBps,
        sourceEventIds: [...(culture?.supportSourceEventIds ?? [])],
        lastGatheringEventId: culture?.lastGatheringEventId ?? null,
        nextSequence: culture?.nextSequence ?? 1 };
}
export type CulturalParticipant = { id: string; name: string; age: number };
/** Shared canonical eligibility; presentation may further restrict physical visibility. */
export function availableCulturalParticipants(state: SimulationState): CulturalParticipant[] {
    if (!state.mechanics) return [];
    const care = providingCareIds(state);
    return Object.keys(state.personas).sort().filter(id => {
        const person = state.personas[id];
        return person.deathWinter === null && personaAge(state, id) >= state.mechanics!.config.adultAge &&
            !personaAway(state, id) && !care.has(id);
    }).map(id => ({ id, name: state.personas[id].name, age: personaAge(state, id) }));
}
export type WeddingCandidate = {
    sourceEventId: string;
    spouseIds: [string, string];
    spouses: CulturalParticipant[];
    formedAt: GameTime;
    allowed: boolean;
    reason: string | null;
    celebratedEventId?: string;
};
type PartnershipSource = { event: SimulationEvent; spouseIds: [string, string] };
function partnershipPair(event: SimulationEvent): [string, string] | undefined {
    const ids = event.details?.participants;
    if (!Array.isArray(ids) || ids.length !== 2 || ids.some(id => typeof id !== 'string') || ids[0] === ids[1]) return;
    return [...ids].sort() as [string, string];
}
const pairKey = (ids: readonly string[]) => JSON.stringify(ids);
function weddingHistory(state: SimulationState) {
    const sources = new Map<string, PartnershipSource>();
    const latestByPair = new Map<string, string>();
    const celebrations = new Map<string, string>();
    // One pass, not one history search for every living couple.
    for (const event of state.events) {
        if (event.type === 'PartnershipFormed') {
            const spouseIds = partnershipPair(event);
            if (!spouseIds) continue;
            sources.set(event.id, { event, spouseIds });
            latestByPair.set(pairKey(spouseIds), event.id);
        } else if (event.type === 'CulturalGatheringHeld' && event.details?.occasion === 'wedding' &&
            typeof event.details.sourceEventId === 'string') {
            celebrations.set(event.details.sourceEventId, event.id);
        }
    }
    return { sources, latestByPair, celebrations };
}
function inWeddingWindow(state: SimulationState, formedAt: GameTime, at = state.time): boolean {
    const elapsed = (at.winter - formedAt.winter) * state.ticksPerWinter + at.tick - formedAt.tick;
    return elapsed >= 0 && elapsed < state.ticksPerWinter;
}
function currentPartnership(state: SimulationState, source: PartnershipSource,
    latestByPair: Map<string, string>): boolean {
    const [a, b] = source.spouseIds.map(id => state.personas[id]);
    return !!a && !!b && a.deathWinter === null && b.deathWinter === null &&
        a.partnerId === b.id && b.partnerId === a.id &&
        latestByPair.get(pairKey(source.spouseIds)) === source.event.id;
}
function weddingReason(state: SimulationState, sourceEventId: string | undefined,
    history: ReturnType<typeof weddingHistory>, availableIds: Set<string>): string | null {
    if (!sourceEventId) return 'Select a newly formed partnership.';
    const source = history.sources.get(sourceEventId);
    if (!source) return 'A wedding requires a recorded new partnership.';
    if (!currentPartnership(state, source, history.latestByPair)) return 'This partnership is no longer current.';
    if (!inWeddingWindow(state, source.event.time)) return 'The one-year wedding celebration window has ended.';
    if (history.celebrations.has(sourceEventId)) return 'This partnership has already been celebrated.';
    if (!source.spouseIds.every(id => availableIds.has(id))) return 'Both partners must be available for their wedding.';
    return null;
}
function commonGatheringReason(state: SimulationState, info: ReturnType<typeof inspectCulture>,
    participantCount: number, foodCost = info.foodCost, materialsCost = 0): string | null {
    return !info.enabled || !state.mechanics ? 'Cultural gatherings are not enabled in this campaign.' :
        participantCount < info.minParticipants ? 'Not enough available adult residents.' :
        info.supportCount >= info.supportCapacity ? 'The community already has its maximum prepared support.' :
        state.stocks.food < foodCost ? 'Not enough Food for this gathering.' :
        state.stocks.materials < materialsCost ? 'Not enough Materials to light the campfire.' : null;
}
function gatheringPrice(state: SimulationState, info: ReturnType<typeof inspectCulture>, occasion: CulturalOccasion,
    participantCount: number) {
    const perParticipant = occasion === 'wedding';
    const requiresCampfire = perParticipant || occasion === 'communal_ceremony';
    return { requiresCampfire,
        materialsCost: requiresCampfire && inspectCampfire(state).fuelTicks === 0 ? 1 : 0,
        foodCost: info.foodCost * (perParticipant ? participantCount : 1),
        foodCostBasis: perParticipant ? 'per_participant' as const : 'flat' as const,
        foodPerParticipant: perParticipant ? info.foodCost : null };
}
export function weddingCandidates(state: SimulationState): WeddingCandidate[] {
    const history = weddingHistory(state);
    const available = availableCulturalParticipants(state);
    const availableIds = new Set(available.map(person => person.id));
    const info = inspectCulture(state);
    const participantCount = Math.min(available.length, info.maxParticipants);
    const price = gatheringPrice(state, info, 'wedding', participantCount);
    return [...history.latestByPair.values()].flatMap(sourceEventId => {
        const source = history.sources.get(sourceEventId)!;
        if (!currentPartnership(state, source, history.latestByPair) || !inWeddingWindow(state, source.event.time)) return [];
        const reason = weddingReason(state, sourceEventId, history, availableIds) ??
            commonGatheringReason(state, info, participantCount, price.foodCost, price.materialsCost);
        return [{ sourceEventId, spouseIds: [...source.spouseIds] as [string, string],
            spouses: source.spouseIds.map(id => ({ id, name: state.personas[id].name, age: personaAge(state, id) })),
            formedAt: { ...source.event.time }, allowed: reason === null, reason,
            ...(history.celebrations.has(sourceEventId) ? { celebratedEventId: history.celebrations.get(sourceEventId)! } : {}) }];
    });
}
export function gatheringOffer(state: SimulationState, occasion: CulturalOccasion = 'storytelling_music',
    sourceEventId?: string) {
    const info = inspectCulture(state);
    const available = availableCulturalParticipants(state);
    const availableIds = new Set(available.map(person => person.id));
    const history = occasion === 'wedding' ? weddingHistory(state) : undefined;
    const spouseIds = history?.sources.get(sourceEventId ?? '')?.spouseIds;
    const selected = new Set(spouseIds?.filter(id => availableIds.has(id)) ?? []);
    for (const person of available) if (selected.size < info.maxParticipants) selected.add(person.id);
    const participants = available.filter(person => selected.has(person.id));
    const participantIds = participants.map(person => person.id);
    const occasionReason = !['storytelling_music', 'communal_ceremony', 'wedding'].includes(occasion) ?
        'This cultural occasion is not available.' : occasion === 'wedding' ?
            weddingReason(state, sourceEventId, history!, availableIds) : sourceEventId !== undefined ?
                'This occasion does not use a partnership source.' : null;
    const price = gatheringPrice(state, info, occasion, participants.length);
    const reason = commonGatheringReason(state, info, participants.length, price.foodCost, price.materialsCost) ?? occasionReason;
    return { ...info, ...price, occasion, allowed: reason === null, reason, participantIds, participants,
        expectedSequence: info.nextSequence,
        ...(occasion === 'wedding' ? { sourceEventId, spouseIds: spouseIds ? [...spouseIds] as [string, string] : undefined } : {}) };
}
export function applyCultureCommand(state: SimulationState, command: CultureCommand): void {
    const culture = state.culture;
    if (!Number.isSafeInteger(command.expectedSequence) || command.expectedSequence < 1)
        throw new Error('Invalid gathering request sequence.');
    if (culture && command.expectedSequence < culture.nextSequence) {
        // A historical retry is rare; ordinary offers never scan the event ledger.
        const receipt = state.events.find(event => event.type === 'CulturalGatheringHeld' &&
            event.details?.gatheringSequence === command.expectedSequence)?.details;
        if (!receipt || receipt.occasion !== command.occasion || receipt.sourceEventId !== command.sourceEventId ||
            receipt.foodCost !== command.quotedFood ||
            (receipt.requiresCampfire === true ? receipt.materialsCost !== command.quotedMaterials :
                command.quotedMaterials !== undefined && command.quotedMaterials !== 0) ||
            JSON.stringify(receipt.participants) !== JSON.stringify(command.expectedParticipantIds))
            throw new Error('This gathering request does not match its accepted receipt.');
        return;
    }
    const offer = gatheringOffer(state, command.occasion, command.sourceEventId);
    if (!offer.allowed) throw new Error(offer.reason!);
    if (command.expectedSequence !== offer.expectedSequence || command.quotedFood !== offer.foodCost ||
        (offer.requiresCampfire ? command.quotedMaterials !== offer.materialsCost :
            command.quotedMaterials !== undefined && command.quotedMaterials !== 0) ||
        !Array.isArray(command.expectedParticipantIds) ||
        JSON.stringify(command.expectedParticipantIds) !== JSON.stringify(offer.participantIds))
        throw new Error('The gathering quote has changed. Review it again.');
    const fireEventOffset = state.events.length;
    if (offer.requiresCampfire) ensureCampfireBurning(state);
    const campfireEventIds = state.events.slice(fireEventOffset).map(event => event.id);
    state.stocks.food -= offer.foodCost;
    const id = 'event-' + (state.events.length + 1);
    const details = eventFacts(state, { cultureVersion: 1, clanId: state.clan.id, gatheringSequence: culture!.nextSequence,
        occasion: command.occasion, foodCost: offer.foodCost, participants: offer.participantIds,
        ...(offer.requiresCampfire ? { requiresCampfire: true, materialsCost: offer.materialsCost, campfireEventIds } : {}),
        ...(command.occasion === 'wedding' ? { sourceEventId: offer.sourceEventId, spouseIds: offer.spouseIds, foodCostBasis: 'per_participant' } : {}),
        supportBefore: culture!.supportSourceEventIds.length,
        supportAfter: culture!.supportSourceEventIds.length + 1 });
    state.events.push({ id, time: { ...state.time }, type: 'CulturalGatheringHeld', details });
    culture!.supportSourceEventIds.push(id);
    culture!.lastGatheringEventId = id;
    culture!.nextSequence++;
}
export type CulturalWeatherRisk = {
    personaId: string;
    naturalRiskBps: number;
    baselineWeatherExposureBps: number;
};
/** Called only by the existing annual settlement mortality assessment, never by expedition returns. */
export function applyCulturalWeatherSupport(state: SimulationState, assessments: CulturalWeatherRisk[]) {
    const culture = state.culture;
    const weather = inspectWeather(state);
    if (!culture?.supportSourceEventIds.length || !weather.enabled ||
        (weather.class !== 'Harsh' && weather.class !== 'Severe')) return null;
    const riskInputs = assessments.flatMap(assessment => {
        const { naturalRiskBps, baselineWeatherExposureBps } = assessment;
        const weatherExposureBps = baselineWeatherExposureBps -
            Math.floor(baselineWeatherExposureBps * culture.config.exposureReductionBps / 10000);
        const baselineRiskBps = Math.min(10000, naturalRiskBps + baselineWeatherExposureBps);
        const mortalityRiskBps = Math.min(10000, naturalRiskBps + weatherExposureBps);
        return mortalityRiskBps < baselineRiskBps ? [{ ...assessment, weatherExposureBps,
            baselineRiskBps, mortalityRiskBps }] : [];
    });
    if (!riskInputs.length) return null;
    const supportBefore = culture.supportSourceEventIds.length;
    const sourceEventId = culture.supportSourceEventIds.shift()!;
    const id = 'event-' + (state.events.length + 1);
    const details = eventFacts(state, { cultureVersion: 1, clanId: state.clan.id,
        sourceEventIds: [sourceEventId], supportBefore, supportAfter: supportBefore - 1,
        exposureReductionBps: culture.config.exposureReductionBps, riskInputs,
        participants: riskInputs.map(risk => risk.personaId), ...weatherFacts(state) });
    state.events.push({ id, time: { ...state.time }, type: 'CultureWeatherSupportApplied', details });
    return { eventId: id, risks: new Map(riskInputs.map(risk => [risk.personaId, risk])) };
}
function fail(): never { throw new Error('Invalid cultural event state or source history.'); }
function uint(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): boolean {
    return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
function validateConfig(config: CultureConfig): void {
    if (!config || typeof config.enabled !== 'boolean' ||
        Object.keys(config).sort().join(',') !== Object.keys(defaultCultureConfig).sort().join(',') ||
        !uint(config.foodCost, 1, 1000000) || !uint(config.minParticipants, 3, 8) ||
        !uint(config.maxParticipants, config.minParticipants, 8) ||
        !uint(config.supportCapacity, 1, 2) || !uint(config.exposureReductionBps, 1, 2500)) fail();
}
function peopleFacts(state: SimulationState, details: Record<string, unknown>): string[] {
    const ids = details.participants;
    const people = details.people;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !personaIdentity(state, id)) ||
        new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify([...ids].sort()) ||
        !Array.isArray(people) || people.length !== ids.length || ids.some((id, index) => {
            const person = people[index];
            return !person || person.id !== id || typeof person.name !== 'string' || !person.name.trim() ||
                !uint(person.age);
        })) fail();
    return ids as string[];
}
export function isCulturalEvent(event: SimulationEvent): boolean {
    return event.type === 'CulturalGatheringHeld' || event.type === 'CultureWeatherSupportApplied';
}
function validateGatheringFire(event: SimulationEvent, lit: boolean, fuelTicks: number,
    recentFireEvents: readonly SimulationEvent[]): void {
    const details = event.details!;
    const newWedding = details.occasion === 'wedding' && details.foodCostBasis === 'per_participant';
    if (details.requiresCampfire === undefined) {
        // Genuine older prototype receipts predate compulsory ceremony fire; never rewrite them.
        if (newWedding || details.materialsCost !== undefined || details.campfireEventIds !== undefined) fail();
        return;
    }
    if (details.requiresCampfire !== true ||
        (details.occasion !== 'communal_ceremony' && !newWedding) || !lit || fuelTicks <= 0 ||
        !uint(details.materialsCost, 0, 1)) fail();
    const ids = details.campfireEventIds;
    if (!Array.isArray(ids) || ids.length > 2 || ids.some(id => typeof id !== 'string') ||
        new Set(ids).size !== ids.length) fail();
    const sources = ids.length ? recentFireEvents.slice(-ids.length) : [];
    const receiptNumber = Number(event.id.slice('event-'.length));
    if (sources.length !== ids.length || sources.some((source, index) =>
        source.id !== ids[index] || source.id !== 'event-' + (receiptNumber - ids.length + index) ||
        source.time.winter !== event.time.winter || source.time.tick !== event.time.tick) ||
        sources.filter(source => source.type === 'CampfireFuelConsumed').length !== details.materialsCost) fail();
}
export function validateCulture(state: SimulationState, culturalEvents: readonly SimulationEvent[]): void {
    const culture = state.culture;
    if (culture === undefined) {
        if (culturalEvents.some(isCulturalEvent)) fail();
        return;
    }
    if (!culture || typeof culture !== 'object' || Array.isArray(culture)) fail();
    validateConfig(culture.config);
    if (culture.version !== 1 || !state.mechanics || !culture.config.enabled ||
        Object.keys(culture).sort().join(',') !== 'config,lastGatheringEventId,nextSequence,supportSourceEventIds,version' ||
        !uint(culture.nextSequence, 1) || !Array.isArray(culture.supportSourceEventIds) ||
        culture.supportSourceEventIds.length > culture.config.supportCapacity) fail();
    const sources: string[] = [];
    let nextSequence = 1;
    let lastGathering: string | null = null;
    const partnershipSources = new Map<string, PartnershipSource>();
    const latestPartnerships = new Map<string, string>();
    const celebratedSources = new Set<string>();
    let fireLit = false, fireFuelTicks = 0, lastFireTick = 0;
    const recentFireEvents: SimulationEvent[] = [];
    for (const event of culturalEvents) {
        const now = event.time.winter * state.ticksPerWinter + event.time.tick;
        if (fireLit) fireFuelTicks = Math.max(0, fireFuelTicks - (now - lastFireTick));
        lastFireTick = now;
        if (event.type === 'CampfireFuelConsumed' || event.type === 'CampfireChanged') {
            if (event.type === 'CampfireFuelConsumed') {
                if (event.details?.units !== 1 || event.details.fuelTicks !== state.ticksPerWinter) fail();
                fireFuelTicks = state.ticksPerWinter;
            } else {
                if (typeof event.details?.lit !== 'boolean') fail();
                fireLit = event.details.lit;
            }
            recentFireEvents.push(event);
            if (recentFireEvents.length > 2) recentFireEvents.shift();
            continue;
        }
        if (event.type === 'PartnershipFormed') {
            const spouseIds = partnershipPair(event);
            if (spouseIds) {
                partnershipSources.set(event.id, { event, spouseIds });
                latestPartnerships.set(pairKey(spouseIds), event.id);
            }
            continue;
        }
        const details = event.details;
        if (!details || details.cultureVersion !== 1 || details.clanId !== state.clan.id) fail();
        const ids = peopleFacts(state, details);
        if (event.type === 'CulturalGatheringHeld') {
            validateGatheringFire(event, fireLit, fireFuelTicks, recentFireEvents);
            // Missing basis preserves already accepted flat-price prototype receipts unchanged.
            const perParticipant = details.occasion === 'wedding' && details.foodCostBasis === 'per_participant';
            const expectedFood = culture.config.foodCost * (perParticipant ? ids.length : 1);
            if (details.foodCostBasis !== undefined && !perParticipant) fail();
            if (typeof details.occasion !== 'string' ||
                !['storytelling_music', 'communal_ceremony', 'wedding'].includes(details.occasion) || details.gatheringSequence !== nextSequence++ ||
                details.foodCost !== expectedFood || details.supportBefore !== sources.length ||
                details.supportAfter !== sources.length + 1 || sources.length >= culture.config.supportCapacity ||
                ids.length < culture.config.minParticipants || ids.length > culture.config.maxParticipants ||
                (details.people as { age: number }[]).some(person => person.age < state.mechanics!.config.adultAge)) fail();
            if (details.occasion === 'wedding') {
                const sourceId = typeof details.sourceEventId === 'string' ? details.sourceEventId : '';
                const source = partnershipSources.get(sourceId);
                if (!source || JSON.stringify(details.spouseIds) !== JSON.stringify(source.spouseIds) ||
                    !source.spouseIds.every(id => ids.includes(id)) || celebratedSources.has(sourceId) ||
                    latestPartnerships.get(pairKey(source.spouseIds)) !== sourceId ||
                    !inWeddingWindow(state, source.event.time, event.time)) fail();
                celebratedSources.add(sourceId);
            } else if (details.sourceEventId !== undefined || details.spouseIds !== undefined) fail();
            sources.push(event.id);
            lastGathering = event.id;
        } else {
            const kind = details.weatherClass;
            if ((kind !== 'Harsh' && kind !== 'Severe') || !state.weather?.config.enabled ||
                event.time.tick !== 0 || details.weatherWinter !== event.time.winter - 1 ||
                details.regionId !== state.landing?.region.id || !sources.length ||
                JSON.stringify(details.sourceEventIds) !== JSON.stringify([sources[0]]) ||
                details.supportBefore !== sources.length || details.supportAfter !== sources.length - 1 ||
                details.exposureReductionBps !== culture.config.exposureReductionBps) fail();
            const risks = details.riskInputs;
            const baseExposure = state.weather.config.profiles[kind].tentMortalityBps;
            const exposure = baseExposure - Math.floor(baseExposure * culture.config.exposureReductionBps / 10000);
            if (!Array.isArray(risks) || risks.length !== ids.length || risks.some((risk, index) => {
                const age = (details.people as { age: number }[])[index].age;
                const naturalRisk = [...state.mechanics!.config.mortalityBands].reverse()
                    .find(band => band.minAge <= age)?.chanceBps ?? 0;
                return !risk || risk.personaId !== ids[index] || risk.naturalRiskBps !== naturalRisk ||
                    risk.baselineWeatherExposureBps !== baseExposure || risk.weatherExposureBps !== exposure ||
                    risk.baselineRiskBps !== Math.min(10000, naturalRisk + baseExposure) ||
                    risk.mortalityRiskBps !== Math.min(10000, naturalRisk + exposure) ||
                    risk.mortalityRiskBps >= risk.baselineRiskBps;
            })) fail();
            sources.shift();
        }
    }
    if (culture.nextSequence !== nextSequence || culture.lastGatheringEventId !== lastGathering ||
        JSON.stringify(culture.supportSourceEventIds) !== JSON.stringify(sources)) fail();
}
