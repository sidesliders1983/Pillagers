/** Opt-in wall-clock evidence stays outside canonical blueprints and saved RNG. */
import type { TerrainPreviewSource } from './TerrainPreview';

export type GenerationObserver = ((sample: { stage: string; milliseconds: number }) => void) & {
    begin?: (stage: string) => void;
    preview?: (source: TerrainPreviewSource) => void;
};

export function measureGeneration<T>(stage: string, operation: () => T, observe?: GenerationObserver): T {
    if (!observe) return operation();
    observe.begin?.(stage);
    const start = performance.now();
    try {
        return operation();
    } finally {
        observe({ stage, milliseconds: performance.now() - start });
    }
}
