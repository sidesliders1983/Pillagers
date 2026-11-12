import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'encounter-gear-rival', center: { x: 224, z: 128 },
        bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
};

function intrusion() {
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
            partnershipChanceBps: 0 }, { enabled: false }), world, 'encounter-gear');
    const rival = state.world.targetClans['island-rival'];
    const homes = (clan, x) => Object.fromEntries(Object.keys(clan.personas).sort()
        .map((id, index) => [id, { x: x + index % 4 * 8, z: 112 + Math.floor(index / 4) * 8 }]));
    const context = { world, worldId: 'encounter-gear', presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center,
            bounds: { minX: 32, maxX: 128, minZ: 64, maxZ: 192 }, homes: homes(state, 48) },
        { clanId: rival.clan.id, center: world.rivalSite.center,
            bounds: world.rivalSite.bounds, homes: homes(rival, 216) },
    ] };
    state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0 });
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Visiting crew',
        memberIds: ['founder-1'] }, context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: world.rivalSite.center }, context);
    return core.applyCommand(state, { type: 'AdvanceTicks', ticks: 85 }, context);
}

test('actual resident responders cannot change equipment while their territorial duty is reserved', () => {
    const state = intrusion();
    const incident = Object.values(state.world.territory.incidents).find(incident => incident.phase !== 'Closed');
    assert.ok(incident?.responderIds.length, 'The intrusion recruits actual available residents');
    const rival = state.world.targetClans['island-rival'];
    const responder = incident.responderIds[0];
    assert.equal(core.personaAway(rival, responder), false, 'A local defender is not an expedition member');
    assert.ok(core.inspectResidentPresence(rival, responder).duty);
    const before = core.serializeState(rival);
    assert.throws(() => core.applyCommand(rival, { type: 'AssignEquipment', personaId: responder,
        slot: 'weapon', item: null }), /duty|responding|unavailable/i);
    assert.equal(core.serializeState(rival), before, 'A refused equipment change preserves the committed state');
});

test('a miner on a real away-work route cannot change equipment until physically back home', async () => {
    const { readFileSync } = await import('node:fs');
    const { gunzipSync } = await import('node:zlib');
    const { campaignIslandCatalog } = load('../src/fjord-play/BakedIslandCatalog.ts');
    const { planOreSites } = load('../src/world-generation/OreSites.ts');
    const entry = campaignIslandCatalog.entries.find(entry => entry.version === 'island-pool-v3' && entry.seed === 18);
    const original = JSON.parse(gunzipSync(readFileSync(new URL('../public' + entry.path, import.meta.url)))).world;
    const terrain = { ...original, oreSites: planOreSites(original) }, worldId = 'equipment-mining-home';
    const context = { world: terrain, worldId };
    let state = core.initializePhysicalMining(core.initializePhysicalDiscovery(core.createCampaign(32,
        { initialFood: 500 }, { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
            partnershipChanceBps: 0 }, { enabled: false }), terrain, worldId), terrain, worldId);
    const site = state.mining.sites[0];
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Ore scout', memberIds: ['founder-2'] }, context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: site.approach }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 350 }, context);
    assert.ok(core.inspectMining(state).sites.some(known => known.id === site.id));
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'miner' }, context);
    state = core.applyCommand(state, { type: 'AssignMiner', personaId: 'founder-1', siteId: site.id }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
    assert.ok(state.mining.workers['founder-1'].travelled > 0);
    assert.equal(core.personaAway(state, 'founder-1'), false, 'Away work is not an expedition');
    const before = core.serializeState(state);
    assert.throws(() => core.applyCommand(state, { type: 'AssignEquipment', personaId: 'founder-1',
        slot: 'weapon', item: null }, context), /home|mining|unavailable/i);
    assert.equal(core.serializeState(state), before);
    state = core.applyCommand(state, { type: 'RecallMiner', personaId: 'founder-1' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
    assert.equal(state.mining.workers['founder-1'], undefined);
    assert.doesNotThrow(() => core.applyCommand(state, { type: 'AssignEquipment', personaId: 'founder-1',
        slot: 'weapon', item: null }, context), 'A returned worker regains normal at-home equipment control');
});
