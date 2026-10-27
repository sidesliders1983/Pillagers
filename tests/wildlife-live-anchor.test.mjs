import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';
import { worldFixture } from './fixtures/wildlife-world.mjs';
import { marineWorld } from './fixtures/marine-world.mjs';
const { marinePose } = load('../src/wildlife/MarineEncounters.ts');
const { WildlifeLayer } = load('../src/wildlife/WildlifeLayer.ts');
const { captureWildlife } = load('../src/wildlife/WildlifeSnapshot.ts');
const { wildlifeAssetManifest } = load('../src/wildlife/WildlifeAssetManifest.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() {} });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const assets = new Map();
const sources = {
    async acquire(id) {
        if (!assets.has(id)) assets.set(id, (async () => {
            const entry = wildlifeAssetManifest.find(asset => asset.id === id);
            const bytes = await readFile('public' + entry.path);
            return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
        })());
        return assets.get(id);
    },
    release() {},
};

test('a live focus resolves only the exact current world, species and visible native instance without mutating wildlife', async () => {
    let known = true;
    const layer = await WildlifeLayer.create(worldFixture(), () => known, sources);
    const snapshot = { version: 2, worldId: 'anchor-fixture', startedAt: 800500, advancedAt: 800500,
        actors: captureWildlife(layer.population), nextEncounter: 1, contacts: [], firstDiscoveries: {} };
    const actor = layer.population.actors.find(actor => actor.species === 'moose');
    const target = { worldId: snapshot.worldId, speciesId: actor.species, wildlifeInstanceId: actor.id };
    const camera = new PerspectiveCamera(50, 1.6, .1, 1000);
    camera.position.set(actor.position.x + 8, actor.position.y + 4, actor.position.z + 8);
    camera.lookAt(actor.position.x, actor.position.y + .5, actor.position.z);
    try {
        layer.useCanonical(snapshot);
        layer.advance(0, false, camera);
        const before = JSON.stringify(snapshot);
        const anchor = layer.liveAnchor(target);
        const rendered = layer.root.getObjectByName('wildlife:' + actor.id);
        assert.ok(anchor, 'A genuinely rendered native animal can be focused');
        assert.ok(new Vector3(...anchor.position).distanceTo(rendered.getWorldPosition(new Vector3())) < 1e-6);
        assert.ok(anchor.bounds.max[1] > anchor.bounds.min[1]);
        assert.equal(layer.liveAnchor({ ...target, worldId: 'other-world' }), undefined);
        assert.equal(layer.liveAnchor({ ...target, speciesId: 'lynx' }), undefined);
        assert.equal(layer.liveAnchor({ ...target, wildlifeInstanceId: 'missing' }), undefined);
        known = false;
        layer.advance(0, false, camera);
        assert.equal(layer.liveAnchor(target), undefined, 'Previously recorded identity does not defeat fog');
        assert.equal(JSON.stringify(snapshot), before);
    } finally { layer.dispose(); }
    assert.equal(layer.liveAnchor(target), undefined);
});


test('real surfaced marine instances can focus, but the same naturally diving animal cannot be focused once fully submerged', async () => {
    const layer = await WildlifeLayer.create(marineWorld(243, 11), () => true, sources);
    const actor = layer.population.actors.find(actor => actor.species === 'humpback-whale');
    const target = { worldId: 'marine-anchor-fixture', speciesId: actor.species, wildlifeInstanceId: actor.id };
    const camera = new PerspectiveCamera(50, 1.6, .1, 1000);
    const adopt = () => {
        const at = 800500 + Math.round(layer.population.time / .2);
        layer.useCanonical({ version: 2, worldId: target.worldId, startedAt: 800500, advancedAt: at,
            actors: captureWildlife(layer.population), nextEncounter: 1, contacts: [], firstDiscoveries: {} });
        camera.position.set(actor.position.x + 20, layer.population.world.waterLevel + 9, actor.position.z + 20);
        camera.lookAt(actor.position.x, layer.population.world.waterLevel, actor.position.z);
        layer.advance(0, false, camera);
    };
    try {
        for (let step = 0; step < 4000 && !(marinePose(actor).renderVisible && marinePose(actor).visible); step++)
            layer.population.advance(.2, true);
        assert.equal(marinePose(actor).visible, true, 'Actual deterministic visitor reaches the surface');
        adopt();
        assert.ok(layer.liveAnchor(target));
        for (let step = 0; step < 1000 && !(marinePose(actor).renderVisible && !marinePose(actor).visible); step++)
            layer.population.advance(.2, true);
        assert.equal(marinePose(actor).renderVisible, true);
        assert.equal(marinePose(actor).visible, false, 'The real dive reaches its invisible phase');
        adopt();
        assert.equal(layer.liveAnchor(target), undefined, 'Drawing the last dive/fluke frames is not a current sighting');
    } finally { layer.dispose(); }
});

// Actual coastal terrain and native float poses, rather than a flat camera-only anchor.
test('the real island seal and floating puffin can be framed safely from an ordinary nearby view', async () => {
    const { JSDOM } = await import('jsdom');
    const { loadDOMSource } = await import('./load-dom-source.mjs');
    const { Object3D } = await import('three');
    const { RTSCameraController } = loadDOMSource('../src/camera/RTSCameraController.ts');
    const { WildlifeCamera } = loadDOMSource('../src/camera/WildlifeCamera.ts');
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    const checkpoint = await readFile('docs/qa/wildlife-cinematic-292/live-sighting.json', 'utf8');
    const owner = SharedSettlement.restore(checkpoint, 'fjord');
    owner.session.command({ type: 'AdvanceTicks', ticks: 10 });
    const world = owner.fjord.blueprint, surface = createBlueprintSurface(world);
    const state = owner.session.readSnapshot();
    const layer = await WildlifeLayer.create(world, () => true, sources);
    const dom = new JSDOM('<canvas></canvas>', { pretendToBeVisual: true });
    const names = ['window', 'document', 'AbortController', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];

    try {
        for (const species of ['seal', 'puffin']) {
            const actor = state.wildlife.actors.find(actor => actor.id === species + ':water:0');
            assert.ok(actor, species + ' exists in the actual island population');
            const camera = new PerspectiveCamera(45, 1.6, .1, 2000);
            const controller = new RTSCameraController(camera, document.querySelector('canvas'));
            controller.setNavigationSurface(new Object3D(), new Vector3(actor.position.x, 0, actor.position.z),
                world.terrain.bounds, surface.surfaceHeightAt, { terrain: world.terrain, waterLevel: world.waterLevel });
            controller.setView({ position: [actor.position.x + 14, Math.max(actor.position.y + 24, world.waterLevel + 24), actor.position.z + 20],
                target: [actor.position.x, Math.max(actor.position.y, world.waterLevel), actor.position.z] });
            camera.updateMatrixWorld();
            layer.useCanonical(state.wildlife); layer.advance(0, false, camera);
            const target = { worldId: state.wildlife.worldId, speciesId: species, wildlifeInstanceId: actor.id };
            const anchor = layer.liveAnchor(target);
            assert.ok(anchor, species + ' must be genuinely visible to the current native camera');
            const orbit = new WildlifeCamera(camera, controller, target => layer.liveAnchor(target));
            try {
                assert.equal(orbit.begin(target, false), true, species + ' should have a safe coastal framing');
                for (let frame = 0; frame < 30; frame++) {
                    orbit.advance(.1);
                    assert.ok(camera.position.y >= world.waterLevel + 1.9, 'Eye stays safely above water');
                    camera.updateMatrixWorld(); layer.advance(0, false, camera);
                }
                assert.equal(orbit.active, true, species + ' remains in its safe focus');
            } finally { orbit.dispose(); controller.dispose(); }
        }
    } finally { layer.dispose(); dom.window.close(); Object.assign(globalThis, previous); }
});
