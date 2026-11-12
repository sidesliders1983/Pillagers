import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { planOreSites } = load('../src/world-generation/OreSites.ts');
const { planRoute } = load('../src/world-generation/LandRoutes.ts');
const { campaignIslandCatalog } = load('../src/fjord-play/BakedIslandCatalog.ts');
const { adoptCampaignIsland, prepareMiningIsland, islandRecipe } = load('../src/fjord-play/CampaignIsland.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const { projectRivalSettlement } = load('../src/fjord-play/RivalSettlement.ts');

function pregnancyAtMine() {
    const entry = campaignIslandCatalog.entries.find(entry => entry.version === 'island-pool-v3' && entry.seed === 18);
    const payload = JSON.parse(gunzipSync(readFileSync(new URL('../public' + entry.path, import.meta.url))).toString('utf8'));
    const seed = Array.from({ length: 100 }, (_, seed) => seed).find(seed => islandRecipe(seed).seed === 18);
    adoptCampaignIsland(seed, payload.world, payload.plan);
    const world = prepareMiningIsland(payload.world, planOreSites(payload.world)), worldId = 'scheduled-birth-mining-18';
    let state = core.initializeIslandClans(core.createCampaign(18,
        { initialFood: 100000, foundingCoupleChanceBps: 10000 },
        { fertilityChanceBps: 10000, partnershipChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false }, {}, {}, {},
        'summer-800-v1', 'individual-v1'), world, worldId);
    state = core.initializePhysicalMining(state, world, worldId);
    const rival = state.world.targetClans['island-rival'];
    const local = projectFjordSettlement(state, world, createFjordLayout(world, undefined, state.seed));
    const remote = projectRivalSettlement(rival, world);
    const homes = (clan, view) => Object.fromEntries(Object.keys(clan.personas).map(id => {
        const entity = view.entities.find(entity => entity.kind === 'persona' && entity.id === id);
        const home = Object.values(clan.households).find(home => home.memberIds.includes(id));
        const residence = clan.residences[home.residenceId];
        const plot = view.layout.plots[residence?.buildingId ? 'building:' + residence.buildingId : 'household:' + home.id];
        const position = entity.transform ?? { x: plot.x, z: plot.z + plot.halfDepth + 1.5 };
        return [id, planRoute({ world }, position, position, true).target];
    }));
    const context = { world, worldId, presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center, bounds: world.terrain.bounds, homes: homes(state, local) },
        { clanId: rival.clan.id, center: world.rivalSite.center, bounds: world.rivalSite.bounds, homes: homes(rival, remote) },
    ] };
    state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0 });
    const site = state.mining.sites[0];
    const scout = Object.values(state.personas).find(person => person.dna.sex === 'male' &&
        core.personaAge(state, person.id) >= state.mechanics.config.workAge).id;
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scout the actual ore', memberIds: [scout] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: site.approach }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 350 }, context);
    assert.ok(core.inspectMining(state).sites.some(known => known.id === site.id));
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 150 }, context);
    const selected = state.birthdayCalendar.pendingBirths.slice().sort((first, second) => second.dueAt.tick - first.dueAt.tick)[0];
    assert.ok(selected, 'The ordinary individual-birthday rules select a real pregnancy at home');
    const mother = selected.motherId;
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: mother, occupation: 'miner' });
    state = core.applyCommand(state, { type: 'AssignMiner', personaId: mother, siteId: site.id }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: selected.dueAt.tick - 1 }, context);
    assert.equal(state.mining.workers[mother].phase, 'Working', 'The selected mother really reaches the deposit before delivery');
    return { state, context, mother, selected, local };
}

test('scheduled delivery at a real mine keeps the returning mining body until the mother reaches home', () => {
    const { state: before, context, mother, selected, local } = pregnancyAtMine();
    const delivered = core.applyCommand(before, { type: 'AdvanceTicks', ticks: 1 }, context);
    const birth = delivered.events.find(event => event.type === 'ChildBorn' && event.details.parentIds.includes(mother));
    assert.ok(birth);
    assert.deepEqual(birth.time, selected.dueAt, 'Delivery is neither delayed nor rerolled by presence ownership');
    assert.equal(delivered.mining.workers[mother].phase, 'Returning');
    assert.equal(delivered.residentPresence.residents[mother].placement, undefined);
    assert.equal(core.inspectResidentPresence(delivered, mother), undefined, 'Mining owns the single actual outdoor body');
    const projection = projectFjordSettlement(delivered, context.world, local.layout);
    const entity = projection.entities.find(entity => entity.id === mother);
    assert.equal(entity.status.mining, true);
    assert.equal(entity.status.presence, undefined);
    assert.ok(entity.transform, 'The real return leg remains visible');
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(delivered))), core.serializeState(delivered));
    const ticks = Math.ceil(delivered.mining.workers[mother].travelled / delivered.mining.policy.metresPerTick) + 25;
    const whole = core.applyCommand(delivered, { type: 'AdvanceTicks', ticks }, context);
    let split = core.reconstructState(core.serializeState(delivered));
    for (let step = 0; step < ticks; step++) split = core.applyCommand(split, { type: 'AdvanceTicks', ticks: 1 }, context);
    assert.deepEqual(split, whole);
    assert.equal(whole.mining.workers[mother], undefined);
    assert.equal(core.inspectResidentPresence(whole, mother).placement.reason, 'childcare');
    assert.equal(core.inspectWork(whole, mother).reason, 'childcare');
    assert.equal(whole.events.filter(event => event.type === 'ChildBorn' && event.details.parentIds.includes(mother)).length, 1);
    assert.equal(whole.events.filter(event => event.type === 'MinerReturned' && event.personaId === mother).length, 1);
});