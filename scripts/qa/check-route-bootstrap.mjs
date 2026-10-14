import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
try {
    for (const route of ['/fjord-play', '/environment-lab', '/character-lab', '/water-lab',
        '/asset-lab', '/meshy-preview', '/play', '/gameplay-lab', '/']) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        await page.route(/\/src\/main\.ts(?:\?|$)/, async request => { await gate; await request.abort(); });
        try {
            await page.goto(origin + route, { waitUntil: 'commit' });
            await page.locator('body').waitFor({ state: 'attached' });
            console.log('Bootstrap:', route);
            const text = await page.locator('body').innerText();
            assert.doesNotMatch(text, /1200 DC|Preparing the shore|WORLD PROTOTYPE|FPS:|Explore Fjordside/,
                route + ' must not flash the prototype while its module loads');
            await page.getByRole('status').filter({ hasText: 'Loading Pillagers' }).waitFor();
        } finally { release(); await page.close(); }
    }
    console.log('All route documents show only the neutral bootstrap before JavaScript loads.');
} finally { await browser.close(); }
