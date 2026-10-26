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
const checkpoint = readFileSync(new URL(
    '../docs/qa/cultural-occasions-277/review-fixture-v2/review-wedding-campaign.json', import.meta.url), 'utf8');
const metadata = JSON.parse(checkpoint);
const { world } = await loadBakedCampaignIsland(metadata.fjord.campaign.seed, metadata.fjord.island,
    undefined, async url => new Response(readFileSync(resolve('public', '.' + url.split('?')[0]))));

for (const limit of [6, 8]) {
    test(`saved seed 2 wedding completes with its actual couple and safely returns at actor limit ${limit}`, t => {
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
        for (const [id, pace] of Object.entries(measuredPaces)) motion.setPace('persona:' + id, pace);
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
        let gatheringAt = null;
        let endedAt = null;
        let returnedAt = null;
        for (let frame = 0; frame < 4000; frame++) {
            const previous = new Map(motion.inspect().map(actor => [actor.key, actor]));
            motion.advance(.1, true, true);
            show.advance(.1, true, true);
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
                    const pace = measuredPaces[actor.key.slice('persona:'.length)];
                    const distance = Math.hypot(actor.x - before.x, actor.z - before.z);
                    assert.ok(distance <= pace * .1 + 1e-6,
                        `${actor.key} must use ordinary walking without teleportation`);
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
        assert.ok(gatheringAt !== null && gatheringAt < 120,
            `The actual couple must reach their slots before timeout; phases: ${[...phases].join(', ')}`);
        assert.deepEqual([...phases], ['approach', 'gathering', 'response']);
        assert.ok(endedAt !== null && endedAt < 128);
        const missingReturns = staged.filter(key => !returned.has(key));
        assert.deepEqual(missingReturns, [],
            'Each staged resident must physically return to their interrupted point');
        assert.equal(motion.inspectGathering(), null);
        assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
        assert.equal(motion.inspectMetrics().retainedGatheringWaypoints, 0);
        assert.equal(routes.length, plannedRoutes, 'Gathering navigation must not launch later route searches');
        assert.equal(core.serializeState(shared.session.readSnapshot()), saved);
        t.diagnostic(JSON.stringify({ limit, gatheringAt, endedAt, returnedAt,
            staged: staged.length, returned: staged.filter(key => returned.has(key)).length,
            gatheringRoutes: routes.length, largestRoute: Math.max(...routes.map(route => route.nodes)),
            bodyOverlaps: motion.inspectMetrics().bodyOverlaps, coreUnchanged: true,
            navigationOnly: true, rendererAndAudioMeasured: false }));
        show.dispose();
    });
}
