import { generatedHouseFiles } from './HousingAssets';
import type { PresentationQuality } from './PresentationQuality';

/** Same models and UVs, with smaller baked images for the existing Low preset. */
export const compactModelPixels = 512;
export const compactModelSources: readonly string[] = [
    ...Object.values(generatedHouseFiles).map(file => 'game-assets/houses/' + file),
    'scenery/meshy-tent-v1/tent.glb',
    'scenery/meshy-campfire-v1/campfire.glb',
];

export function modelTexturePath(source: string, quality: PresentationQuality) {
    return quality === 'low' && compactModelSources.includes(source)
        ? 'game-assets/compact-models/' + source.split('/').at(-1)!
        : source;
}
