import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';
const { BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight, Scene, Texture, Vector3 } =
    createRequire(import.meta.url)('three');
const { ConstructionGpuPreparation } = load('../src/construction/ConstructionGpuPreparation.ts');
const assets = ['hut', 'farmHut', 'smithHut', 'homestead', 'farmHomestead',
    'smithHomestead', 'longhouse', 'greatHall'];
const stateOf = material => [material.transparent, material.clippingPlanes?.length ?? 0,
    material.clipShadows].join(':');
const states = ['false:0:false', 'true:0:false', 'false:1:true', 'true:1:true'];

function assetOf(node) {
    for (let current = node; current; current = current.parent)
        if (assets.includes(current.userData.asset)) return current.userData.asset;
}

function fixture() {
    const geometry = new BoxGeometry(6, 4, 5), texture = new Texture(), worldTexture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const worldMaterial = new MeshStandardMaterial({ map: worldTexture });
    const scene = new Scene(), root = new Group();
    const world = new Mesh(geometry, worldMaterial), hidden = new Mesh(geometry, worldMaterial);
    const light = new PointLight();
    world.layers.set(3);
    world.add(light);
    hidden.visible = false;
    hidden.layers.set(2);
    root.add(world, hidden);
    scene.add(root);
    const calls = { created: 0, released: 0, textures: 0, compile: 0, draws: 0, yields: 0 };
    const compiled = new Set(), disposed = new Set(), prepared = new Map(), created = [], draws = [];
    const options = {
        scene, anchor: new Vector3(100, 30, -70), check() {},
        async yieldControl() { calls.yields++; },
        models: {
            async create(entity) {
                calls.created++;
                const model = new Group(), mesh = new Mesh(geometry, material);
                mesh.name = entity.asset;
                mesh.position.y = 2;
                model.add(mesh);
                created.push(model);
                return model;
            },
            release() { calls.released++; }
        },
        renderer: {
            initTexture(value) { assert.equal(value, texture); calls.textures++; },
            async compileAsync(model, _camera, lightingScene) {
                assert.equal(lightingScene, scene);
                assert.equal(light.visible, true);
                assert.equal(light.layers.mask, 1);
                calls.compile++;
                model.traverse(node => {
                    if (!(node instanceof Mesh)) return;
                    for (const value of Array.isArray(node.material) ? node.material : [node.material]) {
                        const asset = assetOf(node);
                        if (asset) {
                            const covered = prepared.get(asset) ?? new Set();
                            covered.add(stateOf(value));
                            prepared.set(asset, covered);
                            const shader = { uniforms: {}, vertexShader: '#include <defaultnormal_vertex>',
                                fragmentShader: '#include <color_fragment>' };
                            value.onBeforeCompile(shader);
                            assert.ok(shader.uniforms.structureSnowAmount);
                            assert.match(value.customProgramCacheKey(), /structure-season-snow-v1/);
                        }
                        if (compiled.has(value)) continue;
                        compiled.add(value);
                        value.addEventListener('dispose', () => disposed.add(value));
                    }
                });
            },
            render(value, camera) {
                assert.equal(value, scene, 'Keep the exact live lighting, fog and shadow environment');
                assert.equal(world.visible, true, 'Do not hide a parent of live lights');
                assert.equal(world.layers.mask, 0, 'Do not draw the unrelated world in a warmup pass');
                assert.equal(light.layers.mask, 1);
                const visible = [];
                scene.traverseVisible(node => {
                    if (!(node instanceof Mesh) || !node.layers.test(camera.layers)) return;
                    const asset = assetOf(node);
                    if (asset) visible.push({ asset, state: stateOf(node.material) });
                    else assert.ok(node.isInstancedMesh, 'Only scaffold instances join the eager houses');
                });
                assert.ok(visible.length > 0);
                assert.ok(visible.every(item => item.asset === 'hut' || item.asset === 'farmHut'),
                    'Later housing geometry must remain outside eager GPU residency');
                draws.push(visible);
                calls.draws++;
            }
        }
    };
    return { options, calls, scene, root, world, hidden, light, compiled, disposed,
        prepared, created, draws, material,
        assertRestored() {
            assert.equal(world.layers.mask, 8);
            assert.equal(world.visible, true);
            assert.equal(hidden.layers.mask, 4);
            assert.equal(hidden.visible, false);
            assert.equal(light.layers.mask, 1);
        },
        release() { geometry.dispose(); material.dispose(); worldMaterial.dispose();
            texture.dispose(); worldTexture.dispose(); }
    };
}

test('loading batches every housing material state while retaining all owners and bounded eager uploads', async () => {
    const f = fixture(), preparation = new ConstructionGpuPreparation();
    try {
        const first = preparation.prepare(f.options);
        assert.equal(preparation.prepare(f.options), first, 'Coalesce repeated loading hooks');
        await first;
        assert.deepEqual(new Set(f.prepared.keys()), new Set(assets));
        for (const asset of assets) assert.deepEqual(f.prepared.get(asset), new Set(states), asset);
        assert.equal(f.calls.created, 24, 'Retain eight houses in all three independent material contexts');
        assert.equal(f.calls.compile, 2, 'Compile initial states together, then the fading reveal states');
        assert.equal(f.calls.draws, 2, 'Batch only the same eagerly uploaded housing and scaffold states');
        for (const asset of ['hut', 'farmHut']) {
            const rendered = new Set(f.draws.flat().filter(item => item.asset === asset).map(item => item.state));
            assert.deepEqual(rendered, new Set(states), 'Eager first-use state coverage for ' + asset);
        }
        assert.equal(f.calls.textures, 1, 'Upload each shared eager texture once, never world/future textures');
        assert.ok(f.calls.yields >= f.calls.created, 'Retain cancellation opportunities during model assembly');
        assert.equal(f.calls.released, 0);
        assert.equal(f.disposed.size, 0);
        assert.deepEqual(f.scene.children, [f.root], 'No warmup houses remain in the game scene');
        f.assertRestored();
        await preparation.prepare(f.options);
        assert.equal(f.calls.compile, 2, 'A second prepare does not repeat GPU work');
        preparation.dispose();
        assert.equal(f.calls.released, 24);
        assert.equal(f.disposed.size, f.compiled.size, 'Release every retained program owner on exit');
        preparation.dispose();
        assert.equal(f.calls.released, 24, 'Dispose the retained owners only once');
        assert.equal(f.material.transparent, false);
        assert.equal(f.material.clippingPlanes, null);
    } finally { preparation.dispose(); f.release(); }
});

test('opaque reveal programs finish before the same target materials change to fading reveal', async () => {
    const f = fixture(), preparation = new ConstructionGpuPreparation();
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const compile = f.options.renderer.compileAsync;
    f.options.renderer.compileAsync = async (...args) => {
        await compile(...args);
        if (f.calls.compile === 1) { entered(); await gate; }
    };
    try {
        const work = preparation.prepare(f.options);
        await started;
        assert.equal(f.calls.created, 24);
        assert.equal(f.calls.draws, 0);
        for (const [asset, covered] of f.prepared) {
            assert.deepEqual(covered, new Set(states.slice(0, 3)), asset);
        }
        for (const target of f.created.filter((_, index) => index % 3 === 2))
            target.traverse(node => { if (node instanceof Mesh) assert.equal(node.material.opacity, 1); });
        release();
        await work;
        for (const asset of assets) assert.deepEqual(f.prepared.get(asset), new Set(states), asset);
    } finally { release(); preparation.dispose(); f.release(); }
});

test('cancelled preparation detaches temporary content and releases staged owners', async () => {
    const f = fixture(), preparation = new ConstructionGpuPreparation();
    f.options.yieldControl = async () => preparation.dispose();
    try {
        await assert.rejects(preparation.prepare(f.options), /cancelled/);
        assert.deepEqual(f.scene.children, [f.root]);
        assert.equal(f.calls.created, f.calls.released);
        assert.equal(f.calls.compile, 0);
        f.assertRestored();
    } finally { preparation.dispose(); f.release(); }
});

test('cancellation after the first eager draw restores world layers before releasing all program owners', async () => {
    const f = fixture(), preparation = new ConstructionGpuPreparation();
    f.options.yieldControl = async () => { if (f.calls.draws === 1) preparation.dispose(); };
    try {
        await assert.rejects(preparation.prepare(f.options), /cancelled/);
        assert.equal(f.calls.compile, 1);
        assert.equal(f.calls.created, 24);
        assert.equal(f.calls.released, 24);
        assert.equal(f.disposed.size, f.compiled.size);
        assert.deepEqual(f.scene.children, [f.root]);
        f.assertRestored();
    } finally { preparation.dispose(); f.release(); }
});

test('an eager render failure restores existing scene visibility and layers before cleanup', async () => {
    const f = fixture(), preparation = new ConstructionGpuPreparation();
    const render = f.options.renderer.render;
    f.options.renderer.render = (...args) => { render(...args); throw new Error('GPU upload failed'); };
    try {
        await assert.rejects(preparation.prepare(f.options), /GPU upload failed/);
        assert.deepEqual(f.scene.children, [f.root]);
        f.assertRestored();
        preparation.dispose();
        assert.equal(f.calls.created, f.calls.released);
        assert.equal(f.disposed.size, f.compiled.size);
    } finally { preparation.dispose(); f.release(); }
});
