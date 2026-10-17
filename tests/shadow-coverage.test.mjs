import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';

// The TypeScript test loader uses Three's CommonJS entry; keep instanceof checks in that realm.
const { Box3, BoxGeometry, DirectionalLight, Frustum, Group, Matrix4, Mesh,
    MeshStandardMaterial, PerspectiveCamera, Scene, Vector3 } = createRequire(import.meta.url)('three');
const { DirectionalShadowCoverage } = load('../src/core/DirectionalShadowCoverage.ts');
const { WorldLighting } = load('../src/core/WorldLighting.ts');
const { fjordPresentation } = load('../src/config/FjordPresentation.ts');
const settings = { padding: 4, minimumSpan: 64, spanStep: 8 };
const world = new Box3(new Vector3(-160, -8, -160), new Vector3(160, 45, 160));
function fixture() {
    const light = new DirectionalLight();
    light.position.set(.640856382, .422618262, -.640856382).multiplyScalar(200);
    light.shadow.mapSize.set(2048, 2048);
    light.target.updateMatrixWorld();
    const camera = new PerspectiveCamera(45, 16 / 9, .1, 2400);
    camera.position.set(28, 32, -32);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    const fit = new DirectionalShadowCoverage(world, settings);
    return { light, camera, fit };
}
function inShadow(light, point) {
    const projected = point.clone().applyMatrix4(light.shadow.camera.matrixWorldInverse)
        .applyMatrix4(light.shadow.camera.projectionMatrix);
    assert.ok(Math.max(Math.abs(projected.x), Math.abs(projected.y), Math.abs(projected.z)) <= 1.000001,
        'Visible receiver or upstream caster excluded from the native shadow map: ' + projected.toArray());
}

test('receiver coverage survives pan, orbit, aspect, zoom and tier changes', () => {
    const { light, camera, fit } = fixture();
    let receivers = 0;
    for (const aspect of [1, 16 / 9, 21 / 9]) for (const distance of [20, 60, 120]) {
        for (const angle of [0, .7, 1.8, 3.5, 5]) {
            camera.aspect = aspect;
            camera.updateProjectionMatrix();
            camera.position.set(17 + Math.sin(angle) * distance, 10 + distance * .6,
                -12 + Math.cos(angle) * distance);
            camera.lookAt(17, 1, -12);
            camera.updateMatrixWorld();
            fit.update(light, camera, 155);
            const view = new Frustum().setFromProjectionMatrix(new Matrix4()
                .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            for (let x = -160; x <= 160; x += 10) for (let z = -160; z <= 160; z += 10) {
                for (const y of [0, 8, 35]) {
                    const point = new Vector3(x, y, z);
                    if (!view.containsPoint(point) || -point.clone().applyMatrix4(camera.matrixWorldInverse).z > 155) continue;
                    inShadow(light, point);
                    receivers++;
                }
            }
        }
    }
    assert.ok(receivers > 1000);
    light.shadow.mapSize.set(1024, 1024);
    assert.equal(fit.update(light, camera, 155), true);
    inShadow(light, new Vector3(17, 1, -12));
});

test('a caster outside the player frustum keeps the same shadow texel and valid depth', () => {
    const { light, camera, fit } = fixture();
    camera.position.set(0, 20, 40);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    fit.update(light, camera, 155);
    const view = new Frustum().setFromProjectionMatrix(new Matrix4()
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const receiver = new Vector3();
    const caster = light.position.clone().sub(light.target.position).normalize().multiplyScalar(90);
    assert.equal(view.containsPoint(caster), false);
    assert.ok(world.containsPoint(caster));
    inShadow(light, receiver);
    inShadow(light, caster);
    const receiverView = receiver.applyMatrix4(light.shadow.camera.matrixWorldInverse);
    const casterView = caster.applyMatrix4(light.shadow.camera.matrixWorldInverse);
    assert.ok(Math.abs(receiverView.x - casterView.x) < 1e-8);
    assert.ok(Math.abs(receiverView.y - casterView.y) < 1e-8);
});

test('unchanged views reuse coverage, small pans snap to texels, and bounds changes invalidate it', () => {
    const { light, camera, fit } = fixture();
    fit.update(light, camera, 155);
    const before = light.shadow.camera.projectionMatrix.clone();
    const passes = fit.inspect().passes;
    for (let frame = 0; frame < 100; frame++) fit.update(light, camera, 155);
    assert.equal(fit.inspect().passes, passes);
    assert.deepEqual(light.shadow.camera.projectionMatrix, before);
    const oldSpan = light.shadow.camera.right - light.shadow.camera.left;
    const oldLeft = light.shadow.camera.left;
    camera.position.x += .001;
    camera.lookAt(.001, 1, 0);
    fit.update(light, camera, 155);
    const span = light.shadow.camera.right - light.shadow.camera.left;
    assert.equal(span, oldSpan);
    const texelShift = (light.shadow.camera.left - oldLeft) / (span / 2048);
    assert.ok(Math.abs(texelShift - Math.round(texelShift)) < 1e-7);
    fit.include(new Box3(new Vector3(-170, -10, -160), new Vector3(170, 50, 160)));
    assert.equal(fit.update(light, camera, 155), true);
    const finite = Object.values(light.shadow.camera.projectionMatrix.elements).every(Number.isFinite);
    assert.equal(finite, true);
});

test('empty or fully hidden receiver bounds retain a finite native fallback', () => {
    const { light, camera } = fixture();
    const empty = new DirectionalShadowCoverage(new Box3(), settings);
    assert.equal(empty.update(light, camera), false);
    const hidden = new DirectionalShadowCoverage(new Box3(new Vector3(-3, -3, 100), new Vector3(3, 3, 110)), settings);
    camera.position.set(0, 10, 30);
    camera.lookAt(0, 0, 0);
    assert.equal(hidden.update(light, camera, 100), false);
    assert.ok(light.shadow.camera.projectionMatrix.elements.every(Number.isFinite));
});

test('a large receiver-only seabed does not consume the full caster-depth range', () => {
    const { light, camera } = fixture();
    const receivers = new Box3(new Vector3(-1602, -15, -1602), new Vector3(1602, 49, 1602));
    const casters = new Box3(new Vector3(-150, 0, -150), new Vector3(150, 49, 150));
    const fit = new DirectionalShadowCoverage(receivers, settings, casters);
    fit.update(light, camera, 155);
    const depth = light.shadow.camera.far - light.shadow.camera.near;
    assert.ok(depth < 500, 'Receiver-only off-screen depth must not lower contact precision.');
    assert.ok(light.shadow.camera.top - light.shadow.camera.bottom <
        light.shadow.camera.right - light.shadow.camera.left, 'Fit each native texture axis separately.');
    inShadow(light, new Vector3(0, 0, 0));
});

test('Fjord integration caches coverage, keeps one map, and restores native day/night settings', () => {
    const scene = new Scene(), worldRoot = new Group();
    const geometry = new BoxGeometry(300, 1, 300), material = new MeshStandardMaterial();
    const ground = new Mesh(geometry, material);
    ground.receiveShadow = true;
    worldRoot.add(ground);
    scene.add(worldRoot);
    const renderer = { shadowMap: { enabled: true }, toneMappingExposure: 1 };
    const lighting = new WorldLighting(scene, renderer, { windowMaterials: [], fireMaterials: [] },
        undefined, new Vector3(), 'standard', fjordPresentation.lighting);
    const { camera } = fixture();
    try {
        lighting.includeWorldShadowBounds(worldRoot);
        lighting.setSeason(.5);
        lighting.updateShadowView(camera);
        const passes = lighting.inspectShadowCoverage().passes;
        for (let frame = 0; frame < 100; frame++) {
            lighting.update(frame / 60, .5);
            lighting.updateShadowView(camera);
        }
        assert.equal(lighting.inspectShadowCoverage().passes, passes);
        assert.equal(scene.children.filter(node => node.isLight && node.castShadow).length, 1);
        lighting.setQuality('low');
        lighting.updateShadowView(camera);
        assert.equal(lighting.directional.shadow.mapSize.x, 1024);
        assert.ok(lighting.inspectShadowCoverage().passes > passes);
        lighting.setMode('night');
        const night = lighting.directional.position.clone();
        lighting.updateShadowView(camera);
        assert.deepEqual(lighting.directional.position, night);
        assert.equal(lighting.directional.shadow.radius, 4);
        assert.equal(lighting.directional.shadow.normalBias, .045);
        lighting.setMode('day');
        assert.equal(lighting.directional.shadow.camera.right - lighting.directional.shadow.camera.left, 260);
    } finally {
        lighting.dispose();
        geometry.dispose();
        material.dispose();
    }
});
