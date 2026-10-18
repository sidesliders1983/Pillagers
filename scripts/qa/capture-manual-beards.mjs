import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const output = 'output/manual-beards-001';
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1550, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400)
        errors.push(r.status() + ' ' + r.url()); });
    await page.goto('http://127.0.0.1:5195/' + output + '/index.html', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.beardsReady, null, { timeout: 90000 });
    for (const view of ['front', 'side', 'three-quarter']) {
        await page.evaluate(async (view) => await window.beardSet(view), view);
        await page.locator('canvas').screenshot({ path: output + '/neutral-' + view + '.png' });
    }
    for (const clip of ['Walking', 'Idle_02']) {
        await page.evaluate(async (clip) => await window.beardSet('front', clip, .6), clip);
        await page.locator('canvas').screenshot({ path: output + '/' + clip + '-front.png' });
    }
    const selections = [];
    for (const name of ['braid', 'double', 'normal', 'pointed']) {
        await page.goto('http://127.0.0.1:5195/character-lab?beard=' + name, { waitUntil: 'commit' });
        await page.waitForFunction(id => {
            try {
                return document.querySelector('#lab-preview')?.dataset.ready === 'true'
                    && JSON.parse(document.querySelector('#lab-fit-metadata').textContent).selectedAssets.beard === id;
            }
            catch {
                return false;
            }
        }, 'beard/manual-fitted-' + name, { timeout: 60000 });
        await page.selectOption('#lab-animation', 'NativeNeutral');
        await page.locator('#lab-preview').screenshot({ path: output + '/lab-' + name + '.png' });
        const metadata = JSON.parse(await page.locator('#lab-fit-metadata').textContent());
        selections.push({ name, beard: metadata.selectedAssets.beard, hairColor: metadata.presentation.hairColor });
    }
    await writeFile(output + '/browser.json', JSON.stringify({ errors, selections }, null, 2) + '\n');
    console.log(JSON.stringify({ errors }));
}
finally {
    await browser.close();
}
