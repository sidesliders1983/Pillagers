import type { CharacterAsset } from './CharacterAssets';
import { nativePersonalArmorRecords } from './NativePersonalArmorMeasurements';
import { meshyHumanAssetIdentity } from './MeshyHumanAssetIdentity';
import { meshyRigSignature } from './MeshyNativeRig';

export const nativePersonalArmorByItem = Object.freeze({
    leatherBodyArmor: 'garment/native-leather-body-armor',
    ironHelmet: 'headwear/native-iron-helmet',
} as const);

/** Eligibility comes from the exact prepared binding, not a guessed field age. */
export function nativePersonalArmorAges(assetId: string) {
    return nativePersonalArmorRecords.find(record => record.id === assetId)?.supportedAges;
}

/** Supplied protective pieces remain explicit previews until combined fit acceptance. */
export const nativePersonalArmorAssets: CharacterAsset[] = nativePersonalArmorRecords.map(record => {
    const bodyArmor = record.item === 'leatherBodyArmor';
    return {
        id: record.id, type: bodyArmor ? 'garment' : 'headwear', version: 1,
        scope: 'body-bound', reviewStatus: 'preview', label: record.label,
        compatibleBodies: meshyHumanAssetIdentity.map(body => ({ id: 'body/meshy-human', sha256: body.sha256 })),
        lods: { 2: record.path }, runtimeLOD: 2, materialVariants: ['provider-original'],
        tags: [bodyArmor ? 'personal-body-armor' : 'personal-headgear', 'native-meshy-rig',
            'owner-fit-review-pending'],
        budgets: { triangles: { 2: record.triangles }, materials: record.materials,
            runtimeTriangles: record.triangles },
        metadata: {
            version: 'pillagers-fit/0.2', id: record.id, type: bodyArmor ? 'garment' : 'headwear',
            anchor: record.anchor, fitMode: bodyArmor ? 'drape' : 'rigid',
            authoringFrame: 'meshy-native', clearance: bodyArmor ? .008 : .003,
            ...(bodyArmor ? { slot: 'over' as const } : {}),
            nativeBinding: { path: record.bindingPath, sha256: record.bindingSha256,
                rigSignature: meshyRigSignature },
        },
    };
});
