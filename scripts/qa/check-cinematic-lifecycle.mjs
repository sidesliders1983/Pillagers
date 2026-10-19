import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const playwrightPath = process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(playwrightPath);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/cinematic-loading';
const flows = [];
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    await page.addInitScript(() => {
        if (location.pathname !== '/fjord-play') return;
        new MutationObserver(() => {
            const canvas = document.querySelector('#fjord-canvas');
            const run = document.querySelector('#fjord-run');
            if (canvas?.dataset.ready === 'true' && run?.getAttribute('aria-label') === 'Pause simulation') run.click();
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-ready'] });
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(...args) {
                super(...args);
                this.generation = String(args[0]).includes('GenerationWorker');
                if (this.generation) sessionStorage.setItem('qa-worker-status', 'created');
            }
            terminate() {
                if (this.generation) sessionStorage.setItem('qa-worker-status', 'terminated');
                super.terminate();
            }
        };
    });
    await page.goto(origin + '/fjord-play?seed=32', { waitUntil: 'domcontentloaded' });
    await page.locator('#island-loading').waitFor();
    await page.goto(origin + '/docs/qa/cinematic-loading/review.html');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('qa-worker-status')), 'terminated');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1')), null);
    flows.push('Navigating away during generation terminates the worker without saving a partial campaign.');

    let failedRequests = 0;
    await page.route('**/ground-materials/**', route => {
        failedRequests++;
        return route.abort('failed');
    });
    await page.goto(origin + '/fjord-play?seed=32', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.ok(failedRequests > 0);
    assert.match(await page.locator('#fjord-diagnostics').textContent(), /Ground maps unavailable; native terrain material fallback/);
    assert.equal(await page.locator('#island-loading').count(), 0);
    assert.deepEqual(JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-time')),
        { winter: 800, tick: 500, ticksPerWinter: 1000 });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('qa-worker-status')), 'terminated');
    flows.push('Failed ground-material fetch retains the existing declared native-material fallback and reaches the playable Summer state.');
    mkdirSync(output, { recursive: true });
    writeFileSync(output + '/lifecycle.json', JSON.stringify({ flows, failedRequests }, null, 2));
    console.log(JSON.stringify({ flows, failedRequests }));
} finally {
    await browser.close();
}
