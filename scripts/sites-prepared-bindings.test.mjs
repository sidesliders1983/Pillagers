import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { verifyPreparedBinding } from './sites-prepared-bindings.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
    const original = Buffer.from('{"weights":[0.25,0.75],"bone":"head"}');
    const prepared = gzipSync(original);
    const hash = digest(prepared);
    const entry = { originalPath: '/character-lab/modules/manual-beards/normal.binding.json',
        originalSha256: digest(original), originalBytes: original.length,
        path: '/game-assets/character-sources/' + hash.slice(0, 20) + '.bin',
        sha256: hash, bytes: prepared.length };
    const files = new Map([[entry.originalPath, original], [entry.path, prepared]]);
    const read = path => { assert.ok(files.has(path), 'Missing publication asset.'); return files.get(path); };
    const decode = async fetch => gunzipSync(Buffer.from(await (await fetch(entry.path + '?v=' + hash.slice(0, 12))).arrayBuffer()));
    return { entry, files, read, decode };
}

test('a published prepared binding reproduces the exact omitted JSON without reading the original URL', async () => {
    const f = fixture();
    assert.equal(await verifyPreparedBinding(f.entry, f.read, f.decode), f.entry.originalPath.slice(1));
});
test('a missing, corrupt or substituted prepared binding cannot remove the original publication', async () => {
    for (const damage of ['missing', 'corrupt', 'different bytes']) {
        const f = fixture();
        if (damage === 'missing') f.files.delete(f.entry.path);
        else if (damage === 'corrupt') f.files.set(f.entry.path, Buffer.from('broken'));
        else f.decode = async () => Buffer.from('{}');
        await assert.rejects(verifyPreparedBinding(f.entry, f.read, f.decode));
    }
});
test('a runtime that falls back to the omitted JSON fails publication', async () => {
    const f = fixture();
    await assert.rejects(verifyPreparedBinding(f.entry, f.read, async fetch =>
        (await fetch(f.entry.originalPath)).arrayBuffer()), /omitted binding/);
});
test('publication rejects stale source identities and paths outside the reviewed binding directories', async () => {
    for (const change of [{ originalSha256: '0'.repeat(64) }, { originalPath: '/other/binding.json' },
        { originalPath: '/character-lab/modules/../secret.binding.json' }]) {
        const f = fixture();
        await assert.rejects(verifyPreparedBinding({ ...f.entry, ...change }, f.read, f.decode));
    }
});
