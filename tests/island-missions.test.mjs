import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { assertSpatialWorld } = loadTypeScript(new URL('../src/simulation/SpatialExpeditions.ts', import.meta.url));
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
        bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
};
const context = { world, worldId: 'island-missions-fixture' };
function campaign(seed = 32, config = {}) {
    let state = core.initializeIslandClans(core.createCampaign(seed, { initialFood: 400 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, config), world, context.worldId);
    return core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
}

test('physical mission offers cannot reveal an unknown site or survey an undiscovered CPU clan', () => {
    const state = campaign(), before = core.serializeState(state);
    assert.deepEqual(core.inspectIslandMissions(state).sites, []);
    assert.throws(() => core.islandMissionOffer(state, 'group-1',
        { kind: 'area', position: world.rivalSite.center }, 'Recon', [], context), /mapped/i);
    assert.throws(() => core.islandMissionOffer(state, 'group-1',
        { kind: 'area', position: world.settlement.center }, 'Surveillance', [], context), /discovered.*clan/i);
    assert.equal(core.serializeState(state), before, 'Rejected offers spend no Food and consume no RNG');
});

const certain = { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
    casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } };
function sightSite(state = campaign(32, certain)) {
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 80 }, context);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    return core.applyCommand(state, { type: 'AdvanceTicks', ticks: 80 }, context);
}

test('seeing a settlement marks a dated site but only a returned Recon identifies the CPU clan', () => {
    let state = sightSite();
    const target = { kind: 'site', siteId: 'rival-pocket-1' };
    const sighted = core.inspectIslandMissions(state).sites[0];
    assert.equal(sighted.id, target.siteId);
    assert.deepEqual(sighted.position, world.rivalSite.center);
    assert.equal(sighted.knowledge, null, 'Walking cannot grant surveyed clan information');
    assert.throws(() => core.islandMissionOffer(state, 'group-1', target, 'Surveillance', [], context), /discovered.*clan/i);
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Recon' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 170 }, context);
    assert.equal(core.inspectIslandMissions(state).sites[0].knowledge, null, 'Unreturned intel stays private');
    const saved = core.reconstructState(core.serializeState(state));
    state = core.applyCommand(saved, { type: 'AdvanceTicks', ticks: 80 }, context);
    const known = core.inspectIslandMissions(state).sites[0];
    assert.equal(known.knowledge.level, 'Scouted');
    assert.equal(known.knowledge.observedAt, 800330, 'The visit, not the later return, dates the observation');
    assert.equal(known.knowledge.settlementName, state.world.targetClans['island-rival'].clan.name);
    assert.ok(state.events.some(event => event.id === known.reportEventId && event.type === 'ExpeditionReturned'));
    assert.ok(state.events.some(event => event.id === known.sourceEventId && event.type === 'IslandSiteSighted'));
    assert.equal(core.islandMissionOffer(state, 'group-1', target, 'Surveillance', [], context).foodCost, 4);
    const remoteChange = structuredClone(state);
    remoteChange.world.targetClans['island-rival'].clan.name = 'Unseen new name';
    remoteChange.world.targetClans['island-rival'].stocks.food += 100;
    assert.deepEqual(core.inspectIslandMissions(remoteChange), core.inspectIslandMissions(state));
});

test('a mapped-area Recon pays the existing flat fee and physically returns within its duration', () => {
    const state = campaign(32, { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
        casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } });
    const target = { kind: 'area', position: { x: 128, z: 128 } };
    const quote = core.islandMissionOffer(state, 'group-1', target, 'Recon', [], context);
    assert.equal(quote.foodCost, 2);
    assert.equal(quote.duration, 250);
    const command = { type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Recon' };
    const departed = core.applyCommand(state, command, context);
    assert.equal(departed.stocks.food, state.stocks.food - 2);
    const halfway = core.applyCommand(departed, { type: 'AdvanceTicks', ticks: 16 }, context);
    const view = core.inspectSpatialExpeditions(halfway).missions[0];
    assert.equal(view.status, 'Traveling');
    assert.equal(view.position.x, 96);
    assert.equal(view.result, null);
    const returned = core.applyCommand(halfway, { type: 'AdvanceTicks', ticks: 234 }, context);
    const report = core.inspectSpatialExpeditions(returned).missions[0];
    assert.equal(report.status, 'Returned');
    assert.equal(report.position.x, 64);
    assert.equal(report.result.success, true);
    assert.equal(report.result.discovery.level, 'Scouted');
    assert.equal(report.result.discovery.settlementName, null);
    assert.equal(returned.events.filter(event => event.type === 'ExpeditionReturned').length, 1);
    assert.equal(returned.events.some(event => event.type === 'ResourceProduced' &&
        event.personaId === 'founder-1'), false);
    const resumed = core.reconstructState(core.serializeState(halfway));
    assert.deepEqual(core.applyCommand(resumed, { type: 'AdvanceTicks', ticks: 234 }, context), returned);
    assert.deepEqual(returned.world.regions, {});
    assert.deepEqual(returned.world.missions, {});
});

test('recalling between grid vertices walks back from the reached point with no refund or reportable intel', () => {
    const initial = campaign(32, certain);
    let state = core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'area', position: { x: 128, z: 128 } }, mission: 'Recon' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 11 }, context);
    assert.equal(core.inspectSpatialExpeditions(state).missions[0].position.x, 86);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    assert.equal(core.inspectSpatialExpeditions(state).missions[0].position.x, 86);
    assert.equal(state.stocks.food, initial.stocks.food - 2);
    state = core.reconstructState(core.serializeState(state));
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 11 }, context);
    const report = core.inspectSpatialExpeditions(state).missions[0];
    assert.equal(report.position.x, 64);
    assert.equal(report.outcome, 'Cancelled');
    assert.equal(report.result.success, false);
    assert.equal(report.result.discovery, null);
    assert.equal(report.result.food, 0);
});

test('Surveillance refreshes dated knowledge and Pillage transfers real assets once, within existing capacity', () => {
    const target = { kind: 'site', siteId: 'rival-pocket-1' };
    let known = sightSite();
    known = core.applyCommand(known, { type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Recon' }, context);
    known = core.applyCommand(known, { type: 'AdvanceTicks', ticks: 250 }, context);
    known = core.applyCommand(known, { type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Surveillance' }, context);
    known = core.applyCommand(known, { type: 'AdvanceTicks', ticks: 400 }, context);
    assert.equal(core.inspectIslandMissions(known).sites[0].knowledge.level, 'Surveyed');
    assert.equal(core.inspectIslandMissions(known).sites[0].knowledge.resistance, 'Medium');
    for (const priority of ['Food', 'Materials', 'Cattle', 'People']) {
        const departed = core.applyCommand(known, { type: 'DispatchIslandMission', groupId: 'group-1',
            target, mission: 'Pillage', priorities: [priority] }, context);
        assert.equal(departed.stocks.food, known.stocks.food - 5);
        const rivalBefore = core.applyCommand(departed.world.targetClans['island-rival'], { type: 'AdvanceTicks', ticks: 500 });
        const returned = core.applyCommand(departed, { type: 'AdvanceTicks', ticks: 500 }, context);
        const report = core.inspectSpatialExpeditions(returned).missions.at(-1).result;
        const rival = returned.world.targetClans['island-rival'];
        assert.equal(report.success, true);
        if (priority === 'Food') {
            assert.equal(report.food, 10);
            assert.equal(rival.stocks.food, rivalBefore.stocks.food - 10);
        } else if (priority === 'Materials') {
            assert.equal(report.materials, Math.min(5, rivalBefore.stocks.materials));
            assert.equal(rival.stocks.materials, rivalBefore.stocks.materials - report.materials);
        } else if (priority === 'Cattle') {
            assert.equal(report.cattleIds.length, 1);
            const id = report.cattleIds[0];
            assert.equal(rival.landing.cattle[id], undefined);
            assert.equal(returned.landing.cattle[id].id, id);
            assert.equal(returned.landing.cattle[id].sex, rivalBefore.landing.cattle[id].sex);
        } else {
            assert.equal(report.personaIds.length, 1);
            const id = report.personaIds[0];
            assert.equal(rival.personas[id], undefined);
            assert.equal(returned.personas[id].id, id);
            assert.deepEqual(returned.personas[id].dna, rivalBefore.personas[id].dna);
        }
        assert.equal(returned.events.filter(event => event.type === 'ExpeditionReturned' &&
            event.details.missionId === core.inspectSpatialExpeditions(returned).missions.at(-1).id).length, 1);
        assert.deepEqual(core.reconstructState(core.serializeState(returned)), returned);
    }
});

test('corrupt task target, observation and result references cannot enter a saved campaign', () => {
    const state = core.applyCommand(campaign(32, certain), { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'area', position: { x: 128, z: 128 } }, mission: 'Recon' }, context);
    for (const corrupt of [task => task.target.position.x = Infinity,
        task => task.target.position = { x: 150, z: 128 },
        task => task.priorities = ['Unknown'], task => task.observation = { level: 'Surveyed' },
        task => task.visitEventId = 'invented-event', task => task.observedSiteId = 'invented-site']) {
        const copy = structuredClone(state);
        corrupt(copy.world.spatial.missions['explore-1'].task);
        assert.throws(() => core.reconstructState(JSON.stringify(copy)), /invalid.*(mission|expedition)/i);
    }
});

test('physical missions retain exact off-grid homes on return and reject impossible or remote departures atomically', () => {
    const initial = campaign(32, certain), before = core.serializeState(initial);
    const target = { kind: 'area', position: { x: 128, z: 128 } };
    let state = core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1', target,
        mission: 'Recon', origins: { 'founder-1': { x: 65.25, z: 129.5 } } }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 220 }, context);
    assert.doesNotThrow(() => assertSpatialWorld(state, context), 'A returning save must reattach exact physical homes');
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 30 }, context);
    const position = core.inspectSpatialExpeditions(state).missions[0].position;
    assert.equal(position.x, 65.25);
    assert.equal(position.z, 129.5);
    assert.throws(() => core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1', target,
        mission: 'Recon', origins: { 'founder-1': { x: 400, z: 128 } } }, context), /home/i);
    assert.equal(core.serializeState(initial), before);
});

test('separate missions refuse Explore redirects and long or blocked land routes without changing the campaign', () => {
    const initial = campaign(32, certain), target = { kind: 'area', position: { x: 128, z: 128 } };
    const departed = core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1', target,
        mission: 'Recon' }, context);
    assert.throws(() => core.exploreOffer(departed, 'group-1', target.position, context), /return home/i);
    const saved = core.serializeState(initial);
    const detour = structuredClone(world);
    for (let row = 1; row < 32; row++) detour.navigation.cells[row * 65 + 12] = false;
    assert.throws(() => core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1', target,
        mission: 'Recon' }, { ...context, world: detour }), /round trip.*duration/i);
    for (let row = 0; row < 33; row++) detour.navigation.cells[row * 65 + 12] = false;
    assert.throws(() => core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1', target,
        mission: 'Recon' }, { ...context, world: detour }), /route|reachable/i);
    assert.equal(core.serializeState(initial), saved);
});

test('failed Recon cannot identify the clan and mission risk kills actual crew without recovering assets', () => {
    const target = { kind: 'site', siteId: 'rival-pocket-1' };
    for (const config of [
        { ...certain, successBps: { ...certain.successBps, Recon: 0 } },
        { ...certain, casualtyBps: { ...certain.casualtyBps, Recon: 10000 } },
    ]) {
        let state = sightSite(campaign(32, config));
        state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Recon' }, context);
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, context);
        const report = core.inspectSpatialExpeditions(state).missions.at(-1).result;
        assert.equal(report.success, false);
        assert.equal(report.discovery, null);
        assert.equal(core.inspectIslandMissions(state).sites[0].knowledge, null);
        assert.throws(() => core.islandMissionOffer(state, 'group-1', target, 'Surveillance', [], context), /discovered.*clan/i);
        if (config.casualtyBps.Recon === 10000) {
            assert.deepEqual(report.casualtyIds, ['founder-1']);
            assert.equal(state.personas['founder-1'].deathWinter, 800);
        }
        assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    }
});

test('a site route corrected around its campfire reattaches on the production-size navigation grid', () => {
    const landscape = { ...world, navigation: { bounds, spacing: 2, columns: 257, rows: 129,
        cells: Array(33153).fill(true) } };
    const bound = { ...context, world: landscape,
        exclusions: [{ minX: 219, maxX: 229, minZ: 123, maxZ: 133 }] };
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 400 }, {}, { enabled: false }, certain),
        landscape, context.worldId);
    for (const command of [
        { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] },
        { type: 'StartExpedition', groupId: 'group-1' },
        { type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center },
        { type: 'AdvanceTicks', ticks: 80 },
        { type: 'RecallExpedition', groupId: 'group-1' },
        { type: 'AdvanceTicks', ticks: 80 },
        { type: 'DispatchIslandMission', groupId: 'group-1', target: { kind: 'site', siteId: 'rival-pocket-1' }, mission: 'Recon' },
    ]) state = core.applyCommand(state, command, bound);
    const target = core.inspectSpatialExpeditions(state).missions.at(-1).target;
    assert.ok(Math.hypot(target.x - 224, target.z - 128) >= 6, 'The group stops outside the campfire');
    assert.doesNotThrow(() => assertSpatialWorld(core.reconstructState(core.serializeState(state)), bound));
});
