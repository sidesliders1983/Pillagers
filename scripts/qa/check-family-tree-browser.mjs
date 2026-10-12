import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const fixture = JSON.parse(readFileSync('docs/qa/family-tree/fixture.json', 'utf8'));
const child = Object.values(fixture.personas).find(person => person.parentIds.length === 2 && fixture.time.winter - person.birthWinter < 5);
assert.ok(child);
const browser = await chromium.launch({ headless: true, channel: 'msedge' }), checks = [], errors = [];
async function menu(page, view) {
    const id = view === 'play' ? '#play-settings' : '#fjord-menu';
    if (await page.locator(id).getAttribute('open') === null)
        await page.locator(id + ' > summary').click();
    if (view === 'fjord-play' && await page.locator('#fjord-campaign').getAttribute('open') === null)
        await page.locator('#fjord-campaign > summary').click();
}
async function close(page) { if (await page.locator('#clan-book-close').isVisible())
    await page.locator('#clan-book-close').click(); }
async function open(page, view) {
    if (!await page.locator('#clan-book-close').isVisible()) {
        await menu(page, view);
        await page.locator('#clan-book-open').click();
    }
}
async function exported(page, view) {
    await close(page);
    await menu(page, view);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator(view === 'play' ? '[data-action="export"]' : '#fjord-export-core').click()]);
    return JSON.parse(readFileSync(await download.path(), 'utf8'));
}
async function imported(page, view, state) {
    await close(page);
    await page.locator(view === 'play' ? '#import-file' : '#fjord-import').setInputFiles({ name: 'family.json', mimeType: 'application/json', buffer: Buffer.from(core.serializeState(state)) });
    await page.waitForFunction(fjord => document.body.textContent.includes(fjord ? 'Campaign imported, paused.' : 'Campaign loaded, paused.'), view === 'fjord-play', { timeout: 120000 });
    await page.waitForTimeout(500);
    await close(page);
}
try {
    for (const view of ['play', 'fjord-play'])
        for (const mode of ['desktop', 'tablet', 'phone']) {
            console.log(view + ' / ' + mode);
            const touch = mode !== 'desktop', viewport = mode === 'desktop' ? { width: 1440, height: 900 } : mode === 'tablet' ? { width: 1024, height: 768 } : { width: 390, height: 844 };
            const page = await browser.newPage({ viewport, hasTouch: touch });
            page.on('pageerror', error => errors.push(error.message));
            await page.goto('http://127.0.0.1:5180/' + view);
            if (view === 'fjord-play')
                await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
            await page.waitForTimeout(500);
            await close(page);
            if (view === 'fjord-play') {
                await menu(page, view);
                await page.locator('#fjord-quality').selectOption('low');
            }
            await imported(page, view, fixture);
            const before = await exported(page, view);
            await open(page, view);
            const frozen = await page.locator('#clan-book-story').textContent();
            const family = page.getByRole('tab', { name: 'Family Tree', exact: true });
            const layoutMs = await family.evaluate(button => { const start = performance.now(); button.click(); document.querySelector('.family-tree-canvas').getBoundingClientRect(); return performance.now() - start; });
            await page.locator('[data-family-node]').first().waitFor();
            assert.equal(await page.locator('[data-family-node]').count(), 57);
            assert.equal(await page.locator('[data-family-node][data-founder="true"][data-row="0"]').count(), 10);
            assert.equal(await page.locator('[data-family-node="unaffiliated-worker"]').count(), 0);
            assert.equal(await page.locator('#clan-book-chapter').isVisible(), false);
            assert.equal(await page.locator('.family-edge.parent').count() > 0, true);
            assert.equal(await page.locator('.family-edge.partnership').count() > 0, true);
            const node = page.locator('[data-family-node="' + child.id + '"]');
            if (touch)
                await node.tap();
            else
                await node.click();
            const details = page.locator('#family-person-details');
            assert.match(await details.textContent(), /Child of/);
            for (const id of child.parentIds)
                assert.ok((await details.textContent()).includes(fixture.personas[id].name));
            const parent = details.locator('[data-family-person="' + child.parentIds[0] + '"]').first();
            await parent.click();
            assert.equal(await page.locator('[data-family-node="' + child.parentIds[0] + '"]').getAttribute('aria-pressed'), 'true');
            assert.match(await details.textContent(), /Father of|Mother of|Parent of/);
            const storyPerson = fixture.landing.founderIds[0];
            await page.locator('[data-family-node="' + storyPerson + '"]').click();
            const history = details.locator('[data-personal-history]');
            await history.locator(':scope > summary').click();
            await history.locator('.personal-history-records > li').first().waitFor();
            for (let pageIndex = 0; pageIndex < 10 && !(await history.locator('[data-history-chapter]').count()); pageIndex++)
                await history.getByRole('button', { name: 'Older records', exact: true }).click();
            const link = history.locator('[data-history-chapter]').first();
            await link.click();
            assert.equal(await page.getByRole('tab', { name: 'Story', exact: true }).getAttribute('aria-selected'), 'true');
            assert.equal(await page.locator('#clan-book-story').textContent(), frozen);
            await family.click();
            assert.equal(await page.locator('[data-family-node="' + storyPerson + '"]').getAttribute('aria-pressed'), 'true');
            const diagram = page.locator('.family-tree-diagram');
            await diagram.evaluate(element => { element.scrollLeft = 150; element.scrollTop = 80; });
            const scroll = await diagram.evaluate(element => [element.scrollLeft, element.scrollTop]);
            await page.screenshot({ path: 'docs/qa/family-tree/browser/' + view + '-' + mode + '.png' });
            await diagram.evaluate(element => { element.scrollLeft = 0; element.scrollTop = 0; });
            await page.screenshot({ path: 'docs/qa/family-tree/browser/' + view + '-' + mode + '-overview.png' });
            await diagram.evaluate((element, scroll) => { element.scrollLeft = scroll[0]; element.scrollTop = scroll[1]; }, scroll);
            // Switch tabs by keyboard, then retain selection/viewport on harmless reader updates.
            await family.focus();
            await page.keyboard.press('ArrowLeft');
            assert.equal(await page.getByRole('tab', { name: 'Story', exact: true }).getAttribute('aria-selected'), 'true');
            await page.keyboard.press('ArrowRight');
            assert.equal(await family.getAttribute('aria-selected'), 'true');
            await page.waitForTimeout(400);
            assert.deepEqual(await diagram.evaluate(element => [element.scrollLeft, element.scrollTop]), scroll);
            const after = await exported(page, view);
            assert.deepEqual(after, before, 'Family selection/scroll/history navigation never alter Core/RNG');
            const run = page.locator(view === 'play' ? '[data-action="run"]' : '#fjord-run');
            assert.equal(await run.textContent(), 'Start');
            await open(page, view);
            await family.click();
            await run.click();
            await page.waitForTimeout(700);
            assert.equal(await run.textContent(), 'Pause');
            assert.equal(await family.getAttribute('aria-selected'), 'true');
            await close(page);
            assert.equal(await run.textContent(), 'Pause');
            await run.click();
            // A queued chapter must not force the reader away from the tree.
            await open(page, view);
            await family.click();
            for (let i = 0; i < 5; i++)
                await (view === 'play' ? page.getByRole('button', { name: '+1 Winter', exact: true }) : page.locator('#fjord-next')).click();
            await page.locator('#clan-book-new-story').waitFor({ timeout: 15000 });
            assert.equal(await family.getAttribute('aria-selected'), 'true');
            assert.equal(await page.locator('[data-family-node="' + storyPerson + '"]').getAttribute('aria-pressed'), 'true');
            await run.click();
            await close(page);
            await page.waitForTimeout(500);
            assert.equal(await page.locator('#clan-book-close').isVisible(), false, 'Queued Close remains closed while the world runs');
            assert.equal(await run.textContent(), 'Pause');
            await run.click();
            await open(page, view);
            assert.equal(await page.getByRole('tab', { name: 'Story', exact: true }).getAttribute('aria-selected'), 'true');
            // Leave a later chapter queued, then load an earlier campaign before opening it.
            await family.click();
            for (let i = 0; i < 5; i++)
                await (view === 'play' ? page.getByRole('button', { name: '+1 Winter', exact: true }) : page.locator('#fjord-next')).click();
            await page.locator('#clan-book-new-story').waitFor({ timeout: 15000 });
            await imported(page, view, core.createCampaign(32, {}, { fertilityChanceBps: 0, partnershipChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false }));
            await open(page, view);
            await family.click();
            await page.waitForFunction(() => document.querySelectorAll('[data-family-node]').length === 10);
            assert.equal(await page.locator('[data-family-node="' + child.id + '"]').count(), 0);
            assert.equal(await page.locator('[data-family-node][aria-pressed="true"]').count(), 0);
            const closeBounds = await page.locator('#clan-book-close').boundingBox();
            assert.ok(closeBounds.y >= 0 && closeBounds.y + closeBounds.height <= viewport.height);
            checks.push({ view, mode, passed: true, treeNodes: 57, founders: 10, layoutAndStyleFlushMs: layoutMs,
                checks: ['three generations', 'two parents and navigable children', 'outsider omitted', 'reused personal history link', 'frozen story', 'internal scroll and keyboard tabs', 'canonical equality', 'running/manual pause', 'queued chapter and running Close', 'queued chapter invalidated on rollback', 'rollback and reachable Close'] });
            await page.close();
        }
    assert.deepEqual(errors, []);
    writeFileSync('docs/qa/family-tree/browser/results.json', JSON.stringify({ passed: true, checks, errors }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checks }));
}
finally {
    await browser.close();
}
