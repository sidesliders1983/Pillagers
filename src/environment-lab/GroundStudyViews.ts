import { createBlueprintSurface, terrainGradientAt } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

export const groundStudyViews = {
    'ground-grass': 'Ground study · broad grass',
    'ground-mud': 'Ground study · wet ground',
    'ground-rock': 'Ground study · steep inland wall',
    'ground-sea-cliff': 'Ground study · sea cliff',
    'ground-rock-transition': 'Ground study · rock to grass',
    'ground-highland': 'Ground study · gentle highland',
    'ground-gully': 'Ground study · sheltered ground',
};

/** Camera probes only, selected from the existing zoning fields. They never alter the blueprint. */
export function groundStudyCamera(world: WorldBlueprint, view: string) {
    const zones = world.environment;
    if (!zones || !(view in groundStudyViews)) return null;
    const surface = createBlueprintSurface(world);
    let best = -Infinity, target = { ...world.settlement.center, y: world.settlement.elevation };
    for (let index = 0; index < zones.primary.length; index++) {
        const x = world.terrain.bounds.minX + index % zones.columns * zones.spacing;
        const z = world.terrain.bounds.minZ + Math.floor(index / zones.columns) * zones.spacing;
        const y = surface.surfaceHeightAt(x, z), elevation = y - world.waterLevel;
        if (elevation < .4 || (view === 'ground-rock' && elevation < 15) ||
            (view === 'ground-sea-cliff' && elevation > 10)) continue;
        const { grass, mud, slope, rockExposure, shelter, moisture } = zones.fields;
        const score = view === 'ground-grass' ? grass[index] * (1 - Math.min(1, slope[index])) :
            view === 'ground-mud' ? mud[index] : view === 'ground-rock-transition' ?
                Math.min(grass[index], rockExposure[index]) :
                view === 'ground-rock' || view === 'ground-sea-cliff' ?
                rockExposure[index] * Math.min(2, slope[index]) : view === 'ground-highland' ?
                    grass[index] * elevation / (1 + slope[index] * 8) : shelter[index] * moisture[index];
        if (score > best) { best = score; target = { x, y, z }; }
    }
    const gradient = terrainGradientAt(world, target.x, target.z);
    const length = Math.hypot(gradient.x, gradient.z);
    const direction = (view === 'ground-rock' || view === 'ground-sea-cliff' || view === 'ground-rock-transition') && length > .01 ?
        { x: -gradient.x / length, z: -gradient.z / length } : { x: .7071, z: -.7071 };
    const distance = view.startsWith('ground-rock') || view === 'ground-sea-cliff' ? 38 : 28;
    const x = target.x + direction.x * distance, z = target.z + direction.z * distance;
    return { position: [x, Math.max(target.y + distance * .65, surface.surfaceHeightAt(x, z) + 6), z],
        target: [target.x, target.y + 1, target.z] };
}
