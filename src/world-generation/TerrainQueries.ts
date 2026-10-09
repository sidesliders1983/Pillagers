import type { TerrainField, WorldBlueprint } from './WorldBlueprint';

export interface TerrainSurface {
    readonly bounds: TerrainField['bounds'];
    readonly waterLevel: number;
    surfaceHeightAt(x: number, z: number): number;
    slopeAt(x: number, z: number): number;
}

/** Triangle interpolation is the physical authority; there is no separate smooth height formula. */
export function createBlueprintSurface(world: Pick<WorldBlueprint, 'terrain' | 'waterLevel'>): TerrainSurface {
    const { terrain, waterLevel } = world;
    const { bounds, spacing, columns, rows, heights } = terrain;
    const surfaceHeightAt = (x: number, z: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Coordinates must be finite.');
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) {
            return waterLevel - 7;
        }
        const gx = (x - bounds.minX) / spacing, gz = (z - bounds.minZ) / spacing;
        const col = Math.min(columns - 2, Math.floor(gx));
        const row = Math.min(rows - 2, Math.floor(gz));
        const u = gx - col, v = gz - row, offset = row * columns + col;
        const a = heights[offset], b = heights[offset + columns];
        const c = heights[offset + 1], d = heights[offset + columns + 1];
        if ((row + col) % 2 === 0) {
            return u + v <= 1 ? a * (1-u-v) + b*v + c*u :
                b*(1-u) + c*(1-v) + d*(u+v-1);
        }
        return v >= u ? a*(1-v) + b*(v-u) + d*u : a*(1-u) + d*v + c*(u-v);
    };
    return {
        bounds, waterLevel, surfaceHeightAt,
        slopeAt: (x, z) => Math.hypot(
            surfaceHeightAt(x+1, z) - surfaceHeightAt(x-1, z),
            surfaceHeightAt(x, z+1) - surfaceHeightAt(x, z-1),
        ) / 2,
    };
}

/** Shared mesh topology for rendering and subsequent coast extraction. Winding faces +Y. */
export function terrainTriangles(terrain: TerrainField) {
    const triangles: number[][] = [];
    for (let row = 0; row < terrain.rows - 1; row++) {
        for (let col = 0; col < terrain.columns - 1; col++) {
            const a = row * terrain.columns + col, b = a + terrain.columns;
            const c = a + 1, d = b + 1;
            triangles.push(...((row+col)%2 === 0 ? [[a,b,c],[c,b,d]] : [[a,b,d],[a,d,c]]));
        }
    }
    return triangles;
}
