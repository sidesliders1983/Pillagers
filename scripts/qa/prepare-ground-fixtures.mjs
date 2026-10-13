import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { serializeWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));

// Fixed saved versions: these evidence fixtures must not drift with future generator defaults.
await mkdir('scratch/environment-zoning', { recursive: true });
await mkdir('scratch/ground-blending', { recursive: true });
for (const seed of [18, 42, 1983]) {
    const request = { seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3e', conifers: 'ez-tree' };
    const world = generateWorld({ ...request, environment: { version: 1 } });
    assert.equal(world.validation.accepted, true);
    await writeFile('scratch/environment-zoning/' + seed + '.json', serializeWorld(world));
    if (seed === 18) {
        const baseline = generateWorld(request);
        const cold = generateWorld({ ...request, environment: { version: 1, meanAnnualTemperatureC: -8 } });
        assert.deepEqual(cold.terrain, world.terrain);
        assert.deepEqual(baseline.terrain, world.terrain);
        await writeFile('scratch/environment-zoning/18-baseline.json', serializeWorld(baseline));
        await writeFile('scratch/ground-blending/18-cold.json', serializeWorld(cold));
    }
    console.log('Prepared ground review seed ' + seed);
}
