/** Observer-only browser probe, injected equally into both release previews.
 * No scene, game state, RNG or renderer objects are retained. */
export function installThreeSpikeProbe() {
    const state = { recording: false, started: 0, stopped: undefined, frames: [], longTasks: [], dropped: 0 };
    let previous;
    function frame(at) {
        if (state.recording && previous !== undefined) {
            if (state.frames.length < 100000) state.frames.push([at - state.started, at - previous]);
            else state.dropped++;
        }
        previous = state.recording ? at : undefined;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    let longTasksSupported = false;
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        longTasksSupported = true;
        new PerformanceObserver(list => {
            if (!state.recording) return;
            for (const entry of list.getEntries()) {
                if (entry.startTime < state.started) continue;
                if (state.longTasks.length < 4096) {
                    state.longTasks.push({ at: entry.startTime - state.started, duration: entry.duration });
                } else state.dropped++;
            }
        }).observe({ type: 'longtask', buffered: true });
    }
    const contexts = [];
    const tracked = new WeakMap();
    const resourceKinds = ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader', 'VertexArray'];
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = originalGetContext.apply(this, args);
        if (gl && /^(webgl2?|experimental-webgl)$/.test(args[0]) && !tracked.has(gl)) {
            const record = { id: contexts.length + 1, canvasId: this.id, lost: false, resources: {} };
            tracked.set(gl, record);
            contexts.push({ record, reference: new WeakRef(gl) });
            this.addEventListener('webglcontextlost', () => {
                record.lost = true;
                for (const counter of Object.values(record.resources)) counter.active = 0;
            });
            this.addEventListener('webglcontextrestored', () => { record.lost = false; });
            for (const kind of resourceKinds) {
                const create = gl['create' + kind], remove = gl['delete' + kind];
                if (!create || !remove) continue;
                const live = new WeakSet();
                const counter = record.resources[kind] = { created: 0, deleted: 0, active: 0 };
                gl['create' + kind] = function (...values) {
                    const resource = create.apply(this, values);
                    if (resource) { live.add(resource); counter.created++; counter.active++; }
                    return resource;
                };
                gl['delete' + kind] = function (resource) {
                    if (resource && live.has(resource)) {
                        live.delete(resource);
                        counter.deleted++;
                        counter.active = Math.max(0, counter.active - 1);
                    }
                    return remove.call(this, resource);
                };
            }
        }
        return gl;
    };
    window.fjordSpikeProbe = {
        start() {
            state.frames = [];
            state.longTasks = [];
            state.dropped = 0;
            state.started = performance.now();
            state.stopped = undefined;
            state.recording = true;
            previous = undefined;
        },
        stop() { state.stopped = performance.now(); state.recording = false; previous = undefined; },
        snapshot() {
            return { elapsedMs: (state.stopped ?? performance.now()) - state.started, frames: state.frames,
                longTasks: state.longTasks, longTasksSupported, dropped: state.dropped,
                contexts: contexts.map(({ record, reference }) => ({ ...record, reachable: !!reference.deref() })) };
        },
    };
}
