import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const output = process.env.QA_OUTPUT;
const variants = JSON.parse(process.env.QA_VARIANTS);
const repeats = Number(process.env.QA_REPEATS || 3);
const fixture = await readFile('docs/qa/fjord-runtime-improvements/170/fixtures/developed-810.json', 'utf8');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const result = { browser: browser.version(), physicalIOS: false,
    fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
    variants, repeats, runs: [], errors: [],
    note: 'Real touch events on a 390x844 viewport, fixed native camera and prepared assets. CPU handler and first camera-render submission are measured separately. Submission is not physical display latency. Running uses natural wall-clock ticks; each actual Core is replayed, not compared at unequal ticks.' };
try {
    for (let repeat = 1; repeat <= repeats; repeat++) for (const variant of repeat % 2 ? variants : [...variants].reverse()) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.setDefaultTimeout(180000);
        page.on('pageerror', error => result.errors.push(error.stack || error.message));
        await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), fixture);
        await page.goto(variant.origin + '/fjord-play');
        await page.waitForFunction(() => window.__fjordAudit?.references && document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
        await page.evaluate(() => {
            const select = document.querySelector('#fjord-quality');
            select.value = 'low'; select.dispatchEvent(new Event('change'));
        });
        if (await page.locator('#fjord-management-toggle').getAttribute('aria-expanded') === 'true')
            await page.locator('#fjord-management-toggle').click();
        await page.evaluate(async () => {
            const refs = window.__fjordAudit.references;
            const { Raycaster, Vector2 } = await import(performance.getEntriesByType('resource')
                .find(entry => /\/deps\/three\.js/.test(entry.name)).name);
            refs.setPlayback(false);
            const state = window.__navigation = { spans: [], frames: [], submissions: [], inputs: [], refs,
                startView: { position: refs.camera.position.toArray(), target: refs.controller.focus.toArray() } };
            function wrap(object, name, label) {
                const original = object[name];
                object[name] = function(...args) {
                    const start = performance.now();
                    try { return original.apply(this, args); }
                    finally { if (state.recording) state.spans.push({ name: label, start, ms: performance.now() - start }); }
                };
            }
            wrap(refs.layer, 'pick', 'entity.pick'); wrap(refs.controller, 'navigate', 'navigate');
            const originalRay = Raycaster.prototype.intersectObject;
            Raycaster.prototype.intersectObject = function(object, ...args) {
                const start = performance.now();
                try { return originalRay.call(this, object, ...args); }
                finally { if (state.recording) state.spans.push({
                    name: object === refs.layer.root ? 'entity.ray' : object === refs.world.terrain ? 'terrain.ray' : 'other.ray',
                    start, ms: performance.now() - start }); }
            };
            const originalUpdate = refs.controller.update;
            refs.controller.update = function(dt) {
                const start = performance.now(), value = originalUpdate.call(this, dt);
                if (state.recording) state.frames.push({ time: performance.now(), dt, cpu: performance.now() - start,
                    focus: this.focus.toArray(), eye: refs.camera.position.toArray(), ...this.inspectClearance() });
                return value;
            };
            const originalRender = refs.renderer.render;
            refs.renderer.render = function(...args) {
                const value = originalRender.apply(this, args);
                if (state.recording) state.submissions.push({ time: performance.now(), focus: refs.controller.focus.toArray() });
                return value;
            };
            document.querySelector('#fjord-canvas').addEventListener('pointerup', event => {
                if (!state.recording) return;
                refs.camera.updateMatrixWorld(true);
                state.inputs.push({ time: performance.now(), eventTime: event.timeStamp, type: event.pointerType,
                    x: event.clientX, y: event.clientY, viewport: document.querySelector('#fjord-canvas').getBoundingClientRect().toJSON(),
                    world: refs.camera.matrixWorld.toArray(), projection: refs.camera.projectionMatrix.toArray() });
            }, { capture: true });
            state.verifyInput = () => {
                const input = state.inputs[0], camera = refs.camera.clone(), rect = input.viewport;
                camera.matrixWorld.fromArray(input.world);
                camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
                camera.projectionMatrix.fromArray(input.projection);
                camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
                const ray = new Raycaster();
                ray.setFromCamera(new Vector2((input.x - rect.x) / rect.width * 2 - 1,
                    1 - (input.y - rect.y) / rect.height * 2), camera);
                return ray.intersectObject(refs.world.terrain, false)[0]?.point.toArray();
            };
            state.findTarget = () => {
                const rect = document.querySelector('#fjord-canvas').getBoundingClientRect();
                refs.camera.updateMatrixWorld(true);
                for (const fy of [.6, .75, .45, .3]) for (const fx of [.2, .8, .35, .65]) {
                    const x = rect.left + rect.width * fx, y = rect.top + rect.height * fy;
                    if (refs.layer.pick(refs.camera, x, y, rect, 'touch')) continue;
                    const ray = new Raycaster(); ray.setFromCamera(new Vector2(fx * 2 - 1, 1 - fy * 2), refs.camera);
                    const hit = ray.intersectObject(refs.world.terrain, false)[0];
                    if (hit && Math.hypot(hit.point.x - refs.controller.focus.x, hit.point.z - refs.controller.focus.z) > 3)
                        return { x, y, point: hit.point.toArray() };
                }
                throw Error('No empty navigable target');
            };
        });
        for (const running of [false, true]) for (let tap = 1; tap <= 2; tap++) {
            const prepared = await page.evaluate(running => {
                const s = window.__navigation;
                s.recording = false; s.refs.setPlayback(running); s.refs.controller.setView(s.startView);
                return { target: s.findTarget(), initialFocus: s.refs.controller.focus.toArray(), canonical: s.refs.session.saveJSON() };
            }, running);
            await page.waitForTimeout(1000);
            await page.evaluate(() => {
                const s = window.__navigation; s.frames = []; s.spans = []; s.submissions = []; s.inputs = []; s.recording = true;
            });
            await page.touchscreen.tap(prepared.target.x, prepared.target.y);
            await page.waitForTimeout(2000);
            const capture = await page.evaluate(() => {
                const s = window.__navigation; s.recording = false;
                return { spans: s.spans, frames: s.frames, submissions: s.submissions, inputs: s.inputs,
                    nativeInputPoint: s.verifyInput(), desired: s.refs.controller.desired.toArray(), focus: s.refs.controller.focus.toArray(),
                    canonical: s.refs.session.saveJSON(), placeholders: s.refs.layer.describe().filter(e => e.placeholder).map(e => e.key),
                    renderer: { draw: { ...s.refs.renderer.info.render }, memory: { ...s.refs.renderer.info.memory } } };
            });
            result.lastAttempt = { variant: variant.label, repeat, running, tap, prepared, capture };
            assert.equal(capture.inputs.length, 1); assert.equal(capture.inputs[0].type, 'touch');
            assert.deepEqual(capture.placeholders, []);
            assert.ok(Math.hypot(capture.desired[0] - capture.nativeInputPoint[0], capture.desired[2] - capture.nativeInputPoint[2]) < 1e-8);
            const before = JSON.parse(prepared.canonical), after = JSON.parse(capture.canonical);
            const ticks = (after.time.winter - before.time.winter) * 1000 + after.time.tick - before.time.tick;
            assert.deepEqual(after, core.applyCommand(before, { type: 'AdvanceTicks', ticks }));
            if (!running) assert.equal(capture.canonical, prepared.canonical);
            const navigation = capture.spans.filter(row => row.name === 'navigate'); assert.equal(navigation.length, 1);
            const first = capture.submissions.find(row => Math.hypot(row.focus[0] - prepared.initialFocus[0], row.focus[2] - prepared.initialFocus[2]) > 1e-6);
            assert.ok(first, 'A real camera frame follows the touch');
            delete result.lastAttempt;
            delete capture.canonical;
            result.runs.push({ variant: variant.label, sourceCommit: variant.sourceCommit, repeat, running, tap,
                target: prepared.target, initialFocus: prepared.initialFocus, ...capture, actualTicks: ticks,
                canonicalReplayEqual: true, canonicalSha256: createHash('sha256').update(JSON.stringify(after)).digest('hex'),
                firstCameraSubmissionAfterInputMs: first.time - capture.inputs[0].time });
            await writeFile(output + '/results.json', JSON.stringify(result, null, 2) + '\n');
            console.log(JSON.stringify({ variant: variant.label, repeat, running, tap, cpu: navigation[0].ms,
                firstCameraSubmissionMs: first.time - capture.inputs[0].time, ticks }));
        }
        await context.close();
    }
    assert.deepEqual(result.errors, []);
} catch (error) {
    result.failure = String(error); await writeFile(output + '/results.json', JSON.stringify(result, null, 2) + '\n'); throw error;
} finally { await browser.close(); }
