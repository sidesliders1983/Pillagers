import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)(
    process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5198';
const output = process.env.QA_OUTPUT || 'artifacts/exploration-151';
await mkdir(output, { recursive: true });
const report = { status: 'RUNNING', normalBuild: true, cases: [], errors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const exportDownload = async (page, selector) => {
    const pending = page.waitForEvent('download');
    await page.locator(selector).evaluate(button => button.click());
    return readFile(await (await pending).path(), 'utf8');
};
try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 850 } });
    const gallery = await context.newPage();
    gallery.setDefaultTimeout(300000);
    await gallery.goto(origin + '/exploration-review/');
    const images = await gallery.locator('img').evaluateAll(items => items.map(item => item.src));
    for (const url of images) assert.equal((await context.request.get(url)).status(), 200);
    for (const path of ['/scripts/qa/exploration-browser.mjs', '/scripts/qa/fjord-runtime-browser.mjs', '/.git/config'])
        assert.equal((await context.request.get(origin + path)).status(), 404);
    assert.equal((await context.request.post(origin + '/exploration-review/fresh.json', { data: '{}' })).status(), 405);
    for (const [name, observed, known] of [['fresh', false, false], ['observed', true, true], ['returned', false, true]]) {
        const expected = JSON.parse(await readFile(root + '/docs/qa/exploration-151/' + name + '.json', 'utf8'));
        const pending = context.waitForEvent('page');
        await gallery.locator('[data-scenario="' + name + '"]').click();
        const page = await pending;
        page.setDefaultTimeout(300000);
        page.on('pageerror', error => report.errors.push(error.message));
        await page.waitForURL('**/fjord-play');
        await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
        await page.getByRole('button', { name: 'Start simulation', exact: true }).waitFor();
        await page.evaluate(() => document.querySelector('#clan-book-close')?.click());
        assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined');
        const core = JSON.parse(await exportDownload(page, '#fjord-export-core'));
        assert.deepEqual(core, expected.fjord.campaign);
        const rival = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rival));
        assert.equal(rival.currentlyObserved, observed);
        assert.equal(rival.known, known);
        if (observed) assert.ok(rival.rendered.some(item => item.kind === 'persona'));
        else assert.deepEqual(rival.rendered, []);
        if (name === 'observed') {
            const campaign = await exportDownload(page, '#fjord-export');
            await page.locator('#fjord-import').setInputFiles({ name: 'review-expedition.json',
                mimeType: 'application/json', buffer: Buffer.from(campaign) });
            await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign imported, paused.');
            await page.getByRole('button', { name: 'Start simulation', exact: true }).waitFor();
            assert.deepEqual(JSON.parse(await exportDownload(page, '#fjord-export-core')), core);
            await page.locator('#fjord-import').setInputFiles({ name: 'invalid.json',
                mimeType: 'application/json', buffer: Buffer.from('{') });
            await page.waitForFunction(() => {
                const text = document.querySelector('#fjord-notice').textContent;
                return text && !['Importing campaign…', 'Campaign imported, paused.'].includes(text);
            });
            assert.deepEqual(JSON.parse(await exportDownload(page, '#fjord-export-core')), core);
        }
        report.cases.push({ name, paused: true, currentlyObserved: observed, known,
            rivalEntities: rival.rendered.length,
            coreSha256: createHash('sha256').update(JSON.stringify(core)).digest('hex'),
            ...(observed ? { actualFileExportImportExact: true, invalidFileAtomic: true } : {}) });
        await page.close();
        console.log('PASS normal review launcher / ' + name);
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    throw error;
} finally {
    await writeFile(output + '/review-check.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
