import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';

// One disposable process per explicit geography seed. No pool edits or saved-recipe bypass.
const seed = Number(process.argv[2]);
const output = resolve(process.argv[3]);
const generatorVersion = 'fjordside-island-v0.3e-r3';
const preparationVersion = 'island-pool-v2';
const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { generateWorld } = load('world-generation/GenerateWorld');
const { prepareCampaignIsland, campaignIslandPlan } = load('fjord-play/CampaignIsland');
const { terrainPreview } = load('world-generation/TerrainPreview');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const started = performance.now();
const timings = [];
const observe = sample => timings.push(sample);
const result = { seed, sourcePassed: false, preparationPassed: false, timings };

try {
    const source = generateWorld({ seed, preset: 'island', generatorVersion,
        conifers: 'ez-tree', environment: { version: 1 } }, observe);
    result.sourceValidation = source.validation;
    result.sourcePassed = source.validation.accepted;
    result.sourceTerrainSha256 = hash(source.terrain);
    if (!result.sourcePassed) {
        result.status = 'invalid-geography';
        result.reasons = source.validation.reasons;
    } else {
        let world;
        try {
            world = prepareCampaignIsland(source, preparationVersion, observe);
        } catch (error) {
            result.status = /ten full-sized campaign households/.test(error.message) ?
                'campaign-capacity-failure' : 'campaign-preparation-failure';
            result.reasons = [error.message];
        }
        if (world) {
            result.status = 'prepared-candidate';
            result.preparationPassed = true;
            result.reasons = [];
            result.plan = campaignIslandPlan(world);
            result.blueprintSha256 = hash(world);
            result.planSha256 = hash(result.plan);
            result.finalNavigationSha256 = hash(world.navigation);
            result.sceneCounts = { placements: world.placementPlan.length,
                terrainSamples: world.terrain.heights.length, navigationCells: world.navigation.cells.length };
            result.geology = { rifts: world.geology.rifts.length,
                mainValleys: world.geology.valleys.filter(valley => valley.parentId === null).length,
                tributaries: world.geology.valleys.filter(valley => valley.parentId !== null).length };
            const preview = terrainPreview(world);
            await mkdir(output + '/previews', { recursive: true });
            await writeFile(output + '/previews/' + seed + '.json', JSON.stringify({
                qaOnly: true, seed, bounds: preview.bounds, waterLevel: preview.waterLevel,
                columns: preview.columns, rows: preview.rows, heights: [...preview.heights],
                ground: [...preview.ground], player: world.settlement.center,
                rival: world.rivalSite.center, shore: world.settlement.harbor,
                berth: result.plan.berth, plots: result.plan.plots }));
            const { heights, rows, columns } = world.terrain;
            const pixels = Buffer.alloc(rows * columns * 3);
            for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
                const i = row * columns + col, height = heights[i] - world.waterLevel;
                const t = Math.max(0, Math.min(1, height / 60));
                const colors = height <= 0 ? [26, 61, 77] :
                    [75 + t * 154, 101 + t * 119, 72 + t * 139];
                const gradient = (heights[Math.min(heights.length - 1, i + 1)] -
                    heights[Math.max(0, i - 1)] + heights[Math.min(heights.length - 1, i + columns)] -
                    heights[Math.max(0, i - columns)]) / 4;
                const shade = height <= 0 ? 1 : Math.max(.55, Math.min(1.2, 1 - gradient * .18));
                // North (+Z) is at the top, consistently across all contact sheets.
                const target = ((rows - 1 - row) * columns + col) * 3;
                colors.forEach((color, channel) => pixels[target + channel] = Math.round(color * shade));
            }
            await sharp(pixels, { raw: { width: columns, height: rows, channels: 3 } })
                .png().toFile(output + '/previews/' + seed + '.png');
        }
    }
} catch (error) {
    result.status = 'runtime-error';
    result.reasons = [error.stack ?? error.message];
}
result.elapsedMs = performance.now() - started;
result.resourceUsage = process.resourceUsage();
console.log(JSON.stringify(result));
