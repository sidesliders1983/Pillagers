import type { HumanProfile } from '../characters/UniversalHumanProfile';
import { parseFacialShape, type FacialShapeV1 } from '../characters/FacialIdentity';
import { projectResidentAppearance } from '../characters/ResidentAppearance';
import { spatialMemberPosition } from '../simulation/SpatialExpeditions';
import { visibleLongshipMembers } from '../simulation/LongshipTransport';
import { campaignIslandPlan } from './CampaignIsland';
import { settlementCampfire } from './SettlementCampfire';
import { livestockAsset } from '../characters/LivestockPresentation';
import { animalProfile } from '../simulation/LivestockSpecies';
export { settlementCampfire } from './SettlementCampfire';
import { housingName } from '../simulation/HousingNames';
import { projectFjordCalendar } from './FjordCalendar';
import { seasonBlend } from '../config/timeVisualization';
import type { CharacterDNA } from '../characters/CharacterDNA';
import { inspectWork, inspectCattle, inspectWeather, landingSummary, personaAge, personaAway, isProvidingCare } from '../simulation/SimulationCore';
import type { SimulationState } from '../simulation/SimulationCore';
import type { EntityKind } from '../play/SettlementView';
import type { Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { fitsBuildingFoundation } from '../world/BuildingPlot';
import { suitability } from '../world-generation/PlanSettlement';
import { projectFjordGround } from './FjordGround';
import { projectFjordWeather } from './FjordWeather';
export type FjordPrecipitation = { snow: number; rain: number };
export type FjordTransform = {
    x: number;
    y: number;
    z: number;
    rotation: number;
    scale: number;
};
export type FjordPlot = FjordTransform & {
    halfWidth: number;
    halfDepth: number;
};
export interface FjordSettlementSite {
    id: string;
    center: Point2;
    bounds: Bounds2;
    candidates: Point2[];
}
export interface FjordLayout {
    version: 'fjord-layout-v2';
    seed: number;
    geographyId: string;
    plots: Record<string, FjordPlot>;
    points: Record<string, FjordTransform>;
    mooring: FjordTransform;
    mooringResolved: boolean;
}
export interface FjordEntity {
    kind: EntityKind;
    id: string;
    selectionKey: string;
    label: string;
    asset: string;
    terrainAsset?: string;
    dna?: CharacterDNA;
    visualProfile?: HumanProfile;
    facialIdentity?: FacialShapeV1;
    transform: FjordTransform | null;
    plot?: FjordPlot;
    status: {
        living: boolean;
        expedition?: string;
        expeditionWalking?: boolean;
        shipExpedition?: string;
        transportGroup?: string;
        aboardShip?: string;
        aboardAnchor?: number;
        occupation?: string | null;
        workEligible?: boolean;
        workHomeId?: string;
        stage?: string;
        species?: string;
        sexTerm?: string;
        sex?: string;
        age?: number;
        level?: number;
        farmyard?: boolean;
        assignment?: string | null;
        sheltered?: boolean;
        overcrowding?: number;
        parentIds?: string[];
        indoorReason?: 'young-child' | 'childcare' | null;
        grazingZone?: 'yard' | 'overflow' | 'exposed';
    };
}
const geographyIds = new WeakMap<WorldBlueprint, string>();
const plotCandidates = new WeakMap<WorldBlueprint, { x: number; z: number }[]>();
export function geographyIdentity(world: WorldBlueprint) {
    const known = geographyIds.get(world);
    if (known)
        return known;
    let hash = 2166136261;
    for (const char of JSON.stringify(world))
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const identity = world.config.generatorVersion + ':' + world.config.seed + ':' + (hash >>> 0).toString(16);
    geographyIds.set(world, identity);
    return identity;
}
export function createFjordLayout(world: WorldBlueprint, mooring?: FjordTransform, campaignSeed = world.config.seed): FjordLayout {
    if (!world.validation.accepted)
        throw new Error('Fjord geography must be validated.');
    const harbor = world.settlement.harbor!;
    const berth = campaignIslandPlan(world)?.berth;
    if (!mooring && berth) {
        // Layout v2 retains a faering anchor. Invert the existing longship offset so
        // the rendered hull lands exactly in the validated, full-sized island berth.
        const sine = Math.sin(berth.rotation), cosine = Math.cos(berth.rotation);
        mooring = { x: berth.center.x - sine * 3.5 - cosine * 4.5,
            z: berth.center.z - cosine * 3.5 + sine * 4.5,
            y: world.waterLevel + .15, rotation: berth.rotation, scale: 1 };
    }
    return { version: 'fjord-layout-v2', seed: campaignSeed, geographyId: geographyIdentity(world),
        plots: {}, points: {}, mooringResolved: Boolean(mooring), mooring: mooring ??
            { x: harbor.x, y: world.waterLevel + .15, z: harbor.z - 6, rotation: 0, scale: 1 } };
}
/** The stored anchor belongs to the 5m faering. Keep it stable for existing campaign saves.
 * Both source hull and pier run along local Z. The 14.47m longship needs a lateral
 * berth: 2m pier half-width + 1.74m hull half-width + .76m gap, and extra seaward room.
 */
export function longshipBerth(anchor: FjordTransform): FjordTransform {
    const forward = 3.5 * anchor.scale;
    const lateral = 4.5 * anchor.scale;
    const sine = Math.sin(anchor.rotation), cosine = Math.cos(anchor.rotation);
    return {
        ...anchor,
        x: anchor.x + sine * forward + cosine * lateral,
        z: anchor.z + cosine * forward - sine * lateral
    };
}

export function fjordPlotFits(world: WorldBlueprint, p: FjordPlot, site?: FjordSettlementSite) {
    const surface = createBlueprintSurface(world);
    const island = campaignIslandPlan(world);
    if (island && !site && !island.plots.some(q => q.x === p.x && q.z === p.z &&
        q.halfWidth === p.halfWidth && q.halfDepth === p.halfDepth)) return false;
    if (site && (p.x - p.halfWidth < site.bounds.minX || p.x + p.halfWidth > site.bounds.maxX ||
        p.z - p.halfDepth < site.bounds.minZ || p.z + p.halfDepth > site.bounds.maxZ)) return false;
    return fitsBuildingFoundation(surface, p) &&
        Math.abs(p.y - surface.surfaceHeightAt(p.x, p.z)) < .000001;
}
/** Pure presentation: all gameplay facts come from canonical public inspection. */
export function projectFjordSettlement(state: SimulationState, world: WorldBlueprint, previous: FjordLayout, site?: FjordSettlementSite) {
    if ((!site && !campaignIslandPlan(world) && state.seed !== world.config.seed) || previous.seed !== state.seed ||
        previous.geographyId !== geographyIdentity(world) || previous.version !== 'fjord-layout-v2')
        throw new Error('Campaign, geography and presentation identities do not match.');
    const layout = structuredClone(previous);
    const livestockDeaths: { id: string; position: Point2 }[] = [];
    // Historical identities remain in Core, but no longer reserve outdoor render space.
    for (const key of Object.keys(layout.points)) {
        const identity = key.split('@')[0];
        const separator = identity.indexOf(':');
        const kind = identity.slice(0, separator), id = identity.slice(separator + 1);
        const living = kind === 'persona' ? state.personas[id]?.deathWinter === null && !personaAway(state, id) :
            kind === 'cattle' ? state.landing?.cattle[id]?.deathWinter === null : false;
        if (!living) {
            const animal = kind === 'cattle' ? state.landing?.cattle[id] : undefined;
            if (animal && animal.deathWinter !== null)
                livestockDeaths.push({ id, position: { x: layout.points[key].x, z: layout.points[key].z } });
            delete layout.points[key];
        }
    }
    // Transfer tent parcels before removing obsolete reservations so construction stays in place.
    for (const building of Object.values(state.buildings)) {
        const key = 'building:' + building.id;
        if (!layout.plots[key]) {
            const birth = state.events.find(e => e.type === 'HouseBuilt' && e.details?.buildingId === building.id);
            const homeKey = 'household:' + birth?.details?.householdId;
            if (layout.plots[homeKey]) {
                layout.plots[key] = layout.plots[homeKey];
                delete layout.plots[homeKey];
            }
        }
    }
    const activePlots = new Set(Object.keys(state.buildings).map(id => 'building:' + id));
    for (const home of Object.values(state.households)) {
        const residence = home.residenceId ? state.residences[home.residenceId] : undefined;
        if (residence?.kind !== 'house' && home.memberIds.some(id => state.personas[id]?.deathWinter === null))
            activePlots.add('household:' + home.id);
    }
    for (const key of Object.keys(layout.plots)) if (!activePlots.has(key)) delete layout.plots[key];
    const usedPoints = new Set<string>();
    const surface = createBlueprintSurface(world);
    const entities: FjordEntity[] = [];
    const diagnostics: string[] = [];
    const campfire = settlementCampfire(world, site ? { id: site.id + ':campfire', center: site.center } : undefined);
    const center = campfire.transform;
    let candidates = site?.candidates ?? plotCandidates.get(world);
    if (!candidates) {
        candidates = campaignIslandPlan(world)?.plots.map(p => ({ x: p.x, z: p.z })) ?? [];
        // Four columns and three rows around the middle place fit the validated
        // clearing, including ten separate founding households and future upgrades.
        for (let row = -10; !campaignIslandPlan(world) && row <= 10; row++)
            for (let column = -10; column <= 10; column++) {
                const x = center.x + 8.5 + column * 17, z = center.z + row * 17;
                if (x >= world.terrain.bounds.minX + 8 && x <= world.terrain.bounds.maxX - 8 &&
                    z >= world.terrain.bounds.minZ + 8 && z <= world.terrain.bounds.maxZ - 8)
                    candidates.push({ x, z });
            }
        candidates.sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) -
            Math.hypot(b.x - center.x, b.z - center.z) || a.z - b.z || a.x - b.x);
        plotCandidates.set(world, candidates);
    }
    const allocatePlot = (key: string, halfSize = 7.5): FjordPlot | undefined => {
        const stored = layout.plots[key];
        if (stored && (!site || stored.halfWidth === halfSize && stored.halfDepth === halfSize))
            return stored;
        delete layout.plots[key];
        const halfWidth = halfSize, halfDepth = halfSize;
        const found = candidates.find(p => Math.hypot(
            Math.max(0, Math.abs(p.x - center.x) - halfWidth),
            Math.max(0, Math.abs(p.z - center.z) - halfDepth)) >= campfire.clearingRadius &&
            Object.values(layout.plots).every(q => Math.abs(p.x - q.x) > halfWidth + q.halfWidth + 1 ||
            Math.abs(p.z - q.z) > halfDepth + q.halfDepth + 1) &&
            Object.values(layout.points).every(q => Math.abs(p.x - q.x) > halfWidth + .8 || Math.abs(p.z - q.z) > halfDepth + .8) &&
            fjordPlotFits(world, { ...p, y: surface.surfaceHeightAt(p.x, p.z),
                halfWidth, halfDepth, rotation: Math.PI, scale: 1 }, site));
        if (!found) {
            diagnostics.push(key + ': no safe plot remains; identity retained without a 3D mesh. Gameplay is unchanged.');
            return undefined;
        }
        return layout.plots[key] = { ...found, y: surface.surfaceHeightAt(found.x, found.z),
            rotation: Math.PI, scale: 1, halfWidth, halfDepth };
    };
    const add = (kind: EntityKind, id: string, label: string, asset: string, transform: FjordTransform | undefined, status: FjordEntity['status'], plot?: FjordPlot) => {
        entities.push({ kind, id, label, asset, transform: transform ? { ...transform } : null, status,
            selectionKey: kind + ':' + id, ...(plot ? { plot: { ...plot } } : {}) });
    };
    add('campfire', campfire.id, 'Settlement campfire', 'stoneCampfire', campfire.transform, { living: false });
    // Cache positions by resident/animal and assignment. New arrivals never move survivors.
    const allocatePoint = (key: string, preferred: {
        x: number;
        z: number;
    }, yard?: FjordPlot, obstacle = { halfWidth: 3.5, halfDepth: 4 },
        permitted: (p: { x: number; z: number }) => boolean = () => true) => {
        usedPoints.add(key);
        if (layout.points[key] && permitted(layout.points[key]) &&
            Math.hypot(layout.points[key].x - center.x, layout.points[key].z - center.z) > campfire.obstacleRadius + 1)
            return layout.points[key];
        delete layout.points[key];
        const points = Object.values(layout.points);
        const options: {
            x: number;
            z: number;
        }[] = [preferred];
        for (let radius = 1.5; radius <= 12; radius += 1.5)
            for (let angle = 0; angle < 8; angle++)
                options.push({
                    x: preferred.x + Math.cos(angle * Math.PI / 4) * radius,
                    z: preferred.z + Math.sin(angle * Math.PI / 4) * radius
                });
        const bounds = site?.bounds ?? world.settlement.bounds;
        const point = options.find(p => (!(site || campaignIslandPlan(world)) ||
            p.x >= bounds.minX + 1 && p.x <= bounds.maxX - 1 &&
            p.z >= bounds.minZ + 1 && p.z <= bounds.maxZ - 1) && permitted(p) &&
            Math.hypot(p.x - center.x, p.z - center.z) > campfire.obstacleRadius + 1 &&
            surface.surfaceHeightAt(p.x, p.z) > world.waterLevel + .25 &&
            surface.slopeAt(p.x, p.z) <= suitability.walkingSlope &&
            points.every(q => Math.hypot(p.x - q.x, p.z - q.z) > 1.5) &&
            Object.values(layout.plots).every(q => q === yard ?
                ((Math.abs(p.x - q.x) > obstacle.halfWidth || Math.abs(p.z - q.z) > obstacle.halfDepth) &&
                    Math.abs(p.x - q.x) < q.halfWidth - 1 && Math.abs(p.z - q.z) < q.halfDepth - 1 ||
                    Math.abs(p.x - q.x) > q.halfWidth + .8 || Math.abs(p.z - q.z) > q.halfDepth + .8) :
                Math.abs(p.x - q.x) > q.halfWidth + .8 || Math.abs(p.z - q.z) > q.halfDepth + .8));
        if (!point) {
            diagnostics.push(key + ': no safe outdoor position remains; identity retained without a 3D mesh.');
            return undefined;
        }
        return layout.points[key] = { ...point, y: surface.surfaceHeightAt(point.x, point.z), rotation: .5, scale: 1 };
    };
    const homes = Object.values(state.households).sort((a, b) => a.id.localeCompare(b.id));
    const yards = state.landing ? landingSummary(state).farmyards : [];
    const buildingPlots = new Map<string, FjordPlot>();
    for (const building of Object.values(state.buildings).sort((a, b) => a.id.localeCompare(b.id))) {
        const key = 'building:' + building.id;
        const level = state.mechanics?.buildings[building.id]?.upgradeLevel ?? 0;
        const yard = yards.some(y => y.id === building.id);
        const halfSize = site ? yard || level >= 2 ? 7.5 : level === 1 ? 6 : 3.5 : 7.5;
        const plot = allocatePlot(key, halfSize);
        if (plot)
            buildingPlots.set(building.id, plot);
        let asset = ['hut', 'homestead', 'longhouse', 'greatHall'][Math.min(level, 3)];
        if (yard && level <= 1)
            asset = level === 0 ? 'farmHut' : 'farmHomestead';
        const orientedPlot = plot ? {
            ...plot,
            rotation: yard ? Math.PI : Math.atan2(center.x - plot.x, center.z - plot.z)
        } : undefined;
        const entity: FjordEntity = { kind: 'building', id: building.id, label: housingName(state, 'building', building.id),
            selectionKey: key, asset, transform: orientedPlot ? { ...orientedPlot } : null,
            ...(orientedPlot ? { plot: { ...orientedPlot } } : {}),
            status: { living: true, level, farmyard: yard } };
        if (yard) {
            entity.terrainAsset = level <= 1 ? 'farmHutTerrain' : 'farmyardMarker';
            if (level === 1)
                diagnostics.push(building.id +
                    ': FarmHomestead terrain exceeds this plot; nearest safe sourced FarmHut yard used.');
            if (level > 1)
                diagnostics.push(building.id +
                    ': no source Farmyard at this level; actual dwelling retained with a lightweight yard marker.');
        }
        entities.push(entity);
    }
    const homePlots = new Map<string, FjordPlot | undefined>();
    for (const home of homes) {
        if (!home.memberIds.some(id => state.personas[id]?.deathWinter === null))
            continue;
        const residence = home.residenceId ? state.residences[home.residenceId] : null;
        homePlots.set(home.id, residence?.buildingId ? buildingPlots.get(residence.buildingId) :
            allocatePlot('household:' + home.id, site ? 3 : 7.5));
    }
    for (const home of homes) {
        if (!home.memberIds.some(id => state.personas[id]?.deathWinter === null))
            continue;
        const residence = home.residenceId ? state.residences[home.residenceId] : null;
        const plot = homePlots.get(home.id);
        if (residence?.kind !== 'house')
            add('household', home.id, housingName(state, 'household', home.id), 'tent', plot, { living: true }, plot);
        for (const [index, id] of home.memberIds.entries()) {
            const p = state.personas[id];
            const mission = Object.values(state.world?.spatial?.missions ?? {}).find(m =>
                m.status !== 'Returned' && m.status !== 'Prepared' && m.memberIds.includes(id));
            if (!p || p.deathWinter !== null || personaAway(state, id) && !mission)
                continue;
            const age = personaAge(state, id);
            const indoorReason = age < 5 ? 'young-child' :
                state.mechanics && isProvidingCare(state, id) ? 'childcare' : null;
            const key = 'persona:' + id + '@' + (plot ? plot.x + ',' + plot.z : home.id);
            const partyPoint = mission ? spatialMemberPosition(mission, id) : undefined;
            const transport = mission?.transport?.phase === 'embarked' ? mission.transport : undefined;
            const deckMembers = transport ? visibleLongshipMembers(mission!.memberIds.filter(member =>
                state.personas[member]?.deathWinter === null)) : [];
            const aboardAnchor = deckMembers.indexOf(id);
            const point = transport && aboardAnchor < 0 ? undefined : partyPoint ? { ...partyPoint,
                y: transport ? world.waterLevel + .15 : surface.surfaceHeightAt(partyPoint.x, partyPoint.z), scale: 1 } : plot && !indoorReason ? allocatePoint(key, { x: plot.x - 3 + index % 5 * 1.8,
                z: plot.z + plot.halfDepth + 1.5 + Math.floor(index / 5) * 1.8 }) : undefined;
            const growth = .4 + .6 * Math.min(16, Math.max(0, age)) / 16;
            add('persona', id, p.name, 'human', point ? { ...point, scale: growth } : undefined,
                { living: true, expedition: mission?.id, expeditionWalking: partyPoint?.moving ?? false,
                    aboardShip: transport?.shipId, aboardAnchor: transport ? aboardAnchor : undefined,
                    sex: p.dna.sex, age, indoorReason, occupation: p.occupation,
                    workEligible: state.mechanics ? inspectWork(state, id).reason === null : false,
                    workHomeId: residence?.buildingId ?? undefined });
            const appearance = projectResidentAppearance(state, id)!;
            entities[entities.length - 1].dna = appearance.dna;
            entities[entities.length - 1].facialIdentity = parseFacialShape(appearance.face);
        }
    }
    const livingCattle = Object.values(state.landing?.cattle ?? {})
        .filter(c => c.deathWinter === null)
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const [index, c] of livingCattle.entries()) {
        const view = inspectCattle(state, c.id);
        const asset = livestockAsset(c.species ?? 'cattle', c.sex, view.stage);
        if (!asset) continue;
        const assigned = c.farmyardId ? buildingPlots.get(c.farmyardId) : null;
        const level = c.farmyardId ? state.mechanics?.buildings[c.farmyardId]?.upgradeLevel ?? 0 : 0;
        const herd = livingCattle.filter(member => member.farmyardId === c.farmyardId);
        const rank = herd.findIndex(member => member.id === c.id);
        const capacity = state.landing!.config.farmyardCapacity;
        const occupied = herd.slice(0, rank + 1).reduce((sum, animal) =>
            sum + animalProfile(state, animal).capacityWeightBps, 0);
        const grazingZone = assigned ? occupied <= capacity * 10000 ? 'yard' : 'overflow' : 'exposed';
        const key = 'cattle:' + c.id + '@' + (c.farmyardId ?? 'outside') + '@' + level + '@' + grazingZone;
        const x = assigned ? assigned.x - (grazingZone === 'yard' ? 4.8 : 10) : center.x - 7 + index * 2;
        const z = assigned ? assigned.z - 3.9 + rank % 4 * 2.6 : center.z - 3;
        const widths = [2.05, 3.06, 4.72, 5.58], depths = [2.42, 2.71, 2.92, 4.38];
        const permitted = (p: { x: number; z: number }) => !assigned ||
            (grazingZone === 'yard' ? Math.abs(p.x - assigned.x) < assigned.halfWidth - 1 &&
                Math.abs(p.z - assigned.z) < assigned.halfDepth - 1 :
                Math.hypot(p.x - assigned.x, p.z - assigned.z) <= 20 &&
                (Math.abs(p.x - assigned.x) > assigned.halfWidth + .8 ||
                    Math.abs(p.z - assigned.z) > assigned.halfDepth + .8));
        const point = allocatePoint(key, { x, z }, assigned ?? undefined, {
            halfWidth: widths[Math.min(level, 3)] + .7, halfDepth: depths[Math.min(level, 3)] + .7
        }, permitted);
        add('cattle', c.id, view.name, asset, point,
            { living: true, sex: c.sex, species: view.species, sexTerm: view.sexTerm,
                age: view.age, stage: view.stage, assignment: c.farmyardId,
                sheltered: view.sheltered, overcrowding: view.overcrowding, parentIds: [...view.parentIds], grazingZone });
    }
    for (const ship of site ? [] : Object.values(state.landing?.longships ?? {})) {
        if (ship.salvagedWinter !== null) continue;
        const mission = Object.values(state.world?.spatial?.missions ?? {}).find(m =>
            m.transport?.shipId === ship.id && m.transport.phase === 'embarked');
        const pose = ship.transport ? { ...ship.transport, y: world.waterLevel + .15, scale: 1 } : longshipBerth(layout.mooring);
        add('longship', ship.id, 'Founding longship', 'longship', pose, { living: true,
            shipExpedition: mission?.id, transportGroup: ship.transport?.groupId ?? undefined });
    }
    for (const key of Object.keys(layout.points)) if (!usedPoints.has(key)) delete layout.points[key];
    const ground = projectFjordGround(world, entities, campfire);
    if (ground.plots.length > 0 && ground.paths.length < ground.plots.length)
        diagnostics.push('Some permanent homes have no safe connecting path; no route across water or steep terrain is drawn.');
    const calendar = projectFjordCalendar(state.time, state.ticksPerWinter);
    const { from, to, mix } = seasonBlend(calendar.visualProgress);
    const precipitation: FjordPrecipitation = {
        snow: calendar.winterWeight,
        rain: from.name === 'Autumn' ? 1 - mix : to.name === 'Autumn' ? mix : 0
    };
    return { calendar, precipitation,
        campfire, entities, livestockDeaths, layout, diagnostics, ground, time: { ...state.time }, stocks: { ...state.stocks },
        weather: inspectWeather(state),
        weatherVisual: projectFjordWeather(inspectWeather(state).enabled ? inspectWeather(state).class : null) };
}
