import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { core, pausedCheckpoint } from './fjord-stability-scenario.mjs';
import { selectFjordQuality, openFjordCampaign, closeFjordMenu, selectFjordPace } from './fjord-header-controls.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'docs/qa/structure-seasons';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
await mkdir(output, { recursive: true });

try {
    let state = core.createCampaign(32, { initialMaterials: 1000, foundingCoupleChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 }, { enabled: false });
    for (let i = 1; i <= 5; i++) {
        const occupation = i === 5 ? 'farmer' : 'woodworker';
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-' + i, occupation });
        state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-' + i });
        state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId: 'house-' + i, occupation });
        for (let level = 0; level < (i === 5 ? 1 : i - 1); level++)
            state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId: 'house-' + i });
    }
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, hasTouch: true });
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json),
        pausedCheckpoint(state));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play');
    await selectFjordQuality(page, 'low');
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    await canvas.waitFor();
    const structures = await canvas.evaluate(el => JSON.parse(el.dataset.structureSnow || '[]'));
    const rendered = await canvas.evaluate(el => JSON.parse(el.dataset.rendered));
    const expected = ['settlement-campfire', ...rendered
        .filter(entity => ['building', 'household'].includes(entity.kind)).map(entity => entity.key)];
    assert.deepEqual(structures.map(entry => entry.key).sort(), expected.sort(),
        'Every visible home, Farmyard, tent and campfire shares the Winter treatment; actors do not');
    assert.ok(structures.every(entry => entry.amount === .65 && entry.materials.length > 0),
        'Winter snow is active on all structure materials from the first rendered frame');
    await page.getByRole('button', { name: 'Collapse management panel', exact: true }).tap();
    const focusOnCampfire = async () => {
        const point = await canvas.evaluate(el => {
            const fire = JSON.parse(el.dataset.campfire).transform;
            const { world: w, projection: m } = JSON.parse(el.dataset.camera);
            const rect = el.getBoundingClientRect();
            const v = [fire.x - w[12], fire.y - w[13], fire.z - w[14]];
            const local = [w[0]*v[0]+w[1]*v[1]+w[2]*v[2],
                w[4]*v[0]+w[5]*v[1]+w[6]*v[2], w[8]*v[0]+w[9]*v[1]+w[10]*v[2], 1];
            const p = [0,1,2,3].map(row => m[row]*local[0]+m[row+4]*local[1]
                +m[row+8]*local[2]+m[row+12]);
            return { x: rect.left+(p[0]/p[3]+1)*rect.width/2,
                y: rect.top+(1-p[1]/p[3])*rect.height/2 };
        });
        await page.mouse.click(point.x, point.y);
        await page.mouse.wheel(0, -1200);
        await page.waitForTimeout(1400);
    };
    await focusOnCampfire();
    await page.screenshot({ path: output + '/winter.png' });

    const readSnow = () => canvas.evaluate(el => JSON.parse(el.dataset.structureSnow));
    const select = async (kind, id) => {
        const expand = page.getByRole('button', { name: 'Expand management panel', exact: true });
        if (await expand.isVisible()) await expand.tap();
        const details = page.locator('#fjord-management details').filter({
            has: page.locator('summary', { hasText: 'Settlement identities' })
        });
        if (!await details.evaluate(node => node.open)) await details.locator('summary').tap();
        await page.locator('#fjord-identities [data-kind="' + kind + '"][data-id="' + id + '"]').tap();
    };
    const panel = page.locator('#entity-panel');
    await select('building', 'house-1');
    await panel.getByRole('button', { name: /^Upgrade \(/ }).tap();
    state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId: 'house-1' });
    await page.waitForFunction(previous => {
        const entry = JSON.parse(document.querySelector('#fjord-canvas').dataset.structureSnow)
            .find(e => e.key === 'building:house-1');
        return entry?.amount === .65 && !entry.materials.some(id => previous.includes(id));
    }, structures.find(entry => entry.key === 'building:house-1').materials);
    assert.equal((await readSnow()).length, structures.length, 'Upgrade replaces its seasonal materials');

    await select('household', 'founder-6');
    await panel.getByRole('button', { name: /^Build house \(/ }).tap();
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-6' });
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.structureSnow)
        .some(entry => entry.key === 'building:house-6' && entry.amount === .65));
    assert.ok(!(await readSnow()).some(entry => entry.key === 'household:founder-6'));
    await panel.getByRole('button', { name: /^Salvage house \(/ }).tap();
    state = core.applyCommand(state, { type: 'SalvageBuilding', buildingId: 'house-6' });
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.structureSnow)
        .some(entry => entry.key === 'household:founder-6' && entry.amount === .65));
    assert.ok(!(await readSnow()).some(entry => entry.key === 'building:house-6'));
    assert.equal((await readSnow()).length, structures.length, 'Salvage removes the old snow binding');

    const exportCore = async () => {
        await openFjordCampaign(page);
        const [download] = await Promise.all([
            page.waitForEvent('download'), page.locator('#fjord-export-core').click()
        ]);
        const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
        await download.delete();
        await closeFjordMenu(page);
        return saved;
    };
    assert.deepEqual(await exportCore(), JSON.parse(core.serializeState(state)),
        'Rendering and snow change no Core facts or commands');

    const importState = async next => {
        await openFjordCampaign(page);
        await page.locator('#fjord-import').setInputFiles({ name: 'season.json',
            mimeType: 'application/json', buffer: Buffer.from(core.serializeState(next)) });
        await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
        await closeFjordMenu(page);
        const collapse = page.getByRole('button', { name: 'Collapse management panel', exact: true });
        if (await collapse.isVisible()) await collapse.tap();
    };
    // Compare the same built/upgraded fixture at the same camera in each season.
    await importState(state);
    await focusOnCampfire();
    await page.screenshot({ path: output + '/winter.png' });
    const seasonal = [];
    for (const tick of [250, 312, 500, 750, 0]) {
        const next = core.applyCommand(state, { type: 'AdvanceTicks', ticks: tick });
        await importState(next);
        const snow = await readSnow();
        assert.equal(snow.length, structures.length, 'Import retains exactly the live seasonal structures');
        assert.ok(snow.every(entry => entry.amount === snow[0].amount), 'All structures thaw together');
        if (tick === 0 || tick === 250) assert.equal(snow[0].amount, .65);
        else if (tick === 312) assert.ok(snow[0].amount > 0 && snow[0].amount < .65);
        else assert.equal(snow[0].amount, 0);
        assert.deepEqual(await exportCore(), JSON.parse(core.serializeState(next)));
        seasonal.push({ tick, amount: snow[0].amount, structures: snow.length });
        if (tick === 312 || tick === 500) {
            await focusOnCampfire();
            await page.screenshot({ path: output + (tick === 312 ? '/spring.png' : '/summer.png') });
        }
    }
    const beforeQuality = await readSnow();
    await selectFjordQuality(page, 'standard');
    await selectFjordQuality(page, 'low');
    assert.deepEqual(await readSnow(), beforeQuality, 'Quality switches retain all structure materials');

    await importState(core.applyCommand(state, { type: 'AdvanceTicks', ticks: 249 }));
    await selectFjordPace(page, '1');
    const beforeTick = await readSnow();
    await page.locator('#fjord-run').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.time).tick >= 253);
    await page.locator('#fjord-run').click();
    const afterTick = await readSnow();
    assert.deepEqual(afterTick.map(entry => entry.materials), beforeTick.map(entry => entry.materials),
        'A real season transition changes uniforms without creating materials');
    assert.ok(afterTick.every(entry => entry.amount < .65 && entry.amount > 0));
    const paused = await exportCore();
    assert.deepEqual(paused, JSON.parse(core.serializeState(core.applyCommand(state,
        { type: 'AdvanceTicks', ticks: paused.time.tick }))));
    await page.waitForTimeout(300);
    assert.deepEqual(await readSnow(), afterTick, 'Pause freezes the snow transition');
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ structures, seasonal, errors, touchEmulation: true }, null, 2));
    console.log('PASS: structure snow, thaw, winter building/upgrade/salvage, import, quality, clock/pause and exact Core export.');
} finally {
    await browser.close();
}
