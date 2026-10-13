import { findHarborBerth } from './HarborClearance';
import { buildings, buildingDistance } from '../world/SettlementLayout';
import { footprintSamples } from './PlanIslandSettlements';
import { settlementStartingViews } from './SiteNavigation';
import { inspectSiteVisibility } from './SettlementVisibility';
import { normalizeSiteRules, isFoundationRotation, requiresTerrainOcclusion } from './SettlementSites';
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
        buildings.some(source => source.key === b.key && isFoundationRotation(source.rotation, b.rotation) &&
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
    if (selection.compartments !== undefined) {
        const compartments = selection.compartments;
        requireValid(Array.isArray(compartments) && compartments.length <= world.terrain.heights.length / 50);
        requireValid(new Set(compartments.map(c => c.id)).size === compartments.length);
        for (const compartment of compartments) {
            const members = candidates.filter(c => c.compartmentId === compartment.id);
            requireValid(typeof compartment.id === 'string' && point(compartment.center) &&
                Number.isFinite(compartment.area) && Number.isFinite(compartment.coreArea) &&
                compartment.area >= compartment.coreArea && compartment.coreArea >= 200 &&
                Number.isInteger(compartment.eligibleAnchors) && compartment.eligibleAnchors >= members.length &&
                equal(compartment.candidateIds, members.map(c => c.id)) &&
                compartment.sixParcelFits === members.filter(c => c.foundations.length === 6).length &&
                Array.isArray(compartment.reasons) && compartment.reasons.every(r => typeof r === 'string'));
        }
        for (const candidate of candidates) {
            requireValid(compartments.some(c => c.id === candidate.compartmentId));
            const fit = candidate.fitSearch;
            requireValid(!!fit && Number.isInteger(fit.attempts) && fit.attempts >= 1 && fit.attempts <= 12 &&
                Number.isInteger(fit.nodes) && fit.nodes >= 0 && fit.nodes <= 12000 &&
                Number.isInteger(fit.maximumPlaced) && fit.maximumPlaced >= 0 && fit.maximumPlaced <= 6 &&
                fit.maximumPlaced >= candidate.foundations.length &&
                Number.isInteger(fit.orientationCount) && fit.orientationCount >= 8 && fit.orientationCount <= 9 &&
                Array.isArray(fit.validPoses) && fit.validPoses.length === 6 &&
                new Set(fit.validPoses.map(p => p.id)).size === 6 && fit.validPoses.every(p =>
                    typeof p.id === 'string' && Number.isInteger(p.count) && p.count >= 0 && p.count <= 100000));
        }
    }
    requireValid(Array.isArray(selection.pairs) && selection.pairs.length <= candidates.length * (candidates.length - 1));
    for (const pair of selection.pairs) {
        requireValid(candidates.some(c => c.id === pair.playerId) && candidates.some(c => c.id === pair.rivalId) &&
            pair.playerId !== pair.rivalId &&
            [pair.centerDistance, pair.bufferDistance, pair.routeLength, pair.score].every(Number.isFinite) &&
            (pair.exposedRays === null || Number.isInteger(pair.exposedRays) && pair.exposedRays >= 0) &&
            Array.isArray(pair.reasons) && pair.reasons.every(r => typeof r === 'string'));
    }
    for (const pair of selection.pairs) if (pair.visibilityComplete !== undefined) {
        requireValid(pair.visibilityComplete === false && pair.exposedRays === 1 &&
            Number.isInteger(pair.visibilitySamples) && pair.visibilitySamples! > 0 && pair.visibilitySamples! <= 12000);
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
    const requireOcclusion = requiresTerrainOcclusion(world.config.generatorVersion);
    requireValid((!requireOcclusion || sight.hidden) && equal(sight, selection.visibility) &&
        selected.exposedRays === sight.exposedRays);
    if (!requireOcclusion) {
        requireValid(!!player.compartmentId && !!rival.compartmentId &&
            player.compartmentId !== rival.compartmentId);
    }
    for (const asset of world.placementPlan) {
        requireValid(rival.foundations.every(b => buildingDistance(asset.x, asset.z, b) >= asset.clearance));
    }
}
