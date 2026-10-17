import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = 'docs/qa/iceland-textures-180';
const evidence = JSON.parse(await readFile(root + '/observations.json', 'utf8'));
assert.equal(evidence.status, 'PASS');
const origin = process.env.QA_GALLERY_ORIGIN || 'http://127.0.0.1:5196/docs/qa/iceland-textures-180/';
const result = { version: 'iceland-gallery-check-v1', origin, pairs: [], errors: [] };
const hash = value => createHash('sha256').update(value).digest('hex');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', error => result.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
page.on('response', response => {
    if (response.status() >= 400) result.errors.push(`${response.status()} ${response.url()}`);
});
try {
    await page.goto(new URL('review.html', origin).href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#fixture').options.length === 3);
    for (const entry of evidence.cases) {
        await page.selectOption('#fixture', entry.fixture);
        await page.selectOption('#quality', entry.quality);
        for (const view of entry.views) {
            await page.selectOption('#view', view.id);
            await page.evaluate(async () => {
                await Promise.all(['current', 'candidate'].map(id => document.getElementById(id).decode()));
            });
            for (const [id, variant] of [['current', 'current-albedo'], ['candidate', 'iceland-albedo']]) {
                const file = view.variants.find(item => item.variant === variant).image;
                assert.ok((await page.locator('#' + id).getAttribute('src')).endsWith(file));
                const response = await page.request.get(new URL(file, origin).href);
                assert.ok(response.ok());
                assert.equal(hash(await response.body()), view.variants.find(item => item.variant === variant).jpegSha256);
            }
            const frame = page.locator('.frame');
            const endpointHashes = [];
            for (const endpoint of [0, 100]) {
                await page.locator('#wipe').evaluate((input, value) => {
                    input.value = String(value);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }, endpoint);
                const image = await frame.screenshot();
                const hidden = endpoint === 0 ? '#candidate' : '#current';
                await page.locator(hidden).evaluate(image => image.style.visibility = 'hidden');
                const expected = await frame.screenshot();
                await page.locator(hidden).evaluate(image => image.style.visibility = '');
                const actualPixels = await sharp(image).raw().toBuffer();
                const expectedPixels = await sharp(expected).raw().toBuffer();
                if (!actualPixels.equals(expectedPixels)) {
                    await writeFile('artifacts/iceland-textures/gallery-actual.png', image);
                    await writeFile('artifacts/iceland-textures/gallery-expected.png', expected);
                }
                assert.ok(actualPixels.equals(expectedPixels), `Slider ${endpoint}% must show the intended complete image: ${entry.fixture}/${entry.quality}/${view.id}.`);
                endpointHashes.push(hash(image));
            }
            assert.notEqual(...endpointHashes);
            await page.locator('#wipe').evaluate(input => {
                input.value = '50';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            assert.equal(await page.locator('#candidate').evaluate(image => getComputedStyle(image).clipPath), 'inset(0px 0px 0px 50%)');
            result.pairs.push({ fixture: entry.fixture, quality: entry.quality, view: view.id,
                endpointsMatch: true, midpoint: true, imageBytesMatch: true });
        }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.selectOption('#fixture', 'developed-810');
    await page.selectOption('#quality', 'standard');
    await page.selectOption('#view', 'settlement');
    await page.evaluate(async () => Promise.all(['current', 'candidate'].map(id => document.getElementById(id).decode())));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: root + '/gallery-phone.jpg', fullPage: true, type: 'jpeg', quality: 85 });
    result.phoneReview = { viewport: { width: 390, height: 844 }, noHorizontalOverflow: true };
    assert.deepEqual(result.errors, []);
    result.status = 'PASS';
} catch (error) {
    result.status = 'FAIL';
    result.failure = String(error);
    throw error;
} finally {
    await writeFile(root + '/gallery-check.json', JSON.stringify(result, null, 2) + '\n');
    await browser.close();
}
console.log('Gallery check:', result.status, result.pairs.length, 'pairs');
