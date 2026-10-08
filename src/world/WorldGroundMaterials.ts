import {
    MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture,
    TextureLoader, Vector2,
} from 'three';
import { regionalGroundConfig } from '../config/RegionalGroundConfig';

/** The same locked CC0 maps and v0.4 treatment, tiled on newly generated geography. */
export async function loadWorldGroundMaterials(tier: 'standard' | 'low', anisotropy = 1) {
    const loader = new TextureLoader(), textures: Texture[] = [];
    const materials = new Map<string, MeshStandardMaterial>();
    try {
        for (const id of Object.keys(regionalGroundConfig.sources)) {
            const maps: Record<string, Texture> = {};
            for (const role of tier === 'low' ? ['colour','roughness'] : ['colour','normal','roughness']) {
                const texture = await loader.loadAsync(import.meta.env.BASE_URL +
                    'ground-materials/world-v01/' + tier + '/' + id + '-' + role + '.webp');
                textures.push(texture);
                maps[role] = texture;
                texture.colorSpace = role === 'colour' ? SRGBColorSpace : NoColorSpace;
                texture.wrapS = texture.wrapT = RepeatWrapping;
                texture.anisotropy = Math.min(4, anisotropy);
            }
            materials.set(id, new MeshStandardMaterial({ map: maps.colour,
                normalMap: maps.normal ?? null, roughnessMap: maps.roughness,
                normalScale: new Vector2(regionalGroundConfig.normalScale, regionalGroundConfig.normalScale),
                roughness: 1, flatShading: true, vertexColors: true }));
        }
        return { materials, tier, dispose() {
            for (const texture of textures) texture.dispose();
            for (const material of materials.values()) material.dispose();
        } };
    } catch (error) {
        for (const texture of textures) texture.dispose();
        for (const material of materials.values()) material.dispose();
        throw error;
    }
}
