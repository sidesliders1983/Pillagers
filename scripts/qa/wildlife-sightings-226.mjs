import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const core = load('simulation/SimulationCore');
const { SharedSettlement } = load('play/SharedSettlement');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const { currentIslandVersion } = load('fjord-play/CampaignIsland');
const { WildlifeHistoryIndex } = load('lore/WildlifeHistory');
const { readWildlifeDiscoveries } = load('lore/WildlifeAttention');
const reads = owner => readWildlifeDiscoveries(owner.session.readSnapshot(), owner.fjord.attentionSave());
const { stepWildlifeSightings } = load('simulation/WildlifeSightings');
const { geographyIdentity } = load('fjord-play/FjordProjection');
const output = 'scratch/wildlife-sightings-226';
await mkdir(output, { recursive: true });
const session = new GameplaySession(32);
// Explicit funded QA opening; real terrain, actors, routes and commands remain authoritative.
session.loadJSON(core.serializeState(core.createCampaign(32, { initialFood: 5000 },
    { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
    { enabled: false }, {}, { enabled: false })));
const owner = new SharedSettlement(session, undefined, false, currentIslandVersion);
owner.fjord.enableDiscovery();
assert.ok(session.readSnapshot().wildlife);
const old = JSON.parse(owner.persist());
delete old.fjord.campaign.wildlife; delete old.fjord.narrative;
await writeFile(output + '/legacy.json', JSON.stringify(old));
session.command({ type: 'CreateExpeditionGroup', name: 'Coast watch', memberIds: ['founder-1', 'founder-2'] });
session.command({ type: 'StartExpedition', groupId: 'group-1' });
const actors = session.snapshot().wildlife.actors;
let target;
for (const actor of actors.filter(actor => actor.id.includes('grounded'))) {
    const point = { x: actor.position.x, z: actor.position.z };
    try { session.exploreOffer('group-1', point); target = point; break; } catch {}
}
assert.ok(target, 'A real grounded gull must have a reachable nearby position');
session.command({ type: 'ExploreArea', groupId: 'group-1', target });
const ticks = [];
for (let batch = 0; batch < 30 && !session.wildlifeHistory().summaries().length; batch++) {
    const start = performance.now();
    session.command({ type: 'AdvanceTicks', ticks: 5 });
    ticks.push(performance.now() - start);
}
const summaries = session.wildlifeHistory().summaries();
assert.ok(summaries.length, 'Confirmed physical travel must produce a real sighting');
session.setRunning(false);
await writeFile(output + '/unread.json', owner.persist());
const event = summaries[0].first;
const before = session.saveJSON();
owner.fjord.markAttentionRead([event.eventId]);
assert.equal(session.saveJSON(), before, 'Reading is presentation only');
assert.equal(session.wildlifeHistory().unread(reads(owner)).length, summaries.length - 1);
const restored = SharedSettlement.restore(owner.persist(), 'fjord');
assert.deepEqual(reads(restored), [event.eventId]);
assert.deepEqual(restored.session.snapshot(), session.snapshot());
await writeFile(output + '/read.json', restored.persist());
restored.restart(true);
assert.deepEqual(reads(restored), []);
assert.equal(restored.session.snapshot().wildlife, undefined);
const historical = Array.from({ length: 100000 }, (_, i) => ({ ...event, id: 'event-' + (i + 1),
    type: i % 20 ? 'RoutineFixture' : 'WildlifeSighted', details: { ...event.sighting,
        people: event.people, firstForClan: i === 0 } }));
const index = new WildlifeHistoryIndex(), indexStart = performance.now();
index.append(historical, session.readSnapshot().clan.id);
const buildMs = performance.now() - indexStart, repeatedStart = performance.now();
for (let i = 0; i < 1000; i++) { index.append(historical, session.readSnapshot().clan.id); index.unread([]); }
const repeatedMs = performance.now() - repeatedStart;
assert.equal(index.inspect().examined, 100000);
assert.equal(index.species(event.sighting.speciesId).encounters.length, 20);
const world = owner.fjord.blueprint, context = { world, wildlifeWorld: world, worldId: geographyIdentity(world) };
const probe = session.snapshot(), mission = Object.values(probe.world.spatial.missions)[0];
// Synthetic upper-bound workload, not a valid multi-group campaign: repeat one confirmed route.
const missions = Array.from({ length: 16 }, (_, i) => ({ ...structuredClone(mission), groupId: 'profile-' + i,
    memberIds: i === 15 ? ['founder-1', 'founder-2'] : ['founder-1', 'founder-2', 'founder-3', 'founder-4'] }));
const scans = [];
for (let i = 0; i < 25; i++) {
    probe.time.tick++;
    const start = performance.now(), counters = stepWildlifeSightings(probe, context, missions);
    if (counters) scans.push({ ...counters, ms: performance.now() - start });
}
assert.ok(scans.every(scan => scan.observersIndexed === 62));
assert.ok(scans.every(scan => scan.candidateChecks < scan.animalsIndexed * 62));
const report = { seed: 32, time: session.readSnapshot().time, sightings: summaries.map(item => ({ species: item.speciesId,
    event: item.first.eventId, witnesses: item.first.sighting.witnessPersonaIds })),
    realCommandBatches: { ticksPerBatch: 5, count: ticks.length, maximumMs: Math.max(...ticks) },
    syntheticSpatialProbe: { description: '16 route copies, 62 observers; stress instrumentation, not a canonical campaign', scans },
    index: { ...index.inspect(), buildMs, thousandRepeatedReadsMs: repeatedMs, pageLimit: 20 },
    attention: { contract: '#216 shared bounded metadata', wildlifeRecords: owner.fjord.attentionView().records.filter(record => record.canonicalType === 'WildlifeSighted').length,
        metadataBytes: Buffer.byteLength(JSON.stringify(owner.fjord.attentionSave())) },
    persistence: { exactRoundTrip: true, readIsNoncanonical: true, restartClearsReads: true } };
await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
