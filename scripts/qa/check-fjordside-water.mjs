import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/package.json');
    for (const mode of ['reference', 17, 91]) {
        const summary = await page.evaluate(async mode => {
            const { AssetManager } = await import('/src/core/AssetManager.ts');
            const { createWorld } = await import('/src/world/WorldFactory.ts');
            const { generateWorld } = await import('/src/world-generation/GenerateWorld.ts');
            const assets = new AssetManager();
            await assets.load();
            const world = await createWorld(assets, {
                mode: mode === 'reference' ? 'reference' : 'generated', quality: 'standard',
                blueprint: mode === 'reference' ? undefined : generateWorld({ seed: mode, conifers: 'ez-tree' }),
            });
            try {
                const boat = world.root.getObjectByName('boat');
                const poses = [];
                for (const time of [0, 2.5, 8.1, 2.5]) {
                    world.update(time);
                    poses.push([...boat.position.toArray(), ...boat.quaternion.toArray()]);
                }
                const saveBefore = JSON.parse(world.exportSave());
                world.setMotion({ water: false, wind: false });
                world.update(20);
                const held = world.describe().water;
                world.setQuality('low');
                const low = world.describe().water;
                const saveAfter = JSON.parse(world.exportSave());
                world.setQuality('standard');
                const waterMesh = world.root.getObjectByName('Reference water');
                const lastPose = boat.position.toArray();
                world.setMotion({ water: true, wind: true });
                waterMesh.position.x += 4000;
                let invalidRejected = false;
                try { world.update(9); } catch (error) { invalidRejected = error instanceof RangeError; }
                const invalidPose = boat.position.toArray();
                waterMesh.position.x -= 4000;
                world.setMotion({ water: true, wind: true });
                world.update(2.5);
                let waterDisposals = 0, borrowedDisposals = 0;
                const resources = [waterMesh.geometry, waterMesh.material,
                    waterMesh.material.uniforms.uSurfaceTexture.value];
                resources.forEach(resource => resource.addEventListener('dispose', () => waterDisposals++));
                boat.traverse(node => {
                    if (node.isMesh) node.geometry.addEventListener('dispose', () => borrowedDisposals++);
                });
                const summary = world.describe();
                world.dispose();
                return { ...summary, poses, held, low, saveBefore, saveAfter,
                    invalidRejected, lastPose, invalidPose, waterDisposals, borrowedDisposals,
                    childrenAfterDispose: world.root.children.length };
            }
            finally { world.dispose(); assets.dispose(); }
        }, mode);
        assert.equal(summary.water?.source, 'reference-water', mode + ' uses the selected water');
        assert.notDeepEqual(summary.poses[0], summary.poses[1], 'The actual boat follows the waves');
        assert.deepEqual(summary.poses[1], summary.poses[3], 'Same-time boat pose is reproducible');
        assert.ok(summary.poses.every(pose => pose.every(Number.isFinite)));
        assert.equal(summary.poses[0][0], summary.poses[1][0], 'Horizontal mooring is preserved');
        assert.equal(summary.poses[0][2], summary.poses[1][2], 'Horizontal mooring is preserved');
        assert.deepEqual(summary.held.boat.position, summary.poses[3].slice(0, 3));
        assert.equal(summary.held.time, 2.5, 'Paused water and boat share the held clock');
        assert.equal(summary.low.time, 2.5, 'Quality preserves the clock');
        assert.equal(summary.low.quality, 'low');
        assert.equal(summary.low.triangles, 2048);
        assert.deepEqual(summary.saveBefore.blueprint, summary.saveAfter.blueprint);
        assert.deepEqual(summary.saveBefore.attachments, summary.saveAfter.attachments);
        assert.equal(summary.invalidRejected, true, 'Missing support water is rejected');
        assert.deepEqual(summary.invalidPose, summary.lastPose, 'Invalid support retains the last finite boat pose');
        assert.equal(summary.waterDisposals, 3, 'Owned water geometry, material and texture are released');
        assert.equal(summary.borrowedDisposals, 0, 'Shared boat resources remain owned by AssetManager');
        assert.equal(summary.childrenAfterDispose, 0);
        assert.equal(summary.water.quality, 'medium');
        assert.equal(summary.water.triangles, 8192);
        assert.deepEqual(summary.water.parameters, { waveAmplitude: 0.18, waveSpeed: 1, detailStrength: 0.65 });
    }
    console.log('PASS: Reference and generated World factory use the approved ReferenceWater.');
} finally {
    await browser.close();
}
