import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { planOreSites } = loadTypeScript(new URL('../src/world-generation/OreSites.ts', import.meta.url));
const { campaignIslandCatalog } = loadTypeScript(new URL('../src/fjord-play/BakedIslandCatalog.ts', import.meta.url));
const { discoveryAt, inspectClanDiscovery } = loadTypeScript(new URL('../src/simulation/ClanDiscovery.ts', import.meta.url));
const entry = campaignIslandCatalog.entries.find(e => e.version === 'island-pool-v3' && e.seed === 18);
const original = JSON.parse(gunzipSync(readFileSync(new URL('../public' + entry.path, import.meta.url))).toString('utf8')).world;
const world = { ...original, oreSites: planOreSites(original) }, worldId = 'mining-18-v1';
function campaign() {
    return core.initializePhysicalDiscovery(core.createCampaign(32), world, worldId);
}

test('new physical mining binds finite deposits once without ore, clock, RNG or knowledge gifts', () => {
    const before = campaign();
    assert.equal(before.mining, undefined);
    const state = core.initializePhysicalMining(before, world, worldId);
    assert.equal(state.mining.version, 1);
    assert.equal(state.mining.worldId, worldId);
    assert.equal(state.specialistStocks.ironOre, 0);
    assert.deepEqual(state.stocks, before.stocks);
    assert.deepEqual(state.time, before.time);
    assert.equal(state.rngState, before.rngState);
    assert.deepEqual(state.discovery, before.discovery);
    assert.deepEqual(state.world, before.world, 'CPU states and world histories are not changed');
    assert.equal(state.mining.sites.length, world.oreSites.sites.length);
    for (const site of state.mining.sites) assert.equal(site.remainingUnits, site.initialUnits);
    assert.deepEqual(core.initializePhysicalMining(state, world, worldId), state, 'Binding cannot replenish deposits');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    const view = core.inspectMining(state), discovery = inspectClanDiscovery(state.discovery, state.clan.id);
    for (const site of state.mining.sites) {
        const known = view.sites.find(known => known.id === site.id);
        if (discoveryAt(discovery, site.position.x, site.position.z) === 'unknown') assert.equal(known, undefined);
        if (known) {
            assert.equal(known.remainingUnits, undefined, 'Sighted rock is not a detailed assay');
            assert.equal(known.initialUnits, undefined);
        }
    }
    assert.deepEqual(core.reconstructState(core.serializeState(before)), before, 'Old saves keep mining absent');
});


test('Miner is a genuine saved occupation with inherited aptitude and no remote or unassigned output', () => {
    const legacy = campaign();
    assert.throws(() => core.applyCommand(legacy, {type: 'AssignOccupation', personaId: 'founder-1', occupation: 'miner'}));
    const initial = core.initializePhysicalMining(legacy, world, worldId);
    const state = core.applyCommand(initial, {type: 'AssignOccupation', personaId: 'founder-1', occupation: 'miner'});
    assert.equal(state.personas['founder-1'].occupation, 'miner');
    assert.equal(state.personas['founder-1'].occupationHistory.at(-1).occupation, 'miner');
    const work = core.inspectWork(state, 'founder-1');
    assert.ok(work.aptitudeBps > 0);
    assert.equal(work.productivityBps, 0);
    assert.equal(work.reason, 'site-unassigned');
    const next = core.applyCommand(state, {type: 'AdvanceTicks', ticks: 10}, {world, worldId});
    assert.equal(next.specialistStocks.ironOre, 0);
    assert.equal(next.personas['founder-1'].workProgress, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(next)), next);
    assert.deepEqual(next.world.targetClans, core.applyCommand(initial, {type: 'AdvanceTicks', ticks: 10},
        {world, worldId}).world.targetClans, 'A new player occupation does not change CPU trajectories');
});

test('a miner walks to a genuinely discovered site, extracts finite ore, and returns without remote labour', () => {
    let initial = core.initializePhysicalMining(campaign(), world, worldId);
    const context = {world, worldId}, site = initial.mining.sites[0];
    initial = core.applyCommand(initial, {type: 'AssignOccupation', personaId: 'founder-1', occupation: 'miner'});
    assert.throws(() => core.applyCommand(initial, {type: 'AssignMiner', personaId: 'founder-1', siteId: site.id}, context), /discover/i);
    // A second resident scouts by actual paid commands, never by writing a discovery mask.
    let discovered = initial;
    discovered = core.applyCommand(discovered, {type: 'CreateExplorationGroup'}, context);
    discovered = core.applyCommand(discovered, {type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-2', included: true}, context);
    discovered = core.applyCommand(discovered, {type: 'StartExpedition', groupId: 'group-1'}, context);
    discovered = core.applyCommand(discovered, {type: 'ExploreArea', groupId: 'group-1', target: site.approach}, context);
    discovered = core.applyCommand(discovered, {type: 'AdvanceTicks', ticks: 350}, context);
    assert.ok(core.inspectMining(discovered).sites.some(s => s.id === site.id));
    const departureHome = world.settlement.center;
    const departure = {...context, exclusions: [{minX: departureHome.x-3, maxX: departureHome.x+3, minZ: departureHome.z-3, maxZ: departureHome.z+3}]};
    const walking = core.applyCommand(discovered, {type: 'AssignMiner', personaId: 'founder-1', siteId: site.id}, departure);
    assert.equal(core.inspectWork(walking, 'founder-1').reason, 'traveling-to-mine');
    assert.equal(walking.specialistStocks.ironOre, 0);
    assert.throws(() => core.applyCommand(walking, {type: 'AdvanceTicks', ticks: 1}), /mining.*world/i);
    const oneTick = core.applyCommand(walking, {type: 'AdvanceTicks', ticks: 1}, departure);
    assert.ok(oneTick.mining.workers['founder-1'].travelled > 0, 'The validated departure connector can leave a reserved home origin');
    assert.equal(oneTick.specialistStocks.ironOre, 0);
    const elapsed = core.applyCommand(walking, {type: 'AdvanceTicks', ticks: 1250}, context);
    assert.ok(elapsed.specialistStocks.ironOre > 0);
    assert.equal(elapsed.specialistStocks.ironOre, site.initialUnits - elapsed.mining.sites[0].remainingUnits);
    assert.ok(core.inspectMining(elapsed).sites.find(s => s.id === site.id).remainingUnits !== undefined);
    const events = elapsed.events.filter(e => e.type === 'IronOreExtracted');
    assert.equal(events.reduce((n, e) => n + e.details.units, 0), elapsed.specialistStocks.ironOre);
    assert.ok(events.every(e => e.personaId === 'founder-1' && e.details.siteId === site.id && e.details.clanId === elapsed.clan.id));
    const resumed = core.applyCommand(core.reconstructState(core.serializeState(oneTick)), {type: 'AdvanceTicks', ticks: 1249}, context);
    assert.deepEqual(resumed, elapsed);
    assert.ok(Object.values(elapsed.world.targetClans).every(s => !s.specialistStocks?.ironOre));
    const recalled = core.applyCommand(elapsed, {type: 'RecallMiner', personaId: 'founder-1'}, context);
    const changed = core.applyCommand(recalled, {type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer'});
    assert.equal(core.inspectWork(changed, 'founder-1').productivityBps, 0);
    const home = core.applyCommand(changed, {type: 'AdvanceTicks', ticks: 200}, context);
    assert.equal(home.mining.workers['founder-1'], undefined);
    assert.equal(home.specialistStocks.ironOre, elapsed.specialistStocks.ironOre);
});


test('small finite sites debit once in stable miner order; exhaustion and blockers survive saved batches', () => {
    const smallWorld = {...original, oreSites: planOreSites(original, {minimumUnits: 1, maximumUnits: 1})};
    const context = {world: smallWorld, worldId};
    let state = core.initializePhysicalMining(core.initializePhysicalDiscovery(core.createCampaign(32), smallWorld, worldId), smallWorld, worldId);
    state = core.applyCommand(state, {type: 'CreateExplorationGroup'}, context);
    state = core.applyCommand(state, {type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-3', included: true}, context);
    state = core.applyCommand(state, {type: 'StartExpedition', groupId: 'group-1'}, context);
    const site = state.mining.sites[0];
    state = core.applyCommand(state, {type: 'ExploreArea', groupId: 'group-1', target: site.approach}, context);
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: 350}, context);
    for (const id of ['founder-2', 'founder-1']) {
        state = core.applyCommand(state, {type: 'AssignOccupation', personaId: id, occupation: 'miner'});
        state = core.applyCommand(state, {type: 'AssignMiner', personaId: id, siteId: site.id}, context);
    }
    const p = state.mining.workers['founder-1'].route[3];
    const blocked = {...context, exclusions: [{minX: p.x-2, maxX: p.x+2, minZ: p.z-2, maxZ: p.z+2}]};
    const stopped = core.applyCommand(state, {type: 'AdvanceTicks', ticks: 5}, blocked);
    assert.equal(stopped.mining.workers['founder-1'].travelled, 0);
    assert.equal(core.inspectWork(stopped, 'founder-1').reason, 'route-blocked');
    assert.equal(stopped.specialistStocks.ironOre, 0);
    const complete = core.applyCommand(stopped, {type: 'AdvanceTicks', ticks: 1250}, context);
    let split = core.applyCommand(core.reconstructState(core.serializeState(stopped)), {type: 'AdvanceTicks', ticks: 200}, context);
    split = core.applyCommand(split, {type: 'AdvanceTicks', ticks: 1050}, context);
    assert.deepEqual(split, complete);
    assert.equal(complete.specialistStocks.ironOre, 1);
    assert.equal(complete.mining.sites[0].remainingUnits, 0);
    assert.equal(complete.events.filter(e => e.type === 'IronOreExtracted').length, 1);
    assert.throws(() => core.applyCommand(complete, {type: 'AssignMiner', personaId: 'founder-1', siteId: site.id}, context), /exhausted|available/i);
    for (const change of [s => s.mining = null, s => s.mining.sites[0].remainingUnits = 2,
        s => s.specialistStocks.ironOre++, s => s.mining.policy.metresPerTick = 0]) {
        const corrupt = structuredClone(complete); change(corrupt);
        assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /mining|occupation/i);
    }
});


test('Fjord mining is explicit at founding and restores the exact ore overlay without changing historical geography', () => {
    const {adoptCampaignIsland, islandRecipe} = loadTypeScript(new URL('../src/fjord-play/CampaignIsland.ts', import.meta.url));
    const {GameplaySession} = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const {FjordCampaign} = loadTypeScript(new URL('../src/fjord-play/FjordCampaign.ts', import.meta.url));
    const payload = JSON.parse(gunzipSync(readFileSync(new URL('../public' + entry.path, import.meta.url))).toString('utf8'));
    const seed = Array.from({length: 100}, (_, i) => i).find(seed => islandRecipe(seed).seed === 18);
    adoptCampaignIsland(seed, payload.world, payload.plan);
    const session = new GameplaySession();
    session.newCampaign(seed, false, true, 'summer-800-v1');
    const owner = new FjordCampaign(session, 'island-pool-v3');
    const historical = owner.exportJSON();
    owner.prepareMining();
    owner.enableDiscovery();
    session.initializeMining(owner.blueprint, session.readSnapshot().discovery.worldId);
    assert.ok(session.readSnapshot().mining);
    assert.deepEqual(owner.blueprint.terrain, payload.world.terrain);
    const saved = owner.exportJSON();
    const restored = new FjordCampaign(new GameplaySession(), 'legacy', saved);
    assert.deepEqual(restored.session.snapshot(), session.snapshot());
    assert.deepEqual(restored.blueprint, owner.blueprint);
    const old = new FjordCampaign(new GameplaySession(), 'legacy', historical);
    assert.equal(old.blueprint.oreSites, undefined);
    assert.equal(old.session.snapshot().mining, undefined);
    const tampered = JSON.parse(saved); tampered.oreSites.sites[0].initialUnits++;
    assert.throws(() => restored.importJSON(JSON.stringify(tampered)), /ore|world|mining/i);
    assert.equal(restored.exportJSON(), saved);
});


test('saved ore proposals tolerate harmless cross-engine geometry rounding and retain their exact identity', () => {
    const {adoptCampaignIsland, islandRecipe, prepareMiningIsland} = loadTypeScript(new URL('../src/fjord-play/CampaignIsland.ts', import.meta.url));
    const payload = JSON.parse(gunzipSync(readFileSync(new URL('../public' + entry.path, import.meta.url))));
    const seed = Array.from({length:100},(_,i)=>i).find(seed => islandRecipe(seed).seed === 18);
    adoptCampaignIsland(seed, payload.world, payload.plan);
    const prepared = prepareMiningIsland(payload.world), saved = structuredClone(prepared.oreSites);
    const originalHypot = Math.hypot;
    try {
        // Simulate the permitted last-bit differences of another JavaScript math implementation.
        Math.hypot = (...values) => {const value = originalHypot(...values); return value ? value * (1 + Number.EPSILON) : value;};
        const restored = prepareMiningIsland(payload.world, saved);
        assert.deepEqual(restored.oreSites, saved, 'Loading preserves the stored proposal, world identity and reserves');
    } finally {Math.hypot = originalHypot;}
    const corrupt = structuredClone(saved); corrupt.sites[0].position.x += .01;
    assert.throws(() => prepareMiningIsland(payload.world, corrupt), /ore/i);
});


test('a discovered outcrop develops once for 20 Materials and undeveloped work has half productivity', () => {
    const context = {world, worldId};
    let state = core.initializePhysicalMining(core.initializePhysicalDiscovery(
        core.createCampaign(32, {initialMaterials: 40}), world, worldId), world, worldId);
    const siteId = state.mining.sites[0].id;
    assert.throws(() => core.applyCommand(state, {type: 'BuildMine', siteId}, context), /discover/i);
    state = core.applyCommand(state, {type: 'CreateExplorationGroup'}, context);
    state = core.applyCommand(state, {type: 'SetExplorationMember',groupId:'group-1',personaId:'founder-2',included:true}, context);
    state = core.applyCommand(state, {type: 'StartExpedition',groupId:'group-1'}, context);
    state = core.applyCommand(state, {type: 'ExploreArea',groupId:'group-1',target:state.mining.sites[0].approach}, context);
    state = core.applyCommand(state, {type: 'AdvanceTicks',ticks:350}, context);
    state = core.applyCommand(state, {type: 'AssignOccupation',personaId:'founder-1',occupation:'miner'});
    state = core.applyCommand(state, {type: 'AssignMiner',personaId:'founder-1',siteId}, context);
    state = core.applyCommand(state, {type: 'AdvanceTicks',ticks:250}, context);
    assert.equal(state.mining.workers['founder-1'].phase,'Working');
    const built = core.applyCommand(state,{type:'BuildMine',siteId},context);
    assert.equal(built.stocks.materials,state.stocks.materials-20);
    assert.equal(built.stocks.food,state.stocks.food);
    assert.equal(built.rngState,state.rngState);
    assert.deepEqual(built.time,state.time);
    assert.equal(built.mining.sites[0].remainingUnits,state.mining.sites[0].remainingUnits);
    assert.equal(core.inspectMining(built).sites.find(s=>s.id===siteId).developed,true);
    assert.throws(()=>core.applyCommand(built,{type:'BuildMine',siteId},context),/already/i);
    const work = s => s.specialistStocks.ironOre*s.mechanics.config.workPerUnit+s.personas['founder-1'].workProgress;
    const raw = core.applyCommand(state,{type:'AdvanceTicks',ticks:100},context);
    const developed = core.applyCommand(built,{type:'AdvanceTicks',ticks:100},context);
    const rawGain=work(raw)-work(state), mineGain=work(developed)-work(built);
    assert.ok(rawGain>0 && mineGain>=2*rawGain && mineGain-2*rawGain<=800);
    assert.deepEqual(core.reconstructState(core.serializeState(developed)),developed);
    const old=structuredClone(state);old.mining.policy={version:1,metresPerTick:2,unitsPerYear:8};
    const upgraded=core.reconstructState(JSON.stringify(old));
    assert.equal(upgraded.mining.policy.version,2);
    assert.equal(upgraded.mining.policy.mineCostMaterials,20);
    assert.equal(upgraded.mining.policy.outcropProductivityBps,5000);
    assert.deepEqual(upgraded.stocks,old.stocks);
    assert.deepEqual(upgraded.events,old.events);
});

test('a real paid scout discovers Bog Iron and a Miner credits the same finite Iron Ore stock', () => {
    const {planMiningSites} = loadTypeScript(new URL('../src/world-generation/OreSites.ts', import.meta.url));
    const {planRoute} = loadTypeScript(new URL('../src/world-generation/LandRoutes.ts', import.meta.url));
    const entry = campaignIslandCatalog.entries.find(e => e.version === 'island-pool-v3' && e.seed === 101);
    const source = JSON.parse(gunzipSync(readFileSync('public' + entry.path))).world;
    // Explicit QA founding variant proves that a rocky source is not required.
    const world = {...source, oreSites: planMiningSites(source, {maximumSites: 0})}, worldId = 'bog-iron-101';
    const context = {world, worldId}, site = world.oreSites.sites.find(site => site.appearance === 'bog-iron');
    assert.ok(site, 'The fixed physical island has an actual Bog Iron opportunity');
    assert.ok(world.oreSites.sites.every(site => site.appearance === 'bog-iron'));
    let state = core.initializePhysicalMining(core.initializePhysicalDiscovery(core.createCampaign(32), world, worldId), world, worldId);
    assert.equal(core.inspectMining(state).sites.some(s => s.id === site.id), false);
    state = core.applyCommand(state, {type: 'CreateExplorationGroup'}, context);
    state = core.applyCommand(state, {type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-2', included: true}, context);
    const food = state.stocks.food;
    state = core.applyCommand(state, {type: 'StartExpedition', groupId: 'group-1'}, context);
    assert.equal(food - state.stocks.food, 8);
    const {routeLength} = loadTypeScript(new URL('../src/simulation/SpatialExpeditions.ts', import.meta.url));
    const distance = routeLength(planRoute(context, site.approach, world.settlement.center, true).route);
    state = core.applyCommand(state, {type: 'ExploreArea', groupId: 'group-1', target: site.approach}, context);
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: Math.ceil(distance / 2) + 10}, context);
    const known = core.inspectMining(state).sites.find(s => s.id === site.id);
    assert.equal(known.appearance, 'bog-iron');
    assert.equal(known.remainingUnits, undefined);
    assert.throws(() => core.applyCommand(state, {type: 'BuildMine', siteId: site.id}, context), /Bog Iron.*collected/);
    state = core.applyCommand(state, {type: 'AssignOccupation', personaId: 'founder-1', occupation: 'miner'});
    state = core.applyCommand(state, {type: 'AssignMiner', personaId: 'founder-1', siteId: site.id}, context);
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: Math.ceil(distance / 2) + 1600}, context);
    const remaining = state.mining.sites.find(s => s.id === site.id).remainingUnits;
    assert.ok(state.specialistStocks.ironOre > 0);
    assert.equal(site.initialUnits - remaining, state.specialistStocks.ironOre);
    assert.equal(state.specialistStocks.bogIron, undefined);
    assert.ok(state.events.some(e => e.type === 'IronOreExtracted' && e.details.source === 'bog-iron'));
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});
