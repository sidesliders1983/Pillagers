import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8'));
fixture.target = 'fjord';
fixture.pace.running = false;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const errors = [];
try {
    for (const [query, expected] of [['', 'smooth'], ['?terrain-study=baseline', 'baseline']]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
        await context.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), JSON.stringify(fixture));
        const page = await context.newPage();
        page.setDefaultTimeout(180000);
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/fjord-play' + query);
        await page.waitForFunction(() => document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
        const actual = await page.evaluate(() => ({
            mode: JSON.parse(document.querySelector('#fjord-canvas').dataset.environment).terrainShading.variant,
            audit: typeof window.__fjordAudit,
        }));
        assert.equal(actual.mode, expected, 'Approved B is the game default; A remains an explicit diagnostic choice');
        assert.equal(actual.audit, 'undefined', 'Normal production builds have no QA bridge');
        await context.close();
        console.log('Production default contract passed:', query || 'no query', expected);
    }
    assert.deepEqual(errors, []);
} finally { await browser.close(); }
