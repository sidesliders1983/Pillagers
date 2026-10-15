import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'artifacts/persona-birthdays/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await page.addInitScript(() => {
        new MutationObserver(() => {
            if (document.querySelector('#fjord-canvas')?.dataset.ready === 'true' &&
                document.querySelector('#fjord-run')?.textContent === 'Pause' && !sessionStorage.getItem('qa-birthday-prepared')) {
                document.querySelector('#fjord-run').click();
                sessionStorage.setItem('qa-birthday-prepared', 'true');
            }
        }).observe(document, { subtree: true, attributes: true, childList: true });
    });
    await page.goto(origin + '/fjord-play?seed=32&birthdays=individual-v1');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    assert.equal(saved.fjord.campaign.birthdayCalendar.version, 1);
    assert.ok(Object.values(saved.fjord.campaign.personas).every(person => Number.isInteger(person.birthTick)));
    if (await page.getByRole('button', { name: 'Close founding chapter', exact: true }).isVisible())
        await page.getByRole('button', { name: 'Close founding chapter', exact: true }).tap();
    const state = core.createSettlement(32, { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    state.time.tick = 500;
    state.birthdayCalendar = { version: 1, pendingBirths: [] };
    state.personas.astrid.birthWinter = 795; state.personas.astrid.birthTick = 510;
    saved.fjord.campaign = core.reconstructState(core.serializeState(state));
    delete saved.fjord.narrative;
    saved.fjord.selection = { kind: 'persona', id: 'astrid' };
    await page.locator('#fjord-menu > summary').tap();
    await page.locator('#fjord-campaign > summary').tap();
    await page.locator('#fjord-import').setInputFiles({ name: 'birthday-child.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(saved.fjord)) });
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.entities)
        .some(entity => entity.id === 'astrid' && entity.status.age === 4));
    const entities = () => page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.entities));
    assert.equal((await entities()).find(entity => entity.id === 'astrid').status.indoorReason, 'young-child');
    await page.locator('#fjord-cycle').selectOption('1');
    await page.locator('#fjord-menu > summary').tap();
    await page.screenshot({ path: output + '/before-five.png' });
    await page.locator('#fjord-run').tap();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.entities)
        .some(entity => entity.id === 'astrid' && entity.status.age === 5));
    await page.locator('#fjord-run').tap();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
        .some(entity => entity.id === 'astrid' && entity.age === 5));
    const rendered = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered));
    const child = rendered.find(entity => entity.id === 'astrid');
    assert.equal(child.placeholder, false);
    assert.equal(await page.locator('#fjord-canvas').getAttribute('data-selected'), 'persona:astrid');
    await page.screenshot({ path: output + '/after-five.png' });
    const time = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-time'));
    assert.equal(time.winter, 800); assert.ok(time.tick >= 510 && time.tick < 1000);
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.equal((await entities()).find(entity => entity.id === 'astrid').status.age, 5);
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ touchEmulation: true, viewport: { width: 1024, height: 768 },
        realNewCampaignOptIn: true, exactFifthBirthday: true, restoredAfterReload: true,
        time, child, errors }, null, 2));
    console.log('New-campaign opt-in, real fifth birthday, native model, selection and reload passed.');
} finally { await browser.close(); }
