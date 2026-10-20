import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { createCampaignIsland, campaignIslandPlan } = loadTypeScript(
    new URL('../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const { createFjordLayout, projectFjordSettlement, geographyIdentity, settlementCampfire } = loadTypeScript(
    new URL('../../src/fjord-play/FjordProjection.ts', import.meta.url));
const { projectRivalSettlement } = loadTypeScript(new URL('../../src/fjord-play/RivalSettlement.ts', import.meta.url));
const { inspectClanDiscovery, discoveryAt } = loadTypeScript(new URL('../../src/simulation/ClanDiscovery.ts', import.meta.url));
const { planRoute } = loadTypeScript(new URL('../../src/simulation/SpatialExpeditions.ts', import.meta.url));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const output = 'docs/qa/explore-pack-231';
await mkdir(output, { recursive: true });
const report = { status: 'RUNNING', protocol: 'two bounded physical smoke fixtures, not an economy matrix',
    comparison: 'Explicit paid QA two-Food pack versus ordinary eight-Food pack on identical current Core/world',
    controls: '15 founding Food; Summer 800; persona mortality/fertility and weather disabled to isolate ration timing',
    fixtures: [] };

function classify(error) {
    const message = error instanceof Error ? error.message : String(error);
    return { category: /search limit/i.test(message) ? 'search-limit' :
        /needs .*Food/i.test(message) ? 'insufficient-food' : /water/i.test(message) ? 'water' :
        /duration/i.test(message) ? 'mission-duration' : 'route-rejected', message };
}

for (const seed of [1, 0]) {
    const world = createCampaignIsland(seed), plan = campaignIslandPlan(world);
    const worldId = geographyIdentity(world);
    let initial = core.initializeIslandClans(core.createCampaign(seed, { initialFood: 15 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 },
        { enabled: false }, {}, {}, {}, 'summer-800-v1'), world, worldId);
    const layout = projectFjordSettlement(initial, world, createFjordLayout(world, undefined, seed)).layout;
    const rival = projectRivalSettlement(initial.world.targetClans[initial.world.island.clanId], world);
    const exclusions = [...Object.values(layout.plots), ...plan.plots, ...Object.values(rival.layout.plots)]
        .map(plot => ({ minX: plot.x - plot.halfWidth, maxX: plot.x + plot.halfWidth,
            minZ: plot.z - plot.halfDepth, maxZ: plot.z + plot.halfDepth }));
    for (const fire of [settlementCampfire(world).transform, rival.campfire.transform])
        exclusions.push({ minX: fire.x - 5, maxX: fire.x + 5, minZ: fire.z - 5, maxZ: fire.z + 5 });
    const context = { world, worldId, exclusions };
    const crew = core.inspectWorld(initial).eligible.map(person => person.id).sort().slice(0, 2);
    initial = core.applyCommand(initial, { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: crew });
    const before = core.serializeState(initial);
    let affordability;
    try { core.applyCommand(initial, { type: 'StartExpedition', groupId: 'group-1' }, context); }
    catch (error) { affordability = classify(error); }
    assert.equal(affordability?.category, 'insufficient-food');
    assert.equal(core.serializeState(initial), before);
    initial = core.applyCommand(initial, { type: 'EditExpeditionGroup', groupId: 'group-1',
        name: 'Group 1', memberIds: crew.slice(0, 1) });
    const view = inspectClanDiscovery(initial.discovery, initial.clan.id), home = world.settlement.center;
    const candidates = [];
    for (let dz = -48; dz <= 48; dz += 8) for (let dx = -48; dx <= 48; dx += 8) {
        const position = { x: home.x + dx, z: home.z + dz }, distance = Math.hypot(dx, dz);
        if (distance >= 24 && distance <= 48 && discoveryAt(view, position.x, position.z) !== 'unknown')
            candidates.push({ position, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.position.z - b.position.z || a.position.x - b.position.x);
    let target;
    const probe = core.applyCommand(initial, { type: 'StartExpedition', groupId: 'group-1' }, context);
    for (const candidate of candidates) {
        try { target = core.exploreOffer(probe, 'group-1', candidate.position, context).target; break; }
        catch { /* A rejected known-ground candidate is not a fabricated route. */ }
    }
    assert.ok(target, 'The curated home must have a short reachable mapped destination');
    const row = { campaignSeed: seed, islandSeed: plan.recipe.seed, recipe: plan.recipe,
        terrainHash: hash(world.terrain), navigationHash: hash(world.navigation), affordability, target, arms: [] };
    // Observer-only diagnostic. These coordinates never choose the player's destination
    // or bypass the unknown-site guard on an actual Recon command.
    try {
        const route = planRoute(context, world.rivalSite.center, undefined, true);
        row.observerRivalRoute = { category: 'route-found', points: route.route.length };
    } catch (error) { row.observerRivalRoute = classify(error); }
    for (const foodPerMember of [2, 8]) {
        let state = core.applyCommand(initial, { type: 'StartExpedition', groupId: 'group-1',
            ...(foodPerMember === 2 ? { testFoodPerMember: 2 } : {}) }, context);
        const paidFood = initial.stocks.food - state.stocks.food;
        assert.equal(paidFood, foodPerMember);
        const recon = core.islandMissionOffer(initial, 'group-1', { kind: 'area', position: target }, 'Recon', [], context);
        assert.equal(recon.foodPerMember, 2, 'Separate Recon still uses its own fee');
        state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target }, context);
        let elapsed = 0, returnObservation;
        while (elapsed < 2050 && state.world.spatial.missions['explore-1'].status !== 'Returned') {
            state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, context);
            elapsed += 10;
            const mission = core.inspectSpatialExpeditions(state).missions[0];
            if (mission.status === 'Returning' && !returnObservation) {
                returnObservation = { elapsed, reason: mission.returnReason,
                    remainingTicks: mission.supplies.activeTicksRemaining,
                    reservedReturnTicks: mission.supplies.returnTicksReserved };
                assert.ok(returnObservation.remainingTicks >= returnObservation.reservedReturnTicks);
                assert.equal(returnObservation.reason, 'low-supplies');
                state = core.reconstructState(core.serializeState(state));
            }
        }
        assert.ok(returnObservation);
        const mission = core.inspectSpatialExpeditions(state).missions[0];
        assert.equal(mission.status, 'Returned');
        const started = state.events.find(event => event.type === 'ExploreAreaReturnStarted');
        const returned = state.events.find(event => event.type === 'ExploreAreaReturned');
        row.arms.push({ foodPerMember, testCapacity: foodPerMember === 2, paidFood,
            returnObservation, returnStartedAt: started.time, returnedAt: returned.time,
            completedWithinTicks: elapsed, supplies: mission.supplies,
            preparedEvents: state.events.filter(event => event.type === 'ExploreAreaPrepared').length,
            reconFoodPerMember: recon.foodPerMember });
        assert.equal(row.arms.at(-1).preparedEvents, 1);
    }
    assert.ok(row.arms[1].returnObservation.elapsed > row.arms[0].returnObservation.elapsed);
    report.fixtures.push(row);
    console.log(JSON.stringify(row));
    await writeFile(output + '/physical-smoke.json', JSON.stringify(report, null, 2) + '\n');
}
report.status = 'PASS';
report.sourceHashes = Object.fromEntries(await Promise.all(['src/simulation/SpatialExpeditions.ts',
    'scripts/qa/check-explore-pack-231.mjs'].map(async file => [file,
    createHash('sha256').update(await readFile(file)).digest('hex')])));
await writeFile(output + '/physical-smoke.json', JSON.stringify(report, null, 2) + '\n');
