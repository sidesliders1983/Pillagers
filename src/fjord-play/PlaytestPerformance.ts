import type { WebGLRenderer } from 'three';
import { PerformanceMeasurements, performanceLimits, diagnosticMessage, type PerformanceMode,
    type PerformanceSpan } from './PerformanceMeasurements';
import { PerformanceGpuTimer, type RenderScope } from './PerformanceGpuTimer';
import { lastIslandLoad } from './IslandLoadStatus';
import './performance-overlay.css';

export type PerformanceView = 'off' | 'compact' | 'details';
type Context = { seed?: number; geographySeed?: number; recipe?: string; winter?: number; tick?: number;
    pace?: number; quality?: string; effects?: string; dpr?: number; width?: number; height?: number;
    residents?: number; livestock?: number; renderedResidents?: number; renderedLivestock?: number;
    renderedWildlife?: number };
const contextFields: (keyof Context)[] = ['seed', 'geographySeed', 'recipe', 'winter', 'tick', 'pace',
    'quality', 'effects', 'dpr', 'width', 'height', 'residents', 'livestock',
    'renderedResidents', 'renderedLivestock', 'renderedWildlife'];
const preference = 'fjordside-performance-view';
const ms = (value: number | null | undefined) => value == null ? 'N/A' : value.toFixed(1) + ' ms';

/** One opt-in DOM view/collector for the entry -> loading -> scene lifetime.
 * Owns no game state, renderer or sampling animation loop. Off releases all sampling resources. */
export class PlaytestPerformance {
    readonly root = document.createElement('aside');
    private metadataElement: HTMLElement;
    private statisticsElement: HTMLElement;
    private detailsElement: HTMLElement;
    private view: PerformanceView = 'off';
    private measurements?: PerformanceMeasurements;
    private mode: PerformanceMode = 'Start menu';
    private metadata: Context = {};
    private frozen = false;
    private frozenAt = '';
    private corner = 0;
    private stopTimer?: () => void;
    private listeners?: AbortController;
    private observer?: PerformanceObserver;
    private gpu?: PerformanceGpuTimer;
    private gl?: WebGL2RenderingContext;
    private workload: Partial<Record<RenderScope, { calls: number; triangles: number; at: number }>> = {};
    private resources?: { geometries: number; textures: number; programs: number; highGeometries: number;
        highTextures: number; highPrograms: number };
    private lastResource = -Infinity;
    private heap?: { source: 'performance.memory (non-standard)'; usedBytes: number; allocatedBytes: number };
    private lastHeap = -Infinity;
    private longTasks = false;
    private gpuSupported: boolean | null = null;
    private portraitGpu?: { status: string; milliseconds?: number };
    private recording = 'not reported';
    private lastLoadFailure = '';
    private now: () => number;
    private storage?: Pick<Storage, 'getItem' | 'setItem'>;
    private schedule: (callback: () => void) => () => void;
    constructor(options: { storage?: Pick<Storage, 'getItem' | 'setItem'>; now?: () => number;
        schedule?: (callback: () => void) => () => void } = {}) {
        this.now = options.now ?? (() => performance.now());
        this.schedule = options.schedule ?? (callback => {
            const timer = window.setInterval(callback, 500);
            return () => window.clearInterval(timer);
        });
        try { this.storage = options.storage ?? window.localStorage; } catch { /* Storage is optional. */ }
        this.root.id = 'performance-overlay';
        this.root.setAttribute('aria-label', 'Performance diagnostics');
        this.root.addEventListener('keydown', event => { if (event.key !== 'Tab') event.stopPropagation(); });
        this.root.innerHTML = `<div class="perf-metadata" data-perf-metadata></div>
            <pre data-perf-statistics></pre><pre data-perf-details hidden></pre>
            <div class="perf-controls"><button type="button" data-perf-freeze>Freeze display</button>
            <details><summary>Options</summary><div class="perf-options">
                <button type="button" data-perf-move>Move corner</button>
                <button type="button" data-perf-copy>Copy diagnostics</button>
                <button type="button" data-perf-export>Save JSON</button>
                <label>Screen recording<select data-perf-recording><option>not reported</option><option>on</option><option>off</option></select></label>
                <label>View<select data-perf-view><option value="off">Off</option><option value="compact">Compact</option><option value="details">Details</option></select></label>
            </div></details></div><p data-perf-message role="status" hidden></p>
            <textarea aria-label="Selectable diagnostics JSON" readonly hidden></textarea>`;
        this.metadataElement = this.root.querySelector('[data-perf-metadata]')!;
        this.statisticsElement = this.root.querySelector('[data-perf-statistics]')!;
        this.detailsElement = this.root.querySelector('[data-perf-details]')!;
        this.root.querySelector('[data-perf-freeze]')!.addEventListener('click', () => {
            this.frozen = !this.frozen;
            this.frozenAt = this.frozen ? new Date().toISOString().slice(11, 19) : '';
            this.root.querySelector('[data-perf-freeze]')!.textContent = this.frozen ? 'Unfreeze display' : 'Freeze display';
            this.root.querySelector('[data-perf-metadata]')!.textContent += this.frozen ? ` · FROZEN ${this.frozenAt}` : '';
            if (!this.frozen) this.update();
        });
        this.root.querySelector('[data-perf-move]')!.addEventListener('click', () => {
            this.corner = (this.corner + 1) % 4;
            this.root.dataset.corner = String(this.corner);
        });
        this.root.querySelector('[data-perf-copy]')!.addEventListener('click', async () => {
            const owner = this.measurements;
            if (!owner) return;
            const text = this.exportJSON();
            try {
                await navigator.clipboard.writeText(text);
                if (this.measurements === owner) this.message('Diagnostics copied.');
            } catch { if (this.measurements === owner) this.fallback(text); }
        });
        this.root.querySelector('[data-perf-export]')!.addEventListener('click', () => {
            const text = this.exportJSON();
            // Keep a selectable copy even when a browser silently suppresses downloads.
            this.fallback(text);
            let url: string | undefined;
            try {
                url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'fjordside-performance.json';
                link.click();
            } catch { /* The visible selectable report remains usable. */ }
            finally { if (url) URL.revokeObjectURL(url); }
        });
        this.root.querySelector('[data-perf-view]')!.addEventListener('change', event =>
            this.configure((event.target as HTMLSelectElement).value as PerformanceView));
        this.root.querySelector('[data-perf-recording]')!.addEventListener('change', event => {
            this.recording = (event.target as HTMLSelectElement).value;
        });
        let saved: string | null = null;
        try { saved = this.storage?.getItem(preference) ?? null; } catch { /* Optional. */ }
        this.configure(new URLSearchParams(window.location.search).get('debugPerf') === '1' ? 'compact' :
            saved === 'compact' || saved === 'details' ? saved : 'off', false);
    }
    settings() {
        const label = document.createElement('label');
        label.className = 'performance-setting';
        label.textContent = 'Debug / Performance overlay';
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Performance overlay');
        select.innerHTML = '<option value="off">Off</option><option value="compact">Compact</option><option value="details">Details</option>';
        select.value = this.view;
        select.addEventListener('change', () => this.configure(select.value as PerformanceView));
        label.append(select);
        return label;
    }
    configure(view: PerformanceView, persist = true) {
        if (!['off', 'compact', 'details'].includes(view)) return;
        this.view = view;
        if (persist) try { this.storage?.setItem(preference, view); } catch { /* No game save writes. */ }
        if (view === 'off') {
            this.stopTimer?.(); this.stopTimer = undefined;
            this.listeners?.abort(); this.listeners = undefined;
            this.observer?.disconnect(); this.observer = undefined;
            this.releaseGpu();
            this.measurements?.dispose();
            this.measurements = undefined;
            this.workload = {}; this.resources = undefined; this.heap = undefined;
            this.frozen = false;
            this.frozenAt = '';
            this.root.querySelector('[data-perf-freeze]')!.textContent = 'Freeze display';
            this.root.querySelector('textarea')!.hidden = true;
            this.root.querySelector<HTMLElement>('[data-perf-message]')!.hidden = true;
            this.root.remove();
            this.root.querySelector('textarea')!.value = '';
        } else if (!this.measurements) {
            this.measurements = new PerformanceMeasurements(this.now);
            this.measurements.setMode(document.hidden ? 'Background' : this.mode);
            this.listen();
            this.stopTimer = this.schedule(() => this.update());
        }
        for (const select of Array.from(document.querySelectorAll<HTMLSelectElement>('.performance-setting select')))
            select.value = view;
        this.root.querySelector<HTMLSelectElement>('[data-perf-view]')!.value = view;
        this.root.dataset.view = view;
        this.root.querySelector<HTMLElement>('[data-perf-details]')!.hidden = view !== 'details';
        this.mount();
        this.update();
    }
    mount() {
        if (this.view === 'off') return;
        // Inside the loader's modal: its inert/focus ownership also covers these controls.
        const parent = document.querySelector('#island-loading') ?? document.body;
        if (this.root.parentElement !== parent) parent.append(this.root);
        this.root.inert = false;
        this.root.dataset.corner = String(this.corner);
    }
    context(context: Context) {
        // Whitelisted scalars only; never accept an opaque snapshot, actor or rival record.
        for (const field of contextFields) {
            const value = context[field];
            if (value === undefined) continue;
            if (typeof value === 'number' && Number.isFinite(value))
                (this.metadata as Record<string, unknown>)[field] = value;
            else if (typeof value === 'string')
                (this.metadata as Record<string, unknown>)[field] = value.slice(0, 80);
        }
    }
    setMode(mode: PerformanceMode) {
        if (mode !== this.mode) this.gpu?.reset();
        if (mode === 'Loading' && this.mode !== 'Loading') {
            this.releaseGpu();
            this.workload = {}; this.resources = undefined;
        }
        this.mode = mode;
        this.measurements?.setMode(document.hidden ? 'Background' : mode);
    }
    get enabled() { return !!this.measurements; }
    frame(at: number, cpuMs: number) { this.measurements?.frame(at, cpuMs); }
    span(kind: PerformanceSpan, ms: number, ticks = 0) { this.measurements?.span(kind, ms, ticks); }
    measure<T>(kind: PerformanceSpan, operation: () => T) {
        if (!this.measurements) return operation();
        const started = this.now();
        try { return operation(); }
        finally { this.span(kind, this.now() - started); }
    }
    async operation<T>(kind: 'scene' | 'portrait', operation: () => Promise<T>) {
        if (!this.measurements) return operation();
        const owner = this.measurements;
        const started = this.now();
        try { return await this.measure(kind === 'scene' ? 'sceneCpu' : 'portraitCpu', operation); }
        finally {
            if (this.measurements === owner)
                this.span(kind === 'scene' ? 'sceneWall' : 'portraitWall', this.now() - started);
        }
    }
    core<T>(ticks: () => number, operation: () => T) {
        if (!this.measurements) return operation();
        const before = ticks(), started = this.now();
        try { return operation(); }
        finally { this.span('core', this.now() - started, Math.max(0, ticks() - before)); }
    }
    draw(renderer: WebGLRenderer, scope: RenderScope, operation: () => void) {
        if (!this.measurements) { operation(); return; }
        // Installed Three r180 uses WebGL2 exclusively; its type retains the older union.
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (gl !== this.gl) {
            this.releaseGpu();
            this.gl = gl;
            this.gpu = new PerformanceGpuTimer(gl, (status, ms, measuredScope) => {
                this.gpuSupported = status !== 'unsupported';
                if (measuredScope === 'portrait') this.portraitGpu = { status, milliseconds: ms };
                else this.measurements?.gpuResult(status, ms);
            }, this.now);
        }
        const automatic = renderer.info.autoReset;
        renderer.info.autoReset = false;
        renderer.info.reset();
        const query = this.mode === 'Running' || this.mode === 'Paused' ? this.gpu?.begin(scope) : false;
        try { operation(); }
        finally {
            if (query) this.gpu?.end();
            const now = this.now();
            const workload = this.workload[scope] ??= { calls: 0, triangles: 0, at: 0 };
            workload.calls = renderer.info.render.calls;
            workload.triangles = renderer.info.render.triangles;
            workload.at = now;
            renderer.info.autoReset = automatic;
            if (now - this.lastResource >= 500) {
                this.lastResource = now;
                const { geometries, textures } = renderer.info.memory;
                const programs = renderer.info.programs?.length ?? 0;
                this.resources = { geometries, textures, programs,
                    highGeometries: Math.max(geometries, this.resources?.highGeometries ?? 0),
                    highTextures: Math.max(textures, this.resources?.highTextures ?? 0),
                    highPrograms: Math.max(programs, this.resources?.highPrograms ?? 0) };
                this.context({ dpr: renderer.getPixelRatio(), width: renderer.domElement.width,
                    height: renderer.domElement.height });
            }
        }
    }
    releaseGpu() {
        this.gpu?.dispose();
        this.gpu = undefined; this.gl = undefined; this.gpuSupported = null;
        this.portraitGpu = undefined;
    }
    private listen() {
        const owner = this.measurements;
        const events = this.listeners = new AbortController();
        const signal = events.signal;
        document.addEventListener('visibilitychange', () => {
            this.measurements?.setMode(document.hidden ? 'Background' : this.mode);
            if (document.hidden) this.gpu?.reset();
            this.update();
        }, { signal });
        window.addEventListener('error', event => this.measurements?.mark('exception', event.message || 'Resource error'), { signal });
        window.addEventListener('unhandledrejection', event => this.measurements?.mark('rejection',
            String(event.reason instanceof Error ? event.reason.message : event.reason)), { signal });
        window.addEventListener('pagehide', event => {
            this.setMode('Background');
            if (!event.persisted) this.dispose();
        }, { signal });
        window.addEventListener('pageshow', () => { this.setMode('Paused'); this.update(); }, { signal });
        document.addEventListener('webglcontextlost', () => {
            this.measurements?.mark('context-loss', 'Graphics context lost; cause unknown');
            this.gpu?.reset(true);
            this.setMode('Recovering'); this.update();
        }, { capture: true, signal });
        document.addEventListener('webglcontextrestored', () => {
            this.measurements?.mark('context-restored', 'Graphics context restored');
            this.releaseGpu();
        }, { capture: true, signal });
        try {
            this.longTasks = typeof PerformanceObserver !== 'undefined' &&
                PerformanceObserver.supportedEntryTypes.includes('longtask');
            if (this.longTasks) {
                this.observer = new PerformanceObserver(list => {
                    if (this.measurements !== owner) return;
                    for (const entry of list.getEntries()) this.measurements?.mark('long task',
                        'PerformanceLongTaskTiming main-thread task', entry.duration);
                });
                this.observer.observe({ type: 'longtask' });
            }
        } catch { this.longTasks = false; }
    }
    private update() {
        if (!this.measurements) return;
        this.mount();
        if (!document.hidden) this.gpu?.poll();
        if (this.now() - this.lastHeap >= 5000) {
            this.lastHeap = this.now();
            try {
                const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
                if (memory && Number.isFinite(memory.usedJSHeapSize) && memory.usedJSHeapSize >= 0 &&
                    Number.isFinite(memory.totalJSHeapSize) && memory.totalJSHeapSize >= 0)
                    this.heap = { source: 'performance.memory (non-standard)', usedBytes: memory.usedJSHeapSize,
                        allocatedBytes: memory.totalJSHeapSize };
            } catch { this.heap = undefined; }
        }
        const load = lastIslandLoad();
        if (load?.error || load?.worker === 'failed') {
            const key = load.attempt + ':' + (load.error?.kind ?? load.worker);
            if (key !== this.lastLoadFailure) {
                this.lastLoadFailure = key;
                this.measurements.mark(load.worker === 'failed' ? 'worker failure' : 'load failure',
                    load.error?.message ?? 'Island worker failed');
            }
        }
        const sample = this.measurements.sample();
        if (this.frozen) return;
        const build = this.build();
        this.metadataElement.textContent =
            `${build.slice(0, 12)} · ${sample.sampledUtc.slice(11, 19)} · ${(sample.elapsedMs / 1000).toFixed(0)} s\n` +
            `${sample.mode} · ${this.metadata.quality ?? 'quality N/A'} / ${this.metadata.effects ?? 'effects N/A'} · DPR ${this.metadata.dpr ?? 'N/A'}`;
        this.statisticsElement.textContent =
            `${sample.fps?.toFixed(1) ?? 'N/A'} fps · window ${(sample.interval.windowMs / 1000).toFixed(1)} s\n` +
            `Interval μ/p95  ${ms(sample.interval.meanMs)} / ${ms(sample.interval.p95Ms)}\n` +
            `CPU frame p95   ${ms(sample.cpuFrame.p95Ms)}\n` +
            `GPU main        ${sample.gpu.status === 'valid' ? ms(sample.gpu.milliseconds) : 'N/A — ' + sample.gpu.status}\n` +
            `Hitch /60 s     ${ms(sample.worstRecentHitchMs)}\n` +
            `Ticks total/rate ${sample.ticks.total} / ${sample.ticks.perSecond.toFixed(1)} /s\n` +
            (sample.mode === 'Loading' ? `Load ${load?.percent ?? 0}% · ${load?.stage ?? 'Starting'}\n` : '') +
            `Heap ${this.heap ? (this.heap.usedBytes / 1048576).toFixed(1) + ' MiB*' : 'N/A'} · VRAM unavailable`;
        if (this.view === 'details') this.detailsElement.textContent =
            `Seed ${this.metadata.seed ?? 'N/A'} / island ${this.metadata.geographySeed ?? 'N/A'}\n` +
            `Year/tick ${this.metadata.winter ?? 'N/A'}/${this.metadata.tick ?? 'N/A'} · pace ${this.metadata.pace ?? 'N/A'} min\n` +
            `Own R/L ${this.metadata.residents ?? 'N/A'}/${this.metadata.livestock ?? 'N/A'} · visible R/L/W ` +
            `${this.metadata.renderedResidents ?? 'N/A'}/${this.metadata.renderedLivestock ?? 'N/A'}/${this.metadata.renderedWildlife ?? 'N/A'}\n` +
            `Core/UI p95    ${ms(sample.spans.core.p95Ms)} / ${ms(sample.spans.ui.p95Ms)}\n` +
            `Scene submit CPU ${ms(sample.spans.sceneCpu.latestMs)}\nScene async wall ${ms(sample.spans.sceneWall.latestMs)}\n` +
            `Model CPU/wall ${ms(sample.spans.modelCpu.latestMs)} / ${ms(sample.spans.modelWall.latestMs)}\n` +
            `Portrait CPU/wall ${ms(sample.spans.portraitCpu.latestMs)} / ${ms(sample.spans.portraitWall.latestMs)}\n` +
            `Main+shadows ${this.workload.main?.calls ?? 'N/A'} calls / ${this.workload.main?.triangles ?? 'N/A'} tris\n` +
            `Portrait ${this.workload.portrait?.calls ?? 'N/A'} calls (separate)\n` +
            `Geo/Tex/Programs ${this.resources ? [this.resources.geometries, this.resources.textures, this.resources.programs].join('/') : 'N/A'} counts\n` +
            `Heap source: ${this.heap?.source ?? 'unsupported'}\n` +
            `${this.longTasks ? 'Long Tasks available' : 'Long Tasks N/A; frame gaps only'}\n` +
            `${sample.latestError?.kind ?? ''}: ${sample.latestError?.message ?? ''}`;
    }
    private build() {
        const build = (globalThis as typeof globalThis & { __FJORD_BUILD__?: string }).__FJORD_BUILD__;
        return build && /^[a-f0-9]{7,40}/.test(build) ? build : 'local/unknown';
    }
    exportJSON() {
        const load = lastIslandLoad();
        const report = { version: 1, build: this.build(), context: { ...this.metadata },
            browser: navigator.userAgent.slice(0, 240), viewport: [window.innerWidth, window.innerHeight],
            recording: this.recording, frozenDisplayAt: this.frozenAt || null,
            capabilities: { gpuTimer: this.gpuSupported, jsHeap: !!this.heap, longTasks: this.longTasks },
            units: { cpu: 'synchronous JS ms; async submit excludes resumed continuations', gpu: 'query ms; main includes native shadows; portrait separate',
                memory: 'optional JS heap only; resource counts are not bytes; VRAM unavailable' },
            resources: this.resources, workload: this.workload, portraitGpu: this.portraitGpu, heap: this.heap,
            sample: this.measurements?.sample(),
            loading: load ? { attempt: load.attempt, startedUtc: load.startedUtc, percent: load.percent,
                stage: load.stage, outcome: load.outcome, worker: load.worker,
                error: load.error ? { ...load.error, message: diagnosticMessage(load.error.message) } : undefined,
                timeline: load.timeline.slice(-128) } : undefined, truncated: false };
        let text = JSON.stringify(report, null, 2);
        while (new TextEncoder().encode(text).byteLength > performanceLimits.exportBytes) {
            if (report.sample?.history.length) report.sample.history.shift();
            else if (report.loading?.timeline.length) report.loading.timeline.shift();
            else if (report.sample?.events.length) report.sample.events.shift();
            else throw new Error('Diagnostics exceeded their bounded report size.');
            report.truncated = true;
            text = JSON.stringify(report, null, 2);
        }
        return text;
    }
    private message(text: string) {
        const target = this.root.querySelector<HTMLElement>('[data-perf-message]')!;
        target.hidden = false;
        target.textContent = text;
    }
    private fallback(text: string) {
        const area = this.root.querySelector('textarea')!;
        area.hidden = false; area.value = text; area.focus(); area.select();
        this.message('If copy/download is unavailable, select and copy this report. It stays on this device.');
    }
    dispose() { this.configure('off', false); }
}
