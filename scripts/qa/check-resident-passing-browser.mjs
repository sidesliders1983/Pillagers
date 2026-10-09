import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5182';
const output = process.env.QA_OUTPUT || 'scratch/resident-passing-review';
const duration = Number(process.env.QA_SECONDS || 60);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: process.env.QA_SOFTWARE === '1' ?
        ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
await page.addLocatorHandler(page.locator('#year-summary[open]'), async () => {
    await page.click('#year-continue');
});
const errors = [], samples = [], captures = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const read = () => page.locator('canvas').evaluate(canvas => ({
    fixture: JSON.parse(canvas.dataset.fixture),
    population: JSON.parse(canvas.dataset.population),
    interactions: JSON.parse(canvas.dataset.interactions),
}));
const controls = async () => {
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
};
const capture = async (name, sample) => {
    await page.waitForTimeout(750);
    await page.locator('canvas').screenshot({ path: output + '/' + name + '.png' });
    captures.push({ name, time: sample.fixture.time });
};
try {
    await page.goto(origin + '/?world=reference&worldDev=1');
    await page.locator('canvas[data-ready=true]').waitFor();
    await controls();
    await page.fill('#fjordside-seed', '17');
    await page.selectOption('#fjordside-quality', 'low');
    await Promise.all([page.waitForEvent('framenavigated'), page.click('#fjordside-generate')]);
    await page.locator('canvas[data-ready=true]').waitFor();
    await controls();
    await page.selectOption('#fjordside-camera', 'village');
    await page.click('#debug-close');
    // Review the rear of the first house, where the seeded encounter occurs.
    // Use the same right-drag orbit controls available to the player.
    await page.mouse.move(960, 400);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(440, 470, { steps: 20 });
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.interactions);
    assert.equal(await page.locator('canvas').getAttribute('data-character-source'), 'meshy');
    const first = await read();
    assert.equal(first.population.length, 10);
    assert.equal(first.fixture.world.seed, 17);
    await capture('initial', first);
    await controls();
    await page.check('#helpers');
    await page.click('#debug-close');
    await capture('probes', await read());
    await controls();
    await page.uncheck('#helpers');
    await page.click('#debug-close');
    const start = first.fixture.time, wallStart = Date.now();
    const travel = first.population.map(() => 0), stopped = [...travel], longestStop = [...travel];
    let previous = first, sawEncounter = false, sawResume = false, middle = false;
    while (previous.fixture.time - start < duration) {
        assert.ok(Date.now() - wallStart < 240000, 'World does not advance');
        if (await page.locator('#year-summary').isVisible()) await page.click('#year-continue');
        await page.waitForTimeout(500);
        const sample = await read();
        const dt = sample.fixture.time - previous.fixture.time;
        if (dt <= 0) continue;
        for (let i = 0; i < sample.population.length; i++) {
            const resident = sample.population[i], before = previous.population[i];
            assert.ok(resident.safe && Math.abs(resident.y - resident.ground) < .00001);
            const distance = Math.hypot(resident.x - before.x, resident.z - before.z);
            const samePersona = resident.seed === before.seed;
            // Annual replacement is a spawn, not locomotion. Measure a stop from
            // positions across the interval; one zero-speed frame may still follow a turn.
            if (samePersona) travel[i] += distance;
            const state = sample.interactions[i].state;
            stopped[i] = samePersona && distance < 1e-6 &&
                state !== 'talking' && state !== 'listening' ? stopped[i] + dt : 0;
            longestStop[i] = Math.max(longestStop[i], stopped[i]);
            for (let j = i + 1; j < sample.population.length; j++) {
                const other = sample.population[j];
                assert.ok(Math.hypot(resident.x - other.x, resident.z - other.z) >=
                    sample.interactions[i].radius + sample.interactions[j].radius - 1e-6,
                'Resident personal-space overlap');
            }
        }
        if (!sawEncounter && sample.interactions.some(resident => resident.partnerId !== null)) {
            sawEncounter = true;
            await capture('encounter', sample);
        }
        if (sawEncounter && !sawResume && sample.interactions.some(resident => resident.state === 'resume')) {
            sawResume = true;
            await capture('resumed', sample);
        }
        if (!middle && sample.fixture.time - start >= duration / 2) {
            middle = true;
            await capture('passing', sample);
        }
        samples.push(sample);
        previous = sample;
    }
    await controls();
    await page.click('#fjordside-pause');
    await page.click('#debug-close');
    await capture('final', previous);
    const report = { seed: 17, simulationSeconds: previous.fixture.time - start,
        wallSeconds: (Date.now() - wallStart) / 1000, travel, longestStop, sawEncounter, sawResume,
        captures, errors, samples };
    await writeFile(output + '/results.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, samples: samples.length }, null, 2));
    assert.ok(travel.every(distance => distance > 1), 'Residents fail to make progress');
    assert.ok(longestStop.every(seconds => seconds < 6), 'Resident remains stalled beyond ordinary turns/waits');
    assert.ok(sawEncounter && sawResume, 'Observe both a conversation and route resumption');
    assert.deepEqual(errors, []);
} catch (error) {
    console.error('World status:', await page.locator('#status').textContent({ timeout: 2000 }).catch(() => 'Page unavailable'));
    console.error('Page errors:', errors);
    await writeFile(output + '/failure.json', JSON.stringify({ errors, message: error.message }, null, 2));
    await page.screenshot({ path: output + '/failure.png' }).catch(() => {});
    throw error;
} finally {
    await browser.close();
}
