import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5196';
const beforeOrigin = process.env.QA_BEFORE_ORIGIN || 'http://127.0.0.1:5193';
const output = resolve(process.env.QA_OUTPUT || 'scratch/start-menu-315/browser');
await mkdir(join(output, 'temporary'), { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = join(output, 'temporary');
const browser = await chromium.launch({
    headless: true, chromiumSandbox: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
});
const report = {
    status: 'running', browser: browser.version(), headless: true, physicalDevice: false,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    cases: [], timings: [], errors: [],
};
const manifest = JSON.parse(await readFile('public/branding/fjordside/start/manifest.json', 'utf8'));
const fixture = resolve('docs/ux/player-menus-298/followup/campaign-before.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const contexts = [];
async function newPage(viewport = { width: 1440, height: 900 }, touch = false) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.setDefaultTimeout(15000);
    return page;
}
async function screenshot(page, name) {
    await page.screenshot({ path: join(output, name + '.jpg'), quality: 85 });
}
async function open(page, at = origin) {
    await page.goto(at + '/fjord-play', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'New game', exact: true }).waitFor();
}
async function noWorld(page) {
    assert.equal(await page.locator('canvas').count(), 0, 'Entry never creates a canvas');
    const worldRequests = await page.evaluate(() => performance.getEntriesByType('resource')
        .map(entry => entry.name).filter(url => /\/FjordPlay-|\.(glb|hdr)(\?|$)/.test(url)));
    assert.deepEqual(worldRequests, [], 'No game chunk/models/HDR before campaign choice');
}
async function layout(page) {
    const result = await page.evaluate(() => ({
        width: innerWidth, documentWidth: document.documentElement.scrollWidth,
        targets: [...document.querySelectorAll('#campaign-start button, #campaign-start summary')]
            .filter(node => node.checkVisibility()).map(node => ({
                name: node.getAttribute('aria-label') || node.textContent.trim(),
                height: node.getBoundingClientRect().height,
            })),
    }));
    assert.ok(result.documentWidth <= result.width, 'No horizontal overflow');
    assert.ok(result.targets.every(target => target.height >= 44), 'Visible buttons/disclosures are at least 44 CSS px');
    return result;
}
try {
    for (const [name, width, height, touch] of [
        ['desktop-1440', 1440, 900, false], ['desktop-1920', 1920, 1080, false],
        ['phone-portrait', 390, 844, true], ['phone-landscape', 852, 393, true], ['tablet', 1024, 768, true],
    ]) {
        const page = await newPage({ width, height }, touch);
        const images = [];
        const pending = [];
        page.on('response', response => {
            if (!response.url().endsWith('.webp') || !response.url().includes('/branding/fjordside/start/')) return;
            pending.push((async () => {
                const bytes = await response.body();
                images.push({ file: response.url().split('/').pop(), status: response.status(), bytes: bytes.length, sha256: hash(bytes) });
            })());
        });
        await open(page);
        await Promise.all(pending);
        await noWorld(page);
        assert.equal(await page.getByRole('button', { name: 'Continue campaign', exact: true }).isVisible(), false);
        assert.equal(await page.locator('.entry-menu-primary').getAttribute('aria-label'), 'New game');
        assert.equal(images.length, 1, 'One matching background is fetched');
        const expected = manifest.files.find(file => file.width === (width >= 1100 ? 2560 : 1280));
        assert.equal(images[0].sha256, expected.sha256);
        assert.equal(images[0].bytes, expected.bytes);
        const geometry = await layout(page);
        await screenshot(page, name + '-fresh');
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
        await layout(page);
        await screenshot(page, name + '-settings');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Settings');
        await page.getByRole('button', { name: 'Help & support', exact: true }).click();
        await page.getByText('Controls', { exact: true }).click();
        await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
        await page.getByRole('heading', { name: 'Diagnostics', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await screenshot(page, name + '-help');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Load game', exact: true }).click();
        await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
        await page.getByText(/Could not read that campaign/).waitFor();
        await screenshot(page, name + '-import-error');
        await page.locator('input[type="file"]').setInputFiles(fixture);
        await page.getByRole('button', { name: 'Continue campaign', exact: true }).waitFor();
        assert.equal(await page.locator('.entry-menu-primary').getAttribute('aria-label'), 'Continue campaign');
        await page.getByText('Campaign details', { exact: true }).click();
        assert.match(await page.locator('.entry-save-details').textContent(), /3802174487/);
        await screenshot(page, name + '-continue');
        await page.getByRole('button', { name: 'New game', exact: true }).click();
        await page.locator('[data-entry="new"]').click();
        await page.locator('[data-cancel]').waitFor();
        await screenshot(page, name + '-replacement');
        await page.locator('[data-cancel]').click();
        await page.getByRole('button', { name: 'Continue campaign', exact: true }).waitFor();
        await noWorld(page);
        assert.match(await page.locator('[data-context]').textContent(), /Summer 800/);
        report.cases.push({ name, touchEmulation: touch, images, geometry, journeys: 'Fresh, Settings/Back focus, Help/Diagnostics, invalid/valid import, Continue metadata and replacement cancel' });
        await page.context().close();
    }
    for (const mode of ['missing', 'slow']) {
        const page = await newPage({ width: 390, height: 844 }, true);
        let release;
        const waiting = new Promise(resolve => { release = resolve; });
        await page.route('**/branding/fjordside/start/*.webp', async route => {
            if (mode === 'missing') await route.abort();
            else { await waiting; await route.continue(); }
        });
        await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
        await screenshot(page, 'background-' + mode);
        await noWorld(page);
        release();
        await page.context().close();
        report.cases.push({ name: 'Background ' + mode, controlsUsable: true, worldNotInitialized: true });
    }
    const zoomed = await newPage({ width: 390, height: 844 });
    await open(zoomed);
    await zoomed.addStyleTag({ content: 'body.fjord-entry { font-size: 30px; } body.fjord-entry #campaign-start button small { font-size: 26px; } body.fjord-entry #campaign-start .entry-action-copy { font-size: 40px; }' });
    await layout(zoomed);
    await zoomed.getByRole('button', { name: 'Load game', exact: true }).click();
    await zoomed.getByRole('button', { name: 'Back to start menu', exact: true }).click();
    await screenshot(zoomed, 'large-text-approximation');
    report.cases.push({ name: '200% key action/body text CSS approximation', noHorizontalOverflow: true, physicalBrowserTextScaling: false });
    await zoomed.context().close();
    for (const [name, at] of [['before', beforeOrigin], ['after', origin]]) {
        for (let sample = 1; sample <= 3; sample++) {
            const page = await newPage();
            for (const temperature of ['cold-context', 'same-context-reload']) {
                const start = performance.now();
                await page.goto(at + '/fjord-play', { waitUntil: 'domcontentloaded' });
                await page.getByRole('button', { name: 'New game', exact: true }).waitFor();
                const readyMs = performance.now() - start;
                await page.waitForLoadState('networkidle');
                await noWorld(page);
                const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name.split('/').pop(), transferSize: entry.transferSize, decodedBodySize: entry.decodedBodySize })));
                report.timings.push({ name, sample, temperature, controlsReadyMs: Math.round(readyMs), resources });
            }
            await page.context().close();
        }
    }
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.failure = String(error);
    process.exitCode = 1;
} finally {
    await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
    console.log(JSON.stringify({ status: report.status, cases: report.cases.length, failure: report.failure, errors: report.errors }));
}
