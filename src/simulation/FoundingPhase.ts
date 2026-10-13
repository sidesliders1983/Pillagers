import type { GameTime } from './SimulationCore';

/** Explicit opt-in; absent in historical campaigns and the default headless factory. */
export type FoundingPhase = 'summer-800-v1';

export function foundingTime(phase?: FoundingPhase): GameTime {
    if (phase === undefined) return { winter: 800, tick: 0 };
    if (phase !== 'summer-800-v1') throw new Error('Unsupported founding phase.');
    return { winter: 800, tick: 500 };
}
