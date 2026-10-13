import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';
const source = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { generateWorld } = source('world-generation/GenerateWorld');
const { parseWorld, serializeWorld } = source('world-generation/WorldSave');
const { buildingDistance } = source('world/SettlementLayout');
const { sampleEnvironment } = source('world-generation/EnvironmentZoning');
const output = process.env.QA_OUTPUT ?? 'scratch/environment-zoning';
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seeds = [17, 42, 91, 1983, 1337, 18, 7, 73, 256, 65537];
const report = { date: new Date().toISOString(), seeds, node: process.version,
    hardware: { cpu: os.cpus()[0].model, cores: os.cpus().length, totalMemoryBytes: os.totalmem() },
    results: [] };
const palette = { water: [36,74,104], grass: [117,173,83], sand: [234,208,153], mud: [128,98,75], bedrock: [160,167,173] };
async function map(world, field, path) {
    const zones = world.environment, pixels = Buffer.alloc(zones.primary.length * 3);
    for (let i = 0; i < zones.primary.length; i++) {
        let rgb = palette[zones.primary[i]];
        if (field !== 'primary' && zones.primary[i] !== 'water') {
            const v = Math.min(1, zones.fields[field][i]);
            const high = field === 'forestCover' ? [110,211,127] : field === 'moisture' ? [98,189,230] : [255,240,187];
            rgb = [37,50,60].map((low, c) => Math.round(low + (high[c] - low) * v));
        }
        pixels.set(rgb, i * 3);
    }
    await sharp(pixels, { raw: { width: zones.columns, height: zones.rows, channels: 3 } })
        .resize(603,603,{kernel:'nearest'}).png().toFile(path);
}
for (const seed of seeds) {
    const request = { seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3e', conifers: 'ez-tree' };
    const timed = (request, stages) => {
        const start = performance.now();
        const world = generateWorld(request, sample => {
            stages[sample.stage] = (stages[sample.stage] ?? 0) + sample.milliseconds;
        });
        return { world, milliseconds: performance.now() - start };
    };
    const baselineStages = {}, stages = {};
    const baseline = timed(request, baselineStages);
    const candidate = timed({ ...request, environment: { version: 1 } }, stages);
    const world = candidate.world, zones = world.environment;
    const preserved = ['terrain','coast','geology','settlement','siteSelection','rivalSite'];
    for (const key of preserved) assert.deepEqual(world[key], baseline.world[key], key + ' unchanged');
    assert.equal(world.validation.accepted, baseline.world.validation.accepted);
    assert.deepEqual(world.validation.reasons, baseline.world.validation.reasons);
    for (const placement of world.placementPlan) {
        const foundations = [...world.settlement.buildings, ...(world.rivalSite?.foundations ?? [])];
        assert.ok(foundations.every(building => buildingDistance(placement.x,placement.z,building) >= placement.clearance));
        const routes = [...world.settlement.accessPaths, world.siteSelection?.connection ?? []];
        assert.ok(routes.every(path => path.every(point => Math.hypot(point.x-placement.x,point.z-placement.z) > placement.clearance+.65)));
        if (placement.assetId.includes('conifer')) assert.ok(sampleEnvironment(world,placement.x,placement.z).forestCover >= .4);
    }
    const saved = serializeWorld(world);
    if (seed === 18) await writeFile(output + '/18-baseline.json', serializeWorld(baseline.world));
    assert.deepEqual(parseWorld(saved), world);
    assert.equal(hash(generateWorld({ ...request, environment: { version: 1 } })), hash(world));
    assert.deepEqual(parseWorld(serializeWorld(baseline.world)), baseline.world);
    assert.ok(zones.fields.snowRetentionPotential.every(value => value === 0));
    const points = zones.primary.map((primary, index) => {
        const x = world.terrain.bounds.minX + index % zones.columns * zones.spacing;
        const z = world.terrain.bounds.minZ + Math.floor(index / zones.columns) * zones.spacing;
        const elevation = world.terrain.heights[Math.floor(index / zones.columns) * 2 * world.terrain.columns + index % zones.columns * 2] - world.waterLevel;
        return { x, z, elevation, ...sampleEnvironment(world,x,z) };
    }).filter(point => point.primary !== 'water');
    const select = (filter, score) => points.filter(filter).sort((a,b) => score(b)-score(a))[0] ?? null;
    const examples = {
        lowCliff: select(p => p.elevation < 10 && p.elevation > .5, p => p.rockExposure),
        gentleHighland: select(p => p.elevation > 25 && p.slope < .12, p => p.elevation),
        shelteredLowland: select(p => p.elevation < 12 && p.slope < .15, p => p.shelter),
        wetland: select(p => p.primary === 'mud', p => p.mud),
        forest: select(p => p.forestCover > .4, p => p.forestCover),
    };
    const landRegions = zones.regions.filter(region => !['water','sand'].includes(region.ground));
    const scalarBytesEstimate = zones.primary.length * (10 * 8 + 4);
    report.results.push({ seed, accepted: world.validation.accepted, reasons: world.validation.reasons,
        coverage: zones.coverage, forestSamples: points.filter(p => p.forestCover >= .4).length,
        regions: zones.regions.length, smallInteriorRegions: landRegions.filter(r => r.area < 144).length,
        wetlandMaximumElevation: Math.max(0,...points.filter(p=>p.primary==='mud').map(p=>p.elevation)),
        normalSnowZero: true, preserved, clearances: true, deterministic: true, saveLoad: true,
        hash: hash(world), environmentHash: hash(zones), baselineMs: baseline.milliseconds,
        generationMs: candidate.milliseconds, baselineStages, stages,
        saveBytes: Buffer.byteLength(saved), baselineSaveBytes: Buffer.byteLength(serializeWorld(baseline.world)),
        environmentJsonBytes: Buffer.byteLength(JSON.stringify(zones)), scalarBytesEstimate,
        processMemoryObservation: process.memoryUsage(), examples,
        placements: world.placementPlan.length, baselinePlacements: baseline.world.placementPlan.length });
    for (const field of ['primary','forestCover','moisture','rockExposure'])
        await map(world,field,output + '/' + seed + '-' + field + '.png');
    // Full local blueprints support browser QA; they are not committed as duplicate saves.
    await writeFile(output + '/' + seed + '.json', saved);
    await writeFile(output + '/batch.json', JSON.stringify(report,null,2));
    console.log(JSON.stringify({ seed, coverage: zones.coverage, accepted: world.validation.accepted,
        baselineMs: baseline.milliseconds, generationMs: candidate.milliseconds,
        zoningMs: stages['environment-zoning'], saveMB: saved.length/1e6 }));
}
