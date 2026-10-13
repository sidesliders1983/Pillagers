import { groundBlendWeights } from './GroundBlending';
import { Color } from 'three';
import { sampleEnvironment } from '../world-generation/EnvironmentZoning';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

export const environmentOverlays = {
    environment: 'Ground regions & boundaries',
    'blend-dominant': 'Rendered blend · dominant material',
    'blend-grass': 'Rendered blend · grass weight',
    'blend-sand': 'Rendered blend · sand weight',
    'blend-mud': 'Rendered blend · mud / wear weight',
    'blend-rock': 'Rendered blend · rock weight',
    'forest-cover': 'Forest cover',
    moisture: 'Moisture',
    shelter: 'Shelter',
    slope: 'Terrain slope',
    aspect: 'Downhill aspect',
    'rock-exposure': 'Rock exposure',
    'snow-potential': 'Snow retention potential',
};
const palette = { water: '#244a68', grass: '#75ad53', sand: '#ead099', mud: '#80624b', bedrock: '#a0a7ad' };
const fields = { 'forest-cover': 'forestCover', moisture: 'moisture', shelter: 'shelter',
    slope: 'slope', 'rock-exposure': 'rockExposure', 'snow-potential': 'snowRetentionPotential' } as const;

/** Debug colours only: the approved ground material pipeline is unchanged. */
export function environmentColours(world: WorldBlueprint, overlay: string): Color[] | null {
    const zones = world.environment;
    if (!zones || !(overlay in environmentOverlays)) return null;
    return world.terrain.heights.map((height, index) => {
        if (height <= world.waterLevel) return new Color(palette.water);
        const x = world.terrain.bounds.minX + index % world.terrain.columns * world.terrain.spacing;
        const z = world.terrain.bounds.minZ + Math.floor(index / world.terrain.columns) * world.terrain.spacing;
        if (overlay.startsWith('blend-')) {
            const weights = groundBlendWeights(world, x, z, world.biomes.worn[index]);
            if (overlay === 'blend-dominant') {
                const winner = weights.indexOf(Math.max(...weights));
                return new Color([palette.grass, palette.sand, palette.mud, palette.bedrock][winner]);
            }
            const layer = ['blend-grass', 'blend-sand', 'blend-mud', 'blend-rock'].indexOf(overlay);
            return new Color('#15212b').lerp(new Color('#fff0bb'), weights[layer]);
        }
        const zone = sampleEnvironment(world, x, z)!;
        if (overlay === 'environment') {
            const colour = new Color(palette[zone.primary]);
            const boundary = [[2, 0], [0, 2]].some(([dx, dz]) => {
                const other = sampleEnvironment(world, x + dx, z + dz);
                return other && other.regionId !== zone.regionId;
            });
            return boundary ? colour.multiplyScalar(.35) : colour;
        }
        if (overlay === 'aspect') return new Color().setHSL(zone.aspect / (Math.PI * 2), .65, .5);
        const field = fields[overlay as keyof typeof fields];
        const value = Math.min(1, zone[field]);
        const high = overlay === 'forest-cover' ? '#6ed37f' : overlay === 'moisture' ? '#62bde6' : '#fff0bb';
        return new Color('#25323c').lerp(new Color(high), value);
    });
}
