/** Opt-in wall-clock evidence stays outside canonical blueprints and saved RNG. */
export type GenerationObserver = (sample: { stage: string; milliseconds: number }) => void;

export function measureGeneration<T>(stage: string, operation: () => T, observe?: GenerationObserver): T {
    if (!observe) return operation();
    const start = performance.now();
    try {
        return operation();
    } finally {
        observe({ stage, milliseconds: performance.now() - start });
    }
}
