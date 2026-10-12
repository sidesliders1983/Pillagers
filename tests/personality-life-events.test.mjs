import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const quiet = {fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
    childcareWinters: 0, mortalityBands: [{minAge: 0, chanceBps: 0}]};

test('social pilot is explicit, saved and absent from ordinary and legacy campaigns', () => {
    const ordinary = core.createSettlement(41, quiet);
    assert.equal(Object.hasOwn(ordinary, 'social'), false);
    const enabled = core.createSettlement(41, quiet, {enabled: true});
    assert.equal(enabled.social.version, 1);
    assert.equal(enabled.social.config.quarrelMaxBps, 3000);
    assert.deepEqual(core.reconstructState(core.serializeState(enabled)), enabled);
    assert.equal(Object.hasOwn(core.reconstructState(core.serializeState(ordinary)), 'social'), false);
    assert.equal(enabled.rngState, ordinary.rngState);
});

function fixture(overrides = {}, seed = 41) {
    const state = core.createSettlement(seed, quiet, {enabled: true, quarrelMinBps: 10000,
        quarrelMaxBps: 10000, ...overrides});
    state.stocks.food = 0;
    state.stocks.materials = 100;
    return core.reconstructState(JSON.stringify(state));
}
test('a real annual resident shortage opens one source-linked quarrel; stocked years do not', () => {
    const input = fixture();
    const before = core.applyCommand(input, {type: 'AdvanceTicks', ticks: 999});
    assert.equal(before.events.some(e => e.type === 'ResidentQuarrelled'), false);
    const ended = core.advanceWinter(input);
    const quarrels = ended.events.filter(e => e.type === 'ResidentQuarrelled');
    assert.equal(quarrels.length, 1);
    const event = quarrels[0];
    const context = ended.events.find(e => e.id === event.details.contextEventId);
    assert.equal(context.type, 'FoodConsumed');
    assert.equal(context.details.shortfall, 5);
    assert.deepEqual(event.details.participants.sort(), ['einar', 'liv']);
    assert.deepEqual(event.details.people.map(p => p.name).sort(), ['Einar', 'Liv']);
    assert.equal(ended.events.some(e => e.type === 'ResidentsReconciled'), false);
    const stocked = fixture(); stocked.stocks.food = 100;
    assert.equal(core.advanceWinter(stocked).events.some(e => e.type === 'ResidentQuarrelled'), false);
    assert.equal(core.advanceWinter(stocked).social.rngState, stocked.social.rngState);
});

test('independent reconciliation closes the original incident next year and remembers the pair', () => {
    let state = core.advanceWinter(fixture({mediationMinBps: 0, mediationMaxBps: 0,
        reconciliationMinBps: 10000, reconciliationMaxBps: 10000}));
    const opened = state.events.find(e => e.type === 'ResidentQuarrelled');
    state = core.advanceWinter(state);
    const resolved = state.events.filter(e => e.type === 'ResidentsReconciled');
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].details.incidentId, opened.details.incidentId);
    assert.equal(resolved[0].details.openingEventId, opened.id);
    assert.equal(resolved[0].details.method, 'independent');
    assert.equal(state.social.incidents.length, 0);
    assert.equal(state.social.recentReconciliations[0].untilWinter, 805);
    assert.equal(state.events.filter(e => e.type === 'ResidentQuarrelled').length, 1);
});

function withHelper(overrides = {}, seed = 41) {
    const state = fixture(overrides, seed);
    state.personas.astrid.birthWinter = 780;
    state.personas.astrid.dna.age = 20;
    state.mechanics.people.liv.lastBirthWinter = 780;
    state.mechanics.people.liv.childcareUntilWinter = 780;
    return core.reconstructState(JSON.stringify(state));
}
test('a tied adult helper attempts mediation; success resolves once and failure preserves cooldown', () => {
    for (const success of [false, true]) {
        let state = core.advanceWinter(withHelper({mediationMinBps: 10000, mediationMaxBps: 10000,
            mediationSuccessBps: success ? 10000 : 0,
            reconciliationMinBps: 0, reconciliationMaxBps: 0}));
        state = core.advanceWinter(state);
        const attempts = state.events.filter(e => e.type === 'MediationAttempted');
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].details.success, success);
        assert.equal(attempts[0].details.participants.length, 3);
        assert.equal(new Set(attempts[0].details.participants).size, 3);
        assert.equal(attempts[0].details.people.length, 3);
        const resolutions = state.events.filter(e => e.type === 'ResidentsReconciled');
        assert.equal(resolutions.length, success ? 1 : 0);
        if (success) {
            assert.equal(resolutions[0].details.method, 'mediated');
            assert.equal(resolutions[0].details.priorEventId, attempts[0].id);
        } else {
            assert.equal(state.social.incidents[0].nextMediationWinter, 804);
            state = core.reconstructState(core.serializeState(state));
            state = core.advanceWinter(state);
            assert.equal(state.events.filter(e => e.type === 'MediationAttempted').length, 1);
            state = core.advanceWinter(state);
            assert.equal(state.events.filter(e => e.type === 'MediationAttempted').length, 2);
        }
    }
});

test('expiry and death terminate working incidents without recording reconciliation', () => {
    const noResolution = {mediationMinBps: 0, mediationMaxBps: 0,
        reconciliationMinBps: 0, reconciliationMaxBps: 0};
    let expired = core.advanceWinter(fixture(noResolution));
    // Stocked subsequent years allow resolution attempts but no new quarrels.
    expired.stocks.food = 100;
    expired = core.applyCommand(expired, {type: 'AdvanceTicks', ticks: 5000});
    const terminal = expired.events.filter(e => e.type === 'SocialIncidentEnded');
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].details.reason, 'expired-unresolved');
    assert.equal(terminal[0].time.winter, 806);
    assert.equal(expired.social.incidents.length, 0);
    assert.equal(expired.events.some(e => e.type === 'ResidentsReconciled'), false);
    let dead = fixture(noResolution);
    dead.mechanics.config.mortalityBands = [{minAge: 0, chanceBps: 0}, {minAge: 34, chanceBps: 10000}];
    dead = core.advanceWinter(dead);
    assert.equal(dead.social.incidents.length, 1);
    dead = core.advanceWinter(dead);
    assert.equal(dead.social.incidents.length, 0);
    assert.equal(dead.events.find(e => e.type === 'SocialIncidentEnded').details.reason, 'inactive');
    assert.equal(dead.events.some(e => e.type === 'ResidentsReconciled'), false);
});

test('malformed social config, scheduler, incident references and cooldown saves are rejected', () => {
    const opened = core.advanceWinter(fixture());
    for (const corrupt of [
        state => state.social.config.quarrelMaxBps = 10001,
        state => state.social.config.quarrelMinBps = -1,
        state => state.social.config.expiryYears = 0,
        state => state.social.rngState = -1,
        state => state.social.lastEvaluatedWinter--,
        state => state.social.incidents[0].openingEventId = 'event-1',
        state => state.social.incidents[0].participants = ['einar', 'einar'],
        state => state.social.incidents[0].nextMediationWinter = 900,
        state => state.social.incidents = [],
        state => state.events.find(e => e.type === 'ResidentQuarrelled').details.contextEventId = 'event-1'
    ]) {
        const bad = structuredClone(opened); corrupt(bad);
        assert.throws(() => core.reconstructState(JSON.stringify(bad)), /social/i);
    }
});

test('fixed context distinguishes fiery intervention from calm reconciliation without moral scoring', () => {
    const config = {...core.defaultSocialConfig, enabled: true};
    assert.deepEqual(core.socialProbabilities(config, 0, 0), {
        quarrelBps: 500, mediationInitiativeBps: 1000, mediationSuccessBps: 5000, reconciliationBps: 2000});
    assert.deepEqual(core.socialProbabilities(config, 1, 1), {
        quarrelBps: 3000, mediationInitiativeBps: 3000, mediationSuccessBps: 5000, reconciliationBps: 1000});
    assert.equal(core.socialProbabilities(config, 1, 1, true).quarrelBps, 1500);
    assert.throws(() => core.socialProbabilities(config, 2), /Temperament/);
});
function nonSocial(state) {
    const copy = structuredClone(state); delete copy.social;
    copy.events = copy.events.filter(e => !['ResidentQuarrelled', 'MediationAttempted',
        'ResidentsReconciled', 'SocialIncidentEnded'].includes(e.type));
    const names = new Map(copy.events.map((e, i) => [e.id, 'event-' + (i + 1)]));
    function normalize(value) {
        if (typeof value === 'string') return names.get(value) ?? value;
        if (Array.isArray(value)) return value.map(normalize);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
        return value;
    }
    return normalize(copy);
}
test('isolated RNG preserves every non-social outcome and replays across batch/split/save/rollback', () => {
    const enabled = withHelper({mediationMinBps: 10000, mediationMaxBps: 10000, mediationSuccessBps: 5000});
    const disabled = structuredClone(enabled); delete disabled.social;
    const whole = core.applyCommand(enabled, {type: 'AdvanceTicks', ticks: 9000});
    assert.deepEqual(nonSocial(whole), core.applyCommand(disabled, {type: 'AdvanceTicks', ticks: 9000}));
    let split = core.applyCommand(enabled, {type: 'AdvanceTicks', ticks: 1999});
    const saved = core.serializeState(split);
    split = core.applyCommand(core.reconstructState(saved), {type: 'AdvanceTicks', ticks: 7001});
    assert.deepEqual(split, whole);
    assert.deepEqual(core.applyCommand(whole, {type: 'AdvanceTicks', ticks: 0}), whole);
    assert.deepEqual(core.applyCommand(core.reconstructState(saved), {type: 'AdvanceTicks', ticks: 7001}), whole);
    const beforeRead = core.serializeState(split);
    core.socialProbabilities(split.social.config, .5); core.socialProbabilities(split.social.config, .5);
    assert.equal(core.serializeState(split), beforeRead);
});
test('underage or currently caring residents cannot be disputants or mediators', () => {
    const caring = core.createSettlement(41, {...quiet, childcareWinters: 5},
        {enabled: true, quarrelMinBps: 10000, quarrelMaxBps: 10000});
    caring.stocks.food = 0;
    assert.equal(core.advanceWinter(caring).events.some(e => e.type === 'ResidentQuarrelled'), false);
    const youngHelper = core.advanceWinter(fixture({mediationMinBps: 10000, mediationMaxBps: 10000,
        reconciliationMinBps: 0, reconciliationMaxBps: 0}));
    assert.equal(core.advanceWinter(youngHelper).events.some(e => e.type === 'MediationAttempted'), false);
    const zero = core.advanceWinter(fixture({quarrelMinBps: 0, quarrelMaxBps: 0}));
    assert.equal(zero.events.some(e => e.type === 'ResidentQuarrelled'), false);
});

test('Chronicle and saved Clan Book describe real help and reconciliation with source continuity', () => {
    const {projectChronicle} = loadTypeScript(new URL('../src/lore/Chronicle.ts', import.meta.url));
    const {ClanBook} = loadTypeScript(new URL('../src/lore/ClanBook.ts', import.meta.url));
    const input = withHelper({mediationMinBps: 10000, mediationMaxBps: 10000, mediationSuccessBps: 10000});
    const book = new ClanBook(input, false, 1);
    const ended = core.applyCommand(input, {type: 'AdvanceTicks', ticks: 5000});
    const social = ended.events.filter(e => ['ResidentQuarrelled', 'MediationAttempted', 'ResidentsReconciled'].includes(e.type));
    const entries = projectChronicle(ended.events).flatMap(group => group.entries);
    assert.ok(entries.some(entry => /quarrel/.test(entry.text)));
    assert.ok(entries.some(entry => /mediat/.test(entry.text)));
    assert.ok(entries.some(entry => /reconcil/.test(entry.text)));
    book.closeCheckpoint(ended);
    const chapter = book.snapshot().chapters.at(-1);
    assert.equal(chapter.plan.version, 3);
    assert.match(chapter.text, /quarrel/);
    assert.match(chapter.text, /mediat/);
    assert.match(chapter.text, /reconcil/);
    assert.ok(social.every(event => chapter.sourceEventIds.includes(event.id)));
    assert.doesNotMatch(chapter.text, /angry|kind-hearted|insult|hungry|805|incident-/);
    const saved = book.save(ended);
    const restored = new ClanBook(ended, false, 1); restored.restore(saved, ended);
    assert.deepEqual(restored.snapshot(), book.snapshot());
});

test('new/restarted lab campaigns save the opt-in setting; 2D/3D transfers and reading never reroll', () => {
    const {GameplaySession} = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const {SharedSettlement} = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
    const session = new GameplaySession(41, 1);
    session.newCampaign(41, false, true);
    assert.equal(session.snapshot().social.config.enabled, true);
    session.restartCampaign(true);
    assert.equal(session.snapshot().social.config.enabled, true);
    session.restartCampaign(true, () => 42, false, false);
    assert.equal(session.snapshot().social, undefined);
    const owner = new SharedSettlement(41, 1);
    owner.importJSON(core.serializeState(withHelper()));
    owner.command({type: 'AdvanceTicks', ticks: 5000});
    const saved = owner.session.saveJSON();
    owner.session.book.markRead(1); owner.session.book.notifyPending();
    assert.equal(owner.session.saveJSON(), saved);
    const restored = SharedSettlement.restore(owner.handoff('fjord'), 'fjord');
    assert.equal(restored.session.saveJSON(), saved);
    const expected = core.advanceWinter(core.reconstructState(saved));
    restored.command({type: 'AdvanceWinter'});
    assert.deepEqual(restored.session.snapshot(), expected);
});

test('real expeditions block annual participation; transfer makes a source-clan dispute inactive midyear', () => {
    let state = core.createCampaign(32, {initialFood: 400}, quiet, {enabled: false},
        {successBps: {Recon: 10000, Surveillance: 10000, Pillage: 10000},
            casualtyBps: {Recon: 0, Surveillance: 0, Pillage: 0}},
        {enabled: true, quarrelMinBps: 10000, quarrelMaxBps: 10000});
    const region = Object.values(state.world.regions).find(r => r.targetClanId && !r.requiresShip);
    let target = state.world.targetClans[region.targetClanId];
    // A labelled CPU fixture enables the pilot for this test; normal CPU targets remain disabled.
    target.social = structuredClone(core.createSettlement(target.seed, quiet, {enabled: true,
        quarrelMinBps: 10000, quarrelMaxBps: 10000,
        mediationMinBps: 0, mediationMaxBps: 0, reconciliationMinBps: 0, reconciliationMaxBps: 0}).social);
    const targetIds = Object.keys(target.personas).sort((a,b) => a.localeCompare(b));
    for (const id of targetIds) target = core.applyCommand(target, {type: 'AssignOccupation', personaId: id, occupation: null});
    for (const person of Object.values(target.personas)) person.partnerId = null;
    target.personas[targetIds[0]].partnerId = targetIds[1];
    target.personas[targetIds[1]].partnerId = targetIds[0];
    target.households = Object.fromEntries(targetIds.map((id, index) => ['test-home-' + index,
        {id: 'test-home-' + index, memberIds: [id], residenceId: null}]));
    state.world.targetClans[region.targetClanId] = target;
    target.stocks.food = 0;
    for (const person of Object.values(target.personas))
        target.mechanics.people[person.id].occupationLocked = true;
    state = core.advanceWinter(state);
    const disputed = state.world.targetClans[region.targetClanId];
    assert.ok(disputed.social.incidents.length);
    // Make the known transfer priority choose one of the actual disputants.
    const victimId = Object.keys(disputed.personas).sort((a, b) => a.localeCompare(b))[0];
    assert.ok(disputed.social.incidents[0].participants.includes(victimId));
    const ids = Object.keys(state.personas).slice(0, 1);
    state = core.applyCommand(state, {type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: ids});
    state = core.applyCommand(state, {type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Recon'});
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: 250});
    state = core.applyCommand(state, {type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Pillage', priorities: ['People']});
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: 500});
    const source = state.world.targetClans[region.targetClanId];
    const ended = source.events.find(e => e.type === 'SocialIncidentEnded');
    assert.equal(ended.details.reason, 'inactive');
    assert.equal(ended.time.tick, 750);
    assert.equal(ended.details.people.length, 2);
    assert.equal(source.social.incidents.length, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('temporary expedition absence blocks new quarrels at the real annual boundary', () => {
    let state = core.createCampaign(32, {initialFood: 400}, quiet, {enabled: false},
        {durations: {Recon: 2000, Surveillance: 400, Pillage: 500}},
        {enabled: true, quarrelMinBps: 10000, quarrelMaxBps: 10000});
    const ids = Object.keys(state.personas).slice(0, 2);
    for (const id of Object.keys(state.personas)) state = core.applyCommand(state, {type: 'AssignOccupation', personaId: id, occupation: null});
    for (const person of Object.values(state.personas)) person.partnerId = null;
    state.personas[ids[0]].partnerId = ids[1]; state.personas[ids[1]].partnerId = ids[0];
    state.households = Object.fromEntries(Object.keys(state.personas).map((id, i) => ['fixture-home-' + i,
        {id: 'fixture-home-' + i, memberIds: [id], residenceId: null}]));
    state = core.applyCommand(state, {type: 'CreateExpeditionGroup', name: 'Away', memberIds: [ids[0]]});
    state = core.applyCommand(state, {type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-east', mission: 'Recon'});
    state.stocks.food = 0;
    state = core.advanceWinter(state);
    assert.equal(core.personaAway(state, ids[0]), true);
    assert.ok(state.events.some(e => e.type === 'FoodConsumed' && e.details.shortfall > 0));
    assert.equal(state.events.some(e => e.type === 'ResidentQuarrelled'), false);
});

test('recent reconciliation changes the actual next pair opportunity and then expires', () => {
    let state = core.advanceWinter(fixture({mediationMinBps: 0, mediationMaxBps: 0,
        reconciliationMinBps: 10000, reconciliationMaxBps: 10000}));
    state = core.advanceWinter(state);
    const reduced = core.advanceWinter(state);
    assert.equal(reduced.social.lastWindow.opportunities.find(item => item.kind === 'quarrel').probabilityBps, 5000);
    state.stocks.food = 100;
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: 2000});
    state.stocks.food = 0;
    state = core.advanceWinter(state);
    assert.equal(state.social.recentReconciliations.length, 0);
    assert.equal(state.social.lastWindow.opportunities.find(item => item.kind === 'quarrel').probabilityBps, 10000);
});
test('duplicate display names remain distinct canonical participants; paused sessions cannot sample', () => {
    const {GameplaySession} = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const state = withHelper({mediationMinBps: 10000, mediationMaxBps: 10000, mediationSuccessBps: 10000});
    for (const person of Object.values(state.personas)) person.name = 'Same name';
    const session = new GameplaySession(41, 1); session.loadJSON(core.serializeState(state));
    const paused = session.saveJSON(); session.setRunning(false); session.elapse(600000);
    assert.equal(session.saveJSON(), paused);
    const ended = core.applyCommand(state, {type: 'AdvanceTicks', ticks: 2000});
    const attempt = ended.events.find(event => event.type === 'MediationAttempted');
    assert.equal(new Set(attempt.details.participants).size, 3);
    assert.equal(attempt.details.people.filter(person => person.name === 'Same name').length, 3);
    const random = Math.random, date = globalThis.Date;
    try {
        Math.random = () => {throw new Error('Unseeded random forbidden');};
        globalThis.Date = class {constructor(){throw new Error('Wall time forbidden');}static now(){throw new Error('Wall time forbidden');}};
        assert.deepEqual(core.applyCommand(state, {type: 'AdvanceTicks', ticks: 2000}), ended);
    } finally {Math.random = random; globalThis.Date = date;}
});

test('restored mediation cannot use an unknown canonical helper behind a plausible snapshot', () => {
    let state = core.advanceWinter(withHelper({mediationMinBps: 10000, mediationMaxBps: 10000,
        mediationSuccessBps: 10000}));
    state = core.advanceWinter(state);
    const attempt = state.events.find(event => event.type === 'MediationAttempted');
    const real = attempt.details.mediatorId;
    attempt.details.mediatorId = 'unknown-helper';
    attempt.details.participants[2] = 'unknown-helper';
    attempt.details.people.find(person => person.id === real).id = 'unknown-helper';
    assert.throws(() => core.reconstructState(JSON.stringify(state)), /social/);
});
