import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
import { openFjordCampaign, closeFjordMenu } from './fjord-header-controls.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5183';
const output = process.env.QA_OUTPUT || 'artifacts/fjord-desktop-foundations';
const fixture = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/summer-32.json', 'utf8'));
fixture.target = 'fjord';
fixture.pace.running = false;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
const errors = [], checks = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
async function exportCore() {
    await openFjordCampaign(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export-core').click()]);
    const state = core.reconstructState(await readFile(await download.path(), 'utf8'));
    await download.delete();
    await closeFjordMenu(page);
    return state;
}
try {
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), JSON.stringify(fixture));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.locator('#fjord-canvas[data-ready=true]').waitFor();
    assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined', 'Normal server must not expose QA bindings');
    const initial = await exportCore();
    for (const viewport of [{ width: 1101, height: 800 }, { width: 1280, height: 720 },
        { width: 1400, height: 900 }, { width: 1920, height: 1080 }]) {
        await page.setViewportSize(viewport);
        const layout = await page.evaluate(() => {
            const rect = selector => {
                const box = document.querySelector(selector).getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
            };
            return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
                calendar: rect('#fjord-winter'), resources: rect('#fjord-stocks'), controls: rect('.fjord-time-controls'),
                header: rect('#fjord-header'), panel: rect('#fjord-management'),
                surface: getComputedStyle(document.querySelector('#fjord-header')).backgroundColor,
                emphasis: getComputedStyle(document.querySelector('#fjord-run')).color,
                theme: getComputedStyle(document.body).getPropertyValue('--fjord-surface').trim() };
        });
        assert.equal(layout.scrollWidth, layout.width);
        assert.equal(layout.theme, '#1d2529');
        assert.equal(layout.surface, 'rgb(29, 37, 41)');
        assert.equal(layout.emphasis, 'rgb(221, 189, 135)');
        assert.ok(layout.calendar.right <= layout.resources.left + 1, 'Calendar must not overlap resources');
        assert.ok(layout.resources.right <= layout.controls.left + 1, 'Resources must not overlap controls');
        assert.ok(layout.controls.right <= layout.header.right, 'Controls must remain inside header');
        assert.ok(layout.panel.right <= layout.width && layout.panel.bottom <= layout.height);
        layouts.push(layout);
        await page.screenshot({ path: output + '/desktop-' + viewport.width + '.png' });
    }
    checks.push('Desktop header, resources and inspector fit 1101/1280/1400/1920px without overlap');
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.getByText('Settlement identities', { exact: true }).click();
    await page.locator('#fjord-identities button[data-kind="persona"][data-id="founder-1"]').click();
    assert.equal(await page.locator('#fjord-canvas').getAttribute('data-selected'), 'persona:founder-1');
    await page.screenshot({ path: output + '/selected-resident.png' });
    await page.locator('#fjord-management-toggle').click();
    assert.equal(await page.locator('#fjord-management').isVisible(), false);
    await page.locator('#fjord-management-toggle').click();
    assert.equal(await page.locator('#fjord-management').isVisible(), true);
    await page.locator('#fjord-menu > summary').click();
    await page.locator('#fjord-cycle').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#fjord-menu').evaluate(menu => menu.open), false);
    assert.equal(await page.locator('#fjord-menu > summary').evaluate(node => node === document.activeElement), true);
    assert.deepEqual(await exportCore(), initial, 'Styling, selection and menus must not change canonical state');
    checks.push('Selection, panel collapse and menu Escape/focus preserve canonical state');
    await page.locator('#fjord-run').click();
    await page.locator('#occupation').focus();
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('#occupation').evaluate(node => node === document.activeElement), true);
    await page.locator('#fjord-run').click();
    const final = await exportCore();
    const elapsed = (final.time.winter - initial.time.winter) * initial.ticksPerWinter + final.time.tick - initial.time.tick;
    assert.ok(elapsed > 0, 'The production timer must actually advance');
    assert.deepEqual(final, core.applyCommand(initial, { type: 'AdvanceTicks', ticks: elapsed }),
        'Rendered running state must equal authoritative replay');
    checks.push('Running refresh retains field focus and exact canonical replay');
    await page.setViewportSize({ width: 1100, height: 768 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--fjord-surface').trim()), '',
        'Desktop override must not leak into the existing narrow layout');
    checks.push('Desktop media scope leaves narrow layouts unchanged');
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ status: 'PASS', checks, layouts, errors }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'PASS', checks }));
} finally { await browser.close(); }
