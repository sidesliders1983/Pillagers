import type {CharacterAsset} from './CharacterAssets';
import {manualBeardRecords} from './ManualBeardMeasurements';
import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';
import {meshyRigSignature} from './MeshyNativeRig';

/** Manually placed beards retain their authored shape on the existing native Human. */
export const manualBeardAssets: CharacterAsset[] = manualBeardRecords.map(record => ({
    id: record.id, type: 'beard', style: record.style, version: 1,
    scope: 'body-bound', reviewStatus: 'preview', label: record.label,
    compatibleBodies: meshyHumanAssetIdentity.map(body => ({
        id: 'body/meshy-human', sha256: body.sha256,
    })),
    lods: {2: record.path}, runtimeLOD: 2,
    materialVariants: ['profile-hair-colour'],
    tags: ['manual-fitted', 'native-meshy-rig'],
    budgets: {triangles: {2: record.triangles}, materials: 1, runtimeTriangles: record.triangles},
    metadata: {
        version: 'pillagers-fit/0.2', id: record.id, type: 'beard',
        anchor: 'socket_jaw', fitMode: 'conform', authoringFrame: 'meshy-native',
        clearance: 0,
        nativeBinding: {path: record.bindingPath, sha256: record.bindingSha256,
            rigSignature: meshyRigSignature},
    },
}));
