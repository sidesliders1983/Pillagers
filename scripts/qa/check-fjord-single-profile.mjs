import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { core, createLifecycleScenario } from './fjord-lifecycle-scenario.mjs';
import { pausedCheckpoint } from './fjord-stability-scenario.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/qa/living-fjord-stability';
const { state } = createLifecycleScenario();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), pausedCheckpoint(state));
    await page.goto(process.env.QA_ORIGIN || 'http://127.0.0.1:5180/fjord-play');
    await page.selectOption('#fjord-quality', 'low');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.getByText('Settlement identities', { exact: true }).click();
    await page.locator('#fjord-identities button[data-kind="persona"][data-id="founder-1"]').click();
    await page.getByText('Settlement identities', { exact: true }).click();
    assert.equal(await page.locator('#character-profile').count(), 0,
        'The floating Fjordside profile is replaced by the existing name-and-line label');
    const selected = page.locator('#fjord-selection-labels .selected');
    await selected.waitFor();
    assert.equal(await selected.count(), 1);
    assert.match(await selected.innerText(), new RegExp(state.personas['founder-1'].name));
    assert.ok(await page.locator('#fjord-selection-labels .related').count() > 0,
        'Family and home relationship labels remain');
    await page.getByText('Character traits & heritage', { exact: true }).click();
    const profile = page.locator('#fjord-resident-profile');
    await profile.waitFor();
    assert.equal(await profile.locator('h2').innerText(), state.personas['founder-1'].name);
    assert.match(await profile.innerText(), /Heritage profile/i);
    await profile.locator('.profile-minor summary').click();
    assert.equal(await profile.locator('.profile-heritage strong').count(), 6);
    await page.getByText('Character traits & heritage', { exact: true }).click();
    const canvas = page.locator('#fjord-canvas');
    const before = JSON.parse(await canvas.getAttribute('data-motion'))
        .find(actor => actor.key === 'persona:founder-1');
    await page.locator('#fjord-run').click();
    await page.waitForFunction(before => {
        const actor = JSON.parse(document.querySelector('#fjord-canvas').dataset.motion)
            .find(actor => actor.key === 'persona:founder-1');
        return Math.hypot(actor.x - before.x, actor.z - before.z) > .3;
    }, before);
    await page.locator('#fjord-run').click();
    await page.waitForTimeout(600);
    const pointer = await canvas.evaluate(canvas => {
        const entity = JSON.parse(canvas.dataset.rendered).find(e => e.key === 'persona:founder-1');
        const camera = JSON.parse(canvas.dataset.camera), w = camera.world;
        const v = [entity.position[0] - w[12], (entity.bounds.min[1] + entity.bounds.max[1]) / 2 - w[13],
            entity.position[2] - w[14]];
        const local = [w[0] * v[0] + w[1] * v[1] + w[2] * v[2],
            w[4] * v[0] + w[5] * v[1] + w[6] * v[2], w[8] * v[0] + w[9] * v[1] + w[10] * v[2], 1];
        const m = camera.projection, p = [0, 1, 2, 3].map(row =>
            m[row] * local[0] + m[row + 4] * local[1] + m[row + 8] * local[2] + m[row + 12]);
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + (p[0] / p[3] + 1) * rect.width / 2,
            y: rect.top + (1 - p[1] / p[3]) * rect.height / 2 };
    });
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await page.touchscreen.tap(pointer.x, pointer.y);
    assert.equal(await canvas.getAttribute('data-selected'), 'persona:founder-1',
        'Touch picks the moved source body and restores the shared management selection');
    assert.equal(await page.locator('#character-profile').count(), 0);
    assert.equal(await page.locator('#fjord-selection-labels .selected').count(), 1);
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: output + '/single-resident-popup.png' });
    await writeFile(output + '/single-profile.json', JSON.stringify({ singleNameAndLineLabel: true, managementPanelProfile: true, movedBodyTouchSelection: true,
        relatedLabels: await page.locator('#fjord-selection-labels .related').allTextContents(), heritageExpandable: true }, null, 2));
    console.log('Single name-and-line label, related labels and management-panel heritage verified.');
} finally { await browser.close(); }
