import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';

const study = process.argv[2];
if (!study) throw new Error('Pass the existing livestock-overlap-study worktree path. No study is rerun.');
const root = resolve(study), frozen = '37e8ba72e2b0127806097a886966758df1991998';
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
assert.equal(git(['status', '--porcelain', '--', 'src']), '', 'Study runtime has uncommitted changes');
assert.equal(git(['rev-parse', 'HEAD:src']), git(['rev-parse', frozen + ':src']), 'Study runtime differs from the frozen base');
const core = loadTypeScript(pathToFileURL(resolve(root, 'src/simulation/SimulationCore.ts')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = resolve(root, 'docs/qa/livestock-overlap-study/coupling-v3');
const manifestBytes = await readFile(resolve(directory, 'coupling.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.rows.length, 60);
const fixtureSource = await readFile(resolve(root, 'tests/island-missions.test.mjs'), 'utf8');
const literal = fixtureSource.slice(fixtureSource.indexOf('const bounds ='), fixtureSource.indexOf('\nconst context ='));
const world = new Function(literal + '\nreturn world;')();
const context = { world, worldId: 'existing-island-missions-coupling-fixture' };
const output = 'docs/qa/livestock-integration-220/checkpoints';
await mkdir(output, { recursive: true });
const rows = [];

for (const species of ['cattle', 'chicken', 'pig', 'sheep', 'goat', 'goose']) {
    const row = manifest.rows.find(row => row.captured.some(animal => animal.species === species));
    assert.ok(row, 'The original evidence must contain an actual capture for ' + species);
    const archived = await readFile(resolve(directory, row.file));
    assert.equal(hash(archived), row.sha256);
    const original = JSON.parse(gunzipSync(archived));
    let state = core.reconstructState(JSON.stringify(original.initial));
    for (const record of original.domesticCommands) {
        if (record.accepted === false || record.changed === false) continue;
        const { winter, accepted, changed, ...command } = record;
        state = core.applyCommand(state, command);
    }
    let checkpoint, remainingTicks;
    for (const step of original.actions) {
        state = core.applyCommand(state, step.action, context);
        assert.deepEqual(state.time, step.at, 'Recorded post-command time must reproduce exactly');
        const mission = Object.values(state.world.spatial?.missions ?? {}).at(-1);
        if (step.action.type === 'AdvanceTicks' && mission?.task?.type === 'Pillage' && !mission.task.result) {
            checkpoint = state;
            remainingTicks = mission.departedAt + mission.task.duration -
                (state.time.winter * state.ticksPerWinter + state.time.tick);
            break;
        }
    }
    assert.ok(checkpoint && Number.isSafeInteger(remainingTicks));
    const expected = core.applyCommand(checkpoint, { type: 'AdvanceTicks', ticks: remainingTicks }, context);
    const missionId = Object.keys(expected.world.spatial.missions).at(-1);
    assert.deepEqual(expected.world.spatial.missions[missionId].task.result.cattleIds, original.raid.cattleIds);
    const clanFacts = clan => ({ animals: clan.landing.cattle, archives: clan.landing.cattleArchive,
        stocks: clan.stocks, rngState: clan.rngState, time: clan.time });
    const packet = { version: 1, species, context, checkpoint, remainingTicks, missionId,
        expected: { result: expected.world.spatial.missions[missionId].task.result,
            player: clanFacts(expected), donor: clanFacts(expected.world.targetClans['island-rival']) } };
    const bytes = gzipSync(Buffer.from(JSON.stringify(packet)));
    const file = species + '.json.gz';
    await writeFile(output + '/' + file, bytes);
    rows.push({ species, file, sha256: hash(bytes), originalFile: row.file, originalSha256: row.sha256,
        seed: row.seed, overlap: row.overlap, remainingTicks, capturedIds: original.raid.cattleIds });
    console.log(JSON.stringify(rows.at(-1)));
}
await writeFile(output + '/manifest.json', JSON.stringify({
    frozenStudyRevision: '05e8d8afc4599479d664782c8f6364f0a18f03ac', runtimeRevision: frozen,
    studyHead: git(['rev-parse', 'HEAD']), originalManifestSha256: hash(manifestBytes),
    originalCases: 60, originalCasesWithCapture: manifest.rows.filter(row => row.captured.length).length,
    purpose: 'Six source-pinned paid mid-raid saves; no controller, matrix, new success rolls or production override', rows,
}, null, 2) + '\n');
