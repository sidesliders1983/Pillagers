import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const variant = process.argv[2] || 'desktop';
const mobile = variant === 'touch';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5195';
const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
const defaultOutput = 'scratch/onboarding-ui-basics-325/browser-' + variant + '-' + stamp + '-' + process.pid;
const output = path.resolve(process.env.QA_OUTPUT || defaultOutput);
const viewport = mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 };
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourcePaths = [
    'src/fjord-play/JourneyProgress.ts',
    'src/fjord-play/FoundingJourney.ts',
    'src/fjord-play/FirstStepsGuide.ts',
    'src/fjord-play/FirstStepsState.ts',
    'src/fjord-play/FjordInterface.ts',
    'src/fjord-play/FjordPlay.ts',
    'src/fjord-play/FjordHeader.ts',
    'src/fjord-play/first-steps.css',
    'scripts/qa/check-onboarding-ui-basics.mjs',
];
const hash = value => createHash('sha256').update(value).digest('hex');
const initialGitRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
}).trim();
const initialSourceSHA256 = Object.fromEntries(await Promise.all(sourcePaths.map(async source => {
    const contents = await readFile(path.join(repositoryRoot, source));
    return [source, hash(contents)];
})));

// Each run owns a new directory; an existing QA_OUTPUT must never be reused.
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const temporaryDirectory = path.join(output, 'tmp');
await mkdir(temporaryDirectory, { recursive: false });
process.env.TEMP = temporaryDirectory;
process.env.TMP = temporaryDirectory;
process.env.TMPDIR = temporaryDirectory;
const report = {
    schemaVersion: 1,
    variant,
    viewport,
    origin,
    startedUtc: new Date().toISOString(),
    initialGitRevision,
    initialSourceSHA256,
    status: 'running',
    stages: [],
    errors: [],
    screenshots: [],
    headless: true,
    limits: 'Native desktop Chrome; touch emulation is not physical iPhone Safari or an uncoached human test.',
};
const save = async () => writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
await save();

const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    executablePath: process.env.QA_CHROME || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
});
report.browser = browser.version();
const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: mobile ? 'reduce' : 'no-preference',
});
await context.addInitScript(() => localStorage.setItem('fjordside.entry-motion', 'off'));
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const snapshot = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
const canonical = data => JSON.stringify(data.fjord.campaign);
const capture = async name => {
    const filename = name + '.png';
    await page.screenshot({ path: path.join(output, filename) });
    report.screenshots.push(filename);
};

async function stage(name, action) {
    const started = Date.now();
    const result = await action();
    report.stages.push({
        name,
        status: 'passed',
        elapsedMs: Date.now() - started,
        result,
    });
    console.log('PASS ' + variant + ' ' + name);
    await save();
    return result;
}

async function ready(previousAttempt) {
    await page.waitForFunction(before => {
        const canvas = document.querySelector('#fjord-canvas');
        if (canvas?.dataset.ready !== 'true' || document.body.classList.contains('island-preparing')) return false;
        if (!before) return true;
        const load = JSON.parse(canvas.dataset.loadDiagnostics || '{}');
        return load.attempt !== before && load.outcome === 'playable';
    }, previousAttempt, { timeout: 180000 });
}

async function expandGuide() {
    const expand = page.locator('[data-guide="expand"]');
    if (await expand.isVisible()) await expand.click();
}

async function menuSection(label) {
    const menu = page.locator('#fjord-menu');
    if (!await menu.evaluate(node => node.open)) await menu.locator(':scope > summary').click();
    const section = menu.locator('[data-menu-section]').filter({
        has: page.locator('summary').filter({ hasText: label }),
    }).first();
    if (!await section.evaluate(node => node.open)) await section.locator(':scope > summary').click();
}

async function closeStory() {
    await page.locator('#loading-clan-book.founding-book-ready').waitFor({ timeout: 180000 });
    await page.getByRole('button', { name: 'Close founding chapter', exact: true }).click();
    await page.locator('[data-guide="guide"]').waitFor();
}

async function openHelp() {
    if (await page.locator('#fjord-menu').evaluate(node => node.open))
        await page.locator('#fjord-menu [data-menu-close]').click();
    if (mobile) await page.locator('#fjord-mobile-menu').click();
    await page.locator('#fjord-first-steps').click();
}

try {
    await stage('real New game entry remains paused', async () => {
        await page.goto(origin + '/fjord-play?debugLifecycle=1');
        await page.getByRole('button', { name: 'New game', exact: true }).click();
        await page.locator('[data-entry="new"]').click();
        await ready();
        await closeStory();
        assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
        report.newCampaign = await snapshot();
        report.seed = report.newCampaign.fjord.campaign.seed;
        await capture('invitation');
        await page.locator('[data-guide="guide"]').click();
        assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'orientation');
        await capture('basics-camera');
        return { seed: report.seed, canonicalSHA256: hash(canonical(report.newCampaign)) };
    });
    const before = canonical(await snapshot());
    await stage('actual camera interaction is observation only', async () => {
        const previous = await page.locator('#fjord-canvas').getAttribute('data-camera');
        if (mobile) {
            const cdp = await context.newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchStart',
                touchPoints: [{ x: 650, y: 180, id: 1 }],
            });
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: 710, y: 160, id: 1 }],
            });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await cdp.detach();
        } else {
            await page.mouse.move(1080, 420);
            await page.mouse.down();
            await page.mouse.move(1160, 470, { steps: 8 });
            await page.mouse.up();
        }
        await page.waitForFunction(value => document.querySelector('#fjord-canvas').dataset.camera !== value, previous);
        await expandGuide();
        assert.equal(canonical(await snapshot()), before);
        await page.locator('[data-guide="acknowledge"]').focus();
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-objective'), 'ui-resident');
        return { cameraChanged: true, canonicalUnchanged: true };
    });
    await stage('real Character Card closes without losing context', async () => {
        await page.locator('[data-guide="show"]').click();
        await page.locator('#entity-panel .fjord-relations').waitFor();
        const name = await page.locator('#entity-panel h2').innerText();
        await capture('resident-card');
        await page.locator('#entity-panel [data-ui="close-card"]').click();
        await expandGuide();
        assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-objective'), 'ui-connections');
        assert.ok((await snapshot()).fjord.firstSteps.journey.orientation.includes('ui-resident'));
        return { name };
    });
    await stage('existing household link and settlement return', async () => {
        await page.locator('[data-guide="show"]').click();
        await page.locator('#entity-panel .fjord-relations [data-kind="household"]').click();
        await page.locator('#entity-panel .fjord-home-residents').waitFor();
        await page.locator('#entity-panel [data-ui="close-card"]').click();
        await expandGuide();
        assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-objective'), 'ui-home');
        await page.locator('[data-guide="show"]').click();
        await page.locator('[data-ui="camera-home"]').click();
        await expandGuide();
        assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-objective'), 'ui-time');
        assert.equal(canonical(await snapshot()), before);
        return { canonicalUnchanged: true };
    });
    await stage('clock focus and completion never start time or auto-switch chapters', async () => {
        await page.locator('[data-guide="show"]').click();
        assert.equal(await page.evaluate(() => document.activeElement.id), 'fjord-run');
        assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
        await expandGuide();
        await page.locator('[data-guide="acknowledge"]').click();
        await page.locator('[aria-label="Basics complete"]').waitFor();
        const saved = await snapshot();
        assert.equal(saved.fjord.firstSteps.journey.orientation.length, 6);
        assert.equal(saved.fjord.firstSteps.journey.chapter, 'orientation');
        assert.equal(canonical(saved), before);
        await capture('basics-complete');
        await page.locator('[data-guide="continue-home"]').click();
        assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'home');
        return { orientation: saved.fjord.firstSteps.journey.orientation, canonicalUnchanged: true };
    });
    await stage('player deliberately starts and pauses the real clock', async () => {
        await page.locator('[data-guide="collapse"]').click();
        await page.locator('#fjord-run').click();
        await page.getByRole('button', { name: 'Pause simulation', exact: true }).waitFor();
        await page.waitForFunction(previous => {
            const data = JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'));
            return JSON.stringify(data.fjord.campaign) !== previous;
        }, before, { timeout: 30000 });
        await page.locator('#fjord-run').click();
        assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
        return { time: (await snapshot()).fjord.campaign.time };
    });
    await stage('ordinary Continue stays paused and keeps Chapter I and Basics progress', async () => {
        const current = await snapshot();
        await page.reload();
        await page.locator('[data-entry="continue"]').click();
        await ready();
        assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
        assert.equal(await page.locator('#fjord-first-steps-card').isVisible(), false);
        await openHelp();
        assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'home');
        assert.deepEqual((await snapshot()).fjord.firstSteps.journey.orientation, current.fjord.firstSteps.journey.orientation);
        assert.equal(canonical(await snapshot()), canonical(current));
        return { chapter: 'home', paused: true };
    });
    if (process.env.QA_ENTRIES !== 'skip') {
        await stage('in-game original-founding replay plus Explore on my own stay paused', async () => {
            await menuSection('New game / Replay');
            const previous = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-load-diagnostics')).attempt;
            await page.locator('#fjord-restart').click();
            await ready(previous);
            await closeStory();
            await page.locator('[data-guide="explore"]').click();
            const saved = await snapshot();
            assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
            assert.equal(saved.fjord.firstSteps.journey.chapter, 'orientation');
            assert.equal(saved.fjord.firstSteps.status, 'skipped');
            await capture('explore-stays-paused');
            return { seed: saved.fjord.campaign.seed, paused: true };
        });
        await stage('legacy v1 presentation file import retains its chapter and deferrals', async () => {
            const saved = (await snapshot()).fjord;
            const legacy = structuredClone(saved);
            legacy.firstSteps.status = 'active';
            legacy.firstSteps.journey.chapter = 'discovery';
            legacy.firstSteps.journey.selected = 'wildlife-species';
            legacy.firstSteps.journey.later = ['wildlife-species'];
            legacy.firstSteps.journey.skipped = ['pillage'];
            delete legacy.firstSteps.journey.orientation;
            await writeFile(path.join(output, 'legacy-v1-presentation-fixture.json'), JSON.stringify(legacy, null, 2));
            await menuSection('Load game');
            const previous = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-load-diagnostics')).attempt;
            await page.locator('#fjord-import').setInputFiles({
                name: 'legacy-v1-presentation-fixture.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(legacy)),
            });
            await ready(previous);
            assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
            await openHelp();
            assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'discovery');
            const after = (await snapshot()).fjord;
            assert.deepEqual(after.campaign, legacy.campaign);
            assert.equal(after.firstSteps.journey.selected, 'wildlife-species');
            assert.deepEqual(after.firstSteps.journey.later, ['wildlife-species']);
            assert.deepEqual(after.firstSteps.journey.skipped, ['pillage']);
            await capture('legacy-v1-discovery');
            return { chapter: after.firstSteps.journey.chapter, paused: true, canonicalUnchanged: true };
        });
        await stage('trusted Map click recognizes the real late-created control without revealing knowledge', async () => {
            const beforeMap = await snapshot();
            assert.equal(beforeMap.fjord.firstSteps.journey.orientation, undefined);
            await page.locator('#fjord-map-toggle').click();
            await page.locator('#fjord-island-map').waitFor();
            await page.waitForFunction(() => {
                const data = JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'));
                return data.fjord.firstSteps.journey.orientation?.includes('ui-home');
            });
            const after = await snapshot();
            assert.equal(canonical(after), canonical(beforeMap));
            assert.equal(after.fjord.firstSteps.journey.chapter, 'discovery');
            await capture('map-return');
            await page.locator('[data-map-close]').click();
            return { canonicalUnchanged: true, chapter: 'discovery' };
        });
    }
    assert.deepEqual(report.errors, []);
    report.final = await snapshot();
    report.status = 'complete';
} catch (error) {
    report.status = 'technical-failure';
    report.failure = { message: error.message, stack: error.stack };
    await capture('failure').catch(() => {});
    report.failurePage = await page.evaluate(() => ({
        text: document.body.innerText.slice(-6000),
        active: document.activeElement?.outerHTML.slice(0, 500),
    })).catch(() => null);
    process.exitCode = 1;
} finally {
    report.finishedUtc = new Date().toISOString();
    await save();
    await browser.close();
}
console.log(JSON.stringify({
    variant,
    status: report.status,
    output,
    stages: report.stages.length,
    errors: report.errors,
    failure: report.failure?.message,
}));
