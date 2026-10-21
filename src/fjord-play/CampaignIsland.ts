import { measureGeneration, type GenerationObserver } from '../world-generation/GenerationProfile';
import { siteRoutes } from '../world-generation/SiteNavigation';
import { harborDepth } from '../world-generation/HarborClearance';
import { fitsBuildingFoundation } from '../world/BuildingPlot';
import { generateWorld } from '../world-generation/GenerateWorld';
import { islandTerrain } from '../world-generation/IslandShape';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { planSettlement, gradeSettlementFoundations, footprintBounds } from '../world-generation/PlanSettlement';
import { zoneEnvironment } from '../world-generation/EnvironmentZoning';
import { planNature } from '../world-generation/PlanNature';
import { planVillageNature } from './VillageNature';
import { freezeBlueprint, type Bounds2, type Point2, type WorldBlueprint } from '../world-generation/WorldBlueprint';
import { discoverySettlementGeneratorVersion } from '../world-generation/SettlementSites';

export const currentIslandVersion = 'island-pool-v2' as const;
export type IslandRecipeVersion = 'island-pool-v1' | typeof currentIslandVersion;
export type CampaignGeography = 'legacy' | IslandRecipeVersion;
export interface IslandRecipe {
    version: IslandRecipeVersion;
    generatorVersion: typeof discoverySettlementGeneratorVersion;
    seed: number;
}
export interface IslandPlot extends Point2 {
    y: number;
    halfWidth: number;
    halfDepth: number;
    rotation: number;
    scale: number;
}
export interface CampaignIslandPlan {
    recipe: IslandRecipe;
    center: Point2;
    plots: readonly IslandPlot[];
    maximumAdjustment: number;
    access: { centerDistance: number; reserveGap: number; campRoute: number; rivalRoute: number; minimumDepth: number };
    berth: NonNullable<WorldBlueprint['siteSelection']>['harborBerth'];
}
const pool = [18, 7] as const;
const plans = new WeakMap<WorldBlueprint, CampaignIslandPlan>();
// Bounded cache: world geometry is shared, while every campaign owns its layout and Core.
const worlds = new Map<string, WorldBlueprint>();
export const campaignIslandPlan = (world: WorldBlueprint) => plans.get(world);

export function islandRecipe(campaignSeed: number, version: IslandRecipeVersion = currentIslandVersion): IslandRecipe {
    if (version !== 'island-pool-v1' && version !== currentIslandVersion)
        throw new Error('Unsupported campaign island recipe version.');
    if (!Number.isInteger(campaignSeed) || campaignSeed < 0 || campaignSeed > 0xffffffff)
        throw new RangeError('Seed must be an integer from 0 to 4294967295.');
    const hash = Math.imul(campaignSeed ^ (campaignSeed >>> 16), 0x45d9f3b) >>> 0;
    return { version, generatorVersion: discoverySettlementGeneratorVersion,
        seed: pool[hash % pool.length] };
}

/** A pinned campaign recipe prepares the existing generator's canonical surface.
 * Only local foundations change. No second biome classifier or saved heightfield is introduced. */
export function createCampaignIsland(campaignSeed: number, saved?: IslandRecipe, observe?: GenerationObserver): WorldBlueprint {
    const recipe = islandRecipe(campaignSeed, saved?.version);
    if (saved && (saved.version !== recipe.version || saved.seed !== recipe.seed ||
        saved.generatorVersion !== recipe.generatorVersion))
        throw new Error('Campaign island recipe does not match its seed or supported version.');
    const cacheKey = recipe.version + ':' + recipe.seed;
    const cached = worlds.get(cacheKey);
    if (cached) return cached;
    const source = generateWorld({ seed: recipe.seed, preset: 'island',
        generatorVersion: recipe.generatorVersion, conifers: 'ez-tree', environment: { version: 1 } }, observe);
    const world = prepareCampaignIsland(source, recipe.version, observe);
    worlds.set(cacheKey, world);
    return world;
}

/** Shared production preparation, also used by the offline geography survey.
 * This does not admit a recipe to gameplay or retain the candidate in the world cache.
 * Normal creation, import and worker adoption still require the approved pool mapping. */
export function prepareCampaignIsland(source: WorldBlueprint, version: IslandRecipeVersion,
    observe?: GenerationObserver): WorldBlueprint {
    if (version !== 'island-pool-v1' && version !== currentIslandVersion)
        throw new Error('Unsupported campaign island recipe version.');
    if (source.config.preset !== 'island' ||
        source.config.generatorVersion !== discoverySettlementGeneratorVersion ||
        source.config.conifers !== 'ez-tree' || source.config.environment?.version !== 1)
        throw new Error('Campaign preparation requires the pinned r3 island configuration.');
    const recipe: IslandRecipe = { version, generatorVersion: discoverySettlementGeneratorVersion,
        seed: source.config.seed };
    if (!source.validation.accepted || !source.siteSelection?.harborBerth || !source.rivalSite)
        throw new Error('The curated island no longer passes its geographical validation.');
    // The Lab's six demonstration buildings are not campaign houses. Start with the
    // same natural heightfield, retaining the rival's reserved foundations only.
    const natural = { ...source, terrain: { ...source.terrain,
        heights: measureGeneration('campaign-natural-terrain', () => islandTerrain(source.config, source.waterLevel), observe).heights } };
    const terrain = gradeSettlementFoundations(natural, source.rivalSite.foundations);
    const landscape = { ...natural, terrain };
    const bounds = {
        minX: source.settlement.bounds.minX - 40, maxX: source.settlement.bounds.maxX + 40,
        minZ: source.settlement.bounds.minZ - 40, maxZ: source.settlement.bounds.maxZ + 40,
    };
    const layout = measureGeneration('campaign-foundations', () => findCampaignPlots(landscape, bounds, source.settlement.center), observe);
    const prepared = applyFoundations(landscape, layout.foundations);
    const foundation = planSettlement(prepared, layout.center, true, { placements: [], bounds });
    if (!foundation.validation.accepted)
        throw new Error('The curated campaign has no safe connected landing.');
    const { siteSelection: _labProof, ...withoutLabProof } = source;
    const placed = { ...withoutLabProof, terrain: prepared.terrain, ...foundation,
        settlement: { ...foundation.settlement, harbor: source.settlement.harbor } };
    const zoned = { ...placed, environment: measureGeneration('campaign-zoning', () => zoneEnvironment(placed, source.config.environment!), observe) };
    observe?.preview?.(zoned);
    const world = measureGeneration('campaign-nature-and-freeze', () => {
        const nature = recipe.version === 'island-pool-v1' ? planNature(zoned) : planVillageNature(zoned, {
            sites: [layout.center, source.rivalSite!.center],
            foundations: [...layout.foundations.map(p => ({ minX: p.x - p.halfSize,
                maxX: p.x + p.halfSize, minZ: p.z - p.halfSize, maxZ: p.z + p.halfSize })),
                source.rivalSite!.bounds, ...source.rivalSite!.foundations.map(p => footprintBounds(p))],
            routes: [[layout.center, ...source.siteSelection!.connection],
                [layout.center, source.settlement.harbor!],
                ...layout.foundations.slice(1).map(p => [layout.center, p])]
        });
        return freezeBlueprint({ ...zoned, ...nature });
    }, observe);
    const surface = createBlueprintSurface(world);
    const plots = layout.foundations.slice(1).map(p => ({ x: p.x, z: p.z,
        y: surface.surfaceHeightAt(p.x, p.z), halfWidth: 7.5, halfDepth: 7.5,
        rotation: Math.PI, scale: 1 }));
    const maximumAdjustment = world.terrain.heights.reduce((max, h, i) =>
        Math.max(max, Math.abs(h - natural.terrain.heights[i])), 0);
    if (maximumAdjustment > .600001) throw new Error('Campaign foundation grading exceeds 0.6 metres.');
    const rival = world.rivalSite!;
    const reserveGap = Math.hypot(Math.max(bounds.minX - rival.bounds.maxX, rival.bounds.minX - bounds.maxX, 0),
        Math.max(bounds.minZ - rival.bounds.maxZ, rival.bounds.minZ - bounds.maxZ, 0));
    const routes = siteRoutes(world.navigation, world.settlement.harbor!);
    const access = { centerDistance: Math.hypot(layout.center.x - rival.center.x, layout.center.z - rival.center.z),
        reserveGap, campRoute: routes(layout.center).length - 1,
        rivalRoute: routes(rival.center).length - 1,
        minimumDepth: harborDepth(world, source.siteSelection.harborBerth) };
    const rules = source.siteSelection.rules;
    if (access.centerDistance < rules.minimumCenterDistance || reserveGap < rules.minimumBufferDistance ||
        access.campRoute <= 0 || access.rivalRoute < rules.minimumLandingRoute || access.minimumDepth < .5 ||
        plots.some(plot => !fitsBuildingFoundation(surface, plot)))
        throw new Error('The curated campaign fails its foundation, separation or access contract.');
    plans.set(world, freezeBlueprint({ recipe, center: layout.center, plots, maximumAdjustment, access,
        berth: source.siteSelection.harborBerth }));
    return world;
}

/** Accept a validated result from our generation worker, restoring metadata lost by structured clone.
 * This is not an import/file-validation entry point. Only the trusted worker calls it. */
export function adoptCampaignIsland(seed: number, world: WorldBlueprint, plan: CampaignIslandPlan,
    requested?: IslandRecipe) {
    const expected = islandRecipe(seed, requested?.version ?? plan?.recipe?.version);
    if (requested && (requested.version !== expected.version || requested.seed !== expected.seed ||
        requested.generatorVersion !== expected.generatorVersion) ||
        !plan || JSON.stringify(plan.recipe) !== JSON.stringify(expected) ||
        world.config.seed !== expected.seed || world.config.generatorVersion !== expected.generatorVersion ||
        !world.validation.accepted || plan.plots.length < 10)
        throw new Error('Worker campaign island recipe or validation does not match the request.');
    freezeBlueprint(world);
    plans.set(world, freezeBlueprint(plan));
    worlds.set(expected.version + ':' + expected.seed, world);
}

interface Foundation extends Point2 {
    halfSize: number;
    elevation: number;
    samples: { index: number; weight: number }[];
}
function inspectFoundation(world: WorldBlueprint, x: number, z: number, halfSize: number): Foundation | null {
    const surface = createBlueprintSurface(world), terrain = world.terrain;
    const support = terrain.spacing * Math.SQRT2, reach = halfSize + support + 4;
    const samples: Foundation['samples'] = [];
    let low = Infinity, high = -Infinity;
    for (let row = Math.floor((z - reach - terrain.bounds.minZ) / terrain.spacing);
        row <= Math.ceil((z + reach - terrain.bounds.minZ) / terrain.spacing); row++) {
        for (let col = Math.floor((x - reach - terrain.bounds.minX) / terrain.spacing);
            col <= Math.ceil((x + reach - terrain.bounds.minX) / terrain.spacing); col++) {
            if (row < 0 || col < 0 || row >= terrain.rows || col >= terrain.columns) return null;
            const px = terrain.bounds.minX + col * terrain.spacing;
            const pz = terrain.bounds.minZ + row * terrain.spacing;
            const distance = Math.max(Math.abs(px - x) - halfSize, Math.abs(pz - z) - halfSize);
            const weight = Math.max(0, Math.min(1, 1 - (distance - support) / 4));
            if (!weight) continue;
            const index = row * terrain.columns + col, height = terrain.heights[index];
            if (height < world.waterLevel + .25) return null;
            if (weight === 1) {
                if (surface.slopeAt(px, pz) > .12) return null;
                low = Math.min(low, height);
                high = Math.max(high, height);
                if (high - low > 1.2) return null;
            }
            samples.push({ index, weight });
        }
    }
    const elevation = (low + high) / 2;
    if (samples.some(p => Math.abs(terrain.heights[p.index] - elevation) * p.weight > .6)) return null;
    return { x, z, halfSize, elevation, samples };
}
function findCampaignPlots(world: WorldBlueprint, bounds: Bounds2, preferred: Point2) {
    const candidates: Foundation[] = [];
    for (let z = Math.ceil(bounds.minZ + 10); z <= bounds.maxZ - 10; z += 2)
        for (let x = Math.ceil(bounds.minX + 10); x <= bounds.maxX - 10; x += 2) {
            const foundation = inspectFoundation(world, x, z, 7.5);
            if (foundation) candidates.push(foundation);
        }
    let best: { center: Point2; foundations: Foundation[]; score: number } | undefined;
    for (let dz = -16; dz <= 16; dz += 8) for (let dx = -16; dx <= 16; dx += 8) {
        const center = { x: preferred.x + dx, z: preferred.z + dz };
        const camp = inspectFoundation(world, center.x, center.z, 4.4);
        if (!camp) continue;
        for (let order = 0; order < 4; order++) {
            const sorted = [...candidates].sort((a, b) => order === 0 ?
                Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z) :
                order === 1 ? a.z - b.z || a.x - b.x :
                    order === 2 ? a.x - b.x || a.z - b.z : b.z - a.z || b.x - a.x);
            const selected: Foundation[] = [];
            for (const p of sorted) {
                if (Math.hypot(Math.max(0, Math.abs(p.x - center.x) - 7.5),
                    Math.max(0, Math.abs(p.z - center.z) - 7.5)) < 9) continue;
                if (selected.some(q => Math.abs(p.x - q.x) < 22 && Math.abs(p.z - q.z) < 22)) continue;
                selected.push(p);
            }
            // Prefer capacity, then a nucleus near the original natural pocket.
            const score = selected.length * 1000 - Math.hypot(dx, dz);
            if (!best || score > best.score) best = { center, foundations: [camp, ...selected], score };
        }
    }
    if (!best || best.foundations.length < 11)
        throw new Error('The curated island cannot accommodate ten full-sized campaign households.');
    best.foundations.splice(1, best.foundations.length - 1, ...best.foundations.slice(1).sort((a, b) =>
        Math.hypot(a.x - best!.center.x, a.z - best!.center.z) -
        Math.hypot(b.x - best!.center.x, b.z - best!.center.z) || a.z - b.z || a.x - b.x));
    return best;
}
function applyFoundations(world: WorldBlueprint, foundations: readonly Foundation[]) {
    const heights = [...world.terrain.heights];
    const influence = new Float32Array(heights.length);
    for (const foundation of foundations) for (const { index, weight } of foundation.samples) {
        // A full supporting triangle always wins over a neighbouring feathered edge.
        if (weight <= influence[index]) continue;
        influence[index] = weight;
        heights[index] = Math.fround(world.terrain.heights[index] +
            (foundation.elevation - world.terrain.heights[index]) * weight);
    }
    return { ...world, terrain: { ...world.terrain, heights } };
}
