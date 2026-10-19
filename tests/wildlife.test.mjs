import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Box3, Vector3, AnimationMixer, PerspectiveCamera } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';
const { wildlifeSpecies } = load('../src/wildlife/WildlifeSpecies.ts');
const { WildlifePopulation } = load('../src/wildlife/WildlifePopulation.ts');
const { WildlifeLayer } = load('../src/wildlife/WildlifeLayer.ts');
const { wildlifeAssetManifest } = load('../src/wildlife/WildlifeAssetManifest.ts');
const { freezeBlueprint } = load('../src/world-generation/WorldBlueprint.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function worldFixture(seed = 213) {
    const bounds = { minX: -160, maxX: 160, minZ: -160, maxZ: 160 };
    const heights = [], cells = [], biomes = [], moisture = [], forest = [], rock = [];
    for (let z = -160; z <= 160; z += 4)
        for (let x = -160; x <= 160; x += 4) {
            const height = x < -92 ? -3 : (x + 80) * .25;
            heights.push(height);
            cells.push(height > .2);
            biomes.push(height < 0 ? 'water' : x < -60 ? 'shore' : x < 70 ? 'forest' : 'rock');
            moisture.push(.8);
            forest.push(x > -60 && x < 70 ? .7 : 0);
            rock.push(x > 70 || x < -60 ? .6 : .1);
        }
    const terrain = { bounds, spacing: 4, columns: 81, rows: 81, heights };
    return freezeBlueprint({
        config: { seed, width: 320, depth: 320 }, waterLevel: 0, terrain,
        navigation: { ...terrain, heights: undefined, cells },
        coast: [{ a: { x: -80, z: -160 }, b: { x: -80, z: 160 } }],
        settlement: { center: { x: -40, z: 0 }, harbor: { x: -80, z: 0 }, buildings: [], accessPaths: [], bounds },
        biomes: { cells: biomes, moisture, waterDistance: heights.map(h => Math.abs(h) * 4), worn: heights.map(() => 0), coverage: {} },
        environment: { spacing: 4, columns: 81, rows: 81, fields: { forestCover: forest, moisture, rockExposure: rock } },
        placementPlan: [],
    });
}
test('wildlife population is habitat driven, deterministic, complete and does not mutate geography', () => {
    const world = worldFixture(), before = JSON.stringify(world);
    const first = new WildlifePopulation(world), second = new WildlifePopulation(world);
    assert.equal(wildlifeSpecies.length, 10);
    assert.equal(first.actors.length, 26, JSON.stringify(first.diagnostics));
    assert.deepEqual(first.diagnostics, []);
    assert.deepEqual(first.inspect(), second.inspect());
    assert.notDeepEqual(first.inspect(), new WildlifePopulation(worldFixture(214)).inspect());
    assert.equal(JSON.stringify(world), before);
    for (const species of wildlifeSpecies)
        for (const variant of species.variants) {
            assert.equal(first.actors.filter(a => a.species === species.id && a.variant.id === variant.id).length, variant.count);
        }
    assert.equal(first.actors.filter(a => a.species === 'great-black-backed-gull' && a.variant.movement === 'air').length, 6);
    assert.equal(first.actors.filter(a => a.species === 'great-black-backed-gull' && a.variant.movement === 'shore').length, 3);
});
test('ground, alpine, marine and airborne constraints survive roaming; pause and camera do not respawn fauna', () => {
    const population = new WildlifePopulation(worldFixture());
    const initial = population.actors.map(a => ({ id: a.id, anchor: { ...a.anchor } }));
    const airborne = population.actors.filter(a => a.variant.movement === 'air');
    assert.ok(new Set(airborne.map(a => a.phase.toFixed(3))).size > 4);
    assert.ok(new Set(airborne.map(a => a.speed.toFixed(3))).size > 4);
    let walked = false;
    for (let frame = 0; frame < 240; frame++) {
        population.advance(.25, true);
        for (const actor of population.actors) {
            const { x, y, z } = actor.position, v = actor.variant;
            assert.ok([x, y, z].every(Number.isFinite));
            assert.ok(population.habitats.inBounds(actor.position));
            if (v.movement === 'air') {
                assert.ok(y >= Math.max(population.world.waterLevel, population.habitats.surface.surfaceHeightAt(x, z)) + 11.99);
            }
            else {
                assert.ok(population.habitats.valid(actor.position, v), actor.id + ' left its habitat');
                if (actor.species === 'reindeer')
                    assert.ok(y >= population.habitats.alpineHeight);
                if (v.movement === 'water')
                    assert.equal(y, 0);
                else
                    assert.equal(y, population.habitats.surface.surfaceHeightAt(x, z));
                walked ||= actor.state === 'roam';
            }
        }
    }
    assert.ok(walked);
    const paused = population.inspect();
    population.advance(1, false);
    assert.deepEqual(population.inspect(), paused);
    assert.deepEqual(population.actors.map(a => ({ id: a.id, anchor: a.anchor })), initial);
    assert.throws(() => population.advance(NaN, true), /delta/);
    assert.throws(() => population.advance(-1, true), /delta/);
});
test('movement checks full segments and dynamic building footprints rather than only endpoints', () => {
    const population = new WildlifePopulation(worldFixture()), v = wildlifeSpecies[1].variants[0];
    const from = { x: 30, z: 80 }, to = { x: 65, z: 80 };
    assert.ok(population.habitats.segmentValid(from, to, v));
    population.habitats.setObstacles([{ x: 47, z: 80, halfWidth: 4, halfDepth: 10, rotation: 0 }]);
    assert.ok(population.habitats.valid(from, v));
    assert.ok(population.habitats.valid(to, v));
    assert.equal(population.habitats.segmentValid(from, to, v), false);
});
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() { } });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const sourceCache = new Map();
const released = [];
const sources = {
    async acquire(id) {
        if (!sourceCache.has(id))
            sourceCache.set(id, (async () => {
                const entry = wildlifeAssetManifest.find(item => item.id === id);
                const bytes = await readFile('public' + entry.path);
                return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
            })());
        return sourceCache.get(id);
    },
    release(id) { released.push(id); },
};
test('compact exports pin source identities, canonical scales, source rigs and the two actual walk clips', async () => {
    assert.equal(wildlifeAssetManifest.length, 11);
    for (const entry of wildlifeAssetManifest) {
        const bytes = await readFile('public' + entry.path);
        assert.equal(hash(bytes), entry.sha256);
        assert.ok(bytes.length < 200000, entry.id);
        assert.ok(entry.triangles < 5500);
        const source = await sources.acquire(entry.id);
        const box = new Box3().setFromObject(source.scene, true);
        assert.ok(box.getSize(new Vector3()).toArray().every(value => Number.isFinite(value) && value > .1));
        source.scene.traverse(node => {
            if (!node.isMesh)
                return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                assert.equal(material.normalMap, null);
                assert.ok(material.emissive.toArray().every(value => value === 0));
                if (material.map)
                    assert.ok(material.map.image.width <= 512);
            }
        });
        if (entry.id === 'gull-flying')
            assert.ok(Math.abs(box.getSize(new Vector3()).x - 1.6) < .002);
        if (['puffin', 'gull-standing'].includes(entry.id))
            assert.ok(Math.abs(box.getSize(new Vector3()).y - entry.scaleReference.metres) < .002);
        if (entry.id === 'bear' || entry.id === 'wolf') {
            assert.match(entry.source, /animate/);
            assert.ok(entry.joints >= 27);
            assert.equal(source.animations[0].name, 'Walk');
            assert.ok(Math.abs(source.animations[0].duration - 1) < .001);
            const mixer = new AnimationMixer(source.scene), hip = source.scene.getObjectByName('Hips');
            mixer.clipAction(source.animations[0]).play();
            const positions = [];
            for (const time of [0, .2, .5, .8]) {
                mixer.setTime(time);
                source.scene.updateMatrixWorld(true);
                positions.push(hip.getWorldPosition(new Vector3()));
            }
            for (const point of positions)
                assert.ok(Math.hypot(point.x - positions[0].x, point.z - positions[0].z) < .002);
            mixer.stopAllAction();
        }
    }
});
test('world wildlife shares render resources, owns independent rigs, respects discovery, and releases leases once', async () => {
    const first = await WildlifeLayer.create(worldFixture(), () => true, sources);
    const second = await WildlifeLayer.create(worldFixture(), () => false, sources);
    try {
        assert.equal(first.inspect().instances, 26);
        assert.equal(first.inspect().sharedAssets, 11);
        assert.equal(second.inspect().rendered, 0);
        const meshes = layer => {
            const result = [];
            layer.root.traverse(node => { if (node.isSkinnedMesh)
                result.push(node); });
            return result;
        };
        const a = meshes(first)[0], b = meshes(second)[0];
        assert.equal(a.geometry, b.geometry);
        assert.equal(a.material, b.material);
        assert.notEqual(a.skeleton, b.skeleton);
        assert.notEqual(a.skeleton.bones[0], b.skeleton.bones[0]);
        const initial = first.population.actors.map(actor => actor.id);
        const camera = new PerspectiveCamera(45,1,.1,10);
        camera.position.set(100000,100,100000);
        camera.lookAt(100100,100,100100);
        const populationBeforeCamera=first.population.inspect();
        first.advance(0,false,camera);
        assert.equal(first.inspect().rendered,0);
        assert.deepEqual(first.population.inspect(),populationBeforeCamera);
        first.advance(.5, true);
        assert.deepEqual(first.population.actors.map(actor => actor.id), initial);
        const before = released.length;
        let skeletonDisposed=false;
        a.skeleton.addEventListener?.('dispose',()=>{skeletonDisposed=true;});
        const disposeSkeleton=a.skeleton.dispose.bind(a.skeleton);
        a.skeleton.dispose=()=>{skeletonDisposed=true;disposeSkeleton();};
        first.dispose();
        first.dispose();
        assert.equal(released.length - before, 11);
        assert.equal(second.inspect().instances, 26);
        assert.equal(first.root.children.length, 0);
        assert.ok(skeletonDisposed);
    }
    finally {
        first.dispose();
        second.dispose();
    }
});
test('a failed model load releases every acquired asset after outstanding loads settle', async () => {
    const releases = [];
    const failing = {
        async acquire(id) {
            if (id === 'bear')
                throw new Error('Missing bear fixture');
            await new Promise(resolve => setTimeout(resolve, 10));
            return sources.acquire(id);
        },
        release(id) { releases.push(id); },
    };
    await assert.rejects(WildlifeLayer.create(worldFixture(), () => true, failing), /Missing bear fixture/);
    assert.equal(releases.length, 11);
    assert.equal(new Set(releases).size, 11);
});
test('missing habitats are reported without invalid forced spawns', () => {
    const world = worldFixture();
    const underwater = { ...world, terrain: { ...world.terrain, heights: world.terrain.heights.map(() => -3) },
        navigation: { ...world.navigation, cells: world.navigation.cells.map(() => false) } };
    const population = new WildlifePopulation(underwater);
    assert.ok(population.diagnostics.some(message => message.startsWith('reindeer:')));
    assert.equal(population.actors.some(actor => actor.variant.movement === 'ground'), false);
    for (const actor of population.actors)
        assert.ok(population.habitats.valid(actor.anchor, actor.variant));
});
