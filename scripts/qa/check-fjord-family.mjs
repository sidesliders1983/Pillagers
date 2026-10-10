import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/interactive-fjord';
let state = core.createCampaign(32, { initialFood: 1000, initialMaterials: 500, foundingCoupleChanceBps: 10000 },
    { fertilityChanceBps: 10000, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
state = core.applyCommand(state, { type: 'AdvanceWinter' });
const child = Object.values(state.personas).find(p => p.parentIds.length === 2);
assert.ok(child, 'The real Core creates the family fixture.');
const fatherId = child.parentIds[0];
const home = Object.values(state.households).find(h => h.memberIds.includes(fatherId));
state = core.applyCommand(state, { type: 'BuildHouse', householdId: home.id });
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.getByText('Settlement identities', { exact: true }).click();
    await page.locator('#fjord-identities button[data-kind="persona"][data-id="' + fatherId + '"]').click();
    await page.getByText('Settlement identities', { exact: true }).click();
    await page.waitForFunction(() => {
        const labels = [...document.querySelectorAll('#fjord-selection-labels span')];
        return labels.length === 4 && labels.every(label => !label.hidden && label.style.transform.includes('px'));
    });
    const labels = await page.locator('#fjord-selection-labels span').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        return { text: element.textContent, x: box.x, y: box.y, width: box.width, height: box.height };
    }));
    await page.screenshot({ path: output + '/family-selection.png' });
    for (let i = 0; i < labels.length; i++) {
        for (const other of labels.slice(i + 1)) {
            const label = labels[i];
            const overlap = label.x < other.x + other.width && other.x < label.x + label.width &&
                label.y < other.y + other.height && other.y < label.y + label.height;
            assert.equal(overlap, false, label.text + ' and ' + other.text + ' must remain readable');
        }
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/family-labels.json', JSON.stringify({ labels, browserErrors: errors }, null, 2));
    console.log('Family labels remain readable beside gold/cyan relationship circles.');
} finally {
    await browser.close();
}
