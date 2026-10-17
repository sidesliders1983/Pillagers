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
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5183';
const output = 'docs/qa/mobile-horizon-182';
await mkdir(output, { recursive: true });
const report = { status: 'RUNNING', origin, checks: [], layouts: [], errors: [], sourceHashes: {} };
for (const file of ['MobileShell.ts', 'mobile-horizon.css', 'FjordHeader.ts', 'FjordInterface.ts', 'FjordPlay.ts', 'ExpeditionPanel.ts']) {
    report.sourceHashes[file] = createHash('sha256').update(await readFile('src/fjord-play/' + file)).digest('hex');
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let context, page;
const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
const core = async () => (await saved()).fjord.campaign;
const screenshot = name => page.screenshot({ path: output + '/' + name + '.jpg', type: 'jpeg', quality: 87 });
const tap = selector => page.locator(selector).tap();
const toolbar = () => page.locator('#expedition-mode');

async function scenario(name, mobile = true) {
    context = await browser.newContext({ viewport: { width: mobile ? 852 : 1440, height: mobile ? 393 : 900 },
        isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(300000);
    page.on('pageerror', error => report.errors.push(error.message));
    console.log('Loading normal 3D game:', name, mobile ? 'touch' : 'desktop');
    await page.goto(origin + '/playtest/');
    await page.locator(`[data-scenario="${name}"]`).click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    console.log('Scene ready:', name);
}
async function safeInsets(left = 44, right = 44, bottom = 21) {
    await page.locator('#fjord-play').evaluate((root, { left, right, bottom }) => {
        root.style.setProperty('--fjord-safe-left', left + 'px');
        root.style.setProperty('--fjord-safe-right', right + 'px');
        root.style.setProperty('--fjord-safe-bottom', bottom + 'px');
    }, { left, right, bottom });
}
async function directory(kind) {
    await tap('#fjord-mobile-menu');
    await tap('button[data-surface="settlement"]');
    await tap(`[data-ui="directory"][data-kind="${kind}"]`);
}
async function inspect(kind, id) {
    await directory(kind);
    await tap(`#fjord-directory [data-ui="inspect"][data-id="${id}"]`);
}
async function layout(name) {
    const measured = await page.evaluate(() => {
        const root = document.querySelector('#fjord-play');
        const safe = getComputedStyle(root);
        const left = parseFloat(safe.getPropertyValue('--fjord-safe-left')) || 0;
        const right = innerWidth - (parseFloat(safe.getPropertyValue('--fjord-safe-right')) || 0);
        const bottom = innerHeight - (parseFloat(safe.getPropertyValue('--fjord-safe-bottom')) || 0);
        const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        const controls = [...root.querySelectorAll('button,summary,select,input')].filter(node => {
            if (!node.checkVisibility()) return false;
            const r = node.getBoundingClientRect();
            if (!r.width || !r.height) return false;
            const x = r.x + r.width / 2, y = r.y + r.height / 2;
            return node.contains(document.elementFromPoint(x, y));
        }).map(node => ({ id: node.id || node.dataset.ui || node.getAttribute('aria-label') || node.textContent.trim().slice(0, 45),
            tag: node.tagName, type: node.getAttribute('type'), ...box(node) }));
        const badTargets = controls.filter(r => r.type !== 'checkbox' && (r.width < 43.9 || r.height < 43.9));
        const outOfBounds = controls.filter(r => r.x < left - .5 || r.x + r.width > right + .5 || r.y < -.5 || r.y + r.height > bottom + .5);
        const header = box(document.querySelector('#fjord-header'));
        const nav = box(document.querySelector('#fjord-navigation'));
        const attention = box(document.querySelector('#fjord-attention'));
        const counters = [...document.querySelectorAll('.fjord-kpis button')].map(box);
        return { width: innerWidth, height: innerHeight, left, right, bottom, header, nav, attention, counters,
            badTargets, outOfBounds, controls, scrollWidth: document.documentElement.scrollWidth,
            defaultWorldFraction: 1 - (header.width * header.height + nav.width * nav.height + attention.width * attention.height) / (innerWidth * innerHeight) };
    });
    report.layouts.push({ name, ...measured });
    assert.deepEqual(measured.badTargets, [], name + ': touch targets');
    assert.deepEqual(measured.outOfBounds, [], name + ': safe bounds');
    assert.ok(measured.scrollWidth <= measured.width, name + ': horizontal overflow');
    return measured;
}
async function projected(point) {
    const camera = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.camera));
    const box = await page.locator('#fjord-canvas').boundingBox();
    const clip = new Vector3(point.x, point.y, point.z)
        .applyMatrix4(new Matrix4().fromArray(camera.world).invert())
        .applyMatrix4(new Matrix4().fromArray(camera.projection));
    return { x: box.x + (clip.x + 1) * box.width / 2, y: box.y + (1 - clip.y) * box.height / 2 };
}
async function waitMission(groupId, status) {
    await page.waitForFunction(({ groupId, status }) =>
        Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions)
            .some(m => m.groupId === groupId && m.status === status), { groupId, status });
}
async function flag(groupId) {
    const owner = SharedSettlement.restore(JSON.stringify(await saved()), 'fjord');
    const surface = createBlueprintSurface(owner.fjord.blueprint);
    const state = owner.session.readSnapshot();
    const actors = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered));
    const origins = Object.fromEntries(state.world.groups[groupId].memberIds.map(id => {
        const actor = actors.find(e => e.id === id && e.kind === 'persona');
        return [id, { x: actor.position[0], z: actor.position[2] }];
    }));
    const mission = Object.values(state.world.spatial.missions).find(m => m.groupId === groupId && m.status !== 'Returned');
    const center = owner.fjord.blueprint.settlement.center;
    const hud = await toolbar().boundingBox();
    for (const [dx, dz] of [[20, 0], [-20, 0], [0, 20], [0, -20], [35, 15], [-35, -15], [5, 5], [-5, -5]]) {
        try {
            const offer = owner.session.exploreOffer(groupId, { x: center.x + dx, z: center.z + dz }, mission.status === 'Prepared' ? origins : undefined);
            const p = await projected({ ...offer.target, y: surface.surfaceHeightAt(offer.target.x, offer.target.z) });
            if (p.x > 52 && p.x < 800 && p.y > 70 && p.y < hud.y - 10) return p;
        } catch {}
    }
    throw Error('No visible walkable flag above the mobile controls.');
}

try {
    await scenario('funded-800');
    const original = await core();
    for (const viewport of [{ width: 852, height: 393 }, { width: 667, height: 375 }, { width: 932, height: 430 },
        { width: 1024, height: 636 }, { width: 640, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await safeInsets(viewport.width > 640 ? 44 : 0, viewport.width > 640 ? 44 : 0, 21);
        const m = await layout('default-' + viewport.width);
        if (viewport.width === 852) assert.ok(m.defaultWorldFraction >= .84);
        if (viewport.width > 600) assert.ok(m.counters.every(r => r.y < m.header.y + m.header.height));
        await screenshot('default-' + viewport.width);
    }
    assert.deepEqual(await core(), original, 'Rotation and layout leave the complete campaign unchanged');
    await page.setViewportSize({ width: 852, height: 393 });
    await safeInsets();
    for (const resource of ['food', 'materials', 'settlement', 'livestock']) {
        await tap(`[data-stock="${resource}"]`);
        await page.locator('#fjord-workspace:not([hidden])').waitFor();
        await tap('[data-ui="close-workspace"]');
    }
    await tap('#fjord-menu > summary');
    await page.locator('#fjord-menu-pacing-slot #fjord-cycle').waitFor();
    assert.ok(await page.locator('#fjord-menu-next-slot #fjord-next').isVisible());
    await layout('settings');
    await page.keyboard.press('Escape');
    await inspect('persona', 'founder-1');
    assert.equal(await page.locator('.fjord-traits').count(), 0);
    await layout('person-peek');
    await screenshot('person-peek');
    await tap('[data-ui="expand-card"]');
    await page.locator('.fjord-traits').waitFor();
    assert.equal(await page.locator('.fjord-card-heading h2').evaluate(node => node === document.activeElement), true);
    const cameraBeforeKeys = await page.locator('#fjord-canvas').getAttribute('data-camera');
    await page.keyboard.press('ArrowRight');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#fjord-canvas').getAttribute('data-camera'), cameraBeforeKeys);
    assert.ok((await page.locator('#entity-panel').innerText()).includes('Occupation fit'));
    assert.ok((await page.locator('#entity-panel').innerText()).includes('Partner'));
    await layout('person-details');
    await screenshot('person-details');
    await page.setViewportSize({ width: 390, height: 844 });
    await safeInsets(0, 0, 21);
    await layout('portrait-person-details');
    await screenshot('portrait-person-details');
    await page.setViewportSize({ width: 852, height: 393 });
    await safeInsets();
    await tap('[data-ui="close-card"]');
    assert.deepEqual(await core(), original, 'Inspecting actual personal data never advances or changes the campaign');
    report.checks.push('Six phone/tablet/portrait artboards; 44px controls, simulated safe areas, no horizontal overflow; personal peek/details preserve full campaign');
    console.log('PASS: Responsive shell and personal details');

    const actors = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered));
    let chosen;
    for (const actor of actors.filter(e => e.kind === 'household')) {
        const point = await projected({ x: actor.position[0], y: actor.position[1], z: actor.position[2] });
        if (point.x > 70 && point.x < 720 && point.y > 85 && point.y < 280) { chosen = { ...point, id: actor.id }; break; }
    }
    assert.ok(chosen, 'A visible tent is available for the four-tap journey');
    await page.touchscreen.tap(chosen.x, chosen.y);
    await tap('[data-ui="work-menu"]');
    assert.equal(await page.locator('[data-ui="plan"]').count(), 10);
    await tap('[data-ui="farmyard"]');
    await layout('farmyard-review');
    await screenshot('farmyard-review');
    await tap('[data-ui="commit-plan"]');
    await page.waitForFunction(() => document.querySelector('#fjord-materials').textContent === '15');
    const built = await core();
    const buildingId = built.residences[built.households[chosen.id].residenceId].buildingId;
    assert.equal(built.buildings[buildingId].specialization, 'farmer');
    assert.equal(Object.values(built.landing.cattle).filter(c => c.farmyardId === buildingId).length, 3);
    assert.deepEqual(built.time, original.time);
    assert.equal(built.rngState, original.rngState);
    await tap('[data-ui="expand-card"]');
    await layout('home-improvements');
    await screenshot('home-improvements');
    await tap('[data-ui="specialization"]');
    assert.equal(await page.locator('[data-ui="choose-specialization"]').count(), 11);
    await tap('[data-ui="cancel-task"]');
    await tap('[data-ui="upgrade-home"]');
    await page.waitForFunction(id => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.mechanics.buildings[id].upgradeLevel === 1, buildingId);
    assert.equal((await core()).stocks.materials, 10);
    const upgraded = await core();
    await page.locator('[data-ui="upgrade-home"]').evaluate(button => button.dataset.upgradeLevel = '0');
    await tap('[data-ui="upgrade-home"]');
    await page.locator('#fjord-notice').filter({ hasText: 'The home has changed' }).waitFor();
    assert.deepEqual(await core(), upgraded);
    await tap('[data-ui="close-card"]');
    await tap('#fjord-mobile-menu');
    await tap('#fjord-book');
    await page.locator('#clan-book-close').waitFor();
    await page.locator('#clan-book-close').click();
    await tap('#fjord-attention');
    await layout('attention');
    await screenshot('attention');
    await tap('[data-ui="close-workspace"]');
    report.checks.push('Four actual touch activations: world tent → Manage work → Set up farmyard → Confirm; house, farmer and three cattle committed once; all ten occupations and independent upgrades remain available; journal/attention accessible');
    console.log('PASS: Four-tap setup and management');
    const desktopInput = await context.newCDPSession(page);
    await desktopInput.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => !document.querySelector('#fjord-play').classList.contains('fjord-mobile'));
    assert.ok(await page.locator('button[data-surface="settlement"]').isVisible());
    assert.ok(await page.locator('#fjord-book').isVisible());
    assert.ok(await page.locator('#fjord-pacing-slot #fjord-cycle').isVisible());
    assert.equal(await page.locator('#fjord-mobile-menu').isVisible(), false);
    await page.locator('button[data-surface="settlement"]').click();
    await page.locator('[data-ui="directory"][data-kind="household"]').click();
    await page.locator(`#fjord-directory [data-ui="inspect"][data-id="${chosen.id}"]`).click();
    await page.locator('.fjord-home-improvements').waitFor();
    await screenshot('desktop-regression');
    await page.locator('button[data-surface="expeditions"]').click();
    assert.ok(await page.locator('#expedition-create').isDisabled());
    assert.deepEqual(await core(), upgraded, 'Desktop layout and old-save gating keep the same complete campaign');
    await desktopInput.detach();
    report.checks.push('Desktop 1440px controls and full home card restored after viewport/input change; exploration-disabled save remains gated; stale upgrade error remains visible without a charge');
    await context.close();

    await scenario('exploration-800');
    await safeInsets();
    const initial = await core();
    const groupId = Object.keys(initial.world.groups)[0];
    await tap('button[data-surface="expeditions"]');
    await tap(`[data-start="${groupId}"]`);
    await layout('packing-review');
    await tap('#expedition-start-cancel');
    assert.deepEqual(await core(), initial);
    await tap(`[data-start="${groupId}"]`);
    await tap('#expedition-start-confirm');
    await waitMission(groupId, 'Prepared');
    await toolbar().waitFor();
    assert.equal((await core()).stocks.food, initial.stocks.food - 4);
    assert.equal((await saved()).pace.running, false);
    assert.equal(await toolbar().locator('[data-expedition-action="clock"]').count(), 0);
    const prepared = await core();
    await layout('exploration-choose');
    await screenshot('exploration-choose');
    const touch = await context.newCDPSession(page);
    const gesture = (type, points) => touch.send('Input.dispatchTouchEvent', {
        type, touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
    await gesture('touchStart', [[350, 120]]);
    await gesture('touchMove', [[370, 122]]);
    await gesture('touchEnd', []);
    await gesture('touchStart', [[350, 120], [450, 120]]);
    await gesture('touchMove', [[335, 120], [465, 120]]);
    await gesture('touchMove', [[335, 120]]);
    await gesture('touchMove', [[345, 122]]);
    await gesture('touchEnd', []);
    assert.ok(await page.locator('#expedition-send').isDisabled(), 'Drag/pinch release never plants a flag');
    assert.deepEqual(await core(), prepared);
    await touch.detach();
    await tap('#expedition-details');
    await page.locator('#expedition-mobile-details:not([hidden])').waitFor();
    assert.deepEqual(await core(), prepared);
    await tap('#expedition-details');
    const point = await flag(groupId);
    await page.touchscreen.tap(point.x, point.y);
    await page.locator('#expedition-send:enabled').waitFor();
    assert.deepEqual(await core(), prepared, 'Preview does not reveal, spend or dispatch');
    await screenshot('exploration-preview');
    await tap('#expedition-cancel');
    assert.deepEqual(await core(), prepared);
    await toolbar().locator('[data-explore]').tap();
    const next = await flag(groupId);
    await page.touchscreen.tap(next.x, next.y);
    await tap('#expedition-send');
    await waitMission(groupId, 'Traveling');
    assert.deepEqual((await core()).time, prepared.time);
    assert.equal((await saved()).pace.running, false);
    await tap('#fjord-run');
    await waitMission(groupId, 'Exploring');
    await tap('#fjord-run');
    await layout('exploration-active');
    await screenshot('exploration-active');
    const exploring = await core();
    await toolbar().locator('[data-recall]').tap();
    await waitMission(groupId, 'Returning');
    assert.deepEqual((await core()).stocks, exploring.stocks);
    await tap('#fjord-run');
    await waitMission(groupId, 'Returned');
    await tap('#fjord-run');
    await toolbar().waitFor({ state: 'hidden' });
    report.checks.push('Real mobile expedition: cancelled quote, exact 4-Food pack, read-only supplies/flag preview, Cancel, explicit Send and header Resume, discovery, conservative return and physical homecoming; no second clock');
    console.log('PASS: Real expedition loop');
    await tap('button[data-surface="expeditions"]');
    const foodBeforePacking = (await core()).stocks.food;
    await tap(`[data-start="${groupId}"]`);
    await tap('#expedition-start-confirm');
    await waitMission(groupId, 'Prepared');
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await safeInsets();
    await toolbar().waitFor();
    assert.equal((await saved()).pace.running, false);
    assert.equal((await core()).stocks.food, foodBeforePacking - 4);
    await toolbar().locator('[data-cancel-expedition]').tap();
    await toolbar().waitFor({ state: 'hidden' });
    assert.equal((await core()).stocks.food, foodBeforePacking - 4);
    report.checks.push('Native drag/pinch never confirms a flag; reload restores a prepared paused expedition without another charge; ending discards the pack without refund');
    await context.close();

    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    if (page && !page.isClosed()) await screenshot('failure');
    throw error;
} finally {
    await writeFile(output + '/observations.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
