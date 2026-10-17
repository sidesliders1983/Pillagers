import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origins = (process.env.QA_ORIGINS || 'http://127.0.0.1:5199').split(',');
const output = process.env.QA_OUTPUT || 'artifacts/playtest-housing';
const report = { checks: [], errors: [] };
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile('public/game-assets/houses/manifest.json', 'utf8'));
for (const origin of origins) {
    const response = await fetch(origin + '/game-assets/houses/manifest.json');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), manifest);
    for (const [key, entry] of Object.entries(manifest.assets)) {
        const response = await fetch(origin + '/game-assets/houses/' + entry.file);
        assert.equal(response.status, 200);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.length, entry.bytes);
        assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
        assert.equal(hash(bytes), hash(await readFile('public/game-assets/houses/' + entry.file)));
        report.checks.push({ origin, key, file: entry.file, bytes: bytes.length, sha256: hash(bytes) });
    }
}
console.log('PASS: prepared housing manifest and all model bytes match on every review origin.');
const fixture = JSON.parse(await readFile('docs/qa/integrated-playtest-180/developed-810.json', 'utf8'));
fixture.pace.running = false;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(300000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('response', response => {
        if (response.url().includes('/game-assets/houses/') && response.status() >= 400)
            report.errors.push('HTTP ' + response.status() + ' ' + response.url());
    });
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), JSON.stringify(fixture));
    await page.goto(origins[0] + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.waitForFunction(() => document.querySelector('#fjord-canvas')?.dataset.rendered);
    report.entities = await page.evaluate(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered));
    report.homes = report.entities.filter(entity => entity.kind === 'building' || entity.kind === 'household');
    const built = report.homes.filter(home => home.asset && home.asset !== 'tent');
    assert.ok(built.length >= 3, 'Exercise built houses and farmyards, rather than only the starting tents.');
    assert.deepEqual(built.filter(home => home.placeholder), [], 'All built homes must use their prepared models.');
    assert.deepEqual(report.errors, []);
    assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined');
    await page.evaluate(() => document.querySelector('#fjord-view-home').click());
    await page.screenshot({ path: output + '/developed-homes.jpg', type: 'jpeg', quality: 90 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: output + '/mobile-homes.jpg', type: 'jpeg', quality: 90 });
    report.status = 'PASS';
    console.log('PASS: normal 3D play renders', built.length, 'built homes without placeholders.');
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    throw error;
} finally {
    await writeFile(output + '/housing-check.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
