import type { CharacterAsset } from './CharacterAssets';
import { occupationToolRecords } from './OccupationToolMeasurements';
import { meshyHumanAssetIdentity } from './MeshyHumanAssetIdentity';
import { meshyRigSignature } from './MeshyNativeRig';
/** Carried occupation tools reuse the native hand and back joints. */
export const occupationToolAssets: CharacterAsset[] = occupationToolRecords.map(record => ({
    id: record.id, type: 'equipment', version: 1, scope: 'body-bound',
    reviewStatus: 'preview', label: record.label,
    compatibleBodies: meshyHumanAssetIdentity.map(body => ({ id: 'body/meshy-human', sha256: body.sha256 })),
    lods: { 2: record.path }, runtimeLOD: 2, materialVariants: ['source-colour'],
    tags: ['occupation-tool', record.occupation, 'native-meshy-rig'],
    budgets: { triangles: { 2: record.triangles }, materials: record.materials, runtimeTriangles: record.triangles },
    metadata: {
        version: 'pillagers-fit/0.2', id: record.id, type: 'equipment',
        anchor: record.anchor, fitMode: 'rigid', authoringFrame: 'meshy-native', clearance: .003,
        equipmentBindings: record.equipmentBindings,
        nativeBinding: { path: record.bindingPath, sha256: record.bindingSha256, rigSignature: meshyRigSignature },
    },
}));
