import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
assert.equal(existsSync('Assets'), false, 'This worktree must contain no private source assets');
const shared = new SharedSettlement(17, 123, true, 'island-pool-v1', 'summer-800-v1');
shared.session.command({ type: 'AdvanceTicks', ticks: 1000 });
const household = Object.values(shared.session.readSnapshot().households).find(home => home.memberIds.length);
shared.session.command({ type: 'BuildHouse', householdId: household.id });
shared.session.setRunning(false);
const fixture = shared.persist();
await mkdir('artifacts/public-runtime-assets', { recursive: true });
await writeFile('artifacts/public-runtime-assets/campaign.json', fixture);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
    for (const { origin, route } of [
        { origin: 'http://127.0.0.1:5320', route: '/' },
        { origin: 'http://127.0.0.1:5321', route: '/' },
        { origin: 'http://127.0.0.1:5321', route: '/fjord-play' },
        { origin: 'http://127.0.0.1:5321', route: '/model-preview/' }
    ]) {
        const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
        const page = await context.newPage();
        page.setDefaultTimeout(240000);
        const errors = [], resources = [], checks = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
            const url = new URL(response.url());
            if (!/\.(glb|gltf|bin|json|wasm)$/.test(url.pathname)) return;
            resources.push({ path: url.pathname, status: response.status(), type: response.headers()['content-type'] });
            checks.push((async () => {
                assert.equal(response.ok(), true, 'Missing runtime resource: ' + url.pathname);
                assert.ok(!response.headers()['content-type']?.includes('text/html'), 'HTML fallback instead of asset: ' + url.pathname);
                if (url.pathname.endsWith('.json')) await response.json();
            })());
        });
        if (route === '/fjord-play') await page.addInitScript(text => {
            sessionStorage.setItem('pillagers.fjord-play.active.v1', text);
        }, fixture);
        const started = Date.now();
        await page.goto(origin + route);
        if (route === '/') await page.locator('#world[data-ready="true"]').waitFor();
        else if (route === '/fjord-play') {
            await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
            const close = page.locator('#clan-book-close');
            if (await close.isVisible()) await close.click();
            const rendered = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered));
            assert.ok(rendered.some(entity => entity.kind === 'building'), 'A real built house must be rendered');
            assert.ok(rendered.some(entity => entity.kind === 'longship'), 'A real longship must be rendered');
            assert.ok(rendered.every(entity => !entity.placeholder), 'No source-dependent placeholder models');
        } else await page.waitForFunction(() => window.modelLoaded === true);
        await page.waitForTimeout(500);
        await Promise.all(checks);
        assert.deepEqual(errors, []);
        assert.equal(resources.some(resource => resource.path.startsWith('/assets/Terrain/')), false);
        const name = route === '/' ? (origin.endsWith('5320') ? 'development' : 'production') : route.replaceAll('/', '');
        await page.screenshot({ path: 'artifacts/public-runtime-assets/' + name + '.png' });
        results.push({ origin, route, loadMs: Date.now() - started, errors, resources });
        console.log(name + ': ready without Assets/, ' + resources.length + ' valid model/manifest/decoder requests.');
        await context.close();
    }
    const hashes = {};
    for (const path of ['src/core/AssetManager.ts', 'src/fjord-play/FjordModels.ts', 'vite.config.ts',
        'src/config/TerrainAssets.ts', 'scripts/validate-public-assets.mjs'])
        hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
    await writeFile('artifacts/public-runtime-assets/browser.json', JSON.stringify({ sourceAssetsPresent: false,
        desktopOnly: true, hashes, results }, null, 2));
} finally { await browser.close(); }
