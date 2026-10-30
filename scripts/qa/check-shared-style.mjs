import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5197';
const output = resolve(process.env.QA_OUTPUT || 'scratch/design-style/browser');
const expectStyle = process.env.QA_EXPECT_STYLE !== '0';
await mkdir(join(output, 'temporary'), { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = join(output, 'temporary');
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' });
const result = { status: 'running', origin, browser: browser.version(), physicalDevice: false, sourceRevision: process.env.QA_BUILD || execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), expectStyle, cases: [], errors: [] };
async function screenshot(page, name) { await page.screenshot({ path: join(output, name + '.jpg'), quality: 85 }); }
async function sample(page, selector) {
    const sample = await page.locator(selector).first().evaluate(node => {
        const s = getComputedStyle(node);
        return { selector: node.id || node.className, color: s.color, background: s.backgroundColor,
            border: s.borderColor, radius: s.borderRadius, font: s.fontFamily };
    });
    if (expectStyle) assert.ok(['rgb(244, 248, 250)', 'rgb(200, 214, 220)'].includes(sample.color), 'White/cool-white UI copy: ' + selector + ' ' + sample.color);
    return sample;
}
async function loadGame(page) {
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Load game', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles(resolve('docs/ux/player-menus-298/followup/campaign-before.json'));
    await page.getByRole('button', { name: 'Continue campaign', exact: true }).click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    await page.locator('#island-loading').waitFor({ state: 'hidden', timeout: 180000 });
}
try {
    for (const [name, route, selector, field] of [
        ['character-lab', '/character-lab', '.lab-panel', '#lab-seed'],
        ['gameplay-lab', '/gameplay-lab', '.lab-card', null],
        ['environment-lab', '/environment-lab', '.environment-lab', '#environment-quality'],
        ['water-lab', '/water-lab', '.water-panel', '#water-quality'],
        ['asset-lab', '/asset-lab', '.asset-lab', '#asset-distance'],
        ['meshy-lab', '/meshy-preview', '.meshy-shell aside', null],
        ['settlement-lab', '/play', '.play-body', null],
    ].filter(() => process.env.QA_ONLY_FJORD !== '1')) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        page.on('pageerror', error => result.errors.push({ name, error: error.message }));
        await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
        await page.locator(selector).first().waitFor({ timeout: 60000 });
        const style = await sample(page, selector);
        if (field && await page.locator(field).count()) {
            await page.locator(field).focus();
            const outline = await page.locator(field).evaluate(node => getComputedStyle(node).outlineColor);
            if (expectStyle) assert.equal(outline, 'rgb(169, 237, 255)', 'Cyan focus on the public field');
        }
        if (expectStyle) assert.deepEqual(await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/branding/fjordside/start/')).map(r => r.name)), [], 'Labs do not download entry artwork');
        await screenshot(page, name + '-desktop');
        await page.setViewportSize({ width: 390, height: 844 });
        await screenshot(page, name + '-narrow');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (expectStyle) assert.equal(overflow, false, 'No narrow page overflow: ' + name);
        result.cases.push({ name, style, narrowHorizontalOverflow: overflow, interaction: field ? 'Public control focused' : 'Existing public UI opened' });
        await context.close();
    }
    for (const [name, width, height, touch] of [['desktop', 1440, 900, false], ['touch', 852, 393, true]]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, acceptDownloads: true });
        const page = await context.newPage();
        page.on('pageerror', error => result.errors.push({ name, error: error.message }));
        await loadGame(page);
        assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
        const style = await sample(page, '.fjord-brand');
        await screenshot(page, 'fjord-' + name);
        await page.locator('#fjord-menu > summary').click();
        await page.locator('#fjord-menu [data-menu-section]').filter({ has: page.locator('summary', { hasText: /^Settings$/ }) }).locator('summary').first().click();
        await page.locator('#fjord-quality').focus();
        await screenshot(page, 'settings-' + name);
        await page.getByRole('button', { name: 'Close game menu', exact: true }).click();
        if (touch) await page.getByRole('button', { name: 'Settlement navigation', exact: true }).click();
        await page.getByRole('button', { name: 'Settlement', exact: true }).click();
        await screenshot(page, 'settlement-' + name);
        await page.locator('#fjord-directory .fjord-directory-list button').first().click();
        await screenshot(page, 'resident-' + name);
        if (touch) await page.getByRole('button', { name: 'Settlement navigation', exact: true }).click();
        await page.getByRole('button', { name: 'Clan Book', exact: true }).click();
        await page.getByRole('tab', { name: 'Family Tree', exact: true }).click();
        await screenshot(page, 'family-tree-' + name);
        await page.getByRole('button', { name: 'Close Clan Book', exact: true }).click();
        assert.equal(await page.locator('#fjord-food').textContent(), '15');
        assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
        result.cases.push({ name: 'Fjord ' + name, style, food: 15, paused: true, journeys: 'Import, play, Settings, Settlement, resident, Family Tree, Close' });
        await context.close();
    }
    assert.deepEqual(result.errors, []);
    result.status = 'passed';
} catch (error) { result.status = 'failed'; result.failure = String(error); process.exitCode = 1; }
finally { await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify(result)); }
