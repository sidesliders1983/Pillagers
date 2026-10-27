import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from './load-typescript.mjs';
const load = path => loadTypeScript(new URL('../src/' + path + '.ts', import.meta.url));
const core = load('simulation/SimulationCore');
const { SharedSettlement } = load('play/SharedSettlement');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const { currentIslandVersion } = load('fjord-play/CampaignIsland');
const { createBlueprintSurface } = load('world-generation/TerrainQueries');
const { discoveryAt, inspectClanDiscovery } = load('simulation/ClanDiscovery');
const { solveCameraClearance } = load('camera/CameraClearance');
const output = 'docs/qa/wildlife-cinematic-292';
await mkdir(output, { recursive: true });
const session = new GameplaySession(32);
// Explicit QA funding/quiet demography. Actual world, fauna, mission costs, routes and sightings are unchanged.
session.loadJSON(core.serializeState(core.createCampaign(32, { initialFood: 5000 },
    { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
    { enabled: false }, {}, { enabled: false })));
const owner = new SharedSettlement(session, undefined, false, currentIslandVersion);
owner.fjord.enableDiscovery();
const world = owner.fjord.blueprint, surface = createBlueprintSurface(world);
session.command({ type: 'CreateExpeditionGroup', name: 'Coast watch', memberIds: ['founder-1', 'founder-2'] });
session.command({ type: 'StartExpedition', groupId: 'group-1' });
let destination;
for (const actor of session.snapshot().wildlife.actors.filter(actor => actor.id.includes('grounded'))) {
    const target = { x: actor.position.x, z: actor.position.z };
    try { session.exploreOffer('group-1', target); destination = target; break; } catch {}
}
assert.ok(destination, 'A real physical route to a gull must be available');
session.command({ type: 'ExploreArea', groupId: 'group-1', target: destination });
let event;
for (let tick = 0; tick < 1500; tick += 5) {
    session.command({ type: 'AdvanceTicks', ticks: 5 });
    event = session.snapshot().events.find(event => event.type === 'WildlifeSighted');
    if (event) break;
}
assert.ok(event, 'The real paid expedition must produce a canonical sighting within its bounded run');
const state = session.snapshot();
const actor = state.wildlife.actors.find(actor => actor.id === event.details.wildlifeInstanceId);
assert.ok(actor);
const point = actor.position;
const known = inspectClanDiscovery(state.discovery, state.clan.id);
const target = [point.x, point.y + .5, point.z];
const maximumHeight = world.terrain.heights.reduce((maximum, height) => Math.max(maximum, height), -Infinity);
let camera;
for (const radius of [10, 14, 20]) {
    for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4;
        const x = point.x + Math.sin(angle) * radius, z = point.z + Math.cos(angle) * radius;
        if (discoveryAt(known, x, z) === 'unknown') continue;
        const y = Math.max(point.y + 4, surface.surfaceHeightAt(x, z) + 4, world.waterLevel + 4);
        const correction = solveCameraClearance({ eye: { x, y, z }, focus: { x: target[0], y: target[1], z: target[2] },
            heightAt: surface.surfaceHeightAt, grid: world.terrain, maximumHeight,
            waterLevel: world.waterLevel, nearRadius: .2 });
        if (correction.eyeY - y > .2) continue;
        camera = { position: [x, correction.eyeY, z], target };
        break;
    }
    if (camera) break;
}
assert.ok(camera, 'QA camera framing must use known, terrain-safe geography around the real sighting');
owner.select(null);
owner.setPresentation({ quality: 'low', effects: 'low', camera });
const before = session.saveJSON();
await writeFile(output + '/live-sighting.json', owner.persist());
assert.equal(session.saveJSON(), before);
const historic = SharedSettlement.restore(owner.persist(), 'fjord');
historic.session.command({ type: 'AdvanceTicks', ticks: 1000 });
// A deliberate ordinary viewpoint looking away from that old encounter. No animal or event is rewritten.
historic.setPresentation({ quality: 'low', effects: 'low', camera: {
    position: [point.x, Math.max(point.y + 6, world.waterLevel + 6), point.z + 20],
    target: [point.x, point.y + 6, point.z + 80],
} });
await writeFile(output + '/historical-sighting.json', historic.persist());
const report = { campaignSeed: 32, geographySeed: world.config.seed, worldId: state.wildlife.worldId,
    eventId: event.id, species: event.details.speciesId, instanceId: event.details.wildlifeInstanceId,
    time: state.time, witnesses: event.details.witnessPersonaIds, camera,
    setup: 'QA-only initial 5000 Food and quiet demography; actual paid group, route and canonical sighting. No spawned or repositioned animal.',
    coreUnchangedByViewCapture: true };
await writeFile(output + '/fixture-manifest.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
