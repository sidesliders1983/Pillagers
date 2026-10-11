import type { FrozenLoreRequest, LocalLoreAdapter, LoreResult } from './LocalLoreAdapter';

/** An isolated experiment queue: model completions have no access to publication or playback. */
export class LoreExperimentQueue {
    private epoch = 0;
    private nextChapter = 0;
    private tail: Promise<void> = Promise.resolve();
    private pending = new Map<string, { fingerprint: string; job: Promise<LoreResult> }>();
    private committed: LoreResult[] = [];
    constructor(private adapter: LocalLoreAdapter, private lineage: string) {}

    enqueue(request: FrozenLoreRequest): Promise<LoreResult> {
        const input = structuredClone(request);
        if (input.lineage !== this.lineage)
            return Promise.reject(new Error('Local Lore request belongs to another save lineage.'));
        const existing = this.pending.get(input.key);
        const fingerprint = JSON.stringify(input);
        if (existing) {
            if (existing.fingerprint !== fingerprint)
                return Promise.reject(new Error('Changed frozen request behind a cached Local Lore key.'));
            return existing.job;
        }
        if (input.chapterIndex !== this.nextChapter)
            return Promise.reject(new Error('Local Lore chapters must be queued in chronological order.'));
        this.nextChapter++;
        const epoch = this.epoch;
        const stale = (): LoreResult => ({ key: input.key, status: 'stale',
            reason: 'save-lineage-invalidated', text: input.baseline });
        const job = this.tail.then(async () => {
            if (epoch !== this.epoch) return stale();
            const result = await this.adapter.generate(input, this.committed.slice(-3).map(result => result.text));
            if (epoch !== this.epoch) return stale();
            this.committed.push(structuredClone(result));
            return result;
        });
        this.pending.set(input.key, { fingerprint, job });
        this.tail = job.then(() => undefined, () => undefined);
        return job;
    }
    invalidate(lineage: string): void {
        this.epoch++;
        this.lineage = lineage;
        this.nextChapter = 0;
        this.pending.clear();
        this.committed = [];
        this.tail = Promise.resolve();
    }
    results(): LoreResult[] { return structuredClone(this.committed); }
}
