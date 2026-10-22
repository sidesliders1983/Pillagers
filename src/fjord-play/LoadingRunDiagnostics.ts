import { loadResourceId, type IslandLoadStatus, type LoadTiming } from './IslandLoadStatus';
import type { CharacterPreparationSample } from '../characters/CharacterPreparation';

type Resource = {
    path: string; initiator: string; startedMs: number; durationMs: number;
    requestStartedMs: number; responseStartedMs: number; responseEndedMs: number;
    transferBytes: number; encodedBodyBytes: number; decodedBodyBytes: number;
    responseStatus?: number;
};
const safeError = (error: unknown) => String(error).replace(/https?:\/\/[^\s]+/g, loadResourceId).slice(0, 240);

/** Opt-in, bounded local evidence. Never patches fetch, clears caches or writes campaign storage. */
export class LoadingRunDiagnostics {
    readonly started = performance.now();
    private ended?: number;
    private status?: IslandLoadStatus;
    private observers: PerformanceObserver[] = [];
    private resources: Resource[] = [];
    private resourceKeys = new Set<string>();
    private timings: (LoadTiming & { attempt: string })[] = [];
    private models: { kind: string; asset: string; subject?: string; startedMs: number; durationMs: number }[] = [];
    private characters: (Omit<CharacterPreparationSample, 'started'> & { startedMs: number })[] = [];
    private longTasks: { startedMs: number; durationMs: number }[] = [];
    private dropped = { resources: 0, timings: 0, models: 0, longTasks: 0, characters: 0 };
    private support = { resourceObserver: false, longTaskObserver: false };

    constructor() {
        if (typeof PerformanceObserver === 'undefined') return;
        for (const type of ['resource', 'longtask'] as const) {
            if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
            try {
                const observer = new PerformanceObserver(list => this.collect(list.getEntries()));
                observer.observe({ type, buffered: true });
                this.observers.push(observer);
                if (type === 'resource') this.support.resourceObserver = true;
                else this.support.longTaskObserver = true;
            } catch { /* Unsupported browser measurement remains explicit in the report. */ }
        }
    }

    attach(status: IslandLoadStatus) {
        this.status = status;
        status.observeTiming = timing => {
            if (this.timings.length < 2048) this.timings.push(Object.assign(timing, { attempt: status.attempt }));
            else this.dropped.timings++;
        };
    }

    model(kind: string, asset: string, started: number, subject?: string) {
        if (this.models.length < 512) this.models.push({ kind, asset: asset.slice(0, 180),
            subject: subject?.slice(0, 80), startedMs: started - this.started, durationMs: performance.now() - started });
        else this.dropped.models++;
    }
    character(sample: CharacterPreparationSample) {
        if (this.ended !== undefined) return;
        if (this.characters.length >= 2048) { this.dropped.characters++; return; }
        const { started, resource, ...timing } = sample;
        this.characters.push({ ...timing, startedMs: started - this.started,
            resource: resource && loadResourceId(resource) });
    }

    private collect(entries: PerformanceEntry[]) {
        for (const entry of entries) {
            if (entry.startTime < this.started || (this.ended !== undefined && entry.startTime > this.ended)) continue;
            if (entry.entryType === 'longtask') {
                if (this.longTasks.length < 512) this.longTasks.push({
                    startedMs: entry.startTime - this.started, durationMs: entry.duration });
                else this.dropped.longTasks++;
            } else if (entry.entryType === 'resource') {
                // Embedded image/blob URLs contain model data, not a useful file path.
                if (/^(data|blob):/i.test(entry.name)) continue;
                const resource = entry as PerformanceResourceTiming & { responseStatus?: number };
                const path = loadResourceId(entry.name);
                const key = `${path}|${entry.startTime}|${entry.duration}|${resource.initiatorType}`;
                if (this.resourceKeys.has(key)) continue;
                if (this.resources.length >= 2048) { this.dropped.resources++; continue; }
                this.resourceKeys.add(key);
                this.resources.push({ path, initiator: resource.initiatorType,
                    startedMs: entry.startTime - this.started, durationMs: entry.duration,
                    requestStartedMs: resource.requestStart ? resource.requestStart - this.started : 0,
                    responseStartedMs: resource.responseStart ? resource.responseStart - this.started : 0,
                    responseEndedMs: resource.responseEnd - this.started,
                    transferBytes: resource.transferSize, encodedBodyBytes: resource.encodedBodySize,
                    decodedBodyBytes: resource.decodedBodySize,
                    responseStatus: resource.responseStatus || undefined });
            }
        }
    }

    finish(error?: unknown) {
        if (this.ended === undefined) {
            this.ended = performance.now();
            for (const observer of this.observers) {
                this.collect(observer.takeRecords());
                observer.disconnect();
            }
            this.observers = [];
            this.collect(performance.getEntriesByType('resource'));
            if (this.status?.outcome === 'preparing') this.status.stop(
                error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed', error);
        }
        const loading = this.status?.snapshot();
        if (loading?.error) loading.error.message = safeError(loading.error.message);
        const resources = this.resources.map(resource => ({ ...resource }));
        return {
            schema: 'fjordside-loading-run', version: 1, diagnosticOnly: true,
            startedUtc: new Date(performance.timeOrigin + this.started).toISOString(),
            elapsedMs: this.ended - this.started,
            outcome: loading?.outcome ?? 'failed', loading,
            error: error === undefined ? undefined : safeError(error),
            summary: { resourceCount: resources.length,
                observedTransferBytes: resources.reduce((sum, item) => sum + item.transferBytes, 0),
                observedEncodedBodyBytes: resources.reduce((sum, item) => sum + item.encodedBodyBytes, 0),
                settlementModelCount: this.models.length },
            resources, settlementModels: this.models.map(model => ({ ...model })),
            characterPreparation: this.characters.map(sample => ({ ...sample })),
            // Nested spans overlap. Their durations must not be summed as total CPU time.
            preparation: this.timings.map(timing => ({ ...timing })),
            longTasks: this.longTasks.map(task => ({ ...task })), support: { ...this.support },
            dropped: { ...this.dropped },
            limits: [
                'Capture starts at the selected loading run, before the game module import. Earlier menu files are excluded.',
                'Resources are window Resource Timing entries, not a complete inventory of worker/cache/internal decoder activity.',
                'Zero byte sizes or response status may mean cached, restricted or unavailable measurements; cache temperature is not inferred.',
                'Resource duration is browser loading time. Model durations include waiting, fitting, reconciliation and bounds; they are not pure decode time.',
                'Preparation timestamps are relative to the loading attempt; resources, models and long tasks are relative to this run.',
                'Long tasks are browser-dependent main-thread tasks of at least 50 ms. Absence does not prove no CPU stalls.',
                'No GPU duration, process memory, campaign history or save content is recorded. Process termination may prevent a final download.',
            ],
        };
    }
}
