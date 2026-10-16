import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5191';
const output = process.env.QA_OUTPUT || 'artifacts/fjord-golden';
const names = (process.env.QA_FIXTURES || 'summer-32,summer-17,developed-810,snow-811').split(',');
const fixtureDirectory = process.env.QA_FIXTURE_DIR || 'docs/qa/fjord-runtime-performance/fixtures';
const reloads = Number(process.env.QA_RELOADS || 2);
const quality = process.env.QA_QUALITY || 'standard';
assert.ok(['standard', 'low'].includes(quality));
assert.ok(Number.isInteger(reloads) && reloads >= 1 && reloads <= 3);
const digest = value => createHash('sha256').update(value).digest('hex');
const viewport = { width: Number(process.env.QA_WIDTH || 1400), height: Number(process.env.QA_HEIGHT || 900) };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const result = {
    version: 'fjord-golden-v1', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    diffSha256: digest(execFileSync('git', ['diff', 'HEAD', '--', 'src', 'scripts/qa'])),
    browser: browser.version(), viewport, quality, reloads, cases: [], errors: [], resources: [],
};
const sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--',
    'src', 'scripts/qa/fjord-runtime-server.mjs', 'scripts/qa/fjord-runtime-browser.mjs',
    'scripts/qa/fjord-golden-browser.mjs', 'scripts/qa/capture-golden-fjord.mjs'],
    { encoding: 'utf8' }).trim().split(/\r?\n/)
    .filter(path => /\.(ts|css|mjs)$/.test(path));
result.sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path =>
    [path, digest(await readFile(path))])));
const resources = new Map(), responseWork = [];
const write = () => writeFile(output + '/results.json', JSON.stringify(result, null, 2) + '\n');
try {
    for (const name of names) {
        assert.match(name, /^[a-z0-9-]+$/);
        const input = await readFile(fixtureDirectory + '/' + name + '.json', 'utf8');
        const fixture = JSON.parse(input);
        const expectedCanonical = core.reconstructState(JSON.stringify(fixture.fjord.campaign));
        fixture.target = 'fjord';
        fixture.pace.running = false;
        if (fixture.presentation) fixture.presentation = { ...fixture.presentation, quality, effects: 'off' };
        const json = JSON.stringify(fixture);
        const entry = { name, fixtureSha256: digest(input), loadedSha256: digest(json), captures: [] };
        result.cases.push(entry);
        let expectedState, expectedPixels;
        for (let reload = 0; reload < reloads; reload++) {
            const page = await context.newPage();
            page.setDefaultTimeout(240000);
            page.on('pageerror', error => result.errors.push({ name, reload, error: error.message }));
            page.on('console', message => {
                if (message.type() === 'error') result.errors.push({ name, reload, error: message.text() });
            });
            page.on('response', response => {
                const path = new URL(response.url()).pathname;
                if (!/\.(glb|webp|png|jpg|wasm|json)$/.test(path)) return;
                responseWork.push((async () => {
                    const bytes = await response.body();
                    const resource = { path, status: response.status(), bytes: bytes.length, sha256: digest(bytes) };
                    if (resources.has(path)) assert.deepEqual(resource, resources.get(path), 'Served asset changed: ' + path);
                    resources.set(path, resource);
                })().catch(error => result.errors.push({ path, error: String(error) })));
            });
            try {
                console.log('OPEN golden', name, quality, 'reload', reload);
                await page.addInitScript(({ json, quality }) => {
                    sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
                    const observer = new MutationObserver(() => {
                        const control = document.querySelector('#fjord-quality');
                        const effects = document.querySelector('#fjord-effects');
                        if (!control || !effects) return;
                        control.value = quality;
                        effects.value = 'off';
                        observer.disconnect();
                    });
                    observer.observe(document, { childList: true, subtree: true });
                }, { json, quality });
                await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded', timeout: 240000 });
                await page.waitForFunction(() => window.__fjordAudit?.golden &&
                    document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
                const state = await page.evaluate(() => window.__fjordAudit.golden.capture());
                assert.deepEqual(state.placeholders, [], 'Golden scenes must use actual entity assets');
                assert.deepEqual(JSON.parse(state.canonicalJSON), expectedCanonical,
                    'Loading must preserve every canonical fact, RNG state and event');
                assert.equal(state.quality, quality);
                assert.equal(state.effects, 'off');
                const canonicalSha256 = digest(state.canonicalJSON);
                const blueprintSha256 = digest(state.blueprintJSON);
                delete state.canonicalJSON;
                delete state.blueprintJSON;
                const stateSha256 = digest(JSON.stringify(state));
                const image = await page.locator('#fjord-canvas').screenshot();
                const pixels = await sharp(image).raw().toBuffer();
                const secondState = await page.evaluate(() => window.__fjordAudit.golden.capture());
                assert.equal(digest(secondState.canonicalJSON), canonicalSha256);
                assert.equal(digest(secondState.blueprintJSON), blueprintSha256);
                delete secondState.canonicalJSON;
                delete secondState.blueprintJSON;
                assert.deepEqual(secondState, state, 'Consecutive frozen frames must preserve every fixture field');
                const secondPixels = await sharp(await page.locator('#fjord-canvas').screenshot()).raw().toBuffer();
                assert.ok(pixels.equals(secondPixels), 'Consecutive golden frames must be pixel identical');
                if (reload) {
                    assert.equal(stateSha256, expectedState, 'Fresh page must restore identical state');
                    assert.ok(pixels.equals(expectedPixels), 'Fresh page must restore identical world pixels');
                }
                expectedState = stateSha256;
                expectedPixels = pixels;
                const label = name + '-' + quality + '-' + reload;
                await writeFile(output + '/' + label + '-world.png', image);
                await page.screenshot({ path: output + '/' + label + '-desktop.png' });
                const host = await page.evaluate(() => window.__fjordAudit.inspect().renderer);
                entry.captures.push({ canonicalSha256, blueprintSha256, stateSha256,
                    pixelsSha256: digest(pixels), host, state, image: label + '-world.png' });
                console.log('PASS golden', label, state.calendar.season, state.renderer.callsIncludingShadows, 'calls');
                await write();
            } catch (error) {
                entry.failure = { message: String(error), url: page.url(),
                    body: await page.locator('body').innerText().catch(() => 'Page unavailable') };
                await page.screenshot({ path: output + '/' + name + '-failed.png', timeout: 5000 }).catch(() => {});
                throw error;
            } finally { await page.close(); }
        }
    }
    await Promise.all(responseWork);
    for (const [path, hash] of Object.entries(result.sourceHashes)) {
        assert.equal(digest(await readFile(path)), hash, 'Source changed during golden capture: ' + path);
    }
    result.resources = [...resources.values()].sort((a, b) => a.path.localeCompare(b.path));
    assert.deepEqual(result.resources.filter(resource => resource.status >= 400), []);
    assert.deepEqual(result.errors, []);
    result.status = 'PASS';
} catch (error) {
    result.status = 'FAIL';
    result.failure = String(error);
    throw error;
} finally {
    await Promise.all(responseWork);
    result.resources = [...resources.values()].sort((a, b) => a.path.localeCompare(b.path));
    await write();
    await browser.close();
}
