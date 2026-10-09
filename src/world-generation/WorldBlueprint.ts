import type { NatureAssetKey } from '../config/NatureAssets';

/** A versioned geographical proposal. It contains no Simulation Core inhabitants or resources. */
export const generatorVersion = 'fjordside-v0.1' as const;
export type ConiferSource = 'kaykit' | 'ez-tree';
export type WorldPreset = 'fjord' | 'coastal-valley' | 'rocky-inlet';
export type Point2 = Readonly<{ x: number; z: number }>;
export type Bounds2 = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;

export interface GenerationRequest {
    seed: number;
    preset?: WorldPreset;
    generatorVersion?: string;
    relief?: number;
    forestDensity?: number;
    conifers?: ConiferSource;
}

export interface WorldGenerationConfig {
    readonly seed: number;
    readonly generatorVersion: typeof generatorVersion;
    readonly preset: WorldPreset;
    readonly width: number;
    readonly depth: number;
    readonly relief: number;
    readonly forestDensity: number;
    /** Missing in original v0.1 blueprints means KayKit; old saves remain unchanged. */
    readonly conifers?: ConiferSource;
}

export interface TerrainField {
    readonly bounds: Bounds2;
    readonly spacing: number;
    readonly columns: number;
    readonly rows: number;
    readonly heights: readonly number[];
}

export interface BuildingPlacement extends Point2 {
    readonly id: string;
    readonly key: string;
    readonly terrainKey?: string;
    readonly rotation: number;
    readonly halfWidth: number;
    readonly halfDepth: number;
    readonly radius: number;
}

export interface CoastSegment {
    readonly a: Point2;
    readonly b: Point2;
}

export interface SettlementSite {
    readonly center: Point2;
    readonly bounds: Bounds2;
    readonly elevation: number;
    readonly buildings: readonly BuildingPlacement[];
    readonly accessPaths: readonly (readonly Point2[])[];
    readonly harbor: Point2 | null;
}

export interface WalkabilityField {
    readonly bounds: Bounds2;
    readonly spacing: number;
    readonly columns: number;
    readonly rows: number;
    readonly cells: readonly boolean[];
}

export interface WorldValidation {
    readonly accepted: boolean;
    readonly reasons: readonly string[];
    readonly connectedBuildings: number;
    readonly connectedArea: number;
    readonly maximumFoundationSlope: number;
    readonly minimumFoundationElevation: number;
    readonly score: number;
}

export type Biome = 'water' | 'shore' | 'clearing' | 'grass' | 'forest' | 'rock';
export interface BiomeField {
    readonly cells: readonly Biome[];
    readonly waterDistance: readonly number[];
    readonly moisture: readonly number[];
    readonly worn: readonly number[];
    readonly coverage: Readonly<Record<Biome, number>>;
}
export interface AssetPlacement extends Point2 {
    readonly assetId: NatureAssetKey;
    readonly y: number;
    readonly rotation: number;
    readonly scale: number;
    readonly clearance: number;
}

export interface WorldBlueprint {
    readonly config: WorldGenerationConfig;
    readonly waterLevel: number;
    readonly terrain: TerrainField;
    readonly coast: readonly CoastSegment[];
    readonly settlement: SettlementSite;
    readonly navigation: WalkabilityField;
    readonly validation: WorldValidation;
    readonly biomes: BiomeField;
    readonly placementPlan: readonly AssetPlacement[];
}

export function freezeBlueprint<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeBlueprint(child);
        Object.freeze(value);
    }
    return value;
}
