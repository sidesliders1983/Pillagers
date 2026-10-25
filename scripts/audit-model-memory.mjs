import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectModel, readGlb } from './model-texture-tools.mjs';
import { loadTypeScript } from './load-typescript.mjs';

const output = resolve(process.argv[2] ?? 'docs/qa/model-memory');
await mkdir(output, { recursive: true });
const roots = ['game-assets', 'terrain', 'scenery', 'wildlife', 'nature'];
const rows = [];
for (const root of roots) {
    for (const relative of await readdir('public/' + root, { recursive: true })) {
        const file = (root + '/' + relative).replaceAll('\\', '/');
        if (!file.endsWith('.glb') || file.includes('/compact-models/') || /source\.glb$/i.test(file)) continue;
        const bytes = await readFile('public/' + file);
        rows.push({ file, ...await inspectModel(bytes) });
    }
}
// Include registered Fjord wardrobe sources, not unrelated historical Lab candidates.
const wardrobe = loadTypeScript(new URL('../src/fjord-play/FjordWardrobe.ts', import.meta.url));
const characters = loadTypeScript(new URL('../src/characters/CharacterAssets.ts', import.meta.url));
const wardrobeIds = new Set([
    ...Object.values(wardrobe.fjordClothingSets).flatMap(set => Object.values(set)),
    ...wardrobe.fjordHairAssets, ...wardrobe.fjordBeardAssets,
    ...characters.availableCharacterAssets().filter(asset =>
        asset.id.startsWith('headwear/') || asset.id.startsWith('equipment/occupation')).map(asset => asset.id),
]);
for (const asset of characters.availableCharacterAssets().filter(asset => wardrobeIds.has(asset.id))) {
    const file = characters.characterAssetURL(asset.id, 2).replace(/^\//, '').split('?')[0];
    if (!file.endsWith('.glb') || rows.some(row => row.file === file)) continue;
    rows.push({ file, wardrobeId: asset.id, ...await inspectModel(await readFile('public/' + file)) });
}
rows.sort((a, b) => b.rgbaBytes - a.rgbaBytes || a.file.localeCompare(b.file));
const compact = JSON.parse(await readFile('public/game-assets/compact-models/manifest.json'));
const report = {
    upstreamCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scope: 'Embedded GLB image inventory; individual source budgets, not simultaneously resident scene memory.',
    units: 'RGBA8 pixels, excluding GPU mipmaps, image-decoder overhead, geometry and JS. Not measured process RAM.',
    sharing: 'Shared textures count once per loaded source, not once per resident or mesh instance.',
    rows, compact,
};
await writeFile(join(output, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');

for (const [label, source] of [
    ['hut', 'game-assets/houses/house-hut.glb'],
    ['farmyard', 'game-assets/houses/farm-hut-terrain.glb'],
    ['tent', 'scenery/meshy-tent-v1/tent.glb'],
    ['campfire', 'scenery/meshy-campfire-v1/campfire.glb'],
]) {
    const compactPath = compact.entries.find(entry => entry.source === source).output;
    for (const [tier, file] of [['original', source], ['compact', compactPath]]) {
        const model = readGlb(await readFile('public/' + file));
        const material = model.document.materials.find(value => value.pbrMetallicRoughness?.baseColorTexture);
        const texture = model.document.textures[material.pbrMetallicRoughness.baseColorTexture.index];
        const image = model.document.images[texture.extensions?.EXT_texture_webp?.source ?? texture.source];
        const view = model.document.bufferViews[image.bufferView], offset = view.byteOffset ?? 0;
        await writeFile(join(output, label + '-' + tier + '.webp'),
            model.binary.subarray(offset, offset + view.byteLength));
    }
}
console.log(JSON.stringify({ models: rows.length,
    compactBeforeMiB: compact.entries.reduce((sum, entry) => sum + entry.before.rgbaBytes, 0) / 1048576,
    compactAfterMiB: compact.entries.reduce((sum, entry) => sum + entry.after.rgbaBytes, 0) / 1048576,
    downloadBeforeMiB: compact.entries.reduce((sum, entry) => sum + entry.before.encodedBytes, 0) / 1048576,
    downloadAfterMiB: compact.entries.reduce((sum, entry) => sum + entry.after.encodedBytes, 0) / 1048576 }));
