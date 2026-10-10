import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
let state = core.createCampaign(32);
state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-2', occupation: 'fisher' });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), core.serializeState(state));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.getByText('Settlement identities', { exact: true }).click();
    await page.locator('#fjord-identities button[data-kind="persona"][data-id="founder-1"]').click();
    assert.equal(await page.locator('#occupation').inputValue(), 'farmer');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.locator('#fjord-identities button[data-kind="persona"][data-id="founder-2"]').click();
    assert.equal(await page.locator('#occupation').inputValue(), 'fisher', 'selecting another resident must reset occupation choices even while the clock runs');
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/play', { waitUntil: 'domcontentloaded' });
    await page.selectOption('#entity-picker', 'persona:founder-1');
    assert.equal(await page.locator('#occupation').inputValue(), 'farmer');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.selectOption('#entity-picker', 'persona:founder-2');
    assert.equal(await page.locator('#occupation').inputValue(), 'fisher');
    await page.getByRole('button', { name: 'Career autonomy', exact: true }).focus();
    await page.waitForTimeout(800);
    assert.equal(await page.getByRole('button', { name: 'Career autonomy', exact: true }).evaluate(button => button === document.activeElement), true,
        'A ticking Winter must not replace focused management buttons.');
    const output = process.env.QA_OUTPUT || 'docs/qa/interactive-fjord';
    await mkdir(output, { recursive: true });
    await writeFile(output + '/running-selection.json', JSON.stringify({ board: 'passed', fjord: 'passed' }, null, 2));
    console.log('Running 2D and 3D selection controls show the newly selected resident');
}
finally {
    await browser.close();
}
