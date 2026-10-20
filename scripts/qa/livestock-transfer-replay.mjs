import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const directory = new URL('../../docs/qa/livestock-integration-220/checkpoints/', import.meta.url);
const clanFacts = clan => ({ animals: clan.landing.cattle, archives: clan.landing.cattleArchive,
    stocks: clan.stocks, rngState: clan.rngState, time: clan.time });
const tick = state => state.time.winter * state.ticksPerWinter + state.time.tick;

/** Six already-paid physical raids, using real risk, ownership, full world stepping and assignment commands. */
export async function replayLivestockTransfers() {
    const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
    const rows = [];
    for (const source of manifest.rows) {
        const bytes = await readFile(new URL(source.file, directory));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
        const packet = JSON.parse(gunzipSync(bytes));
        const { context, missionId } = packet;
        const initial = core.reconstructState(JSON.stringify(packet.checkpoint));
        for (const id of source.capturedIds) {
            assert.equal(initial.landing.cattle[id], undefined);
            assert.ok(initial.world.targetClans['island-rival'].landing.cattle[id]);
        }
        const beforeLastTick = core.applyCommand(initial,
            { type: 'AdvanceTicks', ticks: packet.remainingTicks - 1 }, context);
        for (const id of source.capturedIds) assert.equal(beforeLastTick.landing.cattle[id], undefined);
        const returned = core.applyCommand(beforeLastTick, { type: 'AdvanceTicks', ticks: 1 }, context);
        const uninterrupted = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: packet.remainingTicks }, context);
        assert.deepEqual(returned, uninterrupted, 'Tick batching cannot change the transfer');
        const reloaded = core.applyCommand(core.reconstructState(core.serializeState(beforeLastTick)),
            { type: 'AdvanceTicks', ticks: 1 }, context);
        assert.deepEqual(reloaded, returned, 'Exact mid-raid save/load parity on the integration head');
        const result = returned.world.spatial.missions[missionId].task.result;
        assert.deepEqual(result, packet.expected.result);
        assert.deepEqual(clanFacts(returned), packet.expected.player);
        assert.deepEqual(clanFacts(returned.world.targetClans['island-rival']), packet.expected.donor);
        const donor = returned.world.targetClans['island-rival'];
        let assigned = returned;
        const yard = core.landingSummary(returned).farmyards[0];
        assert.ok(yard, 'The original coupling fixture must retain its real Farmyard');
        const receipts = core.inspectIslandMissionLivestock(returned, missionId);
        for (const id of result.cattleIds) {
            assert.equal(donor.landing.cattle[id], undefined);
            assert.deepEqual(returned.landing.cattle[id], { ...donor.landing.cattleArchive[id], farmyardId: null });
            assert.ok(receipts.some(receipt => receipt.id === id && receipt.atReturn?.species === packet.species));
            assert.equal(returned.events.filter(event => event.type === 'ExpeditionReturned' &&
                event.details.cattleIds?.includes(id)).length, 1);
            assigned = core.applyCommand(assigned, { type: 'AssignLivestock', livestockId: id, farmyardId: yard.id });
        }
        const activeIds = [returned, donor].flatMap(clan => Object.keys(clan.landing.cattle));
        assert.equal(new Set(activeIds).size, activeIds.length, 'An immutable ID has one current owner');
        const names = Object.keys(returned.landing.cattle).map(id => core.inspectLivestock(returned, id).name);
        assert.equal(new Set(names).size, names.length);
        assert.deepEqual(core.reconstructState(core.serializeState(assigned)), assigned);
        const later = core.applyCommand(assigned, { type: 'AdvanceTicks', ticks: 10 }, context);
        assert.equal(tick(later.world.targetClans['island-rival']), tick(donor) + 10);
        rows.push({ species: packet.species, originalFile: source.originalFile,
            checkpointSha256: source.sha256, status: 'PASS', result, names,
            arrivedAt: returned.time, assignedYard: yard.id, exactMidRaidLoad: true,
            referenceAnimalsStocksRngAndClocksMatch: true, donorContinues: true,
            receipts: receipts.map(receipt => ({ id: receipt.id, atReturn: receipt.atReturn,
                currentBreedingAge: receipt.current?.breedingAge })) });
    }
    return { status: 'PASS', sourceManifest: manifest, rows };
}
