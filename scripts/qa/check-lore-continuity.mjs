import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const runtime = process.env.QA_PLAYWRIGHT ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(runtime);
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5180';
const output = 'docs/qa/lore-continuity';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER ?? 'msedge' });
const errors = [], checks = [];
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/play?seed=32');
    const opening = await page.locator('#clan-book-story').innerText();
    assert.ok(opening.includes('already partners'));
    assert.doesNotMatch(opening, /founder-\d|founding-longship|textileWorker/);
    await page.locator('#clan-book-appendix > summary').click();
    await page.locator('#clan-book-reader').evaluate(element => element.scrollTop = element.scrollHeight);
    await page.screenshot({ path: output + '/tablet-reader.png' });
    await page.locator('#clan-book-close').click({ timeout: 5000 });
    assert.equal(await page.locator('#clan-book-reader').isVisible(), false);
    checks.push('Expanded appendix remains dismissible on a 1024x768 touch viewport');
    await page.selectOption('#entity-picker', 'longship:founding-longship');
    await page.getByRole('button', { name: 'Salvage longship (20 Materials)', exact: true }).click();
    await page.selectOption('#entity-picker', 'household:founder-9');
    await page.getByRole('button', { name: 'Build house (10 Materials)', exact: true }).click();
    for (let index = 0; index < 5; index++)
        await page.getByRole('button', { name: '+1 Winter', exact: true }).click();
    await page.locator('#clan-book-reader:not([hidden])').waitFor();
    const chapter = await page.locator('#clan-book-story').innerText();
    assert.ok(chapter.includes('Daugirdė’s home was completed'));
    assert.ok(chapter.includes('our longship') || chapter.includes('Our longship'));
    assert.doesNotMatch(chapter, /founding-longship|house-\d/);
    await page.screenshot({ path: output + '/chapter-tablet.png' });
    await page.locator('#clan-book-close').click();
    await page.locator('a[data-settlement-view="fjord"]').click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
    await page.locator('#fjord-menu > summary').click();
    await page.locator('#clan-book-open').click();
    await page.selectOption('#clan-book-chapter', '1');
    assert.equal(await page.locator('#clan-book-story').innerText(), chapter);
    await page.selectOption('#clan-book-chapter', '0');
    assert.equal(await page.locator('#clan-book-story').innerText(), opening);
    // Start explicitly after transfer; opening the reader must not take over clock intent.
    if (await page.locator('#fjord-run').innerText() === 'Start') await page.locator('#fjord-run').click();
    const before = await page.locator('#fjord-canvas').getAttribute('data-time');
    await page.waitForFunction(previous => document.querySelector('#fjord-canvas').getAttribute('data-time') !== previous, before);
    assert.equal(await page.locator('#fjord-run').innerText(), 'Pause');
    await page.screenshot({ path: output + '/fjord-reader.png' });
    await page.locator('#clan-book-close').click();
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
    assert.equal(await page.locator('#clan-book-reader').isVisible(), false);
    checks.push('Five-Winter notification, exact opening/chapter text across 2D-to-Fjord handoff',
        'Reading leaves the running clock active', 'Refresh does not duplicate the notification');
    await page.close();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(base + '/play?seed=32');
    await phone.locator('#clan-book-appendix > summary').click();
    const phoneHud = await phone.locator('#play-hud').boundingBox();
    const phoneReader = await phone.locator('#clan-book-reader').boundingBox();
    assert.ok(phoneReader.y >= phoneHud.y + phoneHud.height, 'The reader leaves the actual HUD reachable');
    await phone.locator('#clan-book-reader').evaluate(element => element.scrollTop = element.scrollHeight);
    await phone.locator('#clan-book-close').click({ timeout: 5000 });
    assert.equal(await phone.locator('#clan-book-reader').isVisible(), false);
    checks.push('Expanded appendix remains dismissible on a 390x844 touch viewport');
    await phone.close();
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ generatedAt: new Date().toISOString(),
        passed: true, errors, checks, limitation: 'Edge touch emulation; no physical iPad Safari run in this pass.' }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checks, errors }));
} finally { await browser.close(); }
