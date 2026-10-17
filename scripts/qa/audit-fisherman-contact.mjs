import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const revision = process.argv[2] ?? 'native-017';
const directory = 'output/meshy-outfit-pipeline/pass-009/neck-shoulders-001/' + revision;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
    await page.goto('http://127.0.0.1:5195/scripts/qa/fisherman-fit-review.html');
    await page.waitForFunction(() => window.fisherReady, null, { timeout: 60000 });
    const reports = [];
    for (const clip of ['NativeNeutral', 'Walking', 'Idle_02']) {
        await page.evaluate(clip => window.fisherQA.pose(clip, clip === 'NativeNeutral' ? 0 : .65), clip);
        reports.push({ clip, contacts: await page.evaluate(() => window.fisherQA.upperContactAudit()) });
        for (const view of ['front', 'left', 'back', 'top']) {
            await page.evaluate(view => window.fisherQA.lookAtNeck(view), view);
            await page.screenshot({ path: directory + '/' + clip + '-outfit-' + view + '.png' });
        }
    }
    await page.evaluate(() => {
        window.fisherQA.root.traverse(mesh => {
            if (!mesh.isMesh || !mesh.name.includes('tunic'))
                return;
            const plain = material => {
                const clone = material.clone();
                clone.map = null;
                clone.normalMap = null;
                clone.aoMap = null;
                clone.flatShading = true;
                clone.color.set('#505967');
                clone.needsUpdate = true;
                return clone;
            };
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(plain) : plain(mesh.material);
        });
        window.fisherQA.pose('NativeNeutral', 0);
        window.fisherQA.lookAtNeck('front');
    });
    await page.screenshot({ path: directory + '/plain-material-front.png' });
    await writeFile(directory + '/contact-audit.json', JSON.stringify(reports, null, 2) + '\n');
    console.log(JSON.stringify(reports));
}
finally {
    await browser.close();
}
