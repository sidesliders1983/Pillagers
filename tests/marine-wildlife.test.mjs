import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';
import { marineWorld } from './fixtures/marine-world.mjs';
import { worldFixture } from './fixtures/wildlife-world.mjs';

const { WildlifePopulation } = load('../src/wildlife/WildlifePopulation.ts');
const { captureWildlife, restoreWildlife } = load('../src/wildlife/WildlifeSnapshot.ts');
const { marinePose, marineDuration, wildlifeObservable, advanceMarine } = load('../src/wildlife/MarineEncounters.ts');
const { WildlifeLayer } = load('../src/wildlife/WildlifeLayer.ts');
const { otterFloatRig, otterTailPoint, otterBackPoint } = load('../src/wildlife/MarineMotion.ts');
const { wildlifeAssetManifest } = load('../src/wildlife/WildlifeAssetManifest.ts');
const whale = population => population.actors.find(actor => actor.species === 'humpback-whale');

test('only body-safe corridors connected to open sea admit one whale and one orca slot', () => {
    const population = new WildlifePopulation(marineWorld());
    const actor = whale(population);
    assert.ok(actor);
    assert.equal(population.actors.filter(actor => actor.marine).length, 2);
    assert.equal(actor.state, 'absent');
    assert.equal(actor.variant.encounter.canonicalLength, 14);
    assert.equal(whale(new WildlifePopulation(worldFixture())), undefined, 'Three metres is too shallow');
    const enclosed = marineWorld();
    enclosed.terrain.heights = enclosed.terrain.heights.map((_, i) => {
        const x = -400 + i % 201 * 4, z = -400 + Math.floor(i / 201) * 4;
        return Math.abs(x) < 150 && Math.abs(z) < 150 ? -10 : 2;
    });
    assert.equal(whale(new WildlifePopulation(enclosed)), undefined, 'Deep enclosed water is not an entry route');
    for (const route of population.marineRoutes.get(actor.id)) {
        assert.ok(route.minimumDepth >= actor.variant.minimumDepth);
        assert.ok(population.habitats.segmentValid(route.from, route.to, actor.variant));
    }
});

test('encounters are episodic, continuous, deterministic, pause-safe and local-water-relative', () => {
    const world = marineWorld(243, 11), first = new WildlifePopulation(world);
    const second = new WildlifePopulation(world), states = new Set();
    let previous, surface = false, submergedAfterSurface = false, resumedFurther = false;
    let lastSurface;
    for (let step = 0; step < 3300; step++) {
        first.advance(.2, true); second.advance(.2, true);
        const actor = whale(first), pose = marinePose(actor);
        states.add(actor.state);
        if (previous && previous.state !== 'absent' && actor.state !== 'absent') {
            assert.ok(Math.hypot(actor.position.x - previous.position.x, actor.position.z - previous.position.z) <= .401);
            assert.ok(Math.abs(actor.position.y - previous.position.y) < .15, 'No surface height snapping');
        }
        if (actor.state !== 'absent') {
            assert.ok(first.habitats.valid(actor.position, actor.variant));
            assert.ok(Math.abs(actor.position.y - world.waterLevel - pose.offset) < 1e-9);
            if (pose.visible) {
                if (submergedAfterSurface) resumedFurther ||= Math.hypot(actor.position.x - lastSurface.x,
                    actor.position.z - lastSurface.z) > 15;
                lastSurface = { ...actor.position }; surface = true;
            } else if (surface && actor.state === 'submerged') submergedAfterSurface = true;
        }
        previous = { position: { ...actor.position }, state: actor.state };
    }
    assert.ok(['absent', 'approach', 'surface', 'dive', 'submerged', 'exit'].every(state => states.has(state)));
    assert.ok(resumedFurther);
    assert.deepEqual(captureWildlife(first), captureWildlife(second));
    const saved = captureWildlife(first), time = first.time;
    first.advance(1, false);
    assert.deepEqual(captureWildlife(first), saved);
    const restored = new WildlifePopulation(world);
    restoreWildlife(restored, saved, time);
    first.advance(.2, true); restored.advance(.2, true);
    assert.deepEqual(captureWildlife(restored), captureWildlife(first));
});

test('surface blow and rare tail dive differ from ordinary cruise; deep states cannot be sighted', () => {
    const actor = whale(new WildlifePopulation(marineWorld()));
    actor.state = 'surface'; actor.marine.elapsed = 22.25;
    assert.ok(marinePose(actor).spout > .6);
    actor.state = 'dive'; actor.marine.elapsed = 44.5;
    actor.marine.special = false;
    const ordinary = marinePose(actor);
    actor.marine.special = true;
    assert.ok(marinePose(actor).tail > ordinary.tail * 3);
    actor.state = 'surface'; actor.marine.elapsed = 72;
    assert.ok(Math.abs(marinePose(actor).pitch) < .001,
        'A whale fluke dive must not enable the orca head rise');
    actor.state = 'submerged'; actor.marine.elapsed = 60;
    assert.equal(wildlifeObservable(actor), false);
    actor.state = 'exit'; actor.marine.elapsed = marineDuration(actor.variant) - 1;
    assert.equal(wildlifeObservable(actor), false);
});

test('orca shows its dorsal fin, occasionally raises its head and travels fully submerged between surfaces', () => {
    const population = new WildlifePopulation(marineWorld());
    const actor = population.actors.find(actor => actor.species === 'orca');
    assert.equal(actor.variant.encounter.canonicalLength, 7);
    assert.equal(actor.speed, 3);
    assert.ok(actor.marine.cooldown >= 90 && actor.marine.cooldown <= 210);
    actor.state = 'surface'; actor.marine.elapsed = 22;
    assert.ok(marinePose(actor).visible);
    assert.equal(marinePose(actor).spout, 0);
    actor.marine.special = true; actor.marine.elapsed = 65;
    assert.ok(marinePose(actor).pitch < -.35);
    assert.ok(marinePose(actor).offset > -.1);
    actor.state = 'submerged'; actor.marine.elapsed = 48;
    assert.equal(wildlifeObservable(actor), false);
});

test('otter alternates swimming and readable back-floats, with bounded drift and pause', () => {
    const population = new WildlifePopulation(marineWorld());
    const otter = population.actors.find(actor => actor.variant.behavior === 'otter_shore_water');
    const states = new Set();
    let start, duration = 0, completed = false;
    for (let step = 0; step < 2500; step++) {
        population.advance(.2, true);
        states.add(otter.state);
        if (otter.state === 'back_float') {
            start ??= { ...otter.position };
            duration += .2;
            assert.ok(population.habitats.valid(otter.position, otter.variant));
        } else if (start) { completed = true; break; }
    }
    assert.ok(states.has('swim') && states.has('back_float') && completed);
    assert.ok(duration >= 13 && duration <= 25);
    assert.ok(Math.hypot(start.x - otter.position.x, start.z - otter.position.z) < 1);
});

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() {} });
test('marine publications retain both supplied skins, use metres and have neutral tails', async () => {
    for (const [id, length, joints] of [['humpback', 14, 27], ['orca', 7, 16]]) {
        const entry = wildlifeAssetManifest.find(item => item.id === id);
        assert.equal(entry.joints, joints);
        assert.deepEqual(entry.clips, []);
        assert.equal(entry.scaleReference.kind, 'body-length');
        const bytes = await readFile('public' + entry.path);
        const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
            .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
        const bounds = new Box3().setFromObject(gltf.scene, true);
        assert.ok(Math.abs(bounds.getSize(new Vector3()).z - length) < .01);
        assert.ok(bounds.getSize(new Vector3()).y < 5, 'Source tails have been neutralized');
        assert.ok(bytes.length < 200000);
    }
});

test('marine renderer samples actual water height, keeps the floating head above water and freezes paused poses', async () => {
    const sources = {
        async acquire(id) {
            const bytes = await readFile('public' + wildlifeAssetManifest.find(entry => entry.id === id).path);
            return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
                .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
        },
        release() {},
    };
    const world = marineWorld(243, 11), water = 11.12;
    const layer = await WildlifeLayer.create(world, () => true, sources);
    try {
        layer.setWaterHeightSampler(() => water);
        const actor = whale(layer.population);
        actor.state = 'surface';
        Object.assign(actor.marine, { cooldown: 0, elapsed: 22.25 });
        advanceMarine(actor, 0, world.config.seed, layer.population.marineRoutes.get(actor.id), layer.population.habitats);
        layer.advance(0, false);
        const root = layer.root.getObjectByName('wildlife:' + actor.id);
        assert.ok(root.visible);
        assert.ok(Math.abs(root.position.y - water - marinePose(actor).offset) < 1e-8);
        actor.marine.special = true;
        for (const start of [42, 81]) {
            for (let elapsed = start; elapsed <= start + 5.01; elapsed += .1) {
                actor.marine.elapsed = elapsed;
                advanceMarine(actor, 0, world.config.seed, layer.population.marineRoutes.get(actor.id), layer.population.habitats);
                layer.advance(0, false);
                layer.root.updateMatrixWorld(true);
                const bounds = new Box3().setFromObject(root, true);
                if (elapsed < start + 4.95) assert.ok(root.visible, 'Render the complete five-second dive');
                if (!root.visible) assert.ok(bounds.max.y < water,
                    'Never hide a whale while its actual skinned fluke is above water');
            }
            actor.marine.elapsed = start + 5.01;
            advanceMarine(actor, 0, world.config.seed, layer.population.marineRoutes.get(actor.id), layer.population.habitats);
            layer.advance(0, false);
            layer.root.updateMatrixWorld(true);
            assert.equal(root.visible, false);
            assert.ok(new Box3().setFromObject(root, true).max.y < water,
                'The entire whale is below water after at most five seconds');
        }
        const otter = layer.population.actors.find(actor => actor.variant.behavior === 'otter_shore_water');
        otter.state = 'back_float'; otter.wait = 30; otter.floatUntil = layer.population.time + 20;
        const otterRoot = layer.root.getObjectByName('wildlife:' + otter.id);
        const head = otterRoot.getObjectByName('head');
        const floatRig = otterFloatRig(otterRoot.children[0].children[0], otterRoot);
        otter.state = 'swim';
        for (const heading of [0, Math.PI * .5, Math.PI, Math.PI * 1.5]) {
            otter.heading = heading;
            for (const phase of [0, .25, .5, .75]) {
                otter.phase = phase;
                layer.advance(0, false);
                layer.root.updateMatrixWorld(true);
                const back = otterBackPoint(floatRig, new Vector3());
                assert.ok(Math.abs(back.y - water + .008) < .015, 'Swimming waterline reaches the upper back');
                assert.ok(head.getWorldPosition(new Vector3()).y > water + .01, 'Swimming head stays above water');
                for (const name of ['frontleg2', 'R_frontleg2', 'backleg2', 'R_backleg2'])
                    assert.ok(otterRoot.getObjectByName(name).getWorldPosition(new Vector3()).y < water,
                        'Swimming paws stay underwater: ' + name);
            }
        }
        otter.state = 'back_float';
        for (const heading of [0, Math.PI * .5, Math.PI, Math.PI * 1.5]) {
            otter.heading = heading;
            layer.advance(0, false);
            layer.root.updateMatrixWorld(true);
            assert.ok(head.getWorldPosition(new Vector3()).y > water + .01,
                'Floating head must clear the water at every heading');
            assert.ok(otterRoot.getObjectByName('Hips').getWorldPosition(new Vector3()).y < water - .025,
                'The body must be partly submerged, not resting on top of the surface');
            const tailHeight = otterTailPoint(floatRig, new Vector3()).y;
            assert.ok(Math.abs(tailHeight - water - .008) < .015,
                'The skinned tail tip rests at the actual water surface: ' + (tailHeight - water));
        }
        const pose = [];
        otterRoot.traverse(node => { if (node.isBone) pose.push(node.quaternion.toArray()); });
        const before = otterRoot.position.clone();
        layer.advance(.5, false);
        const paused = [];
        otterRoot.traverse(node => { if (node.isBone) paused.push(node.quaternion.toArray()); });
        assert.deepEqual(paused, pose);
        assert.ok(before.distanceTo(otterRoot.position) < 1e-10);
        layer.useCanonical({ version: 1, worldId: 'legacy-render-fixture', startedAt: 800000,
            advancedAt: 800000, nextEncounter: 1, contacts: [], firstDiscoveries: {},
            actors: captureWildlife(layer.population).filter(actor => !actor.marine) });
        layer.advance(0, false);
        assert.equal(root.visible, false, 'A legacy snapshot cannot retain a visitor from the prior scene');
    } finally { layer.dispose(); }
});
