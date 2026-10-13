import { Color, DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';
import { createWorldSpatialQueries } from '../world-generation/WorldSpatialQueries';
import type { SpatialSample } from '../world-generation/WorldSpatialQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

export const spatialOverlays = {
    'grid-ground': 'Grid · canonical ground',
    'grid-movement': 'Grid · resident traversability',
    'grid-buildability': 'Grid · unreserved building points',
    'grid-reservations': 'Grid · reservations',
    'grid-slope': 'Grid · exact slope angle',
    'grid-aspect': 'Grid · exact downhill aspect',
};
const ground = { water: '#244a68', grass: '#75ad53', sand: '#ead099', mud: '#80624b', bedrock: '#a0a7ad' };

function colourAt(point: SpatialSample, overlay: string, colour: Color) {
    if (overlay === 'grid-reservations' && point.reservations.length) {
        const kinds = point.reservations.map(r => r.kind);
        return colour.set(kinds.some(k => k.includes('foundation')) ? '#fff4bb' :
            kinds.includes('neutral-buffer') ? '#dc9c45' :
            kinds.some(k => ['access-path', 'rival-connection', 'harbor-approach', 'harbor-berth'].includes(k)) ?
                '#53c8ed' : kinds.includes('rival-site') ? '#d273b4' : '#72d384');
    }
    if (point.surface.water) return colour.set(ground.water);
    if (overlay === 'grid-ground') return colour.set(point.zone ? ground[point.zone.primary] : '#686868');
    if (overlay === 'grid-movement') return colour.set(point.movement.traversable ? '#72d384' : '#b65347');
    if (overlay === 'grid-buildability') return colour.set(point.buildability.available ? '#72d384' :
        point.buildability.terrainSuitable ? '#dc9c45' : '#b65347');
    if (overlay === 'grid-slope') return colour.setHSL((1 - point.surface.slopeDegrees / 90) * .33, .65, .5);
    if (overlay === 'grid-aspect') return point.surface.aspectDegrees === null ? colour.set('#808080') :
        colour.setHSL(point.surface.aspectDegrees / 360, .65, .5);
    return colour.set('#34413f');
}

/** One nearest-filtered debug texture; cell colours are not interpolated across a 2m triangle. */
export function createSpatialOverlay(world: WorldBlueprint, overlay: string) {
    if (!(overlay in spatialOverlays)) return null;
    const start = performance.now();
    const query = createWorldSpatialQueries(world), nav = query.grid;
    const data = new Uint8Array(nav.columns * nav.rows * 4), colour = new Color();
    for (let index = 0; index < nav.columns * nav.rows; index++) {
        colourAt(query.cell(index)!, overlay, colour);
        data[index * 4] = Math.round(colour.r * 255);
        data[index * 4 + 1] = Math.round(colour.g * 255);
        data[index * 4 + 2] = Math.round(colour.b * 255);
        data[index * 4 + 3] = 255;
    }
    const texture = new DataTexture(data, nav.columns, nav.rows, RGBAFormat, UnsignedByteType);
    texture.channel = 1;
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    // Reuse the existing terrain-mask UV channel. Align its texel centres with navigation nodes.
    const ratio = world.terrain.spacing / nav.spacing;
    texture.repeat.set(ratio * world.terrain.columns / nav.columns, ratio * world.terrain.rows / nav.rows);
    texture.offset.set((.5 - ratio * .5) / nav.columns, (.5 - ratio * .5) / nav.rows);
    texture.needsUpdate = true;
    return { texture, diagnostics: { milliseconds: performance.now() - start,
        textureBytes: data.byteLength, spacing: nav.spacing, ...query.storage } };
}
