import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const { characterSync, characterAsync } = load('../src/characters/CharacterPreparation.ts');

test('character spans distinguish synchronous operations from async waiting without changing results or errors', async () => {
    const samples = [], observe = sample => samples.push(sample);
    const value = { body: 'owned' }, failure = new Error('Asset failed');
    assert.equal(characterSync(observe, 'body', () => value), value);
    assert.equal(await characterAsync(observe, 'binding', async () => value), value);
    assert.throws(() => characterSync(observe, 'fit', () => { throw failure; }), error => error === failure);
    await assert.rejects(characterAsync(observe, 'fetch', async () => { throw failure; }), error => error === failure);
    assert.deepEqual(samples.map(sample => [sample.mode, sample.outcome]), [
        ['synchronous', 'complete'], ['async-inclusive', 'complete'],
        ['synchronous', 'failed'], ['async-inclusive', 'failed'],
    ]);
    assert.ok(samples.every(sample => sample.durationMs >= 0));
    assert.equal(characterSync(undefined, 'disabled', () => value), value);
});
