import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { load } from './load-source.mjs';

const { fjordFogPresentation } = load('../src/config/FjordFog.ts');
const { fjordPresentation } = load('../src/config/FjordPresentation.ts');
const { WorldLighting } = load('../src/core/WorldLighting.ts');
const { DiscoveryFog } = load('../src/fjord-play/DiscoveryFog.ts');
const { createClanDiscovery, commitClanObservation, inspectClanDiscovery } =
    load('../src/simulation/ClanDiscovery.ts');

test('Nordic fog is opt-in and composes clear, rain, severe winter and night visibility', () => {
    assert.equal(fjordPresentation.fogProfile, 'current', 'Owner image approval is still pending.');
    assert.equal(fjordFogPresentation('current', { width: 800 }), undefined);
    const clear = fjordFogPresentation('nordic', { width: 800 });
    const rain = fjordFogPresentation('nordic', { width: 800, rainWeight: 1 });
    const winter = fjordFogPresentation('nordic', { width: 800, winterWeight: 1 });
    const severe = fjordFogPresentation('nordic', { width: 800, winterWeight: 1, weather: 'Severe' });
    const night = fjordFogPresentation('nordic', { width: 800, nightWeight: 1 });
    assert.deepEqual([clear.near, clear.far], [160, 400]);
    assert.ok(rain.far < clear.far && rain.near < clear.near);
    assert.equal(winter.far, clear.far, 'Clear winter is not permanently dense.');
    assert.ok(severe.far < winter.far && severe.near < winter.near);
    assert.ok(night.far < clear.far);
    assert.notEqual(winter.shroudColor, clear.shroudColor);
    for (const width of [80, 800, 1200, 10000]) {
        const profile = fjordFogPresentation('nordic', { width, winterWeight: NaN, rainWeight: 5 });
        assert.ok(profile.near >= 0 && profile.far > profile.near);
    }
    assert.throws(() => fjordFogPresentation('nordic', { width: Infinity }), /width/);
});

test('fog view distance composes once with cycle off, seasons, night and quality changes', () => {
    const scene = new Scene();
    const renderer = { shadowMap: { enabled: true, needsUpdate: false }, toneMappingExposure: 1 };
    const lighting = new WorldLighting(scene, renderer, { windowMaterials: [], fireMaterials: [] });
    const fog = lighting.fog;
    lighting.setFogViewDistance(260);
    for (let frame = 0; frame < 1000; frame++) lighting.update(frame / 60);
    assert.deepEqual([fog.near, fog.far], [265, 355]);
    lighting.setQuality('low');
    lighting.setFog(false);
    lighting.setMode('night');
    const night = [fog.near, fog.far, fog.color.getHex()];
    for (let frame = 0; frame < 1000; frame++) lighting.update(frame / 60);
    assert.deepEqual([fog.near, fog.far, fog.color.getHex()], night);
    assert.equal(scene.fog, null);
    lighting.setFog(true);
    assert.equal(scene.fog, fog);
    const candidate = fjordFogPresentation('nordic', { width: 800 });
    lighting.setFogPresentation(candidate);
    lighting.setSeason(.5);
    lighting.update(0, .5);
    const color = fog.color.getHex();
    for (let frame = 0; frame < 1000; frame++) lighting.update(frame / 60, .5);
    assert.deepEqual([fog.near, fog.far, fog.color.getHex()], [360, 600, color]);
    lighting.setFogViewDistance(50);
    lighting.update(0, .5);
    assert.deepEqual([fog.near, fog.far], [160, 400]);
    lighting.setFogPresentation(undefined);
    lighting.update(0, .5);
    assert.deepEqual([fog.near, fog.far], [65, 155]);
    lighting.setMode('day');
    lighting.setFogViewDistance(NaN);
    lighting.update(0);
    assert.deepEqual([fog.near, fog.far], [65, 155]);
    assert.equal(lighting.fog, fog);
    lighting.dispose();
});

test('presentation preserves opaque unknown, visible/mapped masks, geometry and interrupted fades', () => {
    const world = {
        waterLevel: -1,
        terrain: {
            bounds: { minX: 0, maxX: 256, minZ: 0, maxZ: 256 },
            columns: 33, rows: 33, spacing: 8, heights: new Array(33 * 33).fill(0),
        },
    };
    const home = { id: 'home', kind: 'settlement', x: 32, z: 32 };
    const scout = { id: 'confirmed-scout', kind: 'expedition', x: 176, z: 176 };
    let state = createClanDiscovery(world, 'fog-test', 'player', [home], 800500);
    const baseline = new DiscoveryFog(world, inspectClanDiscovery(state, 'player'));
    const fog = new DiscoveryFog(world, inspectClanDiscovery(state, 'player'));
    const geometry = fog.root.children[0].geometry;
    const texture = fog.root.children[0].material.alphaMap;
    const mask = Array.from(texture.image.data);
    const canonical = JSON.stringify(state);
    fog.setPresentation(fjordFogPresentation('nordic', { width: 800 }));
    assert.equal(fog.root.children[0].geometry, geometry);
    assert.equal(fog.root.children[0].material.alphaMap, texture);
    assert.deepEqual(Array.from(texture.image.data), mask);
    assert.equal(JSON.stringify(state), canonical);
    assert.equal(texture.image.data[0], 255, 'Unknown border stays fully opaque.');
    assert.ok(mask.some((value, index) => index % 4 === 0 && value === 0), 'Visible interior stays clear.');
    state = commitClanObservation(state, world, 'fog-test', 'player', [home, scout], 800505);
    for (const layer of [baseline, fog]) layer.setKnowledge(inspectClanDiscovery(state, 'player'));
    assert.equal(fog.inspect().drawCalls, 2);
    fog.update(.2);
    baseline.update(.2);
    state = commitClanObservation(state, world, 'fog-test', 'player', [home], 800510);
    for (const layer of [baseline, fog]) layer.setKnowledge(inspectClanDiscovery(state, 'player'));
    assert.ok(fog.inspect().exploredCells > fog.inspect().visibleCells);
    for (let index = 0; index < fog.root.children.length; index++) {
        const native = baseline.root.children[index];
        const candidate = fog.root.children[index];
        assert.deepEqual(Array.from(candidate.material.alphaMap.image.data),
            Array.from(native.material.alphaMap.image.data));
        assert.equal(candidate.material.opacity, native.material.opacity);
        assert.equal(candidate.geometry, geometry);
        const hits = [];
        candidate.raycast({}, hits);
        assert.deepEqual(hits, []);
    }
    fog.update(.4);
    assert.equal(fog.inspect().drawCalls, 2);
    fog.update(.4);
    assert.equal(fog.inspect().drawCalls, 1);
    fog.setPresentation(undefined);
    assert.equal(fog.root.children[0].material.fog, false);
    assert.equal(fog.inspect().geometryBytes, baseline.inspect().geometryBytes);
    assert.equal(fog.inspect().textureBytes, baseline.inspect().textureBytes);
    baseline.dispose();
    fog.dispose();
});
