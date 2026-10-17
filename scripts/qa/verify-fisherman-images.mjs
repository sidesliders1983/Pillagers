import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + '/package.json');
const sharp = require('sharp');
const {rasterize} = await import('../characters/outfit-grid-raster.mjs');
const pass = root + '/output/meshy-outfit-pipeline/pass-009';
const reviewId = process.argv[2] ?? 'image-review-002';
assert.match(reviewId, /^image-review-\d{3}$/);
const directory = pass + '/' + reviewId;
const {checkFishermanUpperGrid} = await import('../characters/fisherman-upper-grid.mjs');
const manifest = JSON.parse(await readFile(directory + '/review-manifest.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const record of manifest.records) {
    if (reviewId !== 'image-review-002' && record.part === 'tunic' && record.qualityView) checkFishermanUpperGrid(record.grid);
    const original = await readFile(pass + '/' + (record.originalPath ?? 'imagegen/' + record.part + '/original.png'));
    assert.equal(hash(original), record.originalSha256);
    const filename = directory + '/' + record.part + '/' + record.view;
    const component = await readFile(filename + '-component.png');
    const fitted = await readFile(filename + '-fitted.png');
    assert.equal(hash(component), record.componentSha256);
    assert.equal(hash(fitted), record.fittedSha256);
    const expected = await sharp(original).extract(record.crop).ensureAlpha().raw().toBuffer();
    const actual = await sharp(component).ensureAlpha().raw().toBuffer();
    assert.ok(expected.equals(actual), 'Component crop must preserve original pixels');
    for (const grid of [record.grid]) for (const corners of grid.triangles) {
        for (const points of [grid.source, grid.target]) {
            const [a, b, c] = corners.map(index => points[index]);
            assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0);
        }
    }
}
assert.equal(manifest.records.filter(record => record.qualityView).length, 12);
assert.ok(manifest.records.filter(record => record.qualityView).every(record => record.status === 'image-coverage-pass'));
const first = manifest.records[0];
const component = await sharp(directory + '/' + first.part + '/' + first.view + '-component.png')
    .ensureAlpha().raw().toBuffer({resolveWithObject: true});
for (const field of ['source', 'target']) {
    const folded = structuredClone(first.grid);
    [folded[field][0], folded[field][1]] = [folded[field][1], folded[field][0]];
    assert.throws(() => rasterize(component, folded, 1024), /Folded/);
}
const {chromium} = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({channel: 'msedge', headless: true});
const errors = [];
try {
    const page = await browser.newPage({viewport: {width: 1100, height: 950}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());});
    await page.goto('http://127.0.0.1:5195/output/meshy-outfit-pipeline/pass-009/' + reviewId + '/index.html');
    await page.locator('#preview[data-ready="true"]').waitFor();
    for (const view of ['left', 'right', 'back', 'front']) {
        await page.locator('#view').selectOption(view);
        await page.locator('#layer').selectOption('tunic');
        await page.locator('#opacity').fill('0.65');
        await page.locator('#layer').selectOption('all');
    }
    await page.locator('#opacity').fill('1');
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: directory + '/browser-mobile.png', fullPage: true});
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('body').getAttribute('data-error'), null);
} finally {await browser.close();}
const report = {status: 'passed', originalPixelCrops: 15, positiveSourceAndTargetGrids: 15,
    foldNegativeControls: 2, cardinalCoverageChecks: 12, browserErrors: errors,
    qualification: 'Image-stage and review UI checks only. The revised images have not been sent to Meshy. This report does not certify 3D fitting or animation.'};
await writeFile(directory + '/verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
