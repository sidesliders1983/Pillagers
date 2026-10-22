import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';
const { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, Texture, Vector3 } =
    createRequire(import.meta.url)('three');
const { ConstructionGpuPreparation } = load('../src/construction/ConstructionGpuPreparation.ts');

function fixture() {
    const geometry = new BoxGeometry(6, 4, 5), texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const scene = new Scene(), root = new Group(); scene.add(root);
    const calls = { created: 0, released: 0, textures: 0, compile: 0, draws: 0, yields: 0 };
    const compiled = new Set(), disposed = new Set();
    const options = {
        scene, anchor: new Vector3(100, 30, -70), check() {},
        async yieldControl() { calls.yields++; },
        models: {
            async create(entity) {
                calls.created++;
                const model = new Group(), mesh = new Mesh(geometry, material);
                mesh.name = entity.asset; mesh.position.y = 2; model.add(mesh); return model;
            },
            release() { calls.released++; }
        },
        renderer: {
            initTexture(value) { assert.equal(value, texture); calls.textures++; },
            async compileAsync(model, _camera, lightingScene) {
                assert.equal(lightingScene, scene); calls.compile++;
                model.traverse(node => {
                    if (!(node instanceof Mesh)) return;
                    for (const value of Array.isArray(node.material) ? node.material : [node.material]) {
                        if (compiled.has(value)) continue;
                        compiled.add(value); value.addEventListener('dispose', () => disposed.add(value));
                    }
                });
            },
            render(value) { assert.equal(value, scene); calls.draws++; }
        }
    };
    return { options, calls, scene, root, compiled, disposed,
        release() { geometry.dispose(); material.dispose(); texture.dispose(); } };
}

test('loading prepares every house and shader state once, retaining warmed programs until scene disposal', async () => {
    const f = fixture(), preparation = new ConstructionGpuPreparation();
    const first = preparation.prepare(f.options);
    assert.equal(preparation.prepare(f.options), first, 'Coalesce repeated loading hooks');
    await first;
    assert.equal(f.calls.created, 18, 'Six metric house/farm variants in three material contexts');
    assert.equal(f.calls.compile, 25, 'Opaque, fade, opaque reveal, fading reveal and instanced scaffold');
    assert.equal(f.calls.draws, 9, 'Only first Hut/Farm Hut buffers and scaffold upload eagerly');
    assert.equal(f.calls.textures, 1, 'Shared source texture is uploaded only once');
    assert.ok(f.calls.yields >= 25, 'Preparation remains interruptible between work chunks');
    assert.equal(f.calls.released, 0); assert.equal(f.disposed.size, 0);
    assert.deepEqual(f.scene.children, [f.root], 'No warmup houses remain in the game scene');
    await preparation.prepare(f.options);
    assert.equal(f.calls.compile, 25, 'A second prepare does not rebuild GPU state');
    preparation.dispose();
    assert.equal(f.calls.released, 18);
    assert.equal(f.disposed.size, f.compiled.size, 'Release every retained program owner on exit');
    f.release();
});

test('cancelled preparation detaches temporary content and releases staged owners', async () => {
    const f = fixture(), preparation = new ConstructionGpuPreparation();
    f.options.yieldControl = async () => preparation.dispose();
    await assert.rejects(preparation.prepare(f.options), /cancelled/);
    assert.deepEqual(f.scene.children, [f.root]);
    assert.equal(f.calls.created, f.calls.released);
    f.release();
});
