import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { core, pausedCheckpoint } from './fjord-stability-scenario.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/qa/fjord-housing-scale';
let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000,
    foundingCoupleChanceBps: 0 }, { fertilityChanceBps: 0, careerReviewWinters: 0,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
for (let i = 1; i <= 4; i++) {
    const occupation = i === 4 ? 'farmer' : 'woodworker';
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-' + i, occupation });
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-' + i });
    state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId: 'house-' + i, occupation });
    for (let level = 0; level < (i === 1 ? 1 : i === 2 ? 2 : 0); level++)
        state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId: 'house-' + i });
}
const errors = [];
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
await mkdir(output, { recursive: true });
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json),
        pausedCheckpoint(state));
    await page.goto(process.env.QA_ORIGIN || 'http://127.0.0.1:5180/fjord-play');
    await page.selectOption('#fjord-quality', 'low');
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    await canvas.waitFor();
    await page.getByRole('button', { name: 'Collapse management panel', exact: true }).tap();
    const houses = JSON.parse(await canvas.getAttribute('data-rendered')).filter(e => e.kind === 'building');
    const size = entity => entity.bounds.max.map((v, i) => v - entity.bounds.min[i]);
    const homestead = houses.find(e => e.asset === 'homestead');
    const longhouse = houses.find(e => e.asset === 'longhouse');
    assert.ok(homestead && longhouse, 'Both actual upgrade models must be visible');
    const focus = await canvas.evaluate((canvas, homes) => {
        const camera = JSON.parse(canvas.dataset.camera), w = camera.world, m = camera.projection;
        const rect = canvas.getBoundingClientRect();
        const world = homes[0].position.map((value, i) => (value + homes[1].position[i]) / 2);
        const v = world.map((value, i) => value - w[12 + i]);
        const local = [w[0] * v[0] + w[1] * v[1] + w[2] * v[2],
            w[4] * v[0] + w[5] * v[1] + w[6] * v[2],
            w[8] * v[0] + w[9] * v[1] + w[10] * v[2], 1];
        const p = [0, 1, 2, 3].map(row => m[row] * local[0] + m[row + 4] * local[1] +
            m[row + 8] * local[2] + m[row + 12]);
        return { x: rect.left + (p[0] / p[3] + 1) * rect.width / 2,
            y: rect.top + (1 - p[1] / p[3]) * rect.height / 2 };
    }, [homestead, longhouse]);
    await page.mouse.click(focus.x, focus.y);
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: output + '/housing.png' });
    const dimensions = { homestead: size(homestead), longhouse: size(longhouse) };
    await writeFile(output + '/dimensions.json', JSON.stringify(dimensions, null, 2));
    assert.ok(Math.abs(dimensions.longhouse[1] - dimensions.homestead[1]) < .01,
        'Longhouse has the same rendered height as Homestead');
    assert.ok(Math.max(dimensions.longhouse[0], dimensions.longhouse[2]) >
        Math.max(dimensions.homestead[0], dimensions.homestead[2]) * 1.2,
        'Longhouse is visibly wider than Homestead');
    const entities = JSON.parse(await canvas.getAttribute('data-entities')).filter(e => e.kind === 'building');
    for (const house of houses) {
        const entity = entities.find(e => e.id === house.id);
        const bounds = house.bounds;
        assert.ok(bounds.min[0] >= entity.plot.x - entity.plot.halfWidth - .01 &&
            bounds.max[0] <= entity.plot.x + entity.plot.halfWidth + .01 &&
            bounds.min[2] >= entity.plot.z - entity.plot.halfDepth - .01 &&
            bounds.max[2] <= entity.plot.z + entity.plot.halfDepth + .01,
            house.id + ' fits its existing plot without a placeholder');
    }
    await page.getByRole('button', { name: 'Expand management panel', exact: true }).tap();
    await page.getByText('Settlement identities', { exact: true }).click();
    await page.locator('#fjord-identities button[data-kind="building"][data-id="house-1"]').click();
    await page.locator('#entity-panel').getByRole('button', { name: /^Upgrade / }).tap();
    state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId: 'house-1' });
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
        .some(e => e.id === 'house-1' && e.asset === 'longhouse'));
    const upgraded = JSON.parse(await canvas.getAttribute('data-rendered')).find(e => e.id === 'house-1');
    assert.deepEqual(upgraded.position, homestead.position, 'Upgrade keeps the physical home position');
    assert.ok(Math.abs(size(upgraded)[1] - dimensions.homestead[1]) < .01);
    await page.getByRole('button', { name: 'Collapse management panel', exact: true }).tap();
    await page.screenshot({ path: output + '/upgraded.png' });
    await page.getByText('Campaign', { exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export canonical JSON', exact: true }).click()]);
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    await download.delete();
    assert.deepEqual(saved, JSON.parse(core.serializeState(state)));
    assert.deepEqual(errors, []);
    await writeFile(output + '/result.json', JSON.stringify({ dimensions,
        rotations: entities.map(e => ({ id: e.id, farmyard: e.status.farmyard, rotation: e.transform.rotation })),
        plotsContainModels: true, upgradeRetainsPositionAndHeight: true, coreEqualToReplay: true, errors }, null, 2));
    console.log('Real housing height, width, parcel fit and exact upgrade replay verified.');
} finally {
    await browser.close();
}
