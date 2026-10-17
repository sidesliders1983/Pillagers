import type { CharacterAsset } from './CharacterAssets';
import { occupationHatRecords } from './OccupationHatMeasurements';
import { meshyHumanAssetIdentity } from './MeshyHumanAssetIdentity';
import { meshyRigSignature } from './MeshyNativeRig';
/** User-supplied occupation caps, independently selectable from hair and tools. */
export const occupationHatAssets: CharacterAsset[] = occupationHatRecords.map(record => ({
    id: record.id, type: 'headwear', version: 1, scope: 'body-bound',
    reviewStatus: 'preview', label: record.label,
    compatibleBodies: meshyHumanAssetIdentity.map(body => ({ id: 'body/meshy-human', sha256: body.sha256 })),
    lods: { 2: record.path }, runtimeLOD: 2, materialVariants: ['source-colour'],
    tags: ['occupation-headwear', record.occupation, 'native-meshy-head'],
    budgets: { triangles: { 2: record.triangles }, materials: record.materials, runtimeTriangles: record.triangles },
    metadata: {
        version: 'pillagers-fit/0.2', id: record.id, type: 'headwear',
        anchor: 'socket_head_top', fitMode: 'rigid', authoringFrame: 'meshy-native', clearance: .003,
        nativeBinding: { path: record.bindingPath, sha256: record.bindingSha256, rigSignature: meshyRigSignature },
    },
}));
