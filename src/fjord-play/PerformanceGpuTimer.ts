import type { GpuStatus } from './PerformanceMeasurements';
export type RenderScope = 'main' | 'portrait';
type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number; QUERY_COUNTER_BITS_EXT: number };

/** One context, at most four pending queries, no synchronous GPU completion/readback.
 * Main scope includes its native shadow passes; portrait scope includes both snapshot passes.
 * Never enters a query owned by another renderer consumer. */
export class PerformanceGpuTimer {
    private extension?: TimerExtension;
    private pending: { query: WebGLQuery; scope: RenderScope; started: number }[] = [];
    private active?: { query: WebGLQuery; scope: RenderScope; started: number };
    private lastStarted = -Infinity;
    private lastPoll = -Infinity;
    private disposed = false;
    constructor(private gl: WebGL2RenderingContext,
        private report: (status: GpuStatus, milliseconds?: number, scope?: RenderScope) => void,
        private now = () => performance.now()) {
        try {
            const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
            if (extension && Number(gl.getQuery(extension.TIME_ELAPSED_EXT, extension.QUERY_COUNTER_BITS_EXT)) > 0)
                this.extension = extension;
        } catch { /* Missing/disabled GPU timing cannot block the game. */ }
        report(this.extension ? 'pending' : 'unsupported');
    }
    begin(scope: RenderScope) {
        try { return this.beginQuery(scope); }
        catch { this.unavailable(); return false; }
    }
    private beginQuery(scope: RenderScope) {
        const extension = this.extension, now = this.now();
        if (this.disposed || !extension || this.active || now - this.lastStarted < 500) return false;
        this.lastStarted = now;
        this.poll();
        if (!this.extension) return false;
        if (this.gl.isContextLost()) { this.report('context-lost'); return false; }
        if (this.gl.getParameter(extension.GPU_DISJOINT_EXT)) { this.report('disjoint'); return false; }
        if (this.pending.length >= 4) return false;
        if (this.gl.getQuery(extension.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY)) {
            this.report('busy', undefined, scope);
            return false;
        }
        const query = this.gl.createQuery();
        if (!query) return false;
        this.active = { query, scope, started: now };
        this.lastStarted = now;
        this.gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        this.report('pending', undefined, scope);
        return true;
    }
    end() {
        try { this.endQuery(); } catch { this.unavailable(); }
    }
    private endQuery() {
        if (!this.active || !this.extension) return;
        if (!this.gl.isContextLost()) this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
        this.pending.push(this.active);
        this.active = undefined;
    }
    poll() {
        try { this.pollQueries(); } catch { this.unavailable(); }
    }
    private pollQueries() {
        if (this.disposed || !this.extension || this.now() - this.lastPoll < 500) return;
        this.lastPoll = this.now();
        if (this.gl.isContextLost()) { this.reset(true); return; }
        if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) {
            this.clear();
            this.report('disjoint');
            return;
        }
        for (let index = 0; index < this.pending.length; index++) {
            const item = this.pending[index];
            const available = this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT_AVAILABLE);
            if (!available && this.now() - item.started < 5000) continue;
            if (available) {
                const nanoseconds = this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT);
                if (Number.isFinite(nanoseconds) && nanoseconds >= 0)
                    this.report('valid', nanoseconds / 1e6, item.scope);
            } else this.report('stale', undefined, item.scope);
            this.gl.deleteQuery(item.query);
            this.pending.splice(index--, 1);
        }
    }
    private clear(lost = false) {
        if (!lost) {
            if (this.active && this.extension) this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
            for (const item of this.pending) this.gl.deleteQuery(item.query);
            if (this.active) this.gl.deleteQuery(this.active.query);
        }
        this.active = undefined;
        this.pending.length = 0;
    }
    reset(lost = false) {
        try { this.clear(lost); } catch { this.unavailable(); }
        this.lastStarted = this.lastPoll = -Infinity;
        this.report(lost ? 'context-lost' : this.extension ? 'pending' : 'unsupported');
    }
    dispose() {
        if (this.disposed) return;
        try { this.clear(this.gl.isContextLost?.() ?? false); } catch { this.unavailable(); }
        this.extension = undefined;
        this.disposed = true;
    }
    private unavailable() {
        try { this.clear(this.gl.isContextLost?.() ?? false); } catch {
            this.active = undefined;
            this.pending.length = 0;
        }
        this.extension = undefined;
        this.report('unsupported');
    }
}
