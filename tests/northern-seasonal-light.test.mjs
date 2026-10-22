import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';
const { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial, PerspectiveCamera, Vector3 } = createRequire(import.meta.url)('three');

const { northernLightProfile, northernLightState } = load('../src/config/NorthernSeasonalLight.ts');
const { WorldLighting } = load('../src/core/WorldLighting.ts');
const { fjordPresentation } = load('../src/config/FjordPresentation.ts');
const { projectFjordCalendar } = load('../src/fjord-play/FjordCalendar.ts');
const { projectFjordWeather } = load('../src/fjord-play/FjordWeather.ts');
const { createCampaign, applyCommand, serializeState, initializePhysicalDiscovery, reconstructState } = load('../src/simulation/SimulationCore.ts');
const inputs = { solarColor: [1, .8, .6], solarStrength: 2.5,
    skyColor: [.8, .9, 1], groundColor: [.5, .4, .3], ambientStrength: 1.1,
    nightSkyColor: [.3, .4, .6], nightGroundColor: [.1, .15, .2] };

test('approved annual profile returns spring light under held snow, sustained summer and a concentrated dark winter', () => {
    const winter = northernLightState(0, inputs), summer = northernLightState(.5, inputs);
    assert.equal(winter.solarStrength, 0);
    assert.equal(winter.darkness, 1);
    assert.ok(winter.sunDirection[1] < 0);
    assert.equal(summer.solarStrength, inputs.solarStrength);
    assert.equal(summer.darkness, 0);
    assert.ok(Math.abs(summer.sunElevation * 180 / Math.PI - 45) < 1e-12);
    for (const progress of [.25, .375, .5, .625, .75])
        assert.equal(northernLightProfile(progress).solarScale, 1, 'No obligatory summer night');
    const thaw = projectFjordCalendar({ winter: 800, tick: 200 }, 1000);
    assert.equal(thaw.visualProgress, 0);
    assert.ok(northernLightState(thaw.progress, inputs).solarStrength > 1);
    assert.ok(northernLightState(.125, inputs).solarStrength > 0);
    assert.ok(northernLightState(.875, inputs).darkness > .5);
    assert.ok(winter.ambient.strength >= .6, 'Readable sky fill remains when direct sunlight is absent');
    assert.deepEqual(northernLightState(1, inputs), winter);
    assert.deepEqual(northernLightState(-.125, inputs), northernLightState(.875, inputs));
    assert.throws(() => northernLightProfile(NaN), RangeError);
});

test('annual state is immutable, normalized and continuous over phases and the year boundary', () => {
    const before = structuredClone(inputs);
    let previous = northernLightState(-.001, inputs);
    for (let tick = 0; tick <= 1000; tick++) {
        const state = northernLightState(tick / 1000, inputs);
        assert.ok(Math.abs(Math.hypot(...state.sunDirection) - 1) < 1e-12);
        assert.ok(new Vector3(...state.sunDirection).distanceTo(new Vector3(...previous.sunDirection)) < .003);
        assert.ok(Math.abs(state.solarStrength - previous.solarStrength) < .06);
        assert.ok(Math.abs(state.darkness - previous.darkness) < .025);
        assert.ok(Math.abs(Math.atan2(state.sunDirection[0], state.sunDirection[2]) - Math.PI * .75) < 1e-12);
        previous = state;
    }
    assert.throws(() => { previous.sunDirection[0] = 100; }, TypeError);
    assert.throws(() => { previous.ambient.strength = 0; }, TypeError);
    assert.deepEqual(inputs, before);
});

function fixture(quality = 'low') {
    const scene = new Scene(), renderer = { shadowMap: { enabled: true }, toneMappingExposure: 1 };
    const assets = { windowMaterials: [new MeshStandardMaterial()], fireMaterials: [new MeshStandardMaterial()] };
    const root = new Group(), ground = new Mesh(new BoxGeometry(160, 1, 160), new MeshStandardMaterial());
    ground.receiveShadow = true; root.add(ground); scene.add(root);
    const lighting = new WorldLighting(scene, renderer, assets, new Vector3(), new Vector3(), quality,
        fjordPresentation.lighting);
    lighting.includeWorldShadowBounds(root);
    const camera = new PerspectiveCamera(45, 1, .1, 300);
    camera.position.set(24, 30, -32); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    return { scene, renderer, assets, root, camera, lighting, dispose() {
        lighting.dispose(); ground.geometry.dispose(); ground.material.dispose();
        assets.windowMaterials[0].dispose(); assets.fireMaterials[0].dispose();
    } };
}

test('real lighting reuses the shadow source/map and keeps world sun independent of camera, quality and frame time', () => {
    const low = fixture(), standard = fixture('standard');
    try {
        const resources = [...low.scene.children];
        const map = { dispose() { assert.fail('Annual transitions cannot replace the shadow map'); } };
        low.lighting.directional.shadow.map = map;
        for (const progress of [0, .125, .25, .375, .5, .75, .875, .999, 1]) {
            const calendar = projectFjordCalendar({ winter: 800, tick: progress * 1000 }, 1000);
            for (const item of [low, standard])
                item.lighting.setSeason(calendar.visualProgress, projectFjordWeather('Normal').lighting, progress);
            standard.lighting.setQuality('standard');
            assert.equal(standard.lighting.directional.shadow.mapSize.x, 2048,
                'Annual darkness must not switch to the native Moonlight map size');
            const state = low.lighting.seasonalLightState;
            assert.deepEqual(state, standard.lighting.seasonalLightState);
            low.lighting.updateShadowView(low.camera);
            const passes = low.lighting.inspectShadowCoverage().passes;
            for (const time of [0, .016, 5, 50000]) {
                low.lighting.update(time, calendar.visualProgress);
                low.lighting.updateShadowView(low.camera);
                assert.equal(low.lighting.seasonalLightState, state, 'Paused/unmodified ticks reuse the exact state');
            }
            assert.equal(low.lighting.inspectShadowCoverage().passes, passes);
            low.camera.position.x += 8; low.camera.lookAt(0, 0, 0);
            low.lighting.updateShadowView(low.camera);
            assert.equal(low.lighting.seasonalLightState, state);
            assert.ok(low.lighting.directional.shadow.camera.projectionMatrix.elements.every(Number.isFinite));
            assert.ok(low.lighting.directional.shadow.camera.far > low.lighting.directional.shadow.camera.near);
            const direction = low.lighting.directional.position.clone().sub(low.lighting.directional.target.position).normalize();
            assert.ok(direction.distanceTo(new Vector3(...state.sunDirection)) < 1e-10);
            assert.equal(low.lighting.directional.shadow.map, map);
            assert.deepEqual(low.scene.children, resources);
            assert.equal(low.scene.children.filter(node => node.isLight && node.castShadow).length, 1);
        }
        low.lighting.directional.shadow.map = null;
        low.lighting.setMode('night');
        assert.equal(low.lighting.seasonalLightState, undefined, 'Native developer presets remain separate');
        assert.equal(low.lighting.directional.name, 'Moonlight');
    } finally {
        low.lighting.directional.shadow.map = null;
        low.dispose(); standard.dispose();
    }
});

test('canonical fire state overrides darkness and presentation time freezes its emissive accents', () => {
    const item = fixture();
    try {
        item.lighting.setSeason(0, projectFjordWeather('Severe').lighting, 0);
        item.lighting.setCampfire(true, 17);
        item.lighting.update(0, 0);
        const glow = item.assets.fireMaterials[0].emissiveIntensity;
        assert.ok(item.lighting.campfire.intensity > 0 && glow > 0);
        item.lighting.update(900, 0);
        assert.equal(item.assets.fireMaterials[0].emissiveIntensity, glow);
        item.lighting.setCampfire(false, 17);
        item.lighting.update(900, 0);
        assert.equal(item.lighting.campfire.intensity, 0);
        assert.equal(item.assets.fireMaterials[0].emissiveIntensity, 0);
        assert.equal(item.lighting.campfire.castShadow, false);
    } finally { item.dispose(); }
});

test('existing water consumes the shared world sun and cannot report bright sunlight in midwinter', () => {
    const { FjordsideWater } = load('../src/world/FjordsideWater.ts');
    const item = fixture(), water = new FjordsideWater(0, { x: 0, z: 0 }, 'low');
    const geometry = water.mesh.geometry, material = water.mesh.material;
    try {
        item.lighting.setSeason(0, projectFjordWeather('Normal').lighting, 0);
        water.update(0, item.lighting, item.camera);
        assert.equal(material.uniforms.uSunColor.value.getHex(), 0);
        assert.ok(material.uniforms.uLightIntensity.value > 0, 'Ambient water fill remains separate from absent sunlight');
        item.lighting.setSeason(.375, projectFjordWeather('Normal').lighting, .375);
        const state = item.lighting.seasonalLightState;
        item.lighting.directional.position.set(999, 2, -999);
        water.update(17, item.lighting, item.camera);
        assert.ok(material.uniforms.uSunDirection.value.distanceTo(new Vector3(...state.sunDirection)) < 1e-12);
        assert.ok(material.uniforms.uSunColor.value.getHex() > 0);
        assert.equal(water.mesh.geometry, geometry); assert.equal(water.mesh.material, material);
        assert.equal(water.describe().drawCalls, 1);
    } finally { water.dispose(); item.dispose(); }
});

test('opt-in annual presentation leaves canonical saves, events, RNG and outcomes byte-identical', () => {
    const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
        navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
        settlement: { center: { x: 16, z: 64 }, harbor: null } };
    const context = { world, worldId: 'annual-light-isolation' };
    let baseline = initializePhysicalDiscovery(createCampaign(32, { initialFood: 500 }), world, context.worldId);
    let candidate = structuredClone(baseline);
    const item = fixture();
    try {
        const commands = [
            { type: 'CreateExpeditionGroup', name: 'Light isolation', memberIds: ['founder-1', 'founder-2'] },
            { type: 'StartExpedition', groupId: 'group-1' },
            { type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 } },
            ...[1, 5, 25].map(ticks => ({ type: 'AdvanceTicks', ticks })),
            { type: 'RecallExpedition', groupId: 'group-1' },
            { type: 'AdvanceTicks', ticks: 150 },
        ];
        for (const command of commands) {
            baseline = applyCommand(baseline, command, context);
            candidate = applyCommand(candidate, command, context);
            const calendar = projectFjordCalendar(candidate.time, candidate.ticksPerWinter);
            item.lighting.setSeason(calendar.visualProgress, projectFjordWeather('Normal').lighting, calendar.progress);
            item.lighting.update(10000, calendar.visualProgress);
            assert.equal(serializeState(candidate), serializeState(baseline));
            candidate = reconstructState(serializeState(candidate));
        }
        const opening = projectFjordCalendar({ winter: 800, tick: 0 }, 1000);
        item.lighting.setSeason(opening.visualProgress, projectFjordWeather('Normal').lighting, opening.progress);
        assert.equal(item.lighting.seasonalLightState.solarStrength, 0, 'A load/time jump reanchors immediately');
    } finally { item.dispose(); }
});
