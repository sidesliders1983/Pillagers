import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.QA_OUTPUT || 'scratch/alpha-320/gear');
await mkdir(output + '/temporary', { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = output + '/temporary';
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let result;
try {
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5193') + '/fjord-play', { waitUntil: 'networkidle' });
    const button = page.getByRole('button', { name: 'Settings', exact: true });
    result = await button.locator('svg').evaluate(svg => {
        const box = svg.querySelector('path').getBBox();
        const view = svg.viewBox.baseVal;
        const button = svg.closest('button').getBoundingClientRect();
        const icon = svg.getBoundingClientRect();
        return { path: { x: box.x, y: box.y, width: box.width, height: box.height },
            vectorOffset: [box.x + box.width / 2 - (view.x + view.width / 2), box.y + box.height / 2 - (view.y + view.height / 2)],
            controlOffsetY: icon.y + icon.height / 2 - (button.y + button.height / 2) };
    });
    await button.screenshot({ path: output + '/settings.jpg' });
    assert.ok(Math.abs(result.vectorOffset[0]) < 0.02 && Math.abs(result.vectorOffset[1]) < 0.02, 'Gear shape is centred inside its own viewBox');
    assert.ok(Math.abs(result.controlOffsetY) < 1, 'SVG is centred in its button');
    await button.click();
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    result.status = 'passed';
} catch (error) { result = { ...result, status: 'failed', error: String(error) }; process.exitCode = 1; }
finally { await writeFile(output + '/result.json', JSON.stringify(result, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify(result)); }
