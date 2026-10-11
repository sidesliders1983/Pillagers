import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'scratch/issue95-interruption';
const checks = [], errors = [], samples = [];
const state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 },
    { fertilityChanceBps: 0, careerReviewWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] },
    { enabled: false });
const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(output, { recursive: true });
try {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json),
        core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#fjord-canvas');
    await page.selectOption('#fjord-quality', 'low');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    const read = () => canvas.evaluate(c => ({
        motion: JSON.parse(c.dataset.motion), rendered: JSON.parse(c.dataset.rendered),
    }));
    const capture = name => page.screenshot({ path: output + '/' + name + '.png', timeout: 120000 });
    const pause = async () => {
        if (await page.locator('#fjord-run').innerText() === 'Pause') await page.locator('#fjord-run').click();
        await page.waitForTimeout(400);
    };
    const start = () => page.locator('#fjord-run').click();
    const save = async (canonical = false) => {
        const campaign = page.getByText('Campaign', { exact: true });
        const button = page.locator(canonical ? '#fjord-export-core' : '#fjord-export');
        if (!await button.isVisible()) await campaign.click();
        const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
        const result = JSON.parse(await readFile(await download.path(), 'utf8'));
        await download.delete();
        await campaign.click();
        return result;
    };
    const observe = async (predicate, label, seconds = 120) => {
        console.log('Observing:', label);
        const limit = Date.now() + seconds * 1000;
        while (Date.now() < limit) {
            const sample = await read();
            samples.push({ label, motion: sample.motion, clips: sample.rendered
                .filter(e => e.motion).map(e => ({ key: e.kind + ':' + e.id, ...e.motion })) });
            assert.ok(sample.motion.every(a => a.walkable), 'Actors remain on safe support');
            for (const actor of sample.motion.filter(a => a.partnerKey)) {
                const partner = sample.motion.find(a => a.key === actor.partnerKey);
                assert.equal(partner?.partnerKey, actor.key, 'Every lock is exclusive and reciprocal');
            }
            if (predicate(sample)) return sample;
            await page.waitForTimeout(150);
        }
        throw new Error('Timed out: ' + label);
    };
    const choose = async (kind, id) => {
        const summary = page.getByText('Settlement identities', { exact: true });
        if (!await page.locator('#fjord-identities').isVisible()) await summary.click();
        await page.locator('#fjord-identities button[data-kind="' + kind + '"][data-id="' + id + '"]').tap();
        await summary.click();
    };
    console.log('Ready; checking original social clips.');
    await pause();
    const baseline = await save(true);
    await start();
    const social = await observe(sample => sample.motion.some(a => a.state === 'Talk'), 'resident encounter');
    await pause();
    const held = await read();
    const talk = held.motion.find(a => a.state === 'Talk');
    assert.ok(talk);
    const listen = held.motion.find(a => a.key === talk.partnerKey);
    assert.equal(listen.state, 'Listen');
    assert.equal(held.rendered.find(e => (e.kind + ":" + e.id) === talk.key).motion.sourceClip, 'Talk_Passionately');
    assert.equal(held.rendered.find(e => (e.kind + ":" + e.id) === listen.key).motion.sourceClip, 'Listening_Gesture');
    await choose('persona', talk.key.split(':')[1]);
    await page.locator('#character-profile:not([hidden])').waitFor();
    assert.ok((await page.locator('#character-profile').boundingBox()).height <= 60);
    await page.getByRole('button', { name: 'Expand character profile', exact: true }).tap();
    assert.match(await page.locator('#character-profile').innerText(), /Heritage profile/i);
    await capture('resident-talk-listen');
    await page.getByRole('button', { name: 'Collapse character profile', exact: true }).tap();
    const frozen = await read();
    await page.waitForTimeout(1200);
    assert.deepEqual((await read()).motion, frozen.motion);
    console.log('Check passed.');
    checks.push('Real Talk_Passionately/Listening_Gesture clips; reciprocal lock; touch selection and heritage; pause freezes');

    await page.selectOption('#occupation', '');
    await page.getByRole('button', { name: 'Assign occupation', exact: true }).tap();
    await page.waitForFunction(key => {
        const c = document.querySelector('#fjord-canvas');
        const actor = JSON.parse(c.dataset.motion).find(a => a.key === key);
        return actor && actor.partnerKey === null;
    }, talk.key);
    const interrupted = await read();
    assert.equal(interrupted.rendered.find(e => e.key === talk.key).motion.sourceClip, 'Idle_02',
        'Paused occupation change releases source Talk pose too');
    assert.equal(interrupted.rendered.find(e => e.key === listen.key).motion.sourceClip, 'Idle_02');
    checks.push('Paused canonical occupation change releases both reservation and source animation');
    await writeFile(output + '/interruption.json', JSON.stringify({ checks, errors }, null, 2));
} finally { await browser.close(); }
