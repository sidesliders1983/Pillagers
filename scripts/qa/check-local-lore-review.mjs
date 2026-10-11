import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = 'docs/qa/local-lore';
const rows = (await readFile(root + '/candidate-B.jsonl', 'utf8')).trim().split('\n').map(JSON.parse);
const other = (await readFile(root + '/candidate-C.jsonl', 'utf8')).trim().split('\n').map(JSON.parse);
assert.equal(other.length, 60);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], checks = [];
try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const page = await browser.newPage({ viewport });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto((process.env.QA_BASE_URL ?? 'http://127.0.0.1:5180') + '/docs/qa/local-lore/review.html');
        await page.waitForFunction(() => document.querySelector('#sample').options.length === 60);
        const index = rows.findIndex(row => row.result.reason === 'unsupported-selection');
        assert.ok(index >= 0);
        await page.selectOption('#sample', String(index));
        assert.equal(await page.locator('#a').innerText(), rows[index].baseline);
        assert.equal(await page.locator('#b').innerText(), rows[index].result.text);
        const match = other.find(row => row.campaign === rows[index].campaign && row.chapter === rows[index].chapter);
        assert.equal(await page.locator('#c').innerText(), match.result.text);
        assert.ok((await page.locator('#b-state').innerText()).includes('fallback'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: root + '/browser/comparison-' + viewport.width + '.png', fullPage: true });
        checks.push('Both complete sixty-chapter candidates, including the rejected B selection, render without overflow at ' + viewport.width + 'px');
        await page.close();
    }
    assert.deepEqual(errors, []);
    await writeFile(root + '/browser/comparison.json', JSON.stringify({ generatedAt: new Date().toISOString(),
        checks, errors, passed: true }, null, 2) + '\n');
} finally { await browser.close(); }
