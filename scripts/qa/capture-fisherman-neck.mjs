import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const output = 'output/meshy-outfit-pipeline/pass-009/neck-shoulders-001/' + (process.argv[2] ?? 'before');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5195/scripts/qa/fisherman-fit-review.html');
    await page.waitForFunction(() => window.fisherReady, null, { timeout: 60000 });
    for (const clip of ['NativeNeutral', 'Idle_02', 'Walking']) {
        await page.evaluate(clip => window.fisherQA.pose(clip, clip === 'NativeNeutral' ? 0 : .65), clip);
        for (const bare of [false, true]) {
            await page.evaluate(bare => window.fisherQA.showBare(bare), bare);
            for (const view of ['front', 'left', 'back', 'top']) {
                await page.evaluate(view => window.fisherQA.lookAtNeck(view), view);
                await page.screenshot({ path: output + '/' + clip + '-' + (bare ? 'body' : 'outfit') + '-' + view + '.png' });
            }
        }
        await page.evaluate(() => window.fisherQA.showBare(false));
    }
    await writeFile(output + '/browser.json', JSON.stringify({ errors }, null, 2));
    console.log(JSON.stringify({ output, errors }));
}
finally {
    await browser.close();
}
