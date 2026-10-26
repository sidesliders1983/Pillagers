import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5247';
const save = await readFile('docs/qa/family-tree-287/legacy-gameplay-save.json', 'utf8');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(raw => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', raw);
        const originalContext = HTMLCanvasElement.prototype.getContext;
        const seen = new WeakSet();
        window.testWebGLContexts = 0;
        HTMLCanvasElement.prototype.getContext = function (...args) {
            const context = originalContext.apply(this, args);
            if (context && String(args[0]).startsWith('webgl') && !seen.has(this)) {
                seen.add(this);
                window.testWebGLContexts++;
            }
            return context;
        };
        // Observe the exact existing export Blob; some Edge policies cancel the filesystem download.
        const create = URL.createObjectURL;
        URL.createObjectURL = function (blob) {
            if (blob.type === 'application/json') window.testLastJSONBlob = blob;
            return create.call(this, blob);
        };
    }, save);
    await page.goto(origin + '/fjord-play?entry=qa-continue', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    console.log('Full Fjord ready');
    const exported = async () => {
        await page.evaluate(() => { window.testLastJSONBlob = undefined; });
        await page.locator('#fjord-export-core').evaluate(button => button.click());
        return JSON.parse(await page.evaluate(() => window.testLastJSONBlob.text()));
    };
    const before = await exported();
    await page.locator('#fjord-book').click();
    await page.getByRole('tab', { name: 'Family Tree', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-family-node="founder-2"] .family-card-avatar img'));
    const thumbnail = await page.locator('[data-family-node="founder-2"] img').getAttribute('src');
    assert.equal(await page.locator('[data-family-node]').count(), 57);
    await page.screenshot({ path: 'docs/qa/family-tree-287/fjord-play-desktop.png', timeout: 120000 });
    await page.locator('#clan-book-close').click();
    await page.locator('#fjord-navigation [data-surface="settlement"]').click();
    await page.locator('#fjord-directory [data-ui="inspect"][data-kind="persona"][data-id="founder-2"]').click();
    await page.locator('.fjord-portrait img').waitFor();
    assert.equal(await page.locator('.fjord-portrait img').getAttribute('src'), thumbnail,
        'The actual Character Card must reuse the identical tree portrait');
    const contexts = await page.evaluate(() => window.testWebGLContexts);
    assert.equal(contexts, 1, 'World and thumbnails share one WebGL context');
    assert.deepEqual(await exported(), before, 'Actual book and portrait navigation cannot mutate Core');
    assert.deepEqual(errors, []);
    const report = { passed: true, records: 57, webglContexts: contexts, actualCharacterCardImageEqual: true,
        canonicalStateUnchanged: true, errors,
        scope: 'Real /fjord-play on desktop Edge, isolated recording save. Not a physical mobile or hardware FPS test.' };
    await writeFile('docs/qa/family-tree-287/fjord-play.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
} finally {
    await browser.close();
}
