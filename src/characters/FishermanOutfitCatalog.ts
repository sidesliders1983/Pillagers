import type {CharacterAsset} from './CharacterAssets';
import {fishermanOutfitRecords} from './FishermanOutfitMeasurements';
import {gridTrialOutfitAsset} from './GridTrialOutfitCatalog';
import {meshyRigSignature} from './MeshyNativeRig';

/** Separate review choices on the existing native Human; accepted outfits remain unchanged. */
export const fishermanOutfitAssets: CharacterAsset[] = fishermanOutfitRecords.map(record => ({
    id: record.id, type: 'garment', version: 1, scope: 'body-bound', reviewStatus: 'preview',
    label: record.label, compatibleBodies: gridTrialOutfitAsset.compatibleBodies,
    lods: {2: record.path}, runtimeLOD: 2, materialVariants: ['provider-original'],
    tags: ['image-to-3d', 'native-meshy-rig', 'fisherman-clothing-preview'],
    budgets: {triangles: {2: record.triangles}, materials: record.materials,
        runtimeTriangles: record.triangles},
    metadata: {
        version: 'pillagers-fit/0.2', id: record.id, type: 'garment',
        anchor: 'socket_waist', fitMode: 'drape', authoringFrame: 'meshy-native',
        nativeBinding: {path: record.bindingPath, sha256: record.bindingSha256,
            rigSignature: meshyRigSignature},
        clearance: .005, slot: record.slot,
    },
}));
