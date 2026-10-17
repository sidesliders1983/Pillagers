import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const textureRoot = 'docs/qa/iceland-textures-180';
const rockRoot = 'docs/qa/iceland-rock-snow-180';
const textures = JSON.parse(await readFile(textureRoot + '/delivery.json', 'utf8'));
const rocks = JSON.parse(await readFile(rockRoot + '/delivery.json', 'utf8'));
const output = 'public/ground-materials/iceland-v1';
const manifest = { version: 'fjord-iceland-v1', periodMeters: 24,
    channels: ['colour'], origin: { textures: textureRoot + '/delivery.json', rocks: rockRoot + '/delivery.json',
        prompts: textureRoot + '/generation.json' }, delivery: [] };
for (const tier of ['standard', 'low']) {
    await mkdir(output + '/' + tier, { recursive: true });
    for (const materialId of ['Ground037', 'Ground054', 'mossy_rock', 'grass_path_2']) {
        const source = materialId === 'mossy_rock' ? rocks.delivery.find(map => map.tier === tier) :
            textures.delivery.find(map => map.tier === tier && map.materialId === materialId);
        const sourceRoot = materialId === 'mossy_rock' ? rockRoot : textureRoot;
        const bytes = await readFile(sourceRoot + '/' + source.file);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        assert.equal(sha256, source.sha256, 'Selected delivery hash changed');
        const file = `${tier}/${materialId}-colour.webp`;
        await writeFile(output + '/' + file, bytes);
        manifest.delivery.push({ tier, materialId, file, bytes: bytes.length, sha256,
            from: sourceRoot + '/' + source.file });
    }
}
await writeFile(output + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Published', manifest.delivery.length, 'selected maps using existing delivery bytes.');
