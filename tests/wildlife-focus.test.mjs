import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { worldFixture } from './fixtures/wildlife-world.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { resolveWildlifeFocus } = load('../src/lore/AttentionNavigation.ts');

test('a focus request uses only the selected actual player sighting and its bound physical world, leaving Core bytes unchanged', () => {
    const world = worldFixture();
    const context = { world, wildlifeWorld: world, worldId: 'wildlife-focus-fixture' };
    let state = core.createCampaign(32, { initialFood: 5000 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 }, { enabled: false }, {}, { enabled: false });
    state = core.initializePhysicalDiscovery(state, world, context.worldId);
    state = core.initializeWildlifeSightings(state, world, context.worldId);
    const command = value => { state = core.applyCommand(state, value, context); };
    command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1', 'founder-2'] });
    command({ type: 'StartExpedition', groupId: 'group-1' });
    const gull = state.wildlife.actors.find(actor => actor.id === 'great-black-backed-gull:grounded:0');
    command({ type: 'ExploreArea', groupId: 'group-1', target: { x: gull.position.x, z: gull.position.z } });
    command({ type: 'AdvanceTicks', ticks: 30 });
    const event = state.events.find(event => event.type === 'WildlifeSighted');
    assert.ok(event, 'The actual physical expedition must produce the source');
    const before = core.serializeState(state);
    const focus = resolveWildlifeFocus(state, event.id);
    assert.ok(focus);
    assert.deepEqual(focus.target, { worldId: context.worldId, speciesId: event.details.speciesId,
        wildlifeInstanceId: event.details.wildlifeInstanceId });
    assert.equal(resolveWildlifeFocus(state, 'event-999999'), undefined);
    assert.equal(resolveWildlifeFocus({ ...state, wildlife: { ...state.wildlife, worldId: 'other-world' } }, event.id), undefined);
    assert.equal(resolveWildlifeFocus({ ...state, clan: { ...state.clan, id: 'another-clan' } }, event.id), undefined);
    assert.equal(core.serializeState(state), before);
    assert.equal(core.serializeState(core.reconstructState(before)), before);
});
