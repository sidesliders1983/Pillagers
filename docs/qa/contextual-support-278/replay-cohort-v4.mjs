import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { directory, readJSON, runCase, sourceIdentity } from './cohort-v4.mjs';

const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(['--selected', '--all'].includes(mode));
const manifest = readJSON(join(directory, 'manifest-v4.json'));
const summary = readJSON(join(directory, 'summary-v4.json'));
const before = sourceIdentity();
before.head = manifest.identity.source.head;
assert.deepEqual(before, manifest.identity.source);
const original = JSON.parse(gunzipSync(readFileSync(join(directory, 'raw-v4.json.gz'))).toString('utf8'));
const seeds = mode === '--all' ? Array.from({ length: summary.phase }, (_, index) => index + 1) :
    [summary.representative.seed];
let campaigns = 0;
for (const seed of seeds) for (const arm of ['disabled', 'enabled']) {
    const expected = original.find(item => item.seed === seed && item.arm === arm);
    assert.ok(expected);
    assert.deepEqual(runCase(seed, arm), expected,
        'Public command replay must reproduce rules, costs, events, observations and endpoint exactly.');
    campaigns++;
    console.log(JSON.stringify({ seed, arm, status: 'exact-public-command-replay-matched' }));
}
const after = sourceIdentity();
after.head = manifest.identity.source.head;
assert.deepEqual(after, before);
console.log(JSON.stringify({ status: 'cohort-replay-matched', campaigns }));

