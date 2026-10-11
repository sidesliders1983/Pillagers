import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
let state = core.createCampaign(32, { initialMaterials: 500, foundingCoupleChanceBps: 0 });
state.personas['founder-9'].name = 'Daugirdė';
for (const command of [
    { type: 'BuildHouse', householdId: 'founder-9' },
    { type: 'AssignOccupation', personaId: 'founder-9', occupation: 'farmer' },
    { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' }
]) state = core.applyCommand(state, command);
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, hasTouch: true });
    await page.goto('http://127.0.0.1:5180/gameplay-lab');
    await page.locator('#import-file').setInputFiles({ name: 'housing-lab.json', mimeType: 'application/json',
        buffer: Buffer.from(core.serializeState(state)) });
    await page.getByText('JSON loaded, paused.', { exact: true }).waitFor();
    const livestock = await page.locator('#livestock-cattle-1 > p').first().innerText();
    assert.ok(livestock.endsWith('Daugirdė’s home'), livestock);
    assert.equal(await page.locator('#cattle-cattle-1 option:checked').innerText(), 'Daugirdė’s home');
    assert.equal(await page.locator('#cattle-cattle-1').inputValue(), 'house-1');
    assert.equal(await page.getByRole('heading', { name: 'Daugirdė’s household', exact: true }).count(), 1);
    await writeFile('docs/qa/housing-lore/lab-browser.json', JSON.stringify({ passed: true,
        checks: ['household heading', 'assigned cattle home name', 'Farmyard picker label and canonical value'] }, null, 2));
} finally { await browser.close(); }
