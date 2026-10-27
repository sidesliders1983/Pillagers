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
