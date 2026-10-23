import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { homeImprovements, previewHomeSpecialization } = loadTypeScript(new URL('../src/fjord-play/HomeImprovements.ts', import.meta.url));
const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));

function homeFixture(config = {}) {
    let state = core.createCampaign(32, { initialMaterials: 100 }, config);
    const household = Object.values(state.households).find(home => home.memberIds.length > 0);
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: household.id });
    const buildingId = state.residences[state.households[household.id].residenceId].buildingId;
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: household.memberIds[0], occupation: 'smith' });
    return { state, buildingId, household };
}

test('specialization previews preserve resident occupations, time, RNG and the live state', () => {
    const { state, buildingId } = homeFixture();
    const saved = core.serializeState(state);
    const preview = previewHomeSpecialization(state, buildingId, 'fisher');
    const next = core.applyCommand(state, preview.command);
    assert.equal(next.buildings[buildingId].specialization, 'fisher');
    assert.deepEqual(next.personas, state.personas);
    assert.deepEqual(next.mechanics.buildings, state.mechanics.buildings);
    assert.deepEqual(next.time, state.time);
    assert.equal(next.rngState, state.rngState);
    assert.deepEqual(next.stocks, state.stocks);
    assert.equal(core.serializeState(state), saved);
});

test('upgrade availability and previews use the campaign configuration and actual matching workers', () => {
    let { state, buildingId, household } = homeFixture({ baseUpkeep: 4, upgradeCosts: [7, 13, 29] });
    const plain = homeImprovements(state, buildingId);
    assert.equal(plain.cost, 7);
    assert.equal(plain.availability.allowed, false);
    assert.match(plain.availability.reason, /Specialization required/);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: household.memberIds[0], occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId, occupation: 'farmer' });
    const preview = homeImprovements(state, buildingId);
    assert.equal(preview.upkeep, 4);
    assert.equal(preview.nextUpkeep, 5);
    assert.equal(preview.nextBonusBps, 2500);
    assert.ok(preview.matching.includes(household.memberIds[0]));
    assert.ok(preview.next.workers[0].after.productivityBps > preview.next.workers[0].before.productivityBps);
    const next = core.applyCommand(state, preview.command);
    assert.equal(next.stocks.materials, state.stocks.materials - 7);
    assert.equal(next.mechanics.buildings[buildingId].upgradeLevel, 1);
    for (const person of Object.values(state.personas).filter(person => !preview.matching.includes(person.id))) {
        assert.deepEqual(core.inspectWork(next, person.id), core.inspectWork(state, person.id));
    }
});

test('inactive occupations and Smiths without targets expose no invented upgrade output', () => {
    for (const occupation of ['boatbuilder', 'textileWorker', 'trader', 'smith', 'leatherAndJewelleryMaker']) {
        let { state, buildingId, household } = homeFixture();
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: household.memberIds[0], occupation });
        state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId, occupation });
        const preview = homeImprovements(state, buildingId);
        assert.ok(preview.matching.length > 0);
        assert.equal(preview.next.workers[0].before.reason,
            ['smith', 'leatherAndJewelleryMaker'].includes(occupation) ? 'target-reached' : 'inactive-role');
        assert.equal(preview.next.workers[0].after.productivityBps, 0);
    }
});

test('changing or removing specialization retains upgrades, upkeep and independent farmyard function', () => {
    let { state, buildingId, household } = homeFixture();
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: household.memberIds[0], occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId, occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId });
    const cattleId = Object.keys(state.landing.cattle)[0];
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId, farmyardId: buildingId });
    for (const occupation of ['hunter', null]) {
        const next = core.applyCommand(state, previewHomeSpecialization(state, buildingId, occupation).command);
        assert.equal(next.mechanics.buildings[buildingId].upgradeLevel, 1);
        assert.equal(core.inspectBuilding(next, buildingId).upkeep, 2);
        assert.equal(next.personas[household.memberIds[0]].occupation, 'farmer');
        assert.equal(next.landing.cattle[cattleId].farmyardId, buildingId);
        assert.ok(core.landingSummary(next).farmyards.some(yard => yard.id === buildingId));
    }
});

test('home cards distinguish insufficient resources, maximum level and vacancy', () => {
    let { state, buildingId, household } = homeFixture({ upgradeCosts: [1000, 1000, 1000] });
    state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId, occupation: 'smith' });
    const blocked = homeImprovements(state, buildingId);
    assert.equal(blocked.availability.allowed, false);
    assert.match(blocked.availability.reason, /Insufficient Materials/);
    assert.equal(blocked.cost, 1000);
    const vacant = core.applyCommand(state, { type: 'AssignResidence', householdId: household.id, residenceId: null });
    assert.equal(homeImprovements(vacant, buildingId).chargedUpkeep, 0);
    assert.deepEqual(homeImprovements(vacant, buildingId).matching, []);
    ({ state, buildingId } = homeFixture());
    state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId, occupation: 'smith' });
    for (let i = 0; i < 3; i++) state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId });
    const maximum = homeImprovements(state, buildingId);
    assert.equal(maximum.cost, undefined);
    assert.equal(maximum.next, undefined);
    assert.match(maximum.availability.reason, /Maximum upgrade level/);
});

test('upgrade transactions remain atomic and do not advance either clock', () => {
    const session = new GameplaySession(32);
    session.command({ type: 'SalvageLongship', longshipId: Object.keys(session.snapshot().landing.longships)[0] });
    const home = Object.values(session.snapshot().households)[0];
    session.command({ type: 'BuildHouse', householdId: home.id });
    const buildingId = session.snapshot().residences[session.snapshot().households[home.id].residenceId].buildingId;
    session.command({ type: 'SpecializeBuilding', buildingId, occupation: 'smith' });
    const before = session.saveJSON(), revision = session.revision, book = session.book;
    assert.throws(() => session.commandBatch([
        { type: 'UpgradeBuilding', buildingId },
        { type: 'AssignCattle', cattleId: 'missing', farmyardId: buildingId },
    ]));
    assert.equal(session.saveJSON(), before);
    assert.equal(session.revision, revision);
    assert.equal(session.book, book);
    const state = session.snapshot();
    session.commandBatch([{ type: 'UpgradeBuilding', buildingId }]);
    assert.equal(session.snapshot().stocks.materials, state.stocks.materials - 5);
    assert.deepEqual(session.snapshot().time, state.time);
    assert.equal(session.snapshot().rngState, state.rngState);
});
