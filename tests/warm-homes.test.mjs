import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { load } from './load-source.mjs';
const { Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture } = createRequire(import.meta.url)('three');
const { HomeLighting } = load('../src/world/HomeLighting.ts');
const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
const { fjordLighting } = load('../src/config/FjordLighting.ts');
const { homeLightGeometry } = load('../src/world/HomeLightGeometry.ts');

test('UV binding gates whole triangles so filtering cannot illuminate adjacent atlas islands', () => {
    const source = new BoxGeometry(), indices = Array.from(source.index.array);
    const result = homeLightGeometry(source, [0]);
    assert.equal(result.index, null);
    assert.equal(source.hasAttribute('uv1'), false);
    assert.deepEqual(Array.from(source.index.array), indices);
    assert.deepEqual(result.groups, source.groups, 'No added draw groups');
    const emission = result.getAttribute('uv1'), original = source.getAttribute('uv');
    for (let vertex = 0; vertex < emission.count; vertex++) {
        assert.equal(emission.getX(vertex), vertex < 3 ? original.getX(indices[vertex]) : 0);
        assert.equal(emission.getY(vertex), vertex < 3 ? original.getY(indices[vertex]) : 0);
        const before = source.getAttribute('position'), after = result.getAttribute('position');
        assert.equal(after.getX(vertex), before.getX(indices[vertex]));
        assert.equal(after.getY(vertex), before.getY(indices[vertex]));
        assert.equal(after.getZ(vertex), before.getZ(indices[vertex]));
    }
    assert.throws(() => homeLightGeometry(result, [0]), /unused UV channel/);
    assert.throws(() => homeLightGeometry(source, [10000]), /does not match/);
    result.dispose(); source.dispose();
});

test('accepted Northern Light, unified sunlight and home glow are defaults while explicit comparisons remain available', () => {
    assert.deepEqual(fjordLighting(new URLSearchParams()), { northern: true, unified: true, warmHomes: true });
    assert.equal(fjordLighting(new URLSearchParams('lighting=northern-v1')).unified, true);
    assert.equal(fjordLighting(new URLSearchParams('sunlight=northern-v1')).unified, false);
    assert.equal(fjordLighting(new URLSearchParams('lighting=baseline')).northern, false);
    assert.equal(fjordLighting(new URLSearchParams('sunlight=unified-v1')).northern, true);
    assert.equal(fjordLighting(new URLSearchParams('homes=warm-v1')).warmHomes, true);
    assert.equal(fjordLighting(new URLSearchParams('homes=baseline')).warmHomes, false);
    assert.deepEqual(fjordLighting(new URLSearchParams('lighting=baseline&homes=baseline')),
        { northern: false, unified: false, warmHomes: false });
});

test('inhabited emission borrows shared darkness, stays instance-owned, and releases no source resource', async () => {
    const geometry = new BoxGeometry(), source = new MeshStandardMaterial(), mask = new Texture();
    let maskDisposals = 0, materialDisposals = 0;
    mask.addEventListener('dispose', () => maskDisposals++);
    const models = {
        async create(entity) {
            const model = new Group(), house = new Group(); house.name = entity.asset;
            house.add(new Mesh(geometry, source)); model.add(house); return model;
        },
        async reconcile(model, entity) { model.userData.canonical = entity.status; },
        release() { return false; }, boundsShape() { return ''; },
    };
    const maps = new Map([['homestead', mask], ['longhouse', mask]]);
    const layer = new FjordEntities(models, undefined, maps);
    const entity = (id, inhabited, asset = 'homestead') => ({ kind: 'building', id, selectionKey: 'building:' + id,
        asset, transform: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 }, status: { living: true, inhabited } });
    const first = entity('a', true), second = entity('b', false);
    layer.setHomeDarkness(.5);
    await layer.sync([first, second]);
    const material = layer.root.children[0].getObjectByProperty('isMesh', true).material;
    material.addEventListener('dispose', () => materialDisposals++);
    const binding = layer.entries.get('building:a').homeLight;
    assert.equal(layer.inspectHomeLighting()[0].intensity, 1.2);
    assert.equal(layer.inspectHomeLighting()[1].intensity, 0);
    assert.equal(source.emissiveIntensity, 1);
    assert.equal(source.emissiveMap, null);
    assert.notEqual(material, source);
    assert.equal(material.emissiveMap, mask);
    const before = material.version;
    layer.root.traverse = () => { throw new Error('Frame-wide scan'); };
    for (let i = 0; i <= 60; i++) layer.setHomeDarkness(i / 60);
    assert.equal(material.version, before, 'Only a scalar changes during the smooth transition');
    assert.equal(material.emissiveIntensity, 2.4);
    await layer.sync([entity('a', false), second]);
    assert.equal(layer.entries.get('building:a').homeLight, binding, 'Occupancy reuses the material binding');
    assert.equal(material.emissiveIntensity, 0);
    await layer.sync([entity('a', true, 'longhouse')]);
    assert.equal(materialDisposals, 1, 'Upgrade releases the old instance material');
    assert.equal(binding.inspect().materials, 0);
    assert.equal(layer.inspectHomeLighting()[0].intensity, 2.4, 'New model inherits displayed darkness');
    await layer.sync([]);
    assert.equal(layer.inspectHomeLighting().length, 0);
    layer.dispose();
    assert.equal(maskDisposals, 0);
    assert.equal(source.emissiveMap, null);
    source.dispose(); geometry.dispose(); mask.dispose();
});

test('native home emission composes with the existing snow owner and restores borrowed bindings', () => {
    const { StructureSeasonTint } = load('../src/world/StructureSeasonTint.ts');
    const geometry = new BoxGeometry(), source = new MeshStandardMaterial(), mask = new Texture();
    const root = new Group(), mesh = new Mesh(geometry, source); root.add(mesh);
    const season = new StructureSeasonTint(root), glow = new HomeLighting(root, mask);
    glow.setInhabited(true); glow.setDarkness(1); season.setSnowAmount(.65);
    const shader = { uniforms: {}, vertexShader: '#include <defaultnormal_vertex>', fragmentShader: '#include <color_fragment>' };
    mesh.material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.structureSnowAmount.value, .65);
    assert.equal(mesh.material.emissiveIntensity, 2.4);
    glow.dispose(); season.dispose();
    assert.equal(mesh.material, source);
    source.dispose(); geometry.dispose(); mask.dispose();
});

test('canonical household assignment gates real occupied homes and immediately clears vacancy', () => {
    const { warmHomeFixture } = load('../scripts/qa/warm-homes-256-fixtures.ts');
    const shared = warmHomeFixture(0);
    const state = shared.session.readSnapshot(), before = shared.session.saveJSON();
    const projection = shared.fjord.project();
    for (const asset of ['homestead', 'longhouse', 'greatHall', 'farmHut', 'farmHomestead'])
        assert.equal(projection.entities.find(entity => entity.asset === asset).status.inhabited, true);
    assert.equal(shared.session.saveJSON(), before, 'Presentation cannot mutate Core');
    const household = Object.values(state.households).find(home =>
        state.residences[home.residenceId]?.buildingId === 'house-1');
    shared.command({ type: 'AssignResidence', householdId: household.id, residenceId: null });
    assert.equal(shared.fjord.project().entities.find(entity => entity.id === 'house-1').status.inhabited, false);
    shared.command({ type: 'SalvageBuilding', buildingId: 'house-1' });
    assert.equal(shared.fjord.project().entities.some(entity => entity.id === 'house-1'), false);
});

test('localized native emissive maps remain bound to exact authored GLBs with bounded coverage', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const directory = new URL('../public/game-assets/houses/', import.meta.url);
    const houses = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
    const manifest = JSON.parse(await readFile(new URL('lights/manifest.json', directory), 'utf8'));
    assert.deepEqual(Object.keys(manifest.assets).sort(), ['farmHut', 'homestead', 'longhouse']);
    assert.deepEqual(Object.keys(manifest.unsupported).sort(), ['farmHomestead', 'greatHall', 'hut', 'tent']);
    for (const [key, entry] of Object.entries(manifest.assets)) {
        const bytes = await readFile(new URL(houses.assets[key].file, directory));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.glbSha256);
        assert.equal(entry.windows.length, entry.regions.length);
        for (const window of entry.windows) {
            assert.equal(window.position.length, 3);
            assert.ok(window.position.every(Number.isFinite));
            assert.ok(window.position[1] > 0 && window.position[1] < houses.assets[key].bounds.max[1]);
            assert.equal(Math.hypot(...window.outward), 1);
            assert.equal(window.outward[1], 0);
        }
        const document = await io.readBinary(bytes);
        for (const binding of entry.bindings) {
            const node = document.getRoot().listNodes().find(node => node.getName() === binding.node);
            const primitive = node.getMesh().listPrimitives()[0];
            assert.equal(primitive.getIndices().getCount(), binding.triangleCount * 3);
            assert.equal(primitive.getAttribute('TEXCOORD_1'), null);
            assert.ok(binding.triangles.length > 0 && binding.triangles.length < binding.triangleCount * .02);
            assert.ok(binding.triangles.every(index => index >= 0 && index < binding.triangleCount));
        }
        const { data, info } = await sharp(await readFile(new URL('lights/' + entry.file, directory)))
            .greyscale().raw().toBuffer({ resolveWithObject: true });
        assert.equal(info.width, 512); assert.equal(info.height, 512);
        const emitting = data.filter(value => value > 0).length;
        assert.ok(emitting > 0 && emitting < data.length * .005, key + ' localized aperture coverage');
    }
});

test('hidden and mapped-only rival housing never forwards live occupancy to the renderer', () => {
    const core = load('../src/simulation/SimulationCore.ts');
    const { inspectRivalSettlement, projectRivalSettlement } = load('../src/fjord-play/RivalSettlement.ts');
    const { commitClanObservation } = load('../src/simulation/ClanDiscovery.ts');
    const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
    const world = { config: { seed: 32 }, waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
        navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 352, z: 128 },
            bounds: { minX: 288, maxX: 416, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 16384 } };
    const worldId = 'warm-home-visibility';
    let state = core.initializeIslandClans(core.createCampaign(32), world, worldId);
    const id = state.world.island.clanId;
    state.world.targetClans[id].stocks.materials = 100; // Fund only this isolated visibility fixture.
    const household = Object.values(state.world.targetClans[id].households)[0];
    state.world.targetClans[id] = core.applyCommand(state.world.targetClans[id],
        { type: 'BuildHouse', householdId: household.id });
    const prepared = projectRivalSettlement(state.world.targetClans[id], world);
    const house = prepared.entities.find(entity => entity.kind === 'building');
    assert.equal(house.status.inhabited, true);
    assert.deepEqual(inspectRivalSettlement(state, world, prepared).entities, []);
    state.discovery = commitClanObservation(state.discovery, world, worldId, state.clan.id,
        [{ id: 'scout', kind: 'expedition', x: house.transform.x, z: house.transform.z }], 800001);
    const visible = inspectRivalSettlement(state, world, prepared);
    assert.equal(visible.entities.find(entity => entity.id === house.id).status.inhabited, true);
    const observedHouse = visible.entities.find(entity => entity.id === house.id);
    assert.equal(observedHouse.label, 'Observed house');
    for (const field of ['householdId', 'memberIds', 'residenceId']) {
        assert.equal(Object.hasOwn(observedHouse, field), false);
        assert.equal(Object.hasOwn(observedHouse.status, field), false, 'Only the visible occupancy boolean is forwarded');
    }
    state.discovery = commitClanObservation(state.discovery, world, worldId, state.clan.id, [], 800002);
    const mapped = inspectRivalSettlement(state, world, prepared);
    assert.equal(mapped.currentlyObserved, false);
    assert.deepEqual(mapped.entities, []);
    const changed = { ...prepared, entities: prepared.entities.map(entity =>
        entity.id === house.id ? { ...entity, status: { ...entity.status, inhabited: false } } : entity) };
    assert.deepEqual(inspectRivalSettlement(state, world, changed), mapped);
});


test('home light bindings restore after an upgrade fade and when the scene closes during construction', async () => {
    for (const complete of [true, false]) {
        const geometry = new BoxGeometry(6, 4, 5), source = new MeshStandardMaterial(), mask = new Texture();
        const created = [], released = [], boundMaterials = [];
        const models = {
            async create(entity) {
                const root = new Group(), house = new Group();
                house.name = entity.asset;
                house.add(new Mesh(geometry, source));
                root.add(house); created.push(root); return root;
            },
            async reconcile(model) { boundMaterials.push(model.getObjectByProperty('isMesh', true).material); },
            boundsShape() { return ''; },
            release(model) { released.push(model); return true; },
        };
        const layer = new FjordEntities(models, undefined,
            new Map([['homestead', mask], ['longhouse', mask]]));
        const entity = (asset, level) => ({ kind: 'building', id: 'home', selectionKey: 'building:home',
            asset, transform: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 },
            status: { living: true, inhabited: true, level } });
        try {
            layer.setHomeDarkness(1);
            await layer.sync([entity('homestead', 0)]);
            const oldMaterial = boundMaterials[0];
            assert.equal(oldMaterial.emissiveMap, mask);
            await layer.sync([entity('longhouse', 1)]);
            const nextMaterial = boundMaterials[1];
            assert.equal(layer.inspectConstruction().length, 1);
            assert.equal(nextMaterial.emissiveMap, mask);
            if (complete) {
                for (let frame = 0; frame < 40; frame++) layer.updateConstruction(.1);
                assert.equal(layer.inspectConstruction().length, 0);
                assert.equal(oldMaterial.emissiveMap, null, 'The old binding restores before its model is released');
                assert.equal(nextMaterial.emissiveMap, mask, 'The completed occupied home retains its own binding');
            }
            layer.dispose();
            assert.equal(oldMaterial.emissiveMap, null);
            assert.equal(nextMaterial.emissiveMap, null);
            assert.equal(released.filter(model => model === created[0]).length, 1);
            assert.equal(released.filter(model => model === created[1]).length, 1);
            assert.equal(source.emissiveMap, null);
            assert.equal(source.emissive.getHex(), 0, 'Shared source material remains unlit');
        } finally {
            if (released.length < created.length) layer.dispose();
            geometry.dispose(); source.dispose(); mask.dispose();
        }
    }
});
