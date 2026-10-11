import { openFjordCampaign, selectFjordQuality, toggleFjordCampaign, selectFjordPace } from './fjord-header-controls.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import { createCrowdScenario, pausedCheckpoint, core } from './fjord-stability-scenario.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const output = process.env.QA_OUTPUT || 'docs/qa/living-fjord-stability';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const errors = [], results = [];
const seconds = Number(process.env.QA_SECONDS || 120);
await mkdir(output, { recursive: true });
const summarize = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { samples: values.length, median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) };
};
async function exportCore(page) {
    await openFjordCampaign(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export-core').click()]);
    const state = JSON.parse(await readFile(await download.path(), 'utf8'));
    await download.delete();
    await toggleFjordCampaign(page);
    return state;
}
try {
    for (const [count, touch] of [[10, false], [25, false], [50, false], [50, true]]) {
        const label = count + (touch ? '-tablet' : '-desktop');
        const state = createCrowdScenario(count);
        const context = await browser.newContext({ viewport: touch ? { width: 1024, height: 768 } :
            { width: 800, height: 600 }, hasTouch: touch, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.setDefaultTimeout(180000);
        page.on('pageerror', error => errors.push({ label, message: error.message }));
        await page.addInitScript(json => {
            const key = 'pillagers.fjord-play.active.v1';
            if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, json);
            window.qaHidden = false;
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.qaHidden });
        }, pausedCheckpoint(state));
        await page.goto(origin + '/fjord-play');
        await selectFjordQuality(page, 'low');
        await selectFjordPace(page, '5');
        const canvas = page.locator('#fjord-canvas[data-ready="true"]');
        await canvas.waitFor();
        await page.waitForTimeout(600);
        assert.notEqual(await canvas.getAttribute('data-stability'), null);
        const graphics = await canvas.evaluate(canvas => {
            const gl = canvas.getContext('webgl2');
            const debug = gl?.getExtension('WEBGL_debug_renderer_info');
            return debug ? { vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
                renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) } : { renderer: 'Unavailable' };
        });
        assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
        assert.deepEqual(await exportCore(page), state, 'Paused initial loading contributes no canonical ticks');
        await page.evaluate(() => {
            const qa = window.stabilityQA = { records: [], frames: [], states: [], roles: [], phases: [],
                invalid: [], first: {}, last: {}, running: true, time: 0 };
            let previous, signature = '';
            const observe = now => {
                const c = document.querySelector('#fjord-canvas');
                if (qa.running && c?.dataset.stability && c.dataset.motion) {
                    if (previous !== undefined) qa.frames.push(now - previous);
                    previous = now;
                    qa.time = Number(c.dataset.motionTime);
                    if (signature !== c.dataset.motionTime) {
                        signature = c.dataset.motionTime;
                        const metrics = JSON.parse(c.dataset.stability);
                        qa.records.push({ seconds: qa.time, ...metrics });
                        const actors = JSON.parse(c.dataset.motion);
                        for (const a of actors) {
                            if (!qa.states.includes(a.state)) qa.states.push(a.state);
                            if (a.visit && !qa.phases.includes(a.visit.phase)) qa.phases.push(a.visit.phase);
                            if (a.visit && !qa.roles.includes(a.visit.clip)) qa.roles.push(a.visit.clip);
                            qa.first[a.key] ??= [a.x, a.z]; qa.last[a.key] = [a.x, a.z];
                        }
                        if (metrics.outOfZone || metrics.bodyOverlaps || metrics.actors !== metrics.agents)
                            qa.invalid.push({ seconds: qa.time, ...metrics });
                    }
                }
                requestAnimationFrame(observe);
            };
            requestAnimationFrame(observe);
        });
        await page.locator('#fjord-run').click();
        const started = Date.now();
        let proof;
        while (Date.now() - started < 600000) {
            proof = await page.evaluate(() => window.stabilityQA);
            if (proof.time >= seconds) break;
            await page.waitForTimeout(1000);
        }
        assert.ok(proof.time >= seconds, label + ': must advance actual active presentation time');
        await page.locator('#fjord-run').click();
        await page.evaluate(() => { window.stabilityQA.running = false; });
        proof = await page.evaluate(() => window.stabilityQA);
        await writeFile(output + '/' + label + '-samples.json', JSON.stringify(proof, null, 2));
        assert.deepEqual(proof.invalid, [], 'No ghosts, body overlap or out-of-zone presentation');
        for (const clip of ['Walk', 'Graze', 'Talk', 'Listen', 'Farm', 'Attack'])
            assert.ok(proof.states.includes(clip), label + ': mixed actual source activities include ' + clip);
        if (count > 10) assert.ok(proof.states.includes('HumanInteraction'));
        const moving = Object.keys(proof.last).filter(key => Math.hypot(proof.last[key][0] - proof.first[key][0],
            proof.last[key][1] - proof.first[key][1]) > .2);
        assert.ok(moving.length > count / 2);
        const saved = await exportCore(page);
        const ticks = (saved.time.winter - state.time.winter) * 1000 + saved.time.tick;
        assert.deepEqual(saved, core.applyCommand(state, { type: 'AdvanceTicks', ticks }));
        await toggleFjordCampaign(page);
        await page.locator('#fjord-save').click();
        await toggleFjordCampaign(page);
        const before = await canvas.getAttribute('data-motion');
        await page.waitForTimeout(1200);
        assert.equal(await canvas.getAttribute('data-motion'), before, 'Pause freezes controller and source activities');
        if (touch) {
            const pose = async () => JSON.parse(await canvas.getAttribute('data-camera')).world;
            const rect = await canvas.boundingBox();
            const x = rect.x + 90, y = rect.y + rect.height * .65;
            const initial = await pose();
            const cdp = await context.newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 70, y: y - 15, id: 1 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForTimeout(700);
            const rotated = await pose();
            assert.ok(Math.max(...[0, 1, 2, 4, 5, 6].map(i => Math.abs(rotated[i] - initial[i]))) > .03);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }, { x: x + 80, y, id: 2 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 110, y, id: 2 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForTimeout(700);
            const zoomed = await pose();
            assert.ok(Math.hypot(...[12, 13, 14].map(i => zoomed[i] - rotated[i])) > 1);
        }
        await toggleFjordCampaign(page);
        await page.locator('#fjord-load').click();
        await toggleFjordCampaign(page);
        await canvas.waitFor();
        assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
        assert.deepEqual(await exportCore(page), saved, 'Explicit local save/load retains complete canonical state');
        // Actual visibility handler; no presentation or Core catch-up after a hidden interval.
        await page.locator('#fjord-run').click();
        await page.evaluate(() => { window.qaHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
        const hidden = await exportCore(page);
        await page.waitForTimeout(1300);
        assert.deepEqual(await exportCore(page), hidden);
        await page.evaluate(() => { window.qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
        // Pause is retained across real 2D/3D route transfer, without duplication or offline progress.
        await page.getByRole('link', { name: '2D Settlement', exact: true }).click();
        await page.waitForURL('**/play');
        await page.getByRole('link', { name: /3D Fjord/ }).click();
        await canvas.waitFor();
        assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
        assert.deepEqual(await exportCore(page), hidden);
        await page.screenshot({ path: output + '/' + label + '.png', timeout: 120000 });
        await writeFile(output + '/' + label + '-samples.json', JSON.stringify(proof, null, 2));
        results.push({ label, activeSeconds: proof.time, moving: moving.length, states: proof.states,
            visitPhases: proof.phases, frameIntervalsMs: summarize(proof.frames),
            controllerMs: summarize(proof.records.map(r => r.lastUpdateMs)),
            renderCpuMs: summarize(proof.records.map(r => r.lastFrameMs)),
            worstUpdateMs: Math.max(...proof.records.map(r => r.maxUpdateMs)),
            lastCounters: proof.records.at(-1), touchEmulation: touch,
            graphics, coreTicks: ticks, coreEqualToReplay: true, hiddenNoCatchup: true, pausedHandoff: true });
        console.log(JSON.stringify(results.at(-1)));
        await context.close();
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ browser: await browser.version(),
        cpu: os.cpus()[0].model, os: os.release(), memoryBytes: os.totalmem(),
        quality: 'Low, DPR 1; native Edge GPU, no software flags',
        physicalIPad: 'Owner confirmed movement, selection, drag and pinch/spread in Safari on a physical iPad on 2026-10-11. A duplicate persona popup was reported and is covered by the separate browser regression.',
        results, errors }, null, 2));
} finally { await browser.close(); }
