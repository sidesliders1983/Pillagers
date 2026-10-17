import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Matrix4, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5176';
const output = 'docs/qa/expedition-interface-180';
await mkdir(output, { recursive: true });
const report = { status: 'RUNNING', origin, checks: [], errors: [], layout: [], sourceHashes: {} };
for (const file of ['ExpeditionPanel.ts', 'FjordInterface.ts', 'FjordPlay.ts', 'FjordIcons.ts', 'fjord-interface.css']) {
    report.sourceHashes[file] = createHash('sha256').update(await readFile('src/fjord-play/' + file)).digest('hex');
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let page;
let context;
const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
const core = async () => (await saved()).fjord.campaign;
const screenshot = name => page.screenshot({ path: output + '/' + name + '.jpg', type: 'jpeg', quality: 87 });
const toolbar = () => page.locator('#expedition-mode');
const active = async groupId => Object.values((await core()).world.spatial?.missions ?? {})
    .find(mission => mission.groupId === groupId && mission.status !== 'Returned');

async function openScenario(name) {
    console.log('Loading normal 3D scenario:', name);
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    page.setDefaultTimeout(300000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/playtest/', { waitUntil: 'networkidle' });
    await page.locator(`[data-scenario="${name}"]`).click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    console.log('Scene ready:', name);
}
async function waitStatus(groupId, status) {
    await page.waitForFunction(({ groupId, status }) =>
        Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions)
            .some(mission => mission.groupId === groupId && mission.status === status), { groupId, status });
}
async function destination(groupId, offsets = [[20, 0], [-20, 0], [0, 20], [0, -20], [35, 15], [-35, -15]]) {
    const owner = SharedSettlement.restore(JSON.stringify(await saved()), 'fjord');
    const surface = createBlueprintSurface(owner.fjord.blueprint);
    const state = owner.session.readSnapshot();
    const members = state.world.groups[groupId].memberIds;
    const actors = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered));
    const origins = Object.fromEntries(members.map(id => {
        const actor = actors.find(actor => actor.id === id && actor.kind === 'persona');
        assert.ok(actor);
        return [id, { x: actor.position[0], z: actor.position[2] }];
    }));
    const mission = Object.values(state.world.spatial.missions).find(mission => mission.groupId === groupId && mission.status !== 'Returned');
    const center = owner.fjord.blueprint.settlement.center;
    const camera = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.camera));
    const canvas = await page.locator('#fjord-canvas').boundingBox();
    const hud = await toolbar().boundingBox();
    for (const [dx, dz] of offsets) {
        try {
            const offer = owner.session.exploreOffer(groupId, { x: center.x + dx, z: center.z + dz },
                mission.status === 'Prepared' ? origins : undefined);
            const point = new Vector3(offer.target.x, surface.surfaceHeightAt(offer.target.x, offer.target.z), offer.target.z)
                .applyMatrix4(new Matrix4().fromArray(camera.world).invert())
                .applyMatrix4(new Matrix4().fromArray(camera.projection));
            const screen = { x: canvas.x + (point.x + 1) * canvas.width / 2, y: canvas.y + (1 - point.y) * canvas.height / 2 };
            if (screen.x > 35 && screen.x < canvas.width - 35 && screen.y > 100 && screen.y < hud.y - 20) {
                return { ...screen, target: offer.target };
            }
        } catch {}
    }
    throw Error('No visible, reachable destination above the exploration toolbar.');
}
async function checkToolbarLayout(width, height) {
    await page.setViewportSize({ width, height });
    const box = await toolbar().boundingBox();
    const navigation = await page.locator('#fjord-navigation').boundingBox();
    report.layout.push({ width, height, toolbar: box, worldAreaUncoveredByToolbar: 1 - box.width * box.height / (width * height) });
    assert.ok(box.x >= 0 && box.y > 80 && box.x + box.width <= width && box.y + box.height <= navigation.y);
    assert.equal(await toolbar().evaluate(node => node.scrollWidth > node.clientWidth), false);
    for (const button of await toolbar().locator('button:visible').all()) {
        const bounds = await button.boundingBox();
        assert.ok(bounds.x >= box.x && bounds.x + bounds.width <= box.x + box.width + 1);
    }
}

try {
    await openScenario('summer-17');
    const oldSave = await core();
    await page.locator('button[data-surface="expeditions"]').click();
    assert.ok(await page.locator('#expedition-create').isDisabled());
    await page.locator('[data-ui="campaign-settings"]').click();
    assert.ok(await page.locator('#fjord-exploration').isVisible());
    assert.deepEqual(await core(), oldSave);
    report.checks.push('Exploration-disabled save has a clear new-campaign route; opening settings changes no gameplay state');
    await context.close();
    console.log('PASS: Disabled-campaign route');

    await openScenario('exploration-800');
    const initial = await core();
    const groupId = Object.keys(initial.world.groups)[0];
    const members = initial.world.groups[groupId].memberIds;
    await page.locator('button[data-surface="settlement"]').click();
    await page.locator('[data-ui="directory"][data-kind="household"]').click();
    await page.locator('#fjord-directory [data-ui="inspect"]').first().click();
    await page.locator('button[data-surface="expeditions"]').click();
    const member = page.locator(`[data-member-group="${groupId}"][data-member="${members[0]}"]`);
    await member.uncheck();
    await page.waitForFunction(groupId => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.groups[groupId].memberIds.length === 1, groupId);
    await member.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(groupId => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.groups[groupId].memberIds.length === 2, groupId);
    assert.deepEqual((await core()).stocks, initial.stocks);
    assert.deepEqual((await core()).time, initial.time);
    assert.equal((await core()).rngState, initial.rngState);
    assert.equal(await page.locator('[data-member^="island-rival"]').count(), 0);
    await screenshot('crew-preparation-desktop');
    await page.locator('#expedition-create').click();
    await page.waitForFunction(() => Object.keys(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.groups).length === 2);
    const secondGroup = Object.keys((await core()).world.groups).at(-1);
    assert.ok(await page.locator(`[data-start="${secondGroup}"]`).isDisabled());
    assert.ok((await page.locator('.fjord-crew-unavailable').innerText()).includes('Unavailable residents'));
    await page.locator(`[data-expedition-group="${groupId}"]`).click();
    await page.locator(`[data-start="${groupId}"]`).click();
    assert.ok((await page.locator('#expedition-start-summary').innerText()).includes('4'));
    await screenshot('departure-confirmation');
    await page.locator('#expedition-start-cancel').click();
    assert.deepEqual((await core()).stocks, initial.stocks);
    assert.equal(await active(groupId), undefined);
    report.checks.push('Global crew selection, keyboard checkbox, separate groups and canonical eligibility; cancelled packing spends nothing');
    console.log('PASS: Crew and departure review');

    await page.locator(`[data-start="${groupId}"]`).click();
    await page.locator('#expedition-start-confirm').click();
    await waitStatus(groupId, 'Prepared');
    assert.ok(await toolbar().isVisible());
    assert.equal(await page.locator('#fjord-workspace').isVisible(), false);
    assert.ok(await page.locator('#expedition-send').isDisabled());
    assert.equal((await core()).stocks.food, initial.stocks.food - members.length * 2);
    assert.equal((await saved()).pace.running, false);
    await checkToolbarLayout(1440, 900);
    await screenshot('choose-destination-desktop');
    const prepared = await core();
    await page.keyboard.press('Escape');
    assert.deepEqual(await core(), prepared);
    await toolbar().locator('[data-expedition-action="groups"]').last().click();
    await page.locator(`[data-expedition-group="${secondGroup}"]`).click();
    assert.ok(await page.locator(`[data-start="${secondGroup}"]`).isDisabled());
    await page.locator(`[data-expedition-group="${groupId}"]`).click();
    await page.locator('#expedition-controls [data-explore]').click();
    let flag = await destination(groupId);
    await page.mouse.click(flag.x, flag.y);
    assert.ok(await page.locator('#expedition-send').isEnabled());
    assert.deepEqual(await core(), prepared, 'A flag preview must not dispatch, spend, advance time or reveal land');
    await screenshot('destination-preview');
    await page.locator('#expedition-cancel').click();
    assert.deepEqual(await core(), prepared);
    assert.equal(await page.locator('#expedition-send').count(), 0);
    report.checks.push('Packing spends exactly 4 Food once, enters a separate map toolbar, stays paused; Escape and Cancel preserve the whole prepared campaign; flag preview reveals/spends nothing');
    console.log('PASS: Persistent exploration mode, preview and cancellation');

    await toolbar().locator('[data-explore]').click();
    flag = await destination(groupId);
    await page.mouse.click(flag.x, flag.y);
    await page.locator('#expedition-send').click();
    await waitStatus(groupId, 'Traveling');
    const dispatched = await core();
    assert.deepEqual(dispatched.stocks, prepared.stocks);
    assert.deepEqual(dispatched.time, prepared.time);
    assert.equal((await saved()).pace.running, false);
    await toolbar().locator('[data-expedition-action="focus"]').click();
    assert.ok(await toolbar().isVisible());
    assert.deepEqual((await core()).time, prepared.time);
    await toolbar().locator('[data-expedition-action="clock"]').click();
    await waitStatus(groupId, 'Exploring');
    await toolbar().locator('[data-expedition-action="clock"]').click();
    assert.equal((await saved()).pace.running, false);
    await checkToolbarLayout(1024, 636);
    await screenshot('exploring-compact-desktop');
    await page.setViewportSize({ width: 1440, height: 900 });
    const exploring = await core();
    await toolbar().locator('[data-explore]').click();
    flag = await destination(groupId, [[40, 0], [-40, 0], [0, 40], [0, -40]]);
    await page.mouse.click(flag.x, flag.y);
    assert.deepEqual(await core(), exploring, 'Redirect preview must preserve the running mission and pack');
    await page.locator('#expedition-send').click();
    await waitStatus(groupId, 'Traveling');
    assert.deepEqual((await core()).stocks, exploring.stocks);
    assert.equal((await saved()).pace.running, false);
    await toolbar().locator('[data-recall]').click();
    await waitStatus(groupId, 'Returning');
    assert.deepEqual((await core()).stocks, exploring.stocks);
    await screenshot('returning-home');
    await toolbar().locator('[data-expedition-action="clock"]').click();
    await waitStatus(groupId, 'Returned');
    await page.locator('#fjord-run').click();
    assert.equal(await toolbar().isVisible(), false);
    await page.locator('button[data-surface="expeditions"]').click();
    await screenshot('home-again');
    report.checks.push('Explicit Send, Resume, Show group, travel, discovery, redirect with unchanged Food, Recall and physical homecoming; exploration toolbar exits at completion');
    console.log('PASS: Full physical exploration and return loop');

    await page.locator(`[data-start="${groupId}"]`).click();
    const foodBeforeRepacking = (await core()).stocks.food;
    await page.locator('#expedition-start-confirm').click();
    await waitStatus(groupId, 'Prepared');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    assert.ok(await toolbar().isVisible());
    assert.equal((await saved()).pace.running, false);
    assert.ok(await toolbar().locator('[data-explore]').isEnabled());
    const reloadedFood = (await core()).stocks.food;
    assert.equal(reloadedFood, foodBeforeRepacking - members.length * 2);
    await toolbar().locator('[data-cancel-expedition]').click();
    await toolbar().waitFor({ state: 'hidden' });
    assert.equal((await core()).stocks.food, reloadedFood, 'Ending a prepared expedition never refunds the pack');
    assert.equal((await saved()).pace.running, false);
    assert.equal(await toolbar().isVisible(), false);
    report.checks.push('Reload restores an active paused expedition and its controls without charging again; ending it discards unused supplies without refund');
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
    console.log('PASS: Exploration interface browser verification');
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    if (page && !page.isClosed()) await screenshot('failure');
    throw error;
} finally {
    await writeFile(output + '/observations.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
