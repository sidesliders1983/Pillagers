import assert from 'node:assert/strict';
import { loadTypeScript } from '../load-typescript.mjs';
const source = path => loadTypeScript(new URL('../../src/' + path, import.meta.url));
const { createCampaign, applyCommand } = source('simulation/SimulationCore.ts');
const { projectFjordSettlement, geographyIdentity } = source('fjord-play/FjordProjection.ts');
const { projectFjordGround } = source('fjord-play/FjordGround.ts');
const { createBlueprintSurface } = source('world-generation/TerrainQueries.ts');
const { planSettlement } = source('world-generation/PlanSettlement.ts');
const { siteRoutes } = source('world-generation/SiteNavigation.ts');
const { findHarborBerth } = source('world-generation/HarborClearance.ts');

const inside = (p, bounds, radius = 0) => p.x - radius >= bounds.minX &&
    p.x + radius <= bounds.maxX && p.z - radius >= bounds.minZ && p.z + radius <= bounds.maxZ;

/** Read-only spatial experiment. It never accepts/replaces the caller's blueprint or creates a CPU clan. */
export function inspectCampaignCapacity(world, region) {
    const before = JSON.stringify(world);
    const probe = { ...world, settlement: { ...world.settlement, center: region.center,
        bounds: region.bounds, buildings: [], accessPaths: [] } };
    const surface = createBlueprintSurface(probe);
    const natural = planSettlement(probe, region.center, true, { placements: [], bounds: region.bounds });
    const harbor = findHarborBerth({ ...probe, ...natural });
    probe.settlement = { ...probe.settlement, harbor: natural.settlement.harbor };
    const initial = { version: 'fjord-layout-v2', seed: world.config.seed,
        geographyId: geographyIdentity(probe), plots: {}, points: {}, mooringResolved: false,
        mooring: { x: 0, z: 0, y: world.waterLevel, rotation: 0, scale: 1 } };
    const campaign = createCampaign(world.config.seed);
    const coreBefore = JSON.stringify(campaign);
    const projected = projectFjordSettlement(campaign, probe, initial);
    const plots = Object.values(projected.layout.plots);
    const households = projected.entities.filter(e => e.kind === 'household');
    const residents = projected.entities.filter(e => e.kind === 'persona');
    const cattle = projected.entities.filter(e => e.kind === 'cattle');
    // Probe paths through the existing presentation path builder; tents themselves still create no dirt.
    const circulation = projectFjordGround(probe, households.filter(e => e.plot)
        .map(e => ({ ...e, kind: 'building', selectionKey: 'capacity-' + e.selectionKey })));
    const camp = projected.campfire;
    const campDry = Array.from({ length: 16 }, (_, i) => {
        const angle = i * Math.PI / 8;
        const x = camp.transform.x + Math.cos(angle) * camp.clearingRadius;
        const z = camp.transform.z + Math.sin(angle) * camp.clearingRadius;
        return surface.surfaceHeightAt(x, z) >= world.waterLevel + .25 && surface.slopeAt(x, z) <= .55;
    }).every(Boolean) && surface.surfaceHeightAt(camp.transform.x, camp.transform.z) >= world.waterLevel + .25;
    const escapedPlots = plots.filter(p => !inside(p, region.bounds, 7.5));
    const escapedPeople = residents.filter(e => e.transform && !inside(e.transform, region.bounds));
    const escapedCattle = cattle.filter(e => e.transform && !inside(e.transform, region.bounds, .8));
    const plotNavigation = planSettlement(probe, region.center, true, {
        placements: plots.map((plot, i) => ({ ...plot, id: 'probe-' + i, key: 'household', radius: 11 })),
        bounds: region.bounds,
    }).navigation;
    const circulationNavigation = { ...plotNavigation, cells: plotNavigation.cells.map((walkable, index) => {
        const x = plotNavigation.bounds.minX + index % plotNavigation.columns;
        const z = plotNavigation.bounds.minZ + Math.floor(index / plotNavigation.columns);
        return walkable && Math.hypot(x - camp.transform.x, z - camp.transform.z) > camp.obstacleRadius + .65;
    }) };
    const routeOrigin = natural.settlement.harbor;
    const routes = routeOrigin ? siteRoutes(circulationNavigation, routeOrigin) : () => [];
    const landingRoutes = Array.from({ length: 16 }, (_, i) => routes({
        x: camp.transform.x + Math.cos(i * Math.PI / 8) * 6,
        z: camp.transform.z + Math.sin(i * Math.PI / 8) * 6,
    })).filter(route => route.length);
    const landingRoute = landingRoutes.sort((a, b) => a.length - b.length)[0] ?? [];
    const reasons = [];
    if (plots.length !== households.length) reasons.push('The real allocator cannot place every household.');
    if (escapedPlots.length) reasons.push('Allocated household plots leave the reserved region.');
    if (residents.some(e => !e.transform) || escapedPeople.length) reasons.push('Resident positions are missing or outside the reserve.');
    if (cattle.some(e => !e.transform) || escapedCattle.length) reasons.push('Starting cattle positions are missing or outside the reserve.');
    if (!campDry || !inside(camp.transform, region.bounds, camp.clearingRadius)) reasons.push('The camp clearing is not dry, walkable and contained.');
    if (circulation.paths.length !== households.length) reasons.push('Not all household approaches connect to the camp clearing.');
    if (!harbor || !landingRoute.length) reasons.push('No usable coastal berth and camp approach.');

    // Same real factory and commands, with explicitly funded construction for a spatial-only future scenario.
    let expanded = createCampaign(world.config.seed, { initialMaterials: 10000 });
    for (const householdId of Object.keys(expanded.households)) {
        expanded = applyCommand(expanded, { type: 'BuildHouse', householdId });
    }
    const future = projectFjordSettlement(expanded, probe, projected.layout);
    const allIndependent = projectFjordSettlement(createCampaign(world.config.seed,
        { foundingCoupleCap: 0 }), probe, initial);
    const futurePlots = Object.values(future.layout.plots);
    const expansionReasons = [...reasons];
    if (futurePlots.length !== households.length || future.ground.paths.length !== households.length) {
        expansionReasons.push('In-place permanent homes do not all have plots and connecting paths.');
    }
    const extraPlots = Object.values(allIndependent.layout.plots).filter(p => inside(p, region.bounds, 7.5));
    const expandedCapacity = extraPlots.length === 10;
    if (!expandedCapacity) expansionReasons.push('The ten-independent-household sensitivity case does not fit inside the reserve.');
    assert.equal(JSON.stringify(world), before);
    assert.equal(JSON.stringify(campaign), coreBefore);
    return {
        id: region.id, bounds: region.bounds, center: region.center,
        founding: { residents: residents.length, households: households.length, cattle: cattle.length,
            placedHouseholds: plots.length, containedHouseholds: plots.length - escapedPlots.length,
            placedResidents: residents.filter(e => e.transform).length, placedCattle: cattle.filter(e => e.transform).length,
            connectedApproaches: circulation.paths.length, campDry, viable: reasons.length === 0, reasons,
            geometry: { plots, camp, residents: residents.map(e => e.transform), cattle: cattle.map(e => e.transform),
                paths: circulation.paths, harbor, landingRoute } },
        expansion: { scenario: 'In-place conversion of current households; separate ten-unpaired-founder capacity sensitivity.',
            permanentHomes: futurePlots.length, connectedApproaches: future.ground.paths.length,
            tenHouseholdContainedPlots: extraPlots.length, viable: expansionReasons.length === 0,
            reasons: expansionReasons },
        stress: { sixLabParcels: region.foundations?.length === 6 },
        sourceUnchanged: true,
    };
}
