import { assetDigest } from '../characters/AssetDigest';
import { unpackPreparedBytes } from '../core/PreparedBytes';
import { campaignIslandCatalog } from './BakedIslandCatalog';
import { adoptCampaignIsland, islandRecipe, type IslandRecipe } from './CampaignIsland';
import { terrainPreview } from '../world-generation/TerrainPreview';
import type { GeneratedResult, GenerationProgress } from '../world-generation/GenerationTask';

type Emit = (event: GenerationProgress) => void;

/** Read one exact, build-validated island. No generation or pool preload on the player's device. */
export async function loadBakedCampaignIsland(seed: number, requested?: IslandRecipe,
    emit: Emit = () => {}, read: typeof fetch = fetch): Promise<GeneratedResult> {
    const recipe = islandRecipe(seed, requested?.version);
    if (requested && (requested.version !== recipe.version || requested.seed !== recipe.seed ||
        requested.generatorVersion !== recipe.generatorVersion))
        throw new Error('Campaign island recipe does not match its seed or supported version.');
    const entry = campaignIslandCatalog.entries.find(value =>
        value.version === recipe.version && value.seed === recipe.seed);
    if (!entry || recipe.generatorVersion !== campaignIslandCatalog.generatorVersion)
        throw new Error('The prepared island is absent from this build.');

    const measure = async <T>(stage: string, operation: () => T | Promise<T>) => {
        const started = performance.now();
        emit({ type: 'phase', stage, startedAt: performance.timeOrigin + started });
        const result = await operation();
        emit({ type: 'timing', stage, milliseconds: performance.now() - started });
        return result;
    };
    let compressed: ArrayBuffer | undefined = await measure('island-download', async () => {
        const response = await read(entry.path + '?v=' + entry.sha256.slice(0, 12));
        if (!response.ok) throw new Error(`Could not load the prepared island (HTTP ${response.status}): ` + entry.path);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== entry.bytes || await assetDigest(bytes) !== entry.sha256)
            throw new Error('Prepared island bytes differ from this build: ' + entry.path);
        return bytes;
    });
    const result = await measure('island-unpack', async () => {
        const bytes = await unpackPreparedBytes(compressed!, entry.jsonBytes);
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as GeneratedResult;
    });
    compressed = undefined;
    await measure('island-verify', () => adoptCampaignIsland(seed, result.world, result.plan!, recipe));
    emit({ type: 'preview', preview: terrainPreview(result.world) });
    return result;
}
