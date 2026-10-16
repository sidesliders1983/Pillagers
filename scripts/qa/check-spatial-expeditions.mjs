import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { discoveryAt, inspectClanDiscovery } = loadTypeScript(new URL('../../src/simulation/ClanDiscovery.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await mkdir('artifacts/spatial-expeditions', { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin+'/fjord-play?discovery=1&debugDiscovery=1');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({timeout:180000});
    if (await page.locator('#fjord-run').innerText() === 'Pause') await page.locator('#fjord-run').tap();
    if (await page.getByRole('button', { name: 'Close founding chapter' }).count())
        await page.getByRole('button', { name: 'Close founding chapter' }).tap();
    const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    page.setDefaultTimeout(60000);
    console.log('Ready; campaign paused.');
    const original = await saved();
    await page.getByLabel('Game menu', { exact: true }).tap();
    await page.locator('#fjord-expeditions-open').click({ timeout: 5000 });
    await page.locator('#expedition-create').tap();
    await page.locator('details[data-group="group-1"]').waitFor();
    assert.equal(await page.locator('#expedition-name').count(),0,'No naming form');
    assert.match(await page.locator('details[data-group="group-1"] summary').innerText(),/Group 1.*0 members/);
    const memberIds = Object.values(original.fjord.campaign.personas).filter(p => p.deathWinter===null).slice(0,2).map(p=>p.id);
    const memberId=memberIds[0];
    for (const id of memberIds) {
        // The existing identity picker and actual scene tap share the same resident selection contract.
        await page.locator('#fjord-identities').evaluate(element => element.closest('details').open=true);
        await page.locator('#fjord-identities button[data-kind="persona"][data-id="'+id+'"]').tap();
        await page.locator('#expedition-join').selectOption('group-1');
        if (id===memberId) await page.screenshot({path:'artifacts/spatial-expeditions/recruit.png'});
        await page.locator('#expedition-add').tap();
        await page.waitForFunction(id => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
            .fjord.campaign.world.groups['group-1'].memberIds.includes(id),id);
        await page.locator('#entity-panel [data-action="clear"]').tap();
    }
    assert.match(await page.locator('details[data-group="group-1"] summary').innerText(),/2 members/);
    await page.screenshot({path:'artifacts/spatial-expeditions/groups.png'});
    console.log('Group created.');
    if (!await page.locator('details[data-group="group-1"]').evaluate(el=>el.open))
        await page.locator('details[data-group="group-1"] summary').tap();
    const beforeStart = await saved();
    await page.locator('[data-start="group-1"]').tap();
    await page.locator('#expedition-start-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#expedition-start-summary').innerText(),
        'This will cost 4 food (2 food per member). Are you sure?');
    await page.screenshot({ path: 'artifacts/spatial-expeditions/start-confirmation.png' });
    await page.locator('#expedition-start-cancel').tap();
    assert.deepEqual((await saved()).fjord.campaign, beforeStart.fjord.campaign);
    await page.locator('[data-start="group-1"]').tap();
    await page.locator('#expedition-start-confirm').tap();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
        .fjord.campaign.world.spatial?.missions['explore-1']?.status === 'Prepared');
    assert.equal((await saved()).fjord.campaign.stocks.food, beforeStart.fjord.campaign.stocks.food - 4);
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
    assert.equal(await page.locator('#fjord-cycle').inputValue(), '10');
    assert.equal(await page.locator('#fjord-cycle').isDisabled(), true);
    const preparedSnapshot = (await saved()).fjord.campaign;
    await page.screenshot({ path: 'artifacts/spatial-expeditions/prepared.png' });
    await page.locator('[data-explore="group-1"]').tap();
    if (await page.locator('#fjord-management-toggle').getAttribute('aria-expanded') === 'true')
        await page.locator('#fjord-management-toggle').tap();
    await page.mouse.move(500,450);
    await page.mouse.wheel(0,1800);
    await page.waitForTimeout(900);
    const { createCampaignIsland } = loadTypeScript(new URL('../../src/fjord-play/CampaignIsland.ts', import.meta.url));
    const { geographyIdentity } = loadTypeScript(new URL('../../src/fjord-play/FjordProjection.ts', import.meta.url));
    let fixture;
    try {
        fixture = JSON.parse(await readFile('artifacts/spatial-expeditions/geography.json', 'utf8'));
        assert.equal(geographyIdentity(fixture), original.fjord.layout.geographyId);
    } catch {
        fixture = createCampaignIsland(original.fjord.campaign.seed);
        await writeFile('artifacts/spatial-expeditions/geography.json', JSON.stringify(fixture));
    }
    const points = [];
    const nav = fixture.navigation;
    for (let row = 0; row < nav.rows; row += 8) for (let col = 0; col < nav.columns; col += 8)
        if (nav.cells[row*nav.columns+col]) points.push({ x: nav.bounds.minX+col*nav.spacing,
            z: nav.bounds.minZ+row*nav.spacing });
    const view = inspectClanDiscovery(original.fjord.campaign.discovery, original.fjord.campaign.clan.id);
    const target = await page.evaluate(points => {
        const canvas = document.querySelector('#fjord-canvas');
        return { rect: canvas.getBoundingClientRect().toJSON(), camera: JSON.parse(canvas.dataset.camera), points };
    }, points);
    const viewMatrix = new Matrix4().fromArray(target.camera.world).invert();
    const projection = new Matrix4().fromArray(target.camera.projection);
    const candidates = points.filter(p => discoveryAt(view,p.x,p.z) === 'unknown')
        .map(p => {
            const col = Math.round((p.x-fixture.terrain.bounds.minX)/fixture.terrain.spacing);
            const row = Math.round((p.z-fixture.terrain.bounds.minZ)/fixture.terrain.spacing);
            const point = new Vector3(p.x,fixture.terrain.heights[row*fixture.terrain.columns+col],p.z)
                .applyMatrix4(viewMatrix).applyMatrix4(projection);
            return { ...p, screenX: target.rect.left+(point.x+1)*target.rect.width/2,
                screenY: target.rect.top+(1-point.y)*target.rect.height/2, depth: point.z };
        }).filter(p => p.depth > -1 && p.depth < 1 && p.screenX > target.rect.left+50 &&
            p.screenX < target.rect.right-70 && p.screenY > target.rect.top+60 && p.screenY < target.rect.bottom-40);
    await writeFile('artifacts/spatial-expeditions/target-projection.json', JSON.stringify({target,candidates},null,2));
    await page.screenshot({ path: 'artifacts/spatial-expeditions/targeting.png' });
    assert.ok(candidates.length, 'An unknown accessible route point can be targeted from the real camera');
    const goal = candidates[0];
    console.log('Target', JSON.stringify(goal));
    const departure = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-rendered'));
    await page.touchscreen.tap(goal.screenX,goal.screenY);
    console.log('Target response:', await page.locator('#expedition-status').innerText());
    assert.equal(await page.locator('#expedition-confirm').count(),0,'A destination tap is the only send action');
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial?.missions['explore-1']?.status === 'Traveling');
    console.log('Dispatched.');
    assert.equal((await saved()).fjord.campaign.stocks.food, preparedSnapshot.stocks.food, 'Choosing a destination buys no extra Food');
    const dispatched = await saved();
    assert.deepEqual(dispatched.fjord.campaign.discovery, original.fjord.campaign.discovery);
    assert.equal(original.fjord.campaign.stocks.food-dispatched.fjord.campaign.stocks.food,
        dispatched.fjord.campaign.world.spatial.missions['explore-1'].foodCost,'One tap charges provisions exactly once');
    const departureMission=dispatched.fjord.campaign.world.spatial.missions['explore-1'];
    assert.deepEqual(departureMission.memberIds,memberIds);
    for (const id of memberIds) {
        const actor=departure.find(p=>p.kind==='persona' && p.id===id);
        const start=departureMission.memberRoutes[id][0];
        assert.ok(Math.hypot(start.x-actor.position[0],start.z-actor.position[2])<.01,
            'Every route starts at the real body, without campfire teleportation');
    }
    await page.screenshot({path:'artifacts/spatial-expeditions/departure.png'});
    await page.screenshot({path:'artifacts/spatial-expeditions/direct-dispatch.png'});
    // Headless Edge keeps background pages visible. Exercise the public visibilitychange boundary
    // with an explicitly simulated browser visibility state, not a claim of physical-device coverage.
    await page.locator('#fjord-run').tap();
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelector('#fjord-run').textContent === 'Start');
    const hiddenState = (await saved()).fjord.campaign;
    await page.waitForTimeout(1200);
    assert.deepEqual((await saved()).fjord.campaign, hiddenState, 'Hidden-tab handling stops ticks and supplies');
    await page.evaluate(() => {
        delete document.hidden; delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start', 'Returning from hidden stays paused');
    assert.deepEqual((await saved()).fjord.campaign, hiddenState, 'No offline catch-up');
    await page.locator('#fjord-run').tap();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
        .fjord.campaign.world.spatial.missions['explore-1'].travelled >= 36, undefined, { timeout: 90000 });
    await page.locator('#fjord-run').tap();
    await page.waitForTimeout(300);
    const movement = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-rendered'))
        .filter(p=>p.kind==='persona' && memberIds.includes(p.id));
    await writeFile('artifacts/spatial-expeditions/movement.json',JSON.stringify(movement,null,2));
    assert.equal(movement.length,2);
    const travelling=movement.filter(p=>p.expeditionWalking);
    assert.ok(travelling.length>0 && travelling.every(p=>p.motion?.clip==='Run'),
        'Native running animation on every still-travelling resident; early arrivals idle');
    const runtime = [];
    for (const quality of ['low', 'standard']) {
        await page.getByLabel('Game menu', { exact: true }).tap();
        await page.locator('#fjord-quality').selectOption(quality);
        await page.getByLabel('Game menu', { exact: true }).tap();
        await page.locator('#fjord-run').tap();
        runtime.push({ quality, ...await page.evaluate(async sampleCount => {
            const intervals = []; let previous = await new Promise(requestAnimationFrame);
            while (intervals.length < sampleCount) {
                const now = await new Promise(requestAnimationFrame);
                intervals.push(now-previous); previous = now;
            }
            return { intervals, stability: JSON.parse(document.querySelector('#fjord-canvas').dataset.stability) };
        }, Number(process.env.QA_FRAMES || 60)) });
        await page.locator('#fjord-run').tap();
    }
    const walking = await saved(), mission = walking.fjord.campaign.world.spatial.missions['explore-1'];
    assert.ok(mission.travelled > 0);
    assert.notEqual(walking.fjord.campaign.discovery.clans[walking.fjord.campaign.clan.id].explored,
        dispatched.fjord.campaign.discovery.clans[walking.fjord.campaign.clan.id].explored,
        'Reached positions map new ground, not merely an updated observation timestamp');
    assert.deepEqual(walking.fjord.campaign.events.slice(preparedSnapshot.events.length)
        .filter(event => event.type === 'ResourceProduced' && memberIds.includes(event.personaId)), [],
        'Explorers cannot produce home resources while away');
    for (const id of memberIds)
        assert.equal(await page.locator('#fjord-production-labels [data-persona-id="' + id + '"]').count(), 0,
            'Production popups cannot follow explorers');
    const entities = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-entities'));
    assert.equal(entities.filter(e => e.id === memberId && e.status.expedition).length,1);
    await page.screenshot({ path: 'artifacts/spatial-expeditions/walking.png' });
    const discoveredGroundColors = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-season-materials')).groundColors;
    console.log('Journey phase before reload:', mission.status);
    await writeFile('artifacts/spatial-expeditions/phase.json', JSON.stringify({ status: mission.status, travelled: mission.travelled, distance: mission.distance }));
    console.log('Walking; reloading.');
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.deepEqual((await saved()).fjord.campaign, walking.fjord.campaign);
    const freshGroundColors = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-season-materials')).groundColors;
    assert.deepEqual(discoveredGroundColors, freshGroundColors, 'Exploration must keep the same seasonal terrain colors as a fresh load at the identical time');
    await page.getByLabel('Game menu', { exact: true }).tap();
    await page.locator('#fjord-expeditions-open').tap();
    await page.locator('details[data-group="group-1"] summary').tap();
    const recallRequested = mission.status === 'Traveling' || mission.status === 'Exploring';
    if (recallRequested) {
        await page.locator('[data-recall="group-1"]').tap();
        await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
            .fjord.campaign.world.spatial.missions['explore-1'].status === 'Returning');
    } else {
        assert.ok(await page.locator('[data-recall="group-1"]').isDisabled(),
            'A party already returning/returned cannot receive a second recall');
    }
    let redirectedWhilePaused = false;
    if (recallRequested || mission.status === 'Returning') {
        assert.equal(await page.locator('[data-explore="group-1"]').isDisabled(), false,
            'A returning group can choose a new destination without starting the clock');
        const beforeRedirect = (await saved()).fjord.campaign;
        await page.locator('[data-explore="group-1"]').tap();
        const cameraState = await page.evaluate(() => {
            const canvas = document.querySelector('#fjord-canvas');
            return { camera: JSON.parse(canvas.dataset.camera), rect: canvas.getBoundingClientRect().toJSON() };
        });
        const col = Math.round((mission.target.x - fixture.terrain.bounds.minX) / fixture.terrain.spacing);
        const row = Math.round((mission.target.z - fixture.terrain.bounds.minZ) / fixture.terrain.spacing);
        const projected = new Vector3(mission.target.x, fixture.terrain.heights[row * fixture.terrain.columns + col], mission.target.z)
            .applyMatrix4(new Matrix4().fromArray(cameraState.camera.world).invert())
            .applyMatrix4(new Matrix4().fromArray(cameraState.camera.projection));
        const x = cameraState.rect.left + (projected.x + 1) * cameraState.rect.width / 2;
        const y = cameraState.rect.top + (1 - projected.y) * cameraState.rect.height / 2;
        assert.ok(x > cameraState.rect.left && x < cameraState.rect.right && y > cameraState.rect.top && y < cameraState.rect.bottom,
            'The original destination remains visible to the real camera');
        await page.touchscreen.tap(x, y);
        await page.waitForFunction(() => {
            const state = JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign;
            return state.world.spatial.missions['explore-1'].homeOrigins && state.world.spatial.missions['explore-1'].status === 'Traveling';
        });
        const afterRedirect = (await saved()).fjord.campaign;
        assert.deepEqual(afterRedirect.time, beforeRedirect.time, 'A paused order adds no campaign ticks');
        assert.deepEqual(afterRedirect.discovery, beforeRedirect.discovery, 'A new order reveals no planned terrain');
        assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
        await page.screenshot({ path: 'artifacts/spatial-expeditions/redirected.png' });
        redirectedWhilePaused = true;
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/spatial-expeditions/phone.png' });
    await page.locator('#fjord-next').tap();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
        .fjord.campaign.world.spatial.missions['explore-1'].status === 'Returned');
    assert.equal(await page.locator('#fjord-cycle').isDisabled(), false);
    assert.equal(await page.locator('#fjord-cycle').inputValue(), '3');
    assert.deepEqual(errors, []);
    const sourceHashes = {};
    for (const file of ['src/simulation/SpatialExpeditions.ts','src/fjord-play/ExpeditionPanel.ts','src/fjord-play/FjordPlay.ts','src/fjord-play/ProductionLabels.ts','src/fjord-play/FjordEntities.ts','src/fjord-play/FjordModels.ts','src/world/SeasonTint.ts','src/gameplay-lab/GameplaySession.ts','src/lore/BookLedger.ts'])
        sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    await writeFile('artifacts/spatial-expeditions/browser.json',JSON.stringify({ sourceHashes, touch: true, visibilityBoundarySimulated: true, hiddenStopsClockAndSupplies: true, noOfflineCatchup: true, startConfirmed: true, fixedFoodPerMember: 2, temporaryMinutesPer1000Ticks: 10, noRefund: true, noAwayProduction: true, noExplorerProductionLabels: true, directDispatch: true, groupId: 'group-1', memberId, memberIds, individualOrigins:true, runningAnimation:true,
        redirectedWhilePaused, seasonalColorStable: true, discoveredGroundColors, freshGroundColors, runtime, recallRequested, automaticReturn: !recallRequested, travelled: mission.travelled, reloadExact: true, dispatchDoesNotReveal: true, errors }, null, 2));
    console.log('Real 3D group flow passed; '+(recallRequested ? 'recall requested.' : 'automatic return already underway.'));
} finally { await browser.close(); }