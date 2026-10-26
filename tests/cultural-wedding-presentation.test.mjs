import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
const { CulturalPresentation } = load('../src/fjord-play/CulturalPresentation.ts');

function fixture(lateSpouse = true, seed = 32) {
    const initial = core.advanceWinter(core.createCampaign(seed,
        { foundingCoupleChanceBps: 0, initialFood: 100 },
        { fertilityChanceBps: 0, partnershipChanceBps: 10000, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] },
        { enabled: false }, {}, {}, {}, undefined, undefined, undefined, { enabled: true }));
    const firstEight = core.gatheringOffer(initial).participantIds;
    const candidates = core.weddingCandidates(initial);
    const candidate = lateSpouse ? candidates.find(item =>
        item.allowed && item.spouseIds.some(id => !firstEight.includes(id))) : candidates.find(item => item.allowed);
    assert.ok(candidate, 'Use a real new canonical partnership');
    const offer = core.gatheringOffer(initial, 'wedding', candidate.sourceEventId);
    const paid = core.applyCommand(initial, { type: 'SponsorGathering', occasion: 'wedding',
        sourceEventId: candidate.sourceEventId, expectedSequence: offer.expectedSequence,
        quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost,
        expectedParticipantIds: offer.participantIds });
    const world = generateWorld({ seed });
    const view = projectFjordSettlement(initial, world, createFjordLayout(world));
    const entities = view.entities.filter(entity => entity.kind !== 'cattle');
    const motion = new LivingWorldController(world);
    motion.reconcile(entities, view.ground);
    const show = new CulturalPresentation(initial, motion, view.campfire.transform);
    return { initial, paid, candidate, world, view, entities, motion, show,
        spouseKeys: candidate.spouseIds.map(id => 'persona:' + id) };
}

test('Low wedding staging reserves both real spouses before its six-actor cap', () => {
    const f = fixture();
    const saved = core.serializeState(f.paid);
    const positions = f.motion.inspect().map(actor => [actor.key, actor.x, actor.y, actor.z]);
    assert.equal(f.show.accept(f.paid, 6, true), true);
    const staged = f.motion.inspectGathering().participants.filter(person => !person.dropped);
    assert.equal(staged.length, 6);
    assert.ok(f.spouseKeys.every(key => staged.some(person => person.key === key)),
        'A genuine wedding cannot omit its actual couple to fill Low slots with other residents');
    assert.deepEqual(f.motion.inspect().map(actor => [actor.key, actor.x, actor.y, actor.z]), positions);
    assert.equal(core.serializeState(f.paid), saved);
    f.show.dispose();
});

test('guests wait for an unarrived spouse and the finite approach abandons decoration without changing Core', () => {
    const f = fixture();
    const saved = core.serializeState(f.paid);
    const slow = f.spouseKeys[0];
    f.motion.setPace(slow, .0001);
    assert.equal(f.show.accept(f.paid, 6, true), true);
    let waitingForSpouse = false;
    for (let frame = 0; frame < 1100; frame++) {
        f.motion.advance(.1, true, true);
        const staged = f.motion.inspectGathering()?.participants ?? [];
        const arrived = staged.filter(person => !person.dropped && person.arrived);
        f.show.advance(.1, true, true);
        if (arrived.length >= 3 && !arrived.some(person => person.key === slow)) {
            waitingForSpouse = true;
            assert.equal(f.show.inspect()?.phase, 'approach', 'Guests cannot begin a wedding without both actual partners');
            break;
        }
    }
    assert.equal(waitingForSpouse, true);
    const paused = f.show.inspect();
    const positions = f.motion.inspect();
    f.motion.advance(100, false, true);
    f.show.advance(100, false, true);
    assert.deepEqual(f.show.inspect(), paused);
    assert.deepEqual(f.motion.inspect(), positions);
    for (let frame = 0; frame < 1300 && f.show.inspect(); frame++) {
        f.motion.advance(.1, true, true);
        f.show.advance(.1, true, true);
        assert.notEqual(f.show.inspect()?.phase, 'gathering');
    }
    assert.equal(f.show.inspect(), null);
    assert.equal(f.motion.inspectGathering(), null);
    assert.ok(f.motion.inspect().every(actor => actor.walkable));
    assert.equal(core.serializeState(f.paid), saved);
    f.show.dispose();
});

test('a real reachable wedding begins only with both spouses and a real audience, and loaded history never restages it', () => {
    const f = fixture(false, 32);
    const saved = core.serializeState(f.paid);
    assert.equal(f.show.accept(f.paid, 6, true), true);
    const phases = new Set();
    for (let frame = 0; frame < 1300 && f.show.inspect(); frame++) {
        f.motion.advance(.1, true, true);
        f.show.advance(.1, true, true);
        const current = f.show.inspect();
        if (!current) break;
        phases.add(current.phase);
        if (current.phase !== 'approach') {
            const arrived = f.motion.inspectGathering().participants.filter(person => person.arrived && !person.dropped);
            assert.ok(arrived.length >= 3 && f.spouseKeys.every(key => arrived.some(person => person.key === key)));
            assert.ok(f.spouseKeys.every(key => current.participantKeys.includes(key)));
        }
    }
    assert.equal(phases.has('gathering'), true);
    assert.equal(phases.has('response'), true);
    assert.equal(f.show.inspect(), null);
    assert.equal(f.motion.inspectGathering(), null);
    const searches = f.motion.inspectMetrics().routeAttempts;
    const loaded = new CulturalPresentation(core.reconstructState(saved), f.motion, f.view.campfire.transform);
    assert.equal(loaded.accept(f.paid, 6, true), false);
    assert.equal(loaded.inspect(), null);
    assert.equal(f.motion.inspectMetrics().routeAttempts, searches);
    assert.equal(core.serializeState(f.paid), saved);
    f.show.dispose();
    loaded.dispose();
});

test('a missing physical spouse abandons only decoration and cannot replay the accepted wedding', () => {
    const f = fixture(false, 32);
    const saved = core.serializeState(f.paid);
    f.motion.reconcile(f.entities.filter(entity => entity.selectionKey !== f.spouseKeys[0]), f.view.ground);
    assert.equal(f.show.accept(f.paid, 6, true), false);
    assert.equal(f.show.inspect(), null);
    assert.equal(f.motion.inspectGathering(), null);
    assert.equal(f.show.accept(f.paid, 6, true), false);
    assert.equal(core.serializeState(f.paid), saved);
    f.show.dispose();
});

test('an actual later expedition departure drops a spouse and ends the active wedding safely', () => {
    const f = fixture(false, 32);
    assert.equal(f.show.accept(f.paid, 6, true), true);
    let began = false;
    for (let frame = 0; frame < 1200 && f.show.inspect(); frame++) {
        f.motion.advance(.1, true, true);
        f.show.advance(.1, true, true);
        if (f.show.inspect()?.phase === 'gathering') { began = true; break; }
    }
    assert.equal(began, true);
    const originalReceipt = structuredClone(f.paid.events.at(-1));
    const traveler = f.candidate.spouseIds[0];
    let away = core.applyCommand(f.paid, { type: 'CreateExpeditionGroup', name: 'Real later departure', memberIds: [traveler] });
    const groupId = Object.keys(away.world.groups)[0];
    const regionId = Object.values(away.world.regions).find(region => !region.requiresShip).id;
    away = core.applyCommand(away, { type: 'DispatchExpedition', groupId, regionId, mission: 'Recon' });
    assert.equal(core.personaAway(away, traveler), true);
    const view = projectFjordSettlement(away, f.world, createFjordLayout(f.world));
    f.motion.reconcile(view.entities.filter(entity => entity.kind !== 'cattle'), view.ground);
    assert.equal(f.motion.inspectGathering().participants.find(person => person.key === 'persona:' + traveler).dropped, true);
    const saved = core.serializeState(away);
    f.show.advance(.1, true, true);
    assert.equal(f.show.inspect(), null);
    assert.equal(f.motion.inspectGathering(), null);
    assert.equal(core.serializeState(away), saved);
    assert.deepEqual(away.events.find(event => event.id === originalReceipt.id), originalReceipt);
    assert.equal(core.inspectCulture(away).supportCount, 1);
    assert.ok(f.motion.inspect().every(actor => actor.walkable));
    f.show.dispose();
});

test('the couple alone cannot start a wedding while its third real attendee is still approaching', () => {
    const f = fixture(false, 32);
    const saved = core.serializeState(f.paid);
    const eventIds = f.paid.events.at(-1).details.participants;
    const guestId = eventIds.find(id => !f.candidate.spouseIds.includes(id) && id === 'founder-4');
    assert.ok(guestId);
    const guestKey = 'persona:' + guestId;
    const visible = new Set([...f.spouseKeys, guestKey]);
    f.motion.reconcile(f.entities.filter(entity => entity.kind !== 'persona' || visible.has(entity.selectionKey)), f.view.ground);
    f.motion.setPace(guestKey, .0001);
    assert.equal(f.show.accept(f.paid, 6, true), true);
    let coupleArrivedWithoutAudience = false;
    for (let frame = 0; frame < 1300 && f.show.inspect(); frame++) {
        f.motion.advance(.1, true, true);
        const arrived = f.motion.inspectGathering()?.participants.filter(person => person.arrived && !person.dropped) ?? [];
        f.show.advance(.1, true, true);
        if (f.show.inspect() && f.spouseKeys.every(key => arrived.some(person => person.key === key)) && arrived.length === 2) {
            coupleArrivedWithoutAudience = true;
            assert.equal(f.show.inspect()?.phase, 'approach');
        }
        assert.notEqual(f.show.inspect()?.phase, 'gathering');
    }
    assert.equal(coupleArrivedWithoutAudience, true);
    assert.equal(f.show.inspect(), null);
    assert.equal(f.motion.inspectGathering(), null);
    assert.equal(core.serializeState(f.paid), saved);
    f.show.dispose();
});

test('the fresh wedding presentation identifies its real occasion and celebrating partners', () => {
    const f = fixture(false);
    assert.equal(f.show.accept(f.paid, 6, true), true);
    const frame = f.show.inspect();
    assert.equal(frame.occasion, 'wedding');
    assert.deepEqual(frame.spouseIds, f.candidate.spouseIds);
    assert.ok(frame.spouseIds.every(id => frame.participantKeys.includes('persona:' + id)));
    f.show.dispose();
});

test('extinguishing the actual wedding fire ends decoration without refunding or repeating its receipt', () => {
    const f = fixture(false);
    assert.equal(core.inspectCampfire(f.paid).lit, true);
    assert.equal(f.show.accept(f.paid, 6, true), true);
    const extinguished = core.applyCommand(f.paid, { type: 'SetCampfire', lit: false });
    const saved = core.serializeState(extinguished);
    f.show.advance(.1, true, true, core.inspectCampfire(extinguished).lit);
    assert.equal(f.show.inspect(), null);
    assert.equal(f.motion.inspectGathering(), null);
    assert.equal(f.show.accept(extinguished, 6, true), false);
    assert.equal(core.serializeState(extinguished), saved);
});
