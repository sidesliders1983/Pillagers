import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { core, pausedCheckpoint } from './fjord-stability-scenario.mjs';
import { selectFjordQuality } from './fjord-header-controls.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/qa/settlement-campfire';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
await mkdir(output, { recursive: true });
try {
    let state = core.createCampaign(32, { initialMaterials: 1000, foundingCoupleChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 }, { enabled: false });
    for (let i = 1; i <= 5; i++) {
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-' + i,
            occupation: i === 5 ? 'farmer' : 'woodworker' });
        state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-' + i });
        state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId: 'house-' + i,
            occupation: i === 5 ? 'farmer' : 'woodworker' });
        for (let level = 0; level < (i === 5 ? 1 : Math.min(3, i - 1)); level++)
            state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId: 'house-' + i });
    }
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 550 });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), pausedCheckpoint(state));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play');
    await selectFjordQuality(page, 'low');
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    await canvas.waitFor({ timeout: 120000 });
    const campfire = await canvas.evaluate(el => JSON.parse(el.dataset.campfire || 'null'));
    assert.ok(campfire, 'The source campfire is rendered at the projected nucleus');
    assert.equal(campfire.placeholder, false);
    assert.ok(campfire.width > 6 && campfire.width < 6.8);
    await page.getByRole('button', { name: 'Collapse management panel', exact: true }).tap();
    const screenPoint = point => canvas.evaluate((el, world) => {
        const { world: w, projection: m } = JSON.parse(el.dataset.camera);
        const rect = el.getBoundingClientRect(), v = world.map((value, i) => value - w[12 + i]);
        const local = [w[0]*v[0]+w[1]*v[1]+w[2]*v[2], w[4]*v[0]+w[5]*v[1]+w[6]*v[2],
            w[8]*v[0]+w[9]*v[1]+w[10]*v[2], 1];
        const p = [0,1,2,3].map(row => m[row]*local[0]+m[row+4]*local[1]+m[row+8]*local[2]+m[row+12]);
        return { x: rect.left+(p[0]/p[3]+1)*rect.width/2, y: rect.top+(1-p[1]/p[3])*rect.height/2 };
    }, point);
    const focus = await screenPoint([campfire.transform.x, campfire.transform.y, campfire.transform.z]);
    await page.mouse.click(focus.x, focus.y);
    await page.mouse.wheel(0, -1200);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: output + '/settlement.png' });
    const entities = JSON.parse(await canvas.getAttribute('data-entities'));
    const rendered = JSON.parse(await canvas.getAttribute('data-rendered'));
    for (const house of rendered.filter(e => e.kind === 'building')) {
        const plot = entities.find(e => e.selectionKey === house.key).plot;
        assert.equal(house.placeholder, false);
        assert.ok(house.bounds.min[0] >= plot.x - plot.halfWidth - .01 &&
            house.bounds.max[0] <= plot.x + plot.halfWidth + .01 &&
            house.bounds.min[2] >= plot.z - plot.halfDepth - .01 &&
            house.bounds.max[2] <= plot.z + plot.halfDepth + .01, 'Rotated source home fits its reservation');
    }
    const resident = rendered.find(e => e.kind === 'persona');
    const body = resident.bounds.min.map((v, i) => (v + resident.bounds.max[i]) / 2);
    const touch = await screenPoint(body);
    await page.touchscreen.tap(touch.x, touch.y);
    assert.match(await page.locator('#entity-panel').innerText(), /Occupation/);
    await page.getByRole('button', { name: 'Clear selection', exact: true }).tap();
    await page.getByRole('button', { name: 'Collapse management panel', exact: true }).tap();
    await page.getByRole('button', { name: /^(Start|Pause)$/, exact: true }).click();
    await page.waitForTimeout(8000);
    await page.getByRole('button', { name: /^(Start|Pause)$/, exact: true }).click();
    const moving = JSON.parse(await canvas.getAttribute('data-motion'));
    assert.ok(moving.length);
    for (const actor of moving) assert.ok(Math.hypot(actor.x-campfire.transform.x,
        actor.z-campfire.transform.z) > campfire.obstacleRadius, 'Actors stay outside the fire ring');
    await page.getByRole('button', { name: 'Expand management panel', exact: true }).tap();
    await page.locator('#fjord-management details').filter({ has: page.locator('summary', { hasText: 'Settlement identities' }) }).locator('summary').tap();
    await page.locator('[data-kind="building"][data-id="house-1"]').tap();
    assert.match(await page.locator('#entity-panel').innerText(), /Upgrade/);
    await page.screenshot({ path: output + '/touch-selection.png' });
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ campfire, errors, tabletEmulation: true }, null, 2));
    console.log('Campfire rendering and touch management passed.');
} finally {
    await browser.close();
}
