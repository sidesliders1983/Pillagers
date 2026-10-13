import { normalizeWorldConfig } from './GenerateWorld';
import { freezeBlueprint, generatorVersion, firstIslandGeneratorVersion, islandGeneratorVersion, WorldBlueprint } from './WorldBlueprint';
import { natureAssetIds } from '../config/NatureAssets';
import { buildings } from '../world/SettlementLayout';

const schemaVersion = 1;

/** Store the full physical blueprint; loading never invokes the generator. */
export function serializeWorld(blueprint: WorldBlueprint): string {
    return JSON.stringify({ schemaVersion, blueprint });
}

export function parseWorld(text: string): WorldBlueprint {
    if (text.length > 24_000_000) throw new Error('World file exceeds the 24MB limit.');
    const saved = JSON.parse(text);
    if (saved.schemaVersion !== schemaVersion) throw new Error('Unsupported world save version.');
    const world = saved.blueprint as WorldBlueprint;
    if (world?.config?.generatorVersion !== generatorVersion &&
        world?.config?.generatorVersion !== islandGeneratorVersion &&
        world?.config?.generatorVersion !== firstIslandGeneratorVersion) {
        throw new Error('Unsupported generator version: ' + world?.config?.generatorVersion);
    }
    const requireValid = (condition: boolean) => {
        if (!condition) throw new Error('Invalid world blueprint.');
    };
    const normalized = normalizeWorldConfig(world.config);
    const halfWidth = normalized.width / 2, halfDepth = normalized.depth / 2;
    const columns = halfWidth + 1, rows = halfDepth + 1;
    const samples = columns * rows, navSamples = (normalized.width + 1) * (normalized.depth + 1);
    const point = (value: { x: number; z: number }) =>
        !!value && Number.isFinite(value.x) && Number.isFinite(value.z) &&
        Math.abs(value.x) <= halfWidth && Math.abs(value.z) <= halfDepth;
    requireValid(Object.entries(normalized).every(([key, value]) =>
        world.config[key as keyof typeof normalized] === value));
    const maximumHeight = normalized.preset === 'island' ? 120 : 100;
    const minimumHeight = normalized.generatorVersion === islandGeneratorVersion ? -20 : -10;
    const terrain = world.terrain;
    requireValid(!!terrain && terrain.columns === columns && terrain.rows === rows && terrain.spacing === 2);
    requireValid(terrain.bounds?.minX === -halfWidth && terrain.bounds.maxX === halfWidth &&
        terrain.bounds.minZ === -halfDepth && terrain.bounds.maxZ === halfDepth);
    requireValid(Array.isArray(terrain.heights) && terrain.heights.length === samples &&
        terrain.heights.every(height => Number.isFinite(height) && height >= minimumHeight && height <= maximumHeight));
    requireValid(Number.isFinite(world.waterLevel));
    if (normalized.preset === 'island') {
        const geology = world.geology;
        requireValid(!!geology && geology.model === 'rift-glacial-v1');
        requireValid(Array.isArray(geology!.rifts) && geology!.rifts.length >= 1 && geology!.rifts.length <= 3 &&
            geology!.rifts.every(rift => point(rift.a) && point(rift.b) &&
                Number.isFinite(rift.width) && rift.width > 0 && rift.width <= halfWidth));
        requireValid(Array.isArray(geology!.valleys) && geology!.valleys.length <= 12);
        const valleys = geology!.valleys;
        requireValid(new Set(valleys.map(valley => valley.id)).size === valleys.length);
        for (const valley of valleys) {
            requireValid(typeof valley.id === 'string' && valley.id.length <= 80 &&
                Array.isArray(valley.points) && valley.points.length >= 3 && valley.points.length <= 1000 &&
                valley.points.every(point));
            requireValid(Array.isArray(valley.floorHeights) && valley.floorHeights.length === valley.points.length &&
                valley.floorHeights.every((height, i, values) => Number.isFinite(height) &&
                    height >= minimumHeight && height <= 120 && (i === 0 || height <= values[i-1])));
            requireValid(Array.isArray(valley.widths) && valley.widths.length === valley.points.length &&
                valley.widths.every(width => Number.isFinite(width) && width > 0 && width <= 100));
            if (valley.parentId !== null) {
                const parent = valleys.find(other => other.id === valley.parentId && other.parentId === null);
                const end = valley.points[valley.points.length-1];
                requireValid(!!parent && parent.points.some(p => p.x === end.x && p.z === end.z));
            }
        }
    }
    const nav = world.navigation;
    requireValid(!!nav && nav.columns === normalized.width + 1 && nav.rows === normalized.depth + 1 && nav.spacing === 1 &&
        JSON.stringify(nav.bounds) === JSON.stringify(terrain.bounds));
    requireValid(Array.isArray(nav.cells) && nav.cells.length === navSamples &&
        nav.cells.every(cell => typeof cell === 'boolean'));
    const biomes = world.biomes;
    requireValid(!!biomes && Array.isArray(biomes.cells) && biomes.cells.length === samples &&
        biomes.cells.every(cell => ['water','shore','clearing','grass','forest','rock'].includes(cell)));
    for (const values of [biomes.waterDistance, biomes.moisture, biomes.worn]) {
        requireValid(Array.isArray(values) && values.length === samples && values.every(Number.isFinite));
    }
    requireValid(Array.isArray(world.coast) && world.coast.length <= 20_000 &&
        world.coast.every(segment => point(segment.a) && point(segment.b)));
    const site = world.settlement;
    requireValid(!!site && point(site.center) && Number.isFinite(site.elevation));
    requireValid(!!site.bounds && Object.values(site.bounds).every(Number.isFinite));
    requireValid(Array.isArray(site.buildings) && site.buildings.length === (world.config.preset === 'island' ? 0 : 6) &&
        site.buildings.every(placement => point(placement) && typeof placement.id === 'string' &&
            buildings.some(source => source.key === placement.key && ('terrainKey' in source ? source.terrainKey : undefined) === placement.terrainKey &&
                source.rotation === placement.rotation && source.halfWidth === placement.halfWidth &&
                source.halfDepth === placement.halfDepth && source.radius === placement.radius)));
    requireValid(Array.isArray(site.accessPaths) && site.accessPaths.length <= 7 &&
        site.accessPaths.every(route => Array.isArray(route) && route.length <= navSamples && route.every(point)));
    requireValid(site.harbor === null || point(site.harbor));
    requireValid(Array.isArray(world.placementPlan) && world.placementPlan.length <= 2000 &&
        world.placementPlan.every(placement => natureAssetIds.includes(placement.assetId) && point(placement) &&
            Number.isFinite(placement.y) && Number.isFinite(placement.rotation) &&
            placement.scale > 0 && placement.scale <= 2 &&
            placement.clearance > 0 && placement.clearance <= 20));
    requireValid(!!world.validation && typeof world.validation.accepted === 'boolean' &&
        Array.isArray(world.validation.reasons) && world.validation.reasons.every(reason => typeof reason === 'string') &&
        ['connectedBuildings','connectedArea','maximumFoundationSlope','minimumFoundationElevation','score']
            .every(key => Number.isFinite(world.validation[key as keyof typeof world.validation])));
    return freezeBlueprint(world);
}
