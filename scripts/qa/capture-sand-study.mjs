import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { chromium, origin, openStudy, generate, variant, light, fixture, canvas,
    settle, exportBlueprint, hardware } from './sand-study-browser.mjs';

const output = process.env.QA_OUTPUT || 'docs/qa/generated-sand-resolution';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1640, height: 1400 }, deviceScaleFactor: 1 });
const errors = [], shots = [], pairs = [];
page.on('pageerror', error => errors.push(error.message));
const capture = async id => {
    const data = await fixture(page);
    const sand = data.ground.maps.find(map => map.id === 'Ground054');
    assert.ok(sand.textures.every(texture => texture.width === data.ground.sandPixels &&
        texture.height === data.ground.sandPixels), 'Actual decoded sand dimensions match the compared resolution');
    const image = await canvas(page).screenshot();
    await sharp(image).webp({ quality: 92 }).toFile(output + '/' + id + '.webp');
    shots.push({ id, file: id + '.webp', ...data });
    return data;
};
try {
    await openStudy(page);
    const device = await hardware(page);
    for (const seed of [17, 91]) {
        await variant(page, 256);
        if (seed !== 17) await generate(page, seed);
        const blueprint = await exportBlueprint(page);
        await writeFile(output + '/blueprint-' + seed + '.json', blueprint.bytes);
        for (const lighting of ['day', 'low-sun', 'night']) {
            await light(page, lighting);
            for (const view of ['sand-close', 'sand-shore', 'village', 'overview']) {
                await page.selectOption('#environment-camera', view);
                await settle(page);
                await variant(page, 256);
                const base = await capture(seed + '-256-' + lighting + '-' + view);
                await variant(page, 512);
                const candidate = await capture(seed + '-512-' + lighting + '-' + view);
                assert.deepEqual(candidate.fixture.camera, base.fixture.camera);
                assert.deepEqual(candidate.fixture.lightSettings, base.fixture.lightSettings);
                assert.deepEqual(candidate.water, base.water);
                assert.deepEqual(candidate.actors, base.actors);
                assert.deepEqual(candidate.ground.maps.filter(map => map.id !== 'Ground054'),
                    base.ground.maps.filter(map => map.id !== 'Ground054'));
                pairs.push({ seed, lighting, view, blueprintSha256: blueprint.sha256,
                    cameraLightWaterActorsOtherMapsIdentical: true });
            }
        }
        assert.equal((await exportBlueprint(page)).sha256, blueprint.sha256);
        await variant(page, 128);
        for (const lighting of ['day', 'low-sun', 'night']) {
            await light(page, lighting);
            for (const view of ['sand-close', 'sand-shore', 'village', 'overview']) {
                await page.selectOption('#environment-camera', view);
                await settle(page);
                await capture(seed + '-128-' + lighting + '-' + view);
            }
        }
        await variant(page, 256);
        await light(page, 'low-sun');
        await page.selectOption('#environment-camera', 'sand-close');
        await page.locator('#environment-nature').uncheck();
        await page.locator('#environment-village').uncheck();
        // Native lighting remains fixed within this additional ground-only pair.
        await settle(page);
        await capture(seed + '-256-ground-only');
        await variant(page, 512);
        await capture(seed + '-512-ground-only');
        await page.locator('#environment-nature').check();
        await page.locator('#environment-village').check();
        console.log('Captured seed ' + seed + ': matched near/normal/village/far and unchanged Low.');
    }
    assert.equal(shots.length, 76);
    assert.deepEqual(errors, []);
    await writeFile(output + '/captures.json', JSON.stringify({ origin, hardware: device,
        viewport: [1640, 1400], canvas: [1536, 1024], shots, pairs, errors,
        notes: 'Standard A/B preserves exact actors, blueprint, camera/light/water and other maps. Low rebuilds the existing preview; its resident positions may differ from Standard. GrassField OFF; HDR OFF; phase zero.' }, null, 2) + '\n');
    console.log('PASS: 76 production captures and 24 independently matched A/B fixtures.');
} finally { await browser.close(); }
