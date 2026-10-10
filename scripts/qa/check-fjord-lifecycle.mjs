import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-lifecycle';
const checks = [], errors = [];
let state = core.createCampaign(32, { initialFood: 10000, initialMaterials: 1000 },
    { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
for (const id of Object.keys(state.personas)) {
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: id,
        occupation: id === 'founder-1' ? 'fisher' : id === 'founder-2' ? 'woodworker' : null });
}
// Controlled partial-Winter fixture: next real work tick crosses both integer thresholds.
for (const id of ['founder-1', 'founder-2']) {
    const person = state.personas[id];
    person.workProgress = state.mechanics.config.workPerUnit - 1;
    state.mechanics.people[id].progress[person.occupation] = person.workProgress;
}
for (const cow of Object.values(state.landing.cattle).filter(c => c.sex === 'female'))
    cow.foodProgress = state.ticksPerWinter * 10000 - 1;
const fixture = core.serializeState(state);
const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.log('Browser: ' + message.text()); });
    await page.addInitScript(json => {
        if (!sessionStorage.getItem('pillagers.fjord-play.active.v1'))
            sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
    }, fixture);
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#fjord-canvas');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    // Warm the initial frame before starting the real clock; readiness also exposes model data.
    await page.waitForTimeout(1500);
    await page.screenshot();
    console.log('Initial scene rendered.');
    assert.equal(await page.locator('#fjord-production-labels').count(), 1, 'Production overlay exists.');
    assert.equal(await page.locator('#fjord-production-labels span').count(), 0, 'Loading does not replay history.');
    await page.evaluate(() => {
        window.qaProduction = [];
        window.qaMotion = {};
        const root = document.querySelector('#fjord-production-labels');
        new MutationObserver(() => {
            for (const element of root.querySelectorAll('span')) {
                if (element.hidden) continue;
                const record = { text: element.textContent, ...element.dataset };
                const key = record.producerKind + ':' + record.producerId;
                const opacity = Number(element.style.opacity);
                const y = Number(element.style.transform.match(/,([^p]+)px/)[1]);
                const motion = window.qaMotion[key] ?? { firstY: y, lastY: y, maxOpacity: opacity, minOpacity: opacity };
                motion.lastY = y;
                motion.maxOpacity = Math.max(motion.maxOpacity, opacity);
                motion.minOpacity = Math.min(motion.minOpacity, opacity);
                window.qaMotion[key] = motion;
                if (!window.qaProduction.some(item => item.producerKind === record.producerKind && item.producerId === record.producerId && item.resource === record.resource))
                    window.qaProduction.push(record);
            }
        }).observe(root, { childList: true, subtree: true, attributes: true });
    });
    await page.selectOption('#fjord-cycle', '1');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForFunction(() => window.qaProduction.some(item => item.personaId === 'founder-1' && item.resource === 'food') &&
        window.qaProduction.some(item => item.personaId === 'founder-2' && item.resource === 'materials') &&
        window.qaProduction.some(item => item.cattleId === 'cattle-1' && item.resource === 'food'));
    const labels = await page.evaluate(() => window.qaProduction);
    await mkdir(output, { recursive: true });
    await Promise.all([page.screenshot({ path: output + '/production.png' }),
        page.getByRole('button', { name: 'Pause', exact: true }).click()]);
    assert.match(labels.find(item => item.personaId === 'founder-1').text, /\+1 Food/);
    assert.match(labels.find(item => item.personaId === 'founder-2').text, /^\+1 Materials$/);
    assert.match(labels.find(item => item.cattleId === 'cattle-1').text, /^\+1 Food$/);
    assert.ok(labels.every(item => /^\+\d+ (Food|Materials)$/.test(item.text)), 'Labels omit names.');
    await mkdir(output, { recursive: true });
    await page.getByText('Campaign', { exact: true }).click();
    const exported = async () => {
        const [download] = await Promise.all([page.waitForEvent('download'),
            page.getByRole('button', { name: 'Export canonical JSON', exact: true }).click()]);
        try { return JSON.parse(await readFile(await download.path(), 'utf8')); }
        finally { await download.delete(); }
    };
    const actual = await exported();
    const expected = core.applyCommand(state, { type: 'AdvanceTicks', ticks: actual.time.tick });
    assert.deepEqual(actual, JSON.parse(core.serializeState(expected)));
    assert.ok(actual.events.some(e => e.type === 'ResourceProduced' && e.personaId === 'founder-1' && e.details.resource === 'food' && e.details.units === 1));
    assert.ok(actual.events.some(e => e.type === 'ResourceProduced' && e.personaId === 'founder-2' && e.details.resource === 'materials' && e.details.units === 1));
    console.log('Real output captured and canonical replay matched.');
    await page.waitForTimeout(3200);
    assert.equal(await page.locator('#fjord-production-labels span').count(), 0, 'Effects fade while paused.');
    const motion = await page.evaluate(() => window.qaMotion);
    assert.ok(Object.values(motion).some(item => item.firstY - item.lastY > 5 &&
        item.maxOpacity - item.minOpacity > .5), 'Production rises and gradually fades in real browser frames.');
    assert.deepEqual(await exported(), actual, 'Fading does not advance gameplay.');
    checks.push('Real resident and cow +1 Food and resident +1 Materials match producer IDs, exact Core replay and stock deltas; pause allows only visual fading.');
    console.log('Paused fade preserves canonical state.');
    await page.getByRole('button', { name: 'Save locally', exact: true }).click();
    const saved = actual;
    await page.getByRole('button', { name: '+1 Winter', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#fjord-winter').textContent.includes('Winter 801'));
    const batch = await exported();
    assert.deepEqual(batch, JSON.parse(core.serializeState(core.applyCommand(saved, { type: 'AdvanceWinter' }))));
    const totals = JSON.parse(await page.locator('#fjord-production-labels').getAttribute('data-totals'));
    assert.equal(totals.reduce((sum, item) => sum + item.units, 0), batch.events.filter(e => e.type === 'ResourceProduced' || e.type === 'CattleFoodProduced').reduce((sum, e) => sum + e.details.units, 0));
    console.log('Batched output matched.');
    await page.getByRole('button', { name: 'Load locally', exact: true }).click();
    await page.locator('#fjord-notice').filter({ hasText: 'Shared campaign loaded, paused.' }).waitFor();
    assert.deepEqual(await exported(), saved, 'A partial Winter is restored exactly.');
    assert.equal(await page.locator('#fjord-production-labels span').count(), 0, 'Loading never replays prior effects.');
    assert.deepEqual(JSON.parse(await page.locator('#fjord-production-labels').getAttribute('data-totals')), []);
    await Promise.all([page.waitForURL('**/play', { waitUntil: 'domcontentloaded' }),
        page.getByRole('link', { name: '2D Settlement', exact: true }).click({ noWaitAfter: true })]);
    await page.locator('#entity-picker').waitFor();
    console.log('2D handoff loaded.');
    await Promise.all([page.waitForURL('**/fjord-play', { waitUntil: 'domcontentloaded' }),
        page.getByRole('link', { name: '3D Fjord', exact: true }).click({ noWaitAfter: true })]);
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#fjord-production-labels span').count(), 0, 'View handoff never replays effects.');
    await page.getByText('Campaign', { exact: true }).click();
    assert.deepEqual(await exported(), saved);
    await page.getByRole('button', { name: '+1 Winter', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#fjord-winter').textContent.includes('Winter 801'));
    const afterLoad = await exported();
    const newTotals = JSON.parse(await page.locator('#fjord-production-labels').getAttribute('data-totals'));
    assert.equal(newTotals.reduce((sum, item) => sum + item.units, 0), afterLoad.events.slice(saved.events.length).filter(e => e.type === 'ResourceProduced' || e.type === 'CattleFoodProduced').reduce((sum, e) => sum + e.details.units, 0));
    checks.push('Batched output totals remain exact; partial-Winter load and 2D/3D handoff never replay history, while new post-load output still appears.');
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: output + '/tablet.png' });
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ checks, browserErrors: errors }, null, 2));
    console.log(checks.join('\n'));
} finally { await browser.close(); }
