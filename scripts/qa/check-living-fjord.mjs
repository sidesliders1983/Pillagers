import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/living-fjord';
const errors = [], checks = [], observations = {};
let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000, foundingCoupleChanceBps: 10000,
    cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
    cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, cattleCrowdingBps: 0 }, { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }], careerReviewWinters: 0 }, { enabled: false });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    await mkdir(output, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 960, height: 640 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(json => {
        if (!sessionStorage.getItem('pillagers.fjord-play.active.v1'))
            sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
    }, core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#fjord-canvas');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
    assert.equal(await page.locator('#fjord-run').innerText(), 'Pause');
    await page.locator('#fjord-run').click();
    await page.selectOption('#fjord-quality', 'low');
    await page.waitForTimeout(1500);
    const rendered = () => canvas.getAttribute('data-rendered').then(JSON.parse);
    const motion = () => canvas.getAttribute('data-motion').then(JSON.parse);
    const choose = async (kind, id) => {
        const summary = page.getByText('Settlement identities', { exact: true });
        if (!await page.locator('#fjord-identities').isVisible())
            await summary.click();
        await page.locator('#fjord-identities button[data-kind="' + kind + '"][data-id="' + id + '"]').click();
        await summary.click();
    };
    const exported = async () => {
        const summary = page.getByText('Campaign', { exact: true });
        if (!await page.locator('#fjord-export-core').isVisible())
            await summary.click();
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.locator('#fjord-export-core').click()]);
        const json = JSON.parse(await readFile(await download.path(), 'utf8'));
        await download.delete();
        await summary.click();
        return json;
    };
    const initial = await rendered();
    assert.equal(initial.filter(e => e.kind === 'persona').length, 10);
    assert.equal(initial.filter(e => e.kind === 'cattle').length, 3);
    assert.ok(initial.filter(e => e.kind === 'persona').every(e => e.appearance && !e.placeholder));
    const heights = initial.filter(e => e.kind === 'persona').map(e => e.bounds.max[1] - e.bounds.min[1]);
    assert.ok(Math.max(...heights) - Math.min(...heights) > .05);
    assert.ok(new Set(initial.filter(e => e.kind === 'persona').map(e => e.appearance.weightDeviation.toFixed(3))).size > 5);
    observations.heights = heights;
    observations.initial = initial;
    console.log('DNA bodies loaded: 10 residents and 3 cattle.');
    await choose('persona', 'founder-1');
    await page.locator('#character-profile:not([hidden])').waitFor();
    assert.equal(await page.locator('#character-profile h2').innerText(), state.personas['founder-1'].name);
    assert.match(await page.locator('#character-profile').innerText(), /Heritage profile/i);
    const contrast = await page.locator('#character-profile').evaluate(card => {
        const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = values => values.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
            .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const style = getComputedStyle(card), a = luminance(rgb(style.color)), b = luminance(rgb(style.backgroundColor));
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    assert.ok(contrast >= 4.5, 'The restored profile must remain legible on the settlement theme');
    assert.match(await page.locator('#character-profile .profile-identity').innerText(), new RegExp('^' + core.personaAge(state, 'founder-1') + ' years'));
    await page.locator('#character-profile details summary').click();
    assert.equal(await page.locator('#character-profile .profile-heritage strong').count(), 6);
    const positionBefore = await page.locator('#character-profile').evaluate(e => [e.style.left, e.style.top]);
    const before = await motion();
    console.log('Heritage popup verified; starting clock.');
    await page.locator('#fjord-run').click();
    await page.waitForFunction(before => JSON.parse(document.querySelector('#fjord-canvas').dataset.motion).some(a => Math.hypot(a.x - before.find(b => b.key === a.key).x, a.z - before.find(b => b.key === a.key).z) > .5), before, { timeout: 90000 });
    await page.locator('#fjord-run').click();
    await page.waitForTimeout(800);
    const after = await motion();
    console.log('Clock paused after movement. ' + await canvas.getAttribute('data-motion-time'));
    observations.motionBefore = before;
    observations.motionAfter = after;
    assert.ok(after.some(a => Math.hypot(a.x - before.find(b => b.key === a.key).x, a.z - before.find(b => b.key === a.key).z) > .5));
    assert.ok((await rendered()).some(e => e.motion?.clip === 'Walk'));
    assert.notDeepEqual(await page.locator('#character-profile').evaluate(e => [e.style.left, e.style.top]), positionBefore);
    const saved = await exported();
    const expected = core.applyCommand(state, { type: 'AdvanceTicks', ticks: saved.time.tick });
    assert.deepEqual(saved, JSON.parse(core.serializeState(expected)));
    await page.waitForTimeout(1500);
    assert.deepEqual(await motion(), after);
    checks.push('Initial 10/3 move with original DNA size/build and source clips; profile follows, heritage expands, pause freezes transforms, canonical replay matches exactly.');
    await page.screenshot({ path: output + '/resident-profile.png', timeout: 120000 });
    await page.locator('#character-profile .profile-close').click();
    await choose('persona', 'founder-1');
    await page.locator('#character-profile:not([hidden])').waitFor();
    await page.locator('#character-profile .profile-close').click();
    // Real touch picking at the current moving actor position, derived from the public camera matrices.
    const pointer = await page.evaluate(() => {
        const canvas = document.querySelector('#fjord-canvas'), rows = JSON.parse(canvas.dataset.rendered), e = rows.find(e => e.kind === 'persona' && e.id === 'founder-1');
        const camera = JSON.parse(canvas.dataset.camera);
        const mul = (m, v) => [0, 1, 2, 3].map(row => m[row] * v[0] + m[row + 4] * v[1] + m[row + 8] * v[2] + m[row + 12] * v[3]);
        // Invert rigid camera transform; its rotation columns are orthonormal.
        const w = camera.world, v = [e.position[0] - w[12], (e.bounds.min[1] + e.bounds.max[1]) / 2 - w[13], e.position[2] - w[14]];
        const local = [w[0] * v[0] + w[1] * v[1] + w[2] * v[2], w[4] * v[0] + w[5] * v[1] + w[6] * v[2], w[8] * v[0] + w[9] * v[1] + w[10] * v[2], 1];
        const p = mul(camera.projection, local), rect = canvas.getBoundingClientRect();
        return { x: rect.left + (p[0] / p[3] + 1) * rect.width / 2, y: rect.top + (1 - p[1] / p[3]) * rect.height / 2 };
    });
    await choose('cattle', 'cattle-1');
    await page.touchscreen.tap(pointer.x, pointer.y);
    assert.equal(await canvas.getAttribute('data-selected'), 'persona:founder-1');
    checks.push('Touch picks the actor at its moved world position and reuses management selection.');
    console.log('Movement, pause, popup, touch and replay verified.');
    // A denser actual Farmyard with five assigned animals crosses the canonical four-animal soft cap.
    state = core.applyCommand(core.reconstructState(JSON.stringify(saved)), { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const farm = Object.keys(state.buildings)[0];
    for (const id of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId: id, farmyardId: farm });
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    await page.getByText('Campaign', { exact: true }).click();
    await page.locator('#fjord-import').setInputFiles({ name: 'herd.json', mimeType: 'application/json', buffer: Buffer.from(core.serializeState(state)) });
    await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
    await page.getByText('Campaign', { exact: true }).click();
    await page.waitForTimeout(1200);
    const animals = (await rendered()).filter(e => e.kind === 'cattle');
    assert.equal(animals.filter(e => e.grazingZone === 'yard').length, 4);
    assert.equal(animals.filter(e => e.grazingZone === 'overflow').length, 1);
    assert.ok(animals.every(e => e.assignment === farm && e.sheltered));
    await choose('building', farm);
    const herdBefore = await motion();
    await page.locator('#fjord-run').click();
    await page.waitForFunction(before => JSON.parse(document.querySelector('#fjord-canvas').dataset.motion).some(a => a.kind === 'cattle' && Math.hypot(a.x - before.find(b => b.key === a.key).x, a.z - before.find(b => b.key === a.key).z) > .3), herdBefore, { timeout: 90000 });
    await page.locator('#fjord-run').click();
    observations.herd = await rendered();
    observations.herdBefore = herdBefore;
    observations.herdAfter = await motion();
    observations.quality = 'low';
    const farmPlot = JSON.parse(await canvas.getAttribute('data-ground')).plots[0];
    assert.equal(farmPlot, farm);
    await page.screenshot({ path: output + '/farmyard-herd.png', timeout: 120000 });
    checks.push('Actual sourced Farmyard keeps four animals inside and one nearby; all five retain canonical assignment/shelter.');
    let grown = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000, foundingCoupleChanceBps: 10000,
        cattleBirthChanceBps: 0, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 }, { fertilityChanceBps: 10000, mortalityBands: [{ minAge: 0, chanceBps: 0 }], careerReviewWinters: 0 }, { enabled: false });
    for (const home of Object.values(grown.households).filter(h => h.memberIds.length))
        grown = core.applyCommand(grown, { type: 'BuildHouse', householdId: home.id });
    for (let i = 0; i < 6; i++)
        grown = core.applyCommand(grown, { type: 'AdvanceWinter' });
    await page.getByText('Campaign', { exact: true }).click();
    await page.locator('#fjord-import').setInputFiles({ name: 'grown.json', mimeType: 'application/json', buffer: Buffer.from(core.serializeState(grown)) });
    await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
    await page.getByText('Campaign', { exact: true }).click();
    await page.waitForTimeout(1500);
    const people = Object.values(grown.personas).filter(p => p.deathWinter === null && !core.personaAway(grown, p.id));
    const visible = people.filter(p => core.personaAge(grown, p.id) >= 5 && !core.isProvidingCare(grown, p.id));
    const outdoors = (await rendered()).filter(e => e.kind === 'persona');
    assert.deepEqual(outdoors.map(e => e.id).sort(), visible.map(p => p.id).sort());
    assert.ok(people.length > 10 && outdoors.length > 10);
    assert.ok(outdoors.some(e => e.age === 5 && e.appearance.stage === 'child'));
    const five = outdoors.find(e => e.age === 5);
    await choose('persona', five.id);
    await page.locator('#character-profile:not([hidden])').waitFor();
    assert.equal(await page.locator('#character-profile h2').innerText(), grown.personas[five.id].name);
    assert.match(await page.locator('#character-profile .profile-identity').innerText(), /^5 years/);
    await page.locator('#character-profile .profile-close').click();
    const grownBefore = await motion();
    await page.locator('#fjord-run').click();
    await page.waitForFunction(before => JSON.parse(document.querySelector('#fjord-canvas').dataset.motion).some(a => a.kind === 'persona' && Math.hypot(a.x - before.find(b => b.key === a.key).x, a.z - before.find(b => b.key === a.key).z) > .5), grownBefore, { timeout: 90000 });
    // Exercise the real visibility handler through the browser event boundary.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
    await page.waitForTimeout(800);
    const hidden = await motion();
    await page.waitForTimeout(1500);
    assert.deepEqual(await motion(), hidden);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    observations.grown = { population: people.length, outdoors: outdoors.length, rendered: await rendered(), hidden };
    await page.screenshot({ path: output + '/grown-settlement.png', timeout: 120000 });
    checks.push('Grown population retains indoor identities, shows age-five DNA children and moves between permanent homes; visibilitychange suspends agents.');
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ origin, checks, errors, observations }, null, 2) + '\n');
    console.log(JSON.stringify({ checks, errors }));
}
finally {
    await browser.close();
}
