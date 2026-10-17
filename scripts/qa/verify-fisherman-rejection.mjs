import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const pass = 'output/meshy-outfit-pipeline/pass-009';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['tunic.glb', 'tunic.binding.json', 'trousers.glb', 'trousers.binding.json', 'shoe.glb', 'shoe.binding.json'];
const directory = 'public/character-lab/candidates/meshy-fisherman-009/';
const before = await Promise.all(files.map(async (file) => hash(await readFile(directory + file))));
let rejection;
try {
    await promisify(execFile)(process.execPath, ['scripts/characters/prepare-fisherman-native.mjs', 'native-013']);
    assert.fail('A rejected source must not prepare or publish.');
}
catch (error) {
    assert.match(error.stderr ?? '', /selected tunic source was rejected/);
    rejection = error.stderr.match(/selected tunic source was rejected[^\r\n]*/)[0];
}
assert.deepEqual(await Promise.all(files.map(async (file) => hash(await readFile(directory + file)))), before);
const response = await fetch('http://192.168.68.107:5195/output/meshy-outfit-pipeline/pass-009/image-review-005/index.html');
assert.equal(response.status, 200);
for (const [index, file] of files.entries()) {
    const response = await fetch('http://192.168.68.107:5195/character-lab/candidates/meshy-fisherman-009/' + file);
    assert.equal(response.status, 200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), before[index]);
}
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://192.168.68.107:5195/character-lab?clothing=fisherman-009');
    await page.waitForFunction(() => document.querySelector('#lab-preview')?.dataset.ready === 'true' || document.querySelector('#lab-status')?.classList.contains('is-error'), null, { timeout: 60000 });
    assert.equal(await page.locator('#lab-status').evaluate(element => element.classList.contains('is-error')), false);
    assert.match(await page.locator('#lab-module-status').textContent(), /Fisherman tunic preview/);
    await page.screenshot({ path: pass + '/qa-native-019/lab-preview.png' });
    assert.deepEqual(errors, []);
}
finally {
    await browser.close();
}
const report = { status: 'passed', rejectedSourceCannotPublish: true, publicBytesUnchanged: true, lanAssets: 6, lanReviewStatus: 200, browserErrors: errors, rejection, qualification: 'Verifies rejection status and retained preview integrity. The current replacement remains a Lab appearance preview.' };
await writeFile(pass + '/qa-native-019/publication-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
