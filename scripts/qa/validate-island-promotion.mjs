import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';

const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seeds = [18, 7, 15, 79, 88, 101, 112, 168, 195, 227];
const output = 'scratch/island-seed-expansion/promotion-v3';
const published = 'docs/qa/island-snow-promotion';
await mkdir(output, { recursive: true });
await mkdir(published + '/maps', { recursive: true });

if (process.argv[2] !== '--seed') {
    // Independent processes bound retained worlds, geometry scratch and module caches.
    for (let index = 0; index < seeds.length; index += 2) {
        await Promise.all(seeds.slice(index, index + 2).map(seed => new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ['--max-old-space-size=1024',
                new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '--seed', String(seed)],
            { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
            let log = '';
            child.stdout.on('data', chunk => { log += chunk; });
            child.stderr.on('data', chunk => { log += chunk; });
            const timer = setTimeout(() => child.kill(), 180000);
            child.on('error', reject);
            child.on('exit', code => {
                clearTimeout(timer);
                if (code !== 0) reject(new Error('Geography ' + seed + ': ' + log));
                else { console.log(log.trim()); resolve(); }
            });
        })));
    }
    const rows = await Promise.all(seeds.map(seed => readFile(output + '/' + seed + '.json', 'utf8').then(JSON.parse)));
    const files = ['src/config/FjordTerrain.ts', 'src/fjord-play/CampaignIsland.ts',
        'src/world/SeasonTint.ts', 'src/world/WorldFactory.ts', 'src/world/TerrainShading.ts',
        'src/world-generation/GenerateWorld.ts', 'src/world-generation/IslandShape.ts',
        'src/world-generation/EnvironmentZoning.ts', 'scripts/qa/validate-island-promotion.mjs'];
    const sources = {};
    for (const file of files) sources[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    await writeFile(published + '/measurements.json', JSON.stringify({
        generatedAt: new Date().toISOString(), recipe: 'island-pool-v3', sources,
        method: 'Canonical smooth-normal grid samples, not exact rasterized surface area. Four-neighbour connected snow regions.',
        preservation: 'Phase-one survey files remain unchanged; v3 canonical worlds must equal their frozen v2 candidate fingerprints.', rows,
    }, null, 2));
    process.exit(0);
}

const seed = Number(process.argv[3]);
const { createCampaignIsland, campaignIslandPlan, islandRecipe } = load('fjord-play/CampaignIsland');
const { SharedSettlement, inspectSettlementSave } = load('play/SharedSettlement');
const { newFjordScenario } = load('fjord-play/FjordScenario');
const { heightfieldNormalSteps } = load('world/TerrainShading');
const { terrainTriangles } = load('world-generation/TerrainQueries');
const { fjordSnowLine, fjordTerrain } = load('config/FjordTerrain');
const { planRoute, routeLength } = load('simulation/SpatialExpeditions');
const previous = JSON.parse(await readFile('scratch/island-seed-expansion/run-1/results/' + seed + '.json', 'utf8'));
const campaignSeed = Array.from({ length: 1000 }, (_, i) => i).find(i => islandRecipe(i).seed === seed);
assert.notEqual(campaignSeed, undefined);
const started = performance.now();
const owner = new SharedSettlement(newFjordScenario(campaignSeed), undefined, true, 'island-pool-v3');
owner.fjord.enableDiscovery();
const world = owner.fjord.blueprint, plan = campaignIslandPlan(world);
assert.equal(hash(world), previous.blueprintSha256, 'New admission cannot change prepared canonical geography');
const save = owner.persist();
assert.equal(inspectSettlementSave(save).island.seed, seed);
const restored = SharedSettlement.restore(save, 'fjord');
assert.equal(restored.persist(), save);
restored.restart(true);
assert.equal(campaignIslandPlan(restored.fjord.blueprint).recipe.seed, seed);
assert.equal(campaignIslandPlan(restored.fjord.blueprint).recipe.version, 'island-pool-v3');
assert.equal(hash(restored.fjord.blueprint), previous.blueprintSha256);
const corrupted = JSON.parse(save);
corrupted.fjord.island.seed = 999;
assert.throws(() => inspectSettlementSave(JSON.stringify(corrupted)), /recipe/);
assert.equal(owner.persist(), save);

// Only this separate construction fixture has funded Materials and ten independent households.
const core = load('simulation/SimulationCore');
const { createFjordLayout, projectFjordSettlement, geographyIdentity } = load('fjord-play/FjordProjection');
let built = core.createCampaign(campaignSeed, { foundingCoupleCap: 0, initialMaterials: 10000 },
    {}, { enabled: false }, {}, {}, {}, 'summer-800-v1');
for (const personaId of Object.keys(built.personas))
    built = core.applyCommand(built, { type: 'AssignOccupation', personaId, occupation: 'woodworker' });
let view = projectFjordSettlement(built, world, createFjordLayout(world, undefined, campaignSeed));
for (const householdId of Object.keys(built.households))
    built = core.applyCommand(built, { type: 'BuildHouse', householdId });
view = projectFjordSettlement(built, world, view.layout);
assert.equal(view.ground.paths.length, 10);
assert.equal(view.diagnostics.length, 0);
const exclusions = plan.plots.map(plot => ({ minX: plot.x - plot.halfWidth,
    maxX: plot.x + plot.halfWidth, minZ: plot.z - plot.halfDepth, maxZ: plot.z + plot.halfDepth }));
for (const point of [plan.center, world.rivalSite.center]) exclusions.push({
    minX: point.x - 5, maxX: point.x + 5, minZ: point.z - 5, maxZ: point.z + 5 });
const context = { world, worldId: geographyIdentity(world), exclusions };
// The ship's harbor anchor may be in shallow water. Test the closest dry shore
// approach on the canonical navigation field, rather than sending a walker to sea.
const { createBlueprintSurface } = load('world-generation/TerrainQueries');
const surface = createBlueprintSurface(world), harbor = world.settlement.harbor;
const shoreApproaches = [];
for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
    const point = { x: Math.round(harbor.x) + dx, z: Math.round(harbor.z) + dz };
    const index = Math.round((point.z - world.navigation.bounds.minZ) / world.navigation.spacing) *
        world.navigation.columns + Math.round((point.x - world.navigation.bounds.minX) / world.navigation.spacing);
    if (world.navigation.cells[index] && surface.surfaceHeightAt(point.x, point.z) > world.waterLevel + .25 &&
        !exclusions.some(box => point.x >= box.minX - .4 && point.x <= box.maxX + .4 &&
            point.z >= box.minZ - .4 && point.z <= box.maxZ + .4)) shoreApproaches.push(point);
}
shoreApproaches.sort((a, b) => Math.hypot(a.x - harbor.x, a.z - harbor.z) -
    Math.hypot(b.x - harbor.x, b.z - harbor.z) || a.x - b.x || a.z - b.z);
assert.ok(shoreApproaches.length);
const shoreApproach = shoreApproaches[0];
const homeRoutes = view.entities.filter(entity => entity.kind === 'building').map(entity => {
    const origin = entity.transform;
    return { id: entity.id,
        campfireMetres: routeLength(planRoute(context, plan.center, origin, true).route),
        shoreMetres: routeLength(planRoute(context, shoreApproach, origin, true).route) };
});
let rivalRouteMetres = null, directRouteLimitation = null;
try { rivalRouteMetres = routeLength(planRoute(context, world.rivalSite.center, undefined, true).route); }
catch (error) { directRouteLimitation = error.message; }
// Full-field connectivity is a separate observation, not a replacement gameplay
// route or a promise that the bounded direct-destination search will succeed.
const freeNav = { ...world.navigation, cells: world.navigation.cells.map((free, index) => {
    const x = world.navigation.bounds.minX + index % world.navigation.columns * world.navigation.spacing;
    const z = world.navigation.bounds.minZ + Math.floor(index / world.navigation.columns) * world.navigation.spacing;
    return free && !exclusions.some(box => x >= box.minX - .4 && x <= box.maxX + .4 &&
        z >= box.minZ - .4 && z <= box.maxZ + .4);
}) };
const approach = center => {
    const candidates = [];
    for (let z = Math.round(center.z) - 12; z <= Math.round(center.z) + 12; z++)
        for (let x = Math.round(center.x) - 12; x <= Math.round(center.x) + 12; x++) {
            const index = Math.round((z - freeNav.bounds.minZ) / freeNav.spacing) * freeNav.columns +
                Math.round((x - freeNav.bounds.minX) / freeNav.spacing);
            if (freeNav.cells[index]) candidates.push({ x, z });
        }
    candidates.sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) -
        Math.hypot(b.x - center.x, b.z - center.z) || a.x - b.x || a.z - b.z);
    assert.ok(candidates.length);
    return candidates[0];
};
const { siteRoutes } = load('world-generation/SiteNavigation');
const connectedRoute = siteRoutes(freeNav, approach(plan.center))(approach(world.rivalSite.center));
assert.ok(connectedRoute.length, 'Built home and actual nature exclusions must retain a connected rival region');

const newLine = fjordSnowLine(world), oldLine = newLine + 5;
const triangles = terrainTriangles(world.terrain);
const steps = heightfieldNormalSteps(world, triangles);
let step = steps.next();
while (!step.done) step = steps.next();
const normals = step.value.corners;
const { heights, columns, rows, spacing, bounds } = world.terrain;
const eligible = line => heights.map((height, index) => height >= line &&
    normals[index * 3 + 1] >= fjordTerrain.permanentMinimumUp);
const before = eligible(oldLine), after = eligible(newLine);
const land = heights.filter(height => height > world.waterLevel).length;
assert.ok(after.some(Boolean), 'Every approved island has snow-capable highlands');
assert.ok(after.filter(Boolean).length >= before.filter(Boolean).length);
assert.ok(newLine > world.waterLevel + 5, 'Snowline remains above coastal lowlands');
const seen = new Set(), regions = [];
for (let index = 0; index < after.length; index++) {
    if (!after[index] || seen.has(index)) continue;
    const cells = [index]; seen.add(index);
    let sumX = 0, sumZ = 0, low = Infinity, high = -Infinity;
    for (let cursor = 0; cursor < cells.length; cursor++) {
        const i = cells[cursor], col = i % columns, row = Math.floor(i / columns);
        sumX += bounds.minX + col * spacing; sumZ += bounds.minZ + row * spacing;
        low = Math.min(low, heights[i]); high = Math.max(high, heights[i]);
        for (const next of [col ? i - 1 : -1, col < columns - 1 ? i + 1 : -1,
            row ? i - columns : -1, row < rows - 1 ? i + columns : -1]) {
            if (next < 0 || !after[next] || seen.has(next)) continue;
            seen.add(next); cells.push(next);
        }
    }
    regions.push({ samples: cells.length, approximateSquareMetres: cells.length * spacing ** 2,
        center: { x: sumX / cells.length, z: sumZ / cells.length }, minimumY: low, maximumY: high });
}
regions.sort((a, b) => b.samples - a.samples);
for (const [name, mask] of [['before', before], ['after', after]]) {
    const rgb = Buffer.alloc(heights.length * 3);
    for (let i = 0; i < heights.length; i++) {
        const height = heights[i] - world.waterLevel;
        const shade = Math.min(1, Math.max(0, height / 45));
        const color = height <= 0 ? [32, 68, 84] : mask[i] ? [229, 241, 247] :
            [70 + shade * 80, 111 + shade * 40, 78 + shade * 70];
        rgb.set(color.map(Math.round), i * 3);
    }
    await sharp(rgb, { raw: { width: columns, height: rows, channels: 3 } })
        .resize(480, 480, { kernel: 'nearest' }).png().toFile(published + '/maps/' + seed + '-' + name + '.png');
}
const report = { seed, campaignSeed, blueprintSha256: hash(world), canonicalUnchanged: true,
    saveRoundTrip: true, sameFounderRestart: true, rejectedRecipeMismatch: true,
    homeRoutes, shoreApproach, rivalRouteMetres, directRouteLimitation,
    fullFieldRivalRouteMetres: routeLength(connectedRoute), groundPaths: view.ground.paths.length,
    peakY: heights.reduce((highest, height) => Math.max(highest, height), -Infinity),
    previousSnowlineY: oldLine, snowlineY: newLine,
    oldLandSnowPercent: before.filter(Boolean).length / land * 100,
    newLandSnowPercent: after.filter(Boolean).length / land * 100,
    regions, preparationAndChecksMs: performance.now() - started };
await writeFile(output + '/' + seed + '.json', JSON.stringify(report, null, 2));
await writeFile(output + '/' + seed + '-render.json.gz', gzipSync(JSON.stringify({
    world: { config: world.config, terrain: world.terrain, environment: world.environment,
        biomes: world.biomes, waterLevel: world.waterLevel }, plan, report,
})));
console.log(JSON.stringify({ seed, campaignSeed, snowline: newLine,
    snowPercent: report.newLandSnowPercent, regions: regions.length, checked: true }));
