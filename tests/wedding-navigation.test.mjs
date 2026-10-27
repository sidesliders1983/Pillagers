import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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


for (const [limit, warmup, clockRunning] of [[6, 0, false], [8, 0, false], [6, 50, false], [8, 50, false], [6, 50, true]]) test('a paid wedding (' + limit + ', warmup ' + warmup + ', running ' + clockRunning + ') keeps the real couple and elder together on the physical island without teleporting or changing Core', context => {
    const shared = SharedSettlement.restore(checkpoint, 'fjord');
    const initial = shared.session.readSnapshot();
    const view = shared.fjord.readProjection();
    const known = inspectClanDiscovery(initial.discovery, initial.clan.id);
    const motion = new LivingWorldController(world, (x, z) => discoveryAt(known, x, z) !== 'unknown');
    motion.reconcile(view.entities, view.ground);
    for (const [id, pace] of Object.entries(measuredPaces))
        motion.setPace('persona:' + id, pace, measuredRunPaces[id]);
    for (let frame = 0; frame < warmup; frame++) motion.advance(.1, true, true);
    const candidate = core.weddingCandidates(initial).find(item => item.allowed);
    const offer = shared.session.gatheringOffer('wedding', candidate.sourceEventId);
    shared.session.command({ type: 'SponsorGathering', occasion: 'wedding', sourceEventId: candidate.sourceEventId,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost,
        expectedParticipantIds: offer.participantIds });
    const paid = shared.session.snapshot();
    const baseline = SharedSettlement.restore(shared.persist(), 'fjord');
    if (clockRunning) { shared.session.setRunning(true); baseline.session.setRunning(true); }
    let revision = shared.session.revision;
    const advance = () => {
        if (clockRunning) {
            shared.session.elapse(100); baseline.session.elapse(100);
            if (shared.session.revision !== revision) {
                const projection = shared.fjord.readProjection();
                motion.reconcile(projection.entities, projection.ground);
                for (const [id, pace] of Object.entries(measuredPaces))
                    motion.setPace('persona:' + id, pace, measuredRunPaces[id]);
                revision = shared.session.revision;
            }
        }
        motion.advance(.1, true, true);
    };
    const show = new CulturalPresentation(initial, motion, view.campfire.transform);
    assert.equal(show.accept(paid, limit, true, { weddingSeconds: 30.041 }), true);
    let gathered;
    let gatheringSeconds;
    for (let frame = 0; frame < 900; frame++) {
        const before = new Map(motion.inspect().map(actor => [actor.key, actor]));
        advance();
        show.advance(.1, true, true);
        assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
        assert.equal(motion.inspectMetrics().outOfZone, 0);
        for (const actor of motion.inspect()) {
            const previous = before.get(actor.key);
            const pace = measuredRunPaces[actor.key.slice(8)] ?? 4;
            assert.ok(Math.hypot(actor.x - previous.x, actor.z - previous.z) <= pace * .1 + 1e-6);
        }
        if (show.inspect()?.phase === 'gathering') { gathered = show.inspect(); gatheringSeconds = (frame + 1) / 10; break; }
    }
    assert.ok(gathered, 'A real walkable ceremony must start');
    assert.ok(gatheringSeconds <= 30, 'Native Run should not brake at every straight half-metre waypoint: ' + gatheringSeconds + ' s');
    const people = new Map(motion.inspect().map(actor => [actor.key.slice(8), actor]));
    const [first, second] = gathered.spouseIds.map(id => people.get(id));
    assert.ok(Math.hypot(first.x - second.x, first.z - second.z) <= 2, 'Couple must share an intimate ceremony spot');
    const elder = people.get(gathered.wedding.roles.find(role => role.role === 'officiant').id);
    assert.ok(Math.hypot(elder.x - (first.x + second.x) / 2, elder.z - (first.z + second.z) / 2) <= 2.5);
    assert.ok(gathered.stagedParticipants >= 6 && gathered.stagedParticipants <= limit);
    // Optional clappers may physically drop; no replacement actor may be invented for them.
    for (const role of gathered.wedding.roles.filter(role => role.role !== 'clapper'))
        assert.ok(gathered.participantKeys.includes('persona:' + role.id), role.id + ' essential ceremony role');
    context.diagnostic('Native Run: ' + gatheringSeconds + ' s; ' + gathered.stagedParticipants + ' of at most ' + limit + ' real actors');
    assert.equal(core.serializeState(shared.session.snapshot()), core.serializeState(baseline.session.snapshot()));
    assert.equal(gathered.wedding.duration, 30.041);
    const paused = show.inspect();
    show.advance(10, false, true);
    assert.deepEqual(show.inspect(), paused);
    for (let frame = 0; frame < 100; frame++) { advance(); show.advance(.1, true, true); }
    assert.equal(show.inspect()?.phase, 'gathering', 'The delivered track lasts longer than the old four-second gathering');
    show.skip(); show.skip();
    assert.equal(show.inspect(), null);
    assert.equal(motion.inspectGathering(), null);
    assert.equal(core.serializeState(shared.session.snapshot()), core.serializeState(baseline.session.snapshot()));
});
