import type { BuildingPlacement, Bounds2, Point2 } from './WorldBlueprint';
import type { StartingViewpoint, TerrainSightline } from './SettlementVisibility';

export const settlementGeneratorVersion = 'fjordside-island-v0.3e' as const;
export const defaultSiteRules = Object.freeze({
    minimumCenterDistance: 160,
    minimumBufferDistance: 40,
    minimumLandingRoute: 240,
    maximumFoundationAdjustment: .6,
    rivalRoofHeight: 8,
    maximumCandidates: 48,
});
export interface SiteRules {
    readonly minimumCenterDistance: number;
    readonly minimumBufferDistance: number;
    readonly minimumLandingRoute: number;
    readonly maximumFoundationAdjustment: number;
    readonly rivalRoofHeight: number;
    readonly maximumCandidates: number;
}

export function normalizeSiteRules(input: Partial<SiteRules> = {}): SiteRules {
    const rules = { ...defaultSiteRules, ...input };
    for (const key of Object.keys(input)) {
        if (!(key in defaultSiteRules)) throw new Error('Unknown settlement placement rule: ' + key);
    }
    if (!Object.values(rules).every(Number.isFinite) || rules.minimumCenterDistance < 0 ||
        rules.minimumCenterDistance > 1000 || rules.minimumBufferDistance < 0 ||
        rules.minimumBufferDistance > 500 || rules.minimumLandingRoute < 0 ||
        rules.minimumLandingRoute > 2000 || rules.maximumFoundationAdjustment < 0 ||
        rules.maximumFoundationAdjustment > .6 || rules.rivalRoofHeight < 0 ||
        rules.rivalRoofHeight > 30 || !Number.isInteger(rules.maximumCandidates) ||
        rules.maximumCandidates < 2 || rules.maximumCandidates > 64) {
        throw new RangeError('Invalid settlement placement rules.');
    }
    return rules;
}

export interface FoundationReservation extends BuildingPlacement {
    readonly elevation: number;
    readonly adjustment: number;
    readonly naturalSlope: number;
}
export interface SiteCompartment {
    readonly id: string;
    readonly center: Point2;
    readonly area: number;
    readonly coreArea: number;
    readonly eligibleAnchors: number;
    readonly candidateIds: string[];
    sixParcelFits: number;
    readonly reasons: string[];
}
export interface FoundationSearchEvidence {
    readonly attempts: number;
    readonly nodes: number;
    readonly maximumPlaced: number;
    readonly orientationCount: number;
    readonly validPoses: readonly { readonly id: string; readonly count: number }[];
}
export interface SiteCandidate {
    readonly fitSearch?: FoundationSearchEvidence;
    readonly compartmentId?: string;
    readonly id: string;
    readonly center: Point2;
    readonly bounds: Bounds2;
    readonly area: number;
    readonly meanSlope: number;
    readonly maximumSlope: number;
    readonly elevation: number;
    readonly coastDistance: number;
    readonly foundations: readonly FoundationReservation[];
    readonly score: number;
    readonly reasons: readonly string[];
}
export interface SitePairScore {
    readonly visibilityComplete?: boolean;
    readonly visibilitySamples?: number;
    readonly playerId: string;
    readonly rivalId: string;
    readonly centerDistance: number;
    readonly bufferDistance: number;
    readonly routeLength: number;
    readonly exposedRays: number | null;
    readonly score: number;
    readonly reasons: readonly string[];
}
export interface RivalSite {
    readonly version: 1;
    readonly candidateId: string;
    readonly center: Point2;
    readonly bounds: Bounds2;
    readonly foundations: readonly FoundationReservation[];
    readonly buildableArea: number;
}
export interface HarborBerth {
    readonly center: Point2;
    readonly rotation: number;
    readonly halfLength: number;
    readonly halfBeam: number;
    readonly minimumDepth: number;
}
export interface SiteSelection {
    readonly version: 1;
    readonly rules: SiteRules;
    readonly candidates: readonly SiteCandidate[];
    readonly compartments?: readonly SiteCompartment[];
    readonly pairs: readonly SitePairScore[];
    readonly selected: SitePairScore | null;
    readonly harborBerth: HarborBerth | null;
    readonly viewpoints: readonly StartingViewpoint[];
    readonly visibility: { readonly hidden: boolean; readonly exposedRays: number;
        readonly rays: readonly (TerrainSightline & { readonly viewpointId: string })[] };
    /** Natural access proof, not a constructed road or an expedition rule. */
    readonly connection: readonly Point2[];
    readonly buffers: readonly Bounds2[];
    readonly reasons: readonly string[];
}

/** Authored dimensions stay fixed; placement search may rotate the complete parcel. */
export function isFoundationRotation(authored: number, rotation: number) {
    return rotation === authored || Array.from({ length: 8 }, (_, i) => i * Math.PI / 4).includes(rotation);
}
