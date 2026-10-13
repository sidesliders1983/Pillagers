import { inspectMacroIsland, findNaturalSites } from './MacroIsland';
import { islandTerrain } from './IslandShape';
import { islandTerrain as firstIslandTerrain } from './IslandShapeV1';
import { createNoise2D } from 'simplex-noise';
import { seededRandom } from '../config/worldConfig';
import { createBlueprintSurface } from './TerrainQueries';
import { validateNavigation } from './ValidateNavigation';
import { planNature } from './PlanNature';
import { planSettlement, settlementBoundsAt, extractCoast } from './PlanSettlement';
import { fjordWaterConfig } from '../config/FjordWaterConfig';
import {
    freezeBlueprint, generatorVersion, firstIslandGeneratorVersion, islandGeneratorVersion, GenerationRequest, WorldBlueprint,
    WorldGenerationConfig, Point2, ConiferSource,
} from './WorldBlueprint';

export function normalizeWorldConfig(request: GenerationRequest): WorldGenerationConfig {
    if (!Number.isInteger(request.seed) || request.seed < 0 || request.seed > 0xffffffff) {
        throw new RangeError('Seed must be an integer from 0 to 4294967295.');
    }
    const preset = request.preset ?? 'fjord';
    if (!['fjord', 'coastal-valley', 'rocky-inlet', 'island'].includes(preset)) {
        throw new Error('Unknown world preset.');
    }
    const version = preset === 'island' ?
        (request.generatorVersion === firstIslandGeneratorVersion ? firstIslandGeneratorVersion : islandGeneratorVersion) : generatorVersion;
    if (request.generatorVersion && request.generatorVersion !== version) {
        throw new Error('Unsupported generator version: ' + request.generatorVersion);
    }
    if (request.conifers !== undefined && !['kaykit', 'ez-tree'].includes(request.conifers)) {
        throw new Error('Unknown conifer source.');
    }
    const relief = request.relief ?? 1;
    const forestDensity = request.forestDensity ?? 1;
    if (!Number.isFinite(relief) || relief < .5 || relief > 1.5 ||
        !Number.isFinite(forestDensity) || forestDensity < .3 || forestDensity > 1.3) {
        throw new RangeError('Relief must be 0.5–1.5 and forest density 0.3–1.3.');
    }
    const extent = preset === 'island' ? 800 : 180;
    return { seed: request.seed, preset, generatorVersion: version, width: extent, depth: extent,
        relief, forestDensity,
        ...(request.conifers === undefined ? {} : { conifers: request.conifers }) };
}

function segmentDistance(x: number, z: number, a: Point2, b: Point2) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

/** All stochastic geometry uses a private instance of the existing seeded RNG and pinned MIT noise. */
export function generateWorld(request: GenerationRequest): WorldBlueprint {
    const config = normalizeWorldConfig(request);
    const random = seededRandom(config.seed);
    const noise = createNoise2D(seededRandom(config.seed));
    const channelX = -51 + random() * 14;
    const bend = -14 + random() * 23;
    const channel = [
        { x: channelX - 14, z: -48 }, { x: channelX, z: 0 },
        { x: channelX + bend, z: 34 }, { x: channelX - 8 + random() * 22, z: 54 + random() * 16 },
    ];
    const radius = (config.preset === 'coastal-valley' ? 11 :
        config.preset === 'rocky-inlet' ? 15 : 19) + random() * 5;
    const waterLevel = fjordWaterConfig.level;
    const island = config.preset === 'island';
    const formIsland = config.generatorVersion === firstIslandGeneratorVersion ? firstIslandTerrain : islandTerrain;
    const formation = island ? formIsland(config, waterLevel) : null;
    const heights: number[] = formation?.heights ?? [];
    for (let z = -90; !island && z <= 90; z += 2) {
        for (let x = -90; x <= 90; x += 2) {
            const seaDistance = z + 28 + noise(x * .025, 0) * 6;
            const inletDistance = Math.min(...channel.slice(1).map((b, i) =>
                segmentDistance(x, z, channel[i], b))) - radius;
            const distance = Math.min(seaDistance, inletDistance);
            const coastalRise = 2.1 * (1 - Math.exp(-Math.max(0, distance) / 10));
            const north = Math.max(0, Math.min(1, (z - 24) / 62));
            const relief = (config.preset === 'rocky-inlet' ? 1.2 :
                config.preset === 'coastal-valley' ? .75 : 1) * config.relief;
            const mountains = north * north * (23 + noise(x * .026, z * .022) * 11);
            const hills = Math.max(0, noise(x * .025 + 8, z * .023) + .5) * 5;
            const surface = distance <= 0 ? waterLevel + Math.max(-7, distance * .32) :
                waterLevel + .12 + coastalRise + (mountains + hills) * relief *
                Math.min(1, distance / 14) + noise(x * .11, z * .11) * .16;
            heights.push(Math.fround(surface));
        }
    }
    const halfWidth = config.width / 2, halfDepth = config.depth / 2;
    const terrain = { bounds: { minX: -halfWidth, maxX: halfWidth, minZ: -halfDepth, maxZ: halfDepth },
        spacing: 2, columns: config.width / 2 + 1, rows: config.depth / 2 + 1, heights };
    const landscape = { config, waterLevel, terrain,
        ...(formation ? { geology: formation.geology } : {}) };
    const naturalSurface = createBlueprintSurface(landscape);
    let center = { x: 20, z: 2 }, candidateDry = false;
    // Bounded candidate search retains the requested seed and records failure, never reseeds.
    const candidateOffset = Math.floor(random() * 12);
    for (let attempt = 0; attempt < 12 && !island; attempt++) {
        const candidate = (candidateOffset + attempt) % 12;
        center = { x: 20 + (candidate % 6) * 6, z: Math.floor(candidate / 6) * 6 };
        const bounds = settlementBoundsAt(center);
        candidateDry = true;
        for (let z = bounds.minZ; z <= bounds.maxZ; z += 2) {
            for (let x = bounds.minX; x <= bounds.maxX; x += 2) {
                if (naturalSurface.surfaceHeightAt(x, z) < waterLevel + .25) candidateDry = false;
            }
        }
        if (candidateDry) break;
    }
    if (island) {
        const candidates = findNaturalSites({ ...landscape, coast: extractCoast(landscape) });
        candidateDry = candidates.length > 0;
        if (candidateDry) center = { x: candidates[0].x, z: candidates[0].z };
    }
    const siteBounds = settlementBoundsAt(center);
    if (candidateDry && !island) {
        for (let row = 0; row < terrain.rows; row++) {
            for (let col = 0; col < terrain.columns; col++) {
                const x = terrain.bounds.minX + col*2, z = terrain.bounds.minZ + row*2, index = row*terrain.columns+col;
                const distance = Math.hypot(Math.max(siteBounds.minX-x, 0, x-siteBounds.maxX),
                    Math.max(siteBounds.minZ-z, 0, z-siteBounds.maxZ));
                const t = Math.min(1, distance/18), blend = 1-t*t*(3-2*t);
                // Never raise submerged samples to manufacture a dry island or close the fjord.
                if (heights[index] > waterLevel) heights[index] = Math.fround(
                    heights[index] + (2.6-heights[index])*blend*
                    Math.min(1, (heights[index]-waterLevel)/.5));
            }
        }
    }
    const planned = { ...landscape, ...planSettlement(landscape, center, candidateDry) };
    const world = { ...planned, ...planNature(planned) };
    return freezeBlueprint({ ...world, validation: validateGeneratedWorld(world) });
}

/** Replan scenery and its navigation while retaining the stored geography and settlement. */
export function changeWorldConifers(world: WorldBlueprint, conifers: ConiferSource): WorldBlueprint {
    const config = normalizeWorldConfig({ ...world.config, conifers });
    const candidateDry = !world.validation.reasons.some(reason =>
        reason.startsWith('No naturally '));
    const foundation = planSettlement(world, world.settlement.center, candidateDry);
    const landscape = { ...world, config, navigation: foundation.navigation,
        validation: foundation.validation };
    const planned = { ...landscape, ...planNature(landscape) };
    return freezeBlueprint({ ...planned, validation: validateGeneratedWorld(planned) });
}

function validateGeneratedWorld(world: WorldBlueprint) {
    const navigation = validateNavigation(world);
    const reasons = world.config.preset === 'island' ? [...new Set([...navigation.reasons,
        ...inspectMacroIsland(world).reasons])] : navigation.reasons;
    return { ...navigation, accepted: reasons.length === 0, reasons };
}
