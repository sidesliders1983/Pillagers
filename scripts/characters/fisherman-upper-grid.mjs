import assert from 'node:assert/strict';
/** Reject peak-based upper-row expansion in this close-neck tunic workflow. */
export function checkFishermanUpperGrid(grid) {
    assert.equal(grid.source.length, 25);
    assert.equal(grid.target.length, 25);
    const width = (points, row) => points[row * 5 + 4][0] - points[row * 5][0];
    const topScale = width(grid.target, 0) / width(grid.source, 0);
    const chestScale = width(grid.target, 1) / width(grid.source, 1);
    const ratio = topScale / chestScale;
    assert.ok(Number.isFinite(ratio) && ratio > 0 && ratio <= 1.35, 'Upper grid expands a partial neckline/shoulder peak beyond the torso scale.');
    return { upperToTorsoScale: ratio, maximum: 1.35,
        qualification: '2D extrapolation guard only; actual 3D collar contact remains mandatory.' };
}
