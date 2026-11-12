import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { core, encounterFixture } from './encounter-fixture.mjs';

const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const { inspectRivalSettlement } = load('../src/fjord-play/RivalSettlement.ts');

function projectionWorld(physicalWorld, seed) {
    const cells = physicalWorld.terrain.heights.length;
    return { ...physicalWorld,
        config: { seed, generatorVersion: 'fjordside-v0.1', preset: 'fjord', width: 320,
            depth: 256, relief: 0, forestDensity: 0, conifers: 'ez-tree' },
        coast: [], placementPlan: [],
        settlement: { ...physicalWorld.settlement,
            bounds: { minX: 24, maxX: 112, minZ: 80, maxZ: 184 }, elevation: 0,
            buildings: [], accessPaths: [], harbor: { x: 64, z: 128 } },
        validation: { accepted: true, reasons: [], connectedBuildings: 0, connectedArea: 81920,
            maximumFoundationSlope: 0, minimumFoundationElevation: 0, score: 1 },
        biomes: { cells: Array(cells).fill('grass'), waterDistance: Array(cells).fill(100),
            moisture: Array(cells).fill(0), worn: Array(cells).fill(0),
            coverage: { water: 0, shore: 0, clearing: 0, grass: 1, forest: 0, rock: 0 } },
    };
}

function firstExchange(policy = {}) {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 8, ...policy } });
    const world = projectionWorld(setup.context.world, setup.state.seed);
    setup.context.world = world;
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let step = 0; step < 450; step++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const encounter = Object.values(state.world.encounters?.records ?? {}).find(entry => entry.exchanges.length);
        if (encounter) return { state, setup, world, encounter };
    }
    throw new Error('The real present parties must reach their first recorded exchange.');
}

test('a real simultaneous exchange projects bounded personal actions for both visible sides without exposing combat rolls', () => {
    const { state, world, encounter } = firstExchange();
    const before = core.serializeState(state);
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const rival = inspectRivalSettlement(state, world);
    const exchange = encounter.exchanges[0];
    const outgoing = exchange.actions.find(action => action.actorClanId === state.clan.id &&
        exchange.actions.some(other => other.targetId === action.actorId));
    assert.ok(outgoing, 'A real participant both attempts and receives an action in this exchange');
    const actor = view.entities.find(entity => entity.kind === 'persona' && entity.id === outgoing.actorId);
    assert.equal(actor.status.encounter?.outgoing?.tick, exchange.tick);
    assert.equal(actor.status.encounter?.incoming?.tick, exchange.tick);
    assert.equal(actor.status.encounter.active, true);
    const opponent = rival.entities.find(entity => entity.kind === 'persona' && entity.id === outgoing.targetId);
    assert.ok(opponent?.status.encounter?.incoming, 'The visible defender receives the same rooted exchange fact');
    assert.doesNotMatch(JSON.stringify(actor.status.encounter), /probabilityBps|roll|nextExchangeAt|defenderIds|attackerIds/);
    assert.equal(core.serializeState(state), before, 'Projecting an action never changes the canonical encounter');
    const restored = core.reconstructState(before);
    assert.deepEqual(projectFjordSettlement(restored, world, view.layout).entities
        .find(entity => entity.kind === 'persona' && entity.id === actor.id).status.encounter, actor.status.encounter);
});

test('recorded combat casualties stay at their exact reached position briefly and never rejoin ordinary movement', () => {
    const { state, setup, world, encounter } = firstExchange({ actionLethalityBps: 10000, maximumExchanges: 1 });
    const action = encounter.exchanges[0].actions.find(value => value.outcome === 'death' &&
        value.targetClanId === state.clan.id);
    assert.ok(action, 'The real guaranteed-lethality exchange records an actual party casualty');
    const receipt = state.events.find(event => event.type === 'PersonaDied' &&
        event.personaId === action.targetId && event.details?.encounterId === encounter.id);
    const before = core.serializeState(state);
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const casualty = view.entities.find(entity => entity.kind === 'persona' && entity.id === action.targetId);
    assert.ok(casualty?.status.combatDeath, 'The exact recorded casualty remains a bounded persona presentation');
    assert.equal(casualty.status.living, false);
    assert.equal(casualty.status.workEligible, false);
    assert.equal(casualty.status.combatDeath.tick, 800315);
    assert.deepEqual({ x: casualty.transform.x, z: casualty.transform.z },
        { x: receipt.details.position.x, z: receipt.details.position.z });
    assert.deepEqual(casualty.status.combatDeath.equipment, { weapon: null, shield: null });
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const motion = new LivingWorldController(world);
    motion.reconcile([casualty], view.ground);
    motion.advance(10, true, true);
    assert.deepEqual(motion.inspect(), [], 'A recorded casualty cannot resume work, social visits or a walking gait');
    assert.equal(core.serializeState(state), before);
    const restored = core.reconstructState(before);
    assert.deepEqual(projectFjordSettlement(restored, world, view.layout).entities
        .find(entity => entity.kind === 'persona' && entity.id === casualty.id), casualty);
    const later = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 15 }, setup.context);
    assert.equal(projectFjordSettlement(later, world, view.layout).entities.some(entity =>
        entity.kind === 'persona' && entity.id === casualty.id), false, 'A past death never becomes a persistent live actor');
});

async function sceneTrace(state, world, entity) {
    const { Group, Mesh, BoxGeometry, MeshBasicMaterial } = await import('three');
    const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const requests = [], gaits = [];
    const models = {
        async create() { const root = new Group(); root.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial())); return root; },
        async reconcile() {}, boundsShape() { return 'fixture-body'; },
        animate(_model, gait) { gaits.push(gait); },
        animateEncounter(_model, request) { requests.push(structuredClone(request)); return true; },
        socialEnabled() { return false; }, occupationClips() { return {}; }, activityClips() { return {}; },
        setEmbarked() {}, setOccupationToolsVisible() {}, pace() { return 1; },
        release(model) { model.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); }); },
    };
    const layer = new FjordEntities(models);
    const motion = new LivingWorldController(world);
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    layer.prepareExpeditions(state, world);
    await layer.sync([entity]);
    motion.reconcile([entity], view.ground);
    layer.configureMotion(motion);
    return { layer, motion, requests, gaits };
}

test('one real simultaneous participant displays both attempt and response, freezes on pause and never samples beyond known ticks', async () => {
    const { state, setup, world, encounter } = firstExchange();
    const action = encounter.exchanges[0].actions.find(value => value.actorClanId === state.clan.id &&
        encounter.exchanges[0].actions.some(other => other.targetId === value.actorId));
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const entity = view.entities.find(value => value.kind === 'persona' && value.id === action.actorId);
    const trace = await sceneTrace(state, world, entity);
    const before = core.serializeState(state);
    try {
        trace.layer.advance(trace.motion, 0, false);
        assert.equal(trace.requests.at(-1)?.action, 'strike', 'The first portion shows the actual unarmed attempt');
        const firstTick = trace.requests.at(-1).tick;
        trace.layer.advance(trace.motion, 10, true);
        assert.equal(trace.requests.at(-1).tick, firstTick, 'Rendering cannot advance past the latest known source tick');
        const next = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 4 }, setup.context);
        view = projectFjordSettlement(next, world, view.layout);
        const sample = view.entities.find(value => value.kind === 'persona' && value.id === entity.id);
        trace.layer.prepareExpeditions(next, world);
        await trace.layer.sync([sample]);
        trace.motion.reconcile([sample], view.ground);
        trace.layer.advance(trace.motion, 10, false);
        assert.equal(trace.requests.at(-1).tick, firstTick, 'Paused interpolation freezes between factual snapshots');
        trace.layer.advance(trace.motion, .5, true);
        assert.equal(trace.requests.at(-1).action, 'brace', 'The final portion shows the same recorded incoming response');
        assert.equal(trace.requests.at(-1).tick, 800319);
        assert.equal(trace.gaits.length, 0, 'A committed ready/action body does not resume ordinary work gait');
        assert.equal(core.serializeState(state), before);
    } finally { trace.layer.dispose(); }
});

test('an actual casualty uses the same bounded scene body without a selection ring, pick target or active human anchor', async () => {
    const { state, world } = firstExchange({ actionLethalityBps: 10000, maximumExchanges: 1 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const casualty = view.entities.find(entity => entity.status.combatDeath);
    const before = core.serializeState(state);
    const trace = await sceneTrace(state, world, casualty);
    try {
        trace.layer.advance(trace.motion, 0, false);
        assert.equal(trace.requests.at(-1).action, 'death');
        assert.deepEqual(trace.gaits, []);
        trace.layer.select([{ kind: 'persona', id: casualty.id, selectionKey: casualty.selectionKey,
            label: casualty.label, role: 'selected' }]);
        assert.deepEqual(trace.layer.root.userData.markers, [], 'An unavailable person receives no selection ring');
        assert.deepEqual(trace.layer.humanPositions(), [], 'The casualty cannot act as an active human anchor');
        assert.deepEqual(trace.layer.productionAnchors(), [], 'The casualty cannot act as a production anchor');
        const { PerspectiveCamera, Vector3 } = await import('three');
        const camera = new PerspectiveCamera(40, 800 / 600, .1, 100);
        camera.position.set(casualty.transform.x, 2, casualty.transform.z + 10);
        camera.lookAt(new Vector3(casualty.transform.x, 0, casualty.transform.z));
        camera.updateMatrixWorld(true);
        assert.equal(trace.layer.pick(camera, 400, 300, { left: 0, top: 0, width: 800, height: 600 }), null);
        assert.equal(core.serializeState(state), before);
    } finally { trace.layer.dispose(); }
});

test('a recent resolved exchange does not hold a real returning body and expires before ordinary home life', async () => {
    const first = firstExchange();
    let state = core.applyCommand(first.state, { type: 'RecallExpedition', groupId: 'group-1' }, first.setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 5 }, first.setup.context);
    let view = projectFjordSettlement(state, first.world, createFjordLayout(first.world));
    const actor = view.entities.find(entity => entity.kind === 'persona' && entity.id === 'founder-1');
    assert.equal(actor.status.encounter.active, false, 'A factual recent exchange is separate from an active physical hold');
    const trace = await sceneTrace(state, first.world, actor);
    try {
        const origin = trace.layer.describe()[0].position;
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2 }, first.setup.context);
        view = projectFjordSettlement(state, first.world, view.layout);
        const sample = view.entities.find(entity => entity.kind === 'persona' && entity.id === actor.id);
        assert.equal(sample.status.encounter.active, false);
        trace.layer.prepareExpeditions(state, first.world);
        await trace.layer.sync([sample]);
        trace.motion.reconcile([sample], view.ground);
        trace.layer.advance(trace.motion, .5, true);
        const moved = trace.layer.describe()[0].position;
        assert.ok(Math.hypot(moved[0] - origin[0], moved[2] - origin[2]) > .1,
            'The actual homeward route advances even while its final action remains recent');
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, first.setup.context);
        const home = projectFjordSettlement(state, first.world, view.layout).entities
            .find(entity => entity.kind === 'persona' && entity.id === actor.id);
        assert.equal(home.status.encounter, undefined);
        assert.equal(home.status.expedition, undefined);
        const observed = inspectRivalSettlement(state, first.world);
        assert.ok(observed.entities.every(entity => !entity.status.encounter && !entity.status.combatDeath),
            'Even still-observed bodies retain no expired historical action');
        assert.doesNotMatch(JSON.stringify(observed), /outgoing|incoming|combatDeath|EncounterExchange/);
    } finally { trace.layer.dispose(); }
});

test('sparse and dense render-only scene requests preserve exact Core snapshots, event history and random state', async () => {
    const first = firstExchange();
    const saved = core.serializeState(first.state);
    const baseline = core.applyCommand(core.reconstructState(saved),
        { type: 'AdvanceTicks', ticks: 18 }, first.setup.context);
    const expected = core.serializeState(baseline);
    async function rendered(frames) {
        let state = core.reconstructState(saved);
        let view = projectFjordSettlement(state, first.world, createFjordLayout(first.world));
        let actor = view.entities.find(entity => entity.kind === 'persona' && entity.id === 'founder-1');
        const trace = await sceneTrace(state, first.world, actor);
        try {
            for (let tick = 0; tick < 18; tick++) {
                state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, first.setup.context);
                const unchanged = core.serializeState(state);
                view = projectFjordSettlement(state, first.world, view.layout);
                const observed = inspectRivalSettlement(state, first.world);
                const { discoveryAt, inspectClanDiscovery } = load('../src/simulation/ClanDiscovery.ts');
                const knowledge = inspectClanDiscovery(state.discovery, state.clan.id);
                assert.ok(observed.entities.every(entity => discoveryAt(knowledge,
                    entity.transform.x, entity.transform.z) === 'visible'));
                assert.doesNotMatch(JSON.stringify(observed.entities.map(entity => entity.status.encounter)),
                    /probabilityBps|roll|nextExchangeAt|attackerIds|defenderIds/);
                actor = view.entities.find(entity => entity.kind === 'persona' && entity.id === actor.id);
                trace.layer.prepareExpeditions(state, first.world);
                await trace.layer.sync([actor]);
                trace.motion.reconcile([actor], view.ground);
                for (let frame = 0; frame < frames; frame++) trace.layer.advance(trace.motion, .5 / frames, true);
                assert.equal(core.serializeState(state), unchanged, 'Rendering changes no canonical field');
            }
            return core.serializeState(state);
        } finally { trace.layer.dispose(); }
    }
    assert.equal(await rendered(1), expected);
    assert.equal(await rendered(15), expected);
    assert.equal(core.serializeState(first.state), saved);
});
