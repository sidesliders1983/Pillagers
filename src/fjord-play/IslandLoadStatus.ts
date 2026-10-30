import { getBuildInfo, type GameBuildInfo } from '../build/BuildInfo';

/** Presentation-only loading evidence. No campaign objects, renderer references or telemetry. */
export type LoadMode = 'new' | 'restart' | 'resume';
export type LoadStep = keyof typeof loadPlan;
export type LoadOutcome = 'preparing' | 'failed' | 'cancelled' | 'playable' | 'diagnostic-complete';

// Rounded from the existing cinematic-loading stage receipts, not a time-based animation.
// Each envelope stays open until its owner seals all dependencies, including late model loads.
export const loadPlan = {
    campaign: { weight: 2, label: 'Reading your campaign' },
    geography: { weight: 50, label: 'Loading the prepared island' },
    assets: { weight: 5, label: 'Loading houses and scenery' },
    world: { weight: 20, label: 'Preparing terrain and nature' },
    wildlife: { weight: 3, label: 'Preparing wildlife' },
    characters: { weight: 10, label: 'Preparing residents and settlement' },
    textures: { weight: 3, label: 'Uploading textures' },
    compile: { weight: 3, label: 'Compiling graphics' },
    draws: { weight: 3, label: 'Preparing the first frame' },
    handoff: { weight: 1, label: 'Arriving at your settlement' },
} as const;

// Only top-level, unique generation work contributes. Nested foundation trials are timings.
const geographyWork: Record<string, number> = {
    terrain: 8, 'initial-candidates': 1, 'initial-plan': 2,
    'environment-zoning': 3, nature: 8, 'validation-and-freeze': 3,
    'campaign-natural-terrain': 10, 'campaign-foundations': 1,
    'campaign-zoning': 3, 'campaign-nature-and-freeze': 9,
}; // 48/50; receipt/adoption owns the remaining two points.

export interface LoadTiming {
    stage: string;
    startedMs: number;
    durationMs?: number;
    outcome?: 'complete' | 'failed' | 'cancelled';
}

let sequence = 0;
let latest: ReturnType<IslandLoadStatus['snapshot']> | undefined;
export const lastIslandLoad = () => latest;
const bounded = (value: unknown) => String(value).slice(0, 240);
/** Strip credentials, query strings and origin; retain just an actionable resource path. */
export function loadResourceId(value: string) {
    try { return new URL(value, 'https://local.invalid').pathname.slice(-180); }
    catch { return bounded(value.split(/[?#]/)[0]); }
}

export class IslandLoadStatus {
    readonly attempt = `${Date.now().toString(36)}-${++sequence}`;
    readonly started: number;
    readonly timeline: LoadTiming[] = [];
    observeTiming?: (timing: LoadTiming) => void;
    readonly metadata: {
        mode: LoadMode; seed?: number; recipe?: unknown; build: string; buildInfo: GameBuildInfo;
        cache: 'browser-managed; cold/warm not inferred'; quality?: string;
        screenRecording: 'not reported' | 'on' | 'off';
        environment?: { browser: string; viewport: [number, number]; pixelRatio: number };
    };
    outcome: LoadOutcome = 'preparing';
    worker: 'not-started' | 'waiting' | 'running' | 'received' | 'failed' | 'cancelled' | 'skipped' = 'not-started';
    stage = 'Reading your campaign';
    substage = 'campaign';
    step: LoadStep = 'campaign';
    stageStarted: number;
    lastProgress: number;
    units?: { completed: number; total: number; kind: string };
    error?: { kind: string; message: string; resource?: string };
    latestResource?: string;
    resources?: { geometries: number; textures: number; programs: number; calls: number; triangles: number;
        renderPixelRatio?: number; drawingBuffer?: [number, number] };
    firstFrameMs?: number;
    playableMs?: number;
    maxObservationGapMs = 0;
    private completed = new Set<LoadStep>();
    private generated = new Set<string>();
    private fractions = new Map<LoadStep, number>();
    private batchTotals = new Map<LoadStep, number>();
    private active = new Set<LoadTiming>();
    private stoppedAt?: number;
    isComplete(step: LoadStep) { return this.completed.has(step); }
    constructor(mode: LoadMode, seed?: number, private now = () => performance.now()) {
        this.started = this.stageStarted = this.lastProgress = now();
        const info = getBuildInfo();
        const build = info.legacyBuild === 'unidentified-source' ? undefined : info.legacyBuild;
        this.metadata = { mode, seed, build: build ?? 'unidentified local build', buildInfo: info,
            cache: 'browser-managed; cold/warm not inferred', screenRecording: 'not reported' };
    }
    enter(step: LoadStep, substage: string, label = loadPlan[step].label as string) {
        if (this.outcome !== 'preparing') return;
        this.step = step;
        if (this.substage !== substage) this.stageStarted = this.now();
        this.substage = bounded(substage);
        this.stage = bounded(label);
        this.units = undefined;
        // Starting a phase is not completed work and cannot refresh lastProgress.
    }
    begin(stage: string, startedMs = this.now() - this.started) {
        const timing: LoadTiming = { stage: bounded(stage), startedMs };
        if (this.outcome === 'preparing') {
            this.timeline.push(timing);
            if (this.timeline.length > 128) this.active.delete(this.timeline.shift()!);
            this.active.add(timing);
            this.observeTiming?.(timing);
        }
        return timing;
    }
    end(timing: LoadTiming, outcome: LoadTiming['outcome'] = 'complete') {
        // An opt-in run may retain a parent after the small UI timeline evicts it.
        // Its eventual completion still belongs in the extended diagnostic record.
        if (!this.active.delete(timing) && (!this.observeTiming || timing.outcome !== undefined)) return;
        timing.durationMs = this.now() - this.started - timing.startedMs;
        timing.outcome = outcome;
        if (outcome === 'complete') this.realProgress();
    }
    realProgress() {
        if (this.outcome === 'preparing') this.lastProgress = this.now();
    }
    complete(step: LoadStep) {
        if (this.outcome !== 'preparing' || this.completed.has(step)) return;
        if (step === 'handoff' && Object.keys(loadPlan).some(key =>
            key !== 'handoff' && !this.completed.has(key as LoadStep)))
            throw new Error('The island is not prepared for playable handoff.');
        this.completed.add(step);
        this.realProgress();
    }
    generationComplete(stage: string) {
        if (this.outcome !== 'preparing') return;
        this.realProgress();
        if (stage === 'island-verify') {
            for (const name of Object.keys(geographyWork)) this.generated.add(name);
        }
        if (Object.hasOwn(geographyWork, stage)) this.generated.add(stage);
    }
    count(step: LoadStep, completed: number, total: number, kind: string, contributes = false) {
        if (this.outcome !== 'preparing') return;
        if (!Number.isInteger(completed) || !Number.isInteger(total) || completed < 0 || completed > total) return;
        const previous = this.units;
        if (completed > (previous?.completed ?? 0)) this.realProgress();
        this.units = { completed, total, kind };
        // Only fixed, enumerated GPU batches contribute fractions. Asset/model costs differ:
        // their counts are evidence, while their envelope closes after all dependencies settle.
        if (contributes && total > 0) {
            const expected = this.batchTotals.get(step);
            if (expected !== undefined && expected !== total)
                throw new Error('A prepared batch cannot discover more work after it starts.');
            this.batchTotals.set(step, total);
            const fraction = completed / total;
            const prior = this.fractions.get(step) ?? 0;
            if (fraction < prior) throw new Error('A prepared batch cannot discover more work after it starts.');
            this.fractions.set(step, fraction);
        }
    }
    problem(kind: string, error: unknown, resource?: string) {
        if (this.outcome !== 'preparing') return;
        this.error = { kind, message: bounded(error instanceof Error ? error.message : error),
            ...(resource ? { resource: loadResourceId(resource) } : {}) };
    }
    stop(outcome: 'failed' | 'cancelled', error?: unknown) {
        if (this.outcome !== 'preparing') return;
        if (error !== undefined) {
            const message = error instanceof Error ? error.message : String(error);
            const kind = /Graphics were interrupted/.test(message) ? 'context-loss' :
                /Island generation timed out/.test(message) ? 'worker-timeout' :
                /graphics took too long/.test(message) ? 'graphics-timeout' :
                /fetch|network|404/i.test(message) ? 'resource-error' : outcome;
            this.problem(kind, error);
        }
        for (const timing of [...this.active]) this.end(timing, outcome);
        this.outcome = outcome;
        this.stoppedAt = this.now();
        if (this.worker === 'waiting' || this.worker === 'running') this.worker = outcome;
    }
    playable() {
        if (this.outcome !== 'preparing') return;
        this.complete('handoff');
        this.playableMs = this.now() - this.started;
        this.outcome = 'playable';
    }
    diagnosticComplete() {
        if (this.outcome !== 'preparing') return;
        this.complete('handoff');
        this.stoppedAt = this.now();
        this.outcome = 'diagnostic-complete';
    }
    get percent() {
        let value = 0;
        for (const [key, entry] of Object.entries(loadPlan)) {
            const step = key as LoadStep;
            if (this.completed.has(step)) value += entry.weight;
            else if (step === 'geography')
                for (const stage of this.generated) value += geographyWork[stage];
            else value += entry.weight * (this.fractions.get(step) ?? 0);
        }
        return Math.floor(value + 1e-8);
    }
    snapshot() {
        const time = this.now();
        const lastProgressAgeMs = time - this.lastProgress;
        let warning = '';
        if (this.outcome === 'preparing' && lastProgressAgeMs >= 15_000) {
            warning = this.step === 'compile' ? 'Still preparing graphics. This step does not report partial progress.' :
                this.step === 'geography' ? 'No new progress report from the island worker. You can keep waiting or go back.' :
                'No new preparation progress reported. You can keep waiting or go back.';
        }
        const snapshot = {
            version: 1, attempt: this.attempt, startedUtc: new Date(performance.timeOrigin + this.started).toISOString(),
            ...this.metadata, outcome: this.outcome,
            percent: this.percent, stage: this.stage, substage: this.substage, worker: this.worker,
            elapsedMs: (this.playableMs ?? (this.stoppedAt ?? time) - this.started), stageElapsedMs: time - this.stageStarted,
            lastProgressAgeMs, warning, units: this.units ? { ...this.units } : undefined,
            error: this.error ? { ...this.error } : undefined,
            latestResource: this.latestResource,
            resources: this.resources ? { ...this.resources } : undefined,
            firstFrameMs: this.firstFrameMs, playableMs: this.playableMs,
            maxObservationGapMs: this.maxObservationGapMs,
            measurements: { gpuTime: 'unsupported', processMemory: 'unsupported',
                cacheTemperature: 'not observable reliably', killedProcess: 'may leave no final event' },
            timeline: this.timeline.map(timing => ({ ...timing })),
        };
        latest = snapshot;
        return snapshot;
    }
}
