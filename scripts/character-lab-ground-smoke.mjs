import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
import sharp from 'sharp';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5182';
const output = process.env.GROUND_QA_OUTPUT ?? 'artifacts/human-moving-ground';
mkdirSync(output, {recursive: true});
const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const results = [];

async function capturePreview(page, selector, path) {
    // Capture displayed WebGL pixels without waiting for an animating element to become stable.
    const preview = page.locator(selector);
    await preview.evaluate(node => node.scrollIntoView({block: 'center', behavior: 'instant'}));
    const box = await preview.boundingBox();
    const scroll = await page.evaluate(() => ({x: scrollX, y: scrollY}));
    return page.screenshot({path, clip: {
        x: box.x + scroll.x, y: box.y + scroll.y, width: box.width, height: box.height,
    }});
}

async function floorPixels(page, selector, top = .40) {
    // Capture displayed pixels; WebGL may clear its drawing buffer outside the render callback.
    const image = sharp(await capturePreview(page, selector));
    const {width, height} = await image.metadata();
    return image.extract({
        left: Math.floor(width * .03), top: Math.floor(height * top),
        width: Math.floor(width * .20), height: Math.floor(height * .20),
    }).removeAlpha().raw().toBuffer();
}

async function floorChanges(page, selector, top) {
    const before = await floorPixels(page, selector, top);
    await page.waitForTimeout(280);
    const after = await floorPixels(page, selector, top);
    let changed = 0;
    for (let index = 0; index < before.length; index++) {
        if (Math.abs(before[index] - after[index]) > 3) changed++;
    }
    return changed;
}

try {
    const page = await browser.newPage({viewport: {width: 1000, height: 800}});
    page.on('pageerror', error => {errors.push(error.message); console.error(error.message);});
    page.on('console', message => {if (message.type() === 'error') console.error(message.text());});
    await page.goto(origin + '/character-lab');
    await page.waitForSelector('#lab-preview[data-ready="true"]', {timeout: 60000});
    const ground = page.getByRole('checkbox', {name: 'Moving ground', exact: true});
    assert.equal(await ground.count(), 1, 'Human must expose the moving-ground control');
    assert.equal(await ground.isChecked(), true);
    const pace = async () => Number((await page.locator('#lab-ground-pace').textContent()).match(/[\d.]+/)[0]);
    await page.locator('#lab-animation').selectOption('Walking');
    const walkSpeed = await pace();
    assert.ok(walkSpeed > 0, 'Walking must show a positive ground pace');
    await page.getByRole('button', {name: 'Reset view', exact: true}).click();
    await page.locator('#lab-preview').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const moving = await floorChanges(page, '#lab-preview');
    await capturePreview(page, '#lab-preview', output + '/human-walking.png');
    assert.ok(moving > 50, 'The visible ground grid must move while walking');

    await ground.uncheck();
    assert.equal(await pace(), 0);
    await page.locator('#lab-preview').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    assert.equal(await floorChanges(page, '#lab-preview'), 0, 'Ground toggle must stop the grid');
    await ground.check();
    await page.locator('#lab-pose-time').fill('0.25');
    await page.getByRole('button', {name: 'Freeze pose', exact: true}).click();
    assert.equal(await pace(), 0);
    await page.locator('#lab-preview').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    assert.equal(await floorChanges(page, '#lab-preview'), 0, 'Freeze must also freeze the grid');
    await page.getByRole('button', {name: 'Play', exact: true}).click();
    assert.ok(await pace() > 0);

    for (const clip of ['Running', 'Unsteady_Walk', 'Idle_02']) {
        await page.locator('#lab-animation').selectOption(clip);
        const speed = await pace();
        if (clip === 'Running') assert.ok(speed > walkSpeed, 'Running pace must exceed walking');
        if (clip === 'Unsteady_Walk') assert.ok(speed > 0, 'Unsteady Walk must also move the grid');
        if (clip === 'Idle_02') assert.equal(speed, 0, 'Idle must keep the ground still');
        results.push({route: '/character-lab', clip, speed});
        await capturePreview(page, '#lab-preview', output + '/' + clip + '.png');
    }
    results.push({route: '/character-lab', clip: 'Walking', speed: walkSpeed, changedChannels: moving});
    console.log('Human clips and ground controls passed.');
    await page.locator('#lab-animation').selectOption('Walking');
    // Hold a pose while cold LOD assets load on the software GPU, then resume.
    for (const lod of [0, 1, 2]) {
        console.log('Checking LOD', lod);
        await page.getByRole('button', {name: 'Freeze pose', exact: true}).click();
        await page.locator('[data-action="lod' + lod + '"]').click();
        await page.waitForSelector('#lab-preview[data-ready="true"]', {timeout: 60000})
            .catch(async error => {
                console.error(await page.locator('#lab-status').textContent());
                throw error;
            });
        assert.equal(await ground.isChecked(), true);
        assert.equal(await pace(), 0);
        await page.getByRole('button', {name: 'Play', exact: true}).click();
        const speed = await pace();
        assert.ok(Math.abs(speed - walkSpeed) < .05, 'LOD must preserve the gait reference');
        results.push({route: '/character-lab', lod, clip: 'Walking', speed});
    }
    const heightPaces = [];
    for (const height of [1.2, 1.6]) {
        await page.locator('#lab-body-height').evaluate((input, height) => {
            input.value = String(height);
            input.dispatchEvent(new Event('input', {bubbles: true}));
        }, height);
        await page.waitForSelector('#lab-preview[data-ready="true"]');
        heightPaces.push(await pace());
    }
    assert.ok(heightPaces[1] > heightPaces[0], 'A larger body must have a larger gait distance');
    results.push({route: '/character-lab', heights: [1.2, 1.6], speeds: heightPaces});

    console.log('Original Lab controls, LOD and body pace passed.');
    await page.goto(origin + '/meshy-preview');
    await page.waitForSelector('#meshy-canvas[data-ready="true"]', {timeout: 60000});
    await page.locator('#meshy-count').selectOption('1');
    await page.waitForSelector('#meshy-canvas[data-ready="true"][data-instances="1"]');
    const focusedGround = page.getByRole('checkbox', {name: 'Moving ground', exact: true});
    assert.equal(await focusedGround.isChecked(), true);
    const focusedPace = async () => Number((await page.locator('#meshy-ground-pace').textContent()).match(/[\d.]+/)[0]);
    await page.locator('#meshy-clip').selectOption('Walking');
    const focusedWalk = await focusedPace();
    assert.ok(focusedWalk > 0);
    assert.ok(await floorChanges(page, '#meshy-canvas') > 50, 'Focused preview must show grid motion');
    await capturePreview(page, '#meshy-canvas', output + '/focused-walking.png');
    await focusedGround.uncheck();
    await page.waitForTimeout(150);
    assert.equal(await floorChanges(page, '#meshy-canvas'), 0);
    await focusedGround.check();
    await page.getByRole('button', {name: 'Pause', exact: true}).click();
    assert.equal(await focusedPace(), 0);
    assert.equal(await floorChanges(page, '#meshy-canvas'), 0);
    await page.getByRole('button', {name: 'Resume', exact: true}).click();
    await page.locator('#meshy-clip').selectOption('Running');
    assert.ok(await focusedPace() > focusedWalk);
    await capturePreview(page, '#meshy-canvas', output + '/focused-running.png');
    results.push({route: '/meshy-preview', walking: focusedWalk, running: await focusedPace()});

    await page.goto(origin + '/character-lab?model=cow');
    await page.waitForSelector('#lab-preview[data-ready="true"]', {timeout: 60000});
    const cowGround = page.getByRole('checkbox', {name: 'Moving ground', exact: true});
    assert.equal(await cowGround.count(), 1, 'Cow must use the same ground control');
    assert.equal(await cowGround.isChecked(), true);
    await page.locator('#lab-animation').selectOption('Walk');
    await page.getByRole('button', {name: 'RTS', exact: true}).click();
    // Cow's side camera sees parallel stripes; inspect a clear RTS ground patch instead.
    const cowFloorChanges = () => floorChanges(page, '#lab-preview', .20);
    const cowPace = await pace();
    assert.ok(cowPace > 0);
    await page.locator('#lab-preview').scrollIntoViewIfNeeded();
    assert.ok(await cowFloorChanges() > 50, 'Cow must show grid motion');
    await capturePreview(page, '#lab-preview', output + '/cow-walking.png');
    await page.locator('#lab-cow-speed').evaluate(input => {
        input.value = '0.5';
        input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    assert.ok(Math.abs(await pace() - cowPace / 2) < .01);
    await cowGround.uncheck();
    assert.equal(await pace(), 0);
    await page.waitForTimeout(200);
    assert.equal(await cowFloorChanges(), 0);
    await cowGround.check();
    await page.getByRole('button', {name: 'Freeze pose', exact: true}).click();
    assert.equal(await pace(), 0);
    assert.equal(await cowFloorChanges(), 0);
    await page.getByRole('button', {name: 'Play', exact: true}).click();
    assert.ok(await pace() > 0);
    await page.locator('#lab-animation').selectOption('Idle');
    assert.equal(await pace(), 0);
    results.push({route: '/character-lab?model=cow', walking: cowPace, halfRate: cowPace / 2});

    console.log('Focused Human and Cow ground controls passed.');
    await page.close();
    const mobile = await browser.newPage({viewport: {width: 390, height: 844}});
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(origin + '/character-lab');
    await mobile.waitForSelector('#lab-preview[data-ready="true"]', {timeout: 60000})
        .catch(async error => {
            console.error(await mobile.locator('#lab-status').textContent());
            throw error;
        });
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.locator('#lab-animation').selectOption('Running');
    await capturePreview(mobile, '#lab-preview', output + '/mobile-running.png');
    await mobile.close();
    assert.deepEqual(errors, []);
    writeFileSync(output + '/public-ui-evidence.json', JSON.stringify({results, errors}, null, 2) + '\n');
    console.log(JSON.stringify({results, errors}));
} finally {
    await browser.close();
}
