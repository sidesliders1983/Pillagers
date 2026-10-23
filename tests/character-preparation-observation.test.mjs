import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('disabled character diagnostics do not emit spans and preserve synchronous/async results', async () => {
    const { characterSync, characterAsync } = load('../src/characters/CharacterPreparation.ts');
    const samples = [];
    let enabled = false;
    const observer = sample => samples.push(sample);
    observer.enabled = () => enabled;
    assert.equal(characterSync(observer, 'fit', () => 7), 7);
    assert.equal(await characterAsync(observer, 'load', async () => 8), 8);
    assert.equal(samples.length, 0);
    enabled = true;
    assert.equal(characterSync(observer, 'fit', () => 9), 9);
    assert.equal(samples.length, 1);
    assert.equal(samples[0].mode, 'synchronous');
});
