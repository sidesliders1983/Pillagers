import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

test('the cultural asset contract accepts exact prepared bytes and rejects a valid-container payload substitution', async () => {
    const { validateCulturalAudio } = await import('../scripts/audio/culture/validate.mjs');
    const source = resolve('public/game-assets/audio/culture');
    const result = validateCulturalAudio(source);
    assert.equal(result.assets, 2);
    assert.equal(result.preparedBytes, 240088);
    const root = resolve('scratch/cultural-audio-tests');
    mkdirSync(root, { recursive: true });
    assert.equal(realpathSync(root), root, 'The fixture root is a real project scratch directory');
    const temporary = mkdtempSync(join(root, 'case-'));
    try {
        for (const file of ['manifest.json', 'catalogue.json']) copyFileSync(join(source, file), join(temporary, file));
        const catalogue = JSON.parse(readFileSync(join(source, 'catalogue.json')));
        for (const entry of catalogue.entries)
            copyFileSync(join(source, entry.prepared.file), join(temporary, entry.prepared.file));
        const file = join(temporary, catalogue.entries[0].prepared.file);
        const changed = readFileSync(file);
        changed[changed.length - 3] ^= 1;
        writeFileSync(file, changed);
        assert.throws(() => validateCulturalAudio(temporary), /identity|hash/i,
            'A still-valid WAV container must not hide changed source content');
    } finally {
        const target = realpathSync(temporary);
        assert.equal(dirname(target), root, 'Delete only this verified owned scratch fixture');
        rmSync(target, { recursive: true });
    }
});
