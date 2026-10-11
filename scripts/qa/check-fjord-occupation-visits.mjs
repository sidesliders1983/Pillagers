import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-interactions/visits';
const errors = [], sequences = [], checks = [];
let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 },
    { fertilityChanceBps: 0, careerReviewWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] },
    { enabled: false });
for (const [personaId, occupation] of [['founder-1', 'farmer'], ['founder-2', 'fisher'],
    ['founder-5', 'woodworker'], ['founder-4', 'hunter']])
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId, occupation });
const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
const browser = await chromium.launch({ headless: true,
    args: process.env.QA_HARDWARE === '1' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(output, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, hasTouch: true });
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
        // Read the public diagnostics on every rendered frame. Driver polling can miss
        // a short authored activity when this old laptop stalls between requests.
        const wanted = ['persona:founder-1', 'persona:founder-2', 'persona:founder-5', 'persona:founder-4'];
        const proof = globalThis.occupationQA = {
            time: 0, records: [], performed: [], departed: [], unsafe: [], actors: [],
        };
        const previous = new Map();
        const observe = () => {
            const canvas = document.querySelector('#fjord-canvas');
            if (canvas?.dataset.motion && canvas.dataset.rendered) {
                proof.time = Number(canvas.dataset.motionTime);
                proof.actors = JSON.parse(canvas.dataset.motion).filter(a => wanted.includes(a.key));
                const rendered = JSON.parse(canvas.dataset.rendered);
                for (const actor of proof.actors) {
                    if (!actor.walkable) proof.unsafe.push({ key: actor.key, time: proof.time });
                    const phase = actor.visit?.phase ?? 'wander';
                    const source = rendered.find(e => e.key === actor.key)?.motion;
                    const signature = phase + ':' + actor.state;
                    if (previous.get(actor.key) !== signature) {
                        proof.records.push({ key: actor.key, phase, state: actor.state, time: proof.time,
                            position: [actor.x, actor.y, actor.z], visit: actor.visit,
                            partnerKey: actor.partnerKey, clip: source });
                        previous.set(actor.key, signature);
                    }
                    if (phase === 'activity' && actor.state === actor.visit.clip &&
                        !proof.performed.includes(actor.key)) proof.performed.push(actor.key);
                    if (phase === 'home' && proof.performed.includes(actor.key) &&
                        !proof.departed.includes(actor.key)) proof.departed.push(actor.key);
                }
            }
            requestAnimationFrame(observe);
        };
        requestAnimationFrame(observe);
    }, core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.selectOption('#fjord-quality', 'low');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    console.log('Ready; observing occupation visits on every rendered frame.');
    const started = Date.now();
    let proof, lastProgress = 0;
    while (Date.now() - started < 900000) {
        proof = await page.evaluate(() => globalThis.occupationQA);
        if (Date.now() - lastProgress > 30000) {
            console.log('Active seconds:', proof.time.toFixed(1), proof.actors.map(a => ({
                key: a.key, x: a.x, z: a.z, phase: a.visit?.phase, state: a.state,
                target: a.visit?.target, travelRemaining: a.visit?.travelRemaining,
            })), 'Performed:', proof.performed, 'Departed:', proof.departed);
            lastProgress = Date.now();
        }
        if (proof.departed.length === 4 || proof.time >= 400) break;
        await page.waitForTimeout(1000);
    }
    sequences.push(...proof.records);
    assert.deepEqual(proof.unsafe, []);
    const expected = { 'persona:founder-1': 'Pull_Radish', 'persona:founder-2': 'Sit_and_Doze_Off',
        'persona:founder-5': 'Attack', 'persona:founder-4': 'Idle_02' };
    for (const [key, clip] of Object.entries(expected)) {
        assert.ok(sequences.some(a => a.key === key && a.phase === 'activity' &&
            a.state === a.visit.clip && a.clip.sourceClip === clip && a.partnerKey === null),
        key + ': must reach its activity and use the real source clip exclusively');
        assert.ok(proof.departed.includes(key), key + ': must leave its completed activity');
    }
    const activeTime = proof.time;
    checks.push('Four real roles: approach, authored activity (including Sit_and_Doze_Off), departure toward home; exclusive ownership');
    await page.locator('#fjord-run').click();
    await page.screenshot({ path: output + '/working-settlement.png', timeout: 120000 });
    const summary = page.getByText('Campaign', { exact: true });
    await summary.click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export-core').click()]);
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    await download.delete();
    const ticks = (saved.time.winter - state.time.winter) * 1000 + saved.time.tick - state.time.tick;
    assert.deepEqual(saved, core.applyCommand(state, { type: 'AdvanceTicks', ticks }));
    checks.push('Canonical state exactly matches identical commands without presentation');
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ checks, errors, sequences,
        device: 'Headless Chromium / ' + (process.env.QA_HARDWARE === '1' ? 'default renderer' : 'SwiftShader') + ', touch emulation', activeSeconds: activeTime }, null, 2));
    console.log(JSON.stringify({ checks }));
} catch (error) {
    await writeFile(output + '/failure.json', JSON.stringify({ message: String(error), errors, sequences }, null, 2));
    throw error;
} finally { await browser.close(); }
