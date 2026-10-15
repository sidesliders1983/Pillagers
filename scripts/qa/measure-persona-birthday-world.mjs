import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const implementationCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { seededRandom } = loadTypeScript(new URL('../../src/characters/seededRandom.ts', import.meta.url));
const sourcePath = 'docs/qa/fjord-runtime-performance/fixtures/boundary-810.json';
const sourceBytes = await readFile(sourcePath);
const original = JSON.parse(sourceBytes);
const output = process.env.QA_OUTPUT || 'artifacts/persona-birthdays/world';
const phase = process.env.QA_PHASE || 'micro';
const repeats = Number(process.env.QA_REPEATS || 3);
const origin = process.env.QA_ORIGIN || (phase === 'stock' ? 'http://127.0.0.1:5180' : 'http://127.0.0.1:5194');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-precise-memory-info'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const rows = [], errors = [];
let currentPage;
function fixture(mode, later = false) {
    const saved = structuredClone(original);
    if (later)
        saved.fjord.campaign = core.applyCommand(saved.fjord.campaign, { type: 'AdvanceTicks', ticks: 1000 });
    const state = saved.fjord.campaign;
    for (const clan of [state, ...Object.values(state.world?.targetClans ?? {})]) {
        // Matched calibration only: suppress unrelated births/deaths/career changes in both variants.
        clan.mechanics.config.fertilityChanceBps = 0;
        clan.mechanics.config.partnershipChanceBps = 0;
        clan.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 0 }];
        clan.mechanics.config.careerReviewWinters = 0;
        for (const key of ['cattleBirthChanceBps', 'cattleMortalityYoungBps', 'cattleMortalityAdultBps',
            'cattleMortalityOlderBps', 'cattleMortalityOldBps', 'cattleWeatherMortalityBps', 'cattleCrowdingBps'])
            clan.landing.config[key] = 0;
        clan.stocks.food = 100000;
        clan.stocks.materials = 100000;
        if (mode === 'individual') {
            clan.birthdayCalendar = { version: 1, pendingBirths: [] };
            // Founder dates are synthetic fixture inputs; historical ChildBorn events/children stay tick-0.
            for (const id of clan.landing.founderIds) {
                const person = clan.personas[id];
                if (!person || person.deathWinter !== null)
                    continue;
                const age = core.personaAge(clan, id);
                person.birthTick = Math.floor(seededRandom(clan.seed, 'persona-birthday-v1:' + id.replace(clan.entityPrefix ?? '', ''))() * 1000);
                person.birthWinter = clan.time.winter - age - (person.birthTick > clan.time.tick ? 1 : 0);
            }
        }
    }
    // Calibrated fixtures cannot reuse a Clan Book tied to the original canonical identity.
    delete saved.fjord.narrative;
    saved.target = 'fjord';
    saved.pace.running = false;
    saved.pace.minutesPerWinter = 3;
    core.serializeState(state);
    return saved;
}
const save = () => writeFile(output + '/' + phase + '.json', JSON.stringify({ phase, origin, implementationCommit, source: sourcePath,
    sourceHash: createHash('sha256').update(sourceBytes).digest('hex'), browser: browser.version(),
    calibration: 'Same owned models and initial ages. Founder dates are controlled QA fixtures, never a runtime migration. Existing children retain their real historical tick-0 births. Unrelated lifecycle/career rolls disabled equally; no game defaults changed.', rows, errors }, null, 2));
async function open(saved) {
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(data => sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(data)), saved);
    await page.goto(origin + '/fjord-play');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const restored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign);
    assert.deepEqual(restored, saved.fjord.campaign, 'The calibrated campaign must load before timing');
    console.log('Loaded native scene: ' + phase);
    if (await page.locator('#clan-book-close').isVisible())
        await page.locator('#clan-book-close').click();
    const placeholders = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered).filter(entity => entity.placeholder));
    assert.deepEqual(placeholders, [], 'Owned real models required');
    return page;
}
try {
    if (phase === 'stock') {
        for (const later of [false, true])
            for (let repeat = 0; repeat < repeats; repeat++)
                for (const minutes of [1, 3, 5])
                    for (const mode of repeat % 2 ? ['individual', 'legacy'] : ['legacy', 'individual']) {
                        const saved = fixture(mode, later), page = await open(saved);
                        assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined');
                        await page.locator('#fjord-cycle').selectOption(String(minutes));
                        await page.waitForTimeout(700);
                        const hardware = await page.locator('#fjord-canvas').evaluate(canvas => {
                            const gl = canvas.getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info');
                            return { gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), width: canvas.width, height: canvas.height };
                        });
                        await page.evaluate(() => {
                            window.__birthdayFrames = [];
                            let last;
                            window.__birthdayCapture = true;
                            const sample = time => {
                                if (!window.__birthdayCapture)
                                    return;
                                if (last)
                                    window.__birthdayFrames.push(time - last);
                                last = time;
                                requestAnimationFrame(sample);
                            };
                            requestAnimationFrame(sample);
                        });
                        await page.locator('#fjord-run').click();
                        await page.waitForTimeout(5500);
                        await page.locator('#fjord-run').click();
                        const frames = await page.evaluate(() => { window.__birthdayCapture = false; return window.__birthdayFrames; });
                        await page.waitForTimeout(200);
                        const actual = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign);
                        const ticks = (actual.time.winter - saved.fjord.campaign.time.winter) * 1000 + actual.time.tick - saved.fjord.campaign.time.tick;
                        assert.ok(ticks >= 10, 'The actual yearly boundary must be crossed');
                        assert.deepEqual(actual, core.applyCommand(saved.fjord.campaign, { type: 'AdvanceTicks', ticks }));
                        const sorted = [...frames].sort((a, b) => a - b);
                        rows.push({ mode, later, repeat, minutes, ticks, hardware, frames: { count: frames.length, max: sorted.at(-1), p95: sorted[Math.floor(sorted.length * .95)], p99: sorted[Math.floor(sorted.length * .99)] }, rawFrames: frames });
                        console.log(JSON.stringify({ ...rows.at(-1), rawFrames: undefined }));
                        await save();
                        await page.close();
                    }
    }
    else if (phase === 'micro') {
        const staggered = fixture('individual').fjord.campaign;
        const start = staggered.time.winter * 1000 + staggered.time.tick;
        const dates = [...new Set([1000, ...Object.values(staggered.personas).filter(person => person.deathWinter === null).map(person => {
                    const tick = person.birthTick ?? 0;
                    return (staggered.time.winter + (tick <= staggered.time.tick ? 1 : 0)) * 1000 + tick - start;
                })])].sort((a, b) => a - b);
        for (let repeat = 0; repeat < repeats; repeat++)
            for (const forceFull of [false, true])
                for (const mode of repeat % 2 ? ['individual', 'legacy'] : ['legacy', 'individual']) {
                    const saved = fixture(mode), page = await open(saved);
                    await page.waitForFunction(() => window.__fjordAudit);
                    const before = await page.evaluate(({ forceFull }) => {
                        const audit = window.__fjordAudit, refs = audit.references;
                        refs.setPlayback(true);
                        audit.flags.manualClock = true;
                        if (forceFull) {
                            const human = [...refs.models.actors.values()].find(actor => actor.human).human;
                            const prototype = Object.getPrototypeOf(human), original = prototype.applyDNA;
                            prototype.applyDNA = function (input, override, options) { return original.call(this, input, override, { ...options, forceRefit: true }); };
                        }
                        return audit.inspect();
                    }, { forceFull });
                    await page.waitForTimeout(500);
                    await page.evaluate(() => window.__fjordAudit.start({ gpu: true }));
                    const boundaries = await page.evaluate(async (dates) => {
                        const audit = window.__fjordAudit, refs = audit.references, rows = [];
                        let previous = 0;
                        for (const due of dates) {
                            const started = performance.now();
                            await refs.advanceTicks(due - previous);
                            rows.push({ tickOffset: due, wallMs: performance.now() - started });
                            previous = due;
                            await new Promise(requestAnimationFrame);
                        }
                        refs.setPlayback(false);
                        return rows;
                    }, dates);
                    const result = await page.evaluate(() => ({ sample: window.__fjordAudit.stop(), after: window.__fjordAudit.inspect(), state: window.__fjordAudit.references.session.snapshot() }));
                    assert.deepEqual(result.state, core.applyCommand(saved.fjord.campaign, { type: 'AdvanceTicks', ticks: 1000 }));
                    rows.push({ mode, forceFull, repeat, dates, boundaries, before, ...result });
                    console.log(JSON.stringify({ mode, forceFull, repeat, applyDNA: result.sample.spans['human.applyDNA.inclusive'], maxFrame: result.sample.frames.max }));
                    await save();
                    await page.close();
                }
    }
    else
        throw new Error('Choose QA_PHASE micro or stock.');
    assert.deepEqual(errors, []);
}
catch (error) {
    errors.push(String(error));
    if (currentPage && !currentPage.isClosed()) {
        await writeFile(output + '/' + phase + '-failure.txt', await currentPage.locator('body').innerText());
        await currentPage.screenshot({ path: output + '/' + phase + '-failure.png' });
    }
    throw error;
}
finally {
    await save();
    await browser.close();
}
