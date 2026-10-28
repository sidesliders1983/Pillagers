import type { OreSitePlan } from './OreSites';
import type { EnvironmentConfig, EnvironmentRequest, EnvironmentZones } from './EnvironmentZoning';
import type {
    RivalSite, SiteSelection, SiteRules, settlementGeneratorVersion, gentlerSettlementGeneratorVersion,
    discoverySettlementGeneratorVersion,
} from './SettlementSites';
import type { NatureAssetKey } from '../config/NatureAssets';

/** A versioned geographical proposal. It contains no inhabitants or mutable Simulation Core inventories. */
export const generatorVersion = 'fjordside-v0.1' as const;
export const firstIslandGeneratorVersion = 'fjordside-island-v0.3b' as const;
export const islandGeneratorVersion = 'fjordside-island-v0.3b-r2' as const;
export const gentlerIslandGeneratorVersion = 'fjordside-island-v0.3b-r3' as const;
export type ConiferSource = 'kaykit' | 'ez-tree';
export type WorldPreset = 'fjord' | 'coastal-valley' | 'rocky-inlet' | 'island';
export type Point2 = Readonly<{ x: number; z: number }>;
export type Bounds2 = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;

export interface GenerationRequest {
    seed: number;
    preset?: WorldPreset;
    generatorVersion?: string;
    relief?: number;
    forestDensity?: number;
    conifers?: ConiferSource;
    siteRules?: Partial<SiteRules>;
    environment?: EnvironmentRequest;
}

export interface WorldGenerationConfig {
    readonly seed: number;
    readonly generatorVersion: typeof generatorVersion | typeof firstIslandGeneratorVersion |
        typeof islandGeneratorVersion | typeof gentlerIslandGeneratorVersion |
        typeof settlementGeneratorVersion | typeof gentlerSettlementGeneratorVersion |
        typeof discoverySettlementGeneratorVersion;
    readonly preset: WorldPreset;
    readonly width: number;
    readonly depth: number;
    readonly relief: number;
    readonly forestDensity: number;
    /** Missing in original v0.1 blueprints means KayKit; old saves remain unchanged. */
    readonly conifers?: ConiferSource;
    readonly siteRules?: SiteRules;
    readonly environment?: EnvironmentConfig;
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

export interface GlacialValley {
    readonly id: string;
    readonly parentId: string | null;
    readonly points: readonly Point2[];
    readonly floorHeights: readonly number[];
    readonly widths: readonly number[];
}

export interface IslandGeology {
    readonly model: 'rift-glacial-v1';
    readonly rifts: readonly { a: Point2; b: Point2; width: number }[];
    readonly valleys: readonly GlacialValley[];
}

export interface WorldBlueprint {
    readonly oreSites?: OreSitePlan;
    readonly config: WorldGenerationConfig;
    readonly geology?: IslandGeology;
    readonly waterLevel: number;
    readonly terrain: TerrainField;
    readonly coast: readonly CoastSegment[];
    readonly settlement: SettlementSite;
    readonly rivalSite?: RivalSite;
    readonly siteSelection?: SiteSelection;
    readonly navigation: WalkabilityField;
    readonly validation: WorldValidation;
    readonly biomes: BiomeField;
    readonly environment?: EnvironmentZones;
    readonly placementPlan: readonly AssetPlacement[];
}

export function freezeBlueprint<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeBlueprint(child);
        Object.freeze(value);
    }
    return value;
}
