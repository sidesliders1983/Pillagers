import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { load } from './load-source.mjs';
const { Group, Mesh, MeshStandardMaterial, BoxGeometry, Texture } = createRequire(import.meta.url)('three');
const { prepareFaunaLighting } = load('../src/characters/FaunaLighting.ts');

test('fauna retain their albedo, maps and shared resources while imported self-light is disabled once', () => {
    const map = new Texture(), coat = new MeshStandardMaterial({ color: '#eee0c8', map,
        emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 2 });
    const geometry = new BoxGeometry(), root = new Group();
    root.add(new Mesh(geometry, coat), new Mesh(geometry, [coat, coat]));
    const original = coat.color.clone(), version = coat.version;
    let disposals = 0; map.addEventListener('dispose', () => disposals++);
    assert.equal(prepareFaunaLighting(root), 1);
    assert.equal(coat.emissive.getHex(), 0); assert.equal(coat.emissiveIntensity, 0);
    assert.ok(coat.color.equals(original)); assert.equal(coat.map, map);
    assert.equal(coat.emissiveMap, map); assert.equal(coat.version, version);
    assert.equal(prepareFaunaLighting(root), 1, 'A cached source is safe to acquire again');
    assert.equal(disposals, 0);
    geometry.dispose(); coat.dispose(); map.dispose();
});

test('every published livestock variant and wildlife model has lit coats after the runtime preparation', async () => {
    const publicRoot = new URL('../public/', import.meta.url), files = [];
    for (const variant of ['adult-female', 'adult-male', 'baby', 'young-adult']) {
        const directory = `game-assets/cattle/${variant}/`;
        const entry = JSON.parse(await readFile(new URL(directory + 'manifest.json', publicRoot), 'utf8'));
        files.push(directory + entry.file);
    }
    for (const species of ['goat', 'pig', 'sheep']) for (const variant of ['adult-female', 'adult-male', 'baby']) {
        const directory = `game-assets/livestock/${species}/${variant}/`;
        const entry = JSON.parse(await readFile(new URL(directory + 'manifest.json', publicRoot), 'utf8'));
        files.push(directory + entry.file);
    }
    const wildlife = JSON.parse(await readFile(new URL('wildlife/manifest.json', publicRoot), 'utf8'));
    files.push(...wildlife.entries.map(entry => 'wildlife/' + entry.file));
    const geometry = new BoxGeometry();
    for (const file of files) {
        const bytes = await readFile(new URL(file, publicRoot));
        const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        for (const source of gltf.materials) {
            assert.equal(Boolean(source.extensions?.KHR_materials_unlit), false, file + ' must use native lighting');
            const material = new MeshStandardMaterial();
            material.emissive.fromArray(source.emissiveFactor ?? [0, 0, 0]);
            material.emissiveIntensity = source.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
            const root = new Group(); root.add(new Mesh(geometry, material));
            prepareFaunaLighting(root);
            assert.equal(material.emissiveIntensity, 0, file);
            assert.equal(material.emissive.getHex(), 0, file);
            material.dispose();
        }
    }
    geometry.dispose();
});
