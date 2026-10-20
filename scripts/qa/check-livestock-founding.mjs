import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadTypeScript } from '../load-typescript.mjs';
import { livestockCandidate } from './livestock-candidates.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const output = 'artifacts/livestock-founding-219';
mkdirSync(output, { recursive: true });

const cases = new Map();
for (let seed = 0; seed < 48 && cases.size < 6; seed++) {
    const initial = core.createCampaign(seed, { initialMaterials: 50 }, {}, { enabled: false }, {}, {}, {},
        'summer-800-v1', undefined, { player: livestockCandidate });
    const species = Object.values(initial.landing.cattle)[0].species;
    if (cases.has(species)) continue;
    // Extra Materials are a browser fixture for the roster, never a balance-study subsidy.
    let state = core.applyCommand(initial, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'HouseHousehold', householdId: 'founder-1' });
    for (const livestockId of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignLivestock', livestockId, farmyardId: 'house-1' });
    const owner = new SharedSettlement(seed);
    owner.session.loadJSON(core.serializeState(state));
    cases.set(species, { state, save: owner.persist() });
}
assert.equal(cases.size, 6);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
try {
    for (const [label, width, height, touch, speciesList] of [
        ['desktop', 1440, 1000, false, [...cases.keys()]],
        ['tablet', 1180, 820, true, ['goat', 'chicken']],
        ['phone', 390, 844, true, ['goat', 'chicken']],
    ]) for (const species of speciesList) {
        console.log(`Checking ${label}/${species}`);
        const { state, save } = cases.get(species);
        const animal = Object.values(state.landing.cattle)[0];
        const info = core.inspectLivestock(state, animal.id);
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(`${label}/${species}: ${error.message}`));
        await page.addInitScript(save => {
            sessionStorage.setItem('pillagers.fjord-play.active.v1', save);
        }, save);
        const activate = locator => touch ? locator.tap() : locator.click();
        await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
        assert.equal(await page.locator('#fjord-cattle').innerText(), '3');
        await activate(page.getByRole('button', { name: 'Settlement livestock', exact: true }));
        const directory = page.locator('#fjord-directory');
        assert.match(await directory.innerText(), new RegExp(`${info.speciesName} · ${info.sexTerm}`));
        await activate(directory.locator(`[data-ui="inspect"][data-id="${animal.id}"]`));
        const panel = page.locator('#entity-panel');
        assert.match(await panel.innerText(), /Livestock 1/);
        assert.match(await panel.innerText(), new RegExp(`${info.speciesName} · ${info.sexTerm} · female`));
        const slaughterLabel = `Slaughter (${info.slaughterFood} Food${info.slaughterHides ? `, ${info.slaughterHides} Hides` : ''})`;
        await panel.getByRole('button', { name: slaughterLabel, exact: true }).waitFor();
        await page.screenshot({ path: `${output}/${label}-${species}.png` });

        await activate(panel.locator('[data-kind="building"][data-select="house-1"]'));
        const expand = panel.locator('[data-ui="expand-card"]');
        if (await expand.isVisible()) await activate(expand);
        await activate(panel.locator('[data-legacy-management] > summary'));
        await panel.locator(`[data-kind="cattle"][data-select="${animal.id}"]`).waitFor({ state: 'visible' });
        assert.match(await panel.innerText(), /3 livestock · space/);
        await page.screenshot({ path: `${output}/${label}-${species}-roster.png` });
        await activate(panel.locator(`[data-kind="cattle"][data-select="${animal.id}"]`));
        await activate(panel.getByRole('button', { name: slaughterLabel, exact: true }));
        const confirmation = page.locator('#fjord-command-review');
        assert.match(await confirmation.innerText(), /Livestock 1/);
        if (info.slaughterHides) assert.match(await confirmation.innerText(), /Specialist stock: \+1 Hides/);
        await activate(confirmation.locator('[data-cancel]'));
        assert.equal(await page.locator('#fjord-food').innerText(), '15');
        await activate(panel.getByRole('button', { name: slaughterLabel, exact: true }));
        await activate(page.locator('#fjord-command-review [data-confirm]'));
        await panel.getByText('Died / slaughtered in Winter 800', { exact: true }).waitFor();
        assert.equal(await page.locator('#fjord-food').innerText(), String(15 + info.slaughterFood));
        assert.equal(await page.locator('#fjord-cattle').innerText(), '2');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        report.checks.push(`${label}/${species}: seed ${state.seed}, real founding trio, roster, cancel/confirm, actual Food/Hides receipt; ${touch ? 'touch' : 'mouse'}`);
        await context.close();
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    writeFileSync(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
