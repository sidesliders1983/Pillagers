import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { load } from './load-source.mjs';
import { validateCompactModels } from '../scripts/validate-compact-models.mjs';
import { readGlb, verifyModelGeometry } from '../scripts/model-texture-tools.mjs';
import { terrainIO } from '../scripts/terrain-io.mjs';
import { getBounds } from '@gltf-transform/functions';

const { compactModelSources, modelTexturePath } = load('../src/config/ModelTextureAssets.ts');
const manifest = JSON.parse(readFileSync('public/game-assets/compact-models/manifest.json'));

test('compact models retain every scene/geometry/animation payload and reduce image residency by 75%', async () => {
    assert.equal(await validateCompactModels(), 12);
    assert.equal(manifest.entries.reduce((sum, entry) => sum + entry.before.rgbaBytes, 0), 140 * 1048576);
    assert.equal(manifest.entries.reduce((sum, entry) => sum + entry.after.rgbaBytes, 0), 35 * 1048576);
    const io = await terrainIO();
    for (const entry of manifest.entries) {
        const before = await io.read('public/' + entry.source);
        const after = await io.read('public/' + entry.output);
        assert.deepEqual(getBounds(after.getRoot().listScenes()[0]), getBounds(before.getRoot().listScenes()[0]));
    }
});

test('the geometry guard rejects a changed compressed vertex/index payload', () => {
    const entry = manifest.entries[0];
    const source = readFileSync('public/' + entry.source);
    const changed = Buffer.from(readFileSync('public/' + entry.output));
    const parsed = readGlb(changed);
    const view = parsed.document.bufferViews.find(view => view.extensions?.EXT_meshopt_compression);
    const binaryOffset = 28 + changed.readUInt32LE(12);
    changed[binaryOffset + view.extensions.EXT_meshopt_compression.byteOffset] ^= 1;
    assert.throws(() => verifyModelGeometry(source, changed));
});

test('Low selects compact models by default and preserves Standard and unrelated assets', () => {
    for (const source of compactModelSources) {
        assert.notEqual(modelTexturePath(source, 'low'), source);
        assert.equal(modelTexturePath(source, 'standard'), source);
    }
    assert.equal(modelTexturePath('game-assets/human/Human_LOD2.glb', 'low'),
        'game-assets/human/Human_LOD2.glb');
});

test('the real AssetManager uses compact Low files by default and retains original Standard/Lab files', async () => {
    const nativeRequire = createRequire(import.meta.url);
    const { Group, Mesh, BoxGeometry, MeshStandardMaterial } = nativeRequire('three');
    const requested = [];
    class Loader {
        setDRACOLoader() { return this; }
        setMeshoptDecoder() { return this; }
        async loadAsync(path) {
            requested.push(path);
            const scene = new Group();
            scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
            return { scene };
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
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(readFileSync('public/game-assets/houses/manifest.json'));
    try {
        for (const quality of ['low', 'standard', undefined]) {
            requested.length = 0;
            const assets = new module.exports.AssetManager(quality);
            await assets.loadForSimulation();
            assert.equal(assets.diagnostics.length, 0);
            for (const source of compactModelSources)
                assert.ok(requested.includes('/play/' + modelTexturePath(source, quality ?? 'standard')), source);
            assert.equal(requested.filter(path => path.includes('/compact-models/')).length,
                quality === 'low' ? 12 : 0);
            assert.ok(requested.includes('/play/terrain/boulder.glb'));
            assets.dispose();
        }
    } finally { globalThis.fetch = savedFetch; }
});
