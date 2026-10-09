import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5182';
const output = process.env.QA_OUTPUT || 'scratch/fjordside-continuous-years';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
// Mock only the external wall clock. Rendering, aging and controls remain real.
await page.addInitScript(() => {
    window.fjordYearClock = 1000;
    performance.now = () => window.fjordYearClock;
});
const controls = async () => {
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
};
const read = () => page.locator('canvas').evaluate(canvas => ({
    fixture: JSON.parse(canvas.dataset.fixture),
    population: JSON.parse(canvas.dataset.population),
}));
const step = async (elapsed, year) => {
    await page.evaluate(elapsed => { window.fjordYearClock = 1000 + elapsed; }, elapsed);
    await page.waitForFunction(year => {
        const canvas = document.querySelector('canvas');
        return canvas?.dataset.fixture && JSON.parse(canvas.dataset.fixture).year === year;
    }, year);
    // Give a rendered frame time to update the visible pause state too.
    await page.waitForTimeout(100);
    return read();
};
const save = async () => {
    const [download] = await Promise.all([
        page.waitForEvent('download'), page.click('#fjordside-export'),
    ]);
    return readFile(await download.path(), 'utf8');
};
const checkAging = (before, after) => {
    assert.equal(after.population.length, 10);
    for (const person of after.population) {
        const original = before.population.find(resident => resident.id === person.id);
        assert.equal(person.age, original.age + 1 < 60 ? original.age + 1 : 5);
        assert.ok(person.safe && Math.abs(person.y - person.ground) < .00001);
    }
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
    const originalSave = await save();
    await page.selectOption('#fjordside-camera', 'village');
    await page.click('#debug-close');
    const before = await step(1000, 1200);
    const firstYear = await step(60000, 1201);
    assert.equal(await page.locator('dialog[open]').count(), 0,
        'An annual transition must not interrupt Fjordside with a modal');
    assert.equal(firstYear.fixture.paused, false, 'The world continues across the year boundary');
    checkAging(before, firstYear);
    const continued = await step(62000, 1201);
    assert.ok(continued.fixture.time > firstYear.fixture.time,
        'Animation and movement time advances without pressing Continue');
    assert.ok(continued.population.some((resident, index) => {
        const previous = firstYear.population[index];
        return Math.hypot(resident.x - previous.x, resident.z - previous.z) > 0;
    }), 'Residents continue moving after an annual transition');
    const secondYear = await step(120000, 1202);
    checkAging(firstYear, secondYear);
    assert.equal(secondYear.fixture.paused, false);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('canvas').screenshot({ path: output + '/year-1202.png' });
    await controls();
    assert.equal(await save(), originalSave, 'Annual aging preserves the stored geography');
    await page.click('#fjordside-pause');
    const paused = await step(240000, 1202);
    assert.equal(paused.fixture.paused, true);
    assert.equal(paused.fixture.time, secondYear.fixture.time);
    const residentState = sample => sample.population.map(({ id, seed, age, x, y, z, speed, animation }) =>
        ({ id, seed, age, x, y, z, speed, animation }));
    assert.deepEqual(residentState(paused), residentState(secondYear),
        'Manual Pause still freezes residents and aging');
    await page.click('#fjordside-pause');
    const resumed = await step(241000, 1202);
    assert.equal(resumed.fixture.paused, false);
    assert.ok(resumed.fixture.time > paused.fixture.time);
    const thirdYear = await step(300000, 1203);
    checkAging(secondYear, thirdYear);
    assert.equal(thirdYear.fixture.paused, false);
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({
        seed: 17, clock: 'controlled performance.now; real rendering and controls',
        before, firstYear, continued, secondYear, paused, resumed, thirdYear, errors,
    }, null, 2));
    console.log('PASS: uninterrupted annual aging and movement, three years, manual Pause/Resume and preserved geography.');
} catch (error) {
    await page.screenshot({ path: output + '/failure.png' }).catch(() => {});
    console.error('Page errors:', errors);
    throw error;
} finally {
    await browser.close();
}
