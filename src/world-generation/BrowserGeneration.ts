import { GenerationClient } from './GenerationClient';

export function browserGeneration() {
    return new GenerationClient(() => new Worker(new URL('./GenerationWorker.ts', import.meta.url), { type: 'module' }));
}
