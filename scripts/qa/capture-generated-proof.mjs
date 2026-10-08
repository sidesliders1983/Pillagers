import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'scratch/world-generation-v01/replay';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1640, height: 1400 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(90000);
const errors = [], captures = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
        const pause = document.querySelector('#environment-pause');
        if (pause) { pause.checked = true; observer.disconnect(); }
    });
    observer.observe(document, { subtree: true, childList: true });
});
try {
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/environment-lab');
    const canvas = page.locator('canvas[data-ready=true]');
    await canvas.waitFor();
    await page.addStyleTag({ content: '.environment-lab main{max-width:none;width:1536px;padding:0}' +
        '.environment-lab canvas{width:1536px!important;height:1024px!important;min-height:0!important}' });
    await page.selectOption('#environment-conifers', 'kaykit');
    await page.locator('#environment-fog').uncheck();
    await page.selectOption('#environment-light', 'sun20-front');
    await page.locator('#environment-fill').fill('1');
    await page.locator('#environment-fill').dispatchEvent('change');
    for (const seed of ['reference', 17, 91]) {
        if (seed !== 'reference') {
            await page.locator('#world-seed').fill(String(seed));
            await page.locator('#world-generate').click();
            await page.waitForFunction(value => {
                const data = document.querySelector('canvas').dataset.world;
                return data && JSON.parse(data).seed === value;
            }, seed);
        }
        for (const view of ['landscape','village','shore']) {
            await page.selectOption('#environment-camera', view);
            await page.waitForTimeout(1100);
            const bytes = await canvas.screenshot(), file = 'proof-' + seed + '-' + view + '.png';
            await writeFile(output + '/' + file, bytes);
            captures.push({ file, sha256: createHash('sha256').update(bytes).digest('hex'),
                fixture: JSON.parse(await canvas.getAttribute('data-fixture')),
                world: JSON.parse(await canvas.getAttribute('data-world') || 'null'),
                metrics: JSON.parse(await canvas.getAttribute('data-metrics')),
                actors: JSON.parse(await canvas.getAttribute('data-reference-actors') || '[]') });
        }
    }
    const runtime = [];
    for (const file of execFileSync('git', ['ls-files','--cached','--others','--exclude-standard','src'],
        { encoding: 'utf8' }).trim().split(/\r?\n/)) {
        runtime.push({ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
    }
    await writeFile(output + '/proof-captures.json', JSON.stringify({
        parentCommit: execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim(),
        runtime, captures, errors,
    }, null, 2) + '\n');
    console.log({ captures: captures.length, errors });
    if (errors.length) throw Error(errors.join('\n'));
} finally { await browser.close(); }
