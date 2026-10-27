import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from './load-typescript.mjs';

const load = path => loadTypeScript(new URL('../src/' + path + '.ts', import.meta.url));
const { SharedSettlement } = load('play/SharedSettlement');
const { inspectClanDiscovery, discoveryAt } = load('simulation/ClanDiscovery');
const output = 'docs/qa/wildlife-remote-focus-002';
await mkdir(output, { recursive: true });
const evidence = [];

for (const species of ['seal', 'puffin', 'lynx']) {
    const owner = SharedSettlement.restore(await readFile(
        'docs/qa/wedding-wildlife-feedback-001/' + (species === 'lynx' ? 'seal' : species) + '-sighting.json', 'utf8'), 'fjord');
    let state = owner.session.readSnapshot();
    const world = owner.fjord.blueprint;
    if (species === 'lynx') {
        const destination = state.wildlife.actors.find(actor => actor.id === 'lynx:roaming:0').position;
        owner.session.command({ type: 'ExploreArea', groupId: 'group-1', target: { x: destination.x, z: destination.z } });
        for (let step = 0; step < 200; step++) {
            state = owner.session.readSnapshot();
            if (state.events.some(event => event.type === 'WildlifeSighted' && event.details.speciesId === species)) break;
            owner.session.command({ type: 'AdvanceTicks', ticks: 5 });
        }
    }
    const event = state.events.find(event => event.type === 'WildlifeSighted' && event.details.speciesId === species);
    assert.ok(event, 'A genuine recorded expedition sighting is required');
    const actor = state.wildlife.actors.find(actor => actor.id === event.details.wildlifeInstanceId);
    const known = inspectClanDiscovery(state.discovery, state.clan.id);
    assert.equal(discoveryAt(known, actor.position.x, actor.position.z), 'visible');
    const { minX, minZ } = world.terrain.bounds;
    const height = world.terrain.heights.reduce((maximum, value) => Math.max(maximum, value), 0) + 80;
    const camera = { position: [minX + 32, height, minZ + 32], target: [minX + 48, 0, minZ + 48] };
    const distance = Math.hypot(...camera.position.map((value, axis) => value -
        [actor.position.x, actor.position.y, actor.position.z][axis]));
    assert.ok(distance > 200, 'The ordinary player camera starts well outside the old focus limit');
    const before = owner.session.saveJSON();
    owner.select(null);
    owner.setPresentation({ quality: 'low', effects: 'low', camera });
    await writeFile(output + '/' + species + '-remote.json', owner.persist());
    assert.equal(owner.session.saveJSON(), before);
    evidence.push({ species, eventId: event.id, instanceId: actor.id, time: state.time, distance, camera,
        canonicalShaInput: 'Unchanged canonical state of the previous genuine paid-expedition checkpoint' });

    if (species === 'lynx') {
        owner.session.command({ type: 'RecallExpedition', groupId: event.details.expeditionGroupId });
        let hidden = false;
        for (let step = 0; step < 400; step++) {
            const current = owner.session.readSnapshot();
            const animal = current.wildlife.actors.find(actor => actor.id === event.details.wildlifeInstanceId);
            assert.ok(animal, 'The recorded animal must remain alive in this fog regression');
            const view = inspectClanDiscovery(current.discovery, current.clan.id);
            if (discoveryAt(view, animal.position.x, animal.position.z) !== 'visible') {
                await writeFile(output + '/lynx-fogged.json', owner.persist());
                evidence.push({ species, eventId: event.id, instanceId: animal.id, time: current.time,
                    visibility: discoveryAt(view, animal.position.x, animal.position.z),
                    source: 'Real RecallExpedition and AdvanceTicks commands; no rewritten animal, event or mask' });
                hidden = true;
                break;
            }
            owner.session.command({ type: 'AdvanceTicks', ticks: 5 });
        }
        assert.ok(hidden, 'Returning the actual observers must remove current visibility');
    }
}
await writeFile(output + '/fixtures.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
