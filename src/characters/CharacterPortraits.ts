import type { CharacterDNA } from './CharacterDNA';
import type { CharacterPresentation } from './CharacterPresentation';
import type { FacialIdentityV1 } from './FacialIdentity';
import type { HumanProfile } from './UniversalHumanProfile';
import type { NativePortraitRenderer } from './NativePortraitRenderer';
import { resolveCharacterPresentation } from './CharacterPresentation';
import { characterAsset, characterAssetURL } from './CharacterAssets';
import { meshyHumanAssetIdentity } from './MeshyHumanAssetIdentity';

export interface PortraitRequest {
    dna: CharacterDNA;
    face: FacialIdentityV1;
    presentation?: Partial<CharacterPresentation>;
    profile?: HumanProfile;
    pixelRatio?: number;
}

function portraitKey(input: PortraitRequest) {
    const body = { id: 'body/meshy-human', sha256: meshyHumanAssetIdentity[0].sha256 };
    const selected = resolveCharacterPresentation(input.dna, input.presentation ??
        { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none' }, body);
    const modules = [selected.hairId, selected.beardId, selected.headwearId,
        ...selected.garmentIds, selected.equipmentId].filter((id): id is string => !!id)
        .map(id => [id, characterAssetURL(id, 0), characterAsset(id).metadata?.nativeBinding]);
    return JSON.stringify(['portrait-shape-v1', body, modules, input]);
}

/** One serial, on-demand studio and a bounded image cache per consumer. No frame loop.
 * The native renderer is released after the current request burst; PNGs remain cached. */
export class CharacterPortraits {
    private images = new Map<string, string>();
    private queue: Promise<unknown> = Promise.resolve();
    private renderer?: NativePortraitRenderer;
    private revision = 0;
    private disposed = false;

    constructor(private render?: (input: PortraitRequest) => Promise<string>, private capacity = 24) {
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 48)
            throw new Error('Portrait cache capacity must be between 1 and 48 images.');
    }

    request(input: PortraitRequest, signal?: AbortSignal): Promise<string | undefined> {
        const revision = ++this.revision;
        const frozen = structuredClone(input);
        const key = portraitKey(frozen);
        const request = this.queue.then(async () => {
            if (this.disposed || signal?.aborted) return undefined;
            let image = this.images.get(key);
            if (!image) {
                if (this.render) image = await this.render(frozen);
                else {
                    const { NativePortraitRenderer } = await import('./NativePortraitRenderer');
                    this.renderer ??= new NativePortraitRenderer();
                    image = await this.renderer.render(frozen);
                }
            }
            if (this.disposed || signal?.aborted) return undefined;
            this.images.delete(key);
            this.images.set(key, image);
            while (this.images.size > this.capacity) this.images.delete(this.images.keys().next().value!);
            return image;
        }).finally(() => {
            if (revision === this.revision || this.disposed) {
                this.renderer?.dispose();
                this.renderer = undefined;
            }
        });
        this.queue = request.catch(() => {});
        return request;
    }

    dispose() {
        this.disposed = true;
        this.images.clear();
        // Any in-flight native model is released by render's finally block.
        void this.queue.finally(() => {
            this.renderer?.dispose();
            this.renderer = undefined;
        });
    }
}
