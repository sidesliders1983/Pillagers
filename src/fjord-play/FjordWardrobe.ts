import type { PersonalEquipment } from '../simulation/Smithery';
import { characterAsset } from '../characters/CharacterAssets';
import { nativeCombatEquipmentByItem } from '../characters/NativeCombatEquipmentCatalog';
import {defaultCharacterPresentation, type CharacterPresentation} from '../characters/CharacterPresentation';
import {gridTrialOutfitId} from '../characters/GridTrialOutfitCatalog';
import type { CharacterPreparationObserver } from '../characters/CharacterPreparation';
import {identitySample} from '../characters/seededRandom';
import {characterAppearance} from '../characters/CharacterAppearance';
import {femaleHairAssets} from '../characters/FemaleHairCatalog';
import type {FjordEntity} from './FjordProjection';
import type {MeshyHuman, MeshyHumanFactory} from '../characters/MeshyHuman';

const bare = {...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none'};
export const fjordClothingSets = Object.freeze({
    native: Object.freeze({...bare}),
    generic: Object.freeze({...bare, outfit: gridTrialOutfitId, shoes: 'garment/meshy-low-shoes-005'}),
    fisherman: Object.freeze({...bare, top: 'garment/meshy-fisherman-tunic-009',
        trousers: 'garment/meshy-fisherman-trousers-009', shoes: 'garment/meshy-fisherman-shoe-009'}),
    farmerFemale: Object.freeze({...bare, trousers: 'garment/meshy-long-skirt-005',
        shoes: 'garment/meshy-low-shoes-005'}),
    farmerMale: Object.freeze({...bare, trousers: 'garment/meshy-short-trousers-006',
        shoes: 'garment/meshy-high-shoes-005'}),
});
export type FjordClothingSet = keyof typeof fjordClothingSets;

function fieldClothing(entity: Pick<FjordEntity, 'status'>): boolean {
    return !!entity.status.expedition || !!entity.status.encounter ||
        entity.status.presence?.duty?.role === 'mobilise';
}

/** Field clothing is source-qualified from sixteen; younger/civilian clothing keeps its existing contract. */
export function fjordClothingSet(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>): FjordClothingSet {
    if (entity.kind !== 'persona' || !entity.dna) return 'native';
    if (fieldClothing(entity) && entity.dna.age >= 16) return 'generic';
    if (entity.dna.age < 18) return 'native';
    if (entity.status.occupation === 'fisher') return 'fisherman';
    if (entity.status.occupation !== 'farmer') return 'generic';
    return entity.dna.sex === 'female' ? 'farmerFemale' : 'farmerMale';
}

export const fjordShortHairAssets = ['hair/manual-fitted-short', 'hair/manual-fitted-short2'] as const;
export const fjordMaleHairAssets = [...fjordShortHairAssets,
    'hair/manual-long-braided', 'hair/manual-long-2'] as const;
export const fjordFemaleHairAssets = femaleHairAssets.map(asset => asset.id);
export const fjordHairAssets: readonly string[] = [...fjordMaleHairAssets, ...fjordFemaleHairAssets];

/** Adult women use the fitted female styles; men's and children's existing streams stay stable. */
export function fjordHairAsset(entity: Pick<FjordEntity, 'kind' | 'dna'>): string {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 6) return 'none';
    // Long hair has adult-only source bindings. Preserve children's existing short variants.
    const adult = entity.dna.age >= 18;
    const female = adult && entity.dna.sex === 'female';
    const assets = female ? fjordFemaleHairAssets : adult ? fjordMaleHairAssets : fjordShortHairAssets;
    const stream = female ? 'fjord.hair.female.adult.variant' :
        adult ? 'fjord.hair.adult.variant' : 'fjord.hair.short.variant';
    const variant = Math.floor(identitySample(entity.dna.seed, stream) * assets.length);
    return assets[variant];
}

export const fjordBeardAssets = [
    'beard/manual-fitted-braid', 'beard/manual-fitted-double',
    'beard/manual-fitted-normal', 'beard/manual-fitted-pointed',
] as const;

/** Preserve DNA beard presence; select an approved style without consuming Core RNG. */
export function fjordBeardAsset(entity: Pick<FjordEntity, 'kind' | 'dna'>): string {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 18) return 'none';
    if (characterAppearance(entity.dna).beardStyle === 'none') return 'none';
    const variant = Math.floor(identitySample(entity.dna.seed, 'fjord.beard.adult.variant') * fjordBeardAssets.length);
    return fjordBeardAssets[variant];
}

/** Hats remain independent of hair and carried tools. */
function occupationModuleAsset(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>, type: 'headwear' | 'equipment'): string {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 18) return 'none';
    if (fieldClothing(entity)) return 'none';
    const occupation = entity.status.occupation;
    return occupation && ['farmer', 'fisher', 'hunter', 'smith'].includes(occupation)
        ? type + '/occupation-' + occupation : 'none';
}
export function fjordHeadwearAsset(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>): string {
    return occupationModuleAsset(entity, 'headwear');
}
export function fjordToolAsset(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>): string {
    return occupationModuleAsset(entity, 'equipment');
}

/** Only items occupying a free authored hand are visible; stowed assignments remain private. */
export function fjordVisibleEquipment(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>): PersonalEquipment {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 16 || !entity.status.living)
        return { weapon: null, shield: null };
    const gear = entity.status.equipment, tool = fjordToolAsset(entity);
    const workHand = tool === 'none' ? undefined : characterAsset(tool).metadata?.anchor;
    return { weapon: workHand === 'socket_hand_R' ? null : gear?.weapon ?? null,
        shield: workHand === 'socket_hand_L' ? null : gear?.shield ?? null };
}

/** Portraits and live residents use exactly the same wardrobe choices and actual personal items. */
export function fjordWardrobePresentation(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>): CharacterPresentation {
    const gear = fjordVisibleEquipment(entity), tool = fjordToolAsset(entity);
    // Home work keeps its real tool; missions remove that tool before exposing personal gear.
    const items = [gear.weapon, gear.shield].flatMap(item => item ? [nativeCombatEquipmentByItem[item]] : []);
    return { ...fjordClothingSets[fjordClothingSet(entity)], hair: fjordHairAsset(entity),
        beard: fjordBeardAsset(entity), headwear: fjordHeadwearAsset(entity),
        equipment: tool, equipmentItems: items } as CharacterPresentation;
}
interface WardrobeState {
    toolsVisible?: boolean;
    toolsRevision?: number;
    installed?: string;
    pending?: string;
    equipRevision?: number;
    revision: number;
    task?: Promise<void>;
}

/** Per-instance equipment changes finish before scene reconciliation and share cached source assets. */
export class FjordWardrobe {
    private states = new WeakMap<MeshyHuman, WardrobeState>();
    constructor(private factory: MeshyHumanFactory, private report: (message: string) => void) {}

    /** Ceremony visibility changes reuse installed tools, without another equip/refit operation. */
    setToolsVisible(human: MeshyHuman, visible: boolean) {
        if (human.isDisposed) return;
        let state = this.states.get(human);
        if (!state) {
            state = { revision: 0 };
            this.states.set(human, state);
        }
        if (state.toolsVisible === visible && state.toolsRevision === human.equipRevision) return;
        state.toolsVisible = visible;
        state.toolsRevision = human.equipRevision;
        for (const [id, group] of human.fit.modules)
            if (id.startsWith('equipment/occupation-')) group.visible = visible;
    }

    async reconcile(human: MeshyHuman, entity: FjordEntity, observe?: CharacterPreparationObserver) {
        if (human.isDisposed) return;
        const selected = fjordClothingSet(entity);
        const presentation = fjordWardrobePresentation(entity);
        const key = JSON.stringify(presentation);
        let state = this.states.get(human);
        if (!state) {
            state = {revision: 0};
            this.states.set(human, state);
        }
        if (state.installed === key && !state.task) return;
        if (state.pending === key && state.equipRevision === human.equipRevision && state.task) {
            await state.task;
            return;
        }
        const revision = ++state.revision;
        state.pending = key;
        const request = this.factory.equip(human, presentation, observe);
        const equipRevision = human.equipRevision;
        state.equipRevision = equipRevision;
        state.task = request.then(() => {
            if (human.isDisposed || state.revision !== revision || human.equipRevision !== equipRevision) return;
            state.installed = key;
            state.toolsRevision = undefined;
            this.setToolsVisible(human, state.toolsVisible ?? true);
            human.root.userData.clothingSet = {
                id: selected,
                assets: {...human.root.userData.selectedAssets},
            };
        }).catch(error => {
            if (state.revision === revision && !human.isDisposed) {
                this.report(entity.id + ': clothing set ' + selected + ' unavailable; retained current body — ' + String(error));
            }
        }).finally(() => {
            if (state.revision === revision) {
                state.pending = undefined;
                state.task = undefined;
            }
        });
        await state.task;
    }
}
