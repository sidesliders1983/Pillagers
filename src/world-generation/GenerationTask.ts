import { createCampaignIsland, campaignIslandPlan, type CampaignIslandPlan, type IslandRecipe } from '../fjord-play/CampaignIsland';
import { generateWorld, changeWorldConifers } from './GenerateWorld';
import { terrainPreview, type TerrainPreview } from './TerrainPreview';
import type { GenerationObserver } from './GenerationProfile';
import type { GenerationRequest, WorldBlueprint } from './WorldBlueprint';

export type GenerationTask = ({ kind: 'world'; config: GenerationRequest } | { kind: 'campaign'; seed: number; recipe?: IslandRecipe } |
    { kind: 'conifers'; world: WorldBlueprint; conifers: 'kaykit' | 'ez-tree' }) & { profile?: boolean };
export type GenerationProgress = { type: 'phase'; stage: string; startedAt?: number } |
    { type: 'timing'; stage: string; milliseconds: number } |
    { type: 'preview'; preview: TerrainPreview } |
    { type: 'transport'; jsonBytes: number | null; serializationMs: number; sentAt: number };
export interface GeneratedResult { world: WorldBlueprint; plan?: CampaignIslandPlan }

/** Runs in the dedicated worker; shared with the headless contract harness. */
export function runGenerationTask(task: GenerationTask, emit: (event: GenerationProgress) => void): GeneratedResult {
    const observer: GenerationObserver = sample => emit({ type: 'timing', ...sample });
    observer.begin = stage => emit({ type: 'phase', stage, startedAt: performance.timeOrigin + performance.now() });
    observer.preview = source => emit({ type: 'preview', preview: terrainPreview(source) });
    emit({ type: 'phase', stage: 'terrain' });
    const world = task.kind === 'campaign' ? createCampaignIsland(task.seed, task.recipe, observer) :
        task.kind === 'conifers' ? changeWorldConifers(task.world, task.conifers) : generateWorld(task.config, observer);
    observer.preview(world);
    return { world, ...(task.kind === 'campaign' ? { plan: campaignIslandPlan(world)! } : {}) };
}
