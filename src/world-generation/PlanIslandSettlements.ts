import { findHarborBerth } from './HarborClearance';
import { compartmentCandidates } from './SettlementCompartments';
import { createFoundationSearch, footprintBounds, gradeSettlementFoundations, planSettlement } from './PlanSettlement';
import { createBlueprintSurface } from './TerrainQueries';
import { inspectSiteVisibility } from './SettlementVisibility';
import { settlementStartingViews, siteRoutes } from './SiteNavigation';
import { normalizeSiteRules } from './SettlementSites';
import type { SiteCandidate, SitePairScore, SiteSelection, RivalSite } from './SettlementSites';
import type { Bounds2, Point2, WorldBlueprint } from './WorldBlueprint';

type PlannedLandscape = Omit<WorldBlueprint, 'biomes' | 'placementPlan'>;
const expand = (b: Bounds2, margin: number): Bounds2 => ({
    minX: b.minX - margin, maxX: b.maxX + margin,
    minZ: b.minZ - margin, maxZ: b.maxZ + margin,
});
const gap = (a: Bounds2, b: Bounds2) => Math.hypot(
    Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
    Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ));

export function footprintSamples(bounds: Bounds2) {
    const points: Point2[] = [];
    const columns = Math.ceil((bounds.maxX - bounds.minX) / 4);
    const rows = Math.ceil((bounds.maxZ - bounds.minZ) / 4);
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
        points.push({ x: bounds.minX + (bounds.maxX - bounds.minX) * col / columns,
            z: bounds.minZ + (bounds.maxZ - bounds.minZ) * row / rows });
    }
    return points;
}

/** Bounded deterministic search. Rejected proposals retain their original seed and evidence. */
export function planIslandSettlements(base: PlannedLandscape): PlannedLandscape {
    const rules = normalizeSiteRules(base.config.siteRules);
    const surface = createBlueprintSurface(base);
    const coverage = compartmentCandidates(base, rules.maximumCandidates);
    const natural = coverage.candidates;
    const fitFoundations = createFoundationSearch(base, rules.maximumFoundationAdjustment);
    const candidates: SiteCandidate[] = natural.map((site, i) => {
        const center = { x: site.x, z: site.z };
        const fit = fitFoundations(center, site.cells);
        const foundations = fit.foundations;
        const bounds = foundations.length ? foundations.reduce((bounds, building) => {
            const p = footprintBounds(building, 7);
            return { minX: Math.min(bounds.minX, p.minX), maxX: Math.max(bounds.maxX, p.maxX),
                minZ: Math.min(bounds.minZ, p.minZ), maxZ: Math.max(bounds.maxZ, p.maxZ) };
        }, { minX: center.x - 7, maxX: center.x + 7, minZ: center.z - 7, maxZ: center.z + 7 }) : site.bounds;
        const slopes = site.cells.map(p => surface.slopeAt(p.x, p.z));
        const meanSlope = slopes.reduce((sum, slope) => sum + slope, 0) / slopes.length;
        const maximumSlope = Math.max(...slopes);
        const score = Math.round(Math.min(100, site.area / 100) - meanSlope * 100 - site.shoreDistance / 10);
        return { id: 'site-' + (i + 1), compartmentId: site.compartmentId, center, bounds, area: site.area, meanSlope, maximumSlope,
            elevation: surface.surfaceHeightAt(center.x, center.z), coastDistance: site.shoreDistance,
            foundations, fitSearch: fit.evidence, score, reasons: foundations.length === 6 ? [] :
                ['Six authored house/Farmyard footprints do not fit within the foundation limits.'] };
    });
    for (const compartment of coverage.compartments) {
        const members = candidates.filter(c => c.compartmentId === compartment.id);
        compartment.candidateIds.push(...members.map(c => c.id));
        compartment.sixParcelFits = members.filter(c => c.foundations.length === 6).length;
        if (members.length && !compartment.sixParcelFits) {
            compartment.reasons.push('No evaluated anchor fits six authored parcels.');
        }
    }
    const pairs: SitePairScore[] = [];
    for (const player of candidates) for (const rival of candidates) {
        if (player.id === rival.id) continue;
        const centerDistance = Math.hypot(player.center.x - rival.center.x, player.center.z - rival.center.z);
        const bufferDistance = gap(player.bounds, rival.bounds);
        const reasons: string[] = [];
        if (player.reasons.length) reasons.push('Player foundations are unsuitable.');
        if (rival.reasons.length) reasons.push('Rival foundations are unsuitable.');
        if (centerDistance < rules.minimumCenterDistance) reasons.push('Centers are too close.');
        if (bufferDistance < rules.minimumBufferDistance) reasons.push('Insufficient neutral space between construction zones.');
        pairs.push({ playerId: player.id, rivalId: rival.id, centerDistance, bufferDistance,
            routeLength: 0, exposedRays: null, score: player.score + rival.score,
            reasons });
    }
    pairs.sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId) ||
        a.rivalId.localeCompare(b.rivalId));
    let selected: SitePairScore | null = null;
    let visibility: SiteSelection['visibility'] = { hidden: false, exposedRays: 0, rays: [] };
    let viewpoints: SiteSelection['viewpoints'] = [];
    let connection: Point2[] = [];
    let harborBerth: SiteSelection['harborBerth'] = null;
    let accepted: PlannedLandscape | null = null;
    let rivalSite: RivalSite | undefined;
    let buffers: Bounds2[] = [];
    const playerPlans = new Map<string, PlannedLandscape>();
    const playerRoutes = new Map<string, ReturnType<typeof siteRoutes>>();
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (pair.reasons.length) continue;
        if (selected) {
            pairs[i] = { ...pair, reasons: ['Lower-ranked pair not evaluated after a valid pair was selected.'] };
            continue;
        }
        const player = candidates.find(c => c.id === pair.playerId)!;
        const rival = candidates.find(c => c.id === pair.rivalId)!;
        let planned = playerPlans.get(player.id);
        if (!planned) {
            const landscape = { ...base, terrain: gradeSettlementFoundations(base, player.foundations) };
            planned = { ...landscape, ...planSettlement(landscape, player.center, true,
                { placements: player.foundations, bounds: player.bounds }) };
            playerPlans.set(player.id, planned);
        }
        const reasons = [...planned.validation.reasons];
        if (planned.settlement.harbor) {
            let routes = playerRoutes.get(player.id);
            if (!routes) {
                routes = siteRoutes(planned.navigation, planned.settlement.harbor);
                playerRoutes.set(player.id, routes);
            }
            // Adding rival obstacles cannot reconnect terrain already disconnected.
            if (!routes(rival.center).length) reasons.push('No land connection before rival construction.');
        }
        const berth = findHarborBerth(planned);
        if (!berth) reasons.push('No clear water berth for the authored longship.');
        const view = settlementStartingViews(planned);
        const bounds = planned.terrain.bounds;
        if (view.some(p => p.x < bounds.minX || p.x > bounds.maxX || p.z < bounds.minZ || p.z > bounds.maxZ)) {
            reasons.push('A starting viewpoint falls outside canonical terrain.');
        }
        if (reasons.length) { pairs[i] = { ...pair, reasons }; continue; }
        const sight = inspectSiteVisibility(planned, view, footprintSamples(rival.bounds), rules.rivalRoofHeight, true);
        if (!sight.hidden) {
            pairs[i] = { ...pair, exposedRays: sight.exposedRays,
                visibilityComplete: false, visibilitySamples: sight.rays.length,
                score: pair.score - 1000, reasons: ['The rival footprint is visible from a starting viewpoint.'] };
            continue;
        }
        const finalPlan = { ...planned, ...planSettlement(planned, player.center, true,
            { placements: player.foundations, bounds: player.bounds, obstacles: rival.foundations }) };
        const route = siteRoutes(finalPlan.navigation, finalPlan.settlement.harbor!)(rival.center);
        const routeLength = Math.max(0, route.length - 1) * finalPlan.navigation.spacing;
        const finalReasons = [...finalPlan.validation.reasons];
        if (!route.length) finalReasons.push('The rival site has no traversable land connection.');
        else if (routeLength < rules.minimumLandingRoute) finalReasons.push('The rival is too immediately reachable from the landing.');
        pairs[i] = { ...pair, routeLength, exposedRays: 0, reasons: finalReasons };
        if (finalReasons.length) continue;
        selected = pairs[i];
        accepted = finalPlan;
        harborBerth = berth;
        viewpoints = view;
        visibility = sight;
        connection = route;
        buffers = [expand(player.bounds, rules.minimumBufferDistance / 2),
            expand(rival.bounds, rules.minimumBufferDistance / 2)];
        rivalSite = { version: 1, candidateId: rival.id, center: rival.center, bounds: rival.bounds,
            foundations: rival.foundations, buildableArea: rival.area };
    }
    const reasons = selected ? [] : ['No candidate pair meets foundation, neutral-buffer, visibility and access rules.'];
    const siteSelection: SiteSelection = { version: 1, rules, candidates, compartments: coverage.compartments, pairs, selected,
        harborBerth, viewpoints, visibility, connection, buffers, reasons };
    const result = accepted ?? base;
    return { ...result, siteSelection, ...(rivalSite ? { rivalSite } : {}),
        validation: { ...result.validation, accepted: selected !== null && result.validation.accepted,
            reasons: [...result.validation.reasons, ...reasons] } };
}
