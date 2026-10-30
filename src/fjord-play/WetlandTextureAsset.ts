import {RepeatWrapping, SRGBColorSpace, Texture} from 'three';
import {assetDigest} from '../characters/AssetDigest';
import {wetlandAsset} from './WetlandAssets';

/** One small owned bitmap for all visible peat beds. */
export class WetlandTextureAsset {
    private abort = new AbortController();
    private texture?: Texture;
    private loading?: Promise<Texture | undefined>;
    private disposed = false;
    prepare(base = '/'): Promise<Texture | undefined> {
        if (this.disposed) return Promise.resolve(undefined);
        return this.loading ??= (async () => {
            try {
                const response = await fetch(base + wetlandAsset.path + '?v=' + wetlandAsset.sha256.slice(0,12), {signal: this.abort.signal});
                if (!response.ok) return;
                const bytes = await response.arrayBuffer();
                if (bytes.byteLength !== wetlandAsset.bytes || await assetDigest(bytes) !== wetlandAsset.sha256) return;
                const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/webp'}));
                if (this.disposed) {bitmap.close(); return;}
                const texture = this.texture = new Texture(bitmap);
                texture.colorSpace = SRGBColorSpace; texture.wrapS = texture.wrapT = RepeatWrapping;
                texture.anisotropy = 2; texture.needsUpdate = true;
                return texture;
            } catch {return;}
        })();
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.abort.abort();
        this.texture?.dispose(); (this.texture?.image as ImageBitmap | undefined)?.close?.(); this.texture = undefined;
    }
}
