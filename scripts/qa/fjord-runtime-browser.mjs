import { Box3 } from 'three';
// Imported only by fjord-runtime-server.mjs. Bounded histograms avoid per-frame JSON or sample arrays.
class Distribution {
    count = 0; total = 0; max = 0; min = Infinity; over33 = 0; over50 = 0;
    bins = new Map();
    add(value) {
        this.count++; this.total += value; this.max = Math.max(this.max, value);
        this.min = Math.min(this.min, value);
        if (value > 33.3) this.over33++;
        if (value > 50) this.over50++;
        const bucket = Math.min(600000, Math.round(value * 10));
        this.bins.set(bucket, (this.bins.get(bucket) || 0) + 1);
    }
    read() {
        const sorted = [...this.bins].sort((a, b) => a[0] - b[0]);
        const percentile = fraction => {
            let count = 0;
            for (const [bucket, size] of sorted) {
                count += size;
                if (count >= Math.ceil(this.count * fraction)) return bucket / 10;
            }
            return null;
        };
        return { count: this.count, total: this.total, mean: this.count ? this.total / this.count : null,
            min: this.count ? this.min : null, max: this.max, p50: percentile(.5), p95: percentile(.95),
            p99: percentile(.99), over33: this.over33, over50: this.over50 };
    }
}

export const audit = {
    harnessVersion: 'native-fit-v1',
    enabled: false, flags: {}, spans: {}, stack: [], active: false, references: null,
    enter(name) {
        if (!this.active || !this.enabled) return null;
        const entry = { name, start: performance.now(), children: 0 }; this.stack.push(entry); return entry;
    },
    leave(entry) {
        if (!entry) return;
        const elapsed = performance.now() - entry.start; this.stack.pop();
        if (this.stack.length) this.stack.at(-1).children += elapsed;
        this.record(entry.name + '.inclusive', elapsed);
        this.record(entry.name + '.self', Math.max(0, elapsed - entry.children));
        if (this.userTiming) {
            performance.measure('fjord:' + entry.name, { start: entry.start, duration: elapsed });
            performance.clearMeasures('fjord:' + entry.name);
        }
    },
    record(name, duration) { (this.spans[name] ??= new Distribution()).add(duration); },
    wrap(object, method, name, skip) {
        if (!object || typeof object[method] !== 'function') return;
        const original = object[method];
        object[method] = function (...args) {
            if (skip?.(args)) return;
            if (!audit.active || !audit.enabled) return original.apply(this, args);
            const start = performance.now(), entry = { children: 0 };
            audit.stack.push(entry);
            try {
                const result = original.apply(this, args);
                if (result?.then) result.then(() => {
                    if (audit.active) audit.record(name + '.asyncWall', performance.now() - start);
                }, () => {});
                return result;
            } finally {
                const elapsed = performance.now() - start;
                audit.stack.pop();
                if (audit.stack.length) audit.stack.at(-1).children += elapsed;
                audit.record(name + '.inclusive', elapsed);
                audit.record(name + '.self', Math.max(0, elapsed - entry.children));
                if (name === 'human.applyDNA' || name === 'modules.refit' || name === 'bodyFit.refit') {
                    const id = (this.root || this.fit?.root)?.name;
                    const key = JSON.stringify([id, name]);
                    if (id && (audit.modelFits.has(key) || audit.modelFits.size < 128)) {
                        if (!audit.modelFits.has(key)) audit.modelFits.set(key, { id, stage: name, cpu: new Distribution() });
                        audit.modelFits.get(key).cpu.add(elapsed);
                    }
                }
            }
        };
    },
    bind(refs) {
        this.references = refs;
        const { motion, layer, models, world, controller, renderer, session, campaign, shared,
            lighting, campfireEffect, precipitationEffect, selectionLabels, productionLabels } = refs;
        this.routeContexts = new Map();
        motion.setRouteObserver?.(event => {
            if (!this.active || !this.enabled) return;
            const key = JSON.stringify([event.agent, event.purpose, event.target, event.goal, event.reason]);
            let row = this.routeRows.get(key);
            if (!row && this.routeRows.size < 1024) {
                row = { agent: event.agent, kind: event.kind, purpose: event.purpose, target: event.target,
                    goal: event.goal, reason: event.reason, attempts: 0, nodes: 0, identicalContext: 0,
                    changedContext: 0, firstStep: event.step, firstSeconds: event.activeSeconds };
                this.routeRows.set(key, row);
            }
            if (!row) { this.routeOverflow++; return; }
            const context = JSON.stringify([event.from, event.navigationGeneration,
                event.reservationGeneration, event.occupancy]);
            if (this.routeContexts.get(key) === context) row.identicalContext++;
            else row.changedContext++;
            if (this.routeContexts.size >= 1024 && !this.routeContexts.has(key))
                this.routeContexts.delete(this.routeContexts.keys().next().value);
            this.routeContexts.set(key, context);
            row.attempts++; row.nodes += event.nodes; row.lastStep = event.step;
            row.lastSeconds = event.activeSeconds; row.from = event.from;
            row.navigationGeneration = event.navigationGeneration;
            row.reservationGeneration = event.reservationGeneration;
        });
        const groups = [
            [motion, ['advance', 'route', 'reconcile', 'step', 'beginVisit', 'planPassing'], 'motion'],
            [motion.social, ['advance'], 'social'],
            [layer, ['advance', 'sync', 'describe', 'select', 'productionAnchors', 'configureMotion'], 'entities'],
            [models, ['animate', 'reconcile'], 'models'],
            [world, ['update', 'standingTrees', 'setGroundWeights'], 'world'],
            [session, ['snapshot', 'readSnapshot', 'command', 'elapse', 'saveJSON'], 'session'],
            [campaign, ['project', 'readProjection', 'exportData', 'exportJSON'], 'campaign'],
            [shared, ['persist', 'selectionPresentation'], 'shared'],
            [lighting, ['update', 'setSeason'], 'lighting'],
            [refs.dressing, ['sync', 'reconcile', 'setSeason'], 'dressing'],
            [campfireEffect, ['update'], 'campfire'], [precipitationEffect, ['update'], 'precipitation'],
            [selectionLabels, ['update', 'setAnchors', 'sync'], 'selectionLabels'],
            [productionLabels, ['update', 'setAnchors', 'enqueue'], 'productionLabels'],
        ];
        for (const [object, methods, group] of groups) for (const method of methods) {
            this.wrap(object, method, group + '.' + method, () =>
                (group === 'motion' && method === 'advance' && this.flags.motion) ||
                (group === 'models' && method === 'animate' && this.flags.animation) ||
                (group === 'session' && method === 'elapse' && this.flags.ticks) ||
                (group === 'entities' && method === 'sync' && this.flags.sync) ||
                (group.endsWith('Labels') && this.flags.labels));
        }
        const human = [...models.actors.values()].find(actor => actor.human)?.human;
        if (human) {
            const prototype = Object.getPrototypeOf(human);
            for (const method of ['update', 'shapePose', 'applyDNA', 'neutralFitSignature']) this.wrap(prototype, method, 'human.' + method);
            this.wrap(Object.getPrototypeOf(human.mixer), 'update', 'mixer.update');
            this.wrap(Object.getPrototypeOf(human.modules), 'refit', 'modules.refit');
            this.wrap(Object.getPrototypeOf(human.fit), 'refit', 'bodyFit.refit');
            this.wrap(Box3.prototype, 'setFromObject', 'bounds.setFromObject');
        }
        const originalUpdate = controller.update.bind(controller);
        this.basePosition = refs.camera.position.clone();
        this.baseFocus = controller.focus.clone();
        controller.update = delta => {
            originalUpdate(delta);
            if (this.active && this.cameraPath && !this.cameraApplying) {
                const phase = (performance.now() - this.started) / 1000 * .12;
                const offset = this.basePosition.clone().sub(this.baseFocus);
                const x = offset.x * Math.cos(phase) - offset.z * Math.sin(phase);
                const z = offset.x * Math.sin(phase) + offset.z * Math.cos(phase);
                this.cameraApplying = true; try { controller.setView({ position: [this.baseFocus.x + x, this.basePosition.y,
                    this.baseFocus.z + z], target: this.baseFocus.toArray() }); } finally { this.cameraApplying = false; }

            }
        };
        this.wrap(controller, 'update', 'camera.update');
        this.wrap(renderer, 'render', 'render.submit');
        this.setupGPU(renderer);
        this.observer = new PerformanceObserver(list => {
            if (!this.active) return;
            for (const task of list.getEntries()) this.longTasks.add(task.duration);
        });
        this.observer.observe({ type: 'longtask', buffered: false });
        const sample = timestamp => {
            if (this.active) {
                if (this.previousFrame) this.frames.add(timestamp - this.previousFrame);
                this.previousFrame = timestamp;
            }
            this.raf = requestAnimationFrame(sample);
        };
        this.raf = requestAnimationFrame(sample);
        this.heartbeat = setInterval(() => {
            if (this.active) {
                const now = performance.now();
                if (this.previousBeat) this.heartbeatGaps.add(now - this.previousBeat);
                this.previousBeat = now;
            }
        }, 100);
        addEventListener('pagehide', () => {
            this.observer.disconnect(); cancelAnimationFrame(this.raf); clearInterval(this.heartbeat);
            this.clearQueries();
        }, { once: true });
        window.__fjordAudit = this;
    },
    setupGPU(renderer) {
        const gl = renderer.getContext(), extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        this.gpuSupported = Boolean(extension);
        this.queries = [];
        this.clearQueries = () => { for (const query of this.queries) gl.deleteQuery(query.query); this.queries = []; };
        if (!extension) return;
        const original = renderer.render.bind(renderer);
        let frame = 0;
        renderer.render = (...args) => {
            while (this.queries.length && gl.getQueryParameter(this.queries[0].query, gl.QUERY_RESULT_AVAILABLE)) {
                const pending = this.queries.shift();
                const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
                if (disjoint) this.disjoint++;
                else if (this.active && pending.generation === this.generation)
                    this.gpu.add(gl.getQueryParameter(pending.query, gl.QUERY_RESULT) / 1e6);
                gl.deleteQuery(pending.query);
            }
            if (!this.active || !this.gpuEnabled || ++frame % 4 || this.queries.length >= 4) return original(...args);
            const query = gl.createQuery();
            gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
            try { return original(...args); }
            finally {
                gl.endQuery(extension.TIME_ELAPSED_EXT);
                this.queries.push({ query, generation: this.generation });
            }
        };
    },
    start({ instrument = true, gpu = true, cameraPath = false, userTiming = false, continuing = false } = {}) {
        this.active = false; this.clearQueries(); this.generation = (this.generation || 0) + 1;
        this.spans = {}; this.stack = []; this.frames = new Distribution(); this.gpu = new Distribution();
        this.longTasks = new Distribution(); this.heartbeatGaps = new Distribution();
        if (!continuing) { this.previousFrame = 0; this.previousBeat = 0; }
        this.modelFits = new Map();
        this.disjoint = 0; this.routeRows = new Map(); this.routeOverflow = 0;
        this.userTiming = userTiming; this.enabled = instrument; this.gpuEnabled = gpu; this.cameraPath = cameraPath;
        this.started = performance.now(); this.active = true;
    },
    stop() {
        this.active = false;
        const durationMs = performance.now() - this.started;
        return { modelFits: [...this.modelFits.values()].map(row => ({ id: row.id, stage: row.stage, cpu: row.cpu.read() })),
            routeFailures: [...this.routeRows.values()], routeOverflow: this.routeOverflow,
            motion: this.references.motion.inspectMetrics(), actors: this.references.motion.inspect(),
            durationMs, fps: this.frames.count * 1000 / durationMs, frames: this.frames.read(),
            spans: Object.fromEntries(Object.entries(this.spans).map(([name, data]) => [name, data.read()])),
            gpuSupported: this.gpuSupported, gpu: this.gpu.read(), disjointQueries: this.disjoint,
            longTasks: this.longTasks.read(), heartbeatGaps: this.heartbeatGaps.read(),
            heap: performance.memory ? { used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null };
    },
    inspect() {
        const { session, campaign, motion, models, scene, renderer, camera, controller,
            campfireEffect, precipitationEffect } = this.references;
        const state = session.snapshot(), gl = renderer.getContext();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const materials = new Set(), counts = { meshes: 0, visibleMeshes: 0, skinnedMeshes: 0,
            transparentMeshes: 0, alphaTestMeshes: 0, shadowCasters: 0, bones: 0 };
        scene.traverse(node => {
            if (!node.isMesh) return;
            counts.meshes++;
            let visible = true;
            for (let parent = node; parent; parent = parent.parent) visible &&= parent.visible;
            if (visible) counts.visibleMeshes++;
            if (node.isSkinnedMesh) { counts.skinnedMeshes++; counts.bones += node.skeleton.bones.length; }
            if (node.castShadow) counts.shadowCasters++;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                materials.add(material.uuid);
                if (material.transparent) counts.transparentMeshes++;
                if (material.alphaTest) counts.alphaTestMeshes++;
            }
        });
        return { harnessVersion: this.harnessVersion, time: state.time, seed: state.seed, events: state.events.length,
            residents: Object.values(state.personas).filter(p => p.deathWinter === null).length,
            cattle: Object.values(state.landing.cattle).filter(c => c.deathWinter === null).length,
            recipe: campaign.blueprint.config.seed, running: session.running, minutes: session.minutesPerWinter,
            motion: motion.inspectMetrics(), humanFits: [...models.actors].flatMap(([root, actor]) => actor.human ?
                [{ id: root.name, age: actor.human.dna.age, fitRevision: actor.human.fit.revision,
                    moduleFitRuns: actor.human.modules.fitRuns, retained: actor.human.lastFitRetained,
                    signatureCodeUnits: actor.human.lastNeutralFit?.length || 0, boundsShape: actor.human.boundsShapeSignature,
                    modules: [...actor.human.fit.modules.keys()] }] : []), resources: models.inspectResources(), counts, materials: materials.size,
            renderer: { render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
                programs: renderer.info.programs.length, width: renderer.domElement.width,
                height: renderer.domElement.height, pixelRatio: renderer.getPixelRatio(),
                gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                timerQuery: this.gpuSupported, shadowEnabled: renderer.shadowMap.enabled,
                shadowMaps: scene.children.filter(n => n.isLight && n.castShadow).map(n => n.shadow.mapSize.toArray()) },
            camera: { position: camera.position.toArray(), target: controller.focus.toArray() },
            fire: campfireEffect.inspect(), precipitation: precipitationEffect.inspect(),
            visibility: document.visibilityState };
    },
};
