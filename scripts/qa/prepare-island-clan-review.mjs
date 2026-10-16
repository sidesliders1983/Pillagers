import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
const directory = 'docs/qa/island-clans';
await mkdir(directory, { recursive: true });
const fixtures = {};
for (const name of ['hidden', 'observed']) fixtures[name] = JSON.parse(await readFile('artifacts/island-clans/' + name + '.json', 'utf8'));
const shared = SharedSettlement.restore(JSON.stringify(fixtures.hidden), 'fjord');
const world = shared.fjord.blueprint, center = world.rivalSite.center;
const y = createBlueprintSurface(world).surfaceHeightAt(center.x, center.z);
const camera = { position: [center.x + 26, y + 36, center.z - 40], target: [center.x, y + 1, center.z] };
for (const [name, fixture] of Object.entries(fixtures)) {
    fixture.pace.running = false;
    fixture.presentation = { quality: 'low', effects: 'low', camera };
    await writeFile(directory + '/' + name + '.json', JSON.stringify(fixture));
}
