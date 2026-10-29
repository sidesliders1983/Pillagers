import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const quiet = { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }] };
function campaign(options = {}) {
    return core.createCampaign(32, { foundingCoupleChanceBps: 0, ...options.landing }, quiet,
        options.weather ?? {}, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
}
function sponsor(state) {
    const offer = core.gatheringOffer(state);
    return { type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds };
}

test('an explicitly enabled gathering spends the quoted Food once and records real available residents', () => {
    const input = campaign();
    const offer = core.gatheringOffer(input);
    assert.equal(offer.allowed, true);
    assert.equal(offer.foodCost, 3);
    assert.deepEqual(offer.participantIds, ['founder-1', 'founder-10', 'founder-2', 'founder-3',
        'founder-4', 'founder-5', 'founder-6', 'founder-7']);
    const output = core.applyCommand(input, sponsor(input));
    assert.equal(output.stocks.food, 12);
    assert.equal(input.stocks.food, 15);
    const gatherings = output.events.filter(event => event.type === 'CulturalGatheringHeld');
    assert.equal(gatherings.length, 1);
    assert.deepEqual(gatherings[0].details.participants, offer.participantIds);
    assert.deepEqual(gatherings[0].details.people, offer.participants);
    assert.equal(gatherings[0].details.foodCost, 3);
    assert.equal(core.inspectCulture(output).supportCount, 1);
    assert.equal(output.rngState, input.rngState);
});

test('accepted request retries survive reload and later changes without charging or substituting a different request', () => {
    let state = campaign();
    const first = sponsor(state);
    state = core.applyCommand(state, first);
    state = core.applyCommand(state, sponsor(state));
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 });
    state = core.reconstructState(core.serializeState(state));
    assert.deepEqual(core.applyCommand(state, first), state);
    assert.equal(state.events.filter(event => event.type === 'CulturalGatheringHeld').length, 2);
    assert.throws(() => core.applyCommand(state, { ...first, quotedFood: 2 }), /request|quote/i);
});

test('save validation rejects invented cultural support, receipts and altered prototype rules', () => {
    const accepted = core.applyCommand(campaign(), sponsor(campaign()));
    for (const alter of [
        state => state.culture.supportSourceEventIds[0] = 'event-999999',
        state => state.culture.nextSequence++,
        state => state.culture.lastGatheringEventId = 'event-1',
        state => state.culture.config.foodCost = 0,
        state => state.culture.config.minParticipants = 9,
        state => state.culture.config.exposureReductionBps = 10000,
        state => state.events.find(event => event.type === 'CulturalGatheringHeld').details.participants.pop(),
        state => delete state.culture,
    ]) {
        const changed = structuredClone(accepted);
        alter(changed);
        assert.throws(() => core.reconstructState(JSON.stringify(changed)), /cultur|gathering/i);
    }
});

function forcedWeather(kind) {
    const config = structuredClone(core.defaultWeatherConfig);
    for (const weather of core.weatherClasses) config.profiles[weather].probabilityBps = weather === kind ? 10000 : 0;
    return config;
}

test('one prepared assessment reduces only actual Severe exposure and is spent once for the whole settlement', () => {
    let state = campaign({ weather: forcedWeather('Severe') });
    state = core.applyCommand(state, sponsor(state));
    const source = state.events.find(event => event.type === 'CulturalGatheringHeld').id;
    state = core.advanceWinter(state);
    const applied = state.events.filter(event => event.type === 'CultureWeatherSupportApplied');
    assert.equal(applied.length, 1);
    assert.equal(applied[0].details.weatherClass, 'Severe');
    assert.equal(applied[0].details.weatherWinter, 800);
    assert.deepEqual(applied[0].details.sourceEventIds, [source]);
    assert.equal(applied[0].details.riskInputs.length, 10);
    assert.ok(applied[0].details.riskInputs.every(risk => risk.naturalRiskBps === 0 &&
        risk.baselineWeatherExposureBps === 200 && risk.weatherExposureBps === 150 &&
        risk.baselineRiskBps === 200 && risk.mortalityRiskBps === 150));
    assert.equal(core.inspectCulture(state).supportCount, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('new CPU clans have independent enabled culture but receive no free gatherings or support', () => {
    const state = campaign();
    const targets = Object.values(state.world.targetClans);
    assert.ok(targets.length > 0);
    assert.ok(targets.every(target => core.inspectCulture(target).enabled));
    assert.ok(targets.every(target => core.inspectCulture(target).supportCount === 0));
    const player = core.applyCommand(state, sponsor(state));
    assert.ok(Object.values(player.world.targetClans).every(target => core.inspectCulture(target).supportCount === 0));
    const target = targets[0];
    const earned = core.applyCommand(target, sponsor(target));
    assert.equal(core.inspectCulture(earned).supportCount, 1);
    assert.equal(core.inspectCulture(state).supportCount, 0);
    assert.equal(earned.stocks.food, target.stocks.food - 3);
});

test('legacy and zero-earned culture preserve baseline Core outcomes and random continuation', () => {
    const ordinary = core.createCampaign(19, {}, quiet);
    const enabled = core.createCampaign(19, {}, quiet, {}, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
    const strip = state => {
        const result = structuredClone(state);
        delete result.culture;
        for (const target of Object.values(result.world.targetClans)) delete target.culture;
        return result;
    };
    assert.equal(core.inspectCulture(ordinary).enabled, false);
    assert.deepEqual(strip(enabled), ordinary);
    assert.deepEqual(strip(core.applyCommand(enabled, { type: 'AdvanceTicks', ticks: 3000 })),
        core.applyCommand(ordinary, { type: 'AdvanceTicks', ticks: 3000 }));
    assert.deepEqual(core.reconstructState(core.serializeState(ordinary)), ordinary);
    assert.throws(() => core.applyCommand(ordinary, sponsor(ordinary)), /not enabled/i);
});

test('stale attendance, insufficient Food and a full support bank reject without a partial charge', () => {
    const original = campaign();
    const quoted = sponsor(original);
    const cases = [
        [original, { ...quoted, expectedParticipantIds: quoted.expectedParticipantIds.slice(1) }],
        [campaign({ landing: { initialFood: 2 } }), quoted],
        [original, { ...quoted, expectedSequence: 3 }],
        [original, { ...quoted, quotedFood: 0 }],
    ];
    let full = core.applyCommand(original, quoted);
    full = core.applyCommand(full, sponsor(full));
    cases.push([full, sponsor(full)]);
    for (const [state, command] of cases) {
        const before = core.serializeState(state);
        assert.throws(() => core.applyCommand(state, command), /Food|quote|support/i);
        assert.equal(core.serializeState(state), before);
    }
});

test('real childcare and expedition commitments are excluded and invalidate a stale attendance quote', () => {
    let state = core.createCampaign(32, { foundingCoupleChanceBps: 10000, initialFood: 100 },
        { ...quiet, fertilityChanceBps: 10000 }, forcedWeather('Normal'), {}, {}, {}, undefined,
        undefined, undefined, { enabled: true });
    state = core.advanceWinter(state);
    const mother = Object.keys(state.personas).find(id => core.isProvidingCare(state, id));
    assert.ok(mother);
    const helper = Object.values(state.personas).find(person => person.dna.sex === 'female' &&
        !core.isProvidingCare(state, person.id) && core.personaAge(state, person.id) >= 18).id;
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: helper, occupation: null });
    state = core.applyCommand(state, { type: 'AssignCaregiver', motherId: mother, caregiverId: helper });
    assert.equal(core.isProvidingCare(state, mother), false);
    const offer = core.gatheringOffer(state);
    assert.equal(offer.participantIds.includes(mother), true);
    assert.equal(offer.participantIds.includes(helper), false);
    assert.ok(offer.participantIds.every(id => !core.isProvidingCare(state, id) && core.personaAge(state, id) >= 18));

    state = campaign();
    const quoted = sponsor(state);
    const traveler = quoted.expectedParticipantIds[0];
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Eligible journey', memberIds: [traveler] });
    const groupId = Object.keys(state.world.groups)[0];
    const regionId = Object.values(state.world.regions).find(region => !region.requiresShip).id;
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId, regionId, mission: 'Recon' });
    assert.equal(core.personaAway(state, traveler), true);
    assert.equal(core.gatheringOffer(state).participantIds.includes(traveler), false);
    const serialized = core.serializeState(state);
    assert.throws(() => core.applyCommand(state, quoted), /quote/i);
    assert.equal(core.serializeState(state), serialized);
});

test('two banked assessments do not stack strength and are consumed FIFO one per exposed Harsh Winter', () => {
    let state = campaign({ weather: forcedWeather('Harsh') });
    state = core.applyCommand(state, sponsor(state));
    state = core.applyCommand(state, sponsor(state));
    const sources = core.inspectCulture(state).sourceEventIds;
    state = core.advanceWinter(state);
    assert.equal(core.inspectCulture(state).supportCount, 1);
    const first = state.events.find(event => event.type === 'CultureWeatherSupportApplied');
    assert.deepEqual(first.details.sourceEventIds, [sources[0]]);
    assert.ok(first.details.riskInputs.every(risk => risk.baselineWeatherExposureBps === 50 && risk.weatherExposureBps === 38));
    state = core.advanceWinter(state);
    assert.equal(core.inspectCulture(state).supportCount, 0);
    assert.deepEqual(state.events.filter(event => event.type === 'CultureWeatherSupportApplied')
        .map(event => event.details.sourceEventIds), [[sources[0]], [sources[1]]]);
});

test('support is retained without a real positive risk reduction: mild, normal, permanent shelter or fully clamped mortality', () => {
    for (const kind of ['Mild', 'Normal']) {
        let state = campaign({ weather: forcedWeather(kind) });
        state = core.applyCommand(state, sponsor(state));
        state = core.advanceWinter(state);
        assert.equal(core.inspectCulture(state).supportCount, 1);
        assert.equal(state.events.some(event => event.type === 'CultureWeatherSupportApplied'), false);
    }
    let housed = campaign({ landing: { initialMaterials: 100 }, weather: forcedWeather('Severe') });
    for (const householdId of Object.keys(housed.households))
        housed = core.applyCommand(housed, { type: 'HouseHousehold', householdId });
    housed = core.applyCommand(housed, sponsor(housed));
    housed = core.advanceWinter(housed);
    assert.equal(core.inspectCulture(housed).supportCount, 1);
    assert.equal(housed.events.some(event => event.type === 'CultureWeatherSupportApplied'), false);

    for (const natural of [9850, 10000]) {
        let certain = core.createCampaign(32, { foundingCoupleChanceBps: 0 },
            { ...quiet, mortalityBands: [{ minAge: 0, chanceBps: natural }] }, forcedWeather('Severe'),
            {}, {}, {}, undefined, undefined, undefined, { enabled: true });
        certain = core.applyCommand(certain, sponsor(certain));
        certain = core.advanceWinter(certain);
        assert.equal(Object.values(certain.personas).filter(person => person.deathWinter !== null).length, 10);
        assert.equal(core.inspectCulture(certain).supportCount, 1);
        assert.equal(certain.events.some(event => event.type === 'CultureWeatherSupportApplied'), false);
    }
});

test('the paid effect changes a real seeded Severe outcome without reducing natural mortality risk', () => {
    const input = core.createCampaign(1, { foundingCoupleChanceBps: 0 },
        { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0 }, forcedWeather('Severe'),
        {}, {}, {}, undefined, undefined, undefined, { enabled: true });
    const baseline = core.advanceWinter(input);
    const paid = core.applyCommand(input, sponsor(input));
    const supported = core.advanceWinter(paid);
    assert.equal(baseline.personas['founder-7'].deathWinter, 801);
    assert.equal(supported.personas['founder-7'].deathWinter, null);
    assert.equal(paid.stocks.food, input.stocks.food - 3);
    const risk = supported.events.find(event => event.type === 'CultureWeatherSupportApplied')
        .details.riskInputs.find(person => person.personaId === 'founder-7');
    assert.deepEqual(risk, { personaId: 'founder-7', naturalRiskBps: 5,
        baselineWeatherExposureBps: 200, weatherExposureBps: 150,
        baselineRiskBps: 205, mortalityRiskBps: 155 });
    assert.equal(supported.events.some(event => /Averted|Saved/.test(event.type)), false);
});

test('sponsored weather outcomes replay exactly across split ticks, save/load and rollback', () => {
    let initial = campaign({ weather: forcedWeather('Severe') });
    initial = core.applyCommand(initial, sponsor(initial));
    initial = core.applyCommand(initial, sponsor(initial));
    const expected = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 2000 });
    const partial = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 887 });
    const resumed = core.applyCommand(core.reconstructState(core.serializeState(partial)),
        { type: 'AdvanceTicks', ticks: 1113 });
    assert.deepEqual(resumed, expected);
    assert.deepEqual(core.applyCommand(core.reconstructState(core.serializeState(initial)),
        { type: 'AdvanceTicks', ticks: 2000 }), expected);
    for (const alter of [
        state => state.events.find(event => event.type === 'CultureWeatherSupportApplied').details.riskInputs[0].naturalRiskBps++,
        state => state.events.find(event => event.type === 'CultureWeatherSupportApplied').details.sourceEventIds = ['event-1'],
        state => state.events.find(event => event.type === 'CultureWeatherSupportApplied').details.weatherWinter++,
    ]) {
        const invalid = structuredClone(expected);
        alter(invalid);
        assert.throws(() => core.reconstructState(JSON.stringify(invalid)), /cultur/i);
    }
});

test('missing culture is legacy-compatible but explicit malformed empty culture is not silently ignored', () => {
    const original = campaign();
    for (const invalid of [null, false, 0, '', {}, { version: 2 }]) {
        const state = structuredClone(original);
        state.culture = invalid;
        assert.throws(() => core.reconstructState(JSON.stringify(state)), /cultur/i);
    }
});


test('Fjord can adopt optional cultural occasions once without replaying history or granting support', () => {
    const old = core.createCampaign(32);
    const before = core.serializeState(old);
    assert.equal(old.culture, undefined);
    const adopted = core.applyCommand(old, { type: 'UseCulturalOccasions' });
    for (const [clan, previous] of [[adopted, old], ...Object.keys(old.world.targetClans)
        .map(id => [adopted.world.targetClans[id], old.world.targetClans[id]])]) {
        assert.equal(core.inspectCulture(clan).enabled, true);
        assert.equal(core.inspectCulture(clan).supportCount, 0);
        assert.equal(core.inspectCulture(clan).nextSequence, 1);
        assert.equal(core.inspectCulture(clan).lastGatheringEventId, null);
        assert.deepEqual(clan.stocks, previous.stocks);
        assert.deepEqual(clan.personas, previous.personas);
        assert.deepEqual(clan.time, previous.time);
        assert.equal(clan.rngState, previous.rngState);
        assert.deepEqual(clan.events.slice(0, -1), previous.events);
        assert.equal(clan.events.at(-1).type, 'CulturalOccasionsEnabled');
        assert.deepEqual(clan.events.at(-1).time, previous.time);
    }
    assert.equal(core.serializeState(old), before);
    assert.deepEqual(core.applyCommand(adopted, { type: 'UseCulturalOccasions' }), adopted);
    assert.deepEqual(core.reconstructState(core.serializeState(adopted)), adopted);
    const offer = core.gatheringOffer(adopted, 'communal_ceremony');
    assert.equal(offer.allowed, true);
    const sponsored = core.applyCommand(adopted, {
        type: 'SponsorGathering', occasion: offer.occasion, expectedSequence: offer.expectedSequence,
        quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost,
        expectedParticipantIds: offer.participantIds,
    });
    assert.equal(sponsored.stocks.food, old.stocks.food - offer.foodCost);
    assert.equal(sponsored.stocks.materials, old.stocks.materials - offer.materialsCost);
    assert.equal(core.inspectCulture(sponsored).supportCount, 1);
    assert.equal(core.inspectCulture(sponsored.world.targetClans[Object.keys(old.world.targetClans)[0]]).supportCount, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(sponsored)), sponsored);
});
