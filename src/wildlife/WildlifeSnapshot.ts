import type { WildlifeActor, WildlifePopulation } from './WildlifePopulation';

const motionKeys = ['position', 'target', 'heading', 'bank', 'state', 'wait', 'decisions',
    'fleeUntil', 'escapeWait', 'climbRate', 'flapEffort', 'hop'] as const;
export type WildlifeMotion = Pick<WildlifeActor, 'id' | typeof motionKeys[number]>;

/** Persist only motion; seeded identity, habitat and variant settings come from the real population. */
export function captureWildlife(population: WildlifePopulation): WildlifeMotion[] {
    return population.actors.map(actor => {
        const motion: Record<string, unknown> = { id: actor.id };
        for (const key of motionKeys) {
            if (actor[key] !== undefined) motion[key] = structuredClone(actor[key]);
        }
        return motion as unknown as WildlifeMotion;
    });
}

/** Restore in place so pooled render records retain their actor references. */
export function restoreWildlife(population: WildlifePopulation, actors: readonly WildlifeMotion[], time: number) {
    const saved = new Map(actors.map(actor => [actor.id, actor]));
    if (saved.size !== population.actors.length) throw new Error('Wildlife population identity mismatch.');
    for (const actor of population.actors) {
        const motion = saved.get(actor.id);
        if (!motion) throw new Error('Wildlife instance missing from saved population.');
        for (const key of motionKeys) {
            if (motion[key] === undefined) delete (actor as unknown as Record<string, unknown>)[key];
            else (actor as unknown as Record<string, unknown>)[key] = structuredClone(motion[key]);
        }
    }
    population.time = time;
}
