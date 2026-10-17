import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkFishermanUpperGrid} from '../scripts/characters/fisherman-upper-grid.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/clothing/fisherman-upper-grid.json', import.meta.url)));

test('rejects the previously approved side-view grid that almost doubled the upper scale', () => {
    assert.throws(() => checkFishermanUpperGrid(fixture.rejected.grid), /partial neckline/);
});

test('accepts the revised registered upper contour without extrapolation', () => {
    const report = checkFishermanUpperGrid(fixture.revised.grid);
    assert.ok(report.upperToTorsoScale <= report.maximum);
});
