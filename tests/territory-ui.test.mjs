import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { territoryNotice } = load('../src/fjord-play/TerritoryView.ts');

test('an actual intrusion warning offers group withdrawal without exposing enemy identities', () => {
    const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
        navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
            bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
    };
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }), world, 'territory-ui-fixture');
    const rival = state.world.targetClans['island-rival'];
    const homes = (clan, x) => Object.fromEntries(Object.keys(clan.personas).sort()
        .map((id, index) => [id, { x: x + index % 4 * 8, z: 112 + Math.floor(index / 4) * 8 }]));
    const context = { world, worldId: 'territory-ui-fixture', presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center,
            bounds: { minX: 32, maxX: 128, minZ: 64, maxZ: 192 }, homes: homes(state, 48) },
        { clanId: rival.clan.id, center: world.rivalSite.center, bounds: world.rivalSite.bounds, homes: homes(rival, 216) },
    ] };
    state = core.initializeTerritorialAwareness(state, context);
    assert.equal(territoryNotice(state, 'group-1'), '');
    for (const command of [
        { type: 'CreateExpeditionGroup', name: 'Coast <watch>', memberIds: ['founder-1'] },
        { type: 'StartExpedition', groupId: 'group-1' },
        { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: 128 } },
        { type: 'AdvanceTicks', ticks: 90 },
    ]) state = core.applyCommand(state, command, context);
    const html = territoryNotice(state, 'group-1');
    assert.match(html, /warning/i);
    assert.match(html, /data-recall="group-1"/);
    assert.match(html, /Withdraw group/);
    assert.equal(html.includes('island-rival:'), false);
    assert.equal(html.includes('Coast <watch>'), false);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    assert.doesNotMatch(territoryNotice(state, 'group-1'), /data-recall=/);
});
