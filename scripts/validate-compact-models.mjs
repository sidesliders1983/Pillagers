import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadTypeScript } from './load-typescript.mjs';
import { inspectModel, verifyModelGeometry } from './model-texture-tools.mjs';

export async function validateCompactModels() {
    const { compactModelSources, compactModelPixels, modelTexturePath } =
        loadTypeScript(new URL('../src/config/ModelTextureAssets.ts', import.meta.url));
    const root = resolve('public');
    const manifest = JSON.parse(await readFile(resolve(root, 'game-assets/compact-models/manifest.json')));
    assert.equal(manifest.maximumPixels, compactModelPixels);
    assert.deepEqual(manifest.entries.map(entry => entry.source), compactModelSources);
    for (const entry of manifest.entries) {
        assert.equal(entry.output, modelTexturePath(entry.source, 'low', true));
        const before = await readFile(resolve(root, entry.source));
        const after = await readFile(resolve(root, entry.output));
        assert.deepEqual(await inspectModel(before), entry.before, 'Stale compact source: ' + entry.source);
        assert.deepEqual(await inspectModel(after), entry.after, 'Changed compact model: ' + entry.output);
        assert.ok(entry.after.images.every(image =>
            image.width <= compactModelPixels && image.height <= compactModelPixels));
        assert.ok(entry.after.rgbaBytes <= entry.before.rgbaBytes / 4);
        assert.ok(entry.after.encodedBytes < entry.before.encodedBytes);
        verifyModelGeometry(before, after);
    }
    return manifest.entries.length;
}
