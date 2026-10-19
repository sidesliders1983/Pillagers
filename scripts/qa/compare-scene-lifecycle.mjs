import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const beforePath = process.argv[2] || 'artifacts/scene-lifecycle/before';
const afterPath = process.argv[3] || 'artifacts/scene-lifecycle/after';
const before = JSON.parse(await readFile(beforePath + '/results.json', 'utf8'));
const after = JSON.parse(await readFile(afterPath + '/results.json', 'utf8'));
assert.equal(before.status, 'PASS');
assert.equal(after.status, 'PASS');
assert.equal(after.selection ?? null, before.selection ?? null, 'Matched selection');
const pairs = [];
for (const original of before.cases) {
    const current = after.cases.find(item => item.name === original.name);
    assert.ok(current, 'Missing matched campaign: ' + original.name);
    assert.equal(current.fixtureSha256, original.fixtureSha256);
    const a = original.captures[0], b = current.captures[0];
    assert.equal(b.cardSha256 ?? null, a.cardSha256 ?? null, 'Matched selected-card markup');
    assert.equal(b.canonicalSha256, a.canonicalSha256, 'Exact Core/RNG/history/discovery: ' + original.name);
    assert.equal(b.blueprintSha256, a.blueprintSha256, 'Authoritative geography: ' + original.name);
    const { servedSource: beforeSource, ...beforeState } = a.state;
    const { servedSource: afterSource, ...afterState } = b.state;
    assert.deepEqual(afterState, beforeState, 'Actors, native appearance, camera, season, lighting and render resources');
    assert.equal(b.pixelsSha256, a.pixelsSha256, 'Matched fixed-time world pixels: ' + original.name);
    pairs.push({ name: original.name, canonicalSha256: b.canonicalSha256,
        blueprintSha256: b.blueprintSha256, pixelsSha256: b.pixelsSha256,
        renderer: b.state.renderer, beforeSource, afterSource });
}
const report = { status: 'PASS', pairs,
    note: 'Same Edge version, viewport, saved campaign, quality, camera and frozen presentation time. This does not claim cross-device pixel identity or an FPS gain.' };
await writeFile(afterPath + '/parity.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
