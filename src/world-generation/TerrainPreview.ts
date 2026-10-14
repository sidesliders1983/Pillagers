import type { Bounds2, WorldBlueprint } from './WorldBlueprint';

export type TerrainPreviewSource = Pick<WorldBlueprint, 'terrain' | 'waterLevel'> &
    Partial<Pick<WorldBlueprint, 'environment'>>;
/** Public geographic silhouette only: no sites, buildings, nature placements or navigation. */
export interface TerrainPreview {
    bounds: Bounds2;
    columns: number;
    rows: number;
    waterLevel: number;
    heights: Float32Array;
    ground: Uint8Array;
}
export const previewGround = ['water', 'grass', 'sand', 'mud', 'bedrock'] as const;
export function terrainPreview(source: TerrainPreviewSource): TerrainPreview {
    const { terrain, environment } = source;
    const columns = Math.min(128, terrain.columns), rows = Math.min(128, terrain.rows);
    const heights = new Float32Array(columns * rows), ground = new Uint8Array(heights.length);
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const r = Math.round(row * (terrain.rows - 1) / (rows - 1));
        const c = Math.round(col * (terrain.columns - 1) / (columns - 1));
        const index = row * columns + col;
        heights[index] = terrain.heights[r * terrain.columns + c];
        if (environment) {
            const er = Math.round(row * (environment.rows - 1) / (rows - 1));
            const ec = Math.round(col * (environment.columns - 1) / (columns - 1));
            ground[index] = previewGround.indexOf(environment.primary[er * environment.columns + ec]);
        } else ground[index] = heights[index] <= source.waterLevel ? 0 : 1;
    }
    return { bounds: { ...terrain.bounds }, columns, rows, waterLevel: source.waterLevel, heights, ground };
}
