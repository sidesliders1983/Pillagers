import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('new island campaigns deterministically select a curated geography without changing the Core seed', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const first = new SharedSettlement(32, 123, true, 'island-pool-v1');
    const second = new SharedSettlement(32, 123, true, 'island-pool-v1');
    const world = first.fjord.blueprint;
    assert.equal(world.config.preset, 'island');
    assert.equal(world.config.generatorVersion, 'fjordside-island-v0.3e-r3');
    assert.equal(world.config.width, 800);
    assert.equal(first.session.snapshot().seed, 32);
    assert.ok([18, 7].includes(world.config.seed));
    assert.deepEqual(second.fjord.blueprint, world);
    assert.equal(first.session.saveJSON(), second.session.saveJSON());
    const projected = first.fjord.project();
    assert.equal(projected.entities.filter(e => e.kind === 'persona').length, 10);
    assert.ok(projected.entities.every(e => e.transform), projected.diagnostics.join('\n'));
    assert.deepEqual(projected.diagnostics, []);
});

test('island save, local storage, handoff and restarts retain the pinned compact recipe and actual world', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const first = new SharedSettlement(32, 123, true, 'island-pool-v1');
    first.select({ kind: 'persona', id: 'founder-1' });
    first.command({ type: 'AdvanceTicks', ticks: 7 });
    const save = first.fjord.exportJSON();
    assert.ok(save.length < 1_000_000, 'geography must fit browser storage without derived terrain arrays');
    assert.equal(JSON.parse(save).island.version, 'island-pool-v1');
    const loaded = SharedSettlement.restore(first.persist(), 'fjord');
    assert.equal(loaded.fjord.exportJSON(), save);
    assert.deepEqual(loaded.fjord.blueprint, first.fjord.blueprint);
    const board = SharedSettlement.restore(first.handoff('board'), 'board');
    assert.equal(board.session.saveJSON(), first.session.saveJSON());
    assert.deepEqual(board.fjord.layout, first.fjord.layout);
    const before = board.persist();
    const invalid = JSON.parse(save);
    invalid.island.seed = 999;
    assert.throws(() => board.importJSON(JSON.stringify(invalid)), /recipe/);
    assert.equal(board.persist(), before, 'bad geography imports are transactional');
    board.restart(true);
    assert.equal(board.session.snapshot().time.tick, 0);
    assert.deepEqual(board.fjord.blueprint, first.fjord.blueprint);
    board.newCampaign(33, true);
    assert.equal(board.session.snapshot().seed, 33);
    assert.notEqual(board.fjord.blueprint.config.seed, first.fjord.blueprint.config.seed);
    assert.equal(board.fjord.blueprint.config.preset, 'island');
    const records = new Map();
    const storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
    board.saveLocal(storage);
    loaded.loadLocal(storage);
    assert.equal(loaded.fjord.exportJSON(), board.fjord.exportJSON());
});

test('both curated islands support ten independent homes, Farmyards, paths and the real longship berth', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const core = load('../src/simulation/SimulationCore.ts');
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    const { harborDepth } = load('../src/world-generation/HarborClearance.ts');
    const { campaignIslandPlan } = load('../src/fjord-play/CampaignIsland.ts');
    for (const seed of [32, 33]) {
        const shared = new SharedSettlement(seed, 123, true, 'island-pool-v1');
        const state = core.createCampaign(seed, { foundingCoupleCap: 0, initialMaterials: 10000 });
        shared.importJSON(core.serializeState(state));
        const view = shared.fjord.project(), world = shared.fjord.blueprint;
        const plan = campaignIslandPlan(world), surface = createBlueprintSurface(world);
        assert.equal(view.entities.filter(e => e.kind === 'household' && e.transform).length, 10);
        assert.ok(view.entities.every(e => e.transform), view.diagnostics.join('\n'));
        assert.ok(plan.maximumAdjustment <= .600001);
        const ship = view.entities.find(e => e.kind === 'longship').transform;
        assert.ok(harborDepth(world, { ...plan.berth, center: ship, rotation: ship.rotation }) >= .5,
            'the displayed longship, including its full hull, must use the approved deep berth');
        for (const plot of Object.values(view.layout.plots)) {
            const b = world.settlement.bounds;
            assert.ok(plot.x - 7.5 >= b.minX && plot.x + 7.5 <= b.maxX);
            assert.ok(plot.z - 7.5 >= b.minZ && plot.z + 7.5 <= b.maxZ);
            for (const dx of [-7.5, 0, 7.5]) for (const dz of [-7.5, 0, 7.5]) {
                assert.ok(Math.abs(surface.surfaceHeightAt(plot.x + dx, plot.z + dz) - plot.y) < .000001);
            }
        }
        for (const householdId of Object.keys(state.households)) shared.command({ type: 'BuildHouse', householdId });
        shared.command({ type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
        shared.command({ type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' });
        shared.command({ type: 'SpecializeBuilding', buildingId: 'house-2', occupation: 'woodworker' });
        shared.command({ type: 'UpgradeBuilding', buildingId: 'house-2' });
        shared.command({ type: 'UpgradeBuilding', buildingId: 'house-2' });
        const built = shared.fjord.project();
        assert.equal(built.entities.filter(e => e.kind === 'building' && e.transform).length, 10);
        assert.equal(built.ground.paths.length, 10);
        assert.ok(built.entities.every(e => e.transform), built.diagnostics.join('\n'));
        assert.equal(built.entities.find(e => e.id === 'house-1').status.farmyard, true);
        const saved = shared.fjord.exportJSON();
        const restored = SharedSettlement.restore(shared.persist(), 'fjord');
        assert.equal(restored.fjord.exportJSON(), saved);
    }
});
