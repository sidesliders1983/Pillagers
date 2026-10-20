import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadTypeScript } from './load-typescript.mjs';
import { terrainIO } from './terrain-io.mjs';
import { getBounds } from '@gltf-transform/functions';

const root = resolve('public');
const { generatedHouseFiles } = loadTypeScript(new URL('../src/config/HousingAssets.ts', import.meta.url));
const { terrainModels, longshipModel } = loadTypeScript(new URL('../src/config/TerrainAssets.ts', import.meta.url));
const json = async file => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function verifyEntry(directory, entry) {
    assert.ok(entry && typeof entry.file === 'string' && /^[\w.-]+\.glb$/.test(entry.file),
        'Invalid runtime manifest entry in ' + directory);
    const bytes = await readFile(resolve(root, directory, entry.file));
    if (entry.bytes !== undefined) assert.equal(bytes.length, entry.bytes, directory + '/' + entry.file + ' size');
    if (entry.sha256) assert.equal(sha256(bytes), entry.sha256, directory + '/' + entry.file + ' hash');
    return bytes;
}

const houses = await json('game-assets/houses/manifest.json');
for (const [key, file] of Object.entries(generatedHouseFiles)) {
    assert.equal(houses.assets[key]?.file, file, 'Missing house publication: ' + key);
    await verifyEntry('game-assets/houses', houses.assets[key]);
}
const humans = await json('game-assets/human/manifest.json');
for (const lod of humans.lods) await verifyEntry('game-assets/human', lod);
for (const variant of ['adult-female', 'adult-male', 'baby', 'young-adult']) {
    const directory = 'game-assets/cattle/' + variant;
    await verifyEntry(directory, await json(directory + '/manifest.json'));
}

for (const species of ['goat', 'pig', 'sheep']) {
    const variants = species === 'pig' ? ['adult-female', 'adult-male'] : ['baby', 'adult-female', 'adult-male'];
    for (const variant of variants) {
        const directory = 'game-assets/livestock/' + species + '/' + variant;
        await verifyEntry(directory, await json(directory + '/manifest.json'));
    }
}

const wildlife = await json('wildlife/manifest.json');
for (const entry of wildlife.entries) await verifyEntry('wildlife', entry);

const terrain = await json('terrain/manifest.json');
for (const name of [...Object.values(terrainModels), longshipModel])
    assert.ok(terrain.assets[name], 'Missing Terrain model: ' + name);
const io = await terrainIO();
for (const entry of Object.values(terrain.assets)) {
    const bytes = await verifyEntry('terrain', entry);
    assert.ok(bytes.length <= entry.sourceBytes, 'Terrain publication grew: ' + entry.file);
    const doc = await io.readBinary(bytes);
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    for (const key of ['min', 'max']) for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(bounds[key][axis] - entry.bounds[key][axis]) <= 1e-6, 'Terrain bounds: ' + entry.file);
}

async function filesIn(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const groups = await Promise.all(entries.map(entry => entry.isDirectory()
        ? filesIn(resolve(directory, entry.name)) : [resolve(directory, entry.name)]));
    return groups.flat();
}
const files = await filesIn(root);
for (const file of files) {
    if (!/\.(glb|gltf)$/.test(file)) continue;
    const bytes = await readFile(file);
    assert.ok(bytes.length < 100 * 1024 * 1024, 'GLB exceeds GitHub file limit: ' + file);
    let model;
    if (file.endsWith('.glb')) {
        assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Invalid GLB: ' + file);
        assert.equal(bytes.readUInt32LE(4), 2, 'Unsupported GLB: ' + file);
        assert.equal(bytes.readUInt32LE(8), bytes.length, 'Truncated GLB: ' + file);
        model = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    } else model = JSON.parse(bytes.toString());
    for (const { uri } of [...model.buffers ?? [], ...model.images ?? []]) {
        if (!uri || uri.startsWith('data:')) continue;
        assert.ok(!/^[a-z]+:/i.test(uri), 'Runtime glTF must use local resources: ' + file);
        const dependency = resolve(dirname(file), decodeURIComponent(uri));
        assert.ok(dependency.startsWith(root + sep), 'glTF resource escapes public/: ' + file);
        await readFile(dependency);
    }
}
if (process.argv.includes('--tracked')) {
    const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', 'public/'], { encoding: 'utf8' }).split('\0'));
    const missing = files.map(file => 'public/' + relative(root, file).split(sep).join('/'))
        .filter(file => !tracked.has(file));
    assert.deepEqual(missing, [], 'Public runtime files missing from Git');
}
console.log('Validated ' + files.length + ' public files, house/human/cattle/wildlife manifests and ' +
    Object.keys(terrain.assets).length + ' decoded Terrain models without Assets/.');
