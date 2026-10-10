import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5182';
const output = process.env.QA_OUTPUT || 'scratch/meshy-tent-review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(120000);
const errors = [];
const results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const ready = () => page.locator('canvas[data-ready=true]').waitFor();
const summary = async () => JSON.parse(await page.locator('canvas').getAttribute('data-world'));
const openTools = async () => {
    if (!await page.locator('#world-dev').evaluate(element => element.open))
        await page.locator('#world-dev > summary').click();
    if (!await page.locator('#debug').isVisible()) await page.click('#debug-toggle');
};
const exportWorld = async () => {
    await openTools();
    const [download] = await Promise.all([
        page.waitForEvent('download'), page.click('#fjordside-export'),
    ]);
    return readFile(await download.path(), 'utf8');
};
const importWorld = async saved => {
    await openTools();
    await Promise.all([page.waitForEvent('framenavigated'),
        page.setInputFiles('#fjordside-import', { name: 'world.json',
            mimeType: 'application/json', buffer: Buffer.from(saved) })]);
    await ready();
};
const capture = async (mode, view, lighting = 'day') => {
    await openTools();
    await page.selectOption('#fjordside-camera', view);
    await page.click('#lighting-' + lighting);
    await page.click('#debug-close');
    await page.waitForTimeout(900);
    const file = mode + '-' + view + '-' + lighting + '.webp';
    await sharp(await page.locator('canvas').screenshot()).webp({ quality: 90 }).toFile(output + '/' + file);
    return file;
};
const inspect = async mode => {
    const world = await summary();
    assert.ok(world.tent, mode + ' contains the authored tent');
    assert.equal(world.attachmentVersion, 'authored-props-v2');
    await openTools();
    await page.click('#fjordside-pause');
    const files = [await capture(mode, 'tent'), await capture(mode, 'tent-interior'),
        await capture(mode, 'tent', 'night'), await capture(mode, 'village')];
    await openTools();
    await page.click('#fjordside-pause');
    const samples = [];
    for (let sample = 0; sample < 20; sample++) {
        await page.waitForTimeout(500);
        const people = JSON.parse(await page.locator('canvas').getAttribute('data-population'));
        assert.equal(people.length, 10);
        for (const person of people) {
            assert.ok(person.safe, mode + ': resident ' + person.id + ' stays on safe terrain');
            assert.ok(Math.abs(person.y - person.ground) < .00001);
            const clearance = Math.max(Math.abs(person.x - world.tent.x) - world.tent.halfWidth,
                Math.abs(person.z - world.tent.z) - world.tent.halfDepth);
            assert.ok(clearance >= .65, mode + ': resident stays outside the tent beams and cloth');
        }
        samples.push(people);
    }
    const saved = await exportWorld();
    await page.reload();
    await ready();
    assert.equal(await exportWorld(), saved, 'Reload preserves the complete world and tent placement');
    results.push({ mode, world, files, samples });
    console.log('PASS:', mode, 'tent placement, cameras, residents and save/reload');
    return saved;
};
try {
    await page.goto(origin + '/?world=reference&worldDev=1');
    await ready();
    assert.equal(await page.locator('#fjordside-camera option[value=tent]').count(), 1,
        'The existing Fjord review camera can show the new tent');
    await inspect('reference');
    for (const seed of [17, 91]) {
        await openTools();
        await page.fill('#fjordside-seed', String(seed));
        await Promise.all([page.waitForEvent('framenavigated'), page.click('#fjordside-generate')]);
        await ready();
        const saved = await inspect('generated-' + seed);
        // Previous saves are the same locked blueprint plus the original twenty props.
        const legacy = JSON.parse(saved);
        legacy.attachmentVersion = 'authored-props-v1';
        legacy.attachments = legacy.attachments.filter(item => item.key !== 'tent');
        assert.equal(legacy.attachments.length, 20);
        await importWorld(JSON.stringify(legacy));
        assert.equal((await summary()).tent, null);
        assert.deepEqual(JSON.parse(await exportWorld()), legacy,
            'Importing v1 preserves all original placements without inserting new scenery');
        await importWorld(saved);
        assert.equal(await exportWorld(), saved);
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ results, errors }, null, 2) + '\n');
} catch (error) {
    console.error('World status:', await page.locator('#status').textContent());
    if (await page.locator('#fjordside-world-status').count())
        console.error('Preview status:', await page.locator('#fjordside-world-status').textContent());
    console.error('Browser errors:', errors);
    throw error;
} finally {
    await browser.close();
}
