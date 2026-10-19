import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5182';
const output = process.env.QA_OUTPUT || 'artifacts/scene-lifecycle/owner';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
let releaseLoads = () => {};
try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/docs/qa/island-map/review.html');
    let sawLoad;
    const firstLoad = new Promise(resolve => { sawLoad = resolve; });
    const gate = new Promise(resolve => { releaseLoads = resolve; });
    await page.route(/\/terrain\/.*\.glb/, async route => {
        sawLoad();
        await gate;
        await route.continue();
    });
    await page.evaluate(async () => {
        const { createFjordScene } = await import('/src/fjord-play/FjordScene.ts');
        const { SharedSettlement } = await import('/src/play/SharedSettlement.ts');
        const { SelectionLabels } = await import('/src/fjord-play/SelectionLabels.ts');
        const { ProductionLabels } = await import('/src/fjord-play/ProductionLabels.ts');
        const saved = await (await fetch('/docs/qa/village-nature-203/village-17-island-pool-v2.json')).text();
        const shared = SharedSettlement.restore(saved, 'fjord');
        document.body.innerHTML = `<main id="fjord-play"><nav id="fjord-navigation"></nav>
            <canvas id="fjord-canvas" style="width:800px;height:500px"></canvas>
            <select id="fjord-quality"><option value="low">Low</option></select>
            <select id="fjord-effects"><option value="off">Off</option></select>
            <button id="fjord-view-home">Home</button><button id="fjord-view-summit">Summit</button>
            <p id="fjord-diagnostics"></p><div id="labels"></div><svg id="leaders"></svg>
            <div id="production"></div></main>`;
        let work = 0;
        const before = shared.session.saveJSON();
        const presentation = createFjordScene({ shared, canvas: document.querySelector('canvas'),
            labels: { selection: new SelectionLabels(document.querySelector('#labels'), document.querySelector('#leaders')),
                production: new ProductionLabels(document.querySelector('#production')) },
            host: { stopped: false, loading: undefined, tickIntervalSeconds: .5,
                work: delta => { work += delta; }, built: () => {} } });
        window.sceneOwnerQA = { shared, presentation, before, work: () => work };
        window.sceneOwnerQA.initializing = presentation.initialize();
    });
    await firstLoad;
    await page.evaluate(() => {
        sceneOwnerQA.presentation.dispose();
        sceneOwnerQA.presentation.dispose();
    });
    releaseLoads();
    await page.evaluate(() => sceneOwnerQA.initializing);
    const after = await page.evaluate(() => ({ core: sceneOwnerQA.shared.session.saveJSON(),
        before: sceneOwnerQA.before, roots: sceneOwnerQA.presentation.root.children.length,
        mapControls: document.querySelectorAll('#fjord-map-toggle').length, work: sceneOwnerQA.work() }));
    assert.equal(after.core, after.before);
    assert.equal(after.roots, 0, 'Late assets cannot attach to a disposed presentation');
    assert.equal(after.mapControls, 0, 'Repeated disposal removes owned map bindings');
    assert.equal(after.work, 0);
    const lateFrame = await page.evaluate(() => {
        const before = sceneOwnerQA.presentation.renderer.info.render.frame;
        let error = null;
        try { sceneOwnerQA.presentation.frame(sceneOwnerQA.shared.fjord.readProjection().calendar, false); }
        catch (caught) { error = String(caught); }
        return { error, before, after: sceneOwnerQA.presentation.renderer.info.render.frame };
    });
    assert.equal(lateFrame.error, null, 'An already-captured frame callback must be safe after disposal');
    assert.equal(lateFrame.after, lateFrame.before, 'A disposed owner must not render another frame');
    report.checks.push('Dispose twice during a real delayed asset request: late completion attaches no roots or UI, leaves no pending work and preserves exact Core');
    await page.unroute(/\/terrain\/.*\.glb/);
    let sawHuman;
    const firstHuman = new Promise(resolve => { sawHuman = resolve; });
    const humanGate = new Promise(resolve => { releaseLoads = resolve; });
    await page.route(/\/game-assets\/human\/.*\.glb/, async route => {
        sawHuman();
        await humanGate;
        await route.continue();
    });
    await page.evaluate(async () => {
        const { createFjordScene } = await import('/src/fjord-play/FjordScene.ts');
        const { SelectionLabels } = await import('/src/fjord-play/SelectionLabels.ts');
        const { ProductionLabels } = await import('/src/fjord-play/ProductionLabels.ts');
        let work = 0;
        const presentation = createFjordScene({ shared: sceneOwnerQA.shared, canvas: document.querySelector('canvas'),
            labels: { selection: new SelectionLabels(document.querySelector('#labels'), document.querySelector('#leaders')),
                production: new ProductionLabels(document.querySelector('#production')) },
            host: { stopped: false, loading: undefined, tickIntervalSeconds: .5,
                work: delta => { work += delta; }, built: () => {} } });
        sceneOwnerQA.presentation = presentation;
        sceneOwnerQA.work = () => work;
        sceneOwnerQA.initializing = presentation.initialize().then(() => null, error => String(error));
    });
    await firstHuman;
    await page.evaluate(() => sceneOwnerQA.presentation.dispose());
    releaseLoads();
    const initializationError = await page.evaluate(() => sceneOwnerQA.initializing);
    assert.equal(initializationError, null, 'Late native body/wardrobe completion must not continue against a disposed layer');
    assert.equal(await page.evaluate(() => sceneOwnerQA.presentation.root.children.length), 0);
    assert.equal(await page.evaluate(() => sceneOwnerQA.work()), 0);
    assert.equal(await page.evaluate(() => sceneOwnerQA.shared.session.saveJSON()), after.before);
    report.checks.push('Disposal during a real native body load drains without stale scene writes, exceptions, pending work or Core changes');
    await page.unroute(/\/game-assets\/human\/.*\.glb/);
    const cycles = await page.evaluate(async () => {
        const { createFjordScene } = await import('/src/fjord-play/FjordScene.ts');
        const { SelectionLabels } = await import('/src/fjord-play/SelectionLabels.ts');
        const { ProductionLabels } = await import('/src/fjord-play/ProductionLabels.ts');
        let work = 0;
        const shared = sceneOwnerQA.shared;
        const presentation = createFjordScene({ shared, canvas: document.querySelector('canvas'),
            labels: { selection: new SelectionLabels(document.querySelector('#labels'), document.querySelector('#leaders')),
                production: new ProductionLabels(document.querySelector('#production')) },
            host: { stopped: false, loading: undefined, tickIntervalSeconds: .5,
                work: delta => { work += delta; }, built: () => {} } });
        const before = shared.session.saveJSON();
        await presentation.initialize();
        const resident = presentation.root.getObjectByName('persona:founder-1');
        const samples = [];
        for (let cycle = 0; cycle <= 3; cycle++) {
            if (cycle) await presentation.replace();
            presentation.frame(shared.fjord.readProjection().calendar, false);
            samples.push({ roots: presentation.root.children.length,
                geometries: presentation.renderer.info.memory.geometries,
                textures: presentation.renderer.info.memory.textures,
                residentRetained: presentation.root.getObjectByName('persona:founder-1') === resident,
                maps: document.querySelectorAll('#fjord-map-toggle').length, work });
        }
        const unchangedCore = before === shared.session.saveJSON();
        presentation.dispose();
        document.querySelector('#fjord-quality').dispatchEvent(new Event('change'));
        document.querySelector('#fjord-effects').dispatchEvent(new Event('change'));
        return { samples, unchangedCore, rootsAfterDisposal: presentation.root.children.length };
    });
    assert.equal(cycles.unchangedCore, true);
    assert.deepEqual(cycles.samples[2], cycles.samples[3], 'Warm replacement resources must stabilize');
    assert.ok(cycles.samples.every(sample => sample.residentRetained && sample.maps === 1 && sample.work === 0));
    assert.equal(cycles.rootsAfterDisposal, 0);
    assert.deepEqual(report.errors, []);
    report.cycles = cycles;
    report.checks.push('Three world replacements retain native resident instances and stabilize owned roots, GPU geometry/texture counters and one map; final disposal removes control bindings');
    let sawSupersededHuman;
    const supersededHuman = new Promise(resolve => { sawSupersededHuman = resolve; });
    const replacementGate = new Promise(resolve => { releaseLoads = resolve; });
    await page.route(/\/game-assets\/human\/.*\.glb/, async route => {
        sawSupersededHuman();
        await replacementGate;
        await route.continue();
    });
    await page.evaluate(async () => {
        const { createFjordScene } = await import('/src/fjord-play/FjordScene.ts');
        const { SelectionLabels } = await import('/src/fjord-play/SelectionLabels.ts');
        const { ProductionLabels } = await import('/src/fjord-play/ProductionLabels.ts');
        const presentation = createFjordScene({ shared: sceneOwnerQA.shared, canvas: document.querySelector('canvas'),
            labels: { selection: new SelectionLabels(document.querySelector('#labels'), document.querySelector('#leaders')),
                production: new ProductionLabels(document.querySelector('#production')) },
            host: { stopped: false, loading: undefined, tickIntervalSeconds: .5, work: () => {}, built: () => {} } });
        sceneOwnerQA.presentation = presentation;
        sceneOwnerQA.initializing = presentation.initialize().then(() => null, error => String(error));
    });
    await supersededHuman;
    await page.evaluate(async () => {
        const fixture = await (await fetch('/docs/qa/village-nature-203/village-32-island-pool-v2.json')).json();
        sceneOwnerQA.childrenBeforeReplacement = sceneOwnerQA.presentation.root.children.map(child => child.uuid);
        sceneOwnerQA.shared.importJSON(JSON.stringify(fixture.fjord));
        sceneOwnerQA.expectedCore = sceneOwnerQA.shared.session.saveJSON();
        sceneOwnerQA.expectedFire = sceneOwnerQA.shared.fjord.readProjection().campfire.transform;
        sceneOwnerQA.replacing = sceneOwnerQA.presentation.replace().then(() => null, error => String(error));
    });
    await page.waitForFunction(() => sceneOwnerQA.presentation.root.children.some(child =>
        !sceneOwnerQA.childrenBeforeReplacement.includes(child.uuid)), undefined, { timeout: 180000 });
    await page.evaluate(() => {
        sceneOwnerQA.observedFires = [];
        sceneOwnerQA.observer = new MutationObserver(() => {
            const fire = JSON.parse(document.querySelector('canvas').dataset.campfire || 'null');
            if (fire) sceneOwnerQA.observedFires.push({ x: fire.transform.x, z: fire.transform.z });
        });
        sceneOwnerQA.observer.observe(document.querySelector('canvas'),
            { attributes: true, attributeFilter: ['data-campfire'] });
    });
    releaseLoads();
    const replacement = await page.evaluate(async () => {
        const errors = await Promise.all([sceneOwnerQA.initializing, sceneOwnerQA.replacing]);
        sceneOwnerQA.observer.disconnect();
        const expected = { x: sceneOwnerQA.expectedFire.x, z: sceneOwnerQA.expectedFire.z };
        const result = { errors, expected, observed: sceneOwnerQA.observedFires,
            exactCore: sceneOwnerQA.shared.session.saveJSON() === sceneOwnerQA.expectedCore };
        sceneOwnerQA.presentation.dispose();
        return result;
    });
    assert.deepEqual(replacement.errors, [null, null]);
    assert.equal(replacement.exactCore, true);
    assert.ok(replacement.observed.length > 0, 'The current campaign must finish presenting');
    assert.ok(replacement.observed.every(point => point.x === replacement.expected.x && point.z === replacement.expected.z),
        'Late models from campaign 17 cannot overwrite the already-replaced campaign 32');
    report.replacement = replacement;
    report.checks.push('Replacing campaign 17 with 32 during a delayed native load publishes only current-campaign presentation, with exact Core and no stale completion');
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error.stack);
    throw error;
} finally {
    releaseLoads();
    await writeFile(output + '/checks.json', JSON.stringify(report, null, 2));
    await browser.close();
}
