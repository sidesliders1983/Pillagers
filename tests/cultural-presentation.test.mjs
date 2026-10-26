import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');

function fixture() {
    let state = core.createCampaign(17, {}, {}, {}, {}, {}, {},
        undefined, undefined, undefined, { enabled: true });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities.filter(entity => entity.kind !== 'cattle'), view.ground);
    const pay = () => {
        const offer = core.gatheringOffer(state);
        state = core.applyCommand(state, { type: 'SponsorGathering', occasion: offer.occasion,
            expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
            expectedParticipantIds: offer.participantIds });
        return state;
    };
    return { state, view, motion, pay };
}

test('only a fresh paid gathering starts bounded existing-actor presentation, never restored history', () => {
    const { CulturalPresentation } = load('../src/fjord-play/CulturalPresentation.ts');
    const fixtureState = fixture();
    const show = new CulturalPresentation(fixtureState.state, fixtureState.motion,
        fixtureState.view.campfire.transform);
    assert.equal(show.inspect(), null);
    const paid = fixtureState.pay(), saved = core.serializeState(paid);
    assert.equal(show.accept(paid, 6, true), true);
    const active = show.inspect();
    assert.equal(active.phase, 'approach');
    assert.ok(active.stagedParticipants > 0 && active.stagedParticipants <= 6);
    assert.equal(show.accept(paid, 6, true), false);
    assert.equal(core.serializeState(paid), saved);
    const loaded = new CulturalPresentation(core.reconstructState(saved), fixtureState.motion,
        fixtureState.view.campfire.transform);
    assert.equal(loaded.accept(paid, 6, true), false);
    assert.equal(loaded.inspect(), null);
    show.dispose();
    assert.equal(fixtureState.motion.inspectGathering(), null);
});

test('the real approach and short performance freeze on pause and release actors without Core changes', () => {
    const { CulturalPresentation } = load('../src/fjord-play/CulturalPresentation.ts');
    const f = fixture(), show = new CulturalPresentation(f.state, f.motion, f.view.campfire.transform);
    const paid = f.pay(), saved = core.serializeState(paid);
    assert.equal(show.accept(paid, 6, true), true);
    const paused = show.inspect();
    show.advance(100, false, true);
    assert.deepEqual(show.inspect(), paused);
    const phases = new Set();
    for (let frame = 0; frame < 1300; frame++) {
        f.motion.advance(.1, true, true);
        show.advance(.1, true, true);
        const state = show.inspect();
        if (state) phases.add(state.phase);
        else break;
    }
    assert.equal(phases.has('gathering'), true);
    assert.equal(phases.has('response'), true);
    assert.equal(show.inspect(), null);
    assert.equal(f.motion.inspectGathering(), null);
    assert.equal(core.serializeState(paid), saved);
});

test('a real production island allows a safely approaching group to gather after its actual longer walk', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { loadBakedCampaignIsland } = load('../src/fjord-play/BakedCampaignIsland.ts');
    const { inspectClanDiscovery, discoveryAt } = load('../src/simulation/ClanDiscovery.ts');
    const { CulturalPresentation } = load('../src/fjord-play/CulturalPresentation.ts');
    const seed = 91;
    const { world } = await loadBakedCampaignIsland(seed, undefined, undefined,
        async url => new Response(readFileSync(resolve('public', '.' + url.split('?')[0]))));
    let state = core.createCampaign(seed, {}, {}, {}, {}, {}, {}, 'summer-800-v1',
        undefined, undefined, { enabled: true });
    state = core.initializeIslandClans(state, world, 'cultural-presentation-test');
    const view = projectFjordSettlement(state, world, createFjordLayout(world, undefined, seed));
    const known = inspectClanDiscovery(state.discovery, state.clan.id);
    const motion = new LivingWorldController(world, (x, z) => discoveryAt(known, x, z) !== 'unknown');
    motion.reconcile(view.entities, view.ground);
    for (let frame = 0; frame < 50; frame++) motion.advance(.1, true, true);
    const show = new CulturalPresentation(state, motion, view.campfire.transform);
    const offer = core.gatheringOffer(state);
    const paid = core.applyCommand(state, { type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds });
    assert.equal(show.accept(paid, 8, true), true);
    const saved = core.serializeState(paid), phases = new Set();
    for (let frame = 0; frame < 1300; frame++) {
        motion.advance(.1, true, true);
        show.advance(.1, true, true);
        const current = show.inspect();
        if (!current) break;
        phases.add(current.phase);
        if (current.phase !== 'approach') assert.ok(current.stagedParticipants >= 3);
    }
    assert.equal(phases.has('gathering'), true, 'The route is longer than the old thirty-second staging cutoff');
    assert.equal(phases.has('response'), true);
    assert.equal(show.inspect(), null);
    assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
    assert.equal(core.serializeState(paid), saved);
});
