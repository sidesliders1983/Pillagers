import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';

export const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
export const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5190';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const canvas = page => page.locator('#environment-canvas');
export const settle = page => page.waitForTimeout(700);
export const fixture = async page => ({
    fixture: JSON.parse(await canvas(page).getAttribute('data-fixture')),
    ground: JSON.parse(await canvas(page).getAttribute('data-ground')),
    water: JSON.parse(await canvas(page).getAttribute('data-study-water')),
    metrics: JSON.parse(await canvas(page).getAttribute('data-metrics')),
    world: JSON.parse(await canvas(page).getAttribute('data-world')),
    actors: JSON.parse(await canvas(page).getAttribute('data-reference-actors')),
});
export async function openStudy(page, seed = 17) {
    page.setDefaultTimeout(120000);
    await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
            const pause = document.querySelector('#environment-pause');
            if (pause) { pause.checked = true; observer.disconnect(); }
        });
        observer.observe(document, { subtree: true, childList: true });
    });
    await page.goto(origin + '/environment-lab');
    await page.locator('canvas[data-ready=true]').waitFor();
    await page.addStyleTag({ content: '.environment-lab main{max-width:none;width:1536px;padding:0}' +
        '.environment-lab canvas{width:1536px!important;height:1024px!important;min-height:0!important}' });
    await page.locator('#world-sand-study').check();
    await generate(page, seed);
}
export async function generate(page, seed) {
    await page.fill('#world-seed', String(seed));
    await page.click('#world-generate');
    await page.waitForFunction(seed => {
        const data = document.querySelector('canvas').dataset.world;
        return data && JSON.parse(data).seed === seed && !document.querySelector('#world-generate').disabled;
    }, seed);
    await settle(page);
}
export async function variant(page, pixels) {
    const tier = pixels === 128 ? 'low' : 'standard';
    if (await page.locator('#environment-quality').inputValue() !== tier) {
        await page.selectOption('#environment-quality', tier);
        await page.waitForFunction(tier => document.querySelector('canvas').dataset.groundTier === tier &&
            !document.querySelector('#world-generate').disabled, tier);
    }
    if (pixels !== 128) await page.selectOption('#world-sand-resolution', String(pixels));
    await page.waitForFunction(pixels => JSON.parse(document.querySelector('canvas').dataset.ground).sandPixels === pixels &&
        !document.querySelector('#world-generate').disabled, pixels);
    await settle(page);
}
export async function light(page, name) {
    await page.selectOption('#environment-light', name === 'low-sun' ? 'sun20-front' : name);
    if (name === 'low-sun') {
        await page.fill('#environment-fill', '1');
        await page.locator('#environment-fill').dispatchEvent('change');
    }
    await page.locator('#environment-hdr').uncheck();
    await settle(page);
}
export async function exportBlueprint(page) {
    const download = page.waitForEvent('download');
    await page.click('#world-export');
    const bytes = await readFile(await (await download).path());
    return { bytes, sha256: digest(bytes) };
}
export async function hardware(page) {
    return { os: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0].model },
        ...await page.evaluate(() => {
            const gl = document.querySelector('canvas').getContext('webgl2');
            const extension = gl.getExtension('WEBGL_debug_renderer_info');
            return { userAgent: navigator.userAgent, renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
                vendor: gl.getParameter(extension.UNMASKED_VENDOR_WEBGL), dpr: devicePixelRatio,
                hardwareConcurrency: navigator.hardwareConcurrency };
        }) };
}
