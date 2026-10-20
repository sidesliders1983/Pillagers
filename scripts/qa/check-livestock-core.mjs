import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { eventFacts } = loadTypeScript(new URL('../../src/simulation/EventFacts.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5192';
const output = 'artifacts/livestock-core-218';
mkdirSync(output, { recursive: true });

// Explicit synthetic fixture. No new species balance is activated in production.
const goat = {
    youngAdultAge: 1, adultAge: 2, adultFood: 1, youngFood: 0,
    femaleFoodPerWinter: 4, maleFoodPerWinter: 0,
    femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0, exposedProductivityBps: 5000,
    youngSlaughterFood: 5, youngAdultSlaughterFood: 10, slaughterFood: 15,
    birthChanceBps: 0, fertileMinAge: 2, fertileMaxAge: 6, birthInterval: 2,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }], crowdingBps: 200,
    weatherMortalityBps: 0, capacityWeightBps: 5000,
};
let state = core.configureLivestock(core.createCampaign(32, { initialMaterials: 50 }), { goat });
state.landing.cattle['cattle-2'].species = 'goat';
const founding = state.events.find(event => event.type === 'FoundingPartyLanded');
const initialDetails = { ...founding.details };
delete initialDetails.livestock;
founding.details = eventFacts(state, initialDetails);
state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
state = core.applyCommand(state, { type: 'HouseHousehold', householdId: 'founder-1' });
for (const livestockId of ['cattle-1', 'cattle-2'])
    state = core.applyCommand(state, { type: 'AssignLivestock', livestockId, farmyardId: 'house-1' });
const owner = new SharedSettlement(32);
owner.session.loadJSON(core.serializeState(state));
const saved = owner.persist();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
try {
    for (const [label, width, height, touch] of [
        ['desktop', 1440, 1000, false], ['tablet', 1180, 820, true], ['phone', 390, 844, true],
    ]) {
        console.log('Checking ' + label);
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(label + ': ' + error.message));
        await page.addInitScript(save => {
            if (sessionStorage.getItem('livestock-qa-seeded')) return;
            sessionStorage.setItem('pillagers.fjord-play.active.v1', save);
            sessionStorage.setItem('livestock-qa-seeded', 'true');
        }, saved);
        const activate = locator => touch ? locator.tap() : locator.click();
        const directory = async () => {
            await activate(page.getByRole('button', { name: 'Settlement livestock', exact: true }));
        };
        await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        await Promise.race([
            page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 }),
            page.waitForEvent('pageerror', { timeout: 120000 }).then(error => { throw error; }),
        ]);
        assert.equal(await page.locator('#fjord-cattle').innerText(), '3', 'The HUD includes managed species without a native mesh');
        await directory();
        assert.match(await page.locator('#fjord-directory').innerText(), /Livestock 1[\s\S]*Livestock 2[\s\S]*Goat · Doe/);
        await activate(page.locator('#fjord-directory [data-ui="inspect"][data-id="cattle-2"]'));
        const panel = page.locator('#entity-panel');
        assert.match(await panel.innerText(), /Livestock 2[\s\S]*Goat · Doe · female · 3 Winters · Adult/);
        assert.equal(await panel.getByRole('button', { name: 'Slaughter (15 Food)', exact: true }).isEnabled(), true);
        await page.screenshot({ path: `${output}/${label}-goat.png` });

        await activate(panel.locator('[data-kind="building"][data-select="house-1"]'));
        const expand = panel.locator('[data-ui="expand-card"]');
        if (await expand.isVisible()) await activate(expand);
        await activate(panel.locator('[data-legacy-management] > summary'));
        await panel.locator('[data-kind="cattle"][data-select="cattle-2"]').waitFor({ state: 'visible' });
        assert.match(await panel.innerText(), /2 livestock · space 1.5\/4/);
        assert.equal(await panel.locator('[data-kind="cattle"][data-select="cattle-2"]').innerText(), 'Livestock 2');
        await page.screenshot({ path: `${output}/${label}-roster.png` });

        await activate(panel.locator('[data-kind="cattle"][data-select="cattle-2"]'));
        await activate(panel.getByRole('button', { name: 'Slaughter (15 Food)', exact: true }));
        assert.match(await page.locator('#fjord-command-review').innerText(), /Livestock 2/);
        await activate(page.locator('#fjord-command-review [data-cancel]'));
        assert.equal(await panel.getByRole('button', { name: 'Slaughter (15 Food)', exact: true }).isEnabled(), true);
        await activate(panel.getByRole('button', { name: 'Slaughter (15 Food)', exact: true }));
        await activate(page.locator('#fjord-command-review [data-confirm]'));
        await panel.getByText('Died / slaughtered in Winter 800', { exact: true }).waitFor();
        assert.equal(await panel.getByRole('button', { name: /^Slaughter \(/ }).count(), 0);
        await directory();
        assert.match(await page.locator('#fjord-directory').innerText(), /Livestock 3/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        report.checks.push(`${label}: real management, mixed roster, species details, cancel/confirm slaughter, stable surviving names; ${touch ? 'touch taps' : 'mouse'}`);
        await context.close();
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    writeFileSync(`${output}/browser.json`, JSON.stringify(report, null, 2));
    await browser.close();
}
