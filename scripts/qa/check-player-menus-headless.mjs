import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
const output = resolve(process.env.QA_OUTPUT || `scratch/menu-headless-${stamp}`);
const fixturePath = resolve(process.env.QA_CAMPAIGN ||
    'docs/ux/player-menus-298/followup/campaign-before.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
const expectedBuild = process.env.QA_BUILD || head + (dirty ? '-dirty' : '');
await mkdir(output, { recursive: true });
await mkdir(join(output, 'temporary'), { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = join(output, 'temporary');

const report = { version: 1, status: 'running', started: new Date().toISOString(),
    origin, expectedBuild,
    runnerSHA256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    stages: [], errors: [], dialogs: [], screenshots: [] };
const saveReport = () => writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2));
async function stage(name, action) {
    const start = Date.now();
    try {
        const result = await action();
        const summary = result?.campaign ? { seed: result.campaign.seed, time: result.campaign.time } : result;
        report.stages.push({ name, status: 'passed', elapsedMs: Date.now() - start, result: summary });
        console.log(`PASS ${name}`);
        await saveReport();
        return result;
    } catch (error) {
        report.stages.push({ name, status: 'failed', elapsedMs: Date.now() - start,
            error: String(error) });
        throw error;
    }
}

const options = { headless: true, chromiumSandbox: true, downloadsPath: join(output, 'downloads') };
if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
else options.channel = 'chrome';
const browser = await chromium.launch(options);
const context = await browser.newContext({
    viewport: { width: 590, height: 360 }, acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(30000);
page.on('pageerror', error => {
    if (report.errors.length < 30) report.errors.push(error.message);
});
report.chrome = browser.version();
report.playwright = require((process.env.PLAYWRIGHT_MODULE || 'playwright') + '/package.json').version;
report.node = process.version;
report.headless = true;
report.chromiumSandbox = true;

async function capture(name, target = page) {
    const filename = `${name}.png`;
    await target.screenshot({ path: join(output, filename), fullPage: false });
    report.screenshots.push({ filename, viewport: target.viewportSize() });
}
async function menu() {
    if (!(await page.locator('#fjord-menu').evaluate(node => node.open)))
        await page.locator('#fjord-menu > summary').click();
}
async function section(name) {
    await menu();
    for (const summary of await page.locator('#fjord-menu [data-menu-section][open] > summary').all())
        await summary.click();
    await page.getByText(name, { exact: true }).click();
}
async function exportJSON(buttonName, filename) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    const download = await pending;
    await download.saveAs(join(output, filename));
    assert.equal(await download.failure(), null);
    return JSON.parse(await readFile(join(output, filename), 'utf8'));
}
async function campaign(filename) {
    await section('Save game');
    return exportJSON('Download campaign file', filename);
}
async function ready(target = page) {
    await target.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    await target.locator('#island-loading').waitFor({ state: 'hidden', timeout: 180000 });
}
async function replacement(action, accept) {
    const pending = page.waitForEvent('dialog');
    const clicking = page.getByRole('button', { name: action, exact: true }).click();
    const dialog = await pending;
    assert.equal(dialog.type(), 'confirm');
    assert.equal(dialog.message(), 'Replace the active campaign? Manually saved checkpoints are kept.');
    report.dialogs.push({ action, accepted: accept, type: dialog.type(), message: dialog.message() });
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    await clicking;
}
async function closeFounding(name) {
    const card = page.locator('#loading-clan-book.founding-book-ready');
    await card.waitFor({ timeout: 180000 });
    const bounds = await card.evaluate(node => {
        const box = node.getBoundingClientRect(), close = node.querySelector('button').getBoundingClientRect();
        return { measuredHeight: node.style.getPropertyValue('--founding-book-height'),
            card: box.toJSON(), close: close.toJSON(),
            viewport: { width: innerWidth, height: innerHeight } };
    });
    assert.ok(bounds.close.top >= bounds.card.top && bounds.close.bottom <= bounds.card.bottom);
    assert.ok(bounds.close.top >= 0 && bounds.close.bottom <= bounds.viewport.height);
    assert.ok(bounds.close.left >= 0 && bounds.close.right <= bounds.viewport.width);
    await capture(`${name}-founding-short-screen`);
    await page.getByRole('button', { name: 'Close founding chapter', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Guide me', exact: true }).click();
    await page.getByRole('button', { name: 'Close journey', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Start simulation', exact: true }).isEnabled(), true);
    return bounds;
}

try {
    await stage('fresh start and real file recovery', async () => {
        await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'New game', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Run loading diagnostics', exact: true }).isVisible(), false);
        await capture('fresh-start');
        await page.getByRole('button', { name: 'Load game', exact: true }).click();
        await page.locator('input[type="file"]').setInputFiles(fixturePath);
        await page.locator('[data-entry="continue"]').click();
        await ready();
        assert.equal(await page.getByRole('button', { name: 'Start simulation', exact: true }).isEnabled(), true);
    });
    const before = await stage('portable baseline and device checkpoint', async () => {
        await section('Save game');
        await page.getByRole('button', { name: 'Save on this device', exact: true }).click();
        const exported = await exportJSON('Download campaign file', 'before.json');
        assert.deepEqual(exported.campaign, fixture.campaign);
        return exported;
    });
    await stage('native New arrival cancellation keeps seed and complete Core state', async () => {
        await section('New game / Replay');
        await replacement('New arrival', false);
        const after = await campaign('after-cancel.json');
        assert.deepEqual(after.campaign, before.campaign);
        assert.deepEqual(after.selection, before.selection);
        await capture('cancel-preserved');
        return { seed: after.campaign.seed, time: after.campaign.time, stocks: after.campaign.stocks };
    });
    await stage('short-screen Back and Close retain manual pause', async () => {
        await section('Settings');
        await page.getByRole('combobox', { name: 'Local effects', exact: true }).selectOption('off');
        await capture('settings-landscape');
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await capture('game-menu-landscape');
        await page.getByRole('button', { name: 'Close game menu', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: 'Start simulation', exact: true }).isEnabled(), true);
        assert.equal(await page.locator('#fjord-menu').evaluate(node => node.open), false);
        assert.equal(await page.locator('#fjord-next').evaluate(node => node.closest('#fjord-menu') !== null), true);
    });
    await stage('real Copy and Save diagnostics through an isolated permission scope', async () => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
        await section('Help & support');
        await page.getByText('Diagnostics', { exact: true }).click();
        await page.getByRole('combobox', { name: 'Performance overlay', exact: true }).selectOption('details');
        await page.getByText('Options', { exact: true }).click();
        await page.getByRole('combobox', { name: 'External screen recorder', exact: true }).selectOption('off');
        await page.getByRole('button', { name: 'Freeze display', exact: true }).click();
        await page.getByRole('button', { name: 'Copy diagnostics', exact: true }).click();
        await page.getByText('Diagnostics copied.', { exact: true }).waitFor();
        const text = await page.evaluate(() => navigator.clipboard.readText());
        const copied = JSON.parse(text);
        assert.equal(copied.version, 1);
        assert.equal(copied.build, expectedBuild);
        assert.equal(copied.context.seed, before.campaign.seed);
        assert.equal(copied.recording, 'off');
        await writeFile(join(output, 'copied-diagnostics.json'), text);
        const saved = await exportJSON('Save JSON', 'saved-diagnostics.json');
        assert.equal(saved.build, copied.build);
        assert.equal(saved.context.seed, copied.context.seed);
        report.appBuild = saved.build;
        await capture('diagnostics');
        await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('off');
        return { build: copied.build, bytes: Buffer.byteLength(text), copiedAndSaved: true };
    });
    await stage('native founding replay preserves original founders and closes on short screen', async () => {
        await section('New game / Replay');
        await replacement('Replay original founding', true);
        const bounds = await closeFounding('replay');
        const replay = await campaign('replayed.json');
        assert.equal(replay.campaign.seed, before.campaign.seed);
        assert.deepEqual(replay.campaign.time, { winter: 800, tick: 500 });
        assert.deepEqual(replay.campaign.personas, before.campaign.personas);
        return { seed: replay.campaign.seed, bounds, foundersEqual: true };
    });
    await stage('native fresh arrival changes seed and device checkpoint remains recoverable', async () => {
        await section('New game / Replay');
        await replacement('New arrival', true);
        await closeFounding('new-arrival');
        const fresh = await campaign('fresh-arrival.json');
        assert.notEqual(fresh.campaign.seed, before.campaign.seed);
        assert.deepEqual(fresh.campaign.time, { winter: 800, tick: 500 });
        await section('Load game');
        await page.getByRole('button', { name: 'Load device save', exact: true }).click();
        await page.getByText('Shared campaign loaded, paused.', { exact: true }).waitFor({ timeout: 180000 });
        await ready();
        const recovered = await campaign('recovered-device.json');
        assert.deepEqual(recovered.campaign, before.campaign);
        assert.deepEqual(recovered.selection, before.selection);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await capture('game-menu-desktop');
        return { originalSeed: before.campaign.seed, newSeed: fresh.campaign.seed,
            originalCheckpointCoreEqual: true };
    });
    await stage('coarse-pointer landscape menu and Family Tree touch navigation', async () => {
        const mobile = await browser.newContext({
            viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true,
        });
        try {
            const touch = await mobile.newPage();
            touch.setDefaultTimeout(15000);
            touch.on('pageerror', error => {
                if (report.errors.length < 30) report.errors.push(error.message);
            });
            await touch.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
            await touch.getByRole('button', { name: 'Load game', exact: true }).tap();
            await touch.locator('input[type="file"]').setInputFiles(fixturePath);
            await touch.locator('[data-entry="continue"]').tap();
            await ready(touch);
            assert.equal(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
            await touch.locator('#fjord-menu > summary').tap();
            assert.equal(await touch.locator('#fjord-next').evaluate(node => node.closest('#fjord-menu') !== null), true);
            await capture('touch-landscape-menu', touch);
            await touch.getByText('Settings', { exact: true }).tap();
            await touch.getByRole('button', { name: 'Back', exact: true }).tap();
            await touch.getByRole('button', { name: 'Close game menu', exact: true }).tap();
            await touch.getByRole('button', { name: 'Settlement navigation', exact: true }).tap();
            await touch.getByRole('button', { name: 'Clan Book', exact: true }).tap();
            await touch.getByRole('tab', { name: 'Family Tree', exact: true }).tap();
            await capture('touch-family-tree', touch);
            await touch.getByRole('button', { name: 'Close Clan Book', exact: true }).tap();
            assert.equal(await touch.getByRole('button', { name: 'Start simulation', exact: true }).isEnabled(), true);
            assert.equal(await touch.locator('#fjord-food').textContent(), '15');
            return { viewport: touch.viewportSize(), coarsePointer: true, input: 'emulated touch', physicalDevice: false };
        } finally { await mobile.close(); }
    });
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.failure = String(error);
    process.exitCode = 1;
    console.error(error);
    try {
        await capture('failure');
        await writeFile(join(output, 'failure.html'), await page.content());
        report.failureUI = await page.locator('body').evaluate(() => ({
            menuOpen: document.querySelector('#fjord-menu')?.open,
            guidanceHidden: document.querySelector('#fjord-first-steps-card')?.hidden,
            guidance: document.querySelector('#fjord-first-steps-card')?.textContent,
            statuses: Array.from(document.querySelectorAll('[role="status"]')).map(node => node.textContent),
        }));
    } catch { /* Preserve the primary failure. */ }
} finally {
    report.finished = new Date().toISOString();
    await saveReport();
    await context.close();
    await browser.close();
    console.log(JSON.stringify({ status: report.status, output, chrome: report.chrome,
        stages: report.stages.map(({ name, status }) => ({ name, status })) }));
}
