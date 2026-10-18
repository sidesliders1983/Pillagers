import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { campaignIslandPlan } = loadTypeScript(new URL('../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const output = resolve(process.env.QA_OUTPUT || 'artifacts/village-nature-203');
const origins = [process.env.QA_BASELINE_ORIGIN || 'http://127.0.0.1:5197',
    process.env.QA_ORIGIN || 'http://127.0.0.1:5198'];
const versions = ['island-pool-v1', 'island-pool-v2'];
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
await mkdir(output, { recursive: true });
const sourceFiles = ['src/fjord-play/VillageNature.ts', 'src/fjord-play/CampaignIsland.ts',
    'src/world/NatureVariation.ts', 'src/world/SeasonTint.ts', 'src/world/VillageNatureModels.ts', 'src/world/KayKitNature.ts', 'src/world/NatureWind.ts',
    'src/fjord-play/SettlementDressing.ts', 'src/fjord-play/SettlementDressingLayer.ts',
    'src/world/WorldFactory.ts', 'src/world-generation/PlanNature.ts',
    'src/fjord-play/FjordCampaign.ts', 'src/play/SharedSettlement.ts',
    'src/world-generation/GenerationTask.ts', 'src/fjord-play/IslandLoading.ts',
    'src/fjord-play/FjordPlay.ts', 'src/play/SettlementBrowser.ts'];
const replayRoot = process.env.QA_REPLAY_ROOT;
const replay = replayRoot ? JSON.parse(await readFile(resolve(replayRoot, 'measurements.json'), 'utf8')) : null;
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async name =>
    [name, hash(await readFile(new URL('../../' + name, import.meta.url), 'utf8'))])));
const report = { baseline: 'ce9b57c660c8d034abb5c7761da248ccef526304', sourceHashes,
    comparison: 'Same geography, seed, paid village, camera and calendar. Explicit v1/v2 recipes; tree/navigation identities differ intentionally.',
    cases: [], profiles: [], cycles: [], errors: [] };
const requested = process.argv.find(arg => arg.startsWith('--seed='))?.split('=')[1];
const seeds = requested ? [Number(requested)] : [17, 32];
// Keep the review browser closed while other local validation runs, so an idle
// golden scene cannot compete with the normal-build startup or GPU measurement.
if (process.env.QA_PROFILE_READY) {
    console.log(JSON.stringify({ status: 'waiting-for-idle-profile-gate' }));
    const deadline = Date.now() + 1800000;
    for (;;) {
        try { await access(process.env.QA_PROFILE_READY); break; }
        catch {
            if (Date.now() > deadline) throw Error('Idle profile gate timed out');
            await new Promise(resolve => setTimeout(resolve, 2500));
        }
    }
}
const browser = await chromium.launch({ channel: process.env.QA_BROWSER || 'msedge', headless: true });
try {
    for (const seed of seeds) {
        const prior = replay?.cases.find(item => item.name === 'village-summer-standard-' + seed);
        const fixtures = replay ? await Promise.all(versions.map(async (version, side) => ({
            saved: JSON.parse(await readFile(resolve(replayRoot, 'village-' + seed + '-' + version + '.json'), 'utf8')),
            blueprintHash: side ? prior.after.blueprintHash : prior.before.blueprintHash
        }))) : versions.map(version => {
            const shared = new SharedSettlement(seed, 123, true, version, 'summer-800-v1');
            shared.fjord.enableDiscovery();
            shared.session.setRunning(false);
            const state = shared.session.readSnapshot(), homes = Object.values(state.households);
            const farmer = homes.find(home => home.memberIds.some(id => state.personas[id].occupation === 'farmer'));
            const other = homes.find(home => home !== farmer);
            shared.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
            for (const home of [farmer, other]) shared.command({ type: 'BuildHouse', householdId: home.id });
            const fire = shared.fjord.readProjection().campfire.transform;
            const world = shared.fjord.blueprint;
            shared.setPresentation({ quality: 'standard', effects: 'off', camera: {
                position: [fire.x + 28, fire.y + 31, fire.z - 32], target: [fire.x, fire.y + 1, fire.z] } });
            const saved = JSON.parse(shared.persist());
            for (const chapter of saved.fjord.narrative.chapters) chapter.read = chapter.notified = true;
            return { saved, world, fire, center: campaignIslandPlan(world).center };
        });
        let woodlandCamera;
        let nearby;
        if (replay) {
            const previous = replay.cases.find(item => item.name === 'woodland-summer-standard-' + seed).after.camera;
            woodlandCamera = { position: previous.position, target: previous.target };
            nearby = prior.trees;
        } else {
            for (const key of ['terrain', 'environment', 'settlement'])
                assert.equal(hash(fixtures[0].world[key]), hash(fixtures[1].world[key]), key);
            const candidate = fixtures[1], fire = candidate.fire;
            const originalTrees = new Set(fixtures[0].world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId))
                .map(p => p.assetId + '@' + p.x + ',' + p.z));
            const added = candidate.world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId) &&
                !originalTrees.has(p.assetId + '@' + p.x + ',' + p.z)).sort((a, b) =>
                Math.hypot(a.x - fire.x, a.z - fire.z) - Math.hypot(b.x - fire.x, b.z - fire.z));
            assert.ok(added.length);
            const edge = added[0];
            woodlandCamera = { position: [edge.x + 19, edge.y + 18, edge.z - 23],
                target: [(edge.x + fire.x) / 2, edge.y + 1, (edge.z + fire.z) / 2] };
            nearby = fixtures.map(({ world, center }) => ({
                total: world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId)).length,
                within55: world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId) &&
                    Math.hypot(p.x - center.x, p.z - center.z) < 55).length
            }));
        }
        for (let side = 0; side < fixtures.length; side++)
            await writeFile(output + '/village-' + seed + '-' + versions[side] + '.json',
                JSON.stringify(fixtures[side].saved));
        const pair = [];
        for (let side = 0; side < 2; side++) {
            const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
            page.on('pageerror', error => report.errors.push({ seed, side, error: error.message }));
            await page.addInitScript(saved => sessionStorage.setItem('pillagers.fjord-play.active.v1',
                JSON.stringify(saved)), fixtures[side].saved);
            await page.goto(origins[side] + '/fjord-play', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.querySelector('.fjord-load-error') ||
                document.querySelector('#fjord-canvas')?.dataset.ready === 'true', undefined, { timeout: 360000 });
            assert.equal(await page.locator('.fjord-load-error').count(), 0);
            if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
            console.log(JSON.stringify({ seed, version: versions[side], status: 'ready' }));
            const summerCamera = fixtures[side].saved.presentation.camera;
            const results = {};
            async function capture(name, camera) {
                const data = await page.evaluate(async camera => {
                    const audit = window.__fjordAudit;
                    const golden = await audit.golden.capture({ time: 2, camera });
                    return { golden, dressing: audit.references.dressing.inspect() };
                }, camera);
                await page.screenshot({ path: output + '/' + name + '-' + seed +
                    (side ? '-after.jpg' : '-before.jpg'), type: 'jpeg', quality: 88 });
                const { canonicalJSON, blueprintJSON, actors, ...rest } = data.golden;
                const canonical = JSON.parse(canonicalJSON);
                if (replay) {
                    assert.equal(hash(blueprintJSON), fixtures[side].blueprintHash,
                        'Reused fixtures require identical complete world/navigation fingerprints');
                    const oldCase = replay.cases.find(item => item.name === name + '-' + seed);
                    assert.equal(hash(canonicalJSON), (side ? oldCase.after : oldCase.before).canonicalHash,
                        'Reused fixture commands must retain the complete Core state and RNG');
                }
                results[name] = { ...rest, canonicalHash: hash(canonicalJSON), blueprintHash: hash(blueprintJSON),
                    actorHash: hash(actors), rng: canonical.rng, stocks: canonical.stocks,
                    roster: hash(canonical.personas), households: hash(canonical.households),
                    dressing: data.dressing };
                assert.deepEqual(rest.placeholders, []);
            }
            await capture('village-summer-standard', summerCamera);
            await capture('woodland-summer-standard', woodlandCamera);
            await page.locator('#fjord-quality').selectOption('low', { force: true });
            await capture('village-summer-low', summerCamera);
            await page.locator('#fjord-quality').selectOption('standard', { force: true });
            if (process.argv.includes('--profile')) {
                await page.evaluate(camera => window.__fjordAudit.references.controller.setView(camera), summerCamera);
                const before = await page.evaluate(() => window.__fjordAudit.references.dressing.inspect());
                await page.evaluate(() => {
                    const audit = window.__fjordAudit;
                    audit.golden.frozen = false;
                    audit.references.setPlayback(true);
                    audit.start({ instrument: true, gpu: true, cameraPath: true });
                });
                for (let tick = 0; tick < 12; tick++) {
                    await page.evaluate(() => window.__fjordAudit.references.advanceTicks(1));
                    await page.waitForTimeout(500);
                }
                const metrics = await page.evaluate(() => {
                    const audit = window.__fjordAudit;
                    const timings = audit.stop();
                    audit.references.setPlayback(false);
                    audit.golden.frozen = true;
                    return { timings, runtime: audit.inspect(), dressing: audit.references.dressing.inspect() };
                });
                assert.equal(metrics.dressing.planBuilds, before.planBuilds);
                assert.equal(metrics.dressing.batchBuilds, before.batchBuilds);
                report.profiles.push({ seed, side, ...metrics });
                console.log(JSON.stringify({ seed, side, cpuP95: metrics.timings.frames.p95,
                    gpuP95: metrics.timings.gpu.p95, planRebuilds: 0 }));
            }
            const cycles = [];
            for (let cycle = 0; cycle < 10; cycle++) {
                await page.locator('#fjord-quality').selectOption('low', { force: true });
                await page.locator('#fjord-quality').selectOption('standard', { force: true });
                const frame = await page.evaluate(() => window.__fjordAudit.golden.capture());
                cycles.push({ geometry: frame.renderer.geometries, textures: frame.renderer.textures,
                    instances: await page.evaluate(() => window.__fjordAudit.references.dressing.inspect().instances) });
            }
            assert.ok(cycles.every(record => JSON.stringify(record) === JSON.stringify(cycles[0])));
            report.cycles.push({ seed, side, cycles });
            await page.evaluate(async () => {
                const refs = window.__fjordAudit.references;
                const time = refs.session.readSnapshot().time;
                await refs.advanceTicks((1000 - time.tick) % 1000);
            });
            await capture('village-winter-standard', summerCamera);
            const winterSave = await page.evaluate(() => window.__fjordAudit.references.shared.persist());
            const winter = JSON.parse(winterSave);
            for (const chapter of winter.fjord.narrative.chapters) chapter.read = chapter.notified = true;
            await writeFile(output + '/winter-' + seed + '-' + versions[side] + '.json', JSON.stringify(winter));
            pair.push(results);
            await page.close();
        }
        for (const name of Object.keys(pair[0])) {
            for (const key of ['camera', 'calendar', 'lighting', 'quality', 'stocks', 'roster', 'households'])
                assert.deepEqual(pair[0][name][key], pair[1][name][key], seed + ': ' + name + ': ' + key);
            report.cases.push({ seed, name: name + '-' + seed, trees: nearby, before: pair[0][name], after: pair[1][name] });
        }
        await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ seed, captures: Object.keys(pair[0]).length, errors: report.errors.length }));
    }
    assert.deepEqual(report.errors, []);
} finally {
    await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
    await browser.close();
}
