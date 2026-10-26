import test from 'node:test';
import assert from 'node:assert/strict';
import { core, coDisplacedCampaign, lossOffered } from './helpers/contextual-support.mjs';
const supportEvents = state => state.events.filter(event => event.type.startsWith('Support'));

test('a real occupied collapse offers co-displaced partners help, then completes after fifty canonical ticks', () => {
    const before = coDisplacedCampaign();
    assert.equal(supportEvents(before).length, 0);
    const offered = lossOffered();
    const source = offered.events.find(event => event.type === 'BuildingCollapsed');
    assert.equal(source.details.buildingId, 'house-1');
    assert.deepEqual(source.details.housingResidents.residentIds, ['founder-2', 'founder-8']);
    const offer = supportEvents(offered)[0];
    assert.equal(offer?.type, 'SupportOffered');
    assert.equal(offer.details.sourceEventId, source.id);
    assert.equal(offer.details.householdId, 'founder-2');
    assert.deepEqual(offer.details.participants, ['founder-2', 'founder-8']);
    assert.equal(offer.details.supportContribution, 0);
    assert.equal(core.inspectCulture(offered).supportCount, 0);
    const waiting = core.applyCommand(offered, { type: 'AdvanceTicks', ticks: 49 });
    assert.deepEqual(supportEvents(waiting), supportEvents(offered));
    const completed = core.applyCommand(waiting, { type: 'AdvanceTicks', ticks: 1 });
    assert.deepEqual(supportEvents(completed).map(event => event.type),
        ['SupportOffered', 'SupportAccepted', 'SupportCompleted']);
    const receipt = supportEvents(completed).at(-1);
    assert.equal(receipt.details.offeredEventId, offer.id);
    assert.equal(receipt.details.supportContribution, 1);
    assert.equal(receipt.details.supportBefore, 0);
    assert.equal(receipt.details.supportAfter, 1);
    assert.deepEqual(core.inspectCulture(completed).sourceEventIds, [receipt.id]);
    assert.deepEqual(core.reconstructState(core.serializeState(completed)), completed);
});

test('load rejects invented aid contribution, missing chains, reused sources and changed source facts', () => {
    const offered = lossOffered();
    const completed = core.applyCommand(offered, { type: 'AdvanceTicks', ticks: 50 });
    for (const corrupt of [
        state => state.contextualSupport.lastReviewedWinter = 802,
        state => state.contextualSupport.lastSourceEventId = 'event-1',
        state => state.contextualSupport.nextOffer++,
        state => state.contextualSupport.pending = [offered.contextualSupport.pending[0]],
        state => delete state.contextualSupport,
        state => state.events.find(e => e.type === 'SupportCompleted').details.supportContribution = 2,
        state => state.events.find(e => e.type === 'SupportCompleted').details.acceptedEventId = 'event-1',
        state => state.events.find(e => e.type === 'SupportAccepted').type = 'SupportDeclined',
        state => state.events.find(e => e.type === 'SupportOffered').details.sourceEventId = 'event-1',
        state => state.events.find(e => e.type === 'SupportOffered').details.people[0].age++,
        state => state.events.find(e => e.type === 'SupportOffered').details.people[0].id = 'unknown',
        state => state.events.find(e => e.type === 'SupportOffered').details.housingResidents.residentIds = [],
        state => state.contextualSupport.config.resolutionTicks = 1,
        state => state.culture.supportSourceEventIds = ['event-1'],
    ]) {
        const bad = structuredClone(completed);
        corrupt(bad);
        assert.throws(() => core.reconstructState(JSON.stringify(bad)), /support|cultural/i);
    }
    for (const corrupt of [
        state => state.contextualSupport.pending = [],
        state => state.contextualSupport.pending[0].resolutionAt++,
        state => state.contextualSupport.pending[0].helperId = 'unknown',
    ]) {
        const bad = structuredClone(offered); corrupt(bad);
        assert.throws(() => core.reconstructState(JSON.stringify(bad)), /support/i);
    }
});

test('plausible aid cannot rewrite the real collapse residents behind a matching completion chain', () => {
    const completed = core.applyCommand(lossOffered(), { type: 'AdvanceTicks', ticks: 50 });
    const bad = JSON.parse(core.serializeState(completed));
    const source = bad.events.find(event => event.type === 'BuildingCollapsed');
    source.details.housingResidents.residentIds.push('founder-1');
    source.details.housingResidents.people.push({ id: 'founder-1', name: 'MaelSechnaill', age: 39 });
    for (const event of supportEvents(bad))
        event.details.housingResidents = structuredClone(source.details.housingResidents);
    assert.throws(() => core.reconstructState(JSON.stringify(bad)), /support/i);
});

function advance(state, ticks) { return core.applyCommand(state, { type: 'AdvanceTicks', ticks }); }
function sponsor(state) {
    const offer = core.gatheringOffer(state);
    return core.applyCommand(state, { type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds });
}
function dispatch(state, memberIds) {
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts', memberIds });
    return core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1',
        regionId: 'region-east', mission: 'Recon' });
}

test('ordinary, culture-only and old opt-in saves remain without aid; fresh combined campaigns save approved defaults', () => {
    for (const [social, culture] of [[{}, {}], [{}, { enabled: true }], [{ enabled: true }, {}]]) {
        const state = core.createCampaign(17, {}, {}, {}, {}, social, {}, undefined, undefined, undefined, culture);
        assert.equal(state.contextualSupport, undefined);
        assert.equal(core.reconstructState(core.serializeState(state)).contextualSupport, undefined);
    }
    const fresh = core.createCampaign(17, {}, {}, {}, {}, { enabled: true }, {},
        undefined, undefined, undefined, { enabled: true });
    assert.deepEqual(fresh.contextualSupport.config, { enabled: true, offerBps: 1000,
        acceptanceBps: 5000, resolutionTicks: 50, candidateBudget: 128 });
    const legacy = coDisplacedCampaign(); delete legacy.contextualSupport;
    const restored = core.reconstructState(core.serializeState(legacy));
    const ended = advance(restored, 100);
    assert.equal(ended.contextualSupport, undefined);
    assert.equal(ended.events.filter(e => e.type === 'BuildingCollapsed').length, 1);
    assert.equal(supportEvents(ended).length, 0);
});

test('zero offer and zero acceptance boundaries grant nothing and never reconsider the old loss', () => {
    const zero = lossOffered({ support: { offerBps: 0 } });
    assert.equal(supportEvents(zero).length, 0);
    assert.equal(zero.contextualSupport.lastSourceEventId,
        zero.events.find(e => e.type === 'BuildingCollapsed').id);
    const declined = advance(lossOffered({ support: { acceptanceBps: 0 } }), 50);
    assert.deepEqual(supportEvents(declined).map(e => e.type), ['SupportOffered', 'SupportDeclined']);
    assert.equal(core.inspectCulture(declined).supportCount, 0);
    assert.equal(declined.contextualSupport.pending.length, 0);
    const resumed = advance(core.reconstructState(core.serializeState(declined)), 949);
    assert.deepEqual(supportEvents(resumed), supportEvents(declined));
});

test('real loss with no available tied helper or an absent participant offers no false aid', () => {
    const untied = lossOffered({ reverseHomes: true });
    assert.equal(untied.events.find(e => e.type === 'BuildingCollapsed').details.housingResidents.residentIds[0], 'founder-1');
    assert.equal(supportEvents(untied).length, 0);
    const away = advance(dispatch(coDisplacedCampaign(), ['founder-2', 'founder-8']), 1);
    assert.equal(away.events.filter(e => e.type === 'BuildingCollapsed').length, 1);
    assert.equal(supportEvents(away).length, 0);
    const caring = lossOffered({ mechanics: { fertilityChanceBps: 10000 } });
    assert.ok(caring.events.some(e => e.type === 'ChildBorn'));
    assert.ok(['founder-2', 'founder-8'].some(id => core.isProvidingCare(caring, id)));
    assert.equal(supportEvents(caring).length, 0);
});

test('only the first actual housing loss in a clan year is reviewed, even if it has no eligible helper', () => {
    const both = lossOffered({ mechanics: { salvageBps: 0 } });
    assert.equal(both.events.filter(e => e.type === 'BuildingCollapsed').length, 2);
    assert.equal(supportEvents(both).filter(e => e.type === 'SupportOffered').length, 1);
    const firstUnavailable = lossOffered({ reverseHomes: true, mechanics: { salvageBps: 0 } });
    assert.equal(firstUnavailable.events.filter(e => e.type === 'BuildingCollapsed').length, 2);
    assert.equal(supportEvents(firstUnavailable).length, 0);
    assert.equal(firstUnavailable.contextualSupport.lastSourceEventId,
        firstUnavailable.events.find(e => e.type === 'BuildingCollapsed').id);
});

test('a real departure or expedition death before resolution ends the offer without accepted aid', () => {
    const offered = lossOffered();
    const helperId = supportEvents(offered)[0].details.helperId;
    const away = advance(dispatch(offered, [helperId]), 50);
    assert.deepEqual(supportEvents(away).map(e => e.type), ['SupportOffered', 'SupportEnded']);
    assert.equal(supportEvents(away).at(-1).details.reason, 'unavailable');
    assert.equal(core.inspectCulture(away).supportCount, 0);
    const lethal = lossOffered({ expeditions: { durations: { Recon: 10, Surveillance: 400, Pillage: 500 },
        casualtyBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 } } });
    const victim = supportEvents(lethal)[0].details.helperId;
    const died = advance(dispatch(lethal, [victim]), 50);
    assert.notEqual(died.personas[victim].deathWinter, null);
    assert.deepEqual(supportEvents(died).map(e => e.type), ['SupportOffered', 'SupportEnded']);
    assert.equal(core.inspectCulture(died).supportCount, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(died)), died);
});

test('accepted aid shares the paid gathering FIFO and capacity without changing paid receipts or sequence', () => {
    const offered = lossOffered();
    const paid = sponsor(offered);
    const paidId = paid.culture.supportSourceEventIds[0];
    const paidReceipt = paid.events.find(e => e.id === paidId);
    const completed = advance(paid, 50);
    const completedId = supportEvents(completed).at(-1).id;
    assert.deepEqual(completed.culture.supportSourceEventIds, [paidId, completedId]);
    assert.equal(completed.culture.nextSequence, 2);
    assert.equal(completed.culture.lastGatheringEventId, paidId);
    assert.deepEqual(completed.events.find(e => e.id === paidId), paidReceipt);
    const consumed = advance(core.reconstructState(core.serializeState(completed)), 950);
    const application = consumed.events.find(e => e.type === 'CultureWeatherSupportApplied');
    assert.deepEqual(application.details.sourceEventIds, [paidId]);
    assert.deepEqual(consumed.culture.supportSourceEventIds, [completedId]);
    assert.equal(supportEvents(consumed).filter(e => e.type === 'SupportCompleted' && e.details.sourceEventId ===
        supportEvents(offered)[0].details.sourceEventId).length, 1);
    const full = sponsor(paid);
    const capped = advance(core.reconstructState(core.serializeState(full)), 50);
    const receipt = supportEvents(capped).at(-1);
    assert.equal(receipt.type, 'SupportCompleted');
    assert.equal(receipt.details.supportContribution, 0);
    assert.equal(receipt.details.supportBefore, 2);
    assert.equal(receipt.details.supportAfter, 2);
    assert.deepEqual(capped.culture, full.culture);
    const afterUse = advance(capped, 950);
    assert.equal(core.inspectCulture(afterUse).supportCount, 1);
    assert.equal(supportEvents(afterUse).filter(e => e.type === 'SupportCompleted').length, 1);
});

function withoutSupport(input) {
    const state = structuredClone(input); delete state.contextualSupport;
    state.events = state.events.filter(event => !event.type.startsWith('Support'));
    const ids = new Map(state.events.map((event, index) => [event.id, 'event-' + (index + 1)]));
    const normalize = value => typeof value === 'string' ? ids.get(value) ?? value :
        Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ?
            Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)])) : value;
    // The only immediate resource from completed aid is its existing weather assessment.
    state.culture.supportSourceEventIds = [];
    return normalize(state);
}

test('aid leaves all economy, housing, work, mechanics/weather/quarrel RNG and CPU outcomes unchanged', () => {
    const enabled = advance(lossOffered(), 50);
    const disabled = advance(lossOffered({ support: { enabled: false } }), 50);
    assert.deepEqual(withoutSupport(enabled), disabled);
    assert.deepEqual(enabled.stocks, disabled.stocks);
    assert.deepEqual(enabled.world.targetClans, disabled.world.targetClans);
});

test('canonical replay survives split ticks, pending save/load, rollback and unrelated CPU iteration order', () => {
    const input = coDisplacedCampaign();
    const whole = advance(input, 2051);
    const waiting = advance(input, 26);
    const saved = core.serializeState(waiting);
    const split = advance(core.reconstructState(saved), 2025);
    assert.deepEqual(split, whole);
    assert.deepEqual(advance(core.reconstructState(saved), 2025), whole);
    assert.deepEqual(advance(whole, 0), whole);
    const reverse = structuredClone(input);
    reverse.world.targetClans = Object.fromEntries(Object.entries(reverse.world.targetClans).reverse());
    const reordered = advance(reverse, 2051);
    assert.deepEqual(reordered.contextualSupport, whole.contextualSupport);
    assert.deepEqual(supportEvents(reordered), supportEvents(whole));
    const random = Math.random, date = globalThis.Date;
    try {
        Math.random = () => { throw new Error('Unseeded random forbidden'); };
        globalThis.Date = class { constructor() { throw new Error('Wall time forbidden'); }
            static now() { throw new Error('Wall time forbidden'); } };
        assert.deepEqual(advance(input, 2051), whole);
    } finally { Math.random = random; globalThis.Date = date; }
});

test('joining a real existing child group as caregiver during the offer prevents acceptance', () => {
    let state = lossOffered({ seed: 1 });
    const offer = supportEvents(state)[0];
    assert.equal(offer.details.helperId, 'founder-2');
    assert.ok(state.events.some(e => e.type === 'ChildBorn' && e.details.participants.includes('founder-3')));
    assert.equal(core.isProvidingCare(state, 'founder-2'), false);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-2', occupation: null });
    state = core.applyCommand(state, { type: 'AssignCaregiver', motherId: 'founder-3', caregiverId: 'founder-2' });
    assert.equal(core.isProvidingCare(state, 'founder-2'), true);
    const ended = advance(core.reconstructState(core.serializeState(state)), 50);
    assert.deepEqual(supportEvents(ended).map(e => e.type), ['SupportOffered', 'SupportEnded']);
    assert.equal(supportEvents(ended).at(-1).details.reason, 'unavailable');
    assert.equal(core.inspectCulture(ended).supportCount, 0);
});

test('completed contextual aid funds exactly the existing next Severe assessment and cannot reopen after use', () => {
    const completed = advance(lossOffered(), 50);
    const receipt = supportEvents(completed).at(-1);
    const assessed = advance(core.reconstructState(core.serializeState(completed)), 950);
    const application = assessed.events.find(e => e.type === 'CultureWeatherSupportApplied');
    assert.deepEqual(application.details.sourceEventIds, [receipt.id]);
    assert.equal(application.details.weatherClass, 'Severe');
    assert.ok(application.details.riskInputs.every(risk => risk.baselineWeatherExposureBps === 200 &&
        risk.weatherExposureBps === 150 && risk.mortalityRiskBps >= risk.naturalRiskBps));
    assert.equal(core.inspectCulture(assessed).supportCount, 0);
    const resumed = advance(core.reconstructState(core.serializeState(assessed)), 999);
    assert.equal(supportEvents(resumed).filter(e => e.details.sourceEventId === receipt.details.sourceEventId &&
        e.type === 'SupportCompleted').length, 1);
    assert.deepEqual(core.reconstructState(core.serializeState(resumed)), resumed);
});

test('explicit malformed empty support state is rejected while genuinely missing legacy state is preserved', () => {
    const fresh = core.createCampaign(17, {}, {}, {}, {}, { enabled: true }, {},
        undefined, undefined, undefined, { enabled: true });
    for (const value of [null, false, 0, [], {}]) {
        const bad = structuredClone(fresh); bad.contextualSupport = value;
        assert.throws(() => core.reconstructState(JSON.stringify(bad)), /support/i);
    }
});

test('an actual source-clan captive transfer during pending aid ends that original offer without a grant', () => {
    const quiet = { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
        childcareWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] };
    const landing = { initialFood: 400, foundingCoupleChanceBps: 10000, foundingCoupleCap: 3 };
    const expeditions = { durations: { Recon: 10, Surveillance: 10, Pillage: 20 },
        successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
        casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } };
    let state = core.createCampaign(32, landing, quiet, { enabled: false }, expeditions,
        { enabled: true }, {}, undefined, undefined, undefined, { enabled: true },
        { offerBps: 10000, acceptanceBps: 10000 });
    const region = Object.values(state.world.regions).find(region => {
        if (region.requiresShip || !region.targetClanId) return false;
        const target = state.world.targetClans[region.targetClanId];
        const firstId = Object.keys(target.personas).sort((a, b) => a.localeCompare(b))[0];
        return !!target.personas[firstId].partnerId;
    });
    assert.ok(region);
    let target = state.world.targetClans[region.targetClanId];
    // Explicit, labelled fresh CPU save fixture: normal graph targets intentionally lack Social.
    // All domestic people, partnerships, construction, losses and transfers still use real Core commands.
    const policy = core.createCampaign(target.seed, landing, quiet, { enabled: false }, {},
        { enabled: true }, {}, undefined, undefined, undefined, { enabled: true },
        { offerBps: 10000, acceptanceBps: 10000 });
    target.social = structuredClone(policy.social);
    target.contextualSupport = structuredClone(policy.contextualSupport);
    const captiveId = Object.keys(target.personas).sort((a, b) => a.localeCompare(b))[0];
    const homeId = Object.values(target.households).find(home => home.memberIds.includes(captiveId)).id;
    const longshipId = Object.keys(target.landing.longships)[0];
    for (const command of [
        { type: 'SalvageLongship', longshipId }, { type: 'BuildHouse', householdId: homeId },
        { type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' },
        { type: 'UpgradeBuilding', buildingId: 'house-1' },
        { type: 'UpgradeBuilding', buildingId: 'house-1' },
        ...Object.keys(target.personas).sort().map(personaId =>
            ({ type: 'AssignOccupation', personaId, occupation: 'farmer' })),
    ]) target = core.applyCommand(target, command);
    assert.equal(target.stocks.materials, 0);
    state.world.targetClans[region.targetClanId] = target;
    state = core.reconstructState(core.serializeState(state));
    state = advance(state, 3000);
    const offered = state.world.targetClans[region.targetClanId];
    assert.equal(supportEvents(offered)[0].type, 'SupportOffered');
    assert.ok(supportEvents(offered)[0].details.participants.includes(captiveId));
    const crew = Object.keys(state.personas).sort().slice(0, 1);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Raiders', memberIds: crew });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1',
        regionId: region.id, mission: 'Recon' });
    state = advance(state, 10);
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1',
        regionId: region.id, mission: 'Pillage', priorities: ['People'] });
    state = advance(state, 40);
    const ended = state.world.targetClans[region.targetClanId];
    assert.ok(ended.events.some(e => e.type === 'PersonaTransferredOut' && e.details.personaId === captiveId));
    assert.equal(ended.personas[captiveId], undefined);
    assert.ok(state.personas[captiveId]);
    assert.deepEqual(supportEvents(ended).map(e => e.type), ['SupportOffered', 'SupportEnded']);
    assert.equal(supportEvents(ended).at(-1).details.reason, 'unavailable');
    assert.equal(core.inspectCulture(ended).supportCount, 0);
    assert.equal(core.inspectCulture(state).supportCount, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});


test('matching source chains cannot invent aid from a different real unrelated adult', () => {
    const bad = JSON.parse(core.serializeState(advance(lossOffered(), 50)));
    const unrelated = bad.personas['founder-1'];
    for (const event of supportEvents(bad)) {
        event.details.helperId = unrelated.id;
        event.details.participants = [event.details.recipientId, unrelated.id].sort();
        event.details.people = event.details.participants.map(id => ({ id, name: bad.personas[id].name,
            age: core.personaAge(bad, id, event.time) }));
    }
    assert.throws(() => core.reconstructState(JSON.stringify(bad)), /support/i);
});
