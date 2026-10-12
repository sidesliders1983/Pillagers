import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {loadTypeScript} from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const types = new Set(['ResidentQuarrelled', 'MediationAttempted', 'ResidentsReconciled', 'SocialIncidentEnded']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Normalize sequential event identifiers only; every non-social value is still compared. */
export function nonSocial(state) {
    const copy = structuredClone(state); delete copy.social;
    copy.events = copy.events.filter(event => !types.has(event.type));
    const targets = copy.world?.targetClans;
    if (copy.world) delete copy.world.targetClans;
    const ids = new Map(copy.events.map((event, index) => [event.id, 'event-' + (index + 1)]));
    function normalize(value) {
        if (typeof value === 'string') return ids.get(value) ?? value;
        if (Array.isArray(value)) return value.map(normalize);
        if (value && typeof value === 'object') return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
        return value;
    }
    const normalized = normalize(copy);
    if (normalized.world) normalized.world.targetClans = Object.fromEntries(
        Object.entries(targets).map(([id, target]) => [id, nonSocial(target)]));
    return normalized;
}
export function studyInitial(seed, fixture = false, fullWorld = false) {
    let enabled;
    if (fixture) {
        enabled = core.createSettlement(seed, {fertilityChanceBps: 0, partnershipChanceBps: 0,
            careerReviewWinters: 0, childcareWinters: 0, mortalityBands: [{minAge: 0, chanceBps: 0}]}, {enabled: true});
        enabled.personas.astrid.birthWinter = 780;
        enabled.personas.astrid.dna.age = 20;
        enabled.mechanics.people.liv.lastBirthWinter = 780;
        enabled.mechanics.people.liv.childcareUntilWinter = 780;
        enabled.stocks.food = 0;
        enabled.stocks.materials = 100;
        enabled = core.reconstructState(JSON.stringify(enabled));
    } else {
        enabled = core.createCampaign(seed, {}, {}, {}, {}, {enabled: true});
        if (!fullWorld) delete enabled.world;
    }
    const disabled = structuredClone(enabled); delete disabled.social;
    return {enabled, disabled};
}
export function runSocialScenario({seed, winters = 25, fixture = false, fullWorld = false, verify = false}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(winters) || winters < 1 || winters > 100)
        throw new Error('Invalid social study options.');
    const initial = studyInitial(seed, fixture, fullWorld);
    let enabled = initial.enabled, disabled = initial.disabled;
    const initialJSON = core.serializeState(enabled);
    const annual = [];
    const midpoint = Math.max(1, Math.floor(winters / 2));
    let checkpoint;
    let enabledMs = 0, disabledMs = 0;
    for (let year = 1; year <= winters; year++) {
        const offset = enabled.events.length;
        let start = performance.now(); enabled = core.advanceWinter(enabled); enabledMs += performance.now() - start;
        start = performance.now(); disabled = core.advanceWinter(disabled); disabledMs += performance.now() - start;
        assert.deepEqual(nonSocial(enabled), disabled, 'Non-social outcome differs at seed ' + seed + ', year ' + year);
        const events = enabled.events.slice(offset);
        const food = events.find(event => event.type === 'FoodConsumed');
        annual.push({winter: enabled.time.winter, stocks: {...enabled.stocks}, rngState: enabled.rngState,
            foodShortfall: food.details.shortfall, residentFoodConsumed: food.details.units,
            livingResidents: Object.values(enabled.personas).filter(person => person.deathWinter === null).length,
            ...structuredClone(enabled.social.lastWindow),
            activeIncidents: enabled.social.incidents.map(incident => incident.id),
            eventIds: events.filter(event => types.has(event.type)).map(event => event.id)});
        if (year === midpoint) checkpoint = core.serializeState(enabled);
    }
    const verification = {};
    if (verify) {
        verification.batched = hash(core.applyCommand(initial.enabled, {type: 'AdvanceTicks', ticks: winters * 1000})) === hash(enabled);
        let repeat = core.reconstructState(initialJSON);
        for (let year = 0; year < winters; year++) repeat = core.advanceWinter(repeat);
        verification.repeat = hash(repeat) === hash(enabled);
        let resumed = core.reconstructState(checkpoint);
        for (let year = midpoint; year < winters; year++) resumed = core.advanceWinter(resumed);
        verification.saveLoad = hash(resumed) === hash(enabled);
        assert.ok(Object.values(verification).every(Boolean), 'Social replay differs.');
    }
    const events = enabled.events.filter(event => types.has(event.type));
    const opportunities = annual.flatMap(year => year.opportunities);
    const byPerson = {}, byPair = {}, helpers = {};
    for (const event of events) {
        if (event.type === 'ResidentQuarrelled') {
            for (const id of event.details.participants) byPerson[id] = (byPerson[id] ?? 0) + 1;
            const pair = [...event.details.participants].sort().join('|'); byPair[pair] = (byPair[pair] ?? 0) + 1;
        }
        if (event.type === 'MediationAttempted') helpers[event.details.mediatorId] = (helpers[event.details.mediatorId] ?? 0) + 1;
    }
    return {seed, winters, fixture, fullWorld, baselineParity: true, verification,
        configuration: {mechanics: initial.enabled.mechanics.config, landing: initial.enabled.landing?.config,
            weather: initial.enabled.weather?.config, social: initial.enabled.social.config},
        initial: initial.enabled, final: enabled, initialHash: hash(initial.enabled), finalHash: hash(enabled),
        counts: {
            quarrelOpportunities: opportunities.filter(item => item.kind === 'quarrel').length,
            mediationOpportunities: opportunities.filter(item => item.kind === 'mediation-initiative').length,
            reconciliationOpportunities: opportunities.filter(item => item.kind === 'reconciliation').length,
            quarrels: events.filter(event => event.type === 'ResidentQuarrelled').length,
            mediationAttempts: events.filter(event => event.type === 'MediationAttempted').length,
            mediationSuccesses: events.filter(event => event.type === 'MediationAttempted' && event.details.success).length,
            reconciliations: events.filter(event => event.type === 'ResidentsReconciled').length,
            independentReconciliations: events.filter(event => event.type === 'ResidentsReconciled' && event.details.method === 'independent').length,
            expired: events.filter(event => event.details.reason === 'expired-unresolved').length,
            inactive: events.filter(event => event.details.reason === 'inactive').length,
            unresolvedAtEnd: enabled.social.incidents.length,
            repeatedPairs: Object.values(byPair).filter(count => count > 1).length,
            uneventful: events.length === 0},
        byPerson, byPair, helpers, annual, events, timing: {enabledMs, disabledMs}};
}
