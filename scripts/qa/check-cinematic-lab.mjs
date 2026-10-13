import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const playwrightPath = process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(playwrightPath);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const flows = [];
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.generationWorkers = { created: 0, terminated: 0 };
        window.Worker = class extends NativeWorker {
            constructor(...args) {
                super(...args);
                this.generation = String(args[0]).includes('GenerationWorker');
                if (this.generation) window.generationWorkers.created++;
            }
            terminate() {
                if (this.generation) window.generationWorkers.terminated++;
                super.terminate();
            }
        };
    });
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/environment-lab');
    await page.locator('#environment-canvas[data-ready="true"]').waitFor();
    await page.locator('#environment-settings > summary').click();
    await page.locator('#world-seed').fill('42');
    await page.locator('#world-preset').selectOption('fjord');
    await page.locator('#world-generate').click();
    await page.waitForFunction(() => {
        const world = document.querySelector('#environment-canvas').dataset.world;
        return world && JSON.parse(world).seed === 42;
    });
    const previous = await page.locator('#environment-canvas').getAttribute('data-world');
    assert.match(await page.locator('#world-generation-status').textContent(), /seed 42/);
    flows.push('Generate World publishes the requested seed through the shared worker.');

    await page.locator('#world-preset').selectOption('island');
    await page.locator('#world-seed').fill('91');
    await page.locator('#world-generate').click();
    await page.getByRole('button', { name: 'Cancel generation', exact: true }).tap();
    assert.equal(await page.locator('#environment-canvas').getAttribute('data-world'), previous);
    assert.match(await page.locator('#world-generation-status').textContent(), /cancelled/);
    assert.equal(await page.locator('#world-generate').isEnabled(), true);
    flows.push('Touch cancellation retains the previous landscape and enables Generate World.');

    await page.locator('#environment-conifers').selectOption('kaykit');
    await page.waitForFunction(() => {
        const world = JSON.parse(document.querySelector('#environment-canvas').dataset.world);
        return world.seed === 42 && world.conifers === 'kaykit' && world.generations === 2;
    });
    flows.push('Conifer replanning uses the retained seed and publishes one replacement.');
    const worker = await page.evaluate(() => window.generationWorkers);
    assert.equal(worker.created, 3);
    assert.equal(worker.terminated, worker.created);
    assert.deepEqual(errors, []);
    mkdirSync('docs/qa/cinematic-loading', { recursive: true });
    writeFileSync('docs/qa/cinematic-loading/lab.json', JSON.stringify({ flows, worker, errors }, null, 2));
    console.log(JSON.stringify({ flows, worker, errors }));
} finally {
    await browser.close();
}
