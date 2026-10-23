import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { bookLedger } = loadTypeScript(new URL('../src/lore/BookLedger.ts', import.meta.url));
const { projectChronicle } = loadTypeScript(new URL('../src/lore/Chronicle.ts', import.meta.url));
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
        bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
};
const context = { world, worldId: 'smithery-mission-fixture' };
const certain = { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
    casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } };
const apply = (state, command) => core.applyCommand(state, command, context);
const advance = (state, ticks) => apply(state, { type: 'AdvanceTicks', ticks });
function knownRival() {
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500, initialMaterials: 100 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, certain), world, context.worldId);
    state = apply(state, { type: 'CreateExpeditionGroup', name: 'Crafted crew', memberIds: ['founder-1', 'founder-2'] });
    state = apply(state, { type: 'StartExpedition', groupId: 'group-1' });
    state = apply(state, { type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center });
    state = advance(state, 80);
    state = apply(state, { type: 'RecallExpedition', groupId: 'group-1' });
    state = advance(state, 80);
    state = apply(state, { type: 'DispatchIslandMission', groupId: 'group-1', target: { kind: 'site', siteId: 'rival-pocket-1' }, mission: 'Recon' });
    state = advance(state, 250);
    // Controlled starting gear for the dispatch protocol; the production path has separate tests.
    state.smithery.stored.woodenSpear = 1;
    state.smithery.stored.leatherShield = 1;
    state = apply(state, { type: 'AssignEquipment', personaId: 'founder-1', slot: 'weapon', item: 'woodenSpear' });
    return apply(state, { type: 'AssignEquipment', personaId: 'founder-1', slot: 'shield', item: 'leatherShield' });
}
const depart = state => apply(state, { type: 'DispatchIslandMission', groupId: 'group-1',
    target: { kind: 'site', siteId: 'rival-pocket-1' }, mission: 'Pillage', priorities: ['Materials'] });

test('physical Pillage freezes named gear at dispatch and preserves it through save/split return', () => {
    let state = knownRival();
    state.world.config.successBps.Pillage = 6000;
    state.world.config.casualtyBps.Pillage = 1000;
    const offer = core.islandMissionOffer(state, 'group-1', { kind: 'site', siteId: 'rival-pocket-1' }, 'Pillage', ['Materials'], context);
    assert.equal(offer.successBps, 6500);
    assert.deepEqual(offer.equipment.members.map(member => member.casualtyBps), [600, 1000]);
    const openingFood = state.stocks.food;
    const dispatched = depart(state), mission = Object.values(dispatched.world.spatial.missions).at(-1);
    assert.deepEqual(mission.task.equipment, offer.equipment);
    assert.equal(dispatched.stocks.food, openingFood - 10, 'Existing Food cost is unchanged');
    assert.throws(() => apply(dispatched, { type: 'AssignEquipment', personaId: 'founder-1', slot: 'weapon', item: null }), /home/);
    const checkpoint = core.reconstructState(core.serializeState(advance(dispatched, 120)));
    const restored = advance(checkpoint, 380), batch = advance(dispatched, 500);
    assert.equal(core.serializeState(restored), core.serializeState(batch));
    const returned = restored.world.spatial.missions[mission.id];
    assert.ok(returned.task.result.equipment);
    assert.deepEqual(returned.task.equipment, offer.equipment);
    const rows = [...returned.task.result.equipment.returned, ...returned.task.result.equipment.lost];
    assert.equal(rows.length, 2);
    const corrupted = structuredClone(restored);
    corrupted.world.spatial.missions[mission.id].task.result.equipment.returned = [];
    assert.throws(() => core.serializeState(corrupted), /equipment/);
});

test('recalling a physical Pillage preserves surviving gear, consumes no second recipe and refunds no Food', () => {
    let state = depart(knownRival());
    const materials = state.stocks.materials;
    const mission = Object.values(state.world.spatial.missions).at(-1);
    state = advance(state, 5);
    state = apply(state, { type: 'RecallExpedition', groupId: 'group-1' });
    state = advance(state, 500);
    const returned = state.world.spatial.missions[mission.id];
    assert.equal(returned.status, 'Returned');
    assert.equal(returned.task.result.success, false);
    assert.deepEqual(state.smithery.assignments['founder-1'], { weapon: 'woodenSpear', shield: 'leatherShield' });
    assert.equal(state.smithery.stored.woodenSpear, 0);
    assert.equal(returned.task.result.food, 0, 'Cancellation refunds or recovers no Food');
    assert.equal(state.events.filter(event => event.type === 'ExpeditionDeparted' &&
        event.details.missionId === mission.id).reduce((sum, event) => sum + event.details.foodCost, 0), 10);
    assert.ok(state.stocks.materials >= materials, 'Ordinary home workers may keep working');
});

test('Recon retains its exact configured probabilities and RNG sequence even when members wear gear', () => {
    const state = knownRival();
    const offer = core.islandMissionOffer(state, 'group-1', { kind: 'site', siteId: 'rival-pocket-1' }, 'Recon', [], context);
    assert.equal(offer.equipment, undefined);
    assert.equal(offer.successBps, 10000);
    assert.equal(offer.casualtyBps, 0);
    const legacy = structuredClone(state);
    delete legacy.smithery;
    const action = { type: 'DispatchIslandMission', groupId: 'group-1', target: { kind: 'site', siteId: 'rival-pocket-1' }, mission: 'Recon' };
    const current = advance(apply(state, action), 250), historical = advance(apply(legacy, action), 250);
    assert.equal(current.rngState, historical.rngState);
    assert.deepEqual(current.world.spatial.missions, historical.world.spatial.missions);
});

test('real slaughter funds a Leatherworker, preserves exact resource ledgers and names the actual creator', () => {
    const profile = { youngAdultAge: 1, adultAge: 2, adultFood: 1, youngFood: 0,
        femaleFoodPerWinter: 0, maleFoodPerWinter: 0, femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0,
        exposedProductivityBps: 5000, youngSlaughterFood: 2, youngAdultSlaughterFood: 4, slaughterFood: 8,
        birthChanceBps: 0, fertileMinAge: 2, fertileMaxAge: 6, birthInterval: 2,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], crowdingBps: 200, weatherMortalityBps: 0, capacityWeightBps: 10000 };
    const rules = { version: 2, profiles: Object.fromEntries(['chicken', 'pig', 'sheep', 'goat', 'goose'].map(id => [id, profile])),
        founding: { version: 1 }, breeding: { requireFed: true, capacityLimited: true, unassignedCapacityUnits: 40000 },
        hides: { cattle: 1, chicken: 0, pig: 1, sheep: 1, goat: 1, goose: 0 } };
    let state = core.createCampaign(32, { initialFood: 500, initialMaterials: 200 }, {
        workPerUnit: 100000, switchTicks: 0, fertilityChanceBps: 0, partnershipChanceBps: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }],
    }, { enabled: false }, {}, {}, {}, undefined, undefined, { player: rules });
    for (const id of Object.keys(state.personas)) state = core.applyCommand(state,
        { type: 'AssignOccupation', personaId: id, occupation: id === 'founder-1' ? 'leatherAndJewelleryMaker' : null });
    // Choose an actual mature hide-bearing animal using the saved founding species, not an invented Hide button.
    const animal = Object.values(state.landing.cattle)[0], species = animal.species;
    const expectedHides = rules.hides[species];
    assert.ok(expectedHides > 0, 'Fixed seed 32 must provide a hide-bearing founding species');
    const opening = { ...state.stocks }, start = state.events.length;
    state = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: animal.id });
    assert.equal(state.specialistStocks.hides, expectedHides);
    assert.throws(() => core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: animal.id }));
    const slaughter = state.events.at(-1);
    assert.equal(slaughter.details.livestockId, animal.id);
    assert.equal(slaughter.details.livestock.animals[0].species, species);
    state = core.applyCommand(state, { type: 'SetSmitheryTarget', item: 'leatherShield', target: 1 });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 100 });
    assert.equal(state.smithery.stored.leatherShield, 1);
    assert.equal(state.specialistStocks.hides, expectedHides - 1);
    const ledger = bookLedger(state.events.slice(start), opening, state.stocks);
    assert.equal(ledger.materials.spending, 3);
    assert.equal(ledger.materials.complete, true);
    assert.equal(ledger.food.complete, true);
    const crafted = state.events.find(event => event.type === 'EquipmentCrafted');
    const chronicle = projectChronicle([crafted])[0].entries[0];
    assert.match(chronicle.text, new RegExp(state.personas['founder-1'].name));
    assert.match(chronicle.text, /Leather-reinforced Shield/);
    assert.deepEqual(chronicle.sourceEventIds, [crafted.id]);
});
