import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

if (!process.argv[2]) throw new Error('Pass the existing frozen livestock-overlap-study worktree.');
const root = resolve(process.argv[2]);
const moduleAt = file => import(pathToFileURL(resolve(root, 'scripts/qa/' + file)));
const { overlapCore } = await moduleAt('overlap-core.mjs');
const { overlapWorld } = await moduleAt('overlap-world.mjs');
const { livestockCandidate } = await moduleAt('livestock-candidates.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const absolute = state => state.time.winter * state.ticksPerWinter + state.time.tick;
const output = 'docs/qa/livestock-integration-220/islands';
await mkdir(output, { recursive: true });
const matrixDirectory = resolve(root, 'docs/qa/livestock-overlap-study/matrix-v1');
const manifest = JSON.parse(await readFile(resolve(matrixDirectory, 'manifest.json'), 'utf8'));
assert.equal(manifest.protocolHash, '6b8c3b5c6163422ede53189e47ddefc19d55a1ab4775584ffac5b1849fcb162e');

for (const seed of [1, 2]) {
    const filename = String(seed).padStart(2, '0') + '-cattle-C.json.gz';
    const archive = await readFile(resolve(matrixDirectory, filename));
    const source = manifest.rows.find(row => row.filename === filename);
    assert.equal(hash(archive), source.sha256);
    const original = JSON.parse(gunzipSync(archive));
    const { core } = overlapCore(seed, 'cattle', false);
    const landscape = overlapWorld(seed);
    const successfulStart = original.commands.find(record => record.action?.type === 'DispatchIslandMission' &&
        record.action.mission === 'Pillage');
    const refused = original.controller.attempts.find(attempt => attempt.kind === 'recon' &&
        attempt.outcome === 'refused' && /search limit/i.test(attempt.reason));
    const stopAt = seed === 1 ? successfulStart.at : refused.at;
    let state = core.createCampaign(seed, {}, {}, { enabled: true }, {}, { enabled: true }, {},
        'summer-800-v1', undefined, { player: livestockCandidate });
    state = core.initializeIslandClans(state, landscape.world, landscape.worldId);
    assert.equal(hash(core.serializeState(state)), original.initialStateHash);
    let context = landscape.context(state);
    function advanceTo(at) {
        while (absolute(state) < at) {
            const ticks = Math.min(at - absolute(state), 1000 - state.time.tick, 25);
            state = core.applyCommand(state, { type: 'AdvanceTicks', ticks }, context);
            if (state.time.tick === 0) context = landscape.context(state);
        }
    }
    for (const record of original.commands) {
        if (record.at > stopAt) break;
        advanceTo(record.at);
        if (record === successfulStart && seed === 1) break;
        const commands = record.type === 'FrozenHerdPolicy' ? record.commands : [record.action];
        for (const entry of commands) {
            if (!entry || entry.accepted === false || entry.changed === false) continue;
            const { winter, accepted, changed, ...command } = entry;
            state = core.applyCommand(state, command, context);
        }
        context = landscape.context(state);
    }
    advanceTo(stopAt);
    context = landscape.context(state);
    const site = core.inspectIslandMissions(state).sites[0];
    assert.ok(site, 'The saved real explorers must have sighted this site');
    const command = seed === 1 ? successfulStart.action : { type: 'DispatchIslandMission',
        groupId: original.controller.groupId, target: { kind: 'site', siteId: site.id }, mission: 'Recon' };
    let result;
    try {
        const offer = core.islandMissionOffer(state, command.groupId, command.target, command.mission,
            command.priorities ?? [], context);
        result = { accepted: true, offer };
    } catch (error) { result = { accepted: false, reason: error.message }; }
    if (seed === 1) assert.equal(result.accepted, true);
    else assert.match(result.reason, /exploration search limit/);
    const bytes = gzipSync(Buffer.from(JSON.stringify({ version: 1,
        originalFile: filename, originalSha256: source.sha256, originalProtocolHash: manifest.protocolHash,
        runtimeSourceHash: original.identity.sourceHash, recipe: landscape.identity.recipe,
        terrainHash: landscape.identity.terrainHash, navigationHash: landscape.identity.navigationHash,
        seed, state, command, expectedOffer: result, exclusions: context.exclusions,
        historicalExploreFood: 10, purpose: 'Two short handoff saves, not a new matrix or an eight-Food rerun' })));
    await writeFile(output + '/' + landscape.identity.recipe.seed + '.json.gz', bytes);
    console.log(JSON.stringify({ island: landscape.identity.recipe.seed, at: state.time,
        mappedSite: site, command, result, bytes: bytes.length, sha256: hash(bytes) }));
}
