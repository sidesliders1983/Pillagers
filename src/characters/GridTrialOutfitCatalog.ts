import type {CharacterAsset} from './CharacterAssets';
import {gridTrialOutfitMeasurement, gridTrialBindingHash} from './GridTrialOutfitMeasurements';
import {meshyRigSignature} from './MeshyNativeRig';
import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';

export const gridTrialOutfitId = 'garment/meshy-grid-trial-001';
export const gridTrialOutfitPath = '/character-lab/candidates/meshy-grid-trial-002/outfit.glb';

/** One prepared full-outfit choice in the normal Lab, excluded from automatic/world selection. */
export const gridTrialOutfitAsset: CharacterAsset = {
    id: gridTrialOutfitId,
    type: 'garment',
    version: 1,
    scope: 'body-bound',
    reviewStatus: 'preview',
    label: 'Grid trial · tunic and trousers',
    compatibleBodies: meshyHumanAssetIdentity
        .map(body => ({id: 'body/meshy-human', sha256: body.sha256})),
    lods: {2: gridTrialOutfitPath},
    runtimeLOD: 2,
    materialVariants: ['provider-original'],
    tags: ['image-to-3d', 'native-meshy-rig', 'prepared-outfit-trial'],
    budgets: {triangles: {2: gridTrialOutfitMeasurement.triangles},
        materials: gridTrialOutfitMeasurement.materials, runtimeTriangles: gridTrialOutfitMeasurement.triangles},
    metadata: {
        version: 'pillagers-fit/0.2', id: gridTrialOutfitId, type: 'garment',
        anchor: 'socket_chest', fitMode: 'drape', authoringFrame: 'meshy-native',
        nativeBinding: {path: '/character-lab/candidates/meshy-grid-trial-002/outfit.binding.json',
            sha256: gridTrialBindingHash, rigSignature: meshyRigSignature},
        clearance: .004, slot: 'full', includesFootwear: false,
    },
};
