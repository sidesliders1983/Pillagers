import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const quiet = { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }] };
function campaign(landing = {}, mechanics = {}, expedition = {}) {
    return core.createCampaign(32, { foundingCoupleChanceBps: 0, ...landing }, { ...quiet, ...mechanics },
        { enabled: false }, expedition, {}, {}, undefined, undefined, undefined, { enabled: true });
}
function sponsor(state, occasion, sourceEventId) {
    const offer = core.gatheringOffer(state, occasion, sourceEventId);
    return { type: 'SponsorGathering', occasion: offer.occasion, expectedSequence: offer.expectedSequence,
        quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost, expectedParticipantIds: offer.participantIds,
        ...(sourceEventId ? { sourceEventId } : {}) };
}

test('a neutral communal ceremony reuses the same paid cultural transaction and finite support', () => {
    const input = campaign();
    const offer = core.gatheringOffer(input, 'communal_ceremony');
    assert.equal(offer.allowed, true);
    const command = sponsor(input, 'communal_ceremony');
    const output = core.applyCommand(input, command);
    assert.equal(output.stocks.food, 12);
    assert.equal(core.inspectCulture(output).supportCount, 1);
    assert.equal(output.events.at(-1).type, 'CulturalGatheringHeld');
    assert.equal(output.events.at(-1).details.occasion, 'communal_ceremony');
    assert.deepEqual(output.events.at(-1).details.participants, offer.participantIds);
    assert.deepEqual(output.personas, input.personas);
    assert.deepEqual(output.households, input.households);
    assert.deepEqual(output.families, input.families);
    assert.deepEqual(output.time, input.time);
    assert.equal(output.rngState, input.rngState);
    assert.deepEqual(core.applyCommand(core.reconstructState(core.serializeState(output)), command), output);
});

test('the shared cultural availability projection returns real eligible people beyond the bounded attendance roster', () => {
    let state = campaign();
    const before = core.serializeState(state);
    const people = core.availableCulturalParticipants(state);
    assert.equal(people.length, 10);
    assert.deepEqual(people.map(person => person.id), Object.keys(state.personas).sort());
    assert.equal(core.gatheringOffer(state, 'communal_ceremony').participants.length, 8);
    assert.equal(core.serializeState(state), before);
    const traveler = people[0].id;
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Actual journey', memberIds: [traveler] });
    const groupId = Object.keys(state.world.groups)[0];
    const regionId = Object.values(state.world.regions).find(region => !region.requiresShip).id;
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId, regionId, mission: 'Recon' });
    assert.equal(core.availableCulturalParticipants(state).some(person => person.id === traveler), false);
    assert.equal(core.availableCulturalParticipants(state).length, 9);
});

function newPartnerships(expedition = {}) {
    return core.advanceWinter(campaign({ initialFood: 100 }, { partnershipChanceBps: 10000 }, expedition));
}

test('a new canonical partnership offers a wedding with both spouses reserved in the capped real roster', () => {
    const state = newPartnerships();
    const ordinary = core.gatheringOffer(state).participantIds;
    const source = state.events.find(event => event.type === 'PartnershipFormed' &&
        event.details.participants.some(id => !ordinary.includes(id)));
    assert.ok(source);
    const candidate = core.weddingCandidates(state).find(item => item.sourceEventId === source.id);
    assert.ok(candidate.allowed);
    const offer = core.gatheringOffer(state, 'wedding', source.id);
    assert.equal(offer.allowed, true);
    assert.equal(offer.sourceEventId, source.id);
    assert.deepEqual(offer.spouseIds, [...source.details.participants].sort());
    assert.ok(offer.spouseIds.every(id => offer.participantIds.includes(id)));
    assert.equal(offer.participantIds.length, 8);
    assert.deepEqual(offer.participantIds, [...offer.participantIds].sort());
    assert.deepEqual(candidate.spouses.map(person => person.id), offer.spouseIds);
});

test('a wedding marks its actual partnership source without creating or redating the partnership', () => {
    const input = newPartnerships();
    const candidate = core.weddingCandidates(input)[0];
    const command = sponsor(input, 'wedding', candidate.sourceEventId);
    assert.equal(command.expectedParticipantIds.length, 8);
    assert.equal(command.quotedFood, 24);
    const offer = core.gatheringOffer(input, 'wedding', candidate.sourceEventId);
    assert.equal(offer.foodCostBasis, 'per_participant');
    assert.equal(offer.foodPerParticipant, 3);
    const output = core.applyCommand(input, command);
    const celebration = output.events.at(-1);
    assert.equal(celebration.type, 'CulturalGatheringHeld');
    assert.equal(celebration.details.occasion, 'wedding');
    assert.equal(celebration.details.sourceEventId, candidate.sourceEventId);
    assert.deepEqual(celebration.details.spouseIds, candidate.spouseIds);
    assert.ok(candidate.spouseIds.every(id => celebration.details.participants.includes(id)));
    assert.deepEqual(output.personas, input.personas);
    assert.deepEqual(output.households, input.households);
    assert.deepEqual(output.families, input.families);
    assert.deepEqual(output.events.slice(0, input.events.length), input.events);
    assert.deepEqual(output.events.slice(input.events.length, -1).map(event => event.type),
        ['CampfireFuelConsumed', 'CampfireChanged']);
    assert.deepEqual(core.inspectCampfire(output), { lit: true, fuelTicks: 1000 });
    assert.equal(output.stocks.materials, input.stocks.materials - 1);
    assert.equal(output.stocks.food, input.stocks.food - 24);
    assert.equal(celebration.details.foodCost, 24);
    assert.equal(celebration.details.foodCostBasis, 'per_participant');
    assert.equal(core.inspectCulture(output).supportCount, 1);
    assert.equal(output.rngState, input.rngState);
    assert.deepEqual(core.reconstructState(core.serializeState(output)), output);
    assert.deepEqual(core.applyCommand(output, command), output);
});

test('founding partnerships are excluded and the new-partnership window ends exactly after one game year', () => {
    const founding = campaign({ foundingCoupleChanceBps: 10000, initialFood: 100 });
    const oldSource = founding.events.find(event => event.type === 'FoundingPartnershipPresent');
    assert.ok(oldSource);
    assert.deepEqual(core.weddingCandidates(founding), []);
    assert.equal(core.gatheringOffer(founding, 'wedding', oldSource.id).allowed, false);
    assert.match(core.gatheringOffer(founding, 'wedding', oldSource.id).reason, /new partnership/i);
    let state = newPartnerships();
    const sourceId = core.weddingCandidates(state)[0].sourceEventId;
    assert.equal(core.gatheringOffer(state, 'wedding', sourceId).allowed, true);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 999 });
    assert.equal(core.gatheringOffer(state, 'wedding', sourceId).allowed, true);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 });
    const before = core.serializeState(state);
    assert.equal(core.weddingCandidates(state).some(candidate => candidate.sourceEventId === sourceId), false);
    assert.equal(core.gatheringOffer(state, 'wedding', sourceId).allowed, false);
    assert.match(core.gatheringOffer(state, 'wedding', sourceId).reason, /window/i);
    assert.throws(() => core.applyCommand(state, sponsor(state, 'wedding', sourceId)), /window/i);
    assert.equal(core.serializeState(state), before);
});

test('a partnership can be celebrated only once while identical accepted request retries remain harmless', () => {
    const input = newPartnerships();
    const candidates = core.weddingCandidates(input);
    const sourceId = candidates[0].sourceEventId;
    const first = sponsor(input, 'wedding', sourceId);
    let state = core.applyCommand(input, first);
    assert.equal(core.weddingCandidates(state).find(candidate => candidate.sourceEventId === sourceId).allowed, false);
    assert.throws(() => core.applyCommand(state, sponsor(state, 'wedding', sourceId)), /already been celebrated/i);
    assert.throws(() => core.applyCommand(state, { ...first, sourceEventId: candidates[1].sourceEventId }), /receipt/i);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 });
    assert.deepEqual(core.applyCommand(core.reconstructState(core.serializeState(state)), first), state);
    assert.equal(state.events.filter(event => event.type === 'CulturalGatheringHeld' && event.details.occasion === 'wedding').length, 1);
});

test('wedding validation rejects missing, founding, mismatched and malformed occasion sources on restore', () => {
    const state = newPartnerships();
    const source = core.weddingCandidates(state)[0];
    const accepted = core.applyCommand(state, sponsor(state, 'wedding', source.sourceEventId));
    for (const alter of [
        details => delete details.sourceEventId,
        details => details.sourceEventId = 'event-1',
        details => details.spouseIds = [...details.spouseIds].reverse(),
        details => details.spouseIds = details.spouseIds.slice(0, 1),
        details => details.occasion = ['wedding'],
        details => details.occasion = 'communal_ceremony',
    ]) {
        const invalid = structuredClone(accepted);
        alter(invalid.events.at(-1).details);
        assert.throws(() => core.reconstructState(JSON.stringify(invalid)), /cultur/i);
    }
    const story = core.applyCommand(campaign(), sponsor(campaign(), 'storytelling_music'));
    story.events.at(-1).details.occasion = ['storytelling_music'];
    assert.throws(() => core.reconstructState(JSON.stringify(story)), /cultur/i);
});

test('an unavailable spouse blocks the wedding instead of silently replacing them with another attendee', () => {
    let state = newPartnerships();
    const candidate = core.weddingCandidates(state)[0];
    const quoted = sponsor(state, 'wedding', candidate.sourceEventId);
    const traveler = candidate.spouseIds[0];
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Actual spouse journey', memberIds: [traveler] });
    const groupId = Object.keys(state.world.groups)[0];
    const regionId = Object.values(state.world.regions).find(region => !region.requiresShip).id;
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId, regionId, mission: 'Recon' });
    assert.equal(core.personaAway(state, traveler), true);
    const offer = core.gatheringOffer(state, 'wedding', candidate.sourceEventId);
    assert.equal(offer.allowed, false);
    assert.match(offer.reason, /Both partners/i);
    assert.equal(offer.participantIds.includes(traveler), false);
    assert.equal(core.weddingCandidates(state).find(item => item.sourceEventId === candidate.sourceEventId).allowed, false);
    const before = core.serializeState(state);
    assert.throws(() => core.applyCommand(state, quoted), /Both partners/i);
    assert.equal(core.serializeState(state), before);
});

test('later real expedition loss does not invalidate the earlier factual wedding on save/load', () => {
    let state = newPartnerships({ casualtyBps: { ...core.defaultExpeditionConfig.casualtyBps, Recon: 10000 } });
    const candidate = core.weddingCandidates(state)[0];
    const accepted = sponsor(state, 'wedding', candidate.sourceEventId);
    state = core.applyCommand(state, accepted);
    const celebration = structuredClone(state.events.at(-1));
    const traveler = candidate.spouseIds[0];
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Controlled loss journey', memberIds: [traveler] });
    const groupId = Object.keys(state.world.groups)[0];
    const regionId = Object.values(state.world.regions).find(region => !region.requiresShip).id;
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId, regionId, mission: 'Recon' });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: state.world.config.durations.Recon });
    assert.notEqual(state.personas[traveler].deathWinter, null);
    assert.equal(state.personas[candidate.spouseIds[1]].partnerId, null);
    assert.equal(core.weddingCandidates(state).some(item => item.sourceEventId === candidate.sourceEventId), false);
    const restored = core.reconstructState(core.serializeState(state));
    assert.deepEqual(restored.events.find(event => event.id === celebration.id), celebration);
    assert.deepEqual(core.applyCommand(restored, accepted), restored);
});

test('communal and wedding occasions share the existing weather-support bank and deterministic replay', () => {
    const weather = structuredClone(core.defaultWeatherConfig);
    for (const kind of core.weatherClasses) weather.profiles[kind].probabilityBps = kind === 'Severe' ? 10000 : 0;
    let initial = core.advanceWinter(core.createCampaign(32,
        { foundingCoupleChanceBps: 0, initialFood: 100 }, { ...quiet, partnershipChanceBps: 10000 },
        weather, {}, {}, {}, undefined, undefined, undefined, { enabled: true }));
    const candidate = core.weddingCandidates(initial)[0];
    assert.ok(candidate);
    initial = core.applyCommand(initial, sponsor(initial, 'communal_ceremony'));
    const communalId = initial.events.at(-1).id;
    initial = core.applyCommand(initial, sponsor(initial, 'wedding', candidate.sourceEventId));
    const weddingId = initial.events.at(-1).id;
    assert.equal(core.inspectCulture(initial).supportCount, 2);
    assert.equal(core.gatheringOffer(initial, 'storytelling_music').allowed, false);
    const expected = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 2000 });
    const first = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 999 });
    const actual = core.applyCommand(core.reconstructState(core.serializeState(first)), { type: 'AdvanceTicks', ticks: 1001 });
    assert.deepEqual(actual, expected);
    assert.deepEqual(expected.events.filter(event => event.type === 'CultureWeatherSupportApplied')
        .map(event => event.details.sourceEventIds), [[communalId], [weddingId]]);
    assert.equal(core.inspectCulture(expected).supportCount, 0);
    assert.ok(expected.events.filter(event => event.type === 'CultureWeatherSupportApplied')
        .every(event => event.details.exposureReductionBps === 2500 &&
            event.details.riskInputs.every(risk => risk.baselineWeatherExposureBps === 200 && risk.weatherExposureBps === 150)));
});

test('caregiving blocks a newly partnered spouse without inventing an attendance exception', () => {
    const input = core.advanceWinter(campaign({ initialFood: 100 },
        { partnershipChanceBps: 10000, fertilityChanceBps: 10000 }));
    const candidate = core.weddingCandidates(input).find(item =>
        item.spouseIds.some(id => core.isProvidingCare(input, id)));
    assert.ok(candidate);
    assert.equal(candidate.allowed, false);
    assert.match(core.gatheringOffer(input, 'wedding', candidate.sourceEventId).reason, /Both partners/i);
    const before = core.serializeState(input);
    assert.throws(() => core.applyCommand(input, sponsor(input, 'wedding', candidate.sourceEventId)), /Both partners/i);
    assert.equal(core.serializeState(input), before);
});

test('a real CPU partnership can earn its own wedding support without granting it to the player', () => {
    const player = newPartnerships();
    const target = Object.values(player.world.targetClans).find(clan => core.weddingCandidates(clan).some(item => item.allowed));
    assert.ok(target);
    const candidate = core.weddingCandidates(target).find(item => item.allowed);
    const updated = core.applyCommand(target, sponsor(target, 'wedding', candidate.sourceEventId));
    assert.equal(core.inspectCulture(updated).supportCount, 1);
    assert.equal(core.inspectCulture(player).supportCount, 0);
    assert.equal(updated.stocks.food, target.stocks.food - 24);
    assert.equal(updated.events.at(-1).details.clanId, target.clan.id);
    assert.deepEqual(updated.events.at(-1).details.spouseIds, candidate.spouseIds);
    assert.deepEqual(core.reconstructState(core.serializeState(updated)), updated);
});


test('wedding affordability uses the full real roster without reducing attendance to fit Food', () => {
    const state = core.advanceWinter(campaign({ initialFood: 14 }, { partnershipChanceBps: 10000 }));
    assert.equal(state.stocks.food, 23);
    const candidate = core.weddingCandidates(state)[0];
    const offer = core.gatheringOffer(state, 'wedding', candidate.sourceEventId);
    assert.equal(offer.participantIds.length, 8);
    assert.equal(offer.foodCost, 24);
    assert.equal(offer.allowed, false);
    assert.equal(candidate.allowed, false);
    assert.match(offer.reason, /Food/i);
    const before = core.serializeState(state);
    assert.throws(() => core.applyCommand(state, sponsor(state, 'wedding', candidate.sourceEventId)), /Food/i);
    assert.equal(core.serializeState(state), before);
    assert.equal(core.gatheringOffer(state, 'communal_ceremony').foodCost, 3);
    assert.equal(core.gatheringOffer(state, 'storytelling_music').foodCost, 3);
});

test('a changed available wedding roster requires a fresh quote and charges its exact recorded count', () => {
    let state = newPartnerships();
    const candidate = core.weddingCandidates(state)[0];
    const original = sponsor(state, 'wedding', candidate.sourceEventId);
    const travelers = core.availableCulturalParticipants(state)
        .filter(person => !candidate.spouseIds.includes(person.id)).slice(0, 3).map(person => person.id);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Three actual travelers', memberIds: travelers });
    const groupId = Object.keys(state.world.groups)[0];
    const regionId = Object.values(state.world.regions).find(region => !region.requiresShip).id;
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId, regionId, mission: 'Recon' });
    const before = core.serializeState(state);
    const revised = core.gatheringOffer(state, 'wedding', candidate.sourceEventId);
    assert.equal(revised.participantIds.length, 7);
    assert.equal(revised.foodCost, 21);
    assert.ok(candidate.spouseIds.every(id => revised.participantIds.includes(id)));
    assert.throws(() => core.applyCommand(state, original), /quote/i);
    assert.equal(core.serializeState(state), before);
    const accepted = core.applyCommand(state, sponsor(state, 'wedding', candidate.sourceEventId));
    assert.equal(accepted.stocks.food, state.stocks.food - 21);
    assert.equal(accepted.events.at(-1).details.foodCost, 21);
    assert.deepEqual(accepted.events.at(-1).details.participants, revised.participantIds);
    assert.deepEqual(core.reconstructState(core.serializeState(accepted)), accepted);
});

test('per-attendee wedding receipts reject a missing or conflicting cost basis on restore', () => {
    const state = newPartnerships();
    const candidate = core.weddingCandidates(state)[0];
    const accepted = core.applyCommand(state, sponsor(state, 'wedding', candidate.sourceEventId));
    for (const alter of [
        details => delete details.foodCostBasis,
        details => details.foodCostBasis = 'flat',
        details => details.foodCostBasis = 'unknown',
        details => details.foodCost = 3,
        details => details.foodCost = 21,
    ]) {
        const invalid = structuredClone(accepted);
        alter(invalid.events.at(-1).details);
        assert.throws(() => core.reconstructState(JSON.stringify(invalid)), /cultur/i);
    }
    const communal = core.applyCommand(campaign(), sponsor(campaign(), 'communal_ceremony'));
    communal.events.at(-1).details.foodCostBasis = 'per_participant';
    assert.throws(() => core.reconstructState(JSON.stringify(communal)), /cultur/i);
});


test('genuine d43fff flat-price wedding and communal receipts restore and retry without a new debit', () => {
    // Generated through the committed d43fff public Core; provenance and generator are retained
    // in scratch/legacy-wedding-price-d43fff, with no receipt rewritten into supposed history.
    const serialized = readFileSync(new URL('./fixtures/cultural-flat-receipts-d43fff.json', import.meta.url), 'utf8');
    assert.equal(createHash('sha256').update(serialized).digest('hex'),
        '10c4c7be49b3b00d43f9b2aebe1d92506fecd2176b31e0d41d5b894bc3575b13');
    const restored = core.reconstructState(serialized);
    assert.equal(core.serializeState(restored), serialized);
    assert.equal(restored.campfire, undefined);
    const receipts = restored.events.filter(event => event.type === 'CulturalGatheringHeld');
    assert.deepEqual(receipts.map(event => event.details.occasion), ['communal_ceremony', 'wedding']);
    let later = core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 1000 });
    for (const receipt of receipts) {
        assert.equal(receipt.details.foodCost, 3);
        assert.equal(receipt.details.foodCostBasis, undefined);
        const command = { type: 'SponsorGathering', occasion: receipt.details.occasion,
            expectedSequence: receipt.details.gatheringSequence, quotedFood: 3,
            expectedParticipantIds: receipt.details.participants,
            ...(receipt.details.sourceEventId ? { sourceEventId: receipt.details.sourceEventId } : {}) };
        assert.deepEqual(core.applyCommand(later, command), later);
        assert.throws(() => core.applyCommand(later, { ...command, quotedFood: 24 }), /receipt/i);
    }
    assert.deepEqual(later.events.filter(event => event.type === 'CulturalGatheringHeld'), receipts);
});


test('a communal ceremony atomically lights its real unfuelled campfire using the reviewed Material', () => {
    const input = campaign();
    const offer = core.gatheringOffer(input, 'communal_ceremony');
    assert.equal(offer.requiresCampfire, true);
    assert.equal(offer.materialsCost, 1);
    const command = sponsor(input, 'communal_ceremony');
    const output = core.applyCommand(input, command);
    assert.deepEqual(core.inspectCampfire(output), { lit: true, fuelTicks: 1000 });
    assert.equal(output.stocks.food, input.stocks.food - 3);
    assert.equal(output.stocks.materials, input.stocks.materials - 1);
    const events = output.events.slice(input.events.length);
    assert.deepEqual(events.map(event => event.type),
        ['CampfireFuelConsumed', 'CampfireChanged', 'CulturalGatheringHeld']);
    const receipt = events.at(-1).details;
    assert.equal(receipt.requiresCampfire, true);
    assert.equal(receipt.materialsCost, 1);
    assert.deepEqual(receipt.campfireEventIds, events.slice(0, -1).map(event => event.id));
    assert.deepEqual(output.time, input.time);
    assert.equal(output.rngState, input.rngState);
    const restored = core.reconstructState(core.serializeState(output));
    assert.deepEqual(core.applyCommand(restored, command), output);
    assert.equal(input.campfire, undefined);
});


test('ceremonies reuse prepaid fuel with no Materials, whether the real fire is off or already burning', () => {
    let prepaid = core.applyCommand(campaign({ initialMaterials: 1 }), { type: 'SetCampfire', lit: true });
    prepaid = core.applyCommand(prepaid, { type: 'AdvanceTicks', ticks: 321 });
    assert.equal(prepaid.stocks.materials, 0);
    assert.equal(core.inspectCampfire(prepaid).fuelTicks, 679);
    for (const lit of [false, true]) {
        const input = core.applyCommand(prepaid, { type: 'SetCampfire', lit });
        const offer = core.gatheringOffer(input, 'communal_ceremony');
        assert.equal(offer.allowed, true);
        assert.equal(offer.materialsCost, 0);
        const command = sponsor(input, 'communal_ceremony');
        const output = core.applyCommand(input, command);
        assert.deepEqual(core.inspectCampfire(output), { lit: true, fuelTicks: 679 });
        assert.equal(output.stocks.materials, 0);
        assert.equal(output.stocks.food, input.stocks.food - 3);
        assert.deepEqual(output.events.slice(input.events.length).map(event => event.type), lit ?
            ['CulturalGatheringHeld'] : ['CampfireChanged', 'CulturalGatheringHeld']);
        let later = core.applyCommand(output, { type: 'SetCampfire', lit: false });
        later = core.applyCommand(later, { type: 'AdvanceTicks', ticks: 50 });
        const restored = core.reconstructState(core.serializeState(later));
        assert.deepEqual(core.applyCommand(restored, command), restored);
        assert.equal(core.inspectCampfire(restored).lit, false, 'accepted retries do not relight a later extinguished fire');
    }
});

function exhaustedBurningCampfire(initialMaterials) {
    let state = campaign({ initialMaterials, initialFood: 100 });
    for (const id of Object.keys(state.personas).sort())
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: id, occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'SetCampfire', lit: true });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 });
    assert.deepEqual(core.inspectCampfire(state), { lit: true, fuelTicks: 0 });
    return state;
}

test('a ceremony prepays normal fuel at the already-lit zero-fuel boundary without advancing time', () => {
    const input = exhaustedBurningCampfire(2);
    assert.equal(input.stocks.materials, 1);
    assert.equal(core.gatheringOffer(input, 'communal_ceremony').materialsCost, 1);
    const output = core.applyCommand(input, sponsor(input, 'communal_ceremony'));
    assert.equal(output.stocks.materials, 0);
    assert.equal(output.stocks.food, input.stocks.food - 3);
    assert.deepEqual(core.inspectCampfire(output), { lit: true, fuelTicks: 1000 });
    assert.deepEqual(output.events.slice(input.events.length).map(event => event.type),
        ['CampfireFuelConsumed', 'CulturalGatheringHeld']);
    assert.deepEqual(output.time, input.time);
    const restored = core.reconstructState(core.serializeState(output));
    const next = core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 1 });
    assert.deepEqual(core.inspectCampfire(next), { lit: true, fuelTicks: 999 });
    assert.equal(next.stocks.materials, 0);
});

test('missing ignition Materials or a changed Material quote reject before Food, fuel, or support changes', () => {
    for (const input of [campaign({ initialMaterials: 0 }), exhaustedBurningCampfire(1)]) {
        assert.equal(input.stocks.materials, 0);
        const offer = core.gatheringOffer(input, 'communal_ceremony');
        assert.equal(offer.materialsCost, 1);
        assert.equal(offer.allowed, false);
        assert.match(offer.reason, /Materials/i);
        const before = core.serializeState(input);
        assert.throws(() => core.applyCommand(input, sponsor(input, 'communal_ceremony')), /Materials/i);
        assert.equal(core.serializeState(input), before);
    }
    let state = campaign({ initialMaterials: 1 });
    const oldQuote = sponsor(state, 'communal_ceremony');
    state = core.applyCommand(state, { type: 'SetCampfire', lit: true });
    state = core.applyCommand(state, { type: 'SetCampfire', lit: false });
    const before = core.serializeState(state);
    assert.equal(core.gatheringOffer(state, 'communal_ceremony').materialsCost, 0);
    assert.throws(() => core.applyCommand(state, oldQuote), /quote/i);
    const fresh = sponsor(state, 'communal_ceremony');
    const missingMaterialQuote = { ...fresh };
    delete missingMaterialQuote.quotedMaterials;
    assert.throws(() => core.applyCommand(state, missingMaterialQuote), /quote/i);
    assert.equal(core.serializeState(state), before);
    const output = core.applyCommand(state, fresh);
    assert.equal(output.stocks.materials, 0);
    assert.deepEqual(core.inspectCampfire(output), { lit: true, fuelTicks: 1000 });
    assert.throws(() => core.applyCommand(output, { ...fresh, quotedMaterials: 1 }), /receipt/i);
});

test('new ceremony receipts validate their real preceding fuel and light events while storytelling stays optional', () => {
    const input = campaign();
    const accepted = core.applyCommand(input, sponsor(input, 'communal_ceremony'));
    for (const alter of [
        state => state.events.at(-1).details.requiresCampfire = false,
        state => state.events.at(-1).details.materialsCost = 0,
        state => state.events.at(-1).details.campfireEventIds = ['event-1'],
        state => state.events.at(-1).details.campfireEventIds.reverse(),
        state => state.events.at(-2).details.lit = false,
        state => state.events.at(-3).details.fuelTicks = 0,
    ]) {
        const invalid = structuredClone(accepted);
        alter(invalid);
        assert.throws(() => core.reconstructState(JSON.stringify(invalid)), /cultur/i);
    }
    const noMaterials = campaign({ initialMaterials: 0 });
    const offer = core.gatheringOffer(noMaterials, 'storytelling_music');
    assert.equal(offer.requiresCampfire, false);
    assert.equal(offer.materialsCost, 0);
    assert.equal(offer.foodCost, 3);
    const story = core.applyCommand(noMaterials, sponsor(noMaterials, 'storytelling_music'));
    assert.equal(story.campfire, undefined);
    assert.equal(story.events.at(-1).details.requiresCampfire, undefined);
});
