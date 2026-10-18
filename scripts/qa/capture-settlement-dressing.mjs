import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadTypeScript } from '../load-typescript.mjs';

// Optional external QA runner, like the existing browser studies; no production dependency.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5197';
const output = resolve(process.env.QA_OUTPUT || 'artifacts/settlement-dressing-203');
const requestedSeed = process.argv.find(argument => argument.startsWith('--seed='))?.split('=')[1];
const seeds = requestedSeed ? [Number(requestedSeed)] : [17, 32];
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value)
    ? value : JSON.stringify(value)).digest('hex');
await mkdir(output, { recursive: true });
const sourceFiles = ['src/fjord-play/FjordPlay.ts', 'src/fjord-play/SettlementDressing.ts',
    'src/fjord-play/SettlementDressingLayer.ts', 'src/world/StructureSeasonTint.ts'];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
    [file, digest(await readFile(new URL('../../' + file, import.meta.url)))])));

function fixture(seed) {
    const shared = new SharedSettlement(seed, 123, true, 'island-pool-v1', 'summer-800-v1');
    shared.fjord.enableDiscovery();
    shared.session.setRunning(false);
    const fire = shared.fjord.readProjection().campfire.transform;
    shared.setPresentation({ quality: 'standard', effects: 'off', camera: {
        position: [fire.x + 28, fire.y + 31, fire.z - 32], target: [fire.x, fire.y + 1, fire.z] } });
    const saved = JSON.parse(shared.persist());
    for (const chapter of saved.fjord.narrative.chapters) chapter.read = chapter.notified = true;
    return saved;
}

const report = process.argv.includes('--resume')
    ? JSON.parse(await readFile(output + '/measurements.json', 'utf8'))
    : { baseline: '255ef2d34d611677844b6d89e2226659da3671a5', sourceHashes,
    comparison: 'Same production scene with only the independent dressing root hidden/shown.',
    cases: [], profiles: [], errors: [] };
assert.deepEqual(report.sourceHashes, sourceHashes, 'Resume requires identical production source fingerprints');
const browser = await chromium.launch({ channel: process.env.QA_BROWSER || 'msedge', headless: true });
try {
    for (const seed of seeds) {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        page.on('pageerror', error => report.errors.push(error.message));
        await page.addInitScript(data => sessionStorage.setItem('pillagers.fjord-play.active.v1',
            JSON.stringify(data)), fixture(seed));
        await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('.fjord-load-error') ||
            document.querySelector('#fjord-canvas')?.dataset.ready === 'true', undefined, { timeout: 240000 });
        assert.equal(await page.locator('.fjord-load-error').count(), 0);
        const close = page.locator('#clan-book-close');
        if (await close.isVisible()) await close.click();
        await page.waitForTimeout(1500);
        console.log(JSON.stringify({ seed, status: 'ready' }));

        async function capture(name, camera) {
            if (report.cases.some(result => result.name === name)) return;
            const results = [];
            for (const enabled of [false, true]) {
                const data = await page.evaluate(async ({ enabled, camera }) => {
                    const audit = window.__fjordAudit, refs = audit.references;
                    refs.dressing.root.visible = enabled;
                    const golden = await audit.golden.capture({ camera });
                    return { golden, dressing: refs.dressing.inspect() };
                }, { enabled, camera });
                await page.screenshot({ path: output + '/' + name + (enabled ? '-after.jpg' : '-before.jpg'),
                    type: 'jpeg', quality: 88 });
                const { canonicalJSON, blueprintJSON, actors, ...metadata } = data.golden;
                results.push({ ...data, golden: { ...metadata, canonicalHash: digest(canonicalJSON),
                    blueprintHash: digest(blueprintJSON), actorHash: digest(actors) } });
            }
            for (const key of ['canonicalHash', 'blueprintHash', 'actorHash', 'camera', 'calendar', 'lighting'])
                assert.deepEqual(results[0].golden[key], results[1].golden[key], name + ': ' + key);
            assert.deepEqual(results[1].golden.placeholders, []);
            report.cases.push({ seed, name, before: results[0], after: results[1] });
            console.log(JSON.stringify({ name, instances: results[1].dressing.instances,
                assets: results[1].dressing.batches.map(batch => batch.asset),
                draws: results.map(result => result.golden.renderer.callsIncludingShadows) }));
            await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
        }

        const homeCamera = await page.evaluate(() => {
            const refs = window.__fjordAudit.references;
            return { position: refs.camera.position.toArray(), target: refs.controller.focus.toArray() };
        });
        await capture('landing-' + seed + '-summer-standard', homeCamera);
        await page.evaluate(async () => {
            const refs = window.__fjordAudit.references;
            const state = refs.session.readSnapshot(), homes = Object.values(state.households);
            const farmer = homes.find(home => home.memberIds.some(id => state.personas[id].occupation === 'farmer'));
            const ordinary = homes.find(home => home.memberIds.every(id => state.personas[id].occupation !== 'farmer'));
            refs.session.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
            for (const home of [farmer, ordinary]) refs.session.command({ type: 'BuildHouse', householdId: home.id });
            refs.refresh(); await refs.settle();
        });
        await capture('village-' + seed + '-summer-standard', homeCamera);
        const closeCamera = await page.evaluate(() => {
            const view = window.__fjordAudit.references.campaign.readProjection();
            const home = view.entities.find(entity => entity.kind === 'building' && !entity.status.farmyard).transform;
            return { position: [home.x + 13, home.y + 12, home.z - 15], target: [home.x, home.y + .6, home.z] };
        });
        await capture('house-' + seed + '-summer-standard', closeCamera);
        // The settings control lives in a closed menu; this QA runner exercises its change handler.
        await page.locator('#fjord-quality').selectOption('low', { force: true });
        await capture('village-' + seed + '-summer-low', homeCamera);

        if (process.argv.includes('--profile') && !report.profiles.some(profile => profile.seed === seed)) {
            for (const enabled of [false, true, true, false]) {
                await page.evaluate(enabled => {
                    const audit = window.__fjordAudit, refs = audit.references;
                    refs.dressing.root.visible = enabled;
                    audit.golden.frozen = false;
                    refs.setPlayback(true);
                    audit.start({ instrument: true, gpu: true, cameraPath: true });
                }, enabled);
                const counts = await page.evaluate(() => window.__fjordAudit.references.dressing.inspect());
                for (let step = 0; step < 12; step++) {
                    await page.evaluate(() => window.__fjordAudit.references.advanceTicks(1));
                    await page.waitForTimeout(500);
                }
                const metrics = await page.evaluate(() => {
                    const audit = window.__fjordAudit;
                    const result = { timings: audit.stop(), runtime: audit.inspect(),
                        dressing: audit.references.dressing.inspect() };
                    audit.references.setPlayback(false);
                    audit.golden.frozen = true;
                    return result;
                });
                assert.equal(metrics.dressing.planBuilds, counts.planBuilds);
                assert.equal(metrics.dressing.batchBuilds, counts.batchBuilds);
                report.profiles.push({ seed, enabled, ...metrics });
                console.log(JSON.stringify({ seed, profile: enabled,
                    frameIntervalP95: metrics.timings.frames.p95,
                    frameCallbackWallP95: metrics.timings.spans['frame.callback.inclusive']?.p95,
                    gpu: metrics.timings.gpu.p95, dressing: metrics.timings.spans['dressing.sync.self'],
                    planBuilds: metrics.dressing.planBuilds - counts.planBuilds }));
            }
        }

        await page.locator('#fjord-quality').selectOption('standard', { force: true });
        await page.evaluate(async () => {
            const refs = window.__fjordAudit.references, time = refs.session.readSnapshot().time;
            await refs.advanceTicks((1000 - time.tick) % 1000);
        });
        await capture('village-' + seed + '-winter-standard', homeCamera);

        // Clearly labelled developed QA fixture. Extra stocks are only injected in this runner.
        await page.evaluate(async () => {
            const refs = window.__fjordAudit.references, state = refs.session.snapshot();
            state.stocks.food = 2000; state.stocks.materials = 400;
            refs.session.loadJSON(JSON.stringify(state));
            for (const home of Object.values(refs.session.readSnapshot().households)) {
                const residence = home.residenceId && refs.session.readSnapshot().residences[home.residenceId];
                if (residence?.kind !== 'house') refs.session.command({ type: 'BuildHouse', householdId: home.id });
            }
            const buildings = Object.values(refs.session.readSnapshot().buildings);
            for (const [index, building] of buildings.entries()) {
                const current = refs.session.readSnapshot();
                const household = Object.values(current.households).find(home => home.residenceId &&
                    current.residences[home.residenceId]?.buildingId === building.id);
                const occupation = household?.memberIds.map(id => current.personas[id].occupation).find(Boolean) || 'hunter';
                refs.session.command({ type: 'SpecializeBuilding', buildingId: building.id, occupation });
                for (let level = 0; level < (index % 3); level++)
                    refs.session.command({ type: 'UpgradeBuilding', buildingId: building.id });
            }
            // Exercise an actual house-backed fisher and a smith, rather than specialize all homes as farms.
            const people = Object.values(refs.session.readSnapshot().personas);
            refs.session.command({ type: 'AssignOccupation', personaId: people[0].id, occupation: 'smith' });
            const time = refs.session.readSnapshot().time;
            await refs.advanceTicks((500 - time.tick + 1000) % 1000);
            refs.refresh(); await refs.settle();
        });
        const overview = await page.evaluate(() => {
            const homes = window.__fjordAudit.references.campaign.readProjection().entities.filter(e => e.plot);
            const x = homes.reduce((sum, e) => sum + e.plot.x, 0) / homes.length;
            const z = homes.reduce((sum, e) => sum + e.plot.z, 0) / homes.length;
            const y = Math.max(...homes.map(e => e.plot.y));
            return { position: [x + 48, y + 58, z - 52], target: [x, y, z] };
        });
        await capture('developed-qa-' + seed + '-summer-standard', overview);
        await page.locator('#fjord-quality').selectOption('low', { force: true });
        await capture('developed-qa-' + seed + '-summer-low', overview);
        const resources = [];
        for (let cycle = 0; cycle < 10; cycle++) {
            await page.locator('#fjord-quality').selectOption('standard', { force: true });
            await page.locator('#fjord-quality').selectOption('low', { force: true });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            resources.push(await page.evaluate(() => ({ ...window.__fjordAudit.references.renderer.info.memory,
                instances: window.__fjordAudit.references.dressing.inspect().instances })));
        }
        assert.deepEqual(resources.at(-1), resources[0], 'Ten quality cycles must retain stable resource counts');
        report.cases.push({ seed, name: 'ten-quality-cycles', resources });
        await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
        await page.close();
    }
    assert.deepEqual(report.errors, []);
    await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
} finally { await browser.close(); }
