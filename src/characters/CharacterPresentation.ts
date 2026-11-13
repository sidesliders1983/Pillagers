import { CharacterDNA } from './CharacterDNA';
import { BodyAssetIdentity, CharacterAsset, characterAsset, availableCharacterAssets, characterAssetFitsBody } from './CharacterAssets';
import { universalHumanProfile } from './UniversalHumanProfile';
import { EquipmentSocket, equipmentSocketNames, moduleAtEquipmentSocket } from './AttachmentContract';
import { identitySample } from './seededRandom';
import type { HairStyle, BeardStyle } from './AppearanceTypes';
import { gridTrialOutfitId } from './GridTrialOutfitCatalog';

export const separateGarmentKeys = ['shoes', 'trousers', 'top'] as const;
export type SeparateGarmentKey = typeof separateGarmentKeys[number];
export const presentationModuleFields = [
    {key: 'hair', type: 'hair', label: 'Hair'},
    {key: 'beard', type: 'beard', label: 'Beard'},
    {key: 'headwear', type: 'headwear', label: 'Headwear'},
    {key: 'outfit', type: 'garment', label: 'Full outfit'},
    {key: 'shoes', type: 'garment', label: 'Shoes'},
    {key: 'trousers', type: 'garment', label: 'Lower clothing'},
    {key: 'top', type: 'garment', label: 'Upper clothing'},
    {key: 'bodyArmor', type: 'garment', label: 'Body Armor'},
    {key: 'equipment', type: 'equipment', label: 'Equipment'},
] as const;
export type GarmentChoiceKey = 'outfit' | SeparateGarmentKey | 'bodyArmor';

/** Lab authoring choices are presentation state, never persistent character identity. */
export interface CharacterPresentation {
    hair: string;
    beard: string;
    headwear: string;
    outfit: string;
    shoes: string;
    trousers: string;
    top: string;
    equipment: string;
    /** An explicit fitted layer; historical payloads may omit this choice. */
    bodyArmor?: string;
    /** Additional independently authored native hand modules; old single-item payloads stay valid. */
    equipmentItems?: readonly string[];
    equipmentSocket: EquipmentSocket | 'auto';
    hairColor: string | null;
    technicalWaistWrap: boolean;
}
export const defaultCharacterPresentation: Readonly<CharacterPresentation> = Object.freeze({
    hair: 'auto', beard: 'auto', headwear: 'none', outfit: 'auto',
    shoes: 'none', trousers: 'none', top: 'none', bodyArmor: 'none',
    equipment: 'none', equipmentItems: Object.freeze([]), equipmentSocket: 'auto', hairColor: null, technicalWaistWrap: false,
});

export function garmentFitsChoice(asset: CharacterAsset, choice: GarmentChoiceKey) {
    if (asset.type !== 'garment') return false;
    const slot = asset.metadata?.slot;
    if (choice === 'outfit') return slot === 'full';
    if (asset.metadata?.version !== 'pillagers-fit/0.2') return false;
    if (choice === 'bodyArmor') return slot === 'over' && asset.tags.includes('personal-body-armor');
    if (choice === 'shoes') return slot === 'footwear';
    if (choice === 'trousers') return slot === 'lower';
    return (slot === 'upper' || slot === 'over') && !asset.tags.includes('personal-body-armor');
}

/** An explicit ensemble can reserve only the upper/lower slots and leave shoes independent. */
export function outfitAllowsSeparateFootwear(id: string) {
    if (id === 'auto' || id === 'none') return false;
    const asset = characterAsset(id);
    return asset.type === 'garment' && asset.metadata?.slot === 'full'
        && asset.metadata.includesFootwear === false;
}

function complementaryFootwear(presentation: CharacterPresentation) {
    return presentation.trousers === 'none' && presentation.top === 'none'
        && outfitAllowsSeparateFootwear(presentation.outfit);
}

export function parseCharacterPresentation(value: unknown = defaultCharacterPresentation): CharacterPresentation {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Presentation must be an object.');
    }
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some(key => !Object.hasOwn(defaultCharacterPresentation, key))) {
        throw new Error('Unknown presentation field.');
    }
    const result = {...defaultCharacterPresentation, ...input} as CharacterPresentation;
    for (const {key, type} of presentationModuleFields) {
        const id = result[key];
        if (typeof id !== 'string') throw new Error('Invalid ' + key + ' choice.');
        if (key === 'bodyArmor' && id === 'auto')
            throw new Error('Body Armor requires an explicit choice; it is never equipped automatically.');
        if (id === 'auto' || id === 'none') continue;
        const asset = characterAsset(id);
        if (asset.type !== type) throw new Error('Invalid ' + key + ' asset type.');
        if (type === 'garment' && !garmentFitsChoice(asset, key as GarmentChoiceKey)) {
            throw new Error(id + ': garment does not occupy the ' + key + ' slot.');
        }
    }
    const equipmentItems = result.equipmentItems;
    if (!Array.isArray(equipmentItems) || equipmentItems.length > 2 ||
        new Set(equipmentItems).size !== equipmentItems.length || equipmentItems.some(id => {
            if (typeof id !== 'string' || id === 'auto' || id === 'none') return true;
            const asset = characterAsset(id);
            return asset.type !== 'equipment' || !asset.metadata?.equipmentBindings ||
                !['socket_hand_L', 'socket_hand_R'].includes(asset.metadata.anchor);
        })) throw new Error('Choose up to two distinct native hand equipment modules.');
    if (Object.hasOwn(input, 'equipmentItems')) result.equipmentItems = [...equipmentItems];
    else delete result.equipmentItems;
    if (result.bodyArmor !== 'none' && (result.outfit !== gridTrialOutfitId ||
        result.top !== 'none' || result.trousers !== 'none')) {
        throw new Error('Body Armor requires its qualified normal field tunic underlay.');
    }
    if (!Object.hasOwn(input, 'bodyArmor')) delete result.bodyArmor;
    const separateRequested = separateGarmentKeys.some(key => result[key] !== 'none');
    if (separateRequested && result.outfit !== 'auto' && result.outfit !== 'none'
        && !complementaryFootwear(result)) {
        throw new Error('A full outfit cannot be combined with separate shoes, trousers or upper clothing.');
    }
    if (result.equipmentSocket !== 'auto' && !equipmentSocketNames.includes(result.equipmentSocket)) {
        throw new Error('Unknown equipment carry socket.');
    }
    if (result.hairColor !== null &&
        (typeof result.hairColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(result.hairColor))) {
        throw new Error('Hair colour must be Auto or a six-digit hex colour.');
    }
    if (typeof result.technicalWaistWrap !== 'boolean') {
        throw new Error('Technical waist wrap must be a boolean.');
    }
    return result;
}

export function presentationChoices(
    type: 'hair' | 'beard' | 'garment' | 'equipment' | 'headwear',
    body?: BodyAssetIdentity,
    garmentChoice?: GarmentChoiceKey,
) {
    return availableCharacterAssets()
        .filter(asset => asset.type === type && characterAssetFitsBody(asset, body) &&
            (!garmentChoice || garmentFitsChoice(asset, garmentChoice)))
        .map(asset => ({
            id: asset.id,
            label: (asset.label ?? asset.style ?? asset.id).replaceAll('-', ' ') +
                (asset.reviewStatus === 'preview' ? ' (preview)' : ''),
        }));
}

export function resolveCharacterPresentation(
    dna: CharacterDNA, value: unknown = defaultCharacterPresentation, body?: BodyAssetIdentity,
) {
    const presentation = parseCharacterPresentation(value);
    const base = universalHumanProfile(dna);
    const sourceBound = !!body && body.id !== 'body/universal-human';

    // Saved choices retain their exact source identity even while age/sex hides them.
    for (const {key} of presentationModuleFields) {
        const choice = presentation[key] ?? 'none';
        if (choice !== 'auto' && choice !== 'none' &&
            !characterAssetFitsBody(characterAsset(choice), body)) {
            throw new Error(choice + ': module is not compatible with this exact body source.');
        }
    }
    for (const id of presentation.equipmentItems ?? []) {
        if (body?.id !== 'body/meshy-human' || !characterAssetFitsBody(characterAsset(id), body))
            throw new Error(id + ': additional hand modules require this exact native Meshy body source.');
    }
    const separateRequested = separateGarmentKeys.some(key => presentation[key] !== 'none');
    if (separateRequested && body?.id !== 'body/meshy-human') {
        throw new Error('Separate clothing slots require a native Meshy body.');
    }
    const automatic = (
        type: 'hair' | 'beard' | 'garment' | 'equipment' | 'headwear',
        legacy: string,
        garmentChoice?: GarmentChoiceKey,
    ) => {
        if (!sourceBound) return legacy;
        const entries = availableCharacterAssets().filter(asset =>
            asset.type === type && asset.reviewStatus === 'accepted' &&
            characterAssetFitsBody(asset, body) &&
            (!garmentChoice || garmentFitsChoice(asset, garmentChoice)));
        if (!entries.length) return '';
        const style = type === 'hair' ? base.appearance.hairStyle :
            type === 'beard' ? base.appearance.beardStyle : undefined;
        if (style === 'none') return '';
        const matching = entries.find(asset => asset.style === style);
        const stream = garmentChoice && garmentChoice !== 'outfit'
            ? 'v04.garment.' + garmentChoice + '.module' : 'v04.' + type + '.module';
        return matching?.id ?? entries[Math.floor(identitySample(dna.seed, stream) * entries.length)].id;
    };
    const select = (choice: string, automaticId: string) =>
        choice === 'none' ? null : choice === 'auto' ? automaticId || null : choice;
    const hairId = select(presentation.hair, automatic('hair', 'hair/' + base.appearance.hairStyle));
    const headwearId = select(presentation.headwear, automatic('headwear', ''));
    const beardEligible = base.age >= 18 && base.masculinity > .5;
    const beardId = beardEligible
        ? select(presentation.beard, automatic('beard',
            base.appearance.beardStyle === 'none' ? '' : 'beard/' + base.appearance.beardStyle))
        : null;
    // Opting into separate slots suppresses the legacy automatic full ensemble.
    const outfitId = separateRequested && !complementaryFootwear(presentation) ? null :
        select(presentation.outfit, automatic('garment', '', 'outfit'));
    const shoesId = select(presentation.shoes, automatic('garment', '', 'shoes'));
    const trousersId = select(presentation.trousers, automatic('garment', '', 'trousers'));
    const topId = select(presentation.top, automatic('garment', '', 'top'));
    const bodyArmorId = presentation.bodyArmor && presentation.bodyArmor !== 'none' ? presentation.bodyArmor : null;
    const garmentIds = [outfitId, shoesId, trousersId, topId, bodyArmorId]
        .filter((id): id is string => !!id);

    let equipmentId = select(presentation.equipment, automatic('equipment', ''));
    const dependency = equipmentId ? characterAsset(equipmentId).metadata?.dependency?.module : undefined;
    if (dependency && !garmentIds.includes(dependency)) equipmentId = null;
    const equipmentSocket = equipmentId
        ? (presentation.equipmentSocket === 'auto'
            ? moduleAtEquipmentSocket(characterAsset(equipmentId).metadata!).anchor
            : moduleAtEquipmentSocket(characterAsset(equipmentId).metadata!, presentation.equipmentSocket).anchor)
        : null;
    const equipmentIds = [equipmentId, ...(presentation.equipmentItems ?? [])]
        .filter((id): id is string => !!id);
    if (new Set(equipmentIds).size !== equipmentIds.length)
        throw new Error('Equipment modules must be distinct.');
    const occupiedHands = equipmentIds.map(id => id === equipmentId ? equipmentSocket :
        characterAsset(id).metadata!.anchor).filter(socket =>
        socket === 'socket_hand_L' || socket === 'socket_hand_R');
    if (new Set(occupiedHands).size !== occupiedHands.length)
        throw new Error('Only one equipment module can occupy each native hand.');
    const profile = {...base, appearance: {...base.appearance,
        hairStyle: hairId ? characterAsset(hairId).style as HairStyle : base.appearance.hairStyle,
        beardStyle: beardId ? characterAsset(beardId).style as BeardStyle : 'none' as const,
        color: presentation.hairColor ?? base.appearance.color,
    }};
    return {presentation, profile, hairId, beardId, headwearId, outfitId, shoesId, trousersId, topId, bodyArmorId,
        garmentIds, equipmentId, equipmentIds, equipmentSocket, beardEligible};
}
