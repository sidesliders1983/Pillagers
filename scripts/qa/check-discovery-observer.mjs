import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/docs/qa/clan-discovery/scene.html?seed=18');
    await page.locator('#discovery-fixture[data-ready="true"]').waitFor();
    const foreground = await page.evaluate(() => window.discoveryReview.foregroundProof());
    assert.ok(foreground[0] > 180 && foreground[1] < 100, 'Unknown terrain behind a known object cannot paint over the foreground');
    const before = await page.evaluate(() => window.discoveryReview.inspect());
    assert.equal(before.rivalVisible, false);
    const steps = await page.evaluate(() => {
        const route = window.discoveryReview.fixture.route;
        return route.filter((_, index) => index % 32 === 0 || index === route.length - 1);
    });
    assert.ok(steps.length > 5, 'The fixture uses an existing canonical walkability route');
    const observations = [];
    for (let i = 0; i < steps.length; i++) {
        const timings = await page.evaluate(point => window.discoveryReview.observe(point), steps[i]);
        const immediate = await page.evaluate(() => window.discoveryReview.inspect());
        assert.ok(immediate.transitioning || i === 0, 'Changed knowledge begins a visual-only transition');
        observations.push({ point: steps[i], timings, exploredCells: immediate.exploredCells, visibleCells: immediate.visibleCells });
        await page.waitForTimeout(100); // Deliberately interrupt fades with later confirmed observations.
        if (i === Math.floor(steps.length / 2)) {
            await page.evaluate(() => window.discoveryReview.setView('top'));
            await page.screenshot({ path: 'artifacts/clan-discovery/route-midpoint.jpg', quality: 88 });
        }
    }
    await page.waitForTimeout(1000);
    const arrived = await page.evaluate(() => window.discoveryReview.inspect());
    assert.ok(arrived.exploredCells > before.exploredCells);
    assert.equal(arrived.transitioning, false);
    assert.equal(arrived.rivalVisible, true, 'The fixture marker appears only after confirmed observation');
    await page.screenshot({ path: 'artifacts/clan-discovery/route-arrived.jpg', quality: 88 });
    await page.evaluate(() => window.discoveryReview.depart());
    await page.waitForTimeout(1000);
    const departed = await page.evaluate(() => window.discoveryReview.inspect());
    assert.equal(departed.exploredCells, arrived.exploredCells);
    assert.ok(departed.visibleCells < arrived.visibleCells);
    assert.equal(departed.rivalVisible, false, 'Departure hides live enemy fixture without erasing mapped terrain');
    await page.screenshot({ path: 'artifacts/clan-discovery/route-departed.jpg', quality: 88 });
    assert.deepEqual(errors, []);
    await writeFile('artifacts/clan-discovery/observer-route.json', JSON.stringify({
        kind: 'Developer-only confirmed-observer fixture, not a Core expedition mission', foregroundPixel: foreground,
        routeSamples: steps.length, observations, startingCells: before.exploredCells,
        arrivedCells: arrived.exploredCells, departedCells: departed.exploredCells,
        savedBeforeFadeFinishes: true, enemyHiddenAfterDeparture: !departed.rivalVisible, errors,
    }, null, 2));
    console.log('Confirmed observations reveal terrain incrementally; departure retains mapping and hides live fixture.');
} finally { await browser.close(); }
