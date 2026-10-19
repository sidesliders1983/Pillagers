import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { selectFjordQuality, openFjordMenu, closeFjordMenu } from './fjord-header-controls.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5188';
const output = process.env.QA_OUTPUT || 'artifacts/quality-policy-211/controls';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile('docs/qa/village-nature-203/village-17-island-pool-v2.json', 'utf8'));
fixture.pace.running = false;
fixture.presentation.quality = 'standard';
fixture.presentation.effects = 'low';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2, hasTouch: true });
const report = { status: 'RUNNING', browser: browser.version(), device: 'Windows Edge, DPR2 touch emulation; physical iOS untested',
    checks: [], samples: [], errors: [] };
try {
    const page = await context.newPage();
    page.setDefaultTimeout(240000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(save => {
        if (!sessionStorage.getItem('qa-quality-seeded')) {
            sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save));
            sessionStorage.setItem('qa-quality-seeded', 'true');
        }
    }, fixture);
    await page.goto(origin + '/fjord-play?debugLifecycle=1');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const sample = () => page.evaluate(async () => {
        const refs = window.__fjordAudit.references;
        await refs.settle();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
            core: refs.session.saveJSON(), book: JSON.stringify(refs.session.book.snapshot()),
            blueprint: JSON.stringify(refs.campaign.blueprint),
            ratio: refs.renderer.getPixelRatio(),
            renderer: { geometries: refs.renderer.info.memory.geometries, textures: refs.renderer.info.memory.textures },
            world: { ground: refs.world.describe().groundTier, water: refs.world.describe().water.quality },
            shadow: refs.lighting.directional.shadow.mapSize.x,
            models: refs.models.inspectResources(),
            actors: refs.layer.describe().filter(entity => entity.kind === 'persona')
                .map(entity => ({ key: entity.key, uuid: refs.layer.root.getObjectByName(entity.key)?.uuid })),
            fire: refs.campfireEffect.inspect(), rain: refs.precipitationEffect.inspect(),
        };
    });
    const initial = await sample();
    assert.ok(initial.actors.length && initial.actors.every(actor => actor.uuid));
    assert.equal(initial.ratio, 1, 'A cold Standard campaign retains the existing ratio 1');
    assert.equal(initial.world.ground, 'standard');
    console.log('PASS cold Standard ratio and real resident identities');
    const unchanged = current => {
        assert.equal(current.core, initial.core);
        assert.equal(current.book, initial.book);
        assert.equal(current.blueprint, initial.blueprint);
        assert.deepEqual(current.models, initial.models);
        assert.deepEqual(current.actors, initial.actors);
        assert.equal(current.world.ground, 'standard', 'Live switches retain the loaded ground source tier');
    };
    for (let cycle = 0; cycle < 3; cycle++) {
        for (const quality of ['low', 'standard']) {
            await selectFjordQuality(page, quality);
            const current = await sample();
            unchanged(current);
            assert.equal(current.ratio, quality === 'low' ? 1 : 1.5);
            assert.equal(current.shadow, quality === 'low' ? 1024 : 2048);
            assert.equal(current.world.water, quality === 'low' ? 'low' : 'medium');
            report.samples.push({ cycle, quality, ...current, core: undefined, book: undefined, blueprint: undefined });
        }
    }
    for (const quality of ['low', 'standard']) {
        const matching = report.samples.filter(sample => sample.quality === quality);
        assert.deepEqual(matching[1].renderer, matching[2].renderer, 'Warm resources stabilize at each quality');
    }
    report.checks.push('Three live quality cycles preserve exact Core/book/geography/native instances and ground tier; water/shadow/DPR budgets apply and warm GPU resource counts stabilize');
    console.log('PASS live quality cycles, exact facts and stable resources/identities');
    for (const effects of ['normal', 'off', 'low']) {
        await openFjordMenu(page);
        await page.selectOption('#fjord-effects', effects);
        await closeFjordMenu(page);
        const current = await sample();
        unchanged(current);
        assert.equal(current.rain.enabled, effects !== 'off');
        assert.equal(current.fire.visible, effects !== 'off');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await sample();
    unchanged(reduced);
    assert.equal(reduced.rain.enabled, false);
    assert.equal(reduced.fire.visible, false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    report.checks.push('Existing Off/Low/Normal and reduced motion remain independent of world quality, Core, heat and resident detail');
    console.log('PASS independent effect choices and reduced motion');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(150);
    const resized = await sample();
    unchanged(resized);
    assert.equal(resized.ratio, 1.5);
    const dimensions = await page.locator('#fjord-canvas').evaluate(canvas => ({
        width: canvas.width, css: canvas.getBoundingClientRect().width,
    }));
    assert.ok(Math.abs(dimensions.width - dimensions.css * 1.5) <= 1);
    await page.evaluate(() => {
        window.qualityCanvas = document.querySelector('#fjord-canvas');
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    const returned = await sample();
    unchanged(returned);
    assert.equal(returned.ratio, 1.5);
    assert.equal(await page.evaluate(() => window.qualityCanvas === document.querySelector('#fjord-canvas')), true);
    assert.equal(await page.evaluate(() => {
        window.qualityContext = window.__fjordAudit.references.renderer.getContext().getExtension('WEBGL_lose_context');
        if (!window.qualityContext) return false;
        window.qualityContext.loseContext();
        return true;
    }), true);
    await page.locator('#fjord-context-recovery').waitFor({ timeout: 10000 });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.qualityContext.restoreContext());
    await page.locator('#fjord-context-recovery').waitFor({ state: 'detached' });
    const recovered = await sample();
    unchanged(recovered);
    assert.equal(recovered.ratio, 1.5);
    assert.equal(await page.evaluate(() => window.qualityCanvas === document.querySelector('#fjord-canvas')), true);
    report.lifecycle = { returnedRatio: returned.ratio, recoveredRatio: recovered.ratio, sameCanvas: true };
    report.checks.push('Orientation resize, synthetic cached return and real WebGL context recovery retain the same scene, live DPR and exact paused campaign');
    console.log('PASS resize, cached return and real graphics context recovery');
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const restored = await sample();
    assert.equal(restored.core, initial.core);
    assert.equal(restored.book, initial.book);
    assert.equal(restored.blueprint, initial.blueprint);
    assert.equal(restored.ratio, 1);
    assert.equal(await page.locator('#fjord-quality').inputValue(), 'standard');
    assert.equal(await page.locator('#fjord-effects').inputValue(), 'low');
    report.checks.push('A genuine reload restores explicit Standard/Low preferences and exact save facts, retaining the established cold-start ratio');
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
    console.log('PASS real reload and exact restored preferences');
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile(output + '/checks.json', JSON.stringify(report, null, 2));
    await browser.close();
}
