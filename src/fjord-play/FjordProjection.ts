import { inspectCattle, inspectWeather, landingSummary, personaAge, personaAway, } from '../simulation/SimulationCore';
import type { SimulationState } from '../simulation/SimulationCore';
import type { EntityKind } from '../play/SettlementView';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { fitsBuildingFoundation } from '../world/BuildingPlot';
import { suitability } from '../world-generation/PlanSettlement';
import { projectFjordGround } from './FjordGround';
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
export interface FjordLayout {
    version: 'fjord-layout-v1';
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
    transform: FjordTransform | null;
    plot?: FjordPlot;
    status: {
        living: boolean;
        stage?: string;
        sex?: string;
        age?: number;
        level?: number;
        farmyard?: boolean;
        assignment?: string | null;
    };
}
const geographyIds = new WeakMap<WorldBlueprint, string>();
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
export function createFjordLayout(world: WorldBlueprint, mooring?: FjordTransform): FjordLayout {
    if (!world.validation.accepted)
        throw new Error('Fjord geography must be validated.');
    const harbor = world.settlement.harbor!;
    return { version: 'fjord-layout-v1', seed: world.config.seed, geographyId: geographyIdentity(world),
        plots: {}, points: {}, mooringResolved: Boolean(mooring), mooring: mooring ??
            { x: harbor.x, y: world.waterLevel + .15, z: harbor.z - 6, rotation: 0, scale: 1 } };
}
export function fjordPlotFits(world: WorldBlueprint, p: FjordPlot) {
    const surface = createBlueprintSurface(world);
    return fitsBuildingFoundation(surface, p) &&
        Math.abs(p.y - surface.surfaceHeightAt(p.x, p.z)) < .000001;
}
/** Pure presentation: all gameplay facts come from canonical public inspection. */
export function projectFjordSettlement(state: SimulationState, world: WorldBlueprint, previous: FjordLayout) {
    if (state.seed !== world.config.seed || previous.seed !== state.seed ||
        previous.geographyId !== geographyIdentity(world) || previous.version !== 'fjord-layout-v1')
        throw new Error('Campaign, geography and presentation identities do not match.');
    const layout = structuredClone(previous);
    const surface = createBlueprintSurface(world);
    const entities: FjordEntity[] = [];
    const diagnostics: string[] = [];
    const candidates: {
        x: number;
        z: number;
    }[] = [];
    for (let z = world.terrain.bounds.minZ + 8; z <= world.terrain.bounds.maxZ - 8; z += 2)
        for (let x = world.terrain.bounds.minX + 8; x <= world.terrain.bounds.maxX - 8; x += 2)
            candidates.push({ x, z });
    const center = world.settlement.center;
    candidates.sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z - 20) -
        Math.hypot(b.x - center.x, b.z - center.z - 20) || a.z - b.z || a.x - b.x);
    const allocatePlot = (key: string): FjordPlot | undefined => {
        if (layout.plots[key])
            return layout.plots[key];
        const halfWidth = 6.5, halfDepth = 6.5;
        const found = candidates.find(p => Object.values(layout.plots).every(q => Math.abs(p.x - q.x) > halfWidth + q.halfWidth + 1 ||
            Math.abs(p.z - q.z) > halfDepth + q.halfDepth + 1) &&
            Object.values(layout.points).every(q => Math.abs(p.x - q.x) > halfWidth + .8 || Math.abs(p.z - q.z) > halfDepth + .8) &&
            fjordPlotFits(world, { ...p, y: surface.surfaceHeightAt(p.x, p.z),
                halfWidth, halfDepth, rotation: Math.PI, scale: 1 }));
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
    // Cache positions by resident/animal and assignment. New arrivals never move survivors.
    const allocatePoint = (key: string, preferred: {
        x: number;
        z: number;
    }, yard?: FjordPlot, obstacle = { halfWidth: 3.5, halfDepth: 4 }) => {
        if (layout.points[key])
            return layout.points[key];
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
        const point = options.find(p => surface.surfaceHeightAt(p.x, p.z) > world.waterLevel + .25 &&
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
        if (!layout.plots[key]) {
            const birth = state.events.find(e => e.type === 'HouseBuilt' && e.details?.buildingId === building.id);
            const homeKey = 'household:' + birth?.details?.householdId;
            if (layout.plots[homeKey]) {
                layout.plots[key] = layout.plots[homeKey];
                delete layout.plots[homeKey];
            }
        }
        const plot = allocatePlot(key);
        if (plot)
            buildingPlots.set(building.id, plot);
        const level = state.mechanics?.buildings[building.id]?.upgradeLevel ?? 0;
        const yard = yards.some(y => y.id === building.id);
        let asset = ['hut', 'homestead', 'longhouse', 'greatHall'][Math.min(level, 3)];
        if (yard && level <= 1)
            asset = level === 0 ? 'farmHut' : 'farmHomestead';
        const entity: FjordEntity = { kind: 'building', id: building.id, label: building.id,
            selectionKey: key, asset, transform: plot ? { ...plot } : null, ...(plot ? { plot: { ...plot } } : {}),
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
            allocatePlot('household:' + home.id));
    }
    for (const home of homes) {
        if (!home.memberIds.some(id => state.personas[id]?.deathWinter === null))
            continue;
        const residence = home.residenceId ? state.residences[home.residenceId] : null;
        const plot = homePlots.get(home.id);
        if (residence?.kind !== 'house')
            add('household', home.id, 'Household ' + home.id, 'tent', plot, { living: true }, plot);
        for (const [index, id] of home.memberIds.entries()) {
            const p = state.personas[id];
            if (!p || p.deathWinter !== null || personaAway(state, id))
                continue;
            const key = 'persona:' + id + '@' + (plot ? plot.x + ',' + plot.z : home.id);
            const point = plot ? allocatePoint(key, { x: plot.x - 3 + index % 5 * 1.8,
                z: plot.z + 8 + Math.floor(index / 5) * 1.8 }) : undefined;
            add('persona', id, p.name, 'human', point, { living: true, sex: p.dna.sex, age: personaAge(state, id) });
        }
    }
    for (const [index, c] of Object.values(state.landing?.cattle ?? {}).filter(c => c.deathWinter === null).sort((a, b) => a.id.localeCompare(b.id)).entries()) {
        const view = inspectCattle(state, c.id);
        const assigned = c.farmyardId ? buildingPlots.get(c.farmyardId) : null;
        const level = c.farmyardId ? state.mechanics?.buildings[c.farmyardId]?.upgradeLevel ?? 0 : 0;
        const key = 'cattle:' + c.id + '@' + (c.farmyardId ?? 'outside') + '@' + level;
        const x = assigned ? assigned.x - 4.5 + index % 4 * 2 : center.x - 7 + index * 2;
        const z = assigned ? assigned.z - 4.5 : center.z - 3;
        const widths = [2.05, 3.06, 4.72, 5.58], depths = [2.42, 2.71, 2.92, 4.38];
        const point = allocatePoint(key, { x, z }, assigned ?? undefined, {
            halfWidth: widths[Math.min(level, 3)] + 1.5, halfDepth: depths[Math.min(level, 3)] + 1.5
        });
        add('cattle', c.id, c.id, view.stage === 'Young' ? 'baby' :
            view.stage === 'Young Adult' ? 'young-adult' : c.sex === 'female' ? 'adult-female' : 'adult-male', point, { living: true, sex: c.sex, stage: view.stage, assignment: c.farmyardId });
    }
    for (const ship of Object.values(state.landing?.longships ?? {}))
        if (ship.salvagedWinter === null)
            add('longship', ship.id, 'Founding longship', 'longship', layout.mooring, { living: true });
    const ground = projectFjordGround(world, entities);
    if (ground.plots.length > 1 && ground.paths.length < ground.plots.length - 1)
        diagnostics.push('Some permanent homes have no safe connecting path; no route across water or steep terrain is drawn.');
    return { entities, layout, diagnostics, ground, time: { ...state.time }, stocks: { ...state.stocks },
        weather: inspectWeather(state) };
}
