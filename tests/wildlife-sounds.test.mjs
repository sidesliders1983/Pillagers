import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { worldFixture } from './fixtures/wildlife-world.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const world = worldFixture();
const context = { world, wildlifeWorld: world, worldId: 'wildlife-audio-fixture' };
function expedition() {
    let state = core.createCampaign(32, { initialFood: 5000, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, {}, { enabled: false });
    state = core.initializePhysicalDiscovery(state, world, context.worldId);
    state = core.initializeWildlifeSightings(state, world, context.worldId);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Coast watch',
        memberIds: ['founder-1', 'founder-2'] }, context);
    return core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
}
function encounter(initial, species) {
    const target = initial.wildlife.actors.find(actor => actor.id.startsWith(species + ':')).position;
    let state = core.applyCommand(initial, { type: 'ExploreArea', groupId: 'group-1', target }, context);
    for (let i = 0; i < 400; i++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
        if (state.events.some(event => event.type === 'WildlifeSighted' && event.details.speciesId === species)) return state;
    }
    assert.fail('The real route did not encounter ' + species);
}
const tick = state => state.time.winter * state.ticksPerWinter + state.time.tick;
function observation(state, now = 1, active = true) {
    return { clanId: state.clan.id, worldId: context.worldId, tick: tick(state), now, active };
}
function actorAt(state, event) {
    return { id: event.details.wildlifeInstanceId, kind: 'wildlife',
        species: event.details.speciesId, observable: true,
        position: state.wildlife.actors.find(actor => actor.id === event.details.wildlifeInstanceId).position };
}
function cameraAt(actor) {
    return { focus: actor.position, forward: { x: 0, z: -1 }, distance: 30 };
}

test('a real expedition encounter permits one local rabbit call without replaying saved sightings', () => {
    const initial = expedition();
    const state = encounter(initial, 'rabbit');
    const event = state.events.find(event => event.type === 'WildlifeSighted' && event.details.speciesId === 'rabbit');
    const actor = actorAt(state, event), camera = cameraAt(actor);
    const saved = core.serializeState(state);
    const { WildlifeSounds } = load('../src/audio/WildlifeSounds.ts');
    const { settlementReviewPack } = load('../src/audio/SettlementSoundPack.ts');
    const sounds = new WildlifeSounds(initial.events, settlementReviewPack);
    sounds.append(state.events, observation(state));
    const calls = sounds.sample(1, camera, [actor], true);
    assert.deepEqual(calls.map(call => [call.id, call.cue, call.event]),
        [['sighting:' + actor.id, 'rabbit', event.id]]);
    sounds.append(state.events, observation(state, 2));
    assert.equal(sounds.sample(10, camera, [actor], true).length, 0, 'A sighting cannot become a periodic call');
    const restored = new WildlifeSounds(core.reconstructState(saved).events, settlementReviewPack);
    restored.append(state.events, observation(state));
    assert.deepEqual(restored.sample(1, camera, [actor], true), []);
    assert.equal(core.serializeState(state), saved, 'Audio cannot mutate canonical state or its RNG');
});


test('real wolf and lynx encounters use their own candidates and never repeat just because the actor remains', () => {
    const { WildlifeSounds } = load('../src/audio/WildlifeSounds.ts');
    const { Soundscape } = load('../src/audio/Soundscape.ts');
    const { settlementReviewPack } = load('../src/audio/SettlementSoundPack.ts');
    for (const species of ['wolf', 'lynx']) {
        const initial = expedition(), state = encounter(initial, species);
        const event = state.events.find(event => event.type === 'WildlifeSighted' && event.details.speciesId === species);
        const actor = actorAt(state, event), camera = cameraAt(actor);
        const sounds = new WildlifeSounds(initial.events, settlementReviewPack);
        const scheduler = new Soundscape(settlementReviewPack.cues, () => 0);
        sounds.append(state.events, observation(state));
        const sources = sounds.sample(1, camera, [actor], true);
        assert.deepEqual(scheduler.update(1, camera, sources, false).voices.map(voice => voice.cue.id), [species]);
        assert.deepEqual(scheduler.update(2, camera, sounds.sample(2, camera, [actor], true), false).voices, []);
        assert.deepEqual(sounds.sample(130, camera, [actor], true), []);
    }
});


test('muted, paused, hidden, distant, stale and foreign encounters never replay after returning', () => {
    const { WildlifeSounds } = load('../src/audio/WildlifeSounds.ts');
    const { settlementReviewPack } = load('../src/audio/SettlementSoundPack.ts');
    const initial = expedition(), state = encounter(initial, 'rabbit');
    const event = state.events.find(event => event.type === 'WildlifeSighted' && event.details.speciesId === 'rabbit');
    const actor = actorAt(state, event), camera = cameraAt(actor);
    const cases = [
        { context: { active: false } },
        { context: { clanId: 'another-clan' } },
        { context: { worldId: 'another-island' } },
        { context: { tick: tick(state) + 100 } },
        { context: {}, actors: [] },
        { context: {}, actors: [{ ...actor, observable: false }] },
        { context: {}, camera: { ...camera, focus: { x: 10000, y: 0, z: 10000 } } },
        { context: {}, now: 3 },
        { context: {}, active: false },
    ];
    for (const scenario of cases) {
        const sounds = new WildlifeSounds(initial.events, settlementReviewPack);
        sounds.append(state.events, { ...observation(state), ...scenario.context });
        assert.deepEqual(sounds.sample(scenario.now ?? 1, scenario.camera ?? camera,
            scenario.actors ?? [actor], scenario.active ?? true), []);
        sounds.append(state.events, observation(state, 4));
        assert.deepEqual(sounds.sample(4, camera, [actor], true), [], 'No delayed camera/unmute replay');
    }
    const sounds = new WildlifeSounds(initial.events, settlementReviewPack);
    sounds.append(state.events, observation(state));
    assert.equal(sounds.sample(1, camera, [actor], true).length, 1);
    assert.deepEqual(sounds.sample(1.2, camera, [], true), []);
    assert.deepEqual(sounds.sample(1.4, camera, [actor], true), [], 'Returning visibility cannot restart a tail');
});
