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
    await page.touchscreen.tap(goal.screenX,goal.screenY);
    console.log('Target response:', await page.locator('#expedition-status').innerText());
    await page.locator('#expedition-confirm:enabled').waitFor();
    await page.locator('#expedition-confirm').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'artifacts/spatial-expeditions/proposal.png' });
    const departure = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-rendered'));
    await page.locator('#expedition-confirm').tap();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial);
    console.log('Dispatched.');
    const dispatched = await saved();
    assert.deepEqual(dispatched.fjord.campaign.discovery, original.fjord.campaign.discovery);
    const departureMission=dispatched.fjord.campaign.world.spatial.missions['explore-1'];
    assert.deepEqual(departureMission.memberIds,memberIds);
    for (const id of memberIds) {
        const actor=departure.find(p=>p.kind==='persona' && p.id===id);
        const start=departureMission.memberRoutes[id][0];
        assert.ok(Math.hypot(start.x-actor.position[0],start.z-actor.position[2])<.01,
            'Every route starts at the real body, without campfire teleportation');
    }
    await page.screenshot({path:'artifacts/spatial-expeditions/departure.png'});
    await page.locator('#fjord-run').tap();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
        .fjord.campaign.world.spatial.missions['explore-1'].travelled >= 90);
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
    const entities = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-entities'));
    assert.equal(entities.filter(e => e.id === memberId && e.status.expedition).length,1);
    await page.screenshot({ path: 'artifacts/spatial-expeditions/walking.png' });
    console.log('Journey phase before reload:', mission.status);
    await writeFile('artifacts/spatial-expeditions/phase.json', JSON.stringify({ status: mission.status, travelled: mission.travelled, distance: mission.distance }));
    console.log('Walking; reloading.');
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.deepEqual((await saved()).fjord.campaign, walking.fjord.campaign);
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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/spatial-expeditions/phone.png' });
    await page.locator('#fjord-next').tap();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
        .fjord.campaign.world.spatial.missions['explore-1'].status === 'Returned');
    assert.deepEqual(errors, []);
    const sourceHashes = {};
    for (const file of ['src/simulation/SpatialExpeditions.ts','src/fjord-play/ExpeditionPanel.ts','src/fjord-play/FjordPlay.ts'])
        sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    await writeFile('artifacts/spatial-expeditions/browser.json',JSON.stringify({ sourceHashes, touch: true, groupId: 'group-1', memberId, memberIds, individualOrigins:true, runningAnimation:true,
        runtime, recallRequested, automaticReturn: !recallRequested, travelled: mission.travelled, reloadExact: true, dispatchDoesNotReveal: true, errors }, null, 2));
    console.log('Real 3D group flow passed; '+(recallRequested ? 'recall requested.' : 'automatic return already underway.'));
} finally { await browser.close(); }