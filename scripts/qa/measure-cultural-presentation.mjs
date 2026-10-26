import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadTypeScript } from '../load-typescript.mjs';

const output = resolve(process.argv[2] ?? 'docs/qa/cultural-events/presentation-headless-v3.json');
const protocol = { version: 3, seeds: [17, 32, 91], repeats: 4, profiles: { Low: 6, Standard: 8 },
    setupTiming: 'Actual projection plus controller/coordinator construction; harness identity checks excluded',
    cadenceSeconds: .1, commonWarmupSteps: 50, measuredSteps: 2400, postDisposeSteps: 50,
    order: 'Baseline then staged in odd repetitions; reversed in even repetitions',
    core: 'Real Summer 800 campaign, annual birthday mode, experimental culture enabled; one actual 3-Food sponsorship in both arms',
    geography: 'Current production baked physical island; normal recipe mapping and byte/hash validation',
    actors: 'All projected own-settlement entities. Public controller default pace; no model-derived pace or occupation/graze clip hooks',
    baseline: 'Identical paid Core state; fresh cultural event marked seen without staging',
    timing: 'Synchronous actual Node CPU wall time; raw frame durations rounded to nanoseconds. No WebGL, mixers, device RAM or physical FPS',
    inspection: 'Public overlap/safety/actor counters sampled each 0.1-second step, outside timed update',
    target: 'Report every paired update-p95 change above 5%; not a browser-frame acceptance gate',
    tail: 'Retain every raw update duration and identify its worst sample plus maximum per-update route attempts/nodes, including post-release return/work'  };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceEntries = ['src/fjord-play/LivingWorldController.ts', 'src/fjord-play/CulturalPresentation.ts',
    'src/fjord-play/BakedCampaignIsland.ts', 'src/fjord-play/FjordProjection.ts', 'src/simulation/SimulationCore.ts'];
function sourceHashes() {
    const files = new Set();
    function visit(file) {
        if (files.has(file)) return;
        files.add(file);
        const source = readFileSync(file, 'utf8');
        for (const [, name] of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
            const target = resolve(dirname(file), name + (name.endsWith('.ts') ? '' : '.ts'));
            if (existsSync(target)) visit(target);
        }
    }
    sourceEntries.forEach(file => visit(resolve(file)));
    return Object.fromEntries([...files].sort().map(file => [file.replace(resolve('.') + '/', '')
        .replace(resolve('.') + '\\', '').replaceAll('\\', '/'), sha(readFileSync(file))]));
}
const beforeSources = sourceHashes();
const { loadBakedCampaignIsland } = loadTypeScript(new URL('../../src/fjord-play/BakedCampaignIsland.ts', import.meta.url));
const { campaignIslandPlan } = loadTypeScript(new URL('../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const { createFjordLayout, projectFjordSettlement } = loadTypeScript(new URL('../../src/fjord-play/FjordProjection.ts', import.meta.url));
const { LivingWorldController } = loadTypeScript(new URL('../../src/fjord-play/LivingWorldController.ts', import.meta.url));
const { CulturalPresentation } = loadTypeScript(new URL('../../src/fjord-play/CulturalPresentation.ts', import.meta.url));
const { discoveryAt, inspectClanDiscovery } = loadTypeScript(new URL('../../src/simulation/ClanDiscovery.ts', import.meta.url));
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const metricFields = ['routeAttempts', 'rejectedRoutes', 'routeNodes', 'maxRouteNodes', 'failedRouteReuse',
    'agents', 'bodyOverlaps', 'outOfZone', 'retainedHomeWaypoints', 'retainedGatheringWaypoints', 'returningGatheringActors', 'updates', 'presentationSteps'];
const compact = metrics => Object.fromEntries(metricFields.map(key => [key, metrics[key]]));
const stats = nanoseconds => {
    if (!nanoseconds.length) return { count: 0, meanMs: null, p50Ms: null, p95Ms: null, maximumMs: null };
    const sorted = [...nanoseconds].sort((a, b) => a - b);
    return { count: sorted.length, meanMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length / 1e6,
        p50Ms: sorted[Math.ceil(sorted.length * .5) - 1] / 1e6,
        p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] / 1e6, maximumMs: sorted.at(-1) / 1e6 };
};
const elapsed = started => Math.round((performance.now() - started) * 1e6);
const poseHash = motion => sha(JSON.stringify(motion.inspect().map(actor => [actor.key, actor.x, actor.y, actor.z])));
const rows = [], fixtures = [], pairs = [];
const report = { version: 1, recordedUtc: new Date().toISOString(),
    baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version, environment: 'Headless Node; real Core, production terrain, public navigation and cultural coordinator only',
    protocol, sourceHashes: beforeSources, runnerSha256: sha(readFileSync(new URL(import.meta.url))),
    fixtures, rows, pairs, complete: false };
const persist = () => {
    const text = JSON.stringify(report) + '\n';
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Bounded performance report exceeded 2 MiB');
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, text);
};
function build(fixture) {
    const started = performance.now();
    const view = projectFjordSettlement(fixture.paid, fixture.world, createFjordLayout(fixture.world, undefined, fixture.seed));
    const projectionNs = elapsed(started);
    assert.ok(sha(JSON.stringify(view.entities)) === fixture.entitySha256, 'Paired projection changed');
    const controllerStarted = performance.now();
    const motion = new LivingWorldController(fixture.world,
        (x, z) => discoveryAt(fixture.knowledge, x, z) !== 'unknown');
    motion.reconcile(view.entities, view.ground);
    const show = new CulturalPresentation(fixture.before, motion, view.campfire.transform);
    const controllerNs = elapsed(controllerStarted);
    const setupNs = projectionNs + controllerNs;
    for (let index = 0; index < protocol.commonWarmupSteps; index++)
        motion.advance(protocol.cadenceSeconds, true, true);
    return { motion, show, setupNs, projectionNs, controllerNs };
}
function run(fixture, profile, limit, arm, repeat) {
    const { motion, show, setupNs, projectionNs, controllerNs } = build(fixture);
    const actorCount = motion.inspect().length;
    const initialPoseSha256 = poseHash(motion);
    const purposes = {};
    motion.setRouteObserver(row => {
        const key = row.purpose;
        const value = purposes[key] ??= { attempts: 0, accepted: 0, nodes: 0, maximumNodes: 0 };
        value.attempts++;
        value.accepted += Number(row.accepted);
        value.nodes += row.nodes;
        value.maximumNodes = Math.max(value.maximumNodes, row.nodes);
    });
    const initialMetrics = motion.inspectMetrics();
    const acceptedAt = performance.now();
    const accepted = show.accept(fixture.paid, limit, arm === 'staged');
    const acceptNs = elapsed(acceptedAt);
    const immediatelyAfter = motion.inspectMetrics();
    const staged = show.inspect()?.stagedParticipants ?? 0;
    const framesNs = [], postDisposeNs = [];
    let activeSteps = 0, maximumActors = actorCount, minimumActors = actorCount,
        overlapSamples = 0, outOfZoneSamples = 0, maximumOverlaps = initialMetrics.bodyOverlaps,
        maximumOutOfZone = initialMetrics.outOfZone, maximumArrived = 0, maximumDropped = 0, minimumPerformanceParticipants = Infinity;
    const phases = {};
    let previousRoutes = immediatelyAfter.routeAttempts, previousNodes = immediatelyAfter.routeNodes;
    let worstUpdate = null, maximumRouteUpdate = null, maximumRouteAttemptsPerUpdate = 0;
    let maximumGatheringWaypoints = 0, maximumReturningActors = 0;
    function observe(index, phase, ns) {
        const metrics = motion.inspectMetrics();
        const routeAttempts = metrics.routeAttempts - previousRoutes;
        const routeNodes = metrics.routeNodes - previousNodes;
        const observation = { step: index + 1, presentationSeconds: (index + 1) * protocol.cadenceSeconds,
            phase, ns, routeAttempts, routeNodes };
        if (!worstUpdate || ns > worstUpdate.ns) worstUpdate = observation;
        if (!maximumRouteUpdate || routeNodes > maximumRouteUpdate.routeNodes) maximumRouteUpdate = observation;
        maximumRouteAttemptsPerUpdate = Math.max(maximumRouteAttemptsPerUpdate, routeAttempts);
        maximumGatheringWaypoints = Math.max(maximumGatheringWaypoints, metrics.retainedGatheringWaypoints ?? 0);
        maximumReturningActors = Math.max(maximumReturningActors, metrics.returningGatheringActors ?? 0);
        previousRoutes = metrics.routeAttempts;
        previousNodes = metrics.routeNodes;
        maximumActors = Math.max(maximumActors, metrics.agents);
        minimumActors = Math.min(minimumActors, metrics.agents);
        maximumOverlaps = Math.max(maximumOverlaps, metrics.bodyOverlaps);
        maximumOutOfZone = Math.max(maximumOutOfZone, metrics.outOfZone);
        overlapSamples += Number(metrics.bodyOverlaps > 0);
        outOfZoneSamples += Number(metrics.outOfZone > 0);
        const members = motion.inspectGathering()?.participants ?? [];
        maximumArrived = Math.max(maximumArrived, members.filter(member => member.arrived).length);
        maximumDropped = Math.max(maximumDropped, members.filter(member => member.dropped).length);
    }
    for (let index = 0; index < protocol.measuredSteps; index++) {
        const current = show.inspect();
        const phase = current?.phase ?? 'none';
        if (phase === 'gathering' || phase === 'response')
            minimumPerformanceParticipants = Math.min(minimumPerformanceParticipants, current.stagedParticipants);
        phases[phase] = (phases[phase] ?? 0) + 1;
        if (phase !== 'none') activeSteps++;
        const started = performance.now();
        motion.advance(protocol.cadenceSeconds, true, true);
        show.advance(protocol.cadenceSeconds, true, true);
        framesNs.push(elapsed(started));
        observe(index, phase, framesNs.at(-1));
    }
    const finalMetrics = motion.inspectMetrics();
    const naturallyFinished = show.inspect() === null && motion.inspectGathering() === null;
    const beforeDispose = poseHash(motion);
    const disposedAt = performance.now();
    show.dispose();
    const disposeNs = elapsed(disposedAt);
    const disposal = { ns: disposeNs, groupReleased: motion.inspectGathering() === null,
        positionsUnchanged: poseHash(motion) === beforeDispose, actors: motion.inspect().length };
    for (let index = 0; index < protocol.postDisposeSteps; index++) {
        const started = performance.now();
        motion.advance(protocol.cadenceSeconds, true, true);
        show.advance(protocol.cadenceSeconds, true, true);
        postDisposeNs.push(elapsed(started));
    }
    motion.setRouteObserver(undefined);
    assert.ok(sha(core.serializeState(fixture.paid)) === fixture.paidSha256, 'Presentation changed canonical state');
    return { seed: fixture.seed, profile, limit, repeat, arm, accepted, staged, setupNs, projectionNs, controllerNs, acceptNs,
        initialPoseSha256, actorCount, maximumActors, minimumActors, phases, activeSteps,
        maximumArrived, maximumDropped, minimumPerformanceParticipants: Number.isFinite(minimumPerformanceParticipants) ? minimumPerformanceParticipants : null, naturallyFinished, overlapSamples, maximumOverlaps,
        outOfZoneSamples, maximumOutOfZone, metrics: { initial: compact(initialMetrics),
            afterAccept: compact(immediatelyAfter), final: compact(finalMetrics) },
        eventRouteBurst: immediatelyAfter.routeAttempts - initialMetrics.routeAttempts,
        eventRouteNodes: immediatelyAfter.routeNodes - initialMetrics.routeNodes,
        worstUpdate, maximumRouteUpdate, maximumRouteAttemptsPerUpdate, maximumGatheringWaypoints, maximumReturningActors,
        purposes, disposal, update: stats(framesNs), postDispose: stats(postDisposeNs),
        framesNs, postDisposeNs };
}
try {
    for (const seed of protocol.seeds) {
        const loadStarted = performance.now();
        const loaded = await loadBakedCampaignIsland(seed, undefined, undefined,
            async url => new Response(readFileSync(resolve('public', '.' + url.split('?')[0]))));
        const world = loaded.world;
        let before = core.createCampaign(seed, {}, {}, {}, {}, { enabled: true }, {},
            'summer-800-v1', undefined, undefined, { enabled: true });
        before = core.initializeIslandClans(before, world, 'cultural-performance:' + seed);
        const offer = core.gatheringOffer(before);
        assert.ok(offer.allowed, 'Fixed seed cannot sponsor the configured gathering');
        const paid = core.applyCommand(before, { type: 'SponsorGathering', occasion: offer.occasion,
            expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
            expectedParticipantIds: offer.participantIds });
        const view = projectFjordSettlement(paid, world, createFjordLayout(world, undefined, seed));
        const fixture = { seed, before, paid, world, knowledge: inspectClanDiscovery(paid.discovery, paid.clan.id), paidSha256: sha(core.serializeState(paid)),
            entitySha256: sha(JSON.stringify(view.entities)) };
        fixtures.push({ seed, recipe: campaignIslandPlan(world).recipe, loadAndCoreSetupWallMs: performance.now() - loadStarted,
            worldSha256: sha(JSON.stringify(world)), beforeSha256: sha(core.serializeState(before)),
            paidSha256: fixture.paidSha256, entitySha256: fixture.entitySha256,
            groundSha256: sha(JSON.stringify(view.ground)), time: paid.time, foodPaid: before.stocks.food - paid.stocks.food,
            factualParticipants: offer.participantIds.length, entityCount: view.entities.length,
            projectedResidents: view.entities.filter(entity => entity.kind === 'persona' && entity.transform).length,
            projectedLivestock: view.entities.filter(entity => entity.kind === 'cattle' && entity.transform).length });
        for (const [profile, limit] of Object.entries(protocol.profiles)) {
            for (let repeat = 1; repeat <= protocol.repeats; repeat++) {
                const order = repeat % 2 ? ['baseline', 'staged'] : ['staged', 'baseline'];
                const pair = {};
                for (const arm of order) {
                    pair[arm] = run(fixture, profile, limit, arm, repeat);
                    rows.push(pair[arm]);
                }
                assert.ok(pair.baseline.initialPoseSha256 === pair.staged.initialPoseSha256,
                    'Pair did not start at identical public actor poses');
                const activeSteps = pair.staged.activeSteps;
                const activeBaseline = stats(pair.baseline.framesNs.slice(0, activeSteps));
                const activeStaged = stats(pair.staged.framesNs.slice(0, activeSteps));
                pairs.push({ seed, profile, repeat, order, matchedInitialPoses: true,
                    warmP95ChangePercent: (pair.staged.update.p95Ms / pair.baseline.update.p95Ms - 1) * 100,
                    activeSteps, activeBaseline, activeStaged,
                    activeP95ChangePercent: activeSteps ? (activeStaged.p95Ms / activeBaseline.p95Ms - 1) * 100 : null,
                    eventRouteBurst: pair.staged.eventRouteBurst });
                persist();
            }
        }
    }
    const afterSources = sourceHashes();
    report.sourceUnchangedDuringMeasurement = JSON.stringify(afterSources) === JSON.stringify(beforeSources);
    assert.ok(report.sourceUnchangedDuringMeasurement, 'Measured dependency source changed during the run');
    report.summary = { arms: rows.length, pairedCases: pairs.length,
        warmRegressionsAboveFivePercent: pairs.filter(pair => pair.warmP95ChangePercent > 5).length,
        activeRegressionsAboveFivePercent: pairs.filter(pair => pair.activeP95ChangePercent > 5).length,
        stagedFailuresToBegin: rows.filter(row => row.arm === 'staged' && !row.accepted).length,
        stagedUnfinishedAt240Seconds: rows.filter(row => row.arm === 'staged' && !row.naturallyFinished).length,
        stagedWithoutPerformance: rows.filter(row => row.arm === 'staged' && !row.phases.gathering).length,
        underQuorumPerformances: rows.filter(row => row.arm === 'staged' && row.minimumPerformanceParticipants !== null && row.minimumPerformanceParticipants < 3).length,
        maximumOverlaps: Math.max(...rows.map(row => row.maximumOverlaps)),
        maximumOutOfZone: Math.max(...rows.map(row => row.maximumOutOfZone)),
        maximumEventRouteBurst: Math.max(...rows.map(row => row.eventRouteBurst)),
        maximumUpdateMs: Math.max(...rows.map(row => row.worstUpdate.ns / 1e6)),
        maximumRouteNodesPerUpdate: Math.max(...rows.map(row => row.maximumRouteUpdate.routeNodes)),
        maximumGatheringWaypoints: Math.max(...rows.map(row => row.maximumGatheringWaypoints)),
        retainedGatheringWaypointsAtEnd: rows.reduce((sum, row) => sum + (row.metrics.final.retainedGatheringWaypoints ?? 0), 0),
        returningActorsAtEnd: rows.reduce((sum, row) => sum + (row.metrics.final.returningGatheringActors ?? 0), 0),
        actorCountChanged: rows.some(row => row.minimumActors !== row.actorCount || row.maximumActors !== row.actorCount),
        disposalFailures: rows.filter(row => !row.disposal.groupReleased || !row.disposal.positionsUnchanged).length,
        warmTargetPassed: pairs.every(pair => pair.warmP95ChangePercent <= 5),
        browserFrameTarget: 'Unverified; this is headless controller/coordinator CPU only' };
    report.complete = true;
    persist();
    console.log(JSON.stringify({ output, ...report.summary }));
} catch (error) {
    report.failure = { name: error?.name ?? 'Error', message: String(error?.message ?? error).slice(0, 300) };
    persist();
    console.error(JSON.stringify({ output, failure: report.failure, completedArms: rows.length }));
    process.exitCode = 1;
}
