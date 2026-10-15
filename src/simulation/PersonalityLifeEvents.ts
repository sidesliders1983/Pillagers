import {personaIdentity} from './Identity';
import {eventFacts} from './EventFacts';
import {prohibitedKinship, isProvidingCare} from './FamilyMechanics';
import {personaAway} from './WorldExpeditions';
import {personaAge} from './PersonaAge';
import type {SimulationEvent} from './SimulationCore';
import type {SimulationState} from './SimulationCore';

/** Experimental basis points, saved per campaign; never applied to ordinary campaigns. */
export const defaultSocialConfig = {
    enabled: false,
    quarrelMinBps: 500, quarrelMaxBps: 3000,
    mediationMinBps: 1000, mediationMaxBps: 3000, mediationSuccessBps: 5000,
    reconciliationMinBps: 1000, reconciliationMaxBps: 2000,
    failedMediationCooldownYears: 2, reconciliationMemoryYears: 3,
    reconciledQuarrelMultiplierBps: 5000, expiryYears: 5,
    candidateBudget: 128
};
export type SocialConfig = typeof defaultSocialConfig;
export type SocialIncident = {
    id: string; participants: [string, string]; openedWinter: number;
    openingEventId: string; contextEventId: string; lastEventId: string;
    nextMediationWinter: number;
};
export type SocialState = {
    version: 1;
    config: SocialConfig;
    rngState: number;
    lastEvaluatedWinter: number;
    nextIncident: number;
    incidents: SocialIncident[];
    recentReconciliations: {participants: [string, string]; untilWinter: number; eventId: string}[];
    lastWindow: {winter: number; contextEventId: string; candidateChecks: number;
        opportunities: {kind: string; participants: string[]; probabilityBps: number; result: string}[]};
};
export function initializeSocial(state: SimulationState, overrides: Partial<SocialConfig>): void {
    const config = {...defaultSocialConfig, ...overrides};
    validateConfig(config);
    if (!config.enabled) return;
    state.social = {version: 1, config, rngState: (state.seed ^ 0x736f6331) >>> 0,
        lastEvaluatedWinter: state.time.winter, nextIncident: 1, incidents: [], recentReconciliations: [],
        lastWindow: {winter: state.time.winter, contextEventId: '', candidateChecks: 0, opportunities: []}};
}
const socialTypes = new Set(['ResidentQuarrelled', 'MediationAttempted', 'ResidentsReconciled', 'SocialIncidentEnded']);
function fail(): never { throw new Error('Invalid social pilot save or source history.'); }
function uint(value: unknown, maximum = Number.MAX_SAFE_INTEGER): boolean {
    return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}
function validateConfig(config: SocialConfig): void {
    if (!config || typeof config.enabled !== 'boolean') fail();
    for (const [key, original] of Object.entries(defaultSocialConfig)) {
        const value = config[key as keyof SocialConfig];
        if (typeof original === 'boolean') continue;
        if (!uint(value, key.endsWith('Bps') ? 10000 : key === 'candidateBudget' ? 1024 : 100)) fail();
        if (!key.endsWith('Bps') && Number(value) === 0) fail();
    }
    if (config.quarrelMinBps > config.quarrelMaxBps || config.mediationMinBps > config.mediationMaxBps ||
        config.reconciliationMinBps > config.reconciliationMaxBps) fail();
}
export function validateSocial(state: SimulationState): void {
    const social = state.social;
    if (!social) {
        if (state.events.some(event => socialTypes.has(event.type))) fail();
        return;
    }
    validateConfig(social.config);
    if (social.version !== 1 || !social.config.enabled || !state.mechanics ||
        !uint(social.rngState, 0xffffffff) || social.lastEvaluatedWinter !== state.time.winter ||
        !Array.isArray(social.incidents) || !Array.isArray(social.recentReconciliations)) fail();
    const active = new Map<string, SocialIncident>();
    const memories = new Map<string, SocialState['recentReconciliations'][number]>();
    const byId = new Map<string, SimulationEvent>();
    let next = 1;
    for (const event of state.events) {
        if (!socialTypes.has(event.type)) { byId.set(event.id, event); continue; }
        const details = event.details!;
        if (!details || details.configVersion !== 1 || typeof details.incidentId !== 'string' ||
            !Array.isArray(details.participants) || new Set(details.participants).size !== details.participants.length ||
            details.participants.length !== (event.type === 'MediationAttempted' ? 3 : 2) ||
            !Array.isArray(details.people) || details.people.length !== details.participants.length) fail();
        const pair = details.participants.slice(0, 2) as [string, string];
        if (!pair.every(id => typeof id === 'string')) fail();
        for (const id of details.participants) {
            if (typeof id !== 'string' || !personaIdentity(state, id)) fail();
            const snapshot = details.people.find((person: {id: string}) => person?.id === id);
            if (!snapshot || typeof snapshot.name !== 'string' || !snapshot.name || !uint(snapshot.age) ||
                snapshot.age < state.mechanics.config.adultAge) fail();
        }
        if (event.time.tick !== 0 && !(event.type === 'SocialIncidentEnded' && details.reason === 'inactive')) fail();
        if (event.type === 'ResidentQuarrelled') {
            const context = byId.get(String(details.contextEventId));
            if (details.incidentId !== 'incident-' + next++ || !context || context.type !== 'FoodConsumed' ||
                Number(context.details?.shortfall) <= 0 || context.time.winter !== event.time.winter ||
                details.context !== 'resident-food-shortfall' || !uint(details.probabilityBps, 10000) ||
                [...active.values()].some(other => samePair(pair, other.participants))) fail();
            active.set(details.incidentId, {id: details.incidentId, participants: pair,
                openedWinter: event.time.winter, openingEventId: event.id, contextEventId: context.id,
                lastEventId: event.id, nextMediationWinter: event.time.winter + 1});
        } else {
            const incident = active.get(details.incidentId);
            if (!incident || !samePair(pair, incident.participants) ||
                details.openingEventId !== incident.openingEventId || details.priorEventId !== incident.lastEventId ||
                details.contextEventId !== incident.contextEventId) fail();
            if (event.type === 'MediationAttempted') {
                if (details.mediatorId !== details.participants[2] || typeof details.success !== 'boolean' ||
                    !uint(details.initiativeBps, 10000) || !uint(details.successBps, 10000) ||
                    event.time.winter < incident.nextMediationWinter) fail();
                incident.lastEventId = event.id;
                if (!details.success) incident.nextMediationWinter = event.time.winter + social.config.failedMediationCooldownYears;
            } else if (event.type === 'ResidentsReconciled') {
                if (event.time.winter <= incident.openedWinter || !['independent', 'mediated'].includes(String(details.method))) fail();
                const prior = byId.get(incident.lastEventId);
                if (details.method === 'mediated' && (prior?.type !== 'MediationAttempted' || prior.details?.success !== true ||
                    prior.time.winter !== event.time.winter)) fail();
                active.delete(incident.id);
                const key = [...pair].sort().join('|');
                memories.set(key, {participants: pair, untilWinter: event.time.winter + social.config.reconciliationMemoryYears, eventId: event.id});
            } else {
                if (!['inactive', 'expired-unresolved'].includes(String(details.reason)) ||
                    details.reason === 'expired-unresolved' && event.time.winter < incident.openedWinter + social.config.expiryYears) fail();
                active.delete(incident.id);
            }
        }
        byId.set(event.id, event);
    }
    const expectedActive = [...active.values()];
    if (social.nextIncident !== next || JSON.stringify(social.incidents) !== JSON.stringify(expectedActive) ||
        expectedActive.some(incident => incident.openedWinter + social.config.expiryYears <= state.time.winter ||
            incident.participants.some(id => !state.personas[id] || state.personas[id].deathWinter !== null))) fail();
    const expectedMemory = [...memories.values()].filter(memory => memory.untilWinter > state.time.winter &&
        memory.participants.every(id => !!state.personas[id] && state.personas[id].deathWinter === null));
    // Reinsertions use latest-resolution ordering, independent of an older overwritten pair key.
    expectedMemory.sort((a, b) => state.events.findIndex(e => e.id === a.eventId) - state.events.findIndex(e => e.id === b.eventId));
    if (JSON.stringify(social.recentReconciliations) !== JSON.stringify(expectedMemory)) fail();
    const window = social.lastWindow;
    if (!window || window.winter !== social.lastEvaluatedWinter || !uint(window.candidateChecks, social.config.candidateBudget) ||
        !Array.isArray(window.opportunities) || window.opportunities.length > 3 ||
        window.opportunities.some(opportunity => !uint(opportunity.probabilityBps, 10000) ||
            !['quarrel', 'mediation-initiative', 'mediation-result', 'reconciliation'].includes(opportunity.kind) ||
            !['opened', 'no-event', 'attempted', 'reconciled', 'failed'].includes(opportunity.result) ||
            !Array.isArray(opportunity.participants))) fail();
    if (window.contextEventId) {
        const context = byId.get(window.contextEventId);
        if (!context || context.type !== 'FoodConsumed' || context.time.winter !== window.winter) fail();
    } else if (window.opportunities.length || next > 1) fail();
}

function draw(social: SocialState): number {
    social.rngState = (Math.imul(social.rngState, 1664525) + 1013904223) >>> 0;
    return social.rngState / 0x100000000;
}
function roll(social: SocialState, bps: number): boolean {
    return bps > 0 && draw(social) * 10000 < bps;
}
function available(state: SimulationState, id: string): boolean {
    const person = state.personas[id];
    return !!person && person.deathWinter === null &&
        personaAge(state, id) >= state.mechanics!.config.adultAge &&
        !personaAway(state, id) && !isProvidingCare(state, id);
}
function tied(state: SimulationState, a: string, b: string): boolean {
    return state.personas[a].partnerId === b || prohibitedKinship(state, a, b) ||
        Object.values(state.households).some(home => home.memberIds.includes(a) && home.memberIds.includes(b));
}
function samePair(a: readonly string[], b: readonly string[]): boolean {
    return a.length === 2 && b.length === 2 && a.every(id => b.includes(id));
}
function emit(state: SimulationState, type: string, details: Record<string, unknown>): string {
    const id = 'event-' + (state.events.length + 1);
    const facts = eventFacts(state, details);
    if (Array.isArray(details.participants)) facts.people = details.participants.map(id => {
        const person = personaIdentity(state, String(id));
        if (!person) throw new Error('Unknown social participant.');
        return {id, name: person.name, age: personaAge(state, id)};
    });
    state.events.push({id, type, time: {...state.time}, details: facts});
    return id;
}
/** Public fixed-context probabilities. Traits are normalized DNA values; outcomes are basis points. */
export function socialProbabilities(config: SocialConfig, meanTemperament: number,
    helperTemperament = 0, recentlyReconciled = false) {
    for (const value of [meanTemperament, helperTemperament])
        if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid Temperament.');
    const lerp = (low: number, high: number, trait: number) => Math.round(low + (high - low) * trait);
    const raw = lerp(config.quarrelMinBps, config.quarrelMaxBps, meanTemperament);
    return {
        quarrelBps: recentlyReconciled ? Math.floor(raw * config.reconciledQuarrelMultiplierBps / 10000) : raw,
        mediationInitiativeBps: lerp(config.mediationMinBps, config.mediationMaxBps, helperTemperament),
        mediationSuccessBps: config.mediationSuccessBps,
        reconciliationBps: lerp(config.reconciliationMinBps, config.reconciliationMaxBps, 1 - meanTemperament)
    };
}
/** Bounded cyclic scan with a seeded starting pair and reservoir selection among eligible ties. */
function newPair(state: SimulationState, used: Set<string>): [string, string] | undefined {
    const social = state.social!;
    const ids = Object.keys(state.personas).sort().filter(id => available(state, id) && !used.has(id));
    const total = ids.length * (ids.length - 1) / 2;
    if (!total) return undefined;
    const start = Math.floor(draw(social) * total);
    let selected: [string, string] | undefined;
    let count = 0;
    for (let offset = 0; offset < Math.min(total, social.config.candidateBudget); offset++) {
        let index = (start + offset) % total;
        let first = 0;
        while (index >= ids.length - first - 1) index -= ids.length - ++first;
        const pair: [string, string] = [ids[first], ids[first + 1 + index]];
        social.lastWindow.candidateChecks++;
        if (!tied(state, ...pair) || social.incidents.some(incident => samePair(incident.participants, pair))) continue;
        count++;
        if (draw(social) * count < 1) selected = pair;
    }
    return selected;
}
export function evaluateSocialYear(state: SimulationState, context: SimulationEvent): void {
    const social = state.social;
    if (!social || social.lastEvaluatedWinter >= state.time.winter) return;
    social.lastEvaluatedWinter = state.time.winter;
    social.lastWindow = {winter: state.time.winter, contextEventId: context.id, candidateChecks: 0, opportunities: []};
    social.recentReconciliations = social.recentReconciliations.filter(memory => memory.untilWinter > state.time.winter);
    const used = new Set<string>();
    resolveExisting(state, used);
    if (Number(context.details?.shortfall) <= 0) return;
    const pair = newPair(state, used);
    if (!pair) return;
    const mean = pair.reduce((sum, id) => sum + state.personas[id].dna.traits.temperament, 0) / 2;
    const recent = social.recentReconciliations.some(memory => samePair(memory.participants, pair));
    const probabilityBps = socialProbabilities(social.config, mean, 0, recent).quarrelBps;
    const success = roll(social, probabilityBps);
    social.lastWindow.opportunities.push({kind: 'quarrel', participants: pair, probabilityBps,
        result: success ? 'opened' : 'no-event'});
    if (!success) return;
    const id = 'incident-' + social.nextIncident++;
    const openingEventId = emit(state, 'ResidentQuarrelled', {incidentId: id, participants: pair,
        contextEventId: context.id, context: 'resident-food-shortfall', probabilityBps, configVersion: 1});
    social.incidents.push({id, participants: pair, openedWinter: state.time.winter,
        openingEventId, contextEventId: context.id, lastEventId: openingEventId,
        nextMediationWinter: state.time.winter + 1});
}

function resolution(state: SimulationState, incident: SocialIncident, method: string): void {
    const social = state.social!;
    const eventId = emit(state, 'ResidentsReconciled', {incidentId: incident.id,
        participants: incident.participants, openingEventId: incident.openingEventId,
        priorEventId: incident.lastEventId, contextEventId: incident.contextEventId, method, configVersion: 1});
    social.incidents = social.incidents.filter(other => other.id !== incident.id);
    social.recentReconciliations = social.recentReconciliations.filter(memory => !samePair(memory.participants, incident.participants));
    social.recentReconciliations.push({participants: incident.participants,
        untilWinter: state.time.winter + social.config.reconciliationMemoryYears, eventId});
}
function resolveExisting(state: SimulationState, used: Set<string>): void {
    const social = state.social!;
    const candidates = social.incidents.filter(incident => incident.openedWinter < state.time.winter &&
        incident.participants.every(id => available(state, id)));
    if (!candidates.length) return;
    const incident = candidates[Math.floor(draw(social) * candidates.length)];
    incident.participants.forEach(id => used.add(id));
    const mean = incident.participants.reduce((sum, id) => sum + state.personas[id].dna.traits.temperament, 0) / 2;
    if (state.time.winter >= incident.nextMediationWinter) {
        const helpers = Object.keys(state.personas).sort().filter(id => !used.has(id) &&
            available(state, id) && incident.participants.some(other => tied(state, id, other)));
        if (helpers.length) {
            const helperId = helpers[Math.floor(draw(social) * helpers.length)];
            const chances = socialProbabilities(social.config, mean, state.personas[helperId].dna.traits.temperament);
            const attempted = roll(social, chances.mediationInitiativeBps);
            social.lastWindow.opportunities.push({kind: 'mediation-initiative',
                participants: [...incident.participants, helperId], probabilityBps: chances.mediationInitiativeBps,
                result: attempted ? 'attempted' : 'no-event'});
            if (attempted) {
                used.add(helperId);
                const success = roll(social, chances.mediationSuccessBps);
                incident.lastEventId = emit(state, 'MediationAttempted', {incidentId: incident.id,
                    participants: [...incident.participants, helperId], mediatorId: helperId,
                    openingEventId: incident.openingEventId, priorEventId: incident.lastEventId,
                    contextEventId: incident.contextEventId, success, configVersion: 1,
                    initiativeBps: chances.mediationInitiativeBps, successBps: chances.mediationSuccessBps});
                social.lastWindow.opportunities.push({kind: 'mediation-result',
                    participants: [...incident.participants, helperId], probabilityBps: chances.mediationSuccessBps,
                    result: success ? 'reconciled' : 'failed'});
                if (success) resolution(state, incident, 'mediated');
                else incident.nextMediationWinter = state.time.winter + social.config.failedMediationCooldownYears;
                return;
            }
        }
    }
    const probabilityBps = socialProbabilities(social.config, mean).reconciliationBps;
    const success = roll(social, probabilityBps);
    social.lastWindow.opportunities.push({kind: 'reconciliation', participants: incident.participants,
        probabilityBps, result: success ? 'reconciled' : 'no-event'});
    if (success) resolution(state, incident, 'independent');
}

/** Housekeeping has no draws; departure/death preserves history without a false reconciliation. */
export function pruneSocialIncidents(state: SimulationState): void {
    const social = state.social;
    if (!social) return;
    for (const incident of [...social.incidents]) {
        const inactive = incident.participants.some(id => !state.personas[id] || state.personas[id].deathWinter !== null);
        const expired = state.time.winter >= incident.openedWinter + social.config.expiryYears;
        if (!inactive && !expired) continue;
        emit(state, 'SocialIncidentEnded', {incidentId: incident.id, participants: incident.participants,
            openingEventId: incident.openingEventId, priorEventId: incident.lastEventId,
            contextEventId: incident.contextEventId, reason: inactive ? 'inactive' : 'expired-unresolved', configVersion: 1});
        social.incidents = social.incidents.filter(other => other.id !== incident.id);
    }
    social.recentReconciliations = social.recentReconciliations.filter(memory =>
        memory.untilWinter > state.time.winter && memory.participants.every(id =>
            !!state.personas[id] && state.personas[id].deathWinter === null));
}
