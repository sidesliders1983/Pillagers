/** Capture public native Lab evidence; automated capture is not a geometry verdict. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
    origin: { type: 'string', default: 'http://127.0.0.1:5204' },
    output: { type: 'string' }, chrome: { type: 'string' },
    'expect-commit': { type: 'string' },
    armor: { type: 'string', default: 'leather' }, helmet: { type: 'string', default: 'iron' }, help: { type: 'boolean', default: false },
} });
if (values.help) {
    console.log(`Usage: node scripts/qa/capture-personal-armor-native.mjs [options]
  --origin URL         Built review server (default http://127.0.0.1:5204)
  --output PATH        Evidence directory, relative to the repository or absolute
  --chrome PATH        Optional Chrome executable; otherwise Playwright Chromium
  --expect-commit SHA  Require this exact source commit; a clean build is always required

  --armor leather|iron Choose the actual body armor model (default leather)
  --helmet leather|iron Choose the actual helmet model (default iron)

Set PILLAGERS_PLAYWRIGHT_MODULE to an installed Playwright module directory when
Playwright is not installed locally. No packages are installed by this runner.
Captures nine LOD2 stills/three snapshots, four targeted LOD0 Death stills and
snapshots, and six live actions in one owned-context video. Public controls only.
Screenshots/video require visual review; capture success is not a clearance,
performance, physical-device or owner-acceptance pass.`);
    process.exit(0);
}

assert.ok(['leather', 'iron'].includes(values.armor));
assert.ok(['leather', 'iron'].includes(values.helmet));
const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = new URL(values.origin).origin;
const output = resolve(root, values.output ??
    'scratch/personal-armor-browser/native-' + new Date().toISOString().replace(/[:.]/g, '-'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const armorId = values.armor === 'iron' ? 'garment/native-iron-body-armor' : 'garment/native-leather-body-armor';
const helmetId = values.helmet === 'leather' ? 'headwear/native-leather-helmet' : 'headwear/native-iron-helmet';
const ironSpear = 'equipment/native-iron-spear', woodenSpear = 'equipment/native-wooden-spear';
const ironShield = 'equipment/native-iron-shield';
const report = {
    schemaVersion: 1, kind: 'Personal armor native public capture', status: 'RUNNING',
    startedAt: new Date().toISOString(), origin, output,
    scope: { publicDOMOnly: true, isolatedContext: true, storageInjection: false,
        viewport: [1600, 1100], deviceScaleFactor: 2, videoSize: [1280, 880],
        stillZoom: 'One public -450 wheel step after each exact fixed view reset.',
        source: 'Native Meshy body and normal field tunic with the selected actual source variants.',
        armorId, helmetId,
        phase: 'Frozen CombatDeath time divided by the public clip duration.',
        live: 'Six public animation selections, 90 browser animation-frame callbacks each.',
    },
    limitations: [
        'Capture completion only; no automated geometry or visual-acceptance verdict.',
        'Browser animation-frame waits are not CPU/GPU timing or frame-rate measurements.',
        'The continuous video includes setup and still-capture steps as well as live action segments.',
        'Desktop headless Chrome is not physical iPhone touch, heat or frame-pacing acceptance.',
        'The Lab bounds renderer pixel ratio independently of the browser device-scale setting.',
    ],
    captures: [], snapshots: [], live: [], assets: [],
    pageErrors: [], consoleErrors: [], httpErrors: [], failedRequests: [],
};
let browser, context, page, closing = false, phase = 'startup', initialDNA;
await mkdir(output, { recursive: true });

async function settleFrames() {
    await page.evaluate(() => new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function ready(lod, weapon, shield) {
    await page.waitForFunction(({ lod, weapon, shield, armorId, helmetId }) => {
        const canvas = document.querySelector('#lab-preview');
        if (canvas?.dataset.ready !== 'true' || canvas.dataset.lod !== String(lod)) return false;
        try {
            const selected = JSON.parse(document.querySelector('#lab-fit-metadata').textContent).selectedAssets;
            return selected?.outfit === 'garment/meshy-grid-trial-001' &&
                selected.bodyArmor === armorId && selected.headwear === helmetId &&
                JSON.stringify([...(selected.equipmentItems ?? [])].sort()) ===
                    JSON.stringify([weapon, shield].filter(item => item !== 'none').sort());
        } catch { return false; }
    }, { lod, weapon, shield, armorId, helmetId }, { timeout: 180000 });
    await settleFrames();
}
async function configure(lod, weapon, shield) {
    // Changing combat props reloads the public field outfit at LOD2; select LOD afterwards.
    for (const [selector, value] of [['#lab-combat-shield', shield], ['#lab-combat-weapon', weapon]]) {
        if (await page.locator(selector).inputValue() !== value) {
            await page.locator(selector).selectOption(value);
            await page.waitForFunction(() => document.querySelector('#lab-preview')?.dataset.ready === 'true',
                undefined, { timeout: 180000 });
        }
    }
    if (await page.locator('#lab-preview').getAttribute('data-lod') !== String(lod))
        await page.locator('[data-action="lod' + lod + '"]').click();
    await ready(lod, weapon, shield);
}
async function freeze(animation, fraction) {
    await page.locator('#lab-animation').selectOption(animation);
    await settleFrames();
    const duration = Number(await page.locator('#lab-pose-time').getAttribute('max'));
    assert.ok(Number.isFinite(duration) && duration > 0 && duration <= 60, 'A public clip duration is required.');
    const time = duration * fraction;
    await page.locator('#lab-pose-time').fill(String(time));
    await page.locator('[data-action="freeze-pose"]').click();
    await settleFrames();
    assert.equal(await page.locator('#lab-preview').getAttribute('data-animation'), animation);
    assert.equal(await page.locator('#lab-preview').getAttribute('data-paused'), 'true');
    return { animation, fraction, duration, time };
}
async function view(name) {
    await page.locator('[data-action="view-' + name + '"]').click();
    await page.locator('#lab-preview').scrollIntoViewIfNeeded();
    await page.locator('#lab-preview').hover();
    await page.mouse.wheel(0, -450);
    await settleFrames();
}
async function capture(name, expected) {
    const file = name + '.png';
    await page.locator('#lab-preview').screenshot({ path: join(output, file) });
    const metadata = JSON.parse(await page.locator('#lab-fit-metadata').textContent());
    const canvas = await page.locator('#lab-preview').evaluate(element => ({
        width: element.width, height: element.height,
        cssWidth: element.getBoundingClientRect().width, cssHeight: element.getBoundingClientRect().height,
        lod: element.dataset.lod, animation: element.dataset.animation,
        paused: element.dataset.paused, camera: element.dataset.camera,
    }));
    const dna = JSON.parse(await page.locator('#lab-json').inputValue());
    assert.deepEqual(dna, initialDNA, 'Public pose/view capture must preserve DNA.');
    report.captures.push({ file, ...expected, metadata, canvas });
    console.log('Captured ' + file);
}
async function verifyAsset(entry) {
    if (report.assets.some(asset => asset.path === entry.path)) return;
    const response = await page.request.get(new URL(entry.path, origin).href);
    assert.ok(response.ok(), 'Missing snapshot asset: ' + entry.path);
    const bytes = await response.body();
    assert.equal(digest(bytes), entry.sha256, 'Served asset differs from its public snapshot: ' + entry.path);
    report.assets.push({ id: entry.id, path: entry.path, sha256: entry.sha256, bytes: bytes.length });
    if (entry.binding) await verifyAsset({ id: entry.id + ':binding', ...entry.binding });
}
async function snapshot(name, expected) {
    const details = page.locator('details.lab-snapshot');
    if (!await details.evaluate(element => element.open)) await details.locator(':scope > summary').click();
    const pending = page.waitForEvent('download');
    await page.locator('[data-action="snapshot-export"]').click();
    const download = await pending, file = name + '-snapshot.json';
    await download.saveAs(join(output, file));
    const bytes = await readFile(join(output, file)), saved = JSON.parse(bytes);
    assert.equal(saved.lod, expected.lod);
    assert.equal(saved.pose.animation, expected.animation);
    assert.equal(saved.pose.paused, true);
    assert.ok(Math.abs(saved.pose.time - expected.time) < 1e-8, 'Snapshot must freeze the requested exact clip phase.');
    assert.deepEqual(saved.dna, initialDNA);
    for (const asset of saved.modules) await verifyAsset(asset);
    report.snapshots.push({ file, sha256: digest(bytes), ...expected,
        camera: saved.camera, modules: saved.modules });
}
async function closeOwnedContext() {
    if (!context) return;
    closing = true; phase = 'owned-context-cleanup';
    const owned = context, video = page?.video();
    context = undefined;
    await owned.close();
    if (video) report.videoFile = basename(await video.path());
}

try {
    report.runnerSha256 = digest(await readFile(fileURLToPath(import.meta.url)));
    const { chromium } = createRequire(import.meta.url)(process.env.PILLAGERS_PLAYWRIGHT_MODULE || 'playwright');
    browser = await chromium.launch({ headless: true, args: ['--mute-audio'],
        ...(values.chrome ? { executablePath: values.chrome } : {}) });
    report.browser = { version: browser.version(), headless: true,
        hostPlatform: process.platform, hostArchitecture: process.arch };
    context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2,
        acceptDownloads: true, recordVideo: { dir: output, size: { width: 1280, height: 880 } } });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.pageErrors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400)
        report.httpErrors.push({ url: response.url(), status: response.status() }); });
    page.on('requestfailed', request => report.failedRequests.push({ phase, url: request.url(),
        reason: request.failure()?.errorText, duringOwnedCleanup: closing }));
    const buildResponse = await page.request.get(origin + '/build-info.json');
    assert.ok(buildResponse.ok());
    report.build = await buildResponse.json();
    assert.equal(report.build.source.dirty, false, 'Native capture requires a clean served build.');
    if (values['expect-commit']) assert.equal(report.build.source.commit, values['expect-commit']);
    await page.goto(origin + '/character-lab?combat=ready&weapon=iron&shield=iron&armor=' + values.armor + '&helmet=' + values.helmet,
        { waitUntil: 'domcontentloaded' });
    await ready(2, ironSpear, ironShield);
    initialDNA = JSON.parse(await page.locator('#lab-json').inputValue());
    report.dna = initialDNA;
    const options = await page.locator('#lab-animation option').evaluateAll(nodes =>
        nodes.map(node => ({ value: node.value, label: node.textContent, disabled: node.disabled })));
    report.availableAnimations = options;
    const available = new Set(options.map(option => option.value));
    assert.ok(available.has('Idle_02'), 'The native Idle_02 clip is required.');

    for (const [name, animation, fraction, weapon] of [
        ['Idle-no-props', 'Idle_02', .5, 'none'],
        ['Death-no-shield', 'CombatDeath', 1, ironSpear],
        ['Spear-no-shield', 'CombatSpear', .5, ironSpear],
    ]) {
        phase = 'still-' + name;
        await configure(2, weapon, 'none');
        const pose = await freeze(animation, fraction);
        for (const direction of ['front', 'side', 'back']) {
            await view(direction);
            await capture(name + '-' + direction, { ...pose, lod: 2, weapon, shield: 'none', view: direction });
        }
        await snapshot(name, { ...pose, lod: 2, weapon, shield: 'none' });
    }
    for (const [label, weapon] of [['wooden', woodenSpear], ['iron', ironSpear]]) {
        for (const fraction of [.75, 1]) {
            const name = 'LOD0-Death-' + label + '-' + String(fraction).replace('.', '-');
            phase = 'targeted-' + name;
            await configure(0, weapon, 'none');
            const pose = await freeze('CombatDeath', fraction);
            await view('front');
            await capture(name + '-front', { ...pose, lod: 0, weapon, shield: 'none', view: 'front' });
            await snapshot(name, { ...pose, lod: 0, weapon, shield: 'none' });
        }
    }
    await configure(2, ironSpear, ironShield);
    for (const animation of ['Idle_02', 'Walking', 'Running', 'CombatSpear', 'CombatShield', 'CombatDeath']) {
        phase = 'live-' + animation;
        assert.ok(available.has(animation), 'Missing actual animation: ' + animation);
        await page.locator('#lab-animation').selectOption(animation);
        await view('side');
        await page.locator('[data-action="play"]').click();
        await page.evaluate(() => new Promise(resolve => {
            let count = 0;
            const frame = () => ++count >= 90 ? resolve() : requestAnimationFrame(frame);
            requestAnimationFrame(frame);
        }));
        report.live.push({ animation, lod: 2, browserAnimationFrameCallbacks: 90,
            timeAfter: Number(await page.locator('#lab-pose-time').inputValue()),
            pausedAfter: await page.locator('#lab-preview').getAttribute('data-paused'),
            observation: 'See continuous video; browser callback count is not a geometry or performance verdict.' });
    }
    assert.equal(report.captures.length, 13);
    assert.equal(report.snapshots.length, 7);
    assert.equal(report.live.length, 6);
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.httpErrors, []);
    assert.deepEqual(report.failedRequests.filter(request => !request.duringOwnedCleanup), []);
    await closeOwnedContext();
    report.status = 'CAPTURED — visual review required';
} catch (error) {
    report.status = 'FAIL'; report.failure = { phase, message: String(error), stack: error.stack };
    process.exitCode = 1;
    console.error(error);
} finally {
    try { await closeOwnedContext(); }
    catch (error) { report.cleanupError = String(error); report.status = 'FAIL'; process.exitCode = 1; }
    await browser?.close().catch(error => {
        report.browserCleanupError = String(error); report.status = 'FAIL'; process.exitCode = 1;
    });
    report.finishedAt = new Date().toISOString();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('Evidence: ' + output);
}
