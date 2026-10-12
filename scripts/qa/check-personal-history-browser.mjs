import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const owner = new SharedSettlement(41, 1, false);
let state = core.createSettlement(41, { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
state.stocks.food = 200;
state.stocks.materials = 200;
state.personaArchive = { outsider: { ...structuredClone(state.personas.einar), id: 'outsider', name: 'Archived outsider', parentIds: [], partnerId: null, occupationHistory: [], originClanId: 'home-clan' } };
state.events.push({ id: 'event-' + (state.events.length + 1), time: { ...state.time }, type: 'PersonaTransferredOut', details: { personaId: 'outsider', name: 'Archived outsider', destinationClanId: 'cpu-east' } });
owner.importJSON(core.serializeState(state));
owner.command({ type: 'AssignOccupation', personaId: 'einar', occupation: 'woodworker' });
owner.command({ type: 'AdvanceTicks', ticks: 5000 });
const rollback = owner.fjord.exportJSON();
for (let i = 0; i < 24; i++)
    owner.command({ type: 'AssignOccupation', personaId: 'einar', occupation: i % 2 ? 'hunter' : 'fisher' });
owner.command({ type: 'AssignOccupation', personaId: 'liv', occupation: 'fisher' });
owner.command({ type: 'AdvanceTicks', ticks: 5000 });
const fixture = owner.fjord.exportJSON();
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const checks = [], errors = [];
async function closeBook(page) {
    if (await page.locator('#clan-book-close').isVisible())
        await page.locator('#clan-book-close').click();
}
async function menu(page, view) {
    const selector = view === 'play' ? '#play-settings' : '#fjord-menu';
    if (await page.locator(selector).getAttribute('open') === null)
        await page.locator(selector + ' > summary').click();
    if (view === 'fjord-play' && await page.locator('#fjord-campaign').getAttribute('open') === null)
        await page.locator('#fjord-campaign > summary').click();
}
async function exported(page, view) {
    await closeBook(page);
    await menu(page, view);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator(view === 'play' ? '[data-action="export"]' : '#fjord-export-core').click()]);
    return JSON.parse(readFileSync(await download.path(), 'utf8'));
}
async function imported(page, view, text) {
    await closeBook(page);
    await page.locator(view === 'play' ? '#import-file' : '#fjord-import').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.waitForFunction(fjord => document.body.textContent.includes(fjord ? 'Campaign imported, paused.' : 'Campaign loaded, paused.'), view === 'fjord-play', { timeout: 120000 });
    await page.waitForTimeout(350);
    await closeBook(page);
    const selector = view === 'play' ? '#play-settings' : '#fjord-menu';
    if (await page.locator(selector).getAttribute('open') !== null)
        await page.locator(selector + ' > summary').click();
}
async function select(page, view, id) {
    if (view === 'play')
        await page.locator('#entity-picker').selectOption('persona:' + id);
    else {
        const details = page.locator('#fjord-identities').locator('..');
        if (await details.getAttribute('open') === null)
            await details.locator(':scope > summary').click();
        await page.locator('#fjord-identities button[data-kind="persona"][data-id="' + id + '"]').click();
    }
}
try {
    for (const view of ['play', 'fjord-play'])
        for (const touch of [false, true]) {
            console.log('Personal history: ' + view + ' / ' + (touch ? 'tablet touch' : 'desktop'));
            const page = await browser.newPage({ viewport: touch ? { width: 1024, height: 768 } : { width: 1440, height: 900 }, hasTouch: touch });
            page.on('pageerror', error => errors.push(error.message));
            await page.goto('http://127.0.0.1:5180/' + view);
            if (view === 'fjord-play')
                await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
            await page.waitForTimeout(500);
            await imported(page, view, fixture);
            const before = await exported(page, view);
            await page.locator(view === 'play' ? '#play-settings > summary' : '#fjord-menu > summary').click();
            await select(page, view, 'einar');
            const history = page.locator('#entity-panel [data-personal-history]');
            if (touch)
                await history.locator(':scope > summary').tap();
            else
                await history.locator(':scope > summary').click();
            await history.locator('.personal-history-records > li').first().waitFor();
            assert.equal(await history.locator('.personal-history-records > li').count(), 10);
            await history.getByRole('button', { name: 'Older records', exact: true }).click();
            await history.locator('.personal-history-records > li').first().waitFor();
            assert.equal(await history.locator('.personal-history-records > li').count(), 10);
            await history.getByRole('button', { name: 'Older records', exact: true }).click();
            assert.ok((await history.locator('.personal-history-records > li').count()) > 0);
            const passage = history.locator('[data-history-chapter="1"]').first();
            const paragraph = await passage.getAttribute('data-history-paragraph');
            await passage.click();
            await page.locator('#clan-book-story [data-history-target]').waitFor({ timeout: 3000 });
            assert.equal(await page.locator('#clan-book-chapter').inputValue(), '1');
            assert.equal(await page.locator('#clan-book-story [data-history-target]').getAttribute('data-passage'), paragraph);
            await page.screenshot({ path: 'docs/qa/personal-history/browser/' + view + '-' + (touch ? 'touch' : 'desktop') + '-passage.png' });
            await closeBook(page);
            await history.locator('details').filter({ has: page.locator('summary', { hasText: 'Source record' }) }).first().locator(':scope > summary').click();
            assert.match(await history.textContent(), /event-/);
            await select(page, view, 'liv');
            if (await history.getAttribute('open') === null)
                await history.locator(':scope > summary').click();
            await history.locator('.personal-history-records > li').first().waitFor();
            assert.match(await history.textContent(), /Liv became a fisher/);
            assert.doesNotMatch(await history.textContent(), /Einar became/);
            // The archived identity must remain reachable, including without a family relationship.
            await select(page, view, 'outsider');
            if (await history.getAttribute('open') === null)
                await history.locator(':scope > summary').click();
            await history.locator('.personal-history-records > li').first().waitFor();
            assert.match(await history.textContent(), /Archived outsider was transferred to another clan/);
            assert.doesNotMatch(await history.textContent(), /Einar became|cpu-east/);
            await page.screenshot({ path: 'docs/qa/personal-history/browser/' + view + '-' + (touch ? 'touch' : 'desktop') + '-archived.png' });
            const after = await exported(page, view);
            assert.deepEqual(after, before, 'Reading, source expansion and links never change canonical state/RNG');
            assert.equal(await page.locator(view === 'play' ? '[data-action="run"]' : '#fjord-run').textContent(), 'Start');
            await page.locator(view === 'play' ? '#play-settings > summary' : '#fjord-menu > summary').click();
            await select(page,view,'einar');
            if(await history.getAttribute('open')===null)await history.locator(':scope > summary').click();
            const records=history.locator('.personal-history-records');
            await records.waitFor();
            await records.evaluate(element=>{element.scrollTop=80;});
            const scroll=await records.evaluate(element=>element.scrollTop);
            const run=page.locator(view==='play'?'[data-action="run"]':'#fjord-run');
            await run.click();await page.waitForTimeout(800);
            assert.equal(await run.textContent(),'Pause');
            assert.equal(await records.evaluate(element=>element.scrollTop),scroll,'Harmless ticking preserves the history scroll');
            await history.locator('[data-history-chapter]').first().click();
            assert.equal(await run.textContent(),'Pause','Opening the reader must not stop the running clock');
            await closeBook(page);await run.click();
            await imported(page, view, rollback);
            await select(page, view, 'einar');
            if (await history.getAttribute('open') === null)
                await history.locator(':scope > summary').click();
            await history.locator('.personal-history-records > li').first().waitFor();
            assert.equal(await history.locator('.personal-history-records > li').count(), 1);
            assert.doesNotMatch(await history.textContent(), /became a farmer|became a hunter|Archived outsider/);
            await history.locator('nav').scrollIntoViewIfNeeded();
            await page.screenshot({ path: 'docs/qa/personal-history/browser/' + view + '-' + (touch ? 'touch' : 'desktop') + '-after.png' });
            if(!touch) {
                const target=view==='play'?'fjord-play':'play';
                if(view==='fjord-play')await menu(page,view);
                await page.locator('a[data-settlement-view="'+(view==='play'?'fjord':'board')+'"]').click();
                await page.waitForURL('**/'+target);
                if(target==='fjord-play')await page.locator('#fjord-canvas[data-ready="true"]').waitFor({timeout:120000});
                await page.waitForTimeout(500);await closeBook(page);
                const transferred=page.locator('#entity-panel [data-personal-history]');
                await transferred.locator(':scope > summary').click();
                await transferred.locator('.personal-history-records > li').first().waitFor();
                assert.equal(await transferred.locator('.personal-history-records > li').count(),1);
                assert.match(await transferred.textContent(),/Einar became a woodworker/);
                assert.equal(await page.locator(target==='play'?'[data-action="run"]':'#fjord-run').textContent(),'Start');
            }
            checks.push({ view, touch, passed: true, checks: ['bounded paging', 'saved passage navigation', 'source details', 'selection isolation', 'archived childless outsider', 'canonical equality and pause intent', 'running reader and scroll retention', 'rollback', ...(touch ? [] : ['2D/3D transfer'])] });
            await page.close();
        }
    assert.deepEqual(errors, []);
    writeFileSync('docs/qa/personal-history/browser/results.json', JSON.stringify({ passed: true, checks, errors }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checks }));
}
finally {
    await browser.close();
}
