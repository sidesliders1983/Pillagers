import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const quiet = { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }], baseUpkeep: 0 };
const placement = { x: 4, z: 8, rotation: Math.PI, worldId: 'review-world' };
const advance = (state, ticks) => core.applyCommand(state, { type: 'AdvanceTicks', ticks });
const enable = state => core.applyCommand(state, { type: 'EnableCommunityHearth' });
const upgrade = (state, expectedTier, quotedMaterials, position = placement) => core.applyCommand(state,
    { type: 'UpgradeCommunityHearth', expectedTier, quotedMaterials, placement: position });
function campaign(kind = 'Severe', materials = 100) {
    const weather = structuredClone(core.defaultWeatherConfig);
    for (const key of core.weatherClasses) weather.profiles[key].probabilityBps = key === kind ? 10000 : 0;
    return core.createCampaign(32, { initialMaterials: materials, initialFood: 100, foundingCoupleChanceBps: 0 },
        quiet, weather, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
}

test('one opt-in hearth accepts exactly two quoted upgrades and preserves the real paid fire', () => {
    const original = campaign();
    assert.equal(core.inspectCommunityHearth(original).enabled, false);
    let state = core.applyCommand(original, { type: 'SetCampfire', lit: true });
    const fire = structuredClone(state.campfire);
    const buildings = structuredClone(state.buildings);
    state = enable(state);
    assert.deepEqual(enable(state), state);
    assert.equal(core.inspectCommunityHearth(state).upgradeMaterials, 15);
    state = upgrade(state, 0, 15);
    assert.equal(core.inspectCommunityHearth(state).tier, 1);
    assert.equal(state.stocks.materials, 84);
    assert.deepEqual(state.campfire, fire);
    const once = core.serializeState(state);
    for (const command of [
        { expectedTier: 0, quotedMaterials: 15, placement },
        { expectedTier: 1, quotedMaterials: 29, placement },
        { expectedTier: 1, quotedMaterials: 30, placement: { ...placement, x: 5 } },
    ]) assert.throws(() => core.applyCommand(state, { type: 'UpgradeCommunityHearth', ...command }), /hearth|quote|tier|placement/i);
    assert.equal(core.serializeState(state), once);
    state = upgrade(state, 1, 30);
    assert.equal(core.inspectCommunityHearth(state).tier, 2);
    assert.equal(core.inspectCommunityHearth(state).upgradeMaterials, null);
    assert.equal(state.stocks.materials, 54);
    assert.deepEqual(state.buildings, buildings);
    assert.equal(state.events.filter(e => e.type === 'CommunityHearthUpgraded').length, 2);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    assert.throws(() => upgrade(state, 1, 30), /hearth|tier/i);
    assert.throws(() => enable(Object.values(original.world.targetClans)[0]), /local|player|CPU/i);
    assert.throws(() => upgrade(enable(campaign('Severe', 14)), 0, 15), /Materials/);
});

test('paid cold-window operation weights real tiers and affects only the existing weather component', () => {
    let state = enable(campaign());
    state = core.applyCommand(state, { type: 'SetCampfire', lit: true });
    state = advance(state, 125);
    assert.equal(core.inspectCommunityHearth(state).coverage.effectiveHeatReductionBps, 500);
    state = upgrade(upgrade(state, 0, 15), 1, 30);
    state = advance(state, 125);
    assert.deepEqual(core.inspectCommunityHearth(state).coverage, {
        winter: 800, coldWindowTicks: 250, observedTicks: 250, heatedTicks: 250, effectiveHeatReductionBps: 2000,
    });
    state = core.applyCommand(state, { type: 'SetCampfire', lit: false });
    const reloaded = core.reconstructState(core.serializeState(state));
    state = advance(reloaded, 750);
    const assessment = core.inspectCommunityHearth(state).lastAssessment;
    assert.equal(assessment.weatherWinter, 800);
    assert.equal(assessment.heatReductionBps, 2000);
    assert.equal(assessment.risks.length, 10);
    assert.ok(assessment.risks.every(risk => risk.naturalRiskBps === 0 &&
        risk.baselineWeatherExposureBps === 200 && risk.heatedWeatherExposureBps === 160 &&
        risk.weatherExposureBps === 160 && risk.mortalityRiskBps === 160));
    assert.equal(core.inspectCommunityHearth(state).coverage.heatedTicks, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

function sponsor(state, occasion) {
    const offer = core.gatheringOffer(state, occasion);
    return core.applyCommand(state, { type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost,
        expectedParticipantIds: offer.participantIds });
}

test('new real gatherings freeze venue strength and combine support after heat without changing old sources', () => {
    let state = enable(campaign());
    state = upgrade(upgrade(state, 0, 15), 1, 30);
    const offer = core.gatheringOffer(state);
    assert.equal(offer.venueMultiplierBps, 15000);
    assert.equal(offer.earnedExposureReductionBps, 3750);
    state = sponsor(state);
    const receipt = state.events.find(event => event.type === 'CulturalGatheringHeld');
    assert.deepEqual(receipt.details.venue, { rulesVersion: 'community-hearth-v1', tier: 2,
        multiplierBps: 15000, baseReductionBps: 2500, effectiveReductionBps: 3750 });
    state = core.applyCommand(state, { type: 'SetCampfire', lit: true });
    state = advance(state, 1000);
    const assessment = core.inspectCommunityHearth(state).lastAssessment;
    assert.equal(assessment.heatReductionBps, 3000);
    assert.ok(assessment.risks.every(risk => risk.baselineWeatherExposureBps === 200 &&
        risk.heatedWeatherExposureBps === 140 && risk.weatherExposureBps === 88));
    assert.equal(core.inspectCulture(state).supportCount, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);

    let old = sponsor(campaign());
    assert.equal(old.events.find(event => event.type === 'CulturalGatheringHeld').details.venue, undefined);
    old = upgrade(upgrade(enable(old), 0, 15), 1, 30);
    old = advance(old, 1000);
    assert.ok(core.inspectCommunityHearth(old).lastAssessment.risks.every(risk => risk.weatherExposureBps === 150));
    assert.equal(old.events.find(event => event.type === 'CultureWeatherSupportApplied').details.exposureReductionBps, 2500);
});

test('save validation rejects fabricated coverage, venue rewards, upgrade receipts and assessment totals', () => {
    let live = enable(campaign());
    live = core.applyCommand(live, { type: 'SetCampfire', lit: true });
    live = advance(live, 100);
    for (const alter of [
        state => state.communityHearth.coverage.heatedTicks++,
        state => state.communityHearth.coverage.weightedReductionTicks += 1000,
        state => state.communityHearth.coverage.observedTicks--,
        state => state.communityHearth.enabledAt.tick++,
        state => state.communityHearth.tier = 2,
    ]) {
        const changed = structuredClone(live); alter(changed);
        assert.throws(() => core.reconstructState(JSON.stringify(changed)), /hearth/i);
    }
    live = sponsor(upgrade(upgrade(live, 0, 15), 1, 30));
    const settled = advance(live, 900);
    for (const alter of [
        state => state.communityHearth.lastAssessment.risks[0].weatherExposureBps--,
        state => state.events.find(e => e.type === 'CommunityHearthAssessed').details.risks[0].naturalRiskBps++,
        state => state.events.find(e => e.type === 'CulturalGatheringHeld').details.venue.effectiveReductionBps = 9999,
        state => state.events.find(e => e.type === 'CommunityHearthUpgraded').details.cost = 0,
        state => delete state.communityHearth,
    ]) {
        const changed = structuredClone(settled); alter(changed);
        assert.throws(() => core.reconstructState(JSON.stringify(changed)), /hearth|cultur/i);
    }
    const bad = campaign(); bad.communityHearth = null;
    assert.throws(() => core.reconstructState(JSON.stringify(bad)), /hearth/i);
});

test('late lighting, partial adoption and spent fuel cannot manufacture a full winter of heat', () => {
    let late = advance(enable(campaign()), 999);
    late = core.applyCommand(late, { type: 'SetCampfire', lit: true });
    late = advance(late, 1);
    assert.equal(core.inspectCommunityHearth(late).lastAssessment.heatReductionBps, 0);
    let partial = advance(campaign(), 200);
    partial = core.applyCommand(enable(partial), { type: 'SetCampfire', lit: true });
    partial = advance(partial, 800);
    assert.equal(core.inspectCommunityHearth(partial).lastAssessment.heatReductionBps, 200);

    let exhausted = core.applyCommand(enable(campaign('Severe', 1)), { type: 'SetCampfire', lit: true });
    for (const personaId of Object.keys(exhausted.personas))
        exhausted = core.applyCommand(exhausted, { type: 'AssignOccupation', personaId, occupation: null });
    exhausted = advance(exhausted, 2000);
    assert.equal(core.inspectCampfire(exhausted).lit, false);
    assert.equal(core.inspectCommunityHearth(exhausted).lastAssessment.heatReductionBps, 0);
    assert.equal(exhausted.events.filter(e => e.type === 'CampfireFuelConsumed').length, 1);
    assert.deepEqual(core.reconstructState(core.serializeState(exhausted)), exhausted);
});

test('full heat has no effect on housed residents, disabled weather, natural risk or remote casualties', () => {
    let state = enable(campaign());
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
    state = core.applyCommand(state, { type: 'SetCampfire', lit: true });
    state = advance(state, 1000);
    assert.ok(!core.inspectCommunityHearth(state).lastAssessment.risks.some(row => row.personaId === 'founder-1'));
    assert.ok(!core.inspectCommunityHearth(state).affectedResidentIds.includes('founder-1'));

    let off = core.createCampaign(32, {}, { ...quiet, mortalityBands: [{ minAge: 0, chanceBps: 500 }] }, { enabled: false });
    let on = core.applyCommand(enable(off), { type: 'SetCampfire', lit: true });
    off = advance(off, 1000); on = advance(on, 1000);
    assert.equal(core.inspectCommunityHearth(on).lastAssessment.heatReductionBps, 0);
    assert.deepEqual(core.inspectCommunityHearth(on).lastAssessment.risks, []);
    assert.deepEqual(Object.values(on.personas).map(p => p.deathWinter), Object.values(off.personas).map(p => p.deathWinter));
    assert.equal(on.rngState, off.rngState);

    let departing = campaign();
    departing = core.applyCommand(departing, { type: 'CreateExpeditionGroup', name: 'Crew', memberIds: ['founder-1'] });
    const groupId = Object.keys(departing.world.groups)[0];
    const regionId = Object.values(departing.world.regions).find(r => !r.requiresShip).id;
    departing = core.applyCommand(departing, { type: 'DispatchExpedition', groupId, regionId, mission: 'Recon' });
    const heated = core.applyCommand(enable(departing), { type: 'SetCampfire', lit: true });
    const returned = advance(departing, 500), warmReturned = advance(heated, 500);
    assert.deepEqual(warmReturned.world.missions, returned.world.missions);
    assert.equal(warmReturned.rngState, returned.rngState);
    assert.equal(core.inspectCommunityHearth(warmReturned).lastAssessment, null);
});

test('split ticks, reload and real Materials ledger match a batched community year', () => {
    const { bookLedger } = loadTypeScript(new URL('../src/lore/BookLedger.ts', import.meta.url));
    const original = campaign();
    let state = upgrade(upgrade(enable(original), 0, 15), 1, 30);
    state = core.applyCommand(sponsor(state), { type: 'SetCampfire', lit: true });
    const batched = advance(state, 2100);
    let split = advance(state, 117);
    split = advance(core.reconstructState(core.serializeState(split)), 133);
    split = advance(split, 749);
    split = advance(core.reconstructState(core.serializeState(split)), 1101);
    assert.deepEqual(split, batched);
    const ledger = bookLedger(batched.events.slice(original.events.length), original.stocks, batched.stocks);
    assert.equal(ledger.materials.complete, true);
    assert.equal(ledger.materials.residual, 0);
    assert.equal(ledger.transactions.filter(row => row.purpose === 'CommunityHearthUpgraded')
        .reduce((total, row) => total + row.units, 0), 45);
    assert.ok(Object.values(batched.world.targetClans).every(target => target.communityHearth === undefined));
});

test('the same real death resolver observes all three heat tiers while retaining its RNG stream', () => {
    for (const [tier, expectedHeat, expectedExposure] of [[0, 1000, 180], [1, 2000, 160], [2, 3000, 140]]) {
        let state = enable(campaign());
        if (tier >= 1) state = upgrade(state, 0, 15);
        if (tier >= 2) state = upgrade(state, 1, 30);
        state = advance(core.applyCommand(state, { type: 'SetCampfire', lit: true }), 1000);
        const view = core.inspectCommunityHearth(state);
        assert.equal(view.lastAssessment.heatReductionBps, expectedHeat);
        assert.ok(view.lastAssessment.risks.every(row => row.weatherExposureBps === expectedExposure));
    }
    const weather = structuredClone(core.defaultWeatherConfig);
    for (const key of core.weatherClasses) weather.profiles[key].probabilityBps = key === 'Severe' ? 10000 : 0;
    weather.profiles.Severe.tentMortalityBps = 10000;
    const original = core.createCampaign(32, { initialMaterials: 100 }, quiet, weather);
    let warm = upgrade(upgrade(enable(original), 0, 15), 1, 30);
    warm = core.applyCommand(warm, { type: 'SetCampfire', lit: true });
    const baseline = advance(original, 1000);
    warm = advance(warm, 1000);
    assert.equal(Object.values(baseline.personas).filter(p => p.deathWinter !== null).length, 10);
    assert.ok(Object.values(warm.personas).some(p => p.deathWinter === null), 'Real fixed-seed outcome changes at the same mortality pass.');
    assert.equal(warm.rngState, baseline.rngState);
});

test('Summer adoption and individual birthdays add no retroactive heat or extra mortality pass', () => {
    let state = core.createCampaign(32, { initialMaterials: 100 }, quiet, {}, {}, {}, {},
        'summer-800-v1', 'individual-v1');
    state = core.applyCommand(enable(state), { type: 'SetCampfire', lit: true });
    const birthday = Math.min(...Object.values(state.personas).map(p => p.birthTick).filter(tick => tick > 500));
    state = advance(state, birthday - 500);
    assert.equal(core.inspectCommunityHearth(state).lastAssessment, null);
    assert.equal(state.events.filter(event => event.type === 'CommunityHearthAssessed').length, 0);
    state = advance(state, 1000 - birthday);
    assert.equal(core.inspectCommunityHearth(state).lastAssessment.heatReductionBps, 0);
    assert.equal(state.events.filter(event => event.type === 'CommunityHearthAssessed').length, 1);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('local children and carers receive exposure assessment without ceremony attendance restrictions', () => {
    const weather = structuredClone(core.defaultWeatherConfig);
    for (const key of core.weatherClasses) weather.profiles[key].probabilityBps = key === 'Severe' ? 10000 : 0;
    let state = core.createCampaign(32, { initialMaterials: 1000, initialFood: 1000, foundingCoupleChanceBps: 10000 },
        { ...quiet, fertilityChanceBps: 10000 }, weather, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
    state = core.applyCommand(enable(state), { type: 'SetCampfire', lit: true });
    state = advance(state, 1000);
    const children = Object.values(state.personas).filter(p => p.birthWinter === 801).map(p => p.id);
    const caregivers = Object.keys(state.personas).filter(id => core.isProvidingCare(state, id));
    assert.ok(children.length > 0 && caregivers.length > 0);
    const attendance = core.gatheringOffer(state).participantIds;
    assert.ok([...children, ...caregivers].every(id => !attendance.includes(id)));
    state = advance(state, 1000);
    const risks = core.inspectCommunityHearth(state).lastAssessment.risks;
    assert.ok([...children, ...caregivers].every(id => risks.some(row => row.personaId === id && row.heatedWeatherExposureBps === 180)));
});

test('adoption preserves legacy-valid paid fuel and validates only its new receipt and later operation', () => {
    let legacy = advance(campaign(), 75);
    legacy.campfire = { version: 1, lit: true, fuelTicks: 317 };
    legacy = core.reconstructState(JSON.stringify(legacy));
    let state = enable(legacy);
    assert.deepEqual(state.campfire, legacy.campfire);
    assert.deepEqual(state.events.find(event => event.type === 'CommunityHearthEnabled').details.campfire,
        { lit: true, fuelTicks: 317 });
    state = advance(state, 100);
    assert.equal(state.campfire.fuelTicks, 217);
    assert.equal(core.inspectCommunityHearth(state).coverage.heatedTicks, 100);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    for (const alter of [
        bad => bad.events.find(event => event.type === 'CommunityHearthEnabled').details.campfire.fuelTicks = 1001,
        bad => bad.events.find(event => event.type === 'CommunityHearthEnabled').details.campfire = null,
        bad => bad.campfire.fuelTicks++,
        bad => bad.campfire.lit = false,
    ]) {
        const bad = structuredClone(state); alter(bad);
        assert.throws(() => core.reconstructState(JSON.stringify(bad)), /hearth/i);
    }
});

test('a newly sponsored fire ceremony can reuse the legacy fuel frozen at adoption', () => {
    let state = campaign();
    state.campfire = { version: 1, lit: true, fuelTicks: 317 };
    state = enable(core.reconstructState(JSON.stringify(state)));
    state = sponsor(state, 'communal_ceremony');
    assert.equal(state.events.find(event => event.type === 'CulturalGatheringHeld').details.materialsCost, 0);
    assert.equal(state.campfire.fuelTicks, 317);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});
