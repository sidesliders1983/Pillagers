import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = fileURLToPath(new URL('./', import.meta.url));
const readJSON = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const digest = value => createHash('sha256').update(value).digest('hex');
const normalized = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
const compatibility = readJSON(join(directory, 'portable-compatibility-v1.json'));
let sources = 0;
for (const path of ['manifest-v4.json', 'review-manifest-v1.json']) {
    const source = readJSON(join(directory, path)).identity.source;
    assert.equal(digest(JSON.stringify(source.portableFiles)), source.portableFingerprint);
    for (const [file, sha256] of Object.entries(source.portableFiles)) {
        assert.equal(digest(normalized(readFileSync(join(root, file)))), sha256,
            'Normalized source differs: ' + file);
        sources++;
    }
}
for (const artifact of compatibility.artifacts) {
    const bytes = readFileSync(join(directory, artifact.path));
    assert.equal(digest(artifact.binary ? bytes : normalized(bytes)), artifact.sha256,
        'Portable artifact differs: ' + artifact.path);
}
console.log(JSON.stringify({
    status: 'portable-source-and-artifacts-compatible',
    sourceChecks: sources, artifacts: compatibility.artifacts.length,
    scope: 'LF-normalized source/text and exact binary hashes only; no new simulation or rendered acceptance.',
}));

