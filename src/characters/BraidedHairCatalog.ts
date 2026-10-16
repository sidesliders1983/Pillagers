import type {CharacterAsset} from './CharacterAssets';
import {braidedHairRecord} from './BraidedHairMeasurements';
import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';
import {meshyRigSignature} from './MeshyNativeRig';

/** The long braid remains an explicit Lab candidate until movement review is approved. */
export const braidedHairAsset: CharacterAsset = {
    id: braidedHairRecord.id, type: 'hair', style: 'braid', version: 1,
    scope: 'body-bound', reviewStatus: 'preview', label: 'Long braided hair · manual fit',
    compatibleBodies: meshyHumanAssetIdentity.map(body => ({id: 'body/meshy-human', sha256: body.sha256})),
    lods: {2: braidedHairRecord.path}, runtimeLOD: 2,
    materialVariants: ['profile-hair-colour', 'fixed-brown-leather'],
    tags: ['manual-fitted', 'native-meshy-rig', 'secondary-hair-chain'],
    budgets: {triangles: {2: braidedHairRecord.triangles}, materials: 1,
        runtimeTriangles: braidedHairRecord.triangles},
    metadata: {version: 'pillagers-fit/0.2', id: braidedHairRecord.id, type: 'hair',
        anchor: 'socket_head_top', fitMode: 'conform', authoringFrame: 'meshy-native', clearance: .016,
        nativeBinding: {path: braidedHairRecord.bindingPath, sha256: braidedHairRecord.bindingSha256,
            rigSignature: meshyRigSignature}},
};
