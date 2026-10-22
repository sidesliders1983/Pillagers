import { assetDigest } from './AssetDigest';
import { preparedCharacterCatalog } from './PreparedCharacterCatalog';
import { characterAsync, type CharacterPreparationObserver } from './CharacterPreparation';
import { unpackPreparedBytes } from '../core/PreparedBytes';

/** The catalog binds each compressed publication to the unchanged original asset identity. */
export async function verifiedCharacterBytes(url: string, originalSha256: string,
    observe?: CharacterPreparationObserver, kind: 'source' | 'binding' = 'source', read: typeof fetch = fetch) {
    const originalPath = url.split('?')[0];
    const entry = preparedCharacterCatalog.entries.find(value => value.originalPath === originalPath);
    if (entry && entry.originalSha256 !== originalSha256)
        throw new Error('Prepared character source is stale: ' + originalPath);
    const path = entry ? entry.path + '?v=' + entry.sha256.slice(0, 12) : url;
    const resource = path.split('?')[0];
    const bytes = await characterAsync(observe, kind + '-fetch-read', async () => {
        const response = await read(path);
        if (!response.ok) throw new Error(`Could not load Meshy asset (HTTP ${response.status}): ` + resource);
        return response.arrayBuffer();
    }, resource);
    const expected = entry?.sha256 ?? originalSha256;
    if ((entry && bytes.byteLength !== entry.bytes) ||
        await characterAsync(observe, kind + '-digest', () => assetDigest(bytes), resource) !== expected)
        throw new Error('Meshy asset bytes differ from the frozen identity: ' + resource);
    if (!entry) return bytes;
    return characterAsync(observe, kind + '-unpack', () => unpackPreparedBytes(bytes, entry.originalBytes), resource);
}
