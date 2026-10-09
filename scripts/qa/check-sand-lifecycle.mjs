import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, openStudy, variant, light, fixture, canvas, settle, exportBlueprint, hardware } from './sand-study-browser.mjs';

const output = process.env.QA_OUTPUT || 'docs/qa/generated-sand-resolution';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1640, height: 1400 }, deviceScaleFactor: 1 });
const errors = [], cycles = [], reloads = [];
page.on('pageerror', error => errors.push(error.message));
const counts = data => [data.metrics.geometries, data.metrics.textures];
try {
    await openStudy(page);
    const device = await hardware(page);
    await light(page, 'low-sun');
    await page.selectOption('#environment-camera', 'sand-shore');
    // Warm both tiers before comparing steady ownership counts.
    await variant(page, 512); await variant(page, 128); await variant(page, 256);
    const blueprint = await exportBlueprint(page);
    for (let cycle = 1; cycle <= 10; cycle++) {
        for (const pixels of [512, 128, 256]) {
            await variant(page, pixels);
            cycles.push({ cycle, pixels, ...await fixture(page) });
        }
        assert.equal((await exportBlueprint(page)).sha256, blueprint.sha256);
        console.log('Ownership cycle ' + cycle + '/10');
    }
    for (const pixels of [128, 256, 512]) {
        assert.equal(new Set(cycles.filter(row => row.pixels === pixels)
            .map(row => JSON.stringify(counts(row)))).size, 1,
            'Owned resource counts stabilize for ' + pixels);
    }
    const held = (await fixture(page)).water.time;
    await page.locator('#environment-pause').uncheck(); await page.waitForTimeout(900);
    assert.ok((await fixture(page)).water.time > held);
    await page.locator('#environment-pause').check(); await settle(page);
    const paused = (await fixture(page)).water.time;
    await settle(page); assert.equal((await fixture(page)).water.time, paused);
    const before = (await fixture(page)).fixture.camera;
    const box = await canvas(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, box.y + box.height * .55, { steps: 10 });
    await page.mouse.up(); await settle(page);
    assert.notDeepEqual((await fixture(page)).fixture.camera, before);
    await page.addStyleTag({ content: '.environment-lab main{width:900px}' +
        '.environment-lab canvas{width:900px!important;height:500px!important}' });
    await settle(page);
    const resized = await canvas(page).boundingBox();
    assert.equal(resized.width, 900); assert.equal(resized.height, 500);
    for (let run = 1; run <= 10; run++) {
        await openStudy(page);
        await light(page, 'low-sun');
        await page.selectOption('#environment-camera', 'sand-shore');
        await settle(page);
        reloads.push({ run, ...await fixture(page) });
        console.log('Reload teardown ' + run + '/10');
    }
    assert.equal(new Set(reloads.map(row => JSON.stringify(counts(row)))).size, 1);
    assert.deepEqual(errors, []);
    await writeFile(output + '/lifecycle.json', JSON.stringify({ device, cycles, reloads,
        blueprintSha256: blueprint.sha256, wavesResumeAndPause: true, cameraMotion: true,
        resize: resized, errors, notes: 'Native renderer ownership counts stabilize; not measured VRAM or an exhaustive leak proof. Ten page navigations exercise disposal. Active actor culling can alter calls but not ownership counts.' }, null, 2) + '\n');
    console.log('PASS: ten stable quality/sand cycles and ten stable reload teardowns, pause, camera and resize.');
} finally { await browser.close(); }
