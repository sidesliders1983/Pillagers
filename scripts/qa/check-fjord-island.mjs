import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTypeScript } from '../load-typescript.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = 'docs/qa/fjord-island';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('console', message => { if (message.type() === 'error') console.log('Browser:', message.text().slice(0, 400)); });
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const errors = [];
const checks = [];
const exportSave = async () => {
    if (!await page.locator('#fjord-menu').evaluate(e => e.open)) await page.locator('#fjord-menu > summary').click();
    if (!await page.locator('#fjord-campaign').evaluate(e => e.open)) await page.locator('#fjord-campaign > summary').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export').click()]);
    return JSON.parse(await readFile(await download.path(), 'utf8'));
};
page.on('pageerror', error => errors.push(error.message));
try {
    await page.goto(origin + '/fjord-play?seed=32', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    const close = page.locator('#clan-book-close');
    if (await close.isVisible()) await close.click();
    console.log('Fjord ready');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.locator('#fjord-menu > summary').click();
    await page.locator('#fjord-campaign > summary').click();
    console.log('Ready and campaign menu open');
    await page.locator('#fjord-export').waitFor({ state: 'visible', timeout: 10000 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.locator('#fjord-export').click()]);
    const text = await readFile(await download.path(), 'utf8');
    const save = JSON.parse(text);
    assert.equal(save.bridgeVersion, 2, 'fresh /fjord-play must use the new island campaign');
    assert.ok(text.length < 1_000_000);
    assert.equal(save.island.generatorVersion, 'fjordside-island-v0.3e-r3');
    const environment = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-environment'));
    assert.equal(environment.groundBlending, 'zoned');
    assert.equal(environment.generatorVersion, save.island.generatorVersion);
    assert.deepEqual(errors, []);
    await page.locator('#fjord-menu > summary').click();
    await page.screenshot({ path: output + '/founding.jpg', type: 'jpeg', quality: 86 });
    checks.push('Fresh Fjord selects the pinned island, renders zoned materials and exports a compact recipe.');
    console.log(checks.at(-1));
    // Use the public Core serializer for a funded, summer QA campaign, then build through the actual UI.
    let state = core.createCampaign(32, { initialMaterials: 1000 }, {}, { enabled: false });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 });
    await page.locator('#fjord-menu > summary').click();
    await page.locator('#fjord-import').setInputFiles({ name: 'funded.json', mimeType: 'application/json',
        buffer: Buffer.from(core.serializeState(state)) });
    await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor({ timeout: 180000 });
    await page.locator('#fjord-menu > summary').click();
    await page.getByText('Settlement identities', { exact: true }).click();
    await page.locator('#fjord-identities button[data-kind="household"][data-id="founder-1"]').click();
    await page.getByRole('button', { name: /^Build house/ }).click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.entities)
        .some(e => e.kind === 'building' && e.id === 'house-1'));
    await page.locator('#fjord-identities button[data-kind="persona"][data-id="founder-1"]').click();
    await page.locator('#occupation').selectOption('farmer');
    await page.getByRole('button', { name: 'Assign occupation', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
        .some(e => e.key === 'building:house-1' && e.asset === 'farmHut'));
    const built = await exportSave();
    assert.equal(built.island.seed, 18);
    assert.ok(built.layout.plots['building:house-1']);
    await page.locator('#fjord-menu > summary').click();
    await page.getByText('Settlement identities', { exact: true }).click();
    await page.getByRole('button', { name: 'Collapse management panel', exact: true }).click();
    await page.screenshot({ path: output + '/summer-farm.jpg', type: 'jpeg', quality: 86 });
    checks.push('Build house and assign farmer use existing commands and visibly replace the tent in place.');
    console.log(checks.at(-1));
    await page.locator('#fjord-menu > summary').click();
    await page.getByRole('link', { name: '2D Settlement', exact: true }).click();
    await page.waitForURL('**/play');
    await page.locator('#play-root').waitFor({ timeout: 180000 });
    await page.locator('a[data-settlement-view="fjord"]').click();
    await page.waitForURL('**/fjord-play');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    const returned = await exportSave();
    assert.deepEqual(returned.campaign, built.campaign);
    assert.deepEqual(returned.layout, built.layout);
    assert.deepEqual(returned.island, built.island);
    checks.push('2D → 3D transfer retains exact canonical state, placements, selected entity and geography.');
    console.log(checks.at(-1));
    await page.locator('#fjord-seed').fill('33');
    await page.locator('#fjord-new').click();
    await page.locator('#fjord-notice').filter({ hasText: 'New campaign created.' }).waitFor({ timeout: 180000 });
    await page.locator('#fjord-run').click();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    const second = await exportSave();
    assert.equal(second.campaign.seed, 33);
    assert.equal(second.island.seed, 7);
    checks.push('New campaign from another seed selects the other validated island.');
    await page.locator('#fjord-menu > summary').click();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await page.screenshot({ path: output + '/second-island.jpg', type: 'jpeg', quality: 86 });
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ saveBytes: text.length, environment, checks, errors }, null, 2));
    console.log(checks.at(-1));
} catch (error) {
    console.error(error);
    try { console.log('Page:', (await page.locator('body').innerText({ timeout: 1000 })).slice(-2500)); } catch {}
    throw error;
} finally {
    await context.close();
    await browser.close();
}
