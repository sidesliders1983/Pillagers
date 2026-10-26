import type { AnimationClip } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetDigest } from './AssetDigest';
import { humanCulturalAnimations, type CulturalAnimationName } from './HumanCulturalAnimations';
import type { MeshyHuman } from './MeshyHuman';

export interface CulturalMotionRequest { eventId: string; visible: boolean; }

async function downloadMotion(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Cultural motion download failed.');
    return response.arrayBuffer();
}

/** One lazy clip bank per presentation owner; no residents, materials or mixers are created. */
export class CulturalMotion {
    private bank?: Promise<readonly AnimationClip[] | null>;
    private generation = 0;
    private failed = false;
    private disposed = false;
    private plays = new WeakMap<MeshyHuman, {
        key: string;
        result: Promise<boolean>;
    }>();

    constructor(private readonly download: (url: string) => Promise<ArrayBuffer> = downloadMotion) {}

    async prepare(request: CulturalMotionRequest): Promise<readonly AnimationClip[] | null> {
        if (this.disposed || !request.visible || !request.eventId.trim()) return null;
        const generation = this.generation;
        this.bank ??= this.loadBank().catch(() => {
            this.failed = true;
            return null;
        });
        const clips = await this.bank;
        return this.disposed || generation !== this.generation ? null : clips;
    }

    async play(human: MeshyHuman, clip: CulturalAnimationName, request: CulturalMotionRequest) {
        if (this.disposed || human.isDisposed || !request.visible || !request.eventId.trim()) return false;
        const generation = this.generation;
        const key = request.eventId + ':' + clip;
        const previous = this.plays.get(human);
        if (previous?.key === key) return previous.result;
        const result = this.prepare(request).then(clips => {
            if (!clips || this.disposed || generation !== this.generation || human.isDisposed) return false;
            return human.registerPresentationClips(clips) && human.playPresentationClip(clip);
        });
        this.plays.set(human, { key, result });
        return result;
    }

    /** Invalidates pending event requests; the shared validated asset can serve the next scene. */
    reset() {
        this.generation++;
        if (this.failed) {
            this.bank = undefined;
            this.failed = false;
        }
        this.plays = new WeakMap();
    }

    dispose() {
        this.disposed = true;
        this.generation++;
        this.bank = undefined;
        this.plays = new WeakMap();
    }

    private async loadBank() {
        const asset = humanCulturalAnimations;
        const bytes = await this.download(asset.path + '?v=' + asset.sha256.slice(0, 12));
        if (bytes.byteLength !== asset.bytes || await assetDigest(bytes) !== asset.sha256) {
            throw new Error('Cultural motion bytes differ from the approved identity.');
        }
        const source = await new GLTFLoader().parseAsync(bytes, '');
        return Object.freeze(source.animations);
    }
}
