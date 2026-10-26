import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { loadBakedCampaignIsland } = load('../src/fjord-play/BakedCampaignIsland.ts');
const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
const { CulturalPresentation } = load('../src/fjord-play/CulturalPresentation.ts');
const { inspectClanDiscovery, discoveryAt } = load('../src/simulation/ClanDiscovery.ts');

// Native LOD2 body/DNA gait measurements from the saved review campaign. These are
// navigation inputs, not claims about browser rendering, wardrobe or audio performance.
const measuredPaces = {
    'founder-1': 1.1640246855003646,
    'founder-2': 1.1141373548382838,
    'founder-3': 1.0548604256790284,
    'founder-4': 1.0810765735201875,
    'founder-5': 1.102501186163148,
    'founder-6': 1.0901159891932686,
    'founder-7': 1.0681201323951404,
    'founder-8': 1.1179331932520313,
    'founder-9': 1.0205495390116353,
    'founder-10': 1.1954741815503158,
};
// Same native LOD2 bodies and DNA, measured with the shipped Running clip.
const measuredRunPaces = {
    'founder-1': 3.7063123346721705,
    'founder-2': 3.6396370968926233,
    'founder-3': 3.4464256521950194,
    'founder-4': 3.439773110122793,
    'founder-5': 3.4797213642357234,
    'founder-6': 3.5051535998518575,
    'founder-7': 3.454639638329583,
    'founder-8': 3.4607060783161105,
    'founder-9': 3.2978307231907675,
    'founder-10': 3.913507621940015,
};
const checkpoint = readFileSync(new URL(
    '../docs/qa/cultural-occasions-277/review-fixture-v2/review-wedding-campaign.json', import.meta.url), 'utf8');
const metadata = JSON.parse(checkpoint);
const { world } = await loadBakedCampaignIsland(metadata.fjord.campaign.seed, metadata.fjord.island,
    undefined, async url => new Response(readFileSync(resolve('public', '.' + url.split('?')[0]))));

for (const [limit, clockRunning] of [[6, false], [8, false], [6, true], [8, true]]) {
    test(`saved seed 2 wedding runs toward the fire and walks back at limit ${limit}, clock ${clockRunning ? 'advancing' : 'fixed'}`, t => {
        const shared = SharedSettlement.restore(checkpoint, 'fjord');
        const initial = shared.session.readSnapshot();
        const candidate = core.weddingCandidates(initial).find(item => item.allowed);
        assert.equal(candidate.sourceEventId, 'event-28');
        assert.deepEqual(candidate.spouseIds, ['founder-1', 'founder-6']);
        assert.equal(world.config.seed, 227);
        const view = shared.fjord.readProjection();
        const known = inspectClanDiscovery(initial.discovery, initial.clan.id);
        const motion = new LivingWorldController(world, (x, z) => discoveryAt(known, x, z) !== 'unknown');
        motion.reconcile(view.entities, view.ground);
        for (const [id, pace] of Object.entries(measuredPaces))
            motion.setPace('persona:' + id, pace, measuredRunPaces[id]);
        for (let frame = 0; frame < 50; frame++) motion.advance(.1, true, true);
        const origins = new Map(motion.inspect().map(actor => [actor.key, { x: actor.x, z: actor.z }]));
        const show = new CulturalPresentation(initial, motion, view.campfire.transform);
        const offer = shared.session.gatheringOffer('wedding', candidate.sourceEventId);
        shared.session.commandBatch([{ type: 'SponsorGathering', occasion: 'wedding',
            sourceEventId: candidate.sourceEventId, expectedSequence: offer.expectedSequence,
            quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost,
            expectedParticipantIds: offer.participantIds }]);
        const paid = shared.session.readSnapshot();
        const saved = core.serializeState(paid);
        const baseline = SharedSettlement.restore(shared.persist(), 'fjord');
        if (clockRunning) {
            shared.session.setRunning(true);
            baseline.session.setRunning(true);
        }
        let revision = shared.session.revision;
        const routes = [];
        motion.setRouteObserver(row => { if (row.purpose === 'cultural-gathering') routes.push(row); });
        assert.equal(show.accept(paid, limit, true), true);
        const staged = motion.inspectGathering().participants
            .filter(person => !person.dropped).map(person => person.key);
        assert.ok(staged.length >= 3 && staged.length <= limit);
        const plannedRoutes = routes.length;
        assert.ok(plannedRoutes <= limit * 4 && routes.every(route => route.nodes <= 2000));
        const phases = new Set();
        const returned = new Set();
        const ran = new Set();
        let gatheringAt = null;
        let endedAt = null;
        let returnedAt = null;
        for (let frame = 0; frame < 4000; frame++) {
            const previous = new Map(motion.inspect().map(actor => [actor.key, actor]));
            if (clockRunning) {
                shared.session.elapse(100);
                baseline.session.elapse(100);
                if (shared.session.revision !== revision) {
                    const currentView = shared.fjord.readProjection();
                    motion.reconcile(currentView.entities, currentView.ground);
                    for (const [id, pace] of Object.entries(measuredPaces))
                        motion.setPace('persona:' + id, pace, measuredRunPaces[id]);
                    revision = shared.session.revision;
                }
            }
            motion.advance(.1, true, true);
            show.advance(.1, true, true, core.inspectCampfire(shared.session.readSnapshot()).lit);
            const current = show.inspect();
            const actors = motion.inspect();
            const metrics = motion.inspectMetrics();
            assert.equal(metrics.bodyOverlaps, 0);
            assert.equal(metrics.outOfZone, 0);
            assert.ok(metrics.retainedGatheringWaypoints <= limit * (512 + 4096));
            for (const actor of actors) {
                assert.equal(actor.walkable, true);
                if (staged.includes(actor.key)) {
                    const before = previous.get(actor.key);
                    const id = actor.key.slice('persona:'.length);
                    const wasRunning = before.state === 'Run' || actor.state === 'Run';
                    const pace = wasRunning ? measuredRunPaces[id] : measuredPaces[id];
                    if (actor.state === 'Run') ran.add(actor.key);
                    if (endedAt !== null) assert.notEqual(actor.state, 'Run', 'Residents walk back ordinarily');
                    const distance = Math.hypot(actor.x - before.x, actor.z - before.z);
                    assert.ok(distance <= pace * .1 + 1e-6,
                        `${actor.key} must follow its native gait without teleportation`);
                }
                const origin = origins.get(actor.key);
                if (endedAt !== null && Math.hypot(actor.x - origin.x, actor.z - origin.z) < .15)
                    returned.add(actor.key);
            }
            if (current) {
                phases.add(current.phase);
                if (current.phase === 'gathering') {
                    gatheringAt ??= (frame + 1) / 10;
                    assert.ok(current.stagedParticipants >= 3);
                    assert.ok(current.participantKeys.includes('persona:founder-1'));
                    assert.ok(current.participantKeys.includes('persona:founder-6'));
                    const arrived = motion.inspectGathering().participants.filter(person => person.arrived);
                    assert.ok(arrived.some(person => person.key === 'persona:founder-1'));
                    assert.ok(arrived.some(person => person.key === 'persona:founder-6'));
                }
            } else endedAt ??= (frame + 1) / 10;
            if (endedAt !== null && metrics.returningGatheringActors === 0) {
                returnedAt = (frame + 1) / 10;
                break;
            }
        }
        assert.deepEqual(staged.filter(key => !ran.has(key)), [],
            'Every staged resident must actually run toward the campfire');
        // The same fixture needed 24.5 seconds with native Walking before running was requested.
        assert.ok(gatheringAt !== null && gatheringAt < 18,
            `The actual couple must arrive meaningfully sooner than the recorded 24.5-second walk; phases: ${[...phases].join(', ')}`);
        assert.deepEqual([...phases], ['approach', 'gathering', 'response']);
        assert.ok(endedAt !== null && endedAt < 25);
        const missingReturns = staged.filter(key => !returned.has(key));
        assert.deepEqual(missingReturns, [],
            'Each staged resident must physically return to their interrupted point');
        assert.equal(motion.inspectGathering(), null);
        assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
        assert.equal(motion.inspectMetrics().retainedGatheringWaypoints, 0);
        assert.equal(routes.length, plannedRoutes, 'Gathering navigation must not launch later route searches');
        if (!clockRunning) assert.equal(core.serializeState(shared.session.readSnapshot()), saved);
        assert.equal(core.serializeState(shared.session.readSnapshot()),
            core.serializeState(baseline.session.readSnapshot()));
        t.diagnostic(JSON.stringify({ limit, clockRunning, gatheringAt, endedAt, returnedAt,
            staged: staged.length, returned: staged.filter(key => returned.has(key)).length,
            gatheringRoutes: routes.length, largestRoute: Math.max(...routes.map(route => route.nodes)),
            bodyOverlaps: motion.inspectMetrics().bodyOverlaps, coreUnchanged: !clockRunning,
            coreParityWithHeadless: true, canonicalTimeAfter: shared.session.readSnapshot().time,
            navigationOnly: true, rendererAndAudioMeasured: false }));
        show.dispose();
    });
}

// Supply only Vite's asset-base substitution; the real runtime and committed assets run in Node.
function nativeRuntimeClass(path, name) {
    const url = new URL('../src/' + path, import.meta.url);
    const module = { exports: {} }, nativeRequire = createRequire(import.meta.url);
    const source = readFileSync(url, 'utf8').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'));
    const code = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ?
        loadTypeScript(new URL(name + '.ts', url)) : nativeRequire(name), module, module.exports);
    return module.exports[name];
}

test('the real native resident model prepares Running pace and matches playback to physical speed', async () => {
    const previous = { fetch: globalThis.fetch, self: globalThis.self,
        createImageBitmap: globalThis.createImageBitmap };
    globalThis.self = globalThis;
    globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
    globalThis.fetch = async url => String(url).startsWith('blob:') ? previous.fetch(url) :
        new Response(readFileSync(resolve('public', '.' + String(url).split('?')[0])));
    const Models = nativeRuntimeClass('fjord-play/FjordModels.ts', 'FjordModels');
    const Assets = nativeRuntimeClass('core/AssetManager.ts', 'AssetManager');
    const models = new Models(new Assets());
    try {
        const shared = SharedSettlement.restore(checkpoint, 'fjord');
        const entity = shared.fjord.readProjection().entities.find(item => item.id === 'founder-1');
        const model = await models.create(entity);
        const walk = models.pace(model);
        const run = models.pace(model, 'Run');
        assert.ok(run > 2 * walk && run < 4.5,
            'Running must use the actual faster source gait, not a presentation speed multiplier');
        assert.ok(Math.abs(run - measuredRunPaces['founder-1']) < .001);
        const cadence = 1.0108; // Recorded native DNA cadence for founder-1 in the V2 fixture.
        models.animate(model, 'Run', run, .1);
        assert.equal(model.userData.motion.sourceClip, 'Running');
        assert.equal(model.userData.motion.clip, 'Run');
        const firstTime = model.userData.motion.clipTime;
        models.animate(model, 'Run', run / 2, .1);
        assert.ok(Math.abs(model.userData.motion.clipTime - firstTime - .05 * cadence) < 1e-6,
            'The same Run clip must slow with the actual physical speed');
        const pausedTime = model.userData.motion.clipTime;
        models.animate(model, 'Run', run, 0);
        assert.equal(model.userData.motion.clipTime, pausedTime);
        models.animate(model, 'Walk', walk, .1);
        assert.equal(model.userData.motion.sourceClip, 'Walking');
        models.animate(model, 'Idle', 0, .1);
        assert.equal(model.userData.motion.sourceClip, 'Idle_02');
        const tool = model.getObjectByName('equipment/occupation-farmer');
        assert.ok(tool, 'The real occupation tool must be installed on the resident');
        models.setOccupationToolsVisible(model, false);
        models.animate(model, 'Idle', 0, 0);
        assert.equal(tool.visible, false);
        models.setOccupationToolsVisible(model, true);
        assert.equal(tool.visible, true);
        assert.equal(model.getObjectByName('equipment/occupation-farmer'), tool);
        model.position.set(13, 2, -7);
        model.rotation.set(.1, .5, .2);
        const position = model.position.clone(), rotation = model.quaternion.clone();
        const other = shared.fjord.readProjection().entities.find(item => item.id === 'founder-6');
        await models.reconcile(model, other);
        assert.ok(model.position.distanceTo(position) < 1e-9);
        assert.ok(model.quaternion.angleTo(rotation) < 1e-7,
            'Native gait preparation must restore the existing world pose');
        assert.ok(Math.abs(models.pace(model, 'Run') - measuredRunPaces['founder-6']) < .001);
    } finally {
        models.dispose();
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    }
});
