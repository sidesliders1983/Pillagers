import { normalizeWorldConfig } from './GenerateWorld';
import { freezeBlueprint, generatorVersion, WorldBlueprint } from './WorldBlueprint';
import { natureAssetIds } from '../config/NatureAssets';
import { buildings } from '../world/SettlementLayout';

const schemaVersion = 1;

/** Store the full physical blueprint; loading never invokes the generator. */
export function serializeWorld(blueprint: WorldBlueprint): string {
    return JSON.stringify({ schemaVersion, blueprint });
}

export function parseWorld(text: string): WorldBlueprint {
    if (text.length > 8_000_000) throw new Error('World file exceeds the 8MB limit.');
    const saved = JSON.parse(text);
    if (saved.schemaVersion !== schemaVersion) throw new Error('Unsupported world save version.');
    const world = saved.blueprint as WorldBlueprint;
    if (world?.config?.generatorVersion !== generatorVersion) {
        throw new Error('Unsupported generator version: ' + world?.config?.generatorVersion);
    }
    const requireValid = (condition: boolean) => {
        if (!condition) throw new Error('Invalid world blueprint.');
    };
    const point = (value: { x: number; z: number }) =>
        !!value && Number.isFinite(value.x) && Number.isFinite(value.z) &&
        Math.abs(value.x) <= 90 && Math.abs(value.z) <= 90;
    const normalized = normalizeWorldConfig(world.config);
    requireValid(Object.entries(normalized).every(([key, value]) =>
        world.config[key as keyof typeof normalized] === value));
    const terrain = world.terrain;
    requireValid(!!terrain && terrain.columns === 91 && terrain.rows === 91 && terrain.spacing === 2);
    requireValid(terrain.bounds?.minX === -90 && terrain.bounds.maxX === 90 &&
        terrain.bounds.minZ === -90 && terrain.bounds.maxZ === 90);
    requireValid(Array.isArray(terrain.heights) && terrain.heights.length === 8281 &&
        terrain.heights.every(height => Number.isFinite(height) && height >= -10 && height <= 100));
    requireValid(Number.isFinite(world.waterLevel));
    const nav = world.navigation;
    requireValid(!!nav && nav.columns === 181 && nav.rows === 181 && nav.spacing === 1 &&
        JSON.stringify(nav.bounds) === JSON.stringify(terrain.bounds));
    requireValid(Array.isArray(nav.cells) && nav.cells.length === 32761 &&
        nav.cells.every(cell => typeof cell === 'boolean'));
    const biomes = world.biomes;
    requireValid(!!biomes && Array.isArray(biomes.cells) && biomes.cells.length === 8281 &&
        biomes.cells.every(cell => ['water','shore','clearing','grass','forest','rock'].includes(cell)));
    for (const values of [biomes.waterDistance, biomes.moisture, biomes.worn]) {
        requireValid(Array.isArray(values) && values.length === 8281 && values.every(Number.isFinite));
    }
    requireValid(Array.isArray(world.coast) && world.coast.length <= 20_000 &&
        world.coast.every(segment => point(segment.a) && point(segment.b)));
    const site = world.settlement;
    requireValid(!!site && point(site.center) && Number.isFinite(site.elevation));
    requireValid(!!site.bounds && Object.values(site.bounds).every(Number.isFinite));
    requireValid(Array.isArray(site.buildings) && site.buildings.length === 6 &&
        site.buildings.every(placement => point(placement) && typeof placement.id === 'string' &&
            buildings.some(source => source.key === placement.key && ('terrainKey' in source ? source.terrainKey : undefined) === placement.terrainKey &&
                source.rotation === placement.rotation && source.halfWidth === placement.halfWidth &&
                source.halfDepth === placement.halfDepth && source.radius === placement.radius)));
    requireValid(Array.isArray(site.accessPaths) && site.accessPaths.length <= 7 &&
        site.accessPaths.every(route => Array.isArray(route) && route.length <= 32761 && route.every(point)));
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
