import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
async function filesIn(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ?
        filesIn(directory + '/' + entry.name) : directory + '/' + entry.name))).flat();
}
const output = 'docs/qa/livestock-integration-220';
const files = [...await filesIn('src'),
    ...await filesIn(output + '/checkpoints'), ...await filesIn(output + '/islands'),
    'scripts/qa/check-livestock-integration-220.mjs',
    'scripts/qa/livestock-transfer-replay.mjs',
    'scripts/qa/prepare-livestock-transfer-checkpoints.mjs',
    'scripts/qa/prepare-livestock-island-checkpoints.mjs',
    'scripts/qa/record-livestock-integration-evidence.mjs',
    'scripts/qa/exploration-integration.mjs',
    'scripts/qa/population-engine.mjs',
    'tests/livestock-management-220.test.mjs', 'tests/livestock-raid-fixture.mjs',
    'tests/livestock-raid-report-220.test.mjs',
    output + '/physical-integration.json', output + '/transfer-replay.json'];
const rows = await Promise.all(files.sort().map(async path => ({ path, sha256: hash(await readFile(path)) })));
await writeFile(output + '/source-manifest.json', JSON.stringify({
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    baseRevision: git('rev-parse', 'HEAD'),
    scope: 'Exact working source and bounded evidence; baseRevision precedes this integration commit.',
    sourceSetSha256: hash(JSON.stringify(rows)), files: rows,
}, null, 2) + '\n');
