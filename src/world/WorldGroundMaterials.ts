import { groundBlendConfig, type GroundBlending, type RockTone } from '../config/GroundBlendConfig';
import {
    MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture,
    TextureLoader, Vector2,
} from 'three';
import { regionalGroundConfig } from '../config/RegionalGroundConfig';

/** Locked CC0 sources; Lab-only atlas and explicit rock colour treatment preserve normal/roughness maps. */
export async function loadWorldGroundMaterials(tier: 'standard' | 'low', anisotropy = 1,
    sandResolution: 256 | 512 = 256, blending: GroundBlending = 'baseline', rockTone: RockTone = 'source',
    style?: 'iceland-v1') {
    if (blending === 'baseline') rockTone = 'source';
    const sourcePixels = blending === 'zoned' ?
        (tier === 'low' ? groundBlendConfig.lowPixels : groundBlendConfig.standardPixels) :
        (tier === 'low' ? 128 : 256);
    const sandPixels = blending === 'zoned' ? sourcePixels : tier === 'low' ? 128 : sandResolution;
    const loader = new TextureLoader(), textures: Texture[] = [];
    const materials = new Map<string, MeshStandardMaterial>();
    try {
        for (const id of Object.keys(regionalGroundConfig.sources)) {
            const maps: Record<string, Texture> = {};
            for (const role of style ? ['colour'] : tier === 'low' ? ['colour','roughness'] : ['colour','normal','roughness']) {
                const folder = blending === 'baseline' && id === 'Ground054' && sandPixels === 512 ? 'sand-standard-512' : tier;
                const suffix = id === 'mossy_rock' && role === 'colour' && rockTone === 'cool-grey' ? '-cool-grey' : '';
                const texture = await loader.loadAsync(import.meta.env.BASE_URL + (style
                    ? `ground-materials/${style}/${tier}/${id}-colour.webp`
                    : 'ground-materials/' + (blending === 'zoned' ? 'blended-v1' : 'world-v01') + '/' + folder + '/' + id + '-' + role + suffix + '.webp'));
                textures.push(texture);
                maps[role] = texture;
                texture.colorSpace = role === 'colour' ? SRGBColorSpace : NoColorSpace;
                texture.wrapS = texture.wrapT = RepeatWrapping;
                texture.anisotropy = Math.min(4, anisotropy);
            }
            materials.set(id, new MeshStandardMaterial({ name: id, map: maps.colour,
                normalMap: maps.normal ?? null, roughnessMap: maps.roughness ?? null,
                normalScale: new Vector2(regionalGroundConfig.normalScale, regionalGroundConfig.normalScale),
                roughness: 1, flatShading: true, vertexColors: true }));
            materials.get(id)!.userData.repeatMeters = blending === 'zoned' ?
                groundBlendConfig.periodMeters : regionalGroundConfig.sources[id as keyof typeof regionalGroundConfig.sources].repeatMeters;
        }
        return { materials, tier, sandPixels, sourcePixels, blending, rockTone, dispose() {
            for (const texture of textures) texture.dispose();
            for (const material of materials.values()) material.dispose();
        } };
    } catch (error) {
        for (const texture of textures) texture.dispose();
        for (const material of materials.values()) material.dispose();
        throw error;
    }
}
