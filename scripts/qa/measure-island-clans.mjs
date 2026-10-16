import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { siteRoutes } = loadTypeScript(new URL('../../src/world-generation/SiteNavigation.ts', import.meta.url));
const { projectRivalSettlement } = loadTypeScript(new URL('../../src/fjord-play/RivalSettlement.ts', import.meta.url));
const seeds = [17, 42, 91, 1983, 1337, 7, 18, 32, 64, 127];
await mkdir('artifacts/island-clans', { recursive: true });
const cases = [];
let benchmark;
for (const seed of seeds) {
    const began = performance.now();
    const shared = new SharedSettlement(seed, 123, true, 'island-pool-v1', 'summer-800-v1');
    shared.fjord.enableDiscovery();
    const world = shared.fjord.blueprint;
    const state = shared.session.snapshot();
    const rival = state.world.targetClans[state.world.island.clanId];
    const view = projectRivalSettlement(rival, world);
    const missing = view.entities.filter(entity => !entity.transform && !entity.status.indoorReason).map(entity => entity.selectionKey);
    assert.deepEqual(missing, [], 'The real founding population must fit seed ' + seed);
    assert.equal(shared.fjord.readProjection().rival.known, false);
    assert.equal(shared.fjord.readProjection().rival.entities.length, 0);
    assert.equal(Object.keys(state.world.targetClans).length, 1);
    assert.equal(core.serializeState(state).includes('"heights"'), false);
    const foundingMs = performance.now() - began;
    const hidden = shared.persist();
    if (seed === 32) {
        benchmark = { state, world, layout: view.layout };
    }
    if (seed === 17) {
        await writeFile('artifacts/island-clans/hidden.json', hidden);
    }
    shared.session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
    shared.session.command({ type: 'StartExpedition', groupId: 'group-1' });
    const origin = shared.fjord.readProjection().entities.find(entity => entity.kind === 'persona' && entity.id === 'founder-1').transform;
    // Ordinary nearer objectives reuse the generator's existing validated land route.
    // No altered rations, revealed masks, route-priced purchases or route-search budget changes.
    const route = siteRoutes(world.navigation, origin)(world.rivalSite.center);
    const waypoints = route.filter((_point, index) => index > 0 && index % 40 === 0);
    waypoints.push(world.rivalSite.center);
    let next = 0, routeOrders = 0, routeError = null;
    const send = () => {
        try {
            shared.session.command({ type: 'ExploreArea', groupId: 'group-1', target: waypoints[next++],
                ...(routeOrders === 0 ? { origins: { 'founder-1': { x: origin.x, z: origin.z } } } : {}) });
            routeOrders++;
            return true;
        } catch (error) { routeError = String(error); return false; }
    };
    let observedAt = null, phase = '', visibleActors = 0, visibleResidents = 0;
    if (send()) for (let ticks = 4; ticks <= 500; ticks += 4) {
        shared.session.command({ type: 'AdvanceTicks', ticks: 4 });
        const projection = shared.fjord.readProjection();
        const mission = core.inspectSpatialExpeditions(shared.session.readSnapshot()).missions[0];
        if (projection.rival.currentlyObserved) {
            observedAt ??= ticks;
            if (projection.rival.entities.length > visibleActors) {
                visibleActors = projection.rival.entities.length;
                visibleResidents = projection.rival.entities.filter(entity => entity.kind === 'persona').length;
                phase = mission.status;
                if (seed === 17) await writeFile('artifacts/island-clans/observed.json', shared.persist());
            }
        }
        if (mission.status === 'Returning' || mission.status === 'Returned' || mission.status === 'Stranded') break;
        if (mission.status === 'Exploring' && next < waypoints.length && !send()) break;
    }
    const result = { seed, islandSeed: world.config.seed, foundingMs, households: Object.keys(rival.households).length,
        foundingActors: view.entities.length, missing, observedAt, visibleActors, visibleResidents, phase, routeOrders, routeError,
        totalMs: performance.now() - began };
    cases.push(result); console.log(JSON.stringify(result));
}
const initial = benchmark.state, target = initial.world.targetClans['island-rival'];
const cpuStart = performance.now();
const expected = core.applyCommand(target, { type: 'AdvanceTicks', ticks: 100000 });
const independentMs = performance.now() - cpuStart;
const replayStart = performance.now();
let state = initial, layout = benchmark.layout;
const growth = [];
for (let year = 1; year <= 100; year++) {
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const view = projectRivalSettlement(state.world.targetClans['island-rival'], benchmark.world, layout);
    layout = view.layout;
    const missing = view.entities.filter(entity => !entity.transform && !entity.status.indoorReason).map(entity => entity.selectionKey);
    assert.deepEqual(missing, [], 'Canonical rival identities need physical support at year ' + year);
    assert.equal(view.ground.paths.length, view.ground.plots.length, 'Rival home paths must connect at year ' + year);
    if (year === 50) state = core.reconstructState(core.serializeState(state));
    if ([1, 5, 10, 20, 50, 100].includes(year)) {
        growth.push({ year, time: state.time, living: Object.values(state.world.targetClans['island-rival'].personas)
            .filter(person => person.deathWinter === null).length, households: view.entities.filter(entity => entity.kind === 'household').length,
            houses: view.entities.filter(entity => entity.kind === 'building').length, missing });
        console.log('100-Winter replay: ' + year);
    }
}
assert.deepEqual(state.world.targetClans['island-rival'], expected, 'Rendered/culling-independent target replay');
const sourceHashes = {};
for (const path of ['src/simulation/SimulationCore.ts', 'src/simulation/WorldExpeditions.ts', 'src/simulation/IslandClans.ts',
    'src/fjord-play/RivalSettlement.ts', 'src/fjord-play/RivalScene.ts', 'src/fjord-play/FjordCampaign.ts', 'src/fjord-play/FjordProjection.ts'])
    sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile('artifacts/island-clans/measurements.json', JSON.stringify({ sourceHashes, cases,
    curatedGeometries: [...new Set(cases.map(record => record.islandSeed))],
    replay: { seed: 32, winters: 100, ticks: 100000, saveAtYear: 50, independentMs,
        coupledAndProjectionMs: performance.now() - replayStart, exact: true, growth } }, null, 2));
console.log('Ten founding seeds and the 100-Winter independent CPU replay passed.');
