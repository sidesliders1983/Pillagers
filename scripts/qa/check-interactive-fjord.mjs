import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180', output = process.env.QA_OUTPUT || 'docs/qa/interactive-fjord';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await context.newPage();
page.setDefaultTimeout(120000);
const checks = [], errors = [], evidence = {};
let failurePage = page;
page.on('pageerror', e => errors.push(e.message));
const click = name => page.getByRole('button', { name, exact: true }).click();
const rendered = () => page.locator('#fjord-canvas').getAttribute('data-rendered').then(JSON.parse);
const waitScene = predicate => page.waitForFunction(predicate);
const menu = async (open = true) => {
    const summary = page.locator('summary').filter({ hasText: /^Campaign$/ });
    if (await summary.evaluate(e => e.parentElement.open) !== open)
        await summary.click();
};
const exportJSON = async (name = 'Export canonical JSON') => {
    const [d] = await Promise.all([page.waitForEvent('download'), click(name)]);
    try {
        return JSON.parse(await readFile(await d.path(), 'utf8'));
    }
    finally {
        await d.delete();
    }
};
const identity = async (kind, id) => {
    const summary = page.getByText('Settlement identities', { exact: true });
    await summary.click();
    await page.locator('#fjord-identities button[data-kind="' + kind + '"][data-id="' + id + '"]').click();
    await summary.click();
};
const pick = async (target, touchPage = null) => {
    const p = touchPage ?? page, canvas = p.locator('#fjord-canvas'), rect = await canvas.boundingBox();
    const entity = JSON.parse(await canvas.getAttribute('data-rendered')).find(e => e.key === target);
    assert.ok(entity, target);
    for (const f of [.5, .75, .25, .9]) {
        const camera = JSON.parse(await canvas.getAttribute('data-camera'));
        const point = new Vector3((entity.bounds.min[0] + entity.bounds.max[0]) / 2, entity.bounds.min[1] + (entity.bounds.max[1] - entity.bounds.min[1]) * f, (entity.bounds.min[2] + entity.bounds.max[2]) / 2);
        point.applyMatrix4(new Matrix4().fromArray(camera.world).invert()).applyMatrix4(new Matrix4().fromArray(camera.projection));
        const x = rect.x + (point.x + 1) / 2 * rect.width, y = rect.y + (1 - point.y) / 2 * rect.height;
        if (x < rect.x || x > rect.x + rect.width - 310 || y < rect.y || y > rect.y + rect.height)
            continue;
        if (touchPage)
            await p.touchscreen.tap(x, y);
        else
            await p.mouse.click(x, y);
        if (await canvas.getAttribute('data-selected') === target)
            return { x, y };
    }
    throw Error('Real pointer picking did not select ' + target);
};
const passed = text => {
    checks.push(text);
    console.log(text);
};
try {
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    let expected = core.createCampaign(32, { initialMaterials: 500, foundingCoupleChanceBps: 0 }, {}, { enabled: false });
    await menu();
    await page.locator('#fjord-import').setInputFiles({ name: 'campaign.json', mimeType: 'application/json', buffer: Buffer.from(core.serializeState(expected)) });
    await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
    await menu(false);
    const initial = await rendered();
    evidence.householdPick = await pick('household:founder-1');
    assert.match(await page.locator('#entity-panel').innerText(), /Household founder-1/);
    await click('Build house (10 Materials)');
    expected = core.applyCommand(expected, { type: 'HouseHousehold', householdId: 'founder-1' });
    await waitScene(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.key === 'building:house-1'));
    const built = (await rendered()).find(e => e.key === 'building:house-1');
    assert.deepEqual(built.position, initial.find(e => e.key === 'household:founder-1').position);
    assert.equal((await rendered()).some(e => e.key === 'household:founder-1'), false);
    passed('Real household picking → shared panel → canonical construction → stable house replaces tent');
    evidence.personaPick = await pick('persona:founder-1');
    assert.equal(await page.locator('#occupation option').count(), 11);
    assert.match(await page.locator('#occupation option[value="farmer"]').innerText(), /\d+\.\d% fit/);
    await page.selectOption('#occupation', 'farmer');
    await click('Assign occupation');
    expected = core.applyCommand(expected, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    await waitScene(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.key === 'building:house-1' && e.farmyard));
    passed('Real resident picking and aptitude-labelled occupation assignment activate the canonical Farmyard');
    evidence.farmyardPick = await pick('building:house-1');
    assert.match(await page.locator('#entity-panel').innerText(), /Farmyard: active/);
    assert.equal(await page.getByRole('button', { name: /^Upgrade/ }).isDisabled(), true);
    assert.match(await page.locator('#entity-panel').innerText(), /Specialization required/);
    await page.selectOption('#specialization', 'farmer');
    await click('Specialize');
    expected = core.applyCommand(expected, { type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' });
    await page.getByRole('button', { name: /^Upgrade/ }).click();
    expected = core.applyCommand(expected, { type: 'UpgradeBuilding', buildingId: 'house-1' });
    await waitScene(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.key === 'building:house-1' && e.level === 1));
    assert.deepEqual((await rendered()).find(e => e.key === 'building:house-1').position, built.position);
    passed('Real Farmyard picking, canonical disabled reason, specialization and level-1 source model update');
    evidence.cattlePick = await pick('cattle:cattle-1');
    const marker = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-highlight'));
    assert.equal(marker.kind, 'cattle');
    assert.equal(marker.id, 'cattle-1');
    assert.equal(marker.fill, 'transparent');
    assert.equal(marker.color, '#ffdf6a');
    assert.match(await page.locator('#entity-panel').innerText(), /Parents: Founding animal/);
    await page.selectOption('#farmyard', 'house-1');
    await click('Assign livestock');
    expected = core.applyCommand(expected, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' });
    await waitScene(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.key === 'cattle:cattle-1' && e.assignment === 'house-1'));
    await menu();
    assert.deepEqual(await exportJSON(), expected);
    const complete = await exportJSON('Export Fjord campaign');
    await click('Save locally');
    await menu(false);
    await page.screenshot({ path: output + '/interactive-farmyard.png' });
    passed('Real cattle picking/assignment update scene; exported canonical state equals actual Core commands exactly');
    await page.getByRole('link', { name: '2D Settlement', exact: true }).click();
    await page.locator('#winter-value').waitFor();
    assert.match(await page.locator('#entity-panel').innerText(), /cattle-1/);
    assert.match(await page.locator('#entity-panel').innerText(), /Sheltered/);
    await page.locator('#play-settings > summary').click();
    assert.deepEqual(await exportJSON('JSON export'), expected);
    await page.locator('#play-settings > summary').click();
    await page.selectOption('#cycle', '1');
    await click('Start');
    await page.getByRole('link', { name: '3D Fjord', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await click('Pause');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#fjord-cycle').inputValue(), '1');
    assert.equal(await page.locator('#fjord-canvas').getAttribute('data-selected'), 'cattle:cattle-1');
    await menu();
    const returned = await exportJSON('Export Fjord campaign');
    assert.deepEqual(returned.blueprint, complete.blueprint);
    assert.deepEqual(returned.layout, complete.layout);
    await click('Load locally');
    await page.locator('#fjord-notice').filter({ hasText: 'Shared campaign loaded, paused.' }).waitFor();
    assert.deepEqual(await exportJSON('Export Fjord campaign'), complete);
    await menu(false);
    passed('2D↔3D handoff preserves campaign, selection, running flag, cycle and exact geography; local load restores paused');
    const rect = await page.locator('#fjord-canvas').boundingBox();
    await page.mouse.click(rect.x + 15, rect.y + rect.height - 15);
    assert.equal(await page.locator('#fjord-canvas').getAttribute('data-selected'), '');
    await identity('building', 'house-1');
    await click('Salvage house (' + Math.floor(core.inspectBuilding(expected, 'house-1').investedMaterials / 2) + ' Materials)');
    expected = core.applyCommand(expected, { type: 'SalvageBuilding', buildingId: 'house-1' });
    await waitScene(() => {
        const e = JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered);
        return !e.some(e => e.key === 'building:house-1') && e.some(e => e.key === 'household:founder-1') && e.some(e => e.key === 'cattle:cattle-1' && e.assignment === null);
    });
    await menu();
    assert.deepEqual(await exportJSON(), expected);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start', exact: true }).count(), 1);
    passed('Empty terrain deselects; salvage returns tent and unassigned cattle; refresh restores paused');
    await menu();
    await page.locator('#fjord-weather').uncheck();
    await page.locator('#fjord-seed').fill('17');
    await click('New campaign from seed');
    await page.locator('#fjord-notice').filter({ hasText: 'New campaign, paused.' }).waitFor();
    const fresh = await exportJSON();
    assert.equal(fresh.seed, 17);
    assert.equal(fresh.weather.config.enabled, false);
    assert.equal(fresh.time.winter, 800);
    await click('+1 Winter');
    await page.locator('#fjord-winter').filter({ hasText: '801' }).waitFor();
    await click('Restart with same founders');
    await page.locator('#fjord-notice').filter({ hasText: 'Campaign restarted, paused.' }).waitFor();
    assert.equal((await exportJSON()).time.winter, 800);
    passed('3D New campaign, optional weather, Winter advance and same-founder restart work through shared Core session');
    let family = core.createCampaign(32, { initialFood: 1000, initialMaterials: 500, foundingCoupleChanceBps: 10000 }, { fertilityChanceBps: 10000, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    family = core.applyCommand(family, { type: 'AdvanceWinter' });
    const child = Object.values(family.personas).find(p => p.parentIds.length === 2);
    assert.ok(child, 'the actual Core creates the family');
    const [fatherId, motherId] = child.parentIds;
    const home = Object.values(family.households).find(h => h.memberIds.includes(fatherId));
    family = core.applyCommand(family, { type: 'BuildHouse', householdId: home.id });
    await page.locator('#fjord-import').setInputFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.from(core.serializeState(family)) });
    await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
    await menu(false);
    await identity('persona', fatherId);
    await waitScene(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.markers).length === 4);
    const familyMarkers = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-markers'));
    assert.deepEqual(familyMarkers.map(m => [m.role, m.kind, m.id]), [
        ['selected', 'persona', fatherId], ['partner', 'persona', motherId],
        ['child', 'persona', child.id], ['home', 'building', 'house-1']
    ]);
    assert.equal(familyMarkers[0].color, '#ffdf6a');
    assert.ok(familyMarkers.slice(1).every(m => m.color === '#79e0ed' && m.fill === 'transparent'));
    assert.match(await page.locator('#fjord-selection-labels').innerText(), new RegExp(family.personas[motherId].name));
    await page.screenshot({ path: output + '/family-selection.png' });
    await identity('persona', child.id);
    assert.equal(await page.getByRole('button', { name: 'Assign occupation', exact: true }).count(), 0);
    await identity('building', 'house-1');
    await waitScene(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.markers).filter(m => m.role === 'resident').length === 3);
    await page.selectOption('#residence', '');
    await click('Move household');
    family = core.applyCommand(family, { type: 'AssignResidence', householdId: home.id, residenceId: null });
    await waitScene(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.key.startsWith('household:')));
    await identity('persona', fatherId);
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.markers).some(m => m.role === 'home' && m.kind === 'household'));
    await menu();
    assert.deepEqual(await exportJSON(), family);
    passed('Gold selected ring and cyan partner/child/home rings with names; home identifies occupants; children have no occupation command; household move updates the home marker');
    await page.close();
    await context.close();
    const touchContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true }), tablet = await touchContext.newPage();
    failurePage = tablet;
    tablet.setDefaultTimeout(120000);
    tablet.on('pageerror', e => errors.push(e.message));
    await tablet.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await tablet.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await tablet.locator('summary').filter({ hasText: /^Campaign$/ }).tap();
    await tablet.locator('#fjord-import').setInputFiles({ name: 'touch-fjord.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(complete)) });
    await tablet.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
    await tablet.locator('summary').filter({ hasText: /^Campaign$/ }).tap();
    for (const target of ['household:founder-2', 'building:house-1', 'cattle:cattle-1'])
        await pick(target, tablet);
    evidence.touchPick = await pick('persona:founder-1', tablet);
    assert.equal(await tablet.locator('#occupation').count(), 1);
    const before = await tablet.locator('#fjord-canvas').getAttribute('data-selected'), camera = await tablet.locator('#fjord-canvas').getAttribute('data-camera'), box = await tablet.locator('#fjord-canvas').boundingBox(), cdp = await touchContext.newCDPSession(tablet);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }), x = box.x + 150, y = box.y + box.height / 2;
    await touch('touchStart', [{ x, y, id: 1 }]);
    await touch('touchMove', [{ x: x + 70, y: y + 30, id: 1 }]);
    await touch('touchEnd', []);
    await tablet.waitForTimeout(500);
    assert.equal(await tablet.locator('#fjord-canvas').getAttribute('data-selected'), before);
    assert.notEqual(await tablet.locator('#fjord-canvas').getAttribute('data-camera'), camera);
    await touch('touchStart', [{ x, y, id: 1 }, { x: x + 70, y, id: 2 }]);
    await touch('touchMove', [{ x: x - 30, y, id: 1 }, { x: x + 110, y, id: 2 }]);
    await touch('touchEnd', []);
    assert.equal(await tablet.locator('#fjord-canvas').getAttribute('data-selected'), before);
    assert.equal(await tablet.evaluate(() => document.documentElement.scrollHeight > innerHeight), false);
    await tablet.screenshot({ path: output + '/tablet-touch-panel.png' });
    await touchContext.close();
    passed('Chromium tablet touch: household/Farmyard/cattle/resident taps, readable panel, orbit and pinch without accidental selection/page overflow');
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ ...evidence, checks, browserErrors: errors, physicalIPad: 'Not tested; Chromium touch emulation only.' }, null, 2));
}
catch (error) {
    await failurePage.screenshot({ path: output + '/failure.png' }).catch(() => {
    });
    await writeFile(output + '/failure.json', JSON.stringify({ checks, errors, error: String(error) }, null, 2));
    throw error;
}
finally {
    await browser.close();
}
