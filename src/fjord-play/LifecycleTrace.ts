/** Opt-in local diagnostics only. No telemetry, browser identifiers or saved game changes. */
export class LifecycleTrace {
    private events: Record<string, unknown>[] = [];
    private observer?: PerformanceObserver;
    private page = 1;
    private storageKey = 'fjordside.lifecycle-trace.v1';
    private longTasks = { supported: false, count: 0, totalMs: 0, maximumMs: 0 };
    constructor(private enabled: boolean, private metadata: () => Record<string, unknown>) {
        if (!enabled) return;
        try {
            const previous = JSON.parse(sessionStorage.getItem(this.storageKey) ?? '[]');
            if (Array.isArray(previous)) this.events = previous.filter(value =>
                value && typeof value.event === 'string' && Number.isInteger(value.page)).slice(-64);
            this.page = Math.min(1000000, Math.max(0, ...this.events.map(value => Number(value.page))) + 1);
        } catch { /* Diagnostics must not depend on storage availability. */ }
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        this.record('navigation', { type: navigation?.type ?? 'unknown' });
        if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
            this.longTasks.supported = true;
            this.observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    this.longTasks.count++;
                    this.longTasks.totalMs += entry.duration;
                    this.longTasks.maximumMs = Math.max(this.longTasks.maximumMs, entry.duration);
                }
                document.documentElement.dataset.fjordLongTasks = JSON.stringify(this.longTasks);
            });
            this.observer.observe({ type: 'longtask', buffered: true });
        }
        document.documentElement.dataset.fjordLongTasks = JSON.stringify(this.longTasks);
    }
    record(event: string, details: Record<string, unknown> = {}) {
        if (!this.enabled) return;
        this.events.push({ event, page: this.page, milliseconds: performance.now(), ...this.metadata(), ...details });
        if (this.events.length > 64) this.events.shift();
        const text = JSON.stringify(this.events);
        document.documentElement.dataset.fjordLifecycle = text;
        try { sessionStorage.setItem(this.storageKey, text); } catch { /* Never block gameplay for a trace. */ }
    }
    snapshot() { return { events: structuredClone(this.events), longTasks: { ...this.longTasks } }; }
    dispose() { this.observer?.disconnect(); }
}
