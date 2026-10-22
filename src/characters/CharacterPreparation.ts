export interface CharacterPreparationSample {
    stage: string;
    resource?: string;
    subject?: string;
    started: number;
    durationMs: number;
    mode: 'synchronous' | 'async-inclusive';
    outcome: 'complete' | 'failed';
}
export type CharacterPreparationObserver = (sample: CharacterPreparationSample) => void;

/** Optional elapsed spans: async spans include waiting, and nested spans overlap. */
export function characterSync<T>(observe: CharacterPreparationObserver | undefined,
    stage: string, operation: () => T, resource?: string): T {
    if (!observe) return operation();
    const started = performance.now();
    let outcome: CharacterPreparationSample['outcome'] = 'failed';
    try {
        const result = operation();
        outcome = 'complete';
        return result;
    } finally { observe({ stage, resource, started, durationMs: performance.now() - started,
        mode: 'synchronous', outcome }); }
}

export async function characterAsync<T>(observe: CharacterPreparationObserver | undefined,
    stage: string, operation: () => Promise<T>, resource?: string): Promise<T> {
    if (!observe) return operation();
    const started = performance.now();
    let outcome: CharacterPreparationSample['outcome'] = 'failed';
    try {
        const result = await operation();
        outcome = 'complete';
        return result;
    } finally { observe({ stage, resource, started, durationMs: performance.now() - started,
        mode: 'async-inclusive', outcome }); }
}
