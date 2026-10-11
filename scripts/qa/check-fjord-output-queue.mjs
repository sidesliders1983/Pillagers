import { toggleFjordCampaign, advanceFjordYear } from './fjord-header-controls.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { core } from './fjord-lifecycle-scenario.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-lifecycle';
let state = core.createCampaign(32, { initialFood: 10000, initialMaterials: 1000 },
    { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
for (const [index, id] of Object.keys(state.personas).entries())
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: id,
        occupation: index % 2 ? 'woodworker' : 'fisher' });
const baseline = state.events.length;
const next = core.applyCommand(state, { type: 'AdvanceWinter' });
const expected = new Map();
for (const event of next.events.slice(baseline).filter(e => e.type === 'ResourceProduced' || e.type === 'CattleFoodProduced')) {
    const key = event.type === 'CattleFoodProduced' ? 'cattle:' + event.details.cattleId + ':food' :
        'persona:' + event.personaId + ':' + event.details.resource;
    expected.set(key, (expected.get(key) || 0) + event.details.units);
}
assert.ok(expected.size > 6, 'The scenario must exercise the concurrent label cap.');
const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot();
    await page.evaluate(() => {
        window.qaQueue = { awards: {}, peak: 0, pending: 0, anchors: {}, boxes: [] };
        const root = document.querySelector('#fjord-production-labels');
        new MutationObserver(() => {
            const spans = [...root.querySelectorAll('span')];
            const records = window.qaQueue;
            records.peak = Math.max(records.peak, spans.length);
            records.pending = Math.max(records.pending, Number(root.dataset.pending || 0));
            for (const span of spans) {
                const key = span.dataset.producerKind + ':' + span.dataset.producerId + ':' + span.dataset.resource;
                records.awards[key] = Math.max(records.awards[key] || 0, Number(span.dataset.units));
                records.anchors[key] = span.dataset.anchor;
                if (!span.hidden && Number(span.style.opacity) > .8) {
                    const box = span.getBoundingClientRect();
                    if (!records.boxes.some(item => item.key === key))
                        records.boxes.push({ key, text: span.textContent, x: box.x, y: box.y, width: box.width, height: box.height });
                }
            }
        }).observe(root, { childList: true, subtree: true, attributes: true });
    });
    await advanceFjordYear(page);
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: output + '/tablet.png' });
    await page.waitForFunction(count => Object.keys(window.qaQueue.awards).length === count &&
        document.querySelector('#fjord-production-labels').dataset.pending === '0', expected.size);
    const observed = await page.evaluate(() => window.qaQueue);
    assert.deepEqual(new Map(Object.entries(observed.awards).sort()), new Map([...expected].sort()), 'Every queued producer actually reaches a DOM label with exact units.');
    assert.equal(observed.peak, 6);
    assert.ok(observed.pending > 0);
    assert.ok(Object.values(observed.anchors).every(anchor => anchor === 'world'));
    assert.ok(observed.boxes.length > 0, 'Real tablet labels are visible.');
    for (const box of observed.boxes) {
        assert.ok(box.x >= 0 && box.x + box.width <= 1024 && box.y >= 0 && box.y + box.height <= 768, 'Visible tablet labels stay inside the viewport.');
        assert.match(box.text, /^\+\d+ (Food|Materials)$/);
    }
    console.log('All ' + expected.size + ' producers displayed with exact awards; six-label cap and queue verified.');
    await toggleFjordCampaign(page);
    await page.getByRole('button', { name: 'Restart with same founders', exact: true }).click();
    await page.locator('#fjord-notice').filter({ hasText: 'Campaign restarted, paused.' }).waitFor();
    assert.equal(await page.locator('#fjord-production-labels span').count(), 0);
    assert.deepEqual(JSON.parse(await page.locator('#fjord-production-labels').getAttribute('data-totals')), []);
    assert.deepEqual(errors, []);
    await mkdir(output, { recursive: true });
    await writeFile(output + '/queue.json', JSON.stringify({ observed, browserErrors: errors,
        checks: ['All queued producers reach actual labels with exact awarded units; maximum six active.', 'Tablet labels retain world anchors and visible bounds; restart clears ephemeral effects.'] }, null, 2));
} finally { await browser.close(); }
