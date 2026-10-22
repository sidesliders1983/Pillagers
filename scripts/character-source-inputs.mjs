import assert from 'node:assert/strict';
import { loadTypeScript } from './load-typescript.mjs';

/** Only the world's currently supported body, wardrobe and clips; no authoring models or pool preload. */
export function characterSourceInputs() {
    const load = path => loadTypeScript(new URL('../src/' + path + '.ts', import.meta.url));
    const { fjordClothingSets, fjordHairAssets, fjordBeardAssets } = load('fjord-play/FjordWardrobe');
    const { characterAsset, characterAssetURL, assetMeasurement } = load('characters/CharacterAssets');
    const { meshyHumanAssetIdentity } = load('characters/MeshyHumanAssetIdentity');
    const { humanExtraAnimations } = load('characters/HumanExtraAnimations');
    const { worldResidentDetail } = load('config/PresentationQuality');
    const sources = new Map();
    const add = (path, hash) => {
        assert.ok(!sources.has(path) || sources.get(path) === hash, 'Conflicting character source identity');
        sources.set(path, hash);
    };
    const body = meshyHumanAssetIdentity[worldResidentDetail.lod];
    add(body.path, body.sha256);
    add(humanExtraAnimations.path, humanExtraAnimations.sha256);
    const occupations = ['farmer', 'fisher', 'hunter', 'smith'];
    const ids = new Set([...fjordHairAssets, ...fjordBeardAssets,
        ...occupations.flatMap(name => ['headwear/occupation-' + name, 'equipment/occupation-' + name]),
        ...Object.values(fjordClothingSets).flatMap(value => Object.values(value))]);
    for (const id of ids) {
        if (id === 'none' || typeof id !== 'string' || !id.includes('/')) continue;
        const asset = characterAsset(id), path = characterAssetURL(id, worldResidentDetail.lod).split('?')[0];
        const binding = asset.metadata.nativeBinding;
        add(path, assetMeasurement(path).sha256);
        add(binding.path, binding.sha256);
    }
    return new Map([...sources].sort(([a], [b]) => a.localeCompare(b)));
}
