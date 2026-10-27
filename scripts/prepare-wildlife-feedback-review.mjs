import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from './load-typescript.mjs';

const load = path => loadTypeScript(new URL('../src/' + path + '.ts', import.meta.url));
const { SharedSettlement } = load('play/SharedSettlement');
const { inspectClanDiscovery, discoveryAt } = load('simulation/ClanDiscovery');
const { createBlueprintSurface } = load('world-generation/TerrainQueries');
const output = 'docs/qa/wedding-wildlife-feedback-001';
await mkdir(output, { recursive: true });

// Reuse the recorded paid expedition; never manufacture a sighting or reveal mask.
const owner = SharedSettlement.restore(await readFile(
    'docs/qa/wildlife-cinematic-292/live-sighting.json', 'utf8'), 'fjord');
owner.session.command({ type: 'AdvanceTicks', ticks: 15 });
const evidence = [];
for (const species of ['seal', 'puffin']) {
    if (species === 'puffin') {
        const actor = owner.session.readSnapshot().wildlife.actors.find(actor => actor.id === 'puffin:land:0');
        owner.session.command({ type: 'ExploreArea', groupId: 'group-1',
            target: { x: actor.position.x, z: actor.position.z } });
        for (let count = 0; count < 200; count++) {
            if (owner.session.readSnapshot().events.some(event =>
                event.type === 'WildlifeSighted' && event.details?.speciesId === species)) break;
            owner.session.command({ type: 'AdvanceTicks', ticks: 5 });
        }
    }
    const state = owner.session.readSnapshot();
    const event = state.events.find(event => event.type === 'WildlifeSighted' && event.details?.speciesId === species);
    assert.ok(event, 'Actual expedition sighting required: ' + species);
    const actor = state.wildlife.actors.find(actor => actor.id === event.details.wildlifeInstanceId);
    const known = inspectClanDiscovery(state.discovery, state.clan.id), world = owner.fjord.blueprint;
    const surface = createBlueprintSurface(world);
    let camera;
    for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4;
        const x = actor.position.x + Math.sin(angle) * 24;
        const z = actor.position.z + Math.cos(angle) * 24;
        if (discoveryAt(known, x, z) === 'unknown') continue;
        camera = {
            position: [x, Math.max(actor.position.y + 24, surface.surfaceHeightAt(x, z) + 24), z],
            target: [actor.position.x, Math.max(world.waterLevel + .3, actor.position.y + .4), actor.position.z],
        };
        break;
    }
    assert.ok(camera, 'A legitimately known ordinary camera position is required');
    const before = owner.session.saveJSON();
    owner.select(null);
    owner.setPresentation({ quality: 'low', effects: 'low', camera });
    await writeFile(output + '/' + species + '-sighting.json', owner.persist());
    assert.equal(owner.session.saveJSON(), before);
    evidence.push({ species, eventId: event.id, instanceId: actor.id, time: state.time,
        position: actor.position, camera,
        source: 'Real paid Explore commands; no rewritten event, actor or discovery mask' });
}
await writeFile(output + '/fixtures.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
