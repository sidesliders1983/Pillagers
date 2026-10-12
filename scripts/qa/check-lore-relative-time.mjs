import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const runtime = process.env.QA_PLAYWRIGHT ?? 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(runtime);
const root = 'docs/qa/lore-relative-time';
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5180';
const data = JSON.parse(await readFile(root + '/comparison.json', 'utf8'));
assert.equal(data.records.length, 69);
await mkdir(root + '/browser', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER ?? 'msedge' });
const errors = [], checks = [];
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390 });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/' + root + '/review.html');
        await page.locator('#chapter option').nth(68).waitFor({ state: 'attached' });
        assert.equal(await page.locator('#error').innerText(), '');
        for (let index = 0; index < data.records.length; index++) {
            await page.selectOption('#chapter', String(index));
            assert.equal(await page.locator('#new').textContent(), data.records[index].newText);
            assert.doesNotMatch(await page.locator('#new').innerText(), /When the interval ended|complete account recorded|unmet Food need/);
        }
        await page.selectOption('#chapter', '1');
        await page.locator('summary').click();
        assert.match(await page.locator('#facts').innerText(), /"winter": 805/);
        assert.match(await page.locator('#facts').innerText(), /"stocks"|"sourceEvents"/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
        await page.locator('summary').click();
        await page.screenshot({ path: root + '/browser/review-' + width + '.png' });
        checks.push({ width, records: data.records.length, overflow: false });
        await page.close();
    }
    assert.deepEqual(errors, []);
    await writeFile(root + '/browser/comparison.json', JSON.stringify({ passed: true, checks, errors }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checks, errors }));
} finally { await browser.close(); }
