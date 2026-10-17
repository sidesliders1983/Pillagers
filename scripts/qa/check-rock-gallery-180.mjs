import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const summitStudy = process.env.QA_STUDY === 'summit';
const root = summitStudy ? 'docs/qa/iceland-summit-snow-180' : 'docs/qa/iceland-rock-snow-180';
const evidence = JSON.parse(await readFile(root + '/observations.json', 'utf8'));
assert.equal(evidence.status, 'PASS');
const origin = process.env.QA_GALLERY_ORIGIN || 'http://127.0.0.1:5197/' + root + '/';
const result = { version: 'rock-gallery-check-v1', origin, pairs: [], errors: [] };
const hash = value => createHash('sha256').update(value).digest('hex');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', error => result.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) result.errors.push(`${response.status()} ${response.url()}`); });
try {
    await page.goto(new URL('review.html', origin).href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#fixture').options.length === 3);
    for (const entry of evidence.cases) {
        await page.selectOption('#fixture', entry.fixture);
        await page.selectOption('#quality', entry.quality);
        for (const view of entry.views) {
            if (!summitStudy) await page.selectOption('#view', view.id);
            await page.evaluate(async () => Promise.all(['current', 'candidate'].map(id => document.getElementById(id).decode())));
            for (const id of ['current', 'candidate']) {
                const variant = view.variants.find(item => item.variant === id);
                assert.ok((await page.locator('#' + id).getAttribute('src')).endsWith(variant.image));
                const response = await page.request.get(new URL(variant.image, origin).href);
                assert.ok(response.ok());
                assert.equal(hash(await response.body()), variant.jpegSha256);
            }
            const endpointHashes = [];
            for (const endpoint of [0, 100]) {
                await page.locator('#wipe').evaluate((input, value) => {
                    input.value = String(value);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }, endpoint);
                const actual = await sharp(await page.locator('.frame').screenshot()).raw().toBuffer();
                const hidden = endpoint === 0 ? '#candidate' : '#current';
                await page.locator(hidden).evaluate(image => image.style.visibility = 'hidden');
                const expected = await sharp(await page.locator('.frame').screenshot()).raw().toBuffer();
                await page.locator(hidden).evaluate(image => image.style.visibility = '');
                assert.ok(actual.equals(expected), `Slider ${endpoint}%: ${entry.fixture}/${entry.quality}/${view.id}`);
                endpointHashes.push(hash(actual));
            }
            if (view.id !== 'settlement') assert.notEqual(...endpointHashes);
            await page.locator('#wipe').evaluate(input => {
                input.value = '50';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            assert.equal(await page.locator('#candidate').evaluate(image => getComputedStyle(image).clipPath), 'inset(0px 0px 0px 50%)');
            result.pairs.push({ fixture: entry.fixture, quality: entry.quality, view: view.id,
                endpointsMatch: true, midpoint: true, imageBytesMatch: true,
                imagesDiffer: endpointHashes[0] !== endpointHashes[1] });
        }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.selectOption('#fixture', 'snow-811');
    await page.selectOption('#quality', 'standard');
    if (!summitStudy) await page.selectOption('#view', 'cliff');
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
console.log('Rock gallery check:', result.status, result.pairs.length, 'pairs');
