import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { load } from './load-source.mjs';

const nativeRequire = createRequire(import.meta.url);
const { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, Vector3 } = nativeRequire('three');
const { natureAssetIds } = load('../src/config/NatureAssets.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
    const requests = [];
    const pending = [];
    const scenes = [];
    let active = 0;
    let maximumActive = 0;
    const manifest = { assets: Object.fromEntries(natureAssetIds.map(key => [key, { file: key + '.gltf' }])) };

    function sceneFixture(key) {
        const geometry = new BoxGeometry(2, 4, 6);
        geometry.translate(3, 5, 7);
        const texture = new Texture();
        const material = new MeshStandardMaterial({ map: texture });
        const disposed = { geometry: 0, material: 0, texture: 0 };
        for (const [name, resource] of Object.entries({ geometry, material, texture }))
            resource.addEventListener('dispose', () => disposed[name]++);
        const scene = new Group();
        scene.add(new Mesh(geometry, material));
        const record = { key, scene, geometry, material, texture, disposed,
            positions: geometry.attributes.position.array.slice(), indices: geometry.index.array.slice() };
        scenes.push(record);
        return record;
    }

    class Loader {
        setDRACOLoader() { return this; }
        setMeshoptDecoder() { return this; }
        loadAsync(path) {
            requests.push(path);
            if (!path.includes('/nature/')) return Promise.resolve({ scene: sceneFixture('base').scene });
            active++;
            maximumActive = Math.max(maximumActive, active);
            const key = path.split('/').at(-1).replace('.gltf', '');
            const record = sceneFixture(key);
            return new Promise((resolve, reject) => {
                pending.push({ key, record, resolve: () => resolve({ scene: record.scene }), reject });
            }).finally(() => { active--; });
        }
    }
    class Draco { setDecoderPath() { return this; } dispose() {} }
    const source = readFileSync('src/core/AssetManager.ts', 'utf8')
        .replaceAll('import.meta.env.BASE_URL', "'/play/'");
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => {
        if (name.endsWith('/GLTFLoader.js')) return { GLTFLoader: Loader };
        if (name.endsWith('/DRACOLoader.js')) return { DRACOLoader: Draco };
        if (name.endsWith('/meshopt_decoder.module.js')) return { MeshoptDecoder: {} };
        return name.startsWith('.') ? load('../src/core/' + name + '.ts') : nativeRequire(name);
    }, module, module.exports);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async path => new Response(JSON.stringify(path.includes('/nature/') ? manifest : {
        assets: {},
    }));
    return { manager: new module.exports.AssetManager(), requests, pending, scenes, manifest,
        maximumActive: () => maximumActive, restore: () => { globalThis.fetch = originalFetch; } };
}

async function settleBatch(fixture, start) {
    await tick();
    const batch = fixture.pending.slice(start);
    for (const item of batch.toReversed()) item.resolve();
    await tick();
    return batch.length;
}

test('nature I/O starts four roles together, stays bounded and adopts the original keyed material and bounds', async () => {
    const state = fixture();
    try {
        const loading = state.manager.loadNature();
        await tick();
        assert.deepEqual(state.pending.map(item => item.key), natureAssetIds.slice(0, 4));
        assert.equal(state.maximumActive(), 4);
        assert.ok(natureAssetIds.every(key => !state.manager.has(key)));

        // The first canonical source must own the atlas even when it finishes last.
        for (const item of state.pending.slice(1, 4).toReversed()) item.resolve();
        await tick();
        assert.equal(state.pending.length, 4);
        state.pending[0].resolve();
        await tick();
        assert.equal(state.pending.length, 8);
        await settleBatch(state, 4);
        await settleBatch(state, 8);
        await settleBatch(state, 12);
        await loading;

        assert.equal(state.maximumActive(), 4);
        assert.deepEqual(state.pending.map(item => item.key), natureAssetIds);
        const first = state.scenes[0];
        const foliage = state.manager.get(natureAssetIds[0]).children[0].children[0].material;
        for (const key of natureAssetIds) {
            const root = state.manager.get(key);
            const mesh = root.children[0].children[0];
            const source = state.scenes.find(record => record.key === key);
            assert.equal(mesh.material, key.includes('rock') || key.includes('boulder') ? first.material : foliage);
            assert.equal(mesh.material.map, first.texture);
            assert.deepEqual(mesh.geometry.attributes.position.array, source.positions);
            assert.deepEqual(mesh.geometry.index.array, source.indices);
            const bounds = new Box3().setFromObject(root);
            assert.deepEqual(bounds.getSize(new Vector3()).toArray(), [2, 4, 6]);
            assert.deepEqual(bounds.getCenter(new Vector3()).toArray(), [0, 2, 0]);
            assert.equal(mesh.castShadow, true);
            assert.equal(mesh.receiveShadow, true);
        }
        assert.equal(foliage.color.getHex(), 0xb7c9b8);
        assert.deepEqual(first.disposed, { geometry: 0, material: 0, texture: 0 });
        for (const record of state.scenes.slice(1))
            assert.deepEqual(record.disposed, { geometry: 0, material: 1, texture: 1 });
        const requestCount = state.requests.length;
        await state.manager.loadNature();
        assert.equal(state.requests.length, requestCount);
        state.manager.dispose();
        assert.deepEqual(first.disposed, { geometry: 1, material: 1, texture: 1 });
        assert.ok(state.scenes.every(record => record.disposed.geometry === 1));
    } finally { state.restore(); }
});

test('strict nature failure drains the whole batch and releases decoded later roles without changing the adopted prefix', async () => {
    const state = fixture();
    try {
        const failure = new Error('Unavailable second role');
        let settled = false;
        const loading = state.manager.loadNature().then(() => {
            settled = true;
            throw new Error('Expected nature load to reject');
        }, error => { settled = true; return error; });
        await tick();
        assert.equal(state.pending.length, 4);
        state.pending[1].reject(failure);
        state.pending[0].resolve();
        await tick();
        assert.equal(settled, false);
        state.pending[2].resolve();
        await tick();
        assert.equal(settled, false);
        state.pending[3].resolve();
        assert.equal(await loading, failure);
        assert.equal(state.pending.length, 4);
        assert.equal(state.manager.has(natureAssetIds[0]), true);
        assert.ok(natureAssetIds.slice(1).every(key => !state.manager.has(key)));
        for (const record of state.scenes.slice(2))
            assert.deepEqual(record.disposed, { geometry: 1, material: 1, texture: 1 });
        // The foliage clone retains the atlas; its otherwise-unreferenced source material is released.
        assert.deepEqual(state.scenes[0].disposed, { geometry: 0, material: 1, texture: 0 });
        state.manager.dispose();
        assert.deepEqual(state.scenes[0].disposed, { geometry: 1, material: 1, texture: 1 });
    } finally { state.restore(); }
});

test('tolerant nature failure retains its successful prefix and supplies every missing placeholder after draining', async () => {
    const state = fixture();
    try {
        await state.manager.loadForSimulation();
        const loading = state.manager.loadNature();
        await tick();
        state.pending[1].reject(new Error('Test unavailable nature role'));
        for (const item of [state.pending[3], state.pending[2], state.pending[0]]) item.resolve();
        await loading;
        assert.equal(state.pending.length, 4);
        assert.equal(state.manager.get(natureAssetIds[0]).userData.placeholder, undefined);
        for (const key of natureAssetIds.slice(1))
            assert.equal(state.manager.get(key).userData.placeholder, true, key);
        const later = state.scenes.filter(record => natureAssetIds.slice(2, 4).includes(record.key));
        assert.ok(later.every(record => Object.values(record.disposed).every(count => count === 1)));
        const requestCount = state.requests.length;
        await state.manager.loadNature();
        assert.equal(state.requests.length, requestCount);
        state.manager.dispose();
        assert.ok(later.every(record => Object.values(record.disposed).every(count => count === 1)));
    } finally { state.restore(); }
});

test('a missing manifest role does not leak already-started later models or start another batch', async () => {
    const state = fixture();
    try {
        delete state.manifest.assets[natureAssetIds[2]];
        const loading = state.manager.loadNature().catch(error => error);
        await tick();
        assert.deepEqual(state.pending.map(item => item.key), [natureAssetIds[0], natureAssetIds[1], natureAssetIds[3]]);
        for (const item of state.pending.toReversed()) item.resolve();
        assert.match(String(await loading), /Missing required KayKit role/);
        assert.equal(state.pending.length, 3);
        assert.equal(state.manager.has(natureAssetIds[0]), true);
        assert.equal(state.manager.has(natureAssetIds[1]), true);
        assert.equal(state.manager.has(natureAssetIds[3]), false);
        assert.deepEqual(state.scenes.at(-1).disposed, { geometry: 1, material: 1, texture: 1 });
        state.manager.dispose();
    } finally { state.restore(); }
});