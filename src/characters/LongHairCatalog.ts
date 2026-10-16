import type {CharacterAsset} from './CharacterAssets';
import {longHairRecord} from './LongHairMeasurements';
import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';
import {meshyRigSignature} from './MeshyNativeRig';

/** Shoulder-length hair fitted by hand, awaiting visual movement review in the Lab. */
export const longHairAsset: CharacterAsset = {
    id: longHairRecord.id, type: 'hair', style: 'long', version: 1,
    scope: 'body-bound', reviewStatus: 'preview', label: 'Long hair 2 · manual fit',
    compatibleBodies: meshyHumanAssetIdentity.map(body => ({id: 'body/meshy-human', sha256: body.sha256})),
    lods: {2: longHairRecord.path}, runtimeLOD: 2,
    materialVariants: ['profile-hair-colour'], tags: ['manual-fitted', 'native-meshy-rig'],
    budgets: {triangles: {2: longHairRecord.triangles}, materials: 1,
        runtimeTriangles: longHairRecord.triangles},
    metadata: {
        version: 'pillagers-fit/0.2', id: longHairRecord.id, type: 'hair',
        anchor: 'socket_head_top', fitMode: 'conform', authoringFrame: 'meshy-native', clearance: 0,
        nativeBinding: {path: longHairRecord.bindingPath, sha256: longHairRecord.bindingSha256,
            rigSignature: meshyRigSignature},
    },
};
