import { eventFacts } from './EventFacts';
import { providingCareIds } from './FamilyMechanics';
import { personaAge } from './PersonaAge';
import { personaIdentity } from './Identity';
import { inspectWeather, weatherFacts } from './Weather';
import { personaAway } from './WorldExpeditions';
import type { SimulationEvent, SimulationState } from './SimulationCore';

export type CulturalOccasion = 'storytelling_music';
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
    expectedParticipantIds: string[];
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
export function gatheringOffer(state: SimulationState, occasion: CulturalOccasion = 'storytelling_music') {
    const info = inspectCulture(state);
    const care = state.mechanics ? providingCareIds(state) : new Set<string>();
    const participantIds = state.mechanics ? Object.keys(state.personas).sort().filter(id => {
        const person = state.personas[id];
        return person.deathWinter === null && personaAge(state, id) >= state.mechanics!.config.adultAge &&
            !personaAway(state, id) && !care.has(id);
    }).slice(0, info.maxParticipants) : [];
    const participants = participantIds.map(id => ({ id, name: state.personas[id].name,
        age: personaAge(state, id) }));
    const reason = !info.enabled || !state.mechanics ? 'Cultural gatherings are not enabled in this campaign.' :
        occasion !== 'storytelling_music' ? 'This cultural occasion is not available.' :
        participants.length < info.minParticipants ? 'Not enough available adult residents.' :
        info.supportCount >= info.supportCapacity ? 'The community already has its maximum prepared support.' :
        state.stocks.food < info.foodCost ? 'Not enough Food for this gathering.' : null;
    return { ...info, occasion, allowed: reason === null, reason, participantIds, participants,
        expectedSequence: info.nextSequence };
}
export function applyCultureCommand(state: SimulationState, command: CultureCommand): void {
    const culture = state.culture;
    if (!Number.isSafeInteger(command.expectedSequence) || command.expectedSequence < 1)
        throw new Error('Invalid gathering request sequence.');
    if (culture && command.expectedSequence < culture.nextSequence) {
        // A historical retry is rare; ordinary offers never scan the event ledger.
        const receipt = state.events.find(event => event.type === 'CulturalGatheringHeld' &&
            event.details?.gatheringSequence === command.expectedSequence)?.details;
        if (!receipt || receipt.occasion !== command.occasion || receipt.foodCost !== command.quotedFood ||
            JSON.stringify(receipt.participants) !== JSON.stringify(command.expectedParticipantIds))
            throw new Error('This gathering request does not match its accepted receipt.');
        return;
    }
    const offer = gatheringOffer(state, command.occasion);
    if (!offer.allowed) throw new Error(offer.reason!);
    if (command.expectedSequence !== offer.expectedSequence || command.quotedFood !== offer.foodCost ||
        !Array.isArray(command.expectedParticipantIds) ||
        JSON.stringify(command.expectedParticipantIds) !== JSON.stringify(offer.participantIds))
        throw new Error('The gathering quote has changed. Review it again.');
    state.stocks.food -= offer.foodCost;
    const id = 'event-' + (state.events.length + 1);
    const details = eventFacts(state, { cultureVersion: 1, clanId: state.clan.id, gatheringSequence: culture!.nextSequence,
        occasion: command.occasion, foodCost: offer.foodCost, participants: offer.participantIds,
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
export function validateCulture(state: SimulationState, culturalEvents: readonly SimulationEvent[]): void {
    const culture = state.culture;
    if (culture === undefined) {
        if (culturalEvents.length) fail();
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
    for (const event of culturalEvents) {
        const details = event.details;
        if (!details || details.cultureVersion !== 1 || details.clanId !== state.clan.id) fail();
        const ids = peopleFacts(state, details);
        if (event.type === 'CulturalGatheringHeld') {
            if (details.occasion !== 'storytelling_music' || details.gatheringSequence !== nextSequence++ ||
                details.foodCost !== culture.config.foodCost || details.supportBefore !== sources.length ||
                details.supportAfter !== sources.length + 1 || sources.length >= culture.config.supportCapacity ||
                ids.length < culture.config.minParticipants || ids.length > culture.config.maxParticipants ||
                (details.people as { age: number }[]).some(person => person.age < state.mechanics!.config.adultAge)) fail();
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
