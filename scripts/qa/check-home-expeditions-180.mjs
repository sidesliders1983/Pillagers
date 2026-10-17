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
const output = 'docs/qa/home-expeditions-180';
await mkdir(output, { recursive: true });
const report = { checks: [], errors: [], origin, sourceHashes: {} };
for (const file of ['FjordInterface.ts', 'HomeImprovements.ts', 'ExpeditionPanel.ts', 'FjordPlay.ts', 'FjordHeader.ts', 'fjord-interface.css']) {
    report.sourceHashes[file] = createHash('sha256').update(await readFile('src/fjord-play/' + file)).digest('hex');
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let page;
const saved = async () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
const core = async () => (await saved()).fjord.campaign;
const screenshot = name => page.screenshot({ path: output + '/' + name + '.jpg', type: 'jpeg', quality: 87 });
const waitLevel = (buildingId, level) => page.waitForFunction(({ buildingId, level }) =>
    JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.mechanics.buildings[buildingId]?.upgradeLevel === level,
{ buildingId, level });
const waitSpecialization = (buildingId, role) => page.waitForFunction(({ buildingId, role }) =>
    JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.buildings[buildingId]?.specialization === role,
{ buildingId, role });

async function openScenario(name) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/playtest/', { waitUntil: 'networkidle' });
    await page.locator(`[data-scenario="${name}"]`).click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const close = page.locator('#clan-book-close');
    if (await close.isVisible()) await close.click();
    return context;
}

async function homeSelection(householdId) {
    await page.locator('button[data-surface="settlement"]').click();
    await page.locator('[data-ui="directory"][data-kind="household"]').click();
    await page.locator(`#fjord-directory [data-ui="inspect"][data-id="${householdId}"]`).click();
}

async function screenPoint(point) {
    const camera = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.camera));
    const clip = new Vector3(point.x, point.y, point.z)
        .applyMatrix4(new Matrix4().fromArray(camera.world).invert())
        .applyMatrix4(new Matrix4().fromArray(camera.projection));
    const box = await page.locator('#fjord-canvas').boundingBox();
    return { x: box.x + (clip.x + 1) * box.width / 2, y: box.y + (1 - clip.y) * box.height / 2 };
}

try {
    let context = await openScenario('funded-800');
    const initial = await core();
    const household = Object.values(initial.households)[0];
    await homeSelection(household.id);
    await page.locator('[data-ui="build"]').click();
    await page.waitForFunction(() => document.querySelector('#fjord-materials').textContent === '15');
    const built = await core();
    const buildingId = built.residences[built.households[household.id].residenceId].buildingId;
    const occupations = Object.fromEntries(Object.entries(built.personas).map(([id, person]) => [id, person.occupation]));
    await page.waitForFunction(buildingId => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
        .some(entity => entity.id === buildingId && entity.kind === 'building'), buildingId);
    await page.locator('[data-ui="close-card"]').click();
    const rendered = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered));
    const building = rendered.find(entity => entity.id === buildingId && entity.kind === 'building');
    assert.ok(building);
    const point = await screenPoint({ x: building.position[0], y: building.position[1], z: building.position[2] });
    await page.mouse.click(point.x, point.y);
    await page.locator('.fjord-home-improvements').waitFor();
    assert.ok((await page.locator('.fjord-home-improvements').innerText()).includes('Specialization required'));
    await page.locator('[data-ui="specialization"]').click();
    await page.locator('[data-ui="choose-specialization"][data-role="fisher"]').click();
    await waitSpecialization(buildingId, 'fisher');
    report.checks.push('Three physical clicks: world home selection, specialization chooser, occupation icon');
    await page.locator('[data-ui="upgrade-home"]').click();
    await waitLevel(buildingId, 1);
    let state = await core();
    assert.equal(state.stocks.materials, 10);
    assert.deepEqual(Object.fromEntries(Object.entries(state.personas).map(([id, person]) => [id, person.occupation])), occupations);
    assert.deepEqual(state.time, initial.time);
    assert.equal(state.rngState, initial.rngState);
    await screenshot('home-level-I-desktop');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 636 }]) {
        await page.setViewportSize(viewport);
        await page.locator('#fjord-management').evaluate(node => node.scrollTop = 0);
        const panel = await page.locator('#fjord-management').boundingBox();
        const button = await page.locator('[data-ui="upgrade-home"]').boundingBox();
        assert.ok(button.y >= panel.y && button.y + button.height <= panel.y + panel.height,
            'Upgrade must be visible without scrolling at ' + JSON.stringify(viewport));
    }
    await screenshot('home-level-I-ipad');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-ui="upgrade-home"]').evaluate(button => button.dataset.upgradeLevel = '0');
    await page.locator('[data-ui="upgrade-home"]').click();
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent.includes('The home has changed'));
    assert.equal((await core()).mechanics.buildings[buildingId].upgradeLevel, 1);
    assert.equal((await core()).stocks.materials, 10);
    report.checks.push('A synthetic obsolete upgrade button is rejected without spending Materials');
    await page.locator('[data-ui="specialization"]').click();
    await page.locator('[data-ui="choose-specialization"][data-role="smith"]').click();
    await waitSpecialization(buildingId, 'smith');
    assert.equal((await core()).mechanics.buildings[buildingId].upgradeLevel, 1);
    await page.locator('[data-ui="upgrade-home"]').click();
    await waitLevel(buildingId, 2);
    assert.equal((await core()).stocks.materials, 0);
    assert.ok(await page.locator('[data-ui="upgrade-home"]').isDisabled());
    assert.ok((await page.locator('.fjord-home-improvements').innerText()).includes('Insufficient Materials'));
    await page.locator('[data-ui="specialization"]').click();
    await page.locator('[data-ui="choose-specialization"][data-role=""]').click();
    await waitSpecialization(buildingId, null);
    assert.equal((await core()).mechanics.buildings[buildingId].upgradeLevel, 2);
    const more = page.locator('[data-legacy-management]');
    await more.locator('summary').first().click();
    await more.locator('[data-command*="SalvageBuilding"]').waitFor();
    assert.equal(await more.locator('#specialization').count(), 0);
    assert.equal(await more.locator('[data-command*="UpgradeBuilding"]').count(), 0);
    assert.equal(await more.locator('[data-command*="SalvageBuilding"]').count(), 1);
    report.checks.push('Direct upgrades, accurate stock costs, unchanged occupations/time/RNG, retained levels, unavailable reasons, advanced controls retained');
    console.log('PASS: Home specialization, upgrades, viewport visibility and advanced management');
    await page.locator('button[data-surface="expeditions"]').click();
    assert.ok(await page.locator('#expedition-create').isDisabled());
    assert.ok((await page.locator('#expedition-controls').innerText()).includes('disabled in this saved campaign'));
    await page.locator('[data-ui="campaign-settings"]').click();
    assert.ok(await page.locator('#fjord-exploration').isVisible());
    await page.locator('#fjord-exploration').check();
    assert.deepEqual((await core()).discovery, initial.discovery, 'Changing the new-campaign option never retrofits the current save');
    await page.locator('#fjord-new').click();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world?.version === 2);
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if ((await page.locator('#fjord-run').getAttribute('aria-label')) === 'Pause simulation') await page.locator('#fjord-run').click();
    assert.ok((await core()).discovery);
    report.checks.push('Old save keeps discovery disabled; visible new-campaign option creates one live island rival');
    console.log('PASS: Explicit new-campaign discovery option');
    await context.close();

    context = await openScenario('exploration-800');
    state = await core();
    const fixture = JSON.parse(await readFile('docs/qa/integrated-playtest-180/exploration-800.json', 'utf8'));
    assert.ok(state.discovery && state.world.version === 2);
    assert.deepEqual(state.stocks, fixture.fjord.campaign.stocks);
    assert.deepEqual(state.time, fixture.fjord.campaign.time);
    assert.equal(state.rngState, fixture.fjord.campaign.rngState);
    const foodBefore = state.stocks.food;
    assert.equal((await saved()).pace.running, false);
    const groupId = Object.keys(state.world.groups)[0];
    const members = [...state.world.groups[groupId].memberIds];
    assert.equal(members.length, 2);
    await homeSelection(Object.keys(state.households)[0]);
    await page.locator('button[data-surface="expeditions"]').click();
    assert.ok(await page.locator('#expedition-create').isEnabled());
    await page.locator(`details[data-group="${groupId}"] > summary`).click();
    const member = page.locator(`[data-member-group="${groupId}"][data-member="${members[0]}"]`);
    await member.uncheck();
    await page.waitForFunction(({ groupId }) => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.groups[groupId].memberIds.length === 1, { groupId });
    await member.check();
    await page.waitForFunction(({ groupId }) => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.groups[groupId].memberIds.length === 2, { groupId });
    assert.equal(await page.locator('[data-member^="island-rival"]').count(), 0);
    await screenshot('expedition-ready');
    console.log('PASS: QA exploration scenario, selected-home access and inline group membership');
    await page.locator(`[data-start="${groupId}"]`).click();
    await page.locator('#expedition-start-confirm').click();
    const suppliedFood = foodBefore - members.length * 2;
    await page.waitForFunction(expected => Number(document.querySelector('#fjord-food').textContent) === expected, suppliedFood);
    assert.equal((await saved()).pace.running, false);
    await page.locator(`[data-explore="${groupId}"]`).click();
    const snapshot = await saved();
    const owner = SharedSettlement.restore(JSON.stringify(snapshot), 'fjord');
    const surface = createBlueprintSurface(owner.fjord.blueprint);
    const actors = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered));
    const origins = Object.fromEntries(members.map(id => {
        const actor = actors.find(actor => actor.id === id && actor.kind === 'persona');
        return [id, { x: actor.position[0], z: actor.position[2] }];
    }));
    const center = owner.fjord.blueprint.settlement.center;
    let destination;
    for (const [dx, dz] of [[20, 0], [-20, 0], [0, 20], [0, -20], [30, 15], [-30, -15]]) {
        try {
            const offer = owner.session.exploreOffer(groupId, { x: center.x + dx, z: center.z + dz }, origins);
            const candidate = { ...offer.target, y: surface.surfaceHeightAt(offer.target.x, offer.target.z) };
            const screen = await screenPoint(candidate);
            if (screen.x > 30 && screen.x < 1400 && screen.y > 100 && screen.y < 780) {
                destination = { ...candidate, screen }; break;
            }
        } catch {}
    }
    assert.ok(destination, 'A real, visible reachable land destination must exist');
    await page.mouse.click(destination.screen.x, destination.screen.y);
    await page.waitForFunction(groupId => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions)
        .some(mission => mission.groupId === groupId && mission.status === 'Traveling'), groupId);
    assert.equal((await core()).stocks.food, suppliedFood);
    await page.locator('#fjord-run').click();
    await page.waitForFunction(groupId => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions)
        .some(mission => mission.groupId === groupId && mission.status === 'Exploring'), groupId);
    await page.locator('#fjord-run').click();
    if (!(await page.locator('#fjord-workspace').isVisible())) {
        await page.locator('button[data-surface="expeditions"]').click();
    }
    await page.locator(`[data-recall="${groupId}"]`).click();
    await page.locator('#fjord-run').click();
    await page.waitForFunction(groupId => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions)
        .some(mission => mission.groupId === groupId && mission.status === 'Returned'), groupId);
    await page.locator('#fjord-run').click();
    await screenshot('expedition-returned');
    report.checks.push('Selected home never hides Expeditions; inline membership works; real confirmation spends 4 Food once; actual world targeting, travel and return complete');
    await context.close();
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
    console.log('Home and expedition browser checks: PASS');
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error);
    if (page && !page.isClosed()) await screenshot('failure');
    console.log('Browser verification failed:', String(error));
    throw error;
} finally {
    await writeFile(output + '/observations.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
