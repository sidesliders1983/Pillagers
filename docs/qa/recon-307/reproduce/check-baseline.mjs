import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)(
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = 'c5340a9310cf2c2c651a3ca6ac5fe26f5198c96d';
const origin = 'http://127.0.0.1:5198';
const directory = fileURLToPath(new URL('./', import.meta.url));
const output = join(directory, 'baseline-c5340a93-' + Date.now());
await mkdir(join(output, 'tmp'), { recursive: true });
process.env.TEMP = process.env.TMP = join(output, 'tmp');
const report = { status: 'running', source, origin, chrome: null, screenshots: [], scenarios: [], errors: [],
    startedAt: new Date().toISOString(), limitation: 'Native headless Chrome desktop only; no physical device claim.' };
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    args: ['--no-proxy-server', '--mute-audio'],
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' });
report.chrome = browser.version();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on('pageerror', error => report.errors.push(error.message));
const key = 'pillagers.fjord-play.active.v1';
const core = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).fjord.campaign, key);
const active = state => Object.values(state.world.spatial?.missions || {}).at(-1);
async function shot(name) {
    const path = join(output, name + '.jpg');
    await page.screenshot({ path, quality: 87 }); report.screenshots.push(path);
}
async function ready() {
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    const proceed = page.locator('[data-entry="continue"]');
    await canvas.or(proceed).first().waitFor({ timeout: 180000 });
    if (await proceed.isVisible()) await proceed.click();
    await canvas.waitFor({ timeout: 180000 });
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    if (await page.getByRole('button', { name: 'Explore on my own', exact: true }).isVisible())
        await page.getByRole('button', { name: 'Explore on my own', exact: true }).click();
    if (await page.locator('#fjord-run').getAttribute('aria-label') === 'Pause simulation')
        await page.locator('#fjord-run').click();
    await page.waitForFunction(() => !!document.querySelector('#fjord-canvas')?.dataset.rendered);
}
async function importFile(name) {
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Load game', exact: true }).waitFor();
    if (report.entryVersion === undefined) {
        report.entryVersion = await page.locator('body').innerText();
        assert.ok(report.entryVersion.includes(source.slice(0, 7)), 'The live baseline entry identifies the expected parent commit.');
        await shot('baseline-entry-source');
    }
    await page.getByRole('button', { name: 'Load game', exact: true }).click();
    await page.locator('#campaign-recovery input[type="file"]').setInputFiles(join(directory, name + '.shared.json'));
    await ready();
}
try {
    await importFile('ready-at-home');
    await page.locator('#fjord-navigation button[data-surface="expeditions"]').click();
    await page.getByRole('button', { name: 'Known places', exact: true }).click();
    const before = await core();
    await page.locator('#island-mission-panel [data-island-type="Recon"]').click();
    await page.locator('#island-mission-dialog[open]').waitFor();
    const quote = await page.locator('#island-mission-summary').innerText();
    assert.doesNotMatch(quote, /Planned observation|viewpoints/);
    assert.deepEqual(await core(), before);
    await shot('baseline-direct-recon-quote');
    await page.locator('#island-mission-dialog [data-island-confirm]').click();
    const departed = await core(), mission = active(departed);
    assert.equal(mission.task.type, 'Recon');
    assert.equal(mission.task.recon, undefined);
    assert.equal(departed.stocks.food, before.stocks.food - mission.foodCost);
    await shot('baseline-direct-dispatch');
    report.scenarios.push({ kind: 'actual-parent-direct-Recon', quote, missionId: mission.id,
        target: mission.target, missionTarget: mission.task.target, foodCost: mission.foodCost,
        memberRoutes: mission.memberRoutes });
    await context.close();
    // The preserved warning gives a visible direct-visit comparison without waiting through a whole paid mission.
    const warningContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const warningPage = await warningContext.newPage();
    warningPage.on('pageerror', error => report.errors.push(error.message));
    await warningPage.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await warningPage.getByRole('button', { name: 'Load game', exact: true }).click();
    await warningPage.locator('#campaign-recovery input[type="file"]').setInputFiles(join(directory, 'legacy-direct-warning.shared.json'));
    const canvas = warningPage.locator('#fjord-canvas[data-ready="true"]');
    const proceed = warningPage.locator('[data-entry="continue"]');
    await canvas.or(proceed).first().waitFor({ timeout: 180000 });
    if (await proceed.isVisible()) await proceed.click();
    await canvas.waitFor({ timeout: 180000 });
    if (await warningPage.locator('#fjord-run').getAttribute('aria-label') === 'Pause simulation') await warningPage.locator('#fjord-run').click();
    await warningPage.waitForFunction(() => !!document.querySelector('#fjord-canvas')?.dataset.rendered);
    const focus = warningPage.locator('#expedition-mode [data-expedition-action="focus"]');
    if (await focus.isVisible()) await focus.click();
    await warningPage.waitForTimeout(1200);
    const path = join(output, 'baseline-direct-warning-world.jpg');
    await warningPage.screenshot({ path, quality: 87 }); report.screenshots.push(path);
    report.scenarios.push({ kind: 'historical-direct-warning-on-actual-parent-source' });
    await warningContext.close();
    assert.deepEqual(report.errors, []); report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.failure = String(error.stack || error); process.exitCode = 1;
    if (!page.isClosed()) await shot('failure').catch(() => {});
    console.error(report.failure);
} finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
    console.log(JSON.stringify({ status: report.status, source, output, scenarios: report.scenarios.length, errors: report.errors }));
}
