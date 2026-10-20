import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const load = name => loadTypeScript(new URL('../../src/' + name + '.ts', import.meta.url));
const core = load('simulation/SimulationCore');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const { SharedSettlement } = load('play/SharedSettlement');
const { currentIslandVersion } = load('fjord-play/CampaignIsland');
const { AttentionHistoryIndex } = load('lore/AttentionHistory');
const output = 'scratch/attention-216';
await mkdir(output, { recursive: true });
const session = new GameplaySession(32);
// Explicit funded QA fixture; births and expedition facts still come from actual Core commands.
session.loadJSON(core.serializeState(core.createCampaign(32, { initialFood: 10000, initialMaterials: 1000 },
    { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 10000, childcareWinters: 0,
        partnershipChanceBps: 10000 }, { enabled: false }, {}, { enabled: false })));
const owner = new SharedSettlement(session, undefined, false, currentIslandVersion);
session.command({ type: 'AdvanceTicks', ticks: 3000 });
session.setRunning(false);
const records = owner.fjord.attentionView().records;
assert.ok(records.some(record => record.canonicalType === 'ChildBorn' && !record.read));
await writeFile(output + '/unread.json', owner.persist());
const canonical = session.saveJSON();
owner.fjord.markAllAttentionRead();
assert.equal(session.saveJSON(), canonical);
const restored = SharedSettlement.restore(owner.persist(), 'fjord');
assert.deepEqual(restored.fjord.attentionSave(), owner.fjord.attentionSave());
assert.deepEqual(restored.session.snapshot(), session.snapshot());
await writeFile(output + '/read.json', restored.persist());
const birth = session.readSnapshot().events.find(event => event.type === 'ChildBorn');
const events = Array.from({ length: 100000 }, (_, index) => ({ ...birth, id: 'event-' + (index + 1),
    type: index % 20 ? 'UnsupportedProfileFixture' : 'ChildBorn' }));
const index = new AttentionHistoryIndex();
const started = performance.now(); index.append(events);
const initialBuildMs = performance.now() - started;
const repeated = performance.now();
for (let read = 0; read < 1000; read++) { index.append(events); index.retained(); }
const thousandRepeatedReadsMs = performance.now() - repeated;
const older = index.chroniclePage(events, 1000);
assert.equal(index.inspect().examined, 100000);
assert.ok(older.nextBefore >= 800);
const cached = performance.now();
for (let read = 0; read < 1000; read++) owner.fjord.attentionView();
const report = { fixture: { seed: 32, time: session.readSnapshot().time, sourceEvents: session.readSnapshot().events.length,
    notifications: records.length, realBirths: records.filter(record => record.canonicalType === 'ChildBorn').length },
    syntheticHistory: { ...index.inspect(), initialBuildMs, thousandRepeatedReadsMs,
        description: '100,000 source records; every twentieth is a copy of one real birth. Not a canonical campaign.',
        olderPageExamined: 1000 - older.nextBefore, olderPageRecords: older.records.length },
    currentCampaign: { thousandCachedViewReadsMs: performance.now() - cached,
        metadataBytes: Buffer.byteLength(JSON.stringify(owner.fjord.attentionSave())) },
    persistence: { exactCoreRoundTrip: true, exactReadRoundTrip: true, markReadDoesNotChangeCore: true } };
await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
