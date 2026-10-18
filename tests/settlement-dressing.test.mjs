import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { getBounds } from '@gltf-transform/functions';
import { terrainIO } from '../scripts/terrain-io.mjs';
import { load } from './load-source.mjs';

// The TS harness loads CommonJS. Use the same Three constructors for instanceof ownership checks.
const { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial } = createRequire(import.meta.url)('three');

const { dressingAssetKeys, dressingBudgets, dressingHomes, planSettlementDressing, visibleDressing } =
    load('../src/fjord-play/SettlementDressing.ts');
const { SettlementDressingLayer } = load('../src/fjord-play/SettlementDressingLayer.ts');
const { StructureSeasonTint } = load('../src/world/StructureSeasonTint.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { inspectClanDiscovery } = load('../src/simulation/ClanDiscovery.ts');
const { terrainModels } = load('../src/config/TerrainAssets.ts');

const sources = {};
const io = await terrainIO();
for (const key of dressingAssetKeys) {
    const path = key.startsWith('kaykit-') ? 'nature/kaykit-v1/' + key + '.gltf'
        : 'terrain/' + terrainModels[key] + '.glb';
    const document = await io.read(fileURLToPath(new URL('../public/' + path, import.meta.url)));
    const { min, max } = getBounds(document.getRoot().listScenes()[0]);
    sources[key] = { minX: (min[0] - max[0]) / 2, maxX: (max[0] - min[0]) / 2,
        minZ: (min[2] - max[2]) / 2, maxZ: (max[2] - min[2]) / 2, height: max[1] - min[1] };
}
const houseManifest = JSON.parse(readFileSync(new URL('../public/game-assets/houses/manifest.json', import.meta.url)));
for (const [key, entry] of Object.entries(houseManifest.assets)) {
    const { min, max } = entry.bounds;
    sources[key] = { minX: (min[0] - max[0]) / 2, maxX: (max[0] - min[0]) / 2,
        minZ: (min[2] - max[2]) / 2, maxZ: (max[2] - min[2]) / 2, height: max[1] - min[1] };
}
sources.tent = { minX: -.94, maxX: .94, minZ: -1, maxZ: 1, height: 1.5 };

function flatWorld(height = 5) {
    return { waterLevel: 0, placementPlan: [], terrain: { bounds: { minX: -80, maxX: 80,
        minZ: -80, maxZ: 80 }, columns: 41, rows: 41, spacing: 4, heights: Array(41 * 41).fill(height) } };
}
function home(key = 'house', asset = 'hut', x = 0, z = 0) {
    const transform = { x, y: 5, z, rotation: 0, scale: 1 };
    return { key, asset, transform, plot: { ...transform, halfWidth: 7.5, halfDepth: 7.5 },
        occupied: true, farmyard: false, work: ['fisher'] };
}
function input(homes = [home()]) {
    return { seed: 17, homes, ground: { plots: [], paths: [] }, campfire: {
        id: 'fire', transform: { x: 35, y: 5, z: 35, rotation: 0, scale: 2 },
        clearingRadius: 7, obstacleRadius: 4.4 } };
}
const intersects = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

test('source-bounded props fit non-walkable house parcels, keep doors free and follow actual work', () => {
    const fixture = input(), world = flatWorld();
    const plan = planSettlementDressing(world, fixture, sources);
    assert.deepEqual(plan.filter(p => p.kind === 'prop').map(p => p.asset), ['crate', 'barrel', 'logs', 'fish']);
    for (const item of plan.filter(p => p.kind === 'prop')) {
        assert.ok(item.bounds.minX > -7 && item.bounds.maxX < 7 && item.bounds.minZ > -7 && item.bounds.maxZ < 7);
        assert.ok(!intersects(item.bounds, sources.hut), 'Original source walls remain clear');
        assert.ok(item.z < 1, 'The front door and approach stay open');
    }
    fixture.homes[0].work = ['smith'];
    assert.ok(!planSettlementDressing(world, fixture, sources).some(p => p.asset === 'fish'));
    for (const rotation of [Math.PI / 4, .9, Math.PI / 2, Math.PI]) {
        fixture.homes[0].transform.rotation = fixture.homes[0].plot.rotation = rotation;
        assert.ok(planSettlementDressing(world, fixture, sources).some(p => p.asset === 'logs'),
            'Diagonal source walls must not acquire the empty corners of their world AABB');
    }
    fixture.homes[0].transform.rotation = fixture.homes[0].plot.rotation = 0;
    fixture.homes[0].asset = 'tent';
    assert.deepEqual(planSettlementDressing(world, fixture, sources).filter(p => p.kind === 'prop')
        .map(p => p.asset), ['crate', 'barrel']);
    fixture.homes[0].occupied = false;
    assert.equal(planSettlementDressing(world, fixture, sources).filter(p => p.kind === 'prop').length, 0);
    fixture.homes[0].farmyard = true;
    const yard = { minX: -7.8, maxX: 7.8, minZ: -7.8, maxZ: 7.8 };
    assert.ok(planSettlementDressing(world, fixture, sources).every(p => !intersects(p.bounds, yard)),
        'Authored farmyard props, fences and cattle routes retain sole ownership');
});

test('unsafe water, grade, path, small plot and missing-source slots are rejected rather than forced', () => {
    const fixture = input();
    assert.deepEqual(planSettlementDressing(flatWorld(.1), fixture, sources), []);
    const steep = flatWorld();
    steep.terrain.heights = steep.terrain.heights.map((_, i) => 80 + (i % 41 - 20) * 3);
    assert.equal(planSettlementDressing(steep, fixture, sources).length, 0);
    fixture.homes[0].plot.halfWidth = fixture.homes[0].plot.halfDepth = 2;
    assert.equal(planSettlementDressing(flatWorld(), fixture, sources).filter(p => p.kind === 'prop').length, 0);
    const without = { ...sources }; delete without.fish;
    assert.ok(!planSettlementDressing(flatWorld(), input(), without).some(p => p.asset === 'fish'));
    fixture.homes[0] = home();
    fixture.ground.paths = [{ from: 'house', to: 'fire', points: [{ x: -30, z: -2 }, { x: 30, z: -2 }] }];
    assert.ok(planSettlementDressing(flatWorld(), fixture, sources).every(p => Math.abs(p.z + 2) > 1.8),
        'The full line segment is protected, not only path vertices');
});

test('stable slots and quality subsets remain deterministic without touching input, RNG or canonical nature', () => {
    const fixture = input([home('a'), home('b', 'hut', 20), home('c', 'hut', -20)]);
    const world = flatWorld();
    const original = JSON.stringify([fixture, world]);
    const plan = planSettlementDressing(world, fixture, sources);
    assert.deepEqual(planSettlementDressing(world, { ...fixture, homes: [...fixture.homes].reverse() }, sources), plan);
    assert.deepEqual(planSettlementDressing(world, structuredClone(fixture), sources), plan);
    assert.notDeepEqual(planSettlementDressing(world, { ...fixture, seed: 32 }, sources), plan);
    const low = visibleDressing(plan, 'low'), standard = visibleDressing(plan, 'standard');
    const ids = new Set(standard.map(p => p.id));
    assert.ok(low.every(p => ids.has(p.id)));
    for (const [quality, selected] of [['low', low], ['standard', standard]]) {
        assert.ok(selected.filter(p => p.kind === 'prop').length <= dressingBudgets[quality].props);
        assert.ok(selected.filter(p => p.kind === 'cover').length <= dressingBudgets[quality].cover);
    }
    assert.equal(JSON.stringify([fixture, world]), original);
});

test('unknown terrain hides all dressing; mapped terrain has no live household or work props', () => {
    const world = flatWorld(), fixture = input();
    const plan = planSettlementDressing(world, fixture, sources);
    const discovery = { version: 1, worldId: 'fixture', cellSize: 8,
        grid: { bounds: world.terrain.bounds, columns: 20, rows: 20 }, explored: '00'.repeat(50), visible: '00'.repeat(50) };
    assert.deepEqual(visibleDressing(plan, 'standard', discovery), []);
    discovery.explored = 'ff'.repeat(50);
    const mapped = visibleDressing(plan, 'standard', discovery);
    assert.ok(mapped.length > 0);
    assert.ok(mapped.every(p => p.kind === 'cover'));
    discovery.visible = 'ff'.repeat(50);
    assert.ok(visibleDressing(plan, 'standard', discovery).some(p => p.kind === 'prop'));
});

test('household facts ignore stocks, aging, births and private rival changes but follow vacancy and moves', () => {
    const first = home('building:one'), second = home('building:two', 'hut', 20);
    const entities = [first, second].map(h => ({ ...h, id: h.key.split(':')[1],
        selectionKey: h.key, kind: 'building', status: { living: true } }));
    const state = { households: { home: { id: 'home', residenceId: 'residence', memberIds: ['adult'] } },
        residences: { residence: { kind: 'house', buildingId: 'one' } },
        personas: { adult: { occupation: 'smith', deathWinter: null, age: 30 } },
        stocks: { food: 15, materials: 5 }, world: { targetClans: { rival: { stocks: { food: 999 } } } } };
    const facts = dressingHomes(state, entities);
    state.stocks.food = 200;
    state.personas.adult.age++;
    state.personas.baby = { occupation: null, deathWinter: null, age: 0 };
    state.households.home.memberIds.push('baby');
    state.world.targetClans.rival.stocks.food = 0;
    assert.deepEqual(dressingHomes(state, entities), facts, 'No layout rebuild for unrelated ticks/private data');
    state.residences.residence.buildingId = 'two';
    const moved = dressingHomes(state, entities);
    assert.equal(moved[0].occupied, false);
    assert.equal(moved[1].occupied, true);
    state.personas.adult.deathWinter = 801;
    state.personas.baby.deathWinter = 801;
    assert.ok(dressingHomes(state, entities).every(h => !h.occupied));
});

test('low foliage frost covers vertical blades while existing roof snow retains upward-only coverage', () => {
    const material = new MeshStandardMaterial(), geometry = new BoxGeometry(1, 1, 1);
    const roof = new Mesh(geometry, material), foliage = new Mesh(geometry, material);
    const roofSnow = new StructureSeasonTint(roof), frost = new StructureSeasonTint(foliage, 'all');
    const shader = () => ({ uniforms: {}, vertexShader: '#include <defaultnormal_vertex>',
        fragmentShader: '#include <color_fragment>' });
    const roofShader = shader(), leafShader = shader();
    roof.material.onBeforeCompile(roofShader);
    foliage.material.onBeforeCompile(leafShader);
    assert.match(roofShader.fragmentShader, /smoothstep\(0.25, 0.8/);
    assert.match(leafShader.fragmentShader, /structureSnowMask = 1.0/);
    assert.notEqual(roof.material.customProgramCacheKey(), foliage.material.customProgramCacheKey());
    frost.update(0);
    assert.equal(leafShader.uniforms.structureSnowAmount.value, .65);
    frost.update(.5);
    assert.equal(leafShader.uniforms.structureSnowAmount.value, 0);
    roofSnow.dispose(); frost.dispose();
    assert.equal(roof.material, material);
    assert.equal(foliage.material, material);
    geometry.dispose(); material.dispose();
});

test('real island campaigns and restored layouts retain identical Core, terrain, discovery and navigation', () => {
    for (const seed of [17, 32]) {
        const shared = new SharedSettlement(seed, 123, true, 'island-pool-v1', 'summer-800-v1');
        shared.fjord.enableDiscovery();
        shared.session.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
        const state = shared.session.readSnapshot();
        const homes = Object.values(state.households);
        const farmer = homes.find(h => h.memberIds.some(id => state.personas[id].occupation === 'farmer'));
        const other = homes.find(h => h.memberIds.every(id => state.personas[id].occupation !== 'farmer'));
        for (const household of [farmer, other]) shared.session.command({ type: 'BuildHouse', householdId: household.id });
        const view = shared.fjord.readProjection(), current = shared.session.readSnapshot();
        const fixture = { seed, homes: dressingHomes(current, view.entities), ground: view.ground, campfire: view.campfire };
        const before = shared.persist(), geography = JSON.stringify(shared.fjord.blueprint);
        const plan = planSettlementDressing(shared.fjord.blueprint, fixture, sources);
        const visible = visibleDressing(plan, 'standard', inspectClanDiscovery(current.discovery, current.clan.id));
        assert.ok(visible.filter(p => p.kind === 'prop').length >= 4, 'Paid village receives real reusable props');
        assert.ok(visible.filter(p => p.kind === 'cover').length >= 30, 'Both curated landscapes receive local edge cover');
        assert.ok(fixture.homes.some(h => h.farmyard));
        assert.ok(fixture.homes.some(h => h.asset === 'hut' && !h.farmyard));
        const restored = SharedSettlement.restore(before, 'fjord');
        const loaded = restored.fjord.readProjection();
        assert.deepEqual(planSettlementDressing(restored.fjord.blueprint, { seed,
            homes: dressingHomes(restored.session.readSnapshot(), loaded.entities),
            ground: loaded.ground, campfire: loaded.campfire }, sources), plan);
        assert.equal(shared.persist(), before);
        assert.equal(JSON.stringify(shared.fjord.blueprint), geography);
    }
});

test('unchanged ticks/season updates reuse buffers; ten quality/layout cycles release only owned resources', () => {
    const geometry = new BoxGeometry(1, 1, 1), material = new MeshStandardMaterial();
    const source = new Group(), mesh = new Mesh(geometry, material);
    mesh.position.y = .5; source.add(mesh); source.updateMatrixWorld(true);
    let sourceDisposed = 0, bufferDisposals = 0, materialDisposals = 0;
    geometry.addEventListener('dispose', () => sourceDisposed++);
    material.addEventListener('dispose', () => sourceDisposed++);
    const assets = { has: () => true, get: () => source.clone(true) };
    const layer = new SettlementDressingLayer(assets, flatWorld(), 'standard'), fixture = input();
    layer.sync(fixture);
    const initial = layer.inspect();
    const watchResources = () => layer.root.traverse(node => {
        if (!(node instanceof InstancedMesh) || node.userData.watched) return;
        node.userData.watched = true;
        node.addEventListener('dispose', () => bufferDisposals++);
        node.material.addEventListener('dispose', () => materialDisposals++);
    });
    watchResources();
    for (let tick = 0; tick < 20; tick++) {
        assert.equal(layer.sync(structuredClone(fixture)), false);
        layer.setSeason(tick / 20);
    }
    assert.equal(layer.inspect().planBuilds, initial.planBuilds);
    assert.equal(layer.inspect().batchBuilds, initial.batchBuilds);
    for (let cycle = 0; cycle < 10; cycle++) {
        layer.setQuality('low'); watchResources();
        layer.sync(input([])); watchResources();
        const upgraded = input([home('house', 'homestead', 20)]);
        layer.sync(upgraded); watchResources();
        layer.setQuality('standard');
        layer.sync(fixture); watchResources();
        assert.equal(layer.inspect().instances, initial.instances);
        assert.equal(layer.inspect().batches.length, initial.batches.length);
    }
    layer.dispose();
    assert.equal(layer.root.children.length, 0);
    assert.ok(bufferDisposals > 10);
    assert.ok(materialDisposals > 10);
    assert.equal(sourceDisposed, 0, 'AssetManager retains ownership of all source geometry/materials');
    layer.sync(fixture);
    assert.equal(layer.root.children.length, 0, 'A disposed layer cannot recreate buffers');
    geometry.dispose(); material.dispose();
});
