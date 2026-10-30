import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const output = resolve('scratch/start-menu-315/contrast-keyboard');
await mkdir(output + '/temporary', { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = output + '/temporary';
const browser = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' });
const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const panelOverWhite = [7, 25, 32].map(v => v * .94 + 255 * .06);
const result = { status: 'running', headers: [], panelWorstWhiteBackground: { ordinaryText: contrast([200, 214, 220], panelOverWhite), border: contrast([120, 144, 152], panelOverWhite) }, keyboard: false };
try {
    assert.ok(result.panelWorstWhiteBackground.ordinaryText >= 4.5);
    assert.ok(result.panelWorstWhiteBackground.border >= 3);
    for (const [width, height] of [[1440, 900], [1920, 1080], [390, 844], [852, 393], [1024, 768]]) {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.goto('http://127.0.0.1:5196/fjord-play', { waitUntil: 'networkidle' });
        const bounds = await page.locator('#campaign-start h1, #campaign-start .entry-eyebrow').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { label: node.tagName, x: Math.ceil(r.x), y: Math.ceil(r.y), width: Math.floor(r.width), height: Math.floor(r.height) }; }));
        await page.addStyleTag({ content: '#campaign-start header { visibility: hidden; }' });
        const pixels = await page.screenshot();
        for (const rect of bounds) {
            const { data, info } = await sharp(pixels).extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
            let highest = 0;
            for (let i = 0; i < data.length; i += info.channels) highest = Math.max(highest, luminance([...data.subarray(i, i + 3)]));
            const ratio = (luminance([244, 248, 250]) + .05) / (highest + .05);
            result.headers.push({ width, height, label: rect.label, contrastAgainstBrightestUnderlyingPixel: ratio });
            assert.ok(ratio >= (rect.label === 'H1' ? 3 : 4.5));
        }
        await page.close();
    }
    const keyboard = await browser.newPage();
    await keyboard.goto('http://127.0.0.1:5196/fjord-play', { waitUntil: 'networkidle' });
    assert.equal(await keyboard.evaluate(() => document.activeElement.getAttribute('aria-label')), 'New game');
    await keyboard.keyboard.press('Tab');
    assert.equal(await keyboard.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Load game');
    await keyboard.keyboard.press('Enter');
    await keyboard.locator('#campaign-recovery').waitFor();
    await keyboard.keyboard.press('Tab');
    assert.equal(await keyboard.evaluate(() => document.activeElement.textContent), 'Back to start menu');
    await keyboard.keyboard.press('Enter');
    await keyboard.getByRole('button', { name: 'New game', exact: true }).waitFor();
    assert.equal(await keyboard.locator('canvas').count(), 0);
    result.keyboard = true;
    result.status = 'passed';
} catch (error) { result.status = 'failed'; result.failure = String(error); process.exitCode = 1; }
finally { await writeFile(output + '/result.json', JSON.stringify(result, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify(result)); }
