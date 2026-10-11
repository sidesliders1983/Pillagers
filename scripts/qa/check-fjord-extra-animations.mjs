import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-interactions/source-previews';
const clips = ['Archery_Shot_1', 'Archery_Shot_2', 'Heavy_Hammer_Swing', 'Sit_and_Doze_Off'];
const bytes = await readFile('public/game-assets/human/Human_ExtraAnimations.glb');
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const durations = Object.fromEntries(json.animations.map(animation => [animation.name,
    Math.fround(Math.max(...animation.samplers.map(s => json.accessors[s.input].max[0])))]));
const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], checks = [], records = [];
await mkdir(output, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/character-lab');
    const ready = () => page.locator('#lab-preview[data-ready="true"]').waitFor();
    await ready();
    await page.locator('[data-action="lod2"]').click();
    await ready();
    const options = await page.locator('#lab-animation option').evaluateAll(items => items.map(i => i.value));
    assert.equal(options.length, 18);
    for (const clip of clips) {
        assert.ok(options.includes(clip));
        await page.selectOption('#lab-animation', clip);
        assert.equal(Number(await page.locator('#lab-pose-time').getAttribute('max')), durations[clip]);
        await page.locator('#lab-pose-time').fill(String(Math.min(clip === 'Sit_and_Doze_Off' ? 6 : 2, durations[clip])));
        await page.locator('[data-action="freeze-pose"]').click();
        await page.locator('.lab-snapshot > summary').click();
        const [download] = await Promise.all([page.waitForEvent('download'),
            page.locator('[data-action="snapshot-export"]').click()]);
        const snapshot = JSON.parse(await page.locator('#lab-snapshot').inputValue());
        await download.delete();
        assert.equal(snapshot.pose.animation, clip);
        assert.equal(snapshot.pose.paused, true);
        await page.selectOption('#lab-animation', 'Idle_02');
        await page.locator('[data-action="snapshot-import"]').click();
        await ready();
        assert.equal(await page.locator('#lab-preview').getAttribute('data-animation'), clip);
        assert.equal(await page.locator('#lab-preview').getAttribute('data-paused'), 'true');
        await page.locator('.lab-snapshot > summary').click();
        await page.locator('.lab-stage').screenshot({ path: output + '/' + clip + '.png' });
        records.push({ clip, duration: durations[clip], pose: snapshot.pose, modules: snapshot.modules });
    }
    checks.push('All four additive clips: real authored duration, frozen pose and snapshot export/import');
    await page.goto(origin + '/character-lab?model=cow');
    await ready();
    for (const variant of ['adult-female', 'baby', 'young-adult', 'adult-male']) {
        await page.selectOption('#lab-cow-variant', variant);
        await page.waitForURL(url => url.searchParams.get('variant') === variant);
        await ready();
        for (const clip of ['Graze', 'HumanInteraction']) {
            await page.selectOption('#lab-animation', clip);
            if (clip === 'HumanInteraction')
                await page.locator('#lab-preview[data-human-ready="true"]').waitFor();
            assert.equal(Number(await page.locator('#lab-pose-time').getAttribute('max')),
                clip === 'Graze' ? 12 : 6);
            await page.locator('#lab-pose-time').fill('3');
            await page.locator('[data-action="freeze-pose"]').click();
            assert.equal(await page.locator('#lab-preview').getAttribute('data-paused'), 'true');
            assert.equal(await page.locator('#lab-preview').getAttribute('data-animation'), clip);
            if (clip === 'HumanInteraction') {
                assert.equal(await page.locator('#lab-preview').getAttribute('data-human-height'), '1.65');
                assert.equal(await page.locator('#lab-cow-human').isChecked(), true);
            }
            await page.locator('.lab-stage').screenshot({ path: output + '/' + variant + '-' + clip + '.png' });
            records.push({ variant, clip, frozenTime: 3 });
        }
    }
    checks.push('Original Cow Character Lab: all four variants, Graze 12 seconds, HumanInteraction 6 seconds and Listen human');
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ checks, errors, records,
        device: 'Headless Chromium / SwiftShader' }, null, 2));
    console.log(JSON.stringify({ checks }));
} finally { await browser.close(); }
