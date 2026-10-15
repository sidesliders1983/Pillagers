import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { BackSide, DoubleSide, FrontSide, Group, MeshStandardMaterial, Object3D,
    PerspectiveCamera, Ray, Raycaster, Vector2, Vector3 } = createRequire(import.meta.url)('three');
import { load } from './load-source.mjs';
const { createBlueprintTerrain, disposeBlueprintTerrain, updateBlueprintWear } = load('../src/world/BlueprintTerrain.ts');
const { intersectNavigationTerrain, refreshTerrainNavigationIndex } = load('../src/world/TerrainNavigation.ts');
const { RTSCameraController } = load('../src/camera/RTSCameraController.ts');
const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');

function world(height = (x, z) => Math.sin(x) * 3 + Math.cos(z) * 4, columns = 17, rows = 15) {
    const spacing = 2, bounds = { minX: -16, maxX: -16 + (columns - 1) * spacing,
        minZ: -14, maxZ: -14 + (rows - 1) * spacing };
    return { config: { preset: 'island', width: (columns - 1) * spacing, depth: (rows - 1) * spacing },
        waterLevel: 0, terrain: { columns, rows, spacing, bounds,
            heights: Array.from({ length: columns * rows }, (_, index) =>
                height(bounds.minX + index % columns * spacing, bounds.minZ + Math.floor(index / columns) * spacing)) } };
}
function sameHit(mesh, ray) {
    mesh.updateWorldMatrix(true, false);
    const native = new Raycaster(ray.origin, ray.direction).intersectObject(mesh, false)[0]?.point ?? null;
    const fast = intersectNavigationTerrain(mesh, ray, new Vector3());
    assert.notEqual(fast, undefined, 'Known canonical geometry uses the bounded query');
    assert.equal(Boolean(fast), Boolean(native), JSON.stringify(ray));
    if (native) assert.ok(fast.distanceTo(native) < 1e-8, JSON.stringify({ fast, native, ray }));
    return fast;
}

test('bounded navigation matches native triangles for alternating cells, edges, seams and front/back faces', () => {
    const mesh = createBlueprintTerrain(world(), undefined, 'form');
    let seed = 1983;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    try {
        for (const side of [FrontSide, BackSide, DoubleSide]) {
            mesh.material.side = side;
            for (let i = 0; i < 120; i++) {
                const origin = new Vector3((random() - .5) * 100, (random() - .5) * 100, (random() - .5) * 100);
                const target = new Vector3((random() - .5) * 32, 0, (random() - .5) * 28);
                sameHit(mesh, new Ray(origin, target.sub(origin).normalize()));
            }
            for (const x of [-16, -14, -2, 0, 2, 16]) for (const z of [-14, -2, 0, 2, 14]) {
                sameHit(mesh, new Ray(new Vector3(x, 40, z), new Vector3(0, -1, 0)));
                sameHit(mesh, new Ray(new Vector3(x, -40, z), new Vector3(0, 1, 0)));
            }
        }
    } finally { disposeBlueprintTerrain(mesh); }
});

test('navigation preserves deep-sea continuation, transformed parents, misses and parallel/vertical rays', () => {
    const mesh = createBlueprintTerrain(world(), undefined, 'form'), parent = new Group();
    parent.add(mesh); parent.position.set(120, 3, 140); parent.rotation.y = .73; parent.scale.set(1.3, .9, 2);
    parent.updateMatrixWorld(true);
    try {
        for (const [origin, direction] of [
            [[-50, 30, 0], [0, -1, 0]], [[50, 30, 0], [0, -1, 0]],
            [[0, 40, -55], [0, -1, 0]], [[0, 40, 55], [0, -1, 0]],
            [[1000, 40, 1000], [0, -1, 0]], [[-16, 40, -14], [0, 1, 0]],
            [[-20, 2, 0], [1, 0, 0]], [[0, 40, 0], [1, 0, 0]],
        ]) {
            sameHit(mesh, new Ray(new Vector3(...origin), new Vector3(...direction)).applyMatrix4(mesh.matrixWorld));
        }
    } finally { disposeBlueprintTerrain(mesh); }
});

test('layered material masks and legitimate wear-index replacement retain the same native physical surface', () => {
    const source = generateWorld({ seed: 17, environment: { version: 1 } });
    const materials = new Map(['Ground037', 'Ground054', 'grass_path_2', 'mossy_rock']
        .map(id => [id, new MeshStandardMaterial({ name: id })]));
    const mesh = createBlueprintTerrain(source, materials, 'none', undefined, 'zoned');
    const ray = new Ray(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
    try {
        const before = sameHit(mesh, ray).clone();
        updateBlueprintWear(mesh, source.biomes.worn.map(() => 1));
        assert.ok(sameHit(mesh, ray).equals(before));
        mesh.geometry.index.needsUpdate = true;
        assert.equal(intersectNavigationTerrain(mesh, ray, new Vector3()), undefined, 'Unannounced index edits fall back');
        refreshTerrainNavigationIndex(mesh);
        sameHit(mesh, ray);
        mesh.geometry.clearGroups();
        assert.equal(intersectNavigationTerrain(mesh, ray, new Vector3()), undefined, 'Unannounced group edits fall back');
    } finally { disposeBlueprintTerrain(mesh); for (const material of materials.values()) material.dispose(); }
});

test('foreign, edited and disposed terrain decline the shortcut instead of retaining stale geometry', () => {
    const mesh = createBlueprintTerrain(world(), undefined, 'form');
    const ray = new Ray(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
    assert.equal(intersectNavigationTerrain(new Object3D(), ray, new Vector3()), undefined);
    const positions = mesh.geometry.getAttribute('position');
    positions.needsUpdate = true;
    assert.equal(intersectNavigationTerrain(mesh, ray, new Vector3()), undefined);
    disposeBlueprintTerrain(mesh);
    assert.equal(intersectNavigationTerrain(mesh, ray, new Vector3()), undefined);
});

test('a crossing ray tests at most two triangles per crossed cell plus eight sea triangles', () => {
    const source = world(() => 0, 101, 87), mesh = createBlueprintTerrain(source, undefined, 'form');
    const original = Ray.prototype.intersectTriangle;
    let triangles = 0;
    Ray.prototype.intersectTriangle = function(...args) { triangles++; return original.apply(this, args); };
    try {
        const ray = new Ray(new Vector3(-18, 100, -16), new Vector3(1, 0, .8).normalize());
        assert.equal(intersectNavigationTerrain(mesh, ray, new Vector3()), null);
        assert.ok(triangles > 10);
        assert.ok(triangles <= 2 * (source.terrain.columns + source.terrain.rows + 2) + 8, triangles);
    } finally { Ray.prototype.intersectTriangle = original; disposeBlueprintTerrain(mesh); }
});

test('actual touch navigation reaches the same point without scanning the terrain material layers', () => {
    const previousWindow = globalThis.window; globalThis.window = new EventTarget();
    const canvas = new EventTarget(); canvas.setPointerCapture = () => {};
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const source = world(() => 0), mesh = createBlueprintTerrain(source, undefined, 'form');
    const camera = new PerspectiveCamera(45, 4 / 3, .1, 2000), controller = new RTSCameraController(camera, canvas);
    const surface = createBlueprintSurface(source);
    controller.setNavigationSurface(mesh, new Vector3(), source.terrain.bounds, surface.surfaceHeightAt,
        { terrain: source.terrain, waterLevel: 0 });
    controller.setView({ position: [0, 12, 14], target: [0, 0, 0] }); camera.updateMatrixWorld(true);
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(.375, -.0666666666667), camera);
    const expected = ray.intersectObject(mesh, false)[0].point;
    const original = Raycaster.prototype.intersectObject;
    Raycaster.prototype.intersectObject = () => { throw Error('Navigation scanned the complete terrain'); };
    try {
        for (const type of ['pointerdown', 'pointerup']) {
            const event = new Event(type, { cancelable: true });
            Object.assign(event, { pointerId: 1, pointerType: 'touch', clientX: 550, clientY: 320 });
            canvas.dispatchEvent(event);
        }
        controller.update(3);
        assert.ok(controller.focus.distanceTo(expected) < 1e-6);
    } finally {
        Raycaster.prototype.intersectObject = original; controller.dispose(); disposeBlueprintTerrain(mesh);
        if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    }
});
