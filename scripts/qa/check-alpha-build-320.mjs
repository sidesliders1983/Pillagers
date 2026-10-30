import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join, extname, sep } from 'node:path';
import { verifyAlphaArtifact } from '../build-info.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const first = resolve(process.env.ALPHA_FIRST || 'scratch/alpha-320/ci-build-1');
const second = resolve(process.env.ALPHA_SECOND || 'scratch/alpha-320/ci-build-2');
const output = resolve(process.env.QA_OUTPUT || 'scratch/alpha-320/browser');
const fixture = resolve('docs/ux/player-menus-298/followup/campaign-before.json');
await mkdir(join(output, 'temporary'), { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = join(output, 'temporary');
const info = [verifyAlphaArtifact(first), verifyAlphaArtifact(second)];
assert.equal(info[0].buildNumber, 1);
assert.equal(info[1].buildNumber, 2);
assert.notEqual(info[0].buildId, info[1].buildId);
assert.throws(() => verifyAlphaArtifact(first, { distributable: true }), /identity/);
let servedRoot = first;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
    '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.hdr': 'application/octet-stream' };
const server = createServer(async (request, response) => {
    const route = new URL(request.url, 'http://localhost').pathname;
    const path = resolve(servedRoot, '.' + (route === '/' || route === '/fjord-play' ? '/index.html' : route));
    try {
        if (!path.startsWith(servedRoot + sep) || !(await stat(path)).isFile()) throw new Error('Missing file');
        response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        createReadStream(path).pipe(response);
    } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' });
const report = { status: 'running', browser: browser.version(), physicalDevice: false,
    builds: info, cases: [], errors: [], badResponses: [] };
function observe(page) {
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.badResponses.push({ url: response.url(), status: response.status() }); });
}
async function screenshot(page, name) { await page.screenshot({ path: join(output, name + '.jpg'), quality: 85 }); }
async function entry(page, number = 1, route = '/fjord-play') {
    const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.getByRole('button', { name: 'New game', exact: true }).waitFor();
    assert.equal(await page.locator('[data-game-version]').textContent(), 'v0.1 alpha · preview build ' + number);
    assert.equal(await page.locator('canvas').count(), 0);
}
async function saveDownload(page, filename) {
    for (const summary of await page.locator('#fjord-menu [data-menu-section][open] > summary').all())
        await summary.click();
    await page.getByText('Save game', { exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download campaign file', exact: true }).click()]);
    await download.saveAs(join(output, filename));
    return JSON.parse(await readFile(join(output, filename), 'utf8'));
}
try {
    for (const [name, width, height, touch] of [['desktop', 1440, 900, false], ['wide', 1920, 1080, false],
        ['phone', 390, 844, true], ['short-landscape', 844, 390, true], ['tablet', 768, 1024, true]]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
        const page = await context.newPage(); observe(page);
        await entry(page, 1, name === 'desktop' ? '/' : '/fjord-play');
        const geometry = await page.evaluate(() => {
            const title = document.querySelector('#campaign-start h1').getBoundingClientRect();
            const label = document.querySelector('[data-game-version]');
            const rect = label.getBoundingClientRect();
            return { titleBottom: title.bottom, labelTop: rect.top, labelBottom: rect.bottom,
                width: document.documentElement.scrollWidth, font: getComputedStyle(label).fontSize,
                color: getComputedStyle(label).color, text: label.textContent };
        });
        assert.ok(geometry.labelTop >= geometry.titleBottom - 1);
        assert.ok(geometry.width <= width + 2);
        assert.ok(parseFloat(geometry.font) >= 14);
        const action = await page.getByRole('button', { name: 'New game', exact: true }).boundingBox();
        assert.ok(action.y >= 0 && action.y + action.height <= height);
        const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(resource => resource.name));
        assert.ok(!resources.some(url => /\.glb(?:\?|$)|\.hdr(?:\?|$)|FjordPlay-[^/]+\.js|site-version\.json|build-info\.json/.test(url)));
        await screenshot(page, 'ci1-' + name + '-fresh');
        await page.getByRole('button', { name: 'Load game', exact: true }).click();
        await page.locator('input[type="file"]').setInputFiles(fixture);
        await page.getByRole('button', { name: 'Continue campaign', exact: true }).waitFor();
        assert.equal(await page.locator('[data-game-version]').textContent(), geometry.text);
        await screenshot(page, 'ci1-' + name + '-returning');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.locator('[data-game-version]').textContent(), geometry.text);
        report.cases.push({ name, width, height, touchEmulation: touch, geometry, importAndReloadStable: true, noWorldOrVersionFetch: true });
        await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage(); observe(page);
    await entry(page);
    await page.locator('.entry-about > summary').click();
    assert.ok((await page.locator('.entry-about').textContent()).includes(info[0].buildId));
    await page.getByRole('button', { name: 'Help & support', exact: true }).click();
    await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
    await page.locator('.performance-setting select').selectOption('compact');
    await page.locator('#performance-overlay details > summary').click();
    let download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
    await (await download).saveAs(join(output, 'performance-entry.json'));
    const performance = JSON.parse(await readFile(join(output, 'performance-entry.json'), 'utf8'));
    assert.deepEqual(performance.buildInfo, info[0]);
    await entry(page);
    await page.getByRole('button', { name: 'Load game', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page.getByRole('button', { name: 'Continue campaign', exact: true }).click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    await page.locator('#island-loading').waitFor({ state: 'hidden', timeout: 180000 });
    assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
    await page.locator('#fjord-menu > summary').click();
    await page.getByText('Save game', { exact: true }).click();
    const before = await saveDownload(page, 'campaign-before-menu.json');
    await page.getByRole('button', { name: 'Close game menu', exact: true }).click();
    await page.locator('#fjord-menu > summary').click();
    await page.getByText('Help & support', { exact: true }).click();
    await page.getByText('About / Credits', { exact: true }).click();
    assert.ok((await page.locator('#fjord-menu').textContent()).includes(info[0].buildId));
    await page.locator('#fjord-support > summary').click();
    await page.getByText('Loading diagnostics', { exact: true }).click();
    download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save last loading diagnostics', exact: true }).click();
    await (await download).saveAs(join(output, 'loading.json'));
    const loading = JSON.parse(await readFile(join(output, 'loading.json'), 'utf8'));
    assert.deepEqual(loading.buildInfo, info[0]);
    await page.getByRole('button', { name: 'Close game menu', exact: true }).click();
    await page.locator('#fjord-menu > summary').click();
    await page.getByText('Save game', { exact: true }).click();
    const after = await saveDownload(page, 'campaign-after-menu.json');
    assert.deepEqual(after.campaign, before.campaign);
    report.cases.push({ name: 'Actual game, About, performance/loading exports and paused campaign', sameEmbeddedInfo: true, canonicalCampaignUnchanged: true, clockPaused: true });
    await entry(page);
    servedRoot = second;
    const newer = await context.request.get(origin + '/site-version.json');
    assert.equal((await newer.json()).buildInfo.buildNumber, 2);
    assert.equal(await page.locator('[data-game-version]').textContent(), 'v0.1 alpha · preview build 1');
    await screenshot(page, 'old-loaded-build-new-server');
    await entry(page, 2);
    await screenshot(page, 'ci2-desktop');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-game-version]').textContent(), 'v0.1 alpha · preview build 2');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, 'ci2-phone');
    report.cases.push({ name: 'Two real numbered artifacts and old loaded bundle/new server', numbers: [1, 2], oldBundleRetainedItsOwnIdentity: true, reloadUsesNewArtifact: true });
    await context.close();
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.badResponses, []);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.failure = String(error); process.exitCode = 1;
    const pages = browser.contexts().flatMap(context => context.pages());
    if (pages.length) await screenshot(pages.at(-1), 'failure').catch(() => {});
}
finally {
    await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    console.log(JSON.stringify(report));
}
