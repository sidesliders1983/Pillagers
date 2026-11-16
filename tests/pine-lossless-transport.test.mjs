import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import ts from 'typescript';

const directory = 'public/nature/ez-tree-pilot/';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceGltf = JSON.parse(readFileSync(directory + 'pine-large.gltf'));
const readPublic = name => readFile(directory + name);

function loadPineRuntime() {
    const nativeRequire = createRequire(import.meta.url);
    const { BoxGeometry, Group, Mesh, MeshStandardMaterial } = nativeRequire('three');
    const requested = [];
    const source = new Group();
    const geometry = new BoxGeometry(2, 8, 4);
    geometry.translate(2, 4, 3);
    const material = new MeshStandardMaterial();
    source.add(new Mesh(geometry, material));
    class Loader {
        async loadAsync(path) { requested.push(path); return { scene: source }; }
    }
    const input = readFileSync('src/world/PineModels.ts', 'utf8')
        .replaceAll('import.meta.env.BASE_URL', "'/play/'");
    const compiled = ts.transpileModule(input, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => {
        if (name.endsWith('/GLTFLoader.js')) return { GLTFLoader: Loader };
        if (name.startsWith('.')) return {};
        return nativeRequire(name);
    }, module, module.exports);
    return { ...module.exports, requested, source, geometry, material, nativeRequire };
}

test('the real pine loader selects lossless transport and retains all three grounded height roles', async () => {
    const fixture = loadPineRuntime();
    const { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } = fixture.nativeRequire('three');
    const heights = new Map([['kaykit-conifer-a', 3], ['kaykit-conifer-b', 5], ['kaykit-conifer-c', 7]]);
    const assets = { get(key) {
        const root = new Group();
        const height = heights.get(key) ?? 1;
        const mesh = new Mesh(new BoxGeometry(1, height, 1), new MeshStandardMaterial());
        mesh.position.y = height / 2;
        root.add(mesh);
        return root;
    } };
    const pines = await fixture.loadPineModels(assets);
    assert.deepEqual(fixture.requested, ['/play/nature/ez-tree-pilot/pine-large-lossless.gltf']);
    for (const [key, height] of heights) {
        const model = pines.resolve(key);
        const bounds = new Box3().setFromObject(model);
        assert.deepEqual(bounds.getSize(new Vector3()).toArray(), [height / 4, height, height / 2]);
        assert.deepEqual(bounds.getCenter(new Vector3()).toArray(), [0, height / 2, 0]);
        assert.equal(model.children[0].children[0].geometry, fixture.geometry);
        assert.equal(model.children[0].children[0].material, fixture.material);
    }
    assert.equal(new Box3().setFromObject(pines.resolve('kaykit-bush-a')).getSize(new Vector3()).y, 1);
    let geometryDisposals = 0, materialDisposals = 0;
    fixture.geometry.addEventListener('dispose', () => geometryDisposals++);
    fixture.material.addEventListener('dispose', () => materialDisposals++);
    pines.dispose();
    assert.equal(geometryDisposals, 1);
    assert.equal(materialDisposals, 1);
});

test('published pine transport proves exact pixels, geometry and all original source/provenance files', async () => {
    const { validatePineTransport } = await import('../scripts/validate-pine-transport.mjs');
    const result = await validatePineTransport();
    assert.equal(result.images, 4);
    assert.equal(result.originalImageBytes, 7_807_140);
    assert.equal(result.decodedRgbaBytes, 16_777_216);
    assert.ok(result.encodedImageBytes < 4_800_000);
    assert.ok(result.savedBytes > 3_000_000);
});

test('the geometry guard rejects changed accessors, UV binding, material, sampler and fallback semantics', async () => {
    const { verifyPineTransportGeometry } = await import('../scripts/pine-transport-tools.mjs');
    const published = JSON.parse(await readPublic('pine-large-lossless.gltf'));
    const mutations = [
        value => { value.accessors[0].min[0] += 0.01; },
        value => { value.meshes[0].primitives[0].attributes.TEXCOORD_0 = 0; },
        value => { value.materials[1].alphaCutoff = 0.5; },
        value => { value.samplers[0].wrapS = 33071; },
        value => { value.buffers[0].uri = 'pine-small.bin'; },
        value => { value.textures[0].source = 0; },
        value => { value.extensionsRequired = ['EXT_texture_webp']; },
    ];
    for (const mutate of mutations) {
        const changed = structuredClone(published);
        mutate(changed);
        assert.throws(() => verifyPineTransportGeometry(sourceGltf, changed), { code: 'ERR_ASSERTION' });
    }
});

test('the publication gate rejects changed pixels even with a matching replacement encoded checksum', async () => {
    const { validatePineTransport } = await import('../scripts/validate-pine-transport.mjs');
    const manifest = JSON.parse(await readPublic('lossless-transport.manifest.json'));
    const image = manifest.images[0];
    const { data, info } = await sharp(await readPublic(image.source.file)).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    data[0] ^= 1;
    const changed = await sharp(data, { raw: info }).webp({ lossless: true, exact: true }).toBuffer();
    image.transport.bytes = changed.length;
    image.transport.sha256 = digest(changed);
    const read = name => name === image.transport.file ? changed : name === 'lossless-transport.manifest.json'
        ? Buffer.from(JSON.stringify(manifest)) : readPublic(name);
    await assert.rejects(validatePineTransport({ read }), /decoded RGBA/);
});

test('the publication gate rejects altered original models and provenance', async () => {
    const { validatePineTransport } = await import('../scripts/validate-pine-transport.mjs');
    for (const file of ['pine-small.bin', 'NOTICE.txt']) {
        const changed = Buffer.from(await readPublic(file));
        changed[0] ^= 1;
        await assert.rejects(validatePineTransport({ read: name => name === file ? changed : readPublic(name) }),
            /Preserved pine source/);
    }
});
test('source provenance accepts the same original text in an LF checkout', async () => {
    const { validatePineTransport } = await import('../scripts/validate-pine-transport.mjs');
    const read = async name => {
        const bytes = await readPublic(name);
        return /\.(txt|md|json)$/.test(name)
            ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
    };
    assert.equal((await validatePineTransport({ read })).images, 4);
});

test('pixel validation also protects RGB values beneath completely transparent leaves', async () => {
    const { verifyPinePixels } = await import('../scripts/pine-transport-tools.mjs');
    const source = await readPublic(sourceGltf.images[3].uri);
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = -1;
    for (let index = 3; index < data.length; index += 4)
        if (data[index] === 0) { transparent = index - 3; break; }
    assert.ok(transparent >= 0, 'Actual leaf source must contain transparent pixels.');
    data[transparent] ^= 1;
    const changed = await sharp(data, { raw: info }).webp({ lossless: true, exact: true }).toBuffer();
    await assert.rejects(verifyPinePixels(source, changed), /decoded RGBA/);
});
