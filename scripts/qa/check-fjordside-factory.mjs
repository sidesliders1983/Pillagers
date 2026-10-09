import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(120000);
try {
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/package.json');
    for (const seed of [17,91]) {
    const result = await page.evaluate(async seed => {
        const { createWorld, parseFjordsideSave } = await import('/src/world/WorldFactory.ts');
        const { AssetManager } = await import('/src/core/AssetManager.ts');
        const { generateWorld } = await import('/src/world-generation/GenerateWorld.ts');
        const { Raycaster, Vector3 } = await import('/node_modules/three/build/three.module.js');
        const assets = new AssetManager();
        await assets.load();
        const blueprint = generateWorld({ seed, conifers: 'ez-tree' });
        const world = await createWorld(assets, { mode: 'generated', blueprint, quality: 'low' });
        world.root.updateMatrixWorld(true);
        const center = blueprint.settlement.center;
        const hit = new Raycaster(new Vector3(center.x, 100, center.z), new Vector3(0,-1,0))
            .intersectObject(world.terrain)[0];
        const output = { summary: world.describe(), height: world.movement.heightAt(center.x,center.z),
            renderedHeight: hit?.point.y, keys: world.attachments.map(item => item.key),
            safeCenter: world.movement.walkable(center.x,center.z),
            routesClear: blueprint.settlement.accessPaths.flat().every(p => world.movement.walkable(p.x,p.z)),
            blockedRoutes: blueprint.settlement.accessPaths.flat().filter(p => !world.movement.walkable(p.x,p.z)),
            marine: world.attachments.filter(p => p.support === 'marine') };
        const saved = world.exportSave();
        const loaded = await createWorld(assets,parseFjordsideSave(saved));
        output.sameSave = loaded.exportSave() === saved;
        output.sameAttachments = JSON.stringify(loaded.attachments) === JSON.stringify(world.attachments);
        loaded.dispose();
        world.dispose();
        assets.dispose();
        return output;
    },seed);
    assert.equal(result.summary.mode, 'generated');
    assert.equal(result.summary.populationSource, 'existing-fjordside');
    assert.equal(result.summary.buildings, 6);
    assert.ok(Math.abs(result.height - result.renderedHeight) < 0.00001);
    assert.equal(result.safeCenter, true);
    if(!result.routesClear) console.log(JSON.stringify({blocked:result.blockedRoutes,marine:result.marine}));
    assert.equal(result.routesClear,true,'All original six parcel and harbor approaches remain traversable');
    assert.equal(result.keys.length, 20);
    for (const key of ['storehouse','hearth','well','jetty','boat','fish','rune','cliff'])
        assert.ok(result.keys.includes(key), 'Existing source remains present: ' + key);
    assert.equal(result.sameSave,true,'Reload retains the complete stored geography');
    assert.equal(result.sameAttachments,true,'Reload retains all source placements');
    }
    console.log('PASS: real World factory retains source scenery and the canonical physical surface.');
} finally {
    await browser.close();
}
