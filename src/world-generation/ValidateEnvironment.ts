import { environmentFields, type GroundType } from './EnvironmentZoning';
import type { WorldBlueprint } from './WorldBlueprint';

/** Validate the stored extension without regenerating/migrating physical geography. */
export function validateEnvironment(world: WorldBlueprint, requireValid: (condition: boolean) => void) {
    const zones = world.environment;
    requireValid(Boolean(zones) === Boolean(world.config.environment));
    if (!zones) return;
    const columns = world.config.width / 4 + 1, rows = world.config.depth / 4 + 1;
    const count = columns * rows;
    const types: GroundType[] = ['water', 'grass', 'sand', 'mud', 'bedrock'];
    requireValid(zones.version === 1 && zones.spacing === 4 && zones.columns === columns && zones.rows === rows);
    requireValid(Array.isArray(zones.primary) && zones.primary.length === count &&
        zones.primary.every(ground => types.includes(ground)));
    requireValid(!!zones.fields && Object.keys(zones.fields).length === environmentFields.length);
    for (const key of environmentFields) {
        const values = zones.fields[key];
        const maximum = key === 'aspect' ? Math.PI * 2 + .001 : key === 'slope' ? 100 : 1;
        requireValid(Array.isArray(values) && values.length === count &&
            values.every(value => Number.isFinite(value) && value >= 0 && value <= maximum));
    }
    requireValid(Array.isArray(zones.regions) && zones.regions.length > 0 && zones.regions.length <= count);
    requireValid(Array.isArray(zones.regionIds) && zones.regionIds.length === count &&
        zones.regionIds.every(id => Number.isInteger(id) && id >= 0 && id < zones.regions.length));
    const counts = new Array<number>(zones.regions.length).fill(0);
    const actualBounds = zones.regions.map(() => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
    const coverage = { water: 0, grass: 0, sand: 0, mud: 0, bedrock: 0 };
    for (let index = 0; index < count; index++) {
        const id = zones.regionIds[index], region = zones.regions[id];
        requireValid(!!region && region.ground === zones.primary[index]);
        counts[id]++;
        const x = world.terrain.bounds.minX + index % columns * 4;
        const z = world.terrain.bounds.minZ + Math.floor(index / columns) * 4;
        const bounds = actualBounds[id];
        bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
        coverage[zones.primary[index]]++;
        const sum = zones.fields.grass[index] + zones.fields.sand[index] +
            zones.fields.mud[index] + zones.fields.rockExposure[index];
        requireValid(zones.primary[index] === 'water' ? sum === 0 : Math.abs(sum - 1) <= .003);
        const col = index % columns * 2, row = Math.floor(index / columns) * 2;
        requireValid((world.terrain.heights[row * world.terrain.columns + col] <= world.waterLevel) ===
            (zones.primary[index] === 'water'));
    }
    requireValid(!!zones.coverage && types.every(type => zones.coverage[type] === coverage[type]));
    for (const [id, region] of zones.regions.entries()) {
        requireValid(region.id === id && region.area === counts[id] * 16 && counts[id] > 0 &&
            !!region.bounds && Object.values(region.bounds).every(Number.isFinite) &&
            Object.entries(actualBounds[id]).every(([key, value]) => region.bounds[key as keyof typeof region.bounds] === value) &&
            region.bounds.minX >= world.terrain.bounds.minX && region.bounds.maxX <= world.terrain.bounds.maxX &&
            region.bounds.minZ >= world.terrain.bounds.minZ && region.bounds.maxZ <= world.terrain.bounds.maxZ &&
            region.bounds.minX <= region.bounds.maxX && region.bounds.minZ <= region.bounds.maxZ);
        requireValid(Array.isArray(region.neighbors) && new Set(region.neighbors).size === region.neighbors.length &&
            region.neighbors.every(other => Number.isInteger(other) && other >= 0 && other < zones.regions.length &&
                other !== id && Array.isArray(zones.regions[other]?.neighbors) && zones.regions[other].neighbors.includes(id)));
    }
}
