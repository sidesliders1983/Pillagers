import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_PUBLIC_ORIGIN || 'http://127.0.0.1:5199';
const output = 'docs/qa/integrated-playtest-180';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const result = { version: 'published-playtest-v1', origin, routes: [], checks: [], errors: [] };
const request = (path, method = 'HEAD') => fetch(origin + path, { method, signal: AbortSignal.timeout(30000) });
for (const path of ['/fjord-play', '/playtest/', '/favicon.ico', '/fjordside.webmanifest', '/playtest/funded-800.json', '/assets/Terrain/spruce-tree.glb',
    '/ground-materials/iceland-v1/standard/mossy_rock-colour.webp']) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    result.routes.push({ path, status: 200 });
}
for (const path of ['/src/fjord-play/FjordPlay.ts', '/.env.meshy.local', '/.git/config']) {
    assert.equal((await request(path)).status, 404, path);
}
assert.equal((await request('/fjord-play', 'POST')).status, 405);
const scenarioResponse = await request('/playtest/funded-800.json', 'GET');
const scenarioBytes = Buffer.from(await scenarioResponse.arrayBuffer());
assert.equal(hash(scenarioBytes), hash(await readFile(output + '/funded-800.json')));
const fixture = JSON.parse(scenarioBytes);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
page.on('pageerror', error => result.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') result.errors.push(message.location().url + ': ' + message.text()); });
page.on('response', response => { if (response.status() >= 400) result.errors.push(response.status() + ' ' + response.url()); });
try {
    await page.goto(origin + '/playtest/', { waitUntil: 'networkidle' });
    await page.locator('[data-scenario="funded-800"]').click();
    await page.waitForURL('**/fjord-play');
    await page.waitForFunction(() => document.querySelector('#fjord-canvas')?.dataset.ready === 'true' || document.querySelector('.fjord-load-error'));
    assert.equal(await page.locator('.fjord-load-error').count(), 0);
    assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined', 'Normal build must not expose QA instrumentation');
    assert.equal(await page.locator('#fjord-materials').textContent(), '25');
    assert.ok((await page.locator('#fjord-canvas').getAttribute('data-terrain-style')).includes('iceland-v1'));
    await page.screenshot({ path: output + '/published-observe.jpg', type: 'jpeg', quality: 88 });
    await page.locator('button[data-surface="settlement"]').click();
    await page.locator('[data-ui="directory"][data-kind="household"]').click();
    const home = Object.values(fixture.fjord.campaign.households)[0];
    await page.locator(`#fjord-directory [data-ui="inspect"][data-id="${home.id}"]`).click();
    await page.locator('[data-ui="work-menu"]').click();
    assert.equal(await page.locator('[data-ui="plan"]').count(), 10);
    await page.locator('[data-ui="farmyard"]').click();
    await page.locator('[data-ui="commit-plan"]').click();
    await page.waitForFunction(() => document.querySelector('#fjord-materials')?.textContent === '15');
    await page.locator('#fjord-menu > summary').click();
    await page.getByText('Campaign', { exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#fjord-export-core').click();
    const download = await downloadPromise;
    const state = JSON.parse(await readFile(await download.path(), 'utf8'));
    const building = state.residences[state.households[home.id].residenceId].buildingId;
    assert.ok(home.memberIds.some(id => state.personas[id].occupation === 'farmer'));
    assert.equal(Object.values(state.landing.cattle).filter(c => c.farmyardId === building).length, 3);
    assert.equal(state.stocks.materials, 15);
    assert.deepEqual(state.time, fixture.fjord.campaign.time);
    assert.equal(state.rngState, fixture.fjord.campaign.rngState);
    await page.locator('#fjord-menu > summary').click();
    await page.locator('[data-stock="settlement"]').click();
    await page.locator(`#fjord-directory [data-ui="inspect"][data-id="${home.memberIds[0]}"]`).click();
    assert.ok((await page.locator('#entity-panel').textContent()).includes('Physicality'));
    await page.screenshot({ path: output + '/published-character.jpg', type: 'jpeg', quality: 88 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(result.errors, []);
    result.checks = ['normal static build, no dev audit API', 'all ten occupations',
        'real task commits and exported canonical state agree', 'three cattle sheltered, 10 Materials spent',
        'no time or RNG advance while paused', 'personal data', 'source and environment paths inaccessible'];
    result.status = 'PASS';
} catch (error) {
    result.status = 'FAIL'; result.failure = String(error);
    await page.screenshot({ path: 'artifacts/integrated-playtest-180/published-failure.jpg', type: 'jpeg' });
    console.log('PAGE', (await page.locator('body').innerText()).slice(-1200));
    throw error;
} finally {
    await writeFile(output + (origin.startsWith('https:') ? '/remote-check.json' : '/static-build-check.json'), JSON.stringify(result, null, 2) + '\n');
    await browser.close();
}
console.log('Published normal-build playtest:', result.status);
