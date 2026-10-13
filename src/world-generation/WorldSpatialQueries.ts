import { validateNavigation } from './ValidateNavigation';
import { createSpatialConstraints } from './SpatialConstraints';
import { sampleEnvironment } from './EnvironmentZoning';
import { createBlueprintSurface, terrainGradientAt } from './TerrainQueries';
import type { WorldBlueprint } from './WorldBlueprint';

/** A derived view: cells reuse the navigation lattice; nothing is added to the blueprint/save. */
export function createWorldSpatialQueries(world: WorldBlueprint) {
    const { bounds, spacing, columns, rows } = world.navigation;
    const surface = createBlueprintSurface(world);
    const constraints = createSpatialConstraints(world);
    const sample = (x: number, z: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Coordinates must be finite.');
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return null;
        const column = Math.round((x - bounds.minX) / spacing);
        const row = Math.round((z - bounds.minZ) / spacing);
        const centerX = bounds.minX + column * spacing, centerZ = bounds.minZ + row * spacing;
        const height = surface.surfaceHeightAt(x, z);
        const zone = sampleEnvironment(world, x, z);
        const gradient = terrainGradientAt(world, x, z);
        const slope = Math.hypot(gradient.x, gradient.z);
        const aspect = (Math.atan2(-gradient.x, -gradient.z) * 180 / Math.PI + 360) % 360;
        return {
            ...constraints.sample(x, z, row * columns + column, height, slope),
            position: { x, z },
            cell: {
                id: `spatial-v1:${row}:${column}`, index: row * columns + column, row, column,
                center: { x: centerX, z: centerZ },
                bounds: {
                    minX: Math.max(bounds.minX, centerX - spacing / 2),
                    maxX: Math.min(bounds.maxX, centerX + spacing / 2),
                    minZ: Math.max(bounds.minZ, centerZ - spacing / 2),
                    maxZ: Math.min(bounds.maxZ, centerZ + spacing / 2),
                },
            },
            surface: { height, elevation: height - world.waterLevel, water: height <= world.waterLevel,
                slope, slopeDegrees: Math.atan(slope) * 180 / Math.PI,
                aspectDegrees: slope < .001 ? null : aspect },
            zone,
            zoneWaterMismatch: zone ? (zone.primary === 'water') !== (height <= world.waterLevel) : null,
        };
    };
    return {
        version: 1 as const,
        storage: constraints.storage,
        navigationReport: () => validateNavigation(world),
        grid: { bounds, spacing, columns, rows },
        sample,
        cell(index: number) {
            if (!Number.isInteger(index) || index < 0 || index >= rows * columns) return null;
            return sample(bounds.minX + index % columns * spacing,
                bounds.minZ + Math.floor(index / columns) * spacing);
        },
    };
}

export type WorldSpatialQueries = ReturnType<typeof createWorldSpatialQueries>;
export type SpatialSample = NonNullable<ReturnType<WorldSpatialQueries['sample']>>;
