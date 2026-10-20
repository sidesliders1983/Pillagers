import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';
import { replayLivestockTransfers } from './livestock-transfer-replay.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { createCampaignIsland } = loadTypeScript(new URL('../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const output = 'docs/qa/livestock-integration-220';
await mkdir(output, { recursive: true });
await writeFile(output + '/transfer-replay.json', JSON.stringify(await replayLivestockTransfers(), null, 2) + '\n');
const rows = [];
for (const island of [7, 18]) {
    const bytes = await readFile(output + '/islands/' + island + '.json.gz');
    const packet = JSON.parse(gunzipSync(bytes));
    const world = createCampaignIsland(packet.seed, packet.recipe);
    assert.equal(hash(world.terrain), packet.terrainHash);
    assert.equal(hash(world.navigation), packet.navigationHash);
    const context = { world, worldId: packet.state.world.island.worldId, exclusions: packet.exclusions };
    const initial = core.reconstructState(JSON.stringify(packet.state));
    const before = core.serializeState(initial), command = packet.command;
    const row = { island, checkpointSha256: hash(bytes), source: packet.originalFile,
        sourceSha256: packet.originalSha256, protocolHash: packet.originalProtocolHash,
        historicalExploreFood: packet.historicalExploreFood,
        mappedSite: core.inspectIslandMissions(initial).sites.find(site => site.id === command.target.siteId),
        command, at: initial.time, startingFood: initial.stocks.food };
    assert.ok(row.mappedSite, 'An actual reported site is required; no rival coordinate bypass');
    // A separate ordinary-start probe on the saved ready group does not alter
    // the historical mission continuation or invent a new funding source.
    try {
        const offer = core.startExpeditionOffer(initial, command.groupId, context);
        const prepared = core.applyCommand(initial, { type: 'StartExpedition', groupId: command.groupId }, context);
        const mission = Object.values(prepared.world.spatial.missions).at(-1);
        assert.equal(offer.foodPerMember, 8);
        assert.equal(offer.activeTicks, 2000);
        assert.equal(mission.provisions.testCapacity, undefined);
        assert.equal(initial.stocks.food - prepared.stocks.food, 8 * offer.members);
        row.newOrdinaryOffer = { status: 'accepted', ...offer };
    } catch (error) {
        assert.match(error.message, /needs .*Food/);
        row.newOrdinaryOffer = { status: 'insufficient-food', message: error.message };
    }
    assert.equal(core.serializeState(initial), before);
    let offer;
    try { offer = core.islandMissionOffer(initial, command.groupId, command.target,
        command.mission, command.priorities ?? [], context); }
    catch (error) {
        row.refusal = error.message;
        assert.equal(island, 18);
        assert.match(row.refusal, /exploration search limit/);
        assert.equal(core.serializeState(initial), before);
        row.status = 'known-search-dependency';
    }
    if (offer) {
        assert.equal(island, 7);
        const departed = core.applyCommand(initial, command, context);
        const half = Math.floor(offer.duration / 2);
        const midpoint = core.applyCommand(departed, { type: 'AdvanceTicks', ticks: half }, context);
        const remainder = { type: 'AdvanceTicks', ticks: offer.duration - half };
        const final = core.applyCommand(midpoint, remainder, context);
        assert.deepEqual(core.applyCommand(core.reconstructState(core.serializeState(midpoint)), remainder, context), final);
        const missionId = Object.keys(final.world.spatial.missions).at(-1);
        const result = final.world.spatial.missions[missionId].task.result;
        row.status = 'returned-with-real-risk';
        row.offer = offer;
        row.result = result;
        row.receipts = core.inspectIslandMissionLivestock(final, missionId);
        row.exactMidRaidLoad = true;
        const shared = new SharedSettlement(packet.seed, undefined, true, packet.recipe.version, 'summer-800-v1');
        shared.session.loadJSON(core.serializeState(final));
        shared.fjord.project();
        await writeFile(output + '/islands/7-returned-campaign.json', shared.persist() + '\n');
    }
    rows.push(row);
    console.log(JSON.stringify(row));
    await writeFile(output + '/physical-integration.json', JSON.stringify({ status: 'PASS_WITH_KNOWN_DEPENDENCY', rows }, null, 2) + '\n');
}
