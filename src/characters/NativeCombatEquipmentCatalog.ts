import type { CharacterAsset } from './CharacterAssets';
import { nativeCombatEquipmentRecords } from './NativeCombatEquipmentMeasurements';
import { meshyHumanAssetIdentity } from './MeshyHumanAssetIdentity';
import { meshyRigSignature } from './MeshyNativeRig';

/** Canonical inventory items select only their corresponding native review prop. */
export const nativeCombatEquipmentByItem = Object.freeze({
    woodenSpear: 'equipment/native-wooden-spear',
    woodenShield: 'equipment/native-wooden-shield',
    leatherShield: 'equipment/native-leather-shield',
} as const);

/** Supplied source props remain preview assets until combined owner QA accepts their fit. */
export const nativeCombatEquipmentAssets: CharacterAsset[] = nativeCombatEquipmentRecords.map(record => ({
    id: record.id, type: 'equipment', version: 1, scope: 'body-bound', reviewStatus: 'preview',
    label: record.label,
    compatibleBodies: meshyHumanAssetIdentity.map(body => ({ id: 'body/meshy-human', sha256: body.sha256 })),
    lods: { 2: record.path }, runtimeLOD: 2, materialVariants: ['source-colour'],
    tags: ['combat-equipment', record.item, 'native-meshy-rig', 'owner-fit-review-pending'],
    budgets: { triangles: { 2: record.triangles }, materials: record.materials, runtimeTriangles: record.triangles },
    metadata: { version: 'pillagers-fit/0.2', id: record.id, type: 'equipment',
        anchor: record.anchor, fitMode: 'rigid', authoringFrame: 'meshy-native', clearance: .003,
        equipmentBindings: record.equipmentBindings,
        nativeBinding: { path: record.bindingPath, sha256: record.bindingSha256, rigSignature: meshyRigSignature } },
}));
