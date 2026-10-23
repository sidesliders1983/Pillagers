export type PerformanceMode = 'Start menu' | 'Loading' | 'Running' | 'Paused' | 'Background' | 'Recovering';
export type PerformanceSpan = 'core' | 'ui' | 'sceneCpu' | 'sceneWall' | 'modelCpu' | 'modelWall' | 'portraitCpu' | 'portraitWall';
export type GpuStatus = 'uninitialized' | 'unsupported' | 'pending' | 'valid' | 'stale' | 'disjoint' | 'context-lost' | 'busy';
export const performanceLimits = { windowMs: 5000, samples: 2048, history: 120,
    events: 32, exportBytes: 128 * 1024 } as const;
export const diagnosticMessage = (message: string) => message.replace(/https?:\/\/[^\s)]+/g, value => {
    try { return new URL(value).pathname; } catch { return '[resource]'; }
}).replace(/\?[^\s]*/g, '?[redacted]').slice(0, 200);

/** Fixed storage: no frame objects, scene references or retained PerformanceEntries. */
class WindowSamples {
    private times = new Float64Array(performanceLimits.samples);
    private values = new Float64Array(performanceLimits.samples);
    private weights = new Float64Array(performanceLimits.samples);
    private cursor = 0;
    private count = 0;
    clear() { this.cursor = this.count = 0; }
    dispose() {
        this.clear();
        this.times = this.values = this.weights = new Float64Array();
    }
    add(at: number, value: number, weight = 0) {
        if (!Number.isFinite(value) || value < 0) return;
        this.times[this.cursor] = at;
        this.values[this.cursor] = value;
        this.weights[this.cursor] = weight;
        this.cursor = (this.cursor + 1) % performanceLimits.samples;
        this.count = Math.min(this.count + 1, performanceLimits.samples);
    }
    read(now: number) {
        const values: number[] = [];
        let weight = 0, first = now, latest = 0;
        for (let index = 0; index < this.count; index++) {
            const slot = (this.cursor - this.count + index + performanceLimits.samples) % performanceLimits.samples;
            if (now - this.times[slot] > performanceLimits.windowMs) continue;
            values.push(this.values[slot]);
            weight += this.weights[slot];
            first = Math.min(first, this.times[slot]);
            latest = this.values[slot];
        }
        values.sort((a, b) => a - b);
        return { count: values.length, windowMs: now - first, weight,
            meanMs: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
            p95Ms: values.length ? values[Math.ceil(values.length * .95) - 1] : null,
            worstMs: values.at(-1) ?? null, latestMs: values.length ? latest : null };
    }
}

export class PerformanceMeasurements {
    readonly started: number;
    private mode: PerformanceMode = 'Start menu';
    private modeStarted: number;
    private intervals = new WindowSamples();
    private cpu = new WindowSamples();
    private spans = Object.fromEntries(['core', 'ui', 'sceneCpu', 'sceneWall', 'modelCpu', 'modelWall', 'portraitCpu', 'portraitWall']
        .map(kind => [kind, new WindowSamples()])) as Record<PerformanceSpan, WindowSamples>;
    private previousFrame?: number;
    private hitchTimes = new Float64Array(61).fill(-Infinity);
    private hitches = new Float64Array(61);
    private processedTicks = 0;
    private gpu: { status: GpuStatus; milliseconds?: number; at?: number } = { status: 'uninitialized' };
    private history: { elapsedMs: number; mode: PerformanceMode; fps: number | null;
        intervalP95Ms: number | null; cpuP95Ms: number | null; gpuMs: number | null; ticks: number }[] = [];
    private events: { elapsedMs: number; kind: string; message: string; durationMs?: number }[] = [];
    private latestError?: { elapsedMs: number; kind: string; message: string };
    private lastHistory = -Infinity;
    private disposed = false;
    constructor(private now = () => performance.now()) {
        this.started = this.modeStarted = now();
    }
    setMode(mode: PerformanceMode) {
        if (this.disposed) return;
        if (mode === this.mode) return;
        this.mode = mode;
        this.modeStarted = this.now();
        this.previousFrame = undefined;
        this.gpu = { status: ['uninitialized', 'unsupported'].includes(this.gpu.status) ? this.gpu.status : 'pending' };
        this.intervals.clear();
        this.cpu.clear();
        for (const samples of Object.values(this.spans)) samples.clear();
    }
    frame(at: number, milliseconds: number) {
        if (this.disposed) return;
        if (this.mode !== 'Running' && this.mode !== 'Paused') return;
        if (this.previousFrame !== undefined) {
            const interval = at - this.previousFrame;
            this.intervals.add(at, interval);
            if (interval >= 100) {
                this.mark('long frame', 'Main-thread frame scheduling gap', interval);
                const bucket = Math.floor(at / 1000) % 61;
                if (at - this.hitchTimes[bucket] >= 1000) this.hitches[bucket] = 0;
                if (interval >= this.hitches[bucket]) {
                    this.hitches[bucket] = interval;
                    this.hitchTimes[bucket] = at;
                }
            }
        }
        this.previousFrame = at;
        this.cpu.add(at, milliseconds);
    }
    span(kind: PerformanceSpan, milliseconds: number, ticks = 0) {
        if (this.disposed) return;
        this.spans[kind].add(this.now(), milliseconds, ticks);
        this.processedTicks += ticks;
    }
    gpuResult(status: GpuStatus, milliseconds?: number) {
        if (this.disposed) return;
        if (status === 'pending' && this.gpu.status === 'valid' && this.now() - this.gpu.at! < 3000) return;
        this.gpu = { status, milliseconds, at: this.now() };
    }
    mark(kind: string, message: string, durationMs?: number) {
        if (this.disposed) return;
        // Diagnostics are local, but exported text must not contain URL credentials/queries.
        const text = diagnosticMessage(message);
        this.events.push({ elapsedMs: this.now() - this.started, kind: kind.slice(0, 40),
            message: text, durationMs });
        if (this.events.length > performanceLimits.events) this.events.shift();
        if (/exception|rejection|failure|context-loss/.test(kind))
            this.latestError = { elapsedMs: this.now() - this.started, kind, message: text };
    }
    sample() {
        const now = this.now();
        const interval = this.intervals.read(now), cpuFrame = this.cpu.read(now);
        const spans = Object.fromEntries(Object.entries(this.spans).map(([kind, values]) =>
            [kind, values.read(now)])) as Record<PerformanceSpan, ReturnType<WindowSamples['read']>>;
        const gpu = this.gpu.status === 'valid' && now - this.gpu.at! > 3000
            ? { ...this.gpu, status: 'stale' as const } : { ...this.gpu };
        const fps = interval.meanMs ? 1000 / interval.meanMs : null;
        if (!this.disposed && now - this.lastHistory >= 500) {
            this.lastHistory = now;
            this.history.push({ elapsedMs: now - this.started, mode: this.mode, fps,
                intervalP95Ms: interval.p95Ms, cpuP95Ms: cpuFrame.p95Ms,
                gpuMs: gpu.status === 'valid' ? gpu.milliseconds! : null, ticks: this.processedTicks });
            if (this.history.length > performanceLimits.history) this.history.shift();
        }
        return { elapsedMs: now - this.started, sampledUtc: new Date(performance.timeOrigin + now).toISOString(),
            mode: this.mode, fps, interval, cpuFrame, spans, gpu,
            ticks: { total: this.processedTicks,
                perSecond: spans.core.weight / Math.max(.001, Math.min(performanceLimits.windowMs, now - this.modeStarted) / 1000) },
            worstRecentHitchMs: this.hitches.reduce((worst, value, index) =>
                now - this.hitchTimes[index] <= 60_000 ? Math.max(worst, value) : worst, 0),
            history: this.history.slice(), events: this.events.slice(), latestError: this.latestError };
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.intervals.dispose(); this.cpu.dispose();
        for (const samples of Object.values(this.spans)) samples.dispose();
        this.hitches = this.hitchTimes = new Float64Array();
        this.history.length = this.events.length = 0;
        this.latestError = undefined;
    }
}
