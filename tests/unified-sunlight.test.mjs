import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';
const { Scene, Group, Mesh, MeshStandardMaterial, BoxGeometry, Box3, Vector3, PerspectiveCamera,
    ShaderLib, WebGLRenderTarget } = createRequire(import.meta.url)('three');
const { WorldLighting } = load('../src/core/WorldLighting.ts');
const { DirectionalAtmosphere } = load('../src/world/DirectionalAtmosphere.ts');
const { FjordsideWater } = load('../src/world/FjordsideWater.ts');
const { StructureSeasonTint } = load('../src/world/StructureSeasonTint.ts');
const { fjordPresentation } = load('../src/config/FjordPresentation.ts');
const { projectFjordWeather } = load('../src/fjord-play/FjordWeather.ts');

function fixture(quality = 'low') {
    const scene = new Scene(), renderer = { shadowMap: { enabled: true }, toneMappingExposure: 1 };
    const lighting = new WorldLighting(scene, renderer, { windowMaterials: [], fireMaterials: [] },
        new Vector3(), new Vector3(), quality, fjordPresentation.lighting);
    const atmosphere = new DirectionalAtmosphere(), water = new FjordsideWater(0, new Vector3(), quality, atmosphere);
    const camera = new PerspectiveCamera(45, 1.5, .1, 600);
    camera.position.set(-28, 25, 42); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const weather = projectFjordWeather('Normal').lighting;
    lighting.setSeason(.3, weather, .4);
    const update = () => { atmosphere.update(lighting, camera); water.update(0, lighting, camera); };
    update();
    return { scene, lighting, atmosphere, water, camera, weather, update, dispose() {
        water.dispose(); atmosphere.dispose(); lighting.dispose();
    } };
}

test('water uses independent real solar and ambient inputs; absent sun leaves readable ambient with zero solar gain', () => {
    const item = fixture(), u = item.water.mesh.material.uniforms;
    try {
        const state = item.lighting.seasonalLightState;
        assert.equal(u.uFjordSolarStrength.value, state.solarStrength);
        assert.deepEqual(u.uSunColor.value.toArray(), [...state.solarColor]);
        const ambient = u.uLightIntensity.value;
        item.lighting.ambient.intensity *= 2;
        item.update();
        assert.equal(u.uLightIntensity.value, ambient * 2);
        assert.equal(u.uFjordSolarStrength.value, state.solarStrength);
        item.lighting.setSeason(0, item.weather, 0);
        item.update();
        assert.equal(u.uFjordSolarStrength.value, 0);
        assert.ok(u.uLightIntensity.value > 0);
        assert.equal(u.uFjordSolarStrength, item.atmosphere.uniforms.uFjordSolarStrength);
        assert.match(item.water.mesh.material.fragmentShader, /crispHighlight\) \* diffuse \* uFjordSolarStrength \* solarVisibility/);
        assert.doesNotMatch(item.water.mesh.material.fragmentShader, /color \*= uLightIntensity/);
    } finally { item.dispose(); }
});

test('water borrows the current native shadow texture/matrix, handles map replacement and retains GPU resources', () => {
    const item = fixture(), target = new WebGLRenderTarget(16, 16), next = new WebGLRenderTarget(32, 32);
    const u = item.water.mesh.material.uniforms, shadow = item.lighting.directional.shadow;
    const geometry = item.water.mesh.geometry, material = item.water.mesh.material;
    try {
        assert.equal(u.uFjordShadowReady.value, 0, 'No incomplete first-frame map may be sampled');
        shadow.map = target;
        item.update();
        assert.equal(u.uFjordShadowMap.value, target.texture);
        assert.equal(u.uFjordShadowMatrix.value, shadow.matrix);
        shadow.matrix.setPosition(7, 8, 9);
        assert.equal(u.uFjordShadowMatrix.value.elements[12], 7, 'Renderer-side shadow update is visible in the same frame');
        shadow.map = next;
        item.update();
        assert.equal(u.uFjordShadowMap.value, next.texture);
        const version = material.version;
        for (let frame = 0; frame < 180; frame++) item.update();
        assert.equal(item.water.mesh.geometry, geometry);
        assert.equal(item.water.mesh.material, material);
        assert.equal(material.version, version, 'Uniform changes cannot recompile the shader');
        assert.equal(item.scene.children.filter(node => node.isLight && node.castShadow).length, 1);
        item.water.setQuality('standard');
        assert.equal(material.defines.FJORD_SHADOW_SAMPLES, 9);
        const standardVersion = material.version;
        item.water.setQuality('standard');
        assert.equal(material.version, standardVersion);
    } finally { shadow.map = null; target.dispose(); next.dispose(); item.dispose(); }
});

test('camera angle changes view response without changing shared annual sunlight or shadow direction', () => {
    const item = fixture();
    try {
        const state = item.lighting.seasonalLightState;
        const down = item.atmosphere.uniforms.uFjordViewDown.value;
        for (const position of [[28, 25, -42], [80, 120, 70], [-60, 30, 40]]) {
            item.camera.position.fromArray(position); item.camera.lookAt(0, 0, 0); item.camera.updateMatrixWorld();
            item.update();
            assert.equal(item.lighting.seasonalLightState, state);
            assert.deepEqual(item.atmosphere.uniforms.uFjordSunDirection.value.toArray(), [...state.sunDirection]);
            assert.equal(item.atmosphere.uniforms.uFjordSolarStrength.value, state.solarStrength);
        }
        item.camera.position.set(10, 120, 10); item.camera.lookAt(0, 0, 0); item.camera.updateMatrixWorld();
        item.update();
        assert.ok(item.atmosphere.uniforms.uFjordViewDown.value > down);
    } finally { item.dispose(); }
});

test('bounded coastal receivers do not turn the ocean skirt into shadow coverage or caster depth', () => {
    const item = fixture(), root = new Group(), geometry = new BoxGeometry(160, 20, 160);
    const material = new MeshStandardMaterial(), terrain = new Mesh(geometry, material);
    terrain.castShadow = true; terrain.receiveShadow = true;
    root.add(terrain, item.water.mesh);
    item.water.mesh.userData.shadowReceiverBounds = new Box3(new Vector3(-96, -.2, -96), new Vector3(96, .2, 96));
    try {
        item.lighting.includeWorldShadowBounds(root);
        const coverage = item.lighting.inspectShadowCoverage();
        assert.ok(coverage.receiverBounds.max[0] <= 100);
        assert.ok(coverage.receiverBounds.min[0] >= -100);
        assert.ok(coverage.casterBounds.max[0] <= 80);
        item.lighting.updateShadowView(item.camera);
        assert.ok(item.lighting.directional.shadow.camera.projectionMatrix.elements.every(Number.isFinite));
        assert.equal(item.water.mesh.castShadow, false);
    } finally { root.remove(item.water.mesh); geometry.dispose(); material.dispose(); item.dispose(); }
});

test('material hooks preserve snow, use linear fog exactly once, and release owned callbacks on disposal', () => {
    const root = new Group(), geometry = new BoxGeometry(), source = new MeshStandardMaterial();
    const mesh = new Mesh(geometry, source); root.add(mesh);
    const snow = new StructureSeasonTint(root), atmosphere = new DirectionalAtmosphere();
    const compile = mesh.material.onBeforeCompile, cacheKey = mesh.material.customProgramCacheKey;
    try {
        atmosphere.bind(root); atmosphere.bind(root);
        assert.equal(atmosphere.inspect().materials, 1);
        const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader,
            fragmentShader: ShaderLib.standard.fragmentShader };
        mesh.material.onBeforeCompile(shader);
        snow.update(0);
        assert.equal(shader.uniforms.structureSnowAmount.value, .65);
        assert.equal(shader.uniforms.uFjordSunDirection, atmosphere.uniforms.uFjordSunDirection);
        assert.doesNotMatch(shader.fragmentShader, /#include <fog_fragment>/);
        assert.equal((shader.fragmentShader.match(/#include <tonemapping_fragment>/g) ?? []).length, 1);
        assert.equal((shader.fragmentShader.match(/#include <colorspace_fragment>/g) ?? []).length, 1);
        assert.ok(shader.fragmentShader.indexOf('gl_FragColor.rgb = fjordAtmosphere') >
            shader.fragmentShader.indexOf('#include <tonemapping_fragment>'));
        assert.ok(shader.fragmentShader.indexOf('gl_FragColor.rgb = fjordAtmosphere') <
            shader.fragmentShader.indexOf('#include <colorspace_fragment>'));
        assert.match(shader.vertexShader, /instanceMatrix \* fjordPosition/);
        atmosphere.dispose();
        assert.equal(mesh.material.onBeforeCompile, compile);
        assert.equal(mesh.material.customProgramCacheKey, cacheKey);
        atmosphere.bind(root);
        mesh.material.dispose();
        assert.equal(atmosphere.inspect().materials, 0, 'Retired instances cannot accumulate in the uniform owner');
    } finally { atmosphere.dispose(); snow.dispose(); geometry.dispose(); source.dispose(); }
});

test('render updates only touch shared uniforms and preserve one authoritative sun through interpolation', () => {
    const item = fixture();
    try {
        item.lighting.setSeason(0, item.weather, .15);
        item.lighting.setSeason(0, item.weather, .16, .5);
        const u = item.atmosphere.uniforms, direction = u.uFjordSunDirection.value, color = u.uFjordSunColor.value;
        const keys = Object.keys(u), resources = [...item.scene.children];
        Object.defineProperty(item.lighting, 'seasonalLightState', { get() {
            assert.fail('Rendering must not allocate public seasonal state snapshots');
        } });
        item.scene.traverse = () => assert.fail('Frame lighting cannot walk scene geometry');
        for (let frame = 0; frame < 30; frame++) {
            item.lighting.update(frame / 60, 0, 1 / 60, true);
            item.update();
            assert.ok(Math.abs(u.uFjordSunDirection.value.length() - 1) < 1e-12);
        }
        assert.equal(u.uFjordSunDirection.value, direction);
        assert.equal(u.uFjordSunColor.value, color);
        assert.deepEqual(Object.keys(u), keys);
        assert.deepEqual(item.scene.children, resources);
    } finally { item.dispose(); }
});


test('seasonal copies of an atmosphere-bound material compile lighting once for their current scene', () => {
    const root = new Group(), geometry = new BoxGeometry(), source = new MeshStandardMaterial();
    const mesh = new Mesh(geometry, source); root.add(mesh);
    const originalAtmosphere = new DirectionalAtmosphere(), currentAtmosphere = new DirectionalAtmosphere();
    originalAtmosphere.bind(root);
    const snow = new StructureSeasonTint(root);
    try {
        currentAtmosphere.bind(root);
        const shader = {uniforms: {}, vertexShader: ShaderLib.standard.vertexShader,
            fragmentShader: ShaderLib.standard.fragmentShader};
        mesh.material.onBeforeCompile(shader);
        assert.equal((shader.vertexShader.match(/varying vec3 vFjordAtmospherePosition;/g) ?? []).length, 1);
        assert.equal((shader.fragmentShader.match(/vec3 fjordAtmosphere\(/g) ?? []).length, 1);
        assert.equal((shader.fragmentShader.match(/float fjordLit =/g) ?? []).length, 1);
        assert.equal(shader.uniforms.uFjordSunDirection, currentAtmosphere.uniforms.uFjordSunDirection);
        snow.setSnowAmount(.65);
        assert.equal(shader.uniforms.structureSnowAmount.value, .65);
    } finally {
        currentAtmosphere.dispose(); snow.dispose(); originalAtmosphere.dispose(); geometry.dispose(); source.dispose();
    }
});
