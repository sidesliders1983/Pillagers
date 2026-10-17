import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdir, writeFile } from 'node:fs/promises';
const mode = process.argv[2] ?? 'native';
const destination = 'output/meshy-outfit-pipeline/pass-009/qa-008/' + mode;
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5195/scripts/qa/fisherman-fit-review.html?mode=' + mode);
    await page.waitForFunction(() => window.fisherReady, null, { timeout: 60000 });
    const clips = mode === 'native' ? ['NativeNeutral', 'Walking', 'Idle_02'] : ['authoring'];
    const report = [];
    for (const clip of clips) {
        if (mode === 'native')
            await page.evaluate(clip => window.fisherQA.pose(clip, clip === 'NativeNeutral' ? 0 : .65), clip);
        for (const view of ['front', 'left', 'back', 'right']) {
            await page.evaluate(view => window.fisherQA.draw(view), view);
            await page.screenshot({ path: destination + '/' + clip + '-' + view + '.png' });
        }
        if (mode === 'native')
            report.push({ clip, meshes: await page.evaluate(() => window.fisherQA.audit()) });
    }
    await writeFile(destination + '/audit.json', JSON.stringify({ errors, report }, null, 2));
    console.log(JSON.stringify({ errors, report }));
}
finally {
    await browser.close();
}
