import {defaultCharacterPresentation, type CharacterPresentation} from '../characters/CharacterPresentation';
import {gridTrialOutfitId} from '../characters/GridTrialOutfitCatalog';
import {identitySample} from '../characters/seededRandom';
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

/** Render-only sets use canonical sex/occupation; adult clothing is never resized onto children. */
export function fjordClothingSet(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>): FjordClothingSet {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 18) return 'native';
    if (entity.status.occupation === 'fisher') return 'fisherman';
    if (entity.status.occupation !== 'farmer') return 'generic';
    return entity.dna.sex === 'female' ? 'farmerFemale' : 'farmerMale';
}

export const fjordShortHairAssets = ['hair/manual-fitted-short', 'hair/manual-fitted-short2'] as const;
export const fjordHairAssets = [...fjordShortHairAssets,
    'hair/manual-long-braided', 'hair/manual-long-2'] as const;

/** Approved adult styles use a visual seed stream independent of sex and occupation. */
export function fjordHairAsset(entity: Pick<FjordEntity, 'kind' | 'dna'>): string {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 6) return 'none';
    // Long hair has adult-only source bindings. Preserve children's existing short variants.
    const adult = entity.dna.age >= 18;
    const assets = adult ? fjordHairAssets : fjordShortHairAssets;
    const stream = adult ? 'fjord.hair.adult.variant' : 'fjord.hair.short.variant';
    const variant = Math.floor(identitySample(entity.dna.seed, stream) * assets.length);
    return assets[variant];
}

/** Hats remain independent of hair and carried tools. */
function occupationModuleAsset(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>, type: 'headwear' | 'equipment'): string {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 18) return 'none';
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
interface WardrobeState {
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

    async reconcile(human: MeshyHuman, entity: FjordEntity) {
        if (human.isDisposed) return;
        const selected = fjordClothingSet(entity);
        const hair = fjordHairAsset(entity);
        const headwear = fjordHeadwearAsset(entity);
        const equipment = fjordToolAsset(entity);
        const key = selected + ':' + hair + ':' + headwear + ':' + equipment;
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
        const request = this.factory.equip(human, {...fjordClothingSets[selected], hair, headwear, equipment} as CharacterPresentation);
        const equipRevision = human.equipRevision;
        state.equipRevision = equipRevision;
        state.task = request.then(() => {
            if (human.isDisposed || state.revision !== revision || human.equipRevision !== equipRevision) return;
            state.installed = key;
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
