import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5182';
const output = process.env.QA_OUTPUT || 'scratch/meshy-tent-plot-review';
const compactReview = JSON.parse(await readFile(
    new URL('../../docs/qa/meshy-tent-compact/results.json', import.meta.url), 'utf8'));
const previousReview = JSON.parse(await readFile(
    new URL('../../docs/qa/meshy-tent/results.json', import.meta.url), 'utf8'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(120000);
const errors = [];
const results = [];
const grassFixtures = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const ready = () => Promise.race([
    page.locator('canvas[data-ready=true]').waitFor(),
    page.locator('#status').filter({ hasText: 'Could not load the world.' }).waitFor()
        .then(() => { throw new Error('World startup failed'); }),
]);
const summary = async () => JSON.parse(await page.locator('canvas').getAttribute('data-world'));
const openTools = async () => {
    if (await page.locator('#debug').isVisible()) return;
    if (!await page.locator('#world-dev').evaluate(element => element.open))
        await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
    await page.locator('#debug').waitFor({ state: 'visible' });
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
    await Promise.all([Promise.race([
        page.waitForEvent('framenavigated'),
        page.locator('#fjordside-world-status').filter({ hasText: 'World was not changed:' })
            .waitFor().then(() => { throw new Error('Previous preview was rejected'); }),
    ]), page.setInputFiles('#fjordside-import', { name: 'world.json',
            mimeType: 'application/json', buffer: Buffer.from(saved) })]);
    await ready();
};
const capture = async (mode, view, lighting = 'day') => {
    await openTools();
    await page.selectOption('#fjordside-camera', view === 'tent-plot' ? 'tent' : view);
    await page.click('#lighting-' + lighting);
    await page.click('#debug-close');
    if (view === 'tent-plot') {
        await page.mouse.move(850,400);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(850,580,{ steps: 12 });
        await page.mouse.up({ button: 'right' });
        await page.mouse.wheel(0,240);
    }
    await page.waitForTimeout(900);
    const file = mode + '-' + view + '-' + lighting + '.webp';
    await sharp(await page.locator('canvas').screenshot()).webp({ quality: 90 }).toFile(output + '/' + file);
    return file;
};
const importPreviousPreview = async mode => {
    const current = JSON.parse(await exportWorld());
    const previousTent = previousReview.results.find(item => item.mode === mode).world.tent;
    const compactTent = compactReview.results.find(item => item.mode === mode).world.tent;
    for (const [version,tent] of [['authored-props-v2',previousTent],
        ['authored-props-v3',compactTent]]) {
        const previous = { ...current,attachmentVersion: version,
            attachments: current.attachments.map(item => item.key === 'tent' ? tent : item) };
        await importWorld(JSON.stringify(previous));
        requireBuildingPlot(await summary());
        const migrated = JSON.parse(await exportWorld());
        assert.equal(migrated.attachmentVersion, 'authored-props-v4');
        assert.deepEqual(migrated, current, 'Older tents move to the validated house plot');
        assert.deepEqual(migrated.blueprint, previous.blueprint);
        assert.deepEqual(migrated.attachments.filter(item => item.key !== 'tent'),
            previous.attachments.filter(item => item.key !== 'tent'));
    }
};
const requireBuildingPlot = world => {
    assert.ok(world.tentPlot, 'The tent reserves a plot for a future house');
    assert.ok(world.tentPlot.halfWidth >= 3 && world.tentPlot.halfDepth >= 3,
        'The house plot is at least 6m by 6m, independent of the small tent');
    assert.equal(world.tentPlot.overlappingNature, 0,
        'Rendered grass, bushes, rocks and trees leave the entire house plot clear');
};
const inspect = async mode => {
    const world = await summary();
    requireBuildingPlot(world);
    assert.ok(world.tent, mode + ' contains the authored tent');
    assert.equal(world.attachmentVersion, 'authored-props-v4');
    await openTools();
    await page.click('#fjordside-pause');
    const files = [await capture(mode, 'tent'), await capture(mode, 'tent-interior'),
        await capture(mode, 'tent', 'night'), await capture(mode, 'village'),
        await capture(mode, 'tent-plot')];
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
const checkGrassAtTent = async saved => {
    // A controlled valid import puts an actual authored grass clump beneath the tent.
    // This proves clearing works even when the selected natural seed had no overlap.
    const fixture = JSON.parse(saved);
    const tent = fixture.attachments.find(item => item.key === 'tent');
    const grass = fixture.blueprint.placementPlan.find(item => item.assetId.includes('grass'));
    assert.ok(grass, 'The fixture uses a real published grass asset');
    const planted = { ...grass,x: tent.x,y: tent.y,z: tent.z,rotation: 0 };
    fixture.blueprint.placementPlan.push(planted);
    await importWorld(JSON.stringify(fixture));
    const world = await summary();
    requireBuildingPlot(world);
    assert.ok(world.tentPlot.removedAssets[planted.assetId] >= 1,
        'The exact authored grass asset beneath the tent is removed from rendering');
    const exported = JSON.parse(await exportWorld());
    assert.deepEqual(exported.blueprint,fixture.blueprint,
        'Rendering exclusion preserves the complete source blueprint, including the planted grass');
    assert.deepEqual(exported.attachments,fixture.attachments,
        'Grass clearing preserves all locked attachment positions');
    const file = await capture('generated-17-grass-fixture','tent-plot');
    grassFixtures.push({ planted,world,file });
    await importWorld(saved);
    assert.equal(await exportWorld(),saved);
    console.log('PASS: authored grass under the tent is cleared without editing the saved blueprint');
};
try {
    await page.goto(origin + '/?world=reference&worldDev=1');
    await ready();
    assert.equal(await page.locator('#fjordside-camera option[value=tent]').count(), 1,
        'The existing Fjord review camera can show the new tent');
    requireBuildingPlot(await summary());
    await importPreviousPreview('reference');
    await inspect('reference');
    for (const seed of process.env.QA_REFERENCE_ONLY ? [] : [17, 91]) {
        await openTools();
        await page.fill('#fjordside-seed', String(seed));
        await Promise.all([page.waitForEvent('framenavigated'), page.click('#fjordside-generate')]);
        await ready();
        await importPreviousPreview('generated-' + seed);
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
        if (seed === 17) await checkGrassAtTent(saved);
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ results, grassFixtures, errors }, null, 2) + '\n');
} catch (error) {
    console.error('World status:', await page.locator('#status').textContent());
    if (await page.locator('#fjordside-world-status').count())
        console.error('Preview status:', await page.locator('#fjordside-world-status').textContent());
    console.error('Browser errors:', errors);
    throw error;
} finally {
    await browser.close();
}
