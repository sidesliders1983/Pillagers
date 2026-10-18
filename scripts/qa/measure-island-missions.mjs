import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { expeditionEligible } = loadTypeScript(new URL('../../src/simulation/WorldExpeditions.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { siteRoutes } = loadTypeScript(new URL('../../src/world-generation/SiteNavigation.ts', import.meta.url));
const seeds = [17, 42, 91, 1983, 1337, 7, 18, 32, 64, 127];
const output = 'artifacts/island-missions';
await mkdir(output, { recursive: true });
const results = [];
let fixtureWritten = false;
for (const seed of seeds) {
    const began = performance.now();
    const shared = new SharedSettlement(seed, 123, true, 'island-pool-v1', 'summer-800-v1');
    shared.fjord.enableDiscovery();
    const initial = shared.persist();
    const world = shared.fjord.blueprint, target = { kind: 'site', siteId: world.rivalSite.candidateId };
    const result = { seed, islandSeed: world.config.seed, sighted: false, missions: [], errors: [] };
    shared.session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
    const actor = shared.fjord.readProjection().entities.find(e => e.kind === 'persona' && e.id === 'founder-1').transform;
    const origin = { x: actor.x, z: actor.z };
    const route = siteRoutes(world.navigation, origin)(world.rivalSite.center);
    assert.ok(route?.length, 'The established geographic connection exists');
    shared.session.command({ type: 'StartExpedition', groupId: 'group-1' });
    let index = 8;
    const send = () => {
        const point = route[Math.min(index, route.length - 1)];
        shared.session.command({ type: 'ExploreArea', groupId: 'group-1', target: point,
            ...(index === 8 ? { origins: { 'founder-1': origin } } : {}) });
        index += 8;
    };
    try {
        send();
        for (let ticks = 0; ticks < 550; ticks += 4) {
            shared.session.command({ type: 'AdvanceTicks', ticks: 4 });
            const mission = core.inspectSpatialExpeditions(shared.session.readSnapshot()).missions[0];
            if (core.inspectIslandMissions(shared.session.readSnapshot()).sites.length) { result.sighted = true; break; }
            if (['Returned', 'Stranded', 'Returning'].includes(mission.status)) break;
            if (mission.status === 'Exploring' && index < route.length + 8) send();
        }
        const active = core.inspectSpatialExpeditions(shared.session.readSnapshot()).missions.find(m => m.status !== 'Returned');
        if (active && !['Returning', 'Stranded'].includes(active.status)) shared.session.command({ type: 'RecallExpedition', groupId: 'group-1' });
        for (let ticks = 0; ticks < 550 && core.inspectSpatialExpeditions(shared.session.readSnapshot()).missions.some(m => !['Returned', 'Stranded'].includes(m.status)); ticks += 4)
            shared.session.command({ type: 'AdvanceTicks', ticks: 4 });
    } catch (error) { result.errors.push('Explore: ' + error.message); }
    if (result.sighted) {
        for (const mission of ['Recon', 'Surveillance', 'Pillage']) {
            try {
                const members = shared.session.readSnapshot().world.groups['group-1'].memberIds;
                const entities = shared.fjord.readProjection().entities;
                const origins = Object.fromEntries(members.map(id => {
                    if (!expeditionEligible(shared.session.readSnapshot(), id, 'group-1'))
                        throw new Error('Group member is unavailable after the preceding mission.');
                    const p = entities.find(e => e.kind === 'persona' && e.id === id)?.transform;
                    assert.ok(p, 'An eligible resident must have a real physical origin');
                    return [id, { x: p.x, z: p.z }];
                }));
                const priorities = mission === 'Pillage' ? ['Food', 'Materials', 'Cattle', 'People'] : [];
                const offer = shared.session.islandMissionOffer('group-1', target, mission, priorities, origins);
                if (!fixtureWritten && mission === 'Recon') {
                    const save = JSON.parse(shared.persist());
                    save.pace.running = false;
                    await writeFile(output + '/sighted.json', JSON.stringify(save));
                    await writeFile(output + '/hidden.json', initial);
                    fixtureWritten = true;
                }
                shared.session.command({ type: 'DispatchIslandMission', groupId: 'group-1', target, mission, priorities, origins });
                const departure = shared.session.snapshot();
                const halfway = core.applyCommand(departure, { type: 'AdvanceTicks', ticks: 37 }, { world, worldId: departure.discovery.worldId });
                const resumed = core.reconstructState(core.serializeState(halfway));
                const expected = core.applyCommand(resumed, { type: 'AdvanceTicks', ticks: offer.duration - 37 }, { world, worldId: departure.discovery.worldId });
                shared.session.command({ type: 'AdvanceTicks', ticks: offer.duration });
                assert.deepEqual(shared.session.snapshot(), expected, 'Exact split replay seed ' + seed);
                const report = core.inspectSpatialExpeditions(expected).missions.at(-1);
                assert.equal(report.status, 'Returned');
                result.missions.push({ type: mission, ...offer, result: report.result });
                if (mission === 'Recon' && report.result.success) await writeFile(output + '/identified-' + seed + '.json', shared.persist());
            } catch (error) { result.errors.push(mission + ': ' + error.message); }
        }
    }
    const saved = shared.session.snapshot(), context = { world, worldId: saved.discovery.worldId };
    assert.deepEqual(SharedSettlement.restore(shared.persist(), 'fjord').session.snapshot(), saved,
        'Full saved geography and missions reattach, seed ' + seed);
    const end = core.applyCommand(saved, { type: 'AdvanceTicks', ticks: 2000 }, context);
    const resume = core.reconstructState(core.serializeState(core.applyCommand(saved, { type: 'AdvanceTicks', ticks: 777 }, context)));
    assert.deepEqual(core.applyCommand(resume, { type: 'AdvanceTicks', ticks: 1223 }, context), end);
    assert.equal(Object.keys(end.world.regions).length, 0);
    assert.equal(Object.keys(end.world.targetClans).length, 1);
    result.elapsedMs = performance.now() - began;
    results.push(result);
    console.log(JSON.stringify({ seed, sighted: result.sighted, completed: result.missions.map(m => m.type), errors: result.errors }));
    await writeFile(output + '/measurements.json', JSON.stringify({ seeds, physicalDeviceTested: false, results }, null, 2));
}
assert.ok(fixtureWritten, 'At least one actual island permits a physical Recon within existing limits');
