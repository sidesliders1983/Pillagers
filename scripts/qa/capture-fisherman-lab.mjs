import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdir, writeFile } from 'node:fs/promises';
const destination = 'output/meshy-outfit-pipeline/pass-009/lab-final';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error')
        errors.push(message.text()); });
    await page.goto('http://127.0.0.1:5195/character-lab?clothing=fisherman-009');
    await page.waitForFunction(() => document.querySelector('#lab-preview')?.dataset.ready === 'true' || document.querySelector('#lab-status')?.classList.contains('is-error'), null, { timeout: 60000 });
    console.log(await page.locator('#lab-status').textContent());
    await page.selectOption('#lab-animation', 'NativeNeutral');
    await page.waitForTimeout(400);
    for (const view of ['front', 'side', 'back']) {
        await page.click('[data-action="view-' + view + '"]');
        await page.waitForTimeout(200);
        await page.locator('#lab-preview').screenshot({ path: destination + '/neutral-' + view + '.png' });
    }
    await writeFile(destination + '/metadata.json', await page.locator('#lab-fit-metadata').textContent());
    await writeFile(destination + '/browser.json', JSON.stringify({ errors }, null, 2));
    console.log(JSON.stringify({ errors }));
}
finally {
    await browser.close();
}
