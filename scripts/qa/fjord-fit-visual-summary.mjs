import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const root = process.argv[2] || 'docs/qa/fjord-runtime-improvements/170/visual';
const data = JSON.parse(await readFile(root + '/captures.json', 'utf8'));
assert.deepEqual(data.errors, []);
assert.equal(data.captures.length, 44);
assert.equal(data.worldChecks.length, 2);
const [beforeWorld, afterWorld] = ['before', 'after'].map(variant =>
    data.worldChecks.find(row => row.variant === variant));
assert.equal(beforeWorld.reload.canonicalSha256, afterWorld.reload.canonicalSha256);
for (const row of data.worldChecks) {
    assert.equal(row.reload.canonicalEqual, true);
    assert.equal(row.disposed, true);
    assert.equal(row.distinctReappearance, true);
    assert.equal(row.canonicalUnchangedByRemoval, true);
    assert.deepEqual(row.placeholders, []);
}
const comparisons = [];
for (const before of data.captures.filter(row => row.variant === 'before')) {
    const name = before.path.slice('before-'.length);
    const after = data.captures.find(row => row.path === 'after-' + name);
    assert.ok(after, name);
    for (const field of ['spec', 'view', 'mobile', 'age', 'profile', 'selected', 'draw', 'memory', 'modules', 'source', 'hitCount'])
        assert.deepEqual(before[field], after[field], name + ': ' + field);
    let boundsError = 0;
    for (const end of ['min', 'max']) for (let axis = 0; axis < 3; axis++)
        boundsError = Math.max(boundsError, Math.abs(before.bounds[end][axis] - after.bounds[end][axis]));
    assert.ok(boundsError < 1e-6, name + ': bounds');
    assert.ok(Math.abs(before.firstHit - after.firstHit) < 1e-6, name + ': actual mesh ray');
    const b = await sharp(root + '/' + before.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const a = await sharp(root + '/' + after.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(b.info, a.info);
    let changedPixels = 0, absoluteDifference = 0, maximumChannelDifference = 0;
    for (let pixel = 0; pixel < b.info.width * b.info.height; pixel++) {
        let changed = false;
        for (let channel = 0; channel < b.info.channels; channel++) {
            const index = pixel * b.info.channels + channel;
            const difference = Math.abs(b.data[index] - a.data[index]);
            changed ||= difference > 0;
            absoluteDifference += difference;
            maximumChannelDifference = Math.max(maximumChannelDifference, difference);
        }
        if (changed) changedPixels++;
    }
    comparisons.push({ name, before: before.path, after: after.path, width: b.info.width, height: b.info.height,
        changedPixels, changedFraction: changedPixels / (b.info.width * b.info.height),
        maximumChannelDifference, meanAbsoluteChannelDifference: absoluteDifference / b.data.length,
        boundsError, rayDistanceError: Math.abs(before.firstHit - after.firstHit),
        equalProfileSelectedAssetsModulesDrawAndMemory: true });
}
const harnessSha256 = {};
for (const path of ['scripts/qa/fjord-fit-stage.mjs', 'scripts/qa/fjord-fit-visual.mjs'])
    harnessSha256[path] = createHash('sha256').update(await readFile(path)).digest('hex');
const summary = { harnessSha256, pairs: comparisons.length, exactPixelPairs: comparisons.filter(row => row.changedPixels === 0).length,
    comparisons, worldChecks: data.worldChecks,
    note: 'Fixed authored assets, pose, camera and lighting. This comparison measures raster and metadata differences; actual side-by-side human inspection remains required for garment fidelity. Mobile is a viewport, not physical hardware.' };
await writeFile(root + '/comparison.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ pairs: summary.pairs, exactPixelPairs: summary.exactPixelPairs,
    maxChangedFraction: Math.max(...comparisons.map(row => row.changedFraction)),
    maxBoundsError: Math.max(...comparisons.map(row => row.boundsError)) }));
