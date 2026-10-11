import { openFjordMenu, openFjordCampaign, selectFjordQuality, toggleFjordCampaign, advanceFjordYear } from './fjord-header-controls.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const lanOrigin = process.env.QA_LAN_ORIGIN || 'http://192.168.68.104:5180';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/screen-awake';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
const results = [];
await mkdir(output, { recursive: true });
const awake = page => page.getByRole('button', { name: 'Keep screen awake', exact: true });
const sleep = page => page.getByRole('button', { name: 'Allow screen sleep', exact: true });
try {
    for (const route of ['/gameplay-lab', '/play', '/fjord-play']) {
        const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
        page.on('pageerror', error => errors.push(route + ': ' + error.message));
        await page.addInitScript(() => {
            const play = HTMLMediaElement.prototype.play;
            const pause = HTMLMediaElement.prototype.pause;
            window.mediaCalls = { plays: 0, pauses: 0, media: null };
            HTMLMediaElement.prototype.play = function () {
                window.mediaCalls.plays++;
                window.mediaCalls.media = this;
                return play.call(this);
            };
            HTMLMediaElement.prototype.pause = function () {
                window.mediaCalls.pauses++;
                return pause.call(this);
            };
        });
        await page.goto(lanOrigin + route);
        assert.equal(await page.evaluate(() => window.isSecureContext), false);
        assert.equal(await page.evaluate(() => 'wakeLock' in navigator), false);
        if (route === '/fjord-play') await openFjordMenu(page);
        await awake(page).tap({ timeout: 10000 });
        await sleep(page).waitFor();
        await page.waitForFunction(() => window.mediaCalls.media && !window.mediaCalls.media.paused);
        await page.waitForFunction(() => document.querySelector('[data-screen-awake]')?.getAttribute('aria-pressed') === 'true');
        // Normal campaign repaint must retain the browser setting.
        if (route === '/fjord-play') {
            await advanceFjordYear(page);
            await openFjordMenu(page);
        } else await page.getByRole('button', { name: '+1 Winter', exact: true }).tap();
        await sleep(page).waitFor();
        assert.equal(await page.evaluate(() => window.mediaCalls.plays), 1);
        await page.locator('#screen-awake-control').screenshot({ path: output + route + '.png' });
        await sleep(page).tap();
        await awake(page).waitFor();
        assert.equal(await page.evaluate(() => window.mediaCalls.media.paused), true);
        assert.equal(await awake(page).getAttribute('aria-pressed'), 'false');
        results.push({ route, insecureLAN: true, realMediaPlayback: true, repaintRetainsLock: true,
            disablePausesMedia: true });
        await page.close();
    }
    const nativePage = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    nativePage.on('pageerror', error => errors.push('native: ' + error.message));
    await nativePage.addInitScript(() => {
        window.screenAPI = { requests: 0, releases: 0, mode: 'ok', locks: [] };
        Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
            request: async type => {
                if (type !== 'screen') throw new Error('Unexpected lock type');
                const api = window.screenAPI;
                api.requests++;
                if (api.mode === 'reject') throw new DOMException('Denied', 'NotAllowedError');
                const lock = new EventTarget();
                lock.released = false;
                lock.release = async () => {
                    if (lock.released) return;
                    lock.released = true;
                    api.releases++;
                    lock.dispatchEvent(new Event('release'));
                };
                api.locks.push(lock);
                if (api.mode === 'defer')
                    await new Promise(resolve => { api.resolve = resolve; });
                return lock;
            }
        } });
        window.setPageHidden = hidden => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
            document.dispatchEvent(new Event('visibilitychange'));
        };
    });
    await nativePage.goto(origin + '/gameplay-lab');
    await awake(nativePage).tap();
    await nativePage.waitForFunction(() => document.querySelector('[data-screen-awake]')?.getAttribute('aria-pressed') === 'true');
    await nativePage.getByRole('button', { name: '+1 Winter', exact: true }).tap();
    assert.equal(await nativePage.evaluate(() => window.screenAPI.requests), 1);
    await sleep(nativePage).tap();
    assert.equal(await nativePage.evaluate(() => window.screenAPI.releases), 1);

    await nativePage.evaluate(() => { window.screenAPI.mode = 'reject'; });
    await awake(nativePage).tap();
    await nativePage.getByText('Screen lock unavailable. Tap to retry.', { exact: true }).waitFor();
    assert.equal(await awake(nativePage).getAttribute('aria-pressed'), 'false');
    await nativePage.evaluate(() => { window.screenAPI.mode = 'ok'; });
    await awake(nativePage).tap();
    await nativePage.waitForFunction(() => window.screenAPI.requests === 3);
    await nativePage.evaluate(() => window.setPageHidden(true));
    assert.equal(await nativePage.evaluate(() => window.screenAPI.releases), 2);
    await nativePage.evaluate(() => window.setPageHidden(false));
    await nativePage.waitForFunction(() => window.screenAPI.requests === 4 && document.querySelector('[data-screen-awake]')?.getAttribute('aria-pressed') === 'true');
    await nativePage.evaluate(() => window.screenAPI.locks.at(-1).release());
    await nativePage.getByText('Screen lock ended. Tap to retry.', { exact: true }).waitFor();
    await awake(nativePage).tap();
    await nativePage.waitForFunction(() => window.screenAPI.requests === 5 && document.querySelector('[data-screen-awake]')?.getAttribute('aria-pressed') === 'true');
    await sleep(nativePage).tap();

    await nativePage.evaluate(() => { window.screenAPI.mode = 'defer'; });
    await awake(nativePage).tap();
    await nativePage.waitForFunction(() => window.screenAPI.requests === 6);
    await sleep(nativePage).tap();
    await awake(nativePage).waitFor({ timeout: 3000 });
    await nativePage.evaluate(() => window.screenAPI.resolve());
    await nativePage.waitForFunction(() => window.screenAPI.releases === 5);
    assert.equal(await awake(nativePage).getAttribute('aria-pressed'), 'false');
    await nativePage.evaluate(() => { window.screenAPI.mode = 'ok'; });
    await awake(nativePage).tap();
    await nativePage.waitForFunction(() => window.screenAPI.requests === 7 && document.querySelector('[data-screen-awake]')?.getAttribute('aria-pressed') === 'true');
    await nativePage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    assert.equal(await nativePage.evaluate(() => window.screenAPI.releases), 6);
    await nativePage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await nativePage.waitForFunction(() => window.screenAPI.requests === 8 && document.querySelector('[data-screen-awake]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 3000 });
    await nativePage.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await nativePage.evaluate(() => window.screenAPI.releases), 7);
    await nativePage.evaluate(() => window.setPageHidden(false));
    assert.equal(await nativePage.evaluate(() => window.screenAPI.requests), 8);
    await nativePage.close();
    results.push({ nativeAPI: true, disableReleases: true, rejectedRequestCanRetry: true,
        visibilityReacquires: true, revokedLockCanRetry: true, lateRequestReleased: true,
        cachedPageReturnReacquires: true, pagehideReleasesAndDisposes: true });
    assert.deepEqual(errors, []);
    await writeFile(output + '/result.json', JSON.stringify({ results, errors,
        physicalIPadAutoLockVerified: false }, null, 2));
    console.log('PASS: all campaign views, real HTTP LAN media fallback and native screen-lock lifecycle.');
} finally {
    await browser.close();
}
