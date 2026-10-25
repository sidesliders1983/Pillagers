import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadTypeScript } from './load-typescript.mjs';
import { compactTextures, inspectModel } from './model-texture-tools.mjs';

const { compactModelSources, compactModelPixels, modelTexturePath } =
    loadTypeScript(new URL('../src/config/ModelTextureAssets.ts', import.meta.url));
const root = resolve('public');
const entries = [];
for (const source of compactModelSources) {
    const bytes = await readFile(resolve(root, source));
    const output = modelTexturePath(source, 'low', true);
    const compact = await compactTextures(bytes, compactModelPixels);
    const before = await inspectModel(bytes), after = await inspectModel(compact);
    await mkdir(resolve(root, 'game-assets/compact-models'), { recursive: true });
    await writeFile(resolve(root, output), compact);
    entries.push({ source, output, before, after });
}
await writeFile(resolve(root, 'game-assets/compact-models/manifest.json'),
    JSON.stringify({ maximumPixels: compactModelPixels, entries }, null, 2) + '\n');
console.log(JSON.stringify({ models: entries.length,
    beforeMiB: entries.reduce((sum, entry) => sum + entry.before.rgbaBytes, 0) / 1048576,
    afterMiB: entries.reduce((sum, entry) => sum + entry.after.rgbaBytes, 0) / 1048576 }));
