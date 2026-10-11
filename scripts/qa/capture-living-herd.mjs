import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/living-fjord';
let state = core.createCampaign(17, {
    initialFood: 10000, initialMaterials: 1000, foundingCoupleChanceBps: 10000,
    cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
    cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, cattleCrowdingBps: 0,
}, { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }], careerReviewWinters: 0 },
{ enabled: false });
state = core.applyCommand(state, {
    type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer',
});
const householdId = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
state = core.applyCommand(state, { type: 'BuildHouse', householdId });
const farmId = Object.keys(state.buildings)[0];
for (const cattleId of Object.keys(state.landing.cattle)) {
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId, farmyardId: farmId });
}
state = core.applyCommand(state, { type: 'AdvanceWinter' });
const browser = await chromium.launch({
    headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
    await mkdir(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
    }, core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#fjord-canvas');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
    assert.equal(await page.locator('#fjord-run').innerText(), 'Pause');
    await page.locator('#fjord-run').click();
    await page.selectOption('#fjord-quality', 'low');
    const rendered = () => canvas.getAttribute('data-rendered').then(JSON.parse);
    const farm = (await rendered()).find(e => e.kind === 'building' && e.id === farmId);
    const screen = await page.evaluate(point => {
        const canvas = document.querySelector('#fjord-canvas');
        const camera = JSON.parse(canvas.dataset.camera), w = camera.world;
        const offset = point.map((v, i) => v - w[12 + i]);
        const local = [0, 1, 2].map(i => w[i * 4] * offset[0] +
            w[i * 4 + 1] * offset[1] + w[i * 4 + 2] * offset[2]);
        local.push(1);
        const p = [0, 1, 2, 3].map(row => camera.projection[row] * local[0] +
            camera.projection[row + 4] * local[1] + camera.projection[row + 8] * local[2] +
            camera.projection[row + 12] * local[3]);
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + (p[0] / p[3] + 1) * rect.width / 2,
            y: rect.top + (1 - p[1] / p[3]) * rect.height / 2 };
    }, [farm.position[0], farm.position[1], farm.position[2] - 10]);
    // Use the actual ground navigation and wheel controls, rather than changing camera internals.
    await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(1500);
    await page.mouse.move(500, 400);
    await page.mouse.wheel(0, -5000);
    await page.waitForTimeout(7000);
    const choose = async (kind, id) => {
        const summary = page.getByText('Settlement identities', { exact: true });
        if (!await page.locator('#fjord-identities').isVisible()) await summary.click();
        await page.locator('#fjord-identities button[data-kind="' + kind + '"][data-id="' + id + '"]').click();
        await summary.click();
    };
    await choose('building', farmId);
    const aboveCapacity = (await rendered()).filter(e => e.kind === 'cattle');
    assert.equal(aboveCapacity.filter(e => e.grazingZone === 'yard').length, 4);
    assert.equal(aboveCapacity.filter(e => e.grazingZone === 'overflow').length, 1);
    const poses = JSON.parse(await canvas.getAttribute('data-motion'));
    console.log(JSON.stringify(poses.filter(a => a.kind === 'cattle')));
    assert.ok(poses.filter(a => a.kind === 'cattle').every(a => a.walkable),
        'Every animal must fit its actual source floor, fence and body clearance');
    await page.locator('#fjord-run').click();
    await page.waitForFunction(before => {
        const canvas = document.querySelector('#fjord-canvas');
        const rows = JSON.parse(canvas.dataset.motion);
        const yardIds = JSON.parse(canvas.dataset.rendered).filter(e => e.grazingZone === 'yard').map(e => e.key);
        return rows.some(a => yardIds.includes(a.key) && Math.hypot(a.x - before.find(b => b.key === a.key).x,
            a.z - before.find(b => b.key === a.key).z) > .1);
    }, poses, { timeout: 90000 });
    await page.locator('#fjord-run').click();
    assert.ok(JSON.parse(await canvas.getAttribute('data-motion')).filter(a => a.kind === 'cattle').every(a => a.walkable));
    await page.screenshot({ path: output + '/herd-capacity-plus-one.png', timeout: 120000 });
    const excess = aboveCapacity.find(e => e.grazingZone === 'overflow');
    await choose('cattle', excess.id);
    await page.getByRole('button', { name: /^Slaughter/ }).click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
        .filter(e => e.kind === 'cattle').length === 4, null, { timeout: 90000 });
    await choose('building', farmId);
    const atCapacity = (await rendered()).filter(e => e.kind === 'cattle');
    assert.ok(atCapacity.every(e => e.grazingZone === 'yard' && e.assignment === farmId));
    await page.screenshot({ path: output + '/herd-at-capacity.png', timeout: 120000 });
    assert.deepEqual(errors, []);
    await writeFile(output + '/herd-capacity.json', JSON.stringify({
        origin, farmId, aboveCapacity, atCapacity, poses, errors,
    }, null, 2) + '\n');
    console.log('Close views captured: four penned cattle plus one overflow, then four after actual slaughter.');
} finally {
    await browser.close();
}
