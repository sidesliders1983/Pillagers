import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { core, pausedCheckpoint } from './fjord-stability-scenario.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/qa/farmyard-ground-occlusion';
let state = core.createCampaign(17, { initialMaterials: 1000, foundingCoupleChanceBps: 0 },
    { fertilityChanceBps: 0, careerReviewWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] },
    { enabled: false });
state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
await mkdir(output, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json),
        pausedCheckpoint(state));
    await page.goto(process.env.QA_ORIGIN || 'http://127.0.0.1:5180/fjord-play');
    await page.selectOption('#fjord-quality', 'low');
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    await canvas.waitFor({ timeout: 120000 });
    await page.getByRole('button', { name: 'Collapse management panel', exact: true }).tap();
    const results = await page.evaluate(async () => {
        const { AssetManager } = await import('/src/core/AssetManager.ts');
        const { FjordModels } = await import('/src/fjord-play/FjordModels.ts');
        const { SharedSettlement } = await import('/src/play/SharedSettlement.ts');
        const { createBlueprintTerrain, disposeBlueprintTerrain } = await import('/src/world/BlueprintTerrain.ts');
        const { fjordGroundWeights } = await import('/src/fjord-play/FjordGround.ts');
        const THREE = await import('/node_modules/.vite/deps/three.js');
        const shared = SharedSettlement.restore(sessionStorage.getItem('pillagers.fjord-play.active.v1'), 'fjord');
        const before = shared.persist(), view = shared.fjord.project();
        const entity = view.entities.find(e => e.kind === 'building');
        const assets = new AssetManager();
        await assets.loadForSimulation();
        const models = new FjordModels(assets), house = await models.create(entity), p = entity.transform;
        house.position.set(p.x, p.y, p.z);
        house.rotation.y = p.rotation;
        house.updateMatrixWorld(true);
        const sources = new Map(['Ground037', 'Ground054', 'mossy_rock', 'grass_path_2']
            .map(id => [id, new THREE.MeshStandardMaterial()]));
        const terrain = createBlueprintTerrain(shared.fjord.blueprint, sources, 'none',
            fjordGroundWeights(shared.fjord.blueprint, view.ground));
        const diagnostics = [];
        // Isolate visibility in pixels: preserve actual geometry, masks and depth settings.
        // Green is the source Farmyard; red is native regional terrain behind it.
        const diagnostic = (material, color) => {
            const copy = new THREE.MeshBasicMaterial({ color, side: material.side,
                transparent: material.transparent, opacity: material.opacity, alphaMap: material.alphaMap,
                depthTest: material.depthTest, depthWrite: material.depthWrite,
                polygonOffset: material.polygonOffset, polygonOffsetFactor: material.polygonOffsetFactor,
                polygonOffsetUnits: material.polygonOffsetUnits, toneMapped: false });
            diagnostics.push(copy);
            return copy;
        };
        house.traverse(node => {
            if (node.isMesh) node.material = Array.isArray(node.material) ?
                node.material.map(m => diagnostic(m, 0x00ff00)) : diagnostic(node.material, 0x00ff00);
        });
        const original = terrain.material;
        terrain.material = original.map(m => diagnostic(m, 0xff0000));
        const scene = new THREE.Scene();
        scene.add(house, terrain);
        const renderer = new THREE.WebGLRenderer({ antialias: false });
        const target = new THREE.WebGLRenderTarget(1024, 1024);
        const camera = new THREE.PerspectiveCamera(45, 1, .1, 400);
        const png = pixels => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1024;
            const context = canvas.getContext('2d');
            const image = context.createImageData(1024, 1024);
            for (let y = 0; y < 1024; y++)
                image.data.set(pixels.subarray((1023 - y) * 4096, (1024 - y) * 4096), y * 4096);
            context.putImageData(image, 0, 0);
            return canvas.toDataURL('image/png').split(',')[1];
        };
        const images = [];
        const read = () => {
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            const pixels = new Uint8Array(1024 * 1024 * 4);
            renderer.readRenderTargetPixels(target, 0, 0, 1024, 1024, pixels);
            return pixels;
        };
        const observations = [];
        for (const distance of [25, 70, 140]) {
            camera.position.set(p.x + distance * .6, p.y + distance * .75, p.z - distance * .65);
            camera.lookAt(p.x, p.y, p.z);
            camera.updateMatrixWorld(true);
            terrain.visible = false;
            const reference = read();
            terrain.visible = true;
            const rendered = read();
            for (let layer = 1; layer < terrain.material.length; layer++)
                terrain.material[layer].polygonOffsetFactor = -layer;
            const legacy = read();
            for (let layer = 1; layer < terrain.material.length; layer++)
                terrain.material[layer].polygonOffsetFactor = original[layer].polygonOffsetFactor;
            if (distance === 140) {
                images.push({ name: 'diagnostic-before.png', base64: png(legacy) },
                    { name: 'diagnostic-after.png', base64: png(rendered) });
            }
            const green = (pixels, x, y) => {
                const i = (y * 1024 + x) * 4;
                return pixels[i + 1] > 240 && pixels[i] < 10;
            };
            let tested = 0, obscured = 0, legacyObscured = 0;
            for (let y = 2; y < 1022; y++) for (let x = 2; x < 1022; x++) {
                if (![[-2,0],[2,0],[0,-2],[0,2],[0,0]].every(([dx,dy]) => green(reference,x+dx,y+dy))) continue;
                tested++;
                if (!green(rendered, x, y)) obscured++;
                if (!green(legacy, x, y)) legacyObscured++;
            }
            observations.push({ distance, tested, obscured, legacyObscured });
        }
        target.dispose(); renderer.dispose();
        terrain.material = original;
        disposeBlueprintTerrain(terrain);
        diagnostics.forEach(m => m.dispose());
        sources.forEach(m => m.dispose());
        models.dispose(); assets.dispose();
        return { observations, images, campaignUnchanged: before === shared.persist() };
    });
    for (const image of results.images)
        await writeFile(output + '/' + image.name, Buffer.from(image.base64, 'base64'));
    delete results.images;
    results.errors = errors;
    await writeFile(output + '/result.json', JSON.stringify(results, null, 2));
    const focus = await canvas.evaluate(canvas => {
        const p = JSON.parse(canvas.dataset.entities).find(e => e.kind === 'building').transform;
        const c = JSON.parse(canvas.dataset.camera), w = c.world, m = c.projection;
        const v = [p.x + 8 - w[12], p.y - w[13], p.z - w[14]];
        const local = [w[0]*v[0]+w[1]*v[1]+w[2]*v[2], w[4]*v[0]+w[5]*v[1]+w[6]*v[2],
            w[8]*v[0]+w[9]*v[1]+w[10]*v[2], 1];
        const projected = [0,1,2,3].map(row => m[row]*local[0]+m[row+4]*local[1]+m[row+8]*local[2]+m[row+12]);
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left+(projected[0]/projected[3]+1)*rect.width/2,
            y: rect.top+(1-projected[1]/projected[3])*rect.height/2 };
    });
    await page.mouse.click(focus.x, focus.y);
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: output + '/near.png' });
    await page.mouse.wheel(0, 6000);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: output + '/far.png' });
    console.log(JSON.stringify(results, null, 2));
    assert.deepEqual(errors, []);
    assert.equal(results.campaignUnchanged, true);
    for (const result of results.observations) {
        assert.ok(result.tested > 100, 'actual Farmyard covers a measurable area');
        assert.equal(result.obscured, 0, 'regional terrain must not cover the source Farmyard at distance ' + result.distance);
    }
} finally {
    await browser.close();
}
