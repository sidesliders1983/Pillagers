import {defaultCharacterPresentation, type CharacterPresentation} from '../characters/CharacterPresentation';
import {gridTrialOutfitId} from '../characters/GridTrialOutfitCatalog';
import {identitySample} from '../characters/seededRandom';
import type {FjordEntity} from './FjordProjection';
import type {MeshyHuman, MeshyHumanFactory} from '../characters/MeshyHuman';

const bare = {...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none'};
export const fjordClothingSets = Object.freeze({
    native: Object.freeze({...bare}),
    generic: Object.freeze({...bare, outfit: gridTrialOutfitId, shoes: 'garment/meshy-low-shoes-005'}),
    farmerFemale: Object.freeze({...bare, trousers: 'garment/meshy-long-skirt-005',
        shoes: 'garment/meshy-low-shoes-005'}),
    farmerMale: Object.freeze({...bare, trousers: 'garment/meshy-short-trousers-006',
        shoes: 'garment/meshy-high-shoes-005'}),
});
export type FjordClothingSet = keyof typeof fjordClothingSets;

/** Render-only sets use canonical sex/occupation; adult clothing is never resized onto children. */
export function fjordClothingSet(entity: Pick<FjordEntity, 'kind' | 'dna' | 'status'>): FjordClothingSet {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 18) return 'native';
    if (entity.status.occupation !== 'farmer') return 'generic';
    return entity.dna.sex === 'female' ? 'farmerFemale' : 'farmerMale';
}

/** Owner-approved short styles use a separate visual seed stream, independent of occupation. */
export const fjordHairAssets = ['hair/manual-fitted-short', 'hair/manual-fitted-short2'] as const;
export function fjordHairAsset(entity: Pick<FjordEntity, 'kind' | 'dna'>): string {
    if (entity.kind !== 'persona' || !entity.dna || entity.dna.age < 6) return 'none';
    const variant = Math.floor(identitySample(entity.dna.seed, 'fjord.hair.short.variant') * fjordHairAssets.length);
    return fjordHairAssets[variant];
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
        const key = selected + ':' + hair;
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
        const request = this.factory.equip(human, {...fjordClothingSets[selected], hair} as CharacterPresentation);
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
