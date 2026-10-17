import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.QA_REVIEW_URL || 'http://127.0.0.1:5193/docs/qa/northern-lighting-180/review.html';
const output = process.env.QA_OUTPUT || 'artifacts/northern-lighting/gallery';
await mkdir(output, { recursive: true });
const report = { url, pairs: [], errors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1250 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#scene')?.options.length === 5);
    await page.addStyleTag({ content: '.tag, #divider { visibility: hidden !important; }' });
    // Compare native image pixels at 1:1. Fractional CSS downscaling can change Chromium's
    // bottom-edge interpolation when a clip creates a compositor layer, even at a full reveal.
    const dimensions = await page.locator('#selected').evaluate(async image => {
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
    });
    await page.addStyleTag({ content: `.comparison { width: ${dimensions.width + 2}px;
        height: ${dimensions.height + 2}px; aspect-ratio: auto !important; }` });
    const box = await page.locator('.comparison').boundingBox();
    await page.locator('.comparison').evaluate((element, box) => {
        element.style.left = `${Math.ceil(box.x) - box.x}px`;
        element.style.top = `${Math.ceil(box.y) - box.y}px`;
    }, box);
    const fixtures = await page.locator('#scene option').evaluateAll(options => options.map(option => option.value));
    const pixels = async () => sharp(await page.locator('#selected').screenshot()).raw().toBuffer();
    const settle = () => page.evaluate(() => Promise.all(['selected', 'refined'].map(async id => {
        const image = document.getElementById(id);
        await image.decode();
        if (!image.naturalWidth) throw new Error('Missing gallery image');
    })));
    for (const fixture of fixtures) for (const quality of ['standard', 'low']) {
        await page.selectOption('#scene', fixture);
        await page.selectOption('#quality', quality);
        const subjects = await page.locator('#subject option').evaluateAll(options =>
            options.filter(option => !option.disabled).map(option => option.value));
        for (const subject of subjects) {
            await page.selectOption('#subject', subject);
            await settle();
            await page.locator('#show-selected').click();
            assert.equal(await page.locator('#refined').evaluate(image => getComputedStyle(image).clipPath),
                'inset(0px 0px 0px 100%)');
            const selected = await pixels();
            await page.locator('#refined').evaluate(image => { image.style.visibility = 'hidden'; });
            assert.ok(selected.equals(await pixels()), 'Selected endpoint must equal selected image.');
            await page.locator('#refined').evaluate(image => { image.style.visibility = ''; });
            await page.locator('#show-refined').click();
            const refinedImage = await page.locator('#selected').screenshot();
            const refined = await sharp(refinedImage).raw().toBuffer();
            await page.locator('#refined').evaluate(image => { image.style.clipPath = 'none'; });
            const fullRefinedImage = await page.locator('#selected').screenshot();
            const fullRefined = await sharp(fullRefinedImage).raw().toBuffer();
            if (!refined.equals(fullRefined)) {
                await writeFile(output + '/endpoint-observed.png', refinedImage);
                await writeFile(output + '/endpoint-unclipped.png', fullRefinedImage);
            }
            assert.ok(refined.equals(fullRefined), 'Refined endpoint must equal refined image.');
            assert.ok(!selected.equals(refined), 'Both treatments must be visibly distinct.');
            await page.locator('#show-split').click();
            assert.equal(await page.locator('#refined').evaluate(image => getComputedStyle(image).clipPath),
                'inset(0px 0px 0px 50%)');
            report.pairs.push({ fixture, quality, subject, endpointPixels: 'PASS', midpointClip: 'PASS' });
        }
    }
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#scene')?.options.length === 5);
    await settle();
    await page.screenshot({ path: output + '/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await settle();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#show-refined').click();
    assert.match(await page.locator('#status').textContent(), /Showing refined Northern sun/);
    await page.screenshot({ path: output + '/phone.png', fullPage: true });
    report.phone = { width: 390, horizontalOverflow: false, endpointLabel: 'PASS' };
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
    console.log('PASS', report.pairs.length, 'gallery pairs, both endpoints, midpoint and phone layout.');
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    throw error;
} finally {
    await writeFile(output + '/gallery-check.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
