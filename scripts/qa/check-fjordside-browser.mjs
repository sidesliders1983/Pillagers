import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400,height: 900 } });
page.setDefaultTimeout(180000);
const inFlight = new Set();
page.on('request',request => inFlight.add(request.url()));
page.on('requestfinished',request => inFlight.delete(request.url()));
page.on('requestfailed',request => inFlight.delete(request.url()));
try {
    const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5181';
    await page.goto(origin + '/');
    await page.locator('canvas[data-ready=true]').waitFor();
    const initial = JSON.parse(await page.locator('canvas').getAttribute('data-world'));
    assert.equal(initial.mode, 'generated', 'Ordinary loading creates a generated world immediately');
    assert.equal(initial.source, 'ez-tree');
    assert.equal(initial.attachments, 20);
    await page.reload();
    await page.locator('canvas[data-ready=true]').waitFor();
    const reloaded = JSON.parse(await page.locator('canvas').getAttribute('data-world'));
    assert.notEqual(reloaded.seed, initial.seed, 'Ordinary reload creates a fresh world');
    await page.goto(origin + '/?world=reference');
    await page.locator('canvas[data-ready=true]').waitFor();
    assert.equal(JSON.parse(await page.locator('canvas').getAttribute('data-world')).mode, 'reference');
    console.log('PASS: automatic fresh-world startup, reload and explicit Reference rollback.');
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/?worldDev=1');
    await page.locator('canvas[data-ready=true]').waitFor();
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
    await page.fill('#fjordside-seed','17');
    await Promise.all([page.waitForEvent('framenavigated'),page.click('#fjordside-generate')]);
    await page.locator('canvas[data-ready=true]').waitFor();
    const summary = JSON.parse(await page.locator('canvas').getAttribute('data-world'));
    assert.equal(summary.mode,'generated');
    assert.equal(summary.seed,17);
    assert.equal(await page.locator('canvas').getAttribute('data-instances'),'10');
    assert.equal(summary.attachments,20);
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
    await page.click('#fjordside-pause');
    await page.waitForTimeout(1500);
    const paused = await page.locator('canvas').getAttribute('data-fixture');
    const people = await page.locator('canvas').getAttribute('data-population');
    await page.waitForTimeout(2000);
    const later = JSON.parse(await page.locator('canvas').getAttribute('data-fixture'));
    const previous = JSON.parse(paused);
    // Camera controls remain usable while the world is paused; compare simulation state exactly.
    for (const key of ['time', 'paused', 'year', 'progress', 'world']) {
        assert.deepEqual(later[key], previous[key]);
    }
    const physicalPopulation = text => JSON.parse(text).map(({ screen, ...resident }) => resident);
    assert.deepEqual(physicalPopulation(await page.locator('canvas').getAttribute('data-population')),
        physicalPopulation(people));
    assert.equal(JSON.parse(paused).paused,true);
    assert.ok(JSON.parse(people).every(person => person.safe && Math.abs(person.y-person.ground)<.00001));
    await page.click('#fjordside-save');
    const downloadSave = async () => {
        const [download] = await Promise.all([page.waitForEvent('download'),page.click('#fjordside-export')]);
        const { readFile } = await import('node:fs/promises');
        return readFile(await download.path(),'utf8');
    };
    const saved = await downloadSave();
    await page.reload();
    await page.locator('canvas[data-ready=true]').waitFor();
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
    assert.equal(await downloadSave(),saved,'Reload reads the same complete blueprint and props');
    await page.setInputFiles('#fjordside-import',{name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{}')});
    await page.waitForTimeout(1000);
    assert.match(await page.locator('#fjordside-world-status').textContent(),/World was not changed/);
    assert.equal(JSON.parse(await page.locator('canvas').getAttribute('data-world')).seed,17);
    await Promise.all([page.waitForEvent('framenavigated'),page.click('#fjordside-reference')]);
    await page.locator('canvas[data-ready=true]').waitFor();
    assert.equal(JSON.parse(await page.locator('canvas').getAttribute('data-world')).mode,'reference');
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
    await Promise.all([page.waitForEvent('framenavigated'),page.click('#fjordside-load')]);
    await page.locator('canvas[data-ready=true]').waitFor();
    assert.equal(JSON.parse(await page.locator('canvas').getAttribute('data-world')).seed,17);
    console.log('PASS: explicit production Generate World activates accepted geography with existing residents.');
} catch(error) {
    console.error('Unfinished requests:',[...inFlight]);
    console.error('World status:',await page.locator('#fjordside-world-status').count() ? await page.locator('#fjordside-world-status').textContent() : 'No development controls');
    console.error('Loading status:',await page.locator('#status').textContent());
    throw error;
} finally {
    await browser.close();
}
