import { findHarborBerth } from './HarborClearance';
import { buildings, buildingDistance } from '../world/SettlementLayout';
import { footprintSamples } from './PlanIslandSettlements';
import { settlementStartingViews } from './SiteNavigation';
import { inspectSiteVisibility } from './SettlementVisibility';
import { normalizeSiteRules } from './SettlementSites';
import type { WorldBlueprint, Bounds2, Point2 } from './WorldBlueprint';
import type { FoundationReservation } from './SettlementSites';

/** Validate saved reservation evidence; never regenerate or replace stored geography. */
export function validateSavedSites(world: WorldBlueprint, requireValid: (valid: boolean) => void) {
    const selection = world.siteSelection;
    requireValid(!!selection && selection.version === 1);
    if (!selection) return;
    const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    requireValid(equal(normalizeSiteRules(selection.rules), world.config.siteRules));
    const terrainBounds = world.terrain.bounds;
    const point = (p: Point2) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z) &&
        p.x >= terrainBounds.minX && p.x <= terrainBounds.maxX &&
        p.z >= terrainBounds.minZ && p.z <= terrainBounds.maxZ;
    const bounds = (b: Bounds2) => !!b && point({ x: b.minX, z: b.minZ }) &&
        point({ x: b.maxX, z: b.maxZ }) && b.minX < b.maxX && b.minZ < b.maxZ;
    const foundation = (b: FoundationReservation) => point(b) && typeof b.id === 'string' &&
        Number.isFinite(b.elevation) && Number.isFinite(b.adjustment) && b.adjustment >= 0 &&
        b.adjustment <= selection.rules.maximumFoundationAdjustment &&
        Number.isFinite(b.naturalSlope) && b.naturalSlope >= 0 && b.naturalSlope <= .12 &&
        buildings.some(source => source.key === b.key && source.rotation === b.rotation &&
            source.halfWidth === b.halfWidth && source.halfDepth === b.halfDepth &&
            source.radius === b.radius && ('terrainKey' in source ? source.terrainKey : undefined) === b.terrainKey);
    requireValid(Array.isArray(selection.candidates) && selection.candidates.length <= selection.rules.maximumCandidates);
    const candidates = selection.candidates;
    requireValid(new Set(candidates.map(c => c.id)).size === candidates.length);
    for (const c of candidates) {
        requireValid(typeof c.id === 'string' && c.id.length <= 32 && point(c.center) && bounds(c.bounds) &&
            [c.area, c.meanSlope, c.maximumSlope, c.elevation, c.coastDistance, c.score].every(Number.isFinite) &&
            c.area >= 3000 && Array.isArray(c.reasons) && c.reasons.every(r => typeof r === 'string') &&
            Array.isArray(c.foundations) && (c.foundations.length === 0 || c.foundations.length === 6) &&
            c.foundations.every(foundation));
    }
    requireValid(Array.isArray(selection.pairs) && selection.pairs.length <= candidates.length * (candidates.length - 1));
    for (const pair of selection.pairs) {
        requireValid(candidates.some(c => c.id === pair.playerId) && candidates.some(c => c.id === pair.rivalId) &&
            pair.playerId !== pair.rivalId &&
            [pair.centerDistance, pair.bufferDistance, pair.routeLength, pair.score].every(Number.isFinite) &&
            (pair.exposedRays === null || Number.isInteger(pair.exposedRays) && pair.exposedRays >= 0) &&
            Array.isArray(pair.reasons) && pair.reasons.every(r => typeof r === 'string'));
    }
    requireValid(Array.isArray(selection.reasons) && selection.reasons.every(r => typeof r === 'string'));
    requireValid(Array.isArray(selection.connection) && selection.connection.length <= world.navigation.cells.length &&
        selection.connection.every(point));
    requireValid(Array.isArray(selection.viewpoints) && selection.viewpoints.length <= 3);
    requireValid(Array.isArray(selection.buffers) && selection.buffers.length <= 2 && selection.buffers.every(bounds));
    requireValid(!!selection.visibility && Array.isArray(selection.visibility.rays) && selection.visibility.rays.length <= 12000);
    if (selection.selected === null) {
        requireValid(!world.rivalSite && !world.validation.accepted && selection.reasons.length > 0 &&
            selection.harborBerth === null && selection.connection.length === 0 && selection.viewpoints.length === 0 && selection.visibility.rays.length === 0);
        return;
    }
    const selected = selection.selected;
    requireValid(selection.pairs.some(pair => equal(pair, selected)) && selected.reasons.length === 0);
    const player = candidates.find(c => c.id === selected.playerId);
    const rival = candidates.find(c => c.id === selected.rivalId);
    requireValid(!!player && !!rival && !!world.rivalSite);
    if (!player || !rival || !world.rivalSite) return;
    requireValid(equal(player.center, world.settlement.center) && equal(player.bounds, world.settlement.bounds) &&
        equal(player.foundations, world.settlement.buildings));
    requireValid(equal(world.rivalSite, { version: 1, candidateId: rival.id, center: rival.center,
        bounds: rival.bounds, foundations: rival.foundations, buildableArea: rival.area }));
    const centerDistance = Math.hypot(player.center.x - rival.center.x, player.center.z - rival.center.z);
    const bufferDistance = Math.hypot(Math.max(0, player.bounds.minX - rival.bounds.maxX,
        rival.bounds.minX - player.bounds.maxX), Math.max(0, player.bounds.minZ - rival.bounds.maxZ,
        rival.bounds.minZ - player.bounds.maxZ));
    requireValid(centerDistance === selected.centerDistance && centerDistance >= selection.rules.minimumCenterDistance &&
        bufferDistance === selected.bufferDistance && bufferDistance >= selection.rules.minimumBufferDistance);
    const nav = world.navigation, route = selection.connection;
    requireValid(route.length > 1 && equal(route[0], world.settlement.harbor) && equal(route[route.length - 1], rival.center) &&
        selected.routeLength === (route.length - 1) * nav.spacing && selected.routeLength >= selection.rules.minimumLandingRoute);
    for (let i = 0; i < route.length; i++) {
        const p = route[i];
        const cell = Math.round(p.z - nav.bounds.minZ) * nav.columns + Math.round(p.x - nav.bounds.minX);
        requireValid(nav.cells[cell] && (i === 0 || Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z) === 1));
    }
    requireValid(!!selection.harborBerth && equal(findHarborBerth(world), selection.harborBerth));
    requireValid(equal(settlementStartingViews(world), selection.viewpoints));
    const sight = inspectSiteVisibility(world, selection.viewpoints, footprintSamples(rival.bounds), selection.rules.rivalRoofHeight);
    requireValid(sight.hidden && equal(sight, selection.visibility));
    for (const asset of world.placementPlan) {
        requireValid(rival.foundations.every(b => buildingDistance(asset.x, asset.z, b) >= asset.clearance));
    }
}
