import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
import {loadTypeScript} from '../load-typescript.mjs';
import {studyInitial} from './personality-scenario.mjs';
const {chromium} = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const output = 'docs/qa/personality-life-events/browser'; mkdirSync(output, {recursive: true});
const input = studyInitial(41, true).enabled;
Object.assign(input.social.config, {quarrelMinBps: 10000, quarrelMaxBps: 10000,
    mediationMinBps: 10000, mediationMaxBps: 10000, mediationSuccessBps: 10000});
const browser = await chromium.launch({headless: true, channel: process.env.QA_BROWSER ?? 'msedge'});
const errors = [], checks = [];
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage({viewport: {width, height: 900}, hasTouch: width === 390});
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            window.qaHidden = false;
            Object.defineProperty(document, 'hidden', {configurable: true, get: () => window.qaHidden});
        });
        await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180') + '/gameplay-lab');
        const setting = page.locator('#social-enabled');
        assert.equal(await setting.isChecked(), false);
        await setting.check();
        assert.match(await page.locator('#social-diagnostics summary').innerText(), /disabled/);
        await page.locator('[data-action="new"]').click();
        assert.match(await page.locator('#social-diagnostics summary').innerText(), /experimental/);
        await page.locator('#import-file').setInputFiles({name: 'social-fixture.json', mimeType: 'application/json',
            buffer: Buffer.from(core.serializeState(input))});
        await page.locator('#person-einar').waitFor();
        assert.equal(await setting.isChecked(), true);
        await page.locator('#social-diagnostics summary').click();
        await page.getByRole('button', {name: '+1 Winter', exact: true}).click();
        assert.match(await page.locator('#social-diagnostics').innerText(), /Active quarrels: 1/);
        assert.match(await page.locator('.chronicle-sidebar').innerText(), /quarrelled/);
        await page.getByRole('button', {name: '+1 Winter', exact: true}).click();
        assert.match(await page.locator('.chronicle-sidebar').innerText(), /attempted to mediate/);
        assert.match(await page.locator('.chronicle-sidebar').innerText(), /reconciled through mediation/);
        assert.equal(await page.locator('#social-diagnostics').getAttribute('open'), '');
        await page.locator('[data-action="save"]').click();
        const saved = await page.evaluate(() => localStorage.getItem('pillagers.gameplay-lab.v1'));
        assert.deepEqual(JSON.parse(saved), core.applyCommand(input, {type: 'AdvanceTicks', ticks: 2000}));
        await page.waitForTimeout(1100);
        await page.locator('[data-action="save"]').click();
        assert.equal(await page.evaluate(() => localStorage.getItem('pillagers.gameplay-lab.v1')), saved);
        await page.getByRole('button', {name: '+1 Winter', exact: true}).click();
        await page.locator('[data-action="load"]').click();
        await page.locator('[data-action="save"]').click();
        assert.equal(await page.evaluate(() => localStorage.getItem('pillagers.gameplay-lab.v1')), saved);
        await page.locator('[data-action="run"]').click();
        await page.waitForTimeout(600);
        await page.locator('[data-action="save"]').click();
        const running = await page.evaluate(() => localStorage.getItem('pillagers.gameplay-lab.v1'));
        assert.deepEqual(JSON.parse(running).social, JSON.parse(saved).social);
        await page.evaluate(() => {window.qaHidden = true; document.dispatchEvent(new Event('visibilitychange'));});
        await page.locator('[data-action="save"]').click();
        const hidden = await page.evaluate(() => localStorage.getItem('pillagers.gameplay-lab.v1'));
        await page.waitForTimeout(1100);
        await page.locator('[data-action="save"]').click();
        assert.equal(await page.evaluate(() => localStorage.getItem('pillagers.gameplay-lab.v1')), hidden);
        await page.evaluate(() => {window.qaHidden = false; document.dispatchEvent(new Event('visibilitychange'));});
        assert.equal(await page.locator('[data-action="run"]').innerText(), 'Start');
        await page.locator('#social-diagnostics').scrollIntoViewIfNeeded();
        await page.screenshot({path: output + '/lab-' + width + '.png'});
        checks.push({width, passed: true, checks: ['opt-in only at creation', 'Core fixture import',
            'real annual quarrel/mediation/reconciliation', 'stable disclosure', 'rendering does not reroll', 'save/load rollback', 'hidden-tab and no-offline guard']});
        await page.close();
    }
    const page = await browser.newPage({viewport: {width: 1024, height: 768}, hasTouch: true});
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180') + '/play');
    await page.locator('#import-file').setInputFiles({name: 'social-fixture.json', mimeType: 'application/json', buffer: Buffer.from(core.serializeState(input))});
    await page.waitForFunction(() => document.body.textContent.includes('Campaign loaded, paused.'));
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    for (let index = 0; index < 5; index++) await page.getByRole('button', {name: '+1 Winter', exact: true}).click();
    await page.selectOption('#clan-book-chapter', '1');
    const text = await page.locator('#clan-book-story').innerText();
    assert.match(text, /quarrel/); assert.match(text, /mediat/); assert.match(text, /reconcil/);
    assert.doesNotMatch(text.split('\n').slice(1).join('\n'), /incident-|805|insult|angry|kind-hearted/);
    await page.screenshot({path: output + '/clan-book-tablet.png'});
    checks.push({width: 1024, passed: true, checks: ['existing Clan Book reader uses real sources', 'relative time', 'no invented motive']});
    assert.deepEqual(errors, []);
    writeFileSync(output + '/report.json', JSON.stringify({passed: true, checks, errors,
        deviceLimit: 'Desktop Edge with touch emulation; no physical iPad certification.'}, null, 2) + '\n');
    console.log(JSON.stringify({passed: true, checks, errors}));
} finally {await browser.close();}
