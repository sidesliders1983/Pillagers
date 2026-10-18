import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { siteRoutes } = loadTypeScript(new URL('../../src/world-generation/SiteNavigation.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
const output = 'artifacts/rival-visibility';
await mkdir(output, { recursive: true });
const report = { status: 'RUNNING', checks: [], errors: [], campaignSeed: 32 };
const owner = new SharedSettlement(32, 123, true, 'island-pool-v1', 'summer-800-v1');
owner.fjord.enableDiscovery();
const world = owner.fjord.blueprint;
report.landscapeSeed = world.config.seed;
const rival = owner.session.readSnapshot().world.targetClans['island-rival'];
assert.equal(Object.keys(rival.personas).length, 10);
owner.session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
const actor = owner.fjord.readProjection().entities.find(entity => entity.kind === 'persona' && entity.id === 'founder-1').transform;
const origin = { x: actor.x, z: actor.z };
const route = siteRoutes(world.navigation, origin)(world.rivalSite.center);
owner.session.command({ type: 'StartExpedition', groupId: 'group-1', testFoodPerMember: 10 });
let index = 8;
const send = () => {
    owner.session.command({ type: 'ExploreArea', groupId: 'group-1', target: route[Math.min(index, route.length - 1)],
        ...(index === 8 ? { origins: { 'founder-1': origin } } : {}) });
    index += 8;
};
send();
for (let ticks = 4; ticks <= 2400; ticks += 4) {
    owner.session.command({ type: 'AdvanceTicks', ticks: 4 });
    const state = owner.session.readSnapshot();
    const mission = core.inspectSpatialExpeditions(state).missions[0];
    if (core.inspectIslandMissions(state).sites.length) {
        report.confirmedTicks = ticks;
        report.position = mission.position;
        report.supplies = mission.supplies;
        break;
    }
    assert.ok(!['Returned', 'Stranded', 'Returning'].includes(mission.status),
        `The accepted land route must not abort at tick ${ticks}`);
    if (mission.status === 'Exploring' && index < route.length + 8) send();
}
assert.ok(report.confirmedTicks, 'Actual group movement must discover the reserved rival site');
const view = owner.fjord.readProjection().rival;
assert.ok(view.entities.some(entity => entity.kind === 'household'), 'Observed founding tents reach the view');
assert.ok(view.entities.some(entity => entity.kind === 'persona'), 'Observed residents reach the view');
report.checks.push('A fresh seed-32 campaign physically reaches and observes its real rival with a paid test pack');
const save = JSON.parse(owner.persist());
save.pace.running = false;
const center = world.rivalSite.center;
const height = createBlueprintSurface(world).surfaceHeightAt(center.x, center.z);
save.presentation = { quality: 'low', effects: 'off', camera: {
    position: [center.x + 45, height + 65, center.z + 72], target: [center.x, height, center.z] } };
await writeFile(output + '/visited.json', JSON.stringify(save));
console.log('Physical seed-32 journey passed; loading its real 3D scene.');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(save => sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save)), save);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    report.rendered = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rival));
    assert.equal(report.rendered.currentlyObserved, true);
    for (const kind of ['household', 'persona', 'cattle', 'campfire'])
        assert.ok(report.rendered.rendered.some(entity => entity.kind === kind && !entity.placeholder),
            `The actual ${kind} asset must be instantiated`);
    await page.screenshot({ path: output + '/seed-32-observed.png' });
    report.checks.push('The actual /fjord-play renderer loads observed tent, resident, cattle and campfire assets without placeholders');
    const before = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    const after = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign);
    assert.deepEqual(after, before);
    assert.ok(await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rival).rendered.some(entity => entity.kind === 'household')));
    report.checks.push('Reload preserves the exact paused campaign and observed rival actors');
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile(output + '/browser.json', JSON.stringify(report, null, 2));
    await browser.close();
}
