import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {loadTypeScript} from './load-typescript.mjs';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const {meshyHumanAvailableClips} = loadTypeScript(new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const baseURL = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5182';
const output = process.env.ANIMATION_QA_OUTPUT ?? 'artifacts/meshy-animation-timing';
mkdirSync(output, {recursive: true});

// Read the last authored timestamp independently of the runtime AnimationClip.
const durations = [0, 1, 2].map(lod => {
    const bytes = readFileSync(new URL('../public/game-assets/human/Human_LOD' + lod + '.glb', import.meta.url));
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    return Object.fromEntries(json.animations.map(animation => [animation.name,
        Math.fround(Math.max(...animation.samplers.map(sampler => json.accessors[sampler.input].max[0])))]));
});
const errors = [], records = [], playback = [];
const browser = await chromium.launch({headless: true, channel: process.env.BROWSER_CHANNEL,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1440, height: 1080}});
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());});
const ready = () => page.waitForSelector('canvas[data-ready="true"]', {timeout: 60000});
async function captureOriginal(name) {
    const stage = await page.locator('.lab-stage').boundingBox();
    const controls = await page.locator('.lab-pose-controls').boundingBox();
    await page.screenshot({path: output + '/' + name + '.png', clip: {
        x: stage.x, y: stage.y, width: stage.width,
        height: controls.y + controls.height - stage.y,
    }});
}
try {
    for (const route of ['/character-lab', '/meshy-preview']) {
        await page.goto(baseURL + route);
        await ready();
        const original = route === '/character-lab';
        if (!original) {
            assert.equal(await page.locator('#meshy-count').inputValue(), '10');
            await page.locator('#meshy-count').selectOption('1');
            await ready();
        }
        const animation = page.locator(original ? '#lab-animation' : '#meshy-clip');
        const time = page.locator(original ? '#lab-pose-time' : '#meshy-time');
        const label = page.locator(original ? '#lab-clip-duration' : '#meshy-clip-duration');
        assert.deepEqual(await animation.locator('option').evaluateAll(options => options.map(option => option.value)), meshyHumanAvailableClips);
        for (const lod of [0, 1, 2]) {
            if (original) await page.locator('[data-action="lod' + lod + '"]').click();
            else await page.locator('#meshy-lod').selectOption(String(lod));
            await ready();
            for (const clip of meshyHumanAvailableClips) {
                const duration = durations[lod][clip];
                await animation.focus();
                await animation.selectOption(clip);
                assert.equal(Number(await time.getAttribute('max')), duration, route + '/LOD' + lod + '/' + clip);
                assert.equal(await label.textContent(), 'Clip duration: ' + duration.toFixed(3) + ' s · 1× speed');
                if (original) {
                    await time.fill(String(duration));
                    await page.locator('[data-action="freeze-pose"]').click();
                    await page.locator('[data-action="snapshot-export"]').dispatchEvent('click');
                    const snapshot = JSON.parse(await page.locator('#lab-snapshot').inputValue());
                    assert.equal(snapshot.pose.animation, clip);
                    assert.equal(snapshot.pose.time, duration, clip + ': last authored frame must remain sampleable');
                    assert.equal(snapshot.pose.paused, true);
                } else {
                    await time.focus();
                    await time.press('End');
                    // Native range controls serialize decimal values with browser precision.
                    assert.ok(Math.abs(Number(await time.inputValue()) - duration) < 1e-12);
                    assert.equal(await page.locator('#meshy-pause').textContent(), 'Resume');
                }
                records.push({route, lod, clip, duration, sampledEndpoint: Number(await time.inputValue())});
            }
            console.log('Checked every clip and endpoint:', route, 'LOD' + lod);
        }
        for (const clip of ['Running', 'Unsteady_Walk']) {
            const duration = durations[2][clip];
            await animation.focus();
            await animation.selectOption(clip);
            // Observe only the visible time control, including its late frames and loop reset.
            const observed = await page.evaluate(async ({selector, duration}) => {
                const samples = [], wrapTimes = [];
                let maximumFrameGap = 0, previousWallTime = performance.now();
                const start = performance.now();
                let previous = 0, wraps = 0;
                while (wraps < 2 && performance.now() - start < 20000) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    const value = Number(document.querySelector(selector).value);
                    const wallTime = performance.now();
                    maximumFrameGap = Math.max(maximumFrameGap, wallTime - previousWallTime);
                    previousWallTime = wallTime;
                    samples.push(value);
                    if (value < previous - duration / 2) {
                        wraps++;
                        wrapTimes.push((wallTime - start) / 1000);
                    }
                    previous = value;
                }
                return {samples, wraps, wrapTimes, maximumFrameGap};
            }, {selector: original ? '#lab-pose-time' : '#meshy-time', duration});
            assert.equal(observed.wraps, 2, route + '/' + clip + ': preview did not complete two loops');
            const frameSeconds = observed.maximumFrameGap / 1000;
            assert.ok(frameSeconds < duration / 2, route + '/' + clip + ': frame rate is too low to inspect this loop');
            // At low FPS the endpoint falls between rendered frames. Exact endpoint sampling
            // is checked separately above; playback must reach within one observed frame.
            assert.ok(Math.max(...observed.samples) >= duration - frameSeconds - .001,
                route + '/' + clip + ': last observable section was omitted');
            const wallLoopSeconds = observed.wrapTimes[1] - observed.wrapTimes[0];
            const frameTolerance = Math.max(.1, observed.maximumFrameGap / 1000 * 2);
            assert.ok(Math.abs(wallLoopSeconds - duration) < frameTolerance,
                route + '/' + clip + ': wall-clock loop length differs from the GLB (' + wallLoopSeconds + ' s)');
            playback.push({route, clip, duration, wallLoopSeconds, ...observed});
            const nearEnd = duration - .001;
            if (original) {
                await time.fill(String(nearEnd));
                await page.locator('[data-action="freeze-pose"]').click();
                await page.locator('[data-action="view-side"]').click();
                await captureOriginal('original-' + clip + '-near-end');
                await time.fill(String(duration));
                await page.locator('[data-action="freeze-pose"]').click();
                await captureOriginal('original-' + clip + '-endpoint');
            } else {
                await time.focus();
                await time.press('End');
                await time.press('ArrowLeft');
                await page.screenshot({path: output + '/focused-' + clip + '-near-end.png', fullPage: true});
            }
            console.log('Observed two full loops:', route, clip);
        }
    }
    assert.deepEqual(errors, []);
    writeFileSync(output + '/public-lab-evidence.json', JSON.stringify({baseURL, records, playback, errors}, null, 2) + '\n');
    console.log('PASS: 84 visible duration/endpoint checks, eight observed loops, no browser errors.');
} finally {
    await browser.close();
}
