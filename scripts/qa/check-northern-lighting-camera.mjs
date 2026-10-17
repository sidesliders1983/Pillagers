import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const output = process.env.QA_OUTPUT || 'artifacts/northern-lighting/camera';
const fixture = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8'));
fixture.target = 'fjord';
fixture.pace.running = false;
const digest = value => createHash('sha256').update(value).digest('hex');
const report = { fixture: 'developed-810', viewport: { width: 1440, height: 900 }, poses: [], errors: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
    page.setDefaultTimeout(240000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(json => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
        const observer = new MutationObserver(() => {
            const effects = document.querySelector('#fjord-effects');
            if (effects) { effects.value = 'off'; observer.disconnect(); }
        });
        observer.observe(document, { childList: true, subtree: true });
    }, JSON.stringify(fixture));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction(() => window.__fjordAudit?.golden &&
        document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
    await page.addStyleTag({ content: `#fjord-management, #fjord-management-toggle,
        #fjord-selection-leaders, #fjord-selection-labels, #fjord-production-labels { visibility: hidden !important; }` });
    const initial = await page.evaluate(() => window.__fjordAudit.golden.capture());
    const target = initial.camera.target;
    const person = await page.evaluate(() => window.__fjordAudit.references.layer.describe()
        .filter(entity => entity.kind === 'persona' && entity.bounds)
        .sort((a, b) => a.key.localeCompare(b.key))[0]);
    assert.ok(person?.bounds);
    const min = person.bounds.min, max = person.bounds.max;
    const x = (min.x + max.x) / 2, z = (min.z + max.z) / 2;
    const poses = [{ name: 'resident-contact', image: true,
        position: [x + 6, min.y + 5, z + 6], target: [x, min.y + .8, z] }];
    for (const distance of [20, 65, 180]) for (const angle of [0, 1.7, 3.8]) {
        poses.push({ name: `orbit-${distance}-${angle}`, image: distance === 180 && angle === 1.7,
            position: [target[0] + Math.sin(angle) * distance, target[1] + distance * .7,
                target[2] + Math.cos(angle) * distance], target });
    }
    poses.push({ name: 'pan', position: [target[0] + 90, target[1] + 40, target[2] + 50],
        target: [target[0] + 65, target[1], target[2] + 25] });
    for (const quality of ['standard', 'low']) {
        // The capture deliberately hides the management HUD; exercise its existing change handler.
        await page.evaluate(value => {
            const select = document.querySelector('#fjord-quality');
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }, quality);
        for (const pose of poses) {
            const capture = await page.evaluate(camera => window.__fjordAudit.golden.capture({ camera }), pose);
            assert.equal(digest(capture.canonicalJSON), digest(initial.canonicalJSON));
            assert.deepEqual(capture.actors, initial.actors);
            const check = await page.evaluate(() => {
                const { camera, lighting, layer, scene } = window.__fjordAudit.references;
                const shadow = lighting.directional.shadow.camera;
                const excluded = [], visible = [];
                for (const entity of layer.describe()) {
                    if (!entity.bounds) continue;
                    const min = entity.bounds.min, max = entity.bounds.max;
                    const point = camera.position.clone().set((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
                    const depth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
                    const screen = point.clone().project(camera);
                    if (Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || Math.abs(screen.z) > 1 ||
                        depth > lighting.fog.far) continue;
                    visible.push(entity.key);
                    const texel = point.applyMatrix4(shadow.matrixWorldInverse).applyMatrix4(shadow.projectionMatrix);
                    if (Math.max(Math.abs(texel.x), Math.abs(texel.y), Math.abs(texel.z)) > 1.000001)
                        excluded.push({ key: entity.key, projection: texel.toArray() });
                }
                return { visible, excluded, projection: shadow.projectionMatrix.toArray(),
                    shadowSources: scene.children.filter(node => node.isLight && node.castShadow).length,
                    mapSize: lighting.directional.shadow.mapSize.toArray(), coverage: lighting.inspectShadowCoverage() };
            });
            assert.deepEqual(check.excluded, []);
            assert.ok(check.projection.every(Number.isFinite));
            assert.equal(check.shadowSources, 1);
            assert.equal(check.mapSize[0], quality === 'low' ? 1024 : 2048);
            const record = { pose: pose.name, quality, camera: capture.camera, ...check };
            if (pose.image) {
                record.image = `${pose.name}-${quality}.jpg`;
                await sharp(await page.locator('#fjord-canvas').screenshot())
                    .jpeg({ quality: 91, chromaSubsampling: '4:4:4' }).toFile(output + '/' + record.image);
            }
            report.poses.push(record);
        }
    }
    assert.ok(report.poses.reduce((sum, pose) => sum + pose.visible.length, 0) > 20);
    assert.deepEqual(report.errors, []);
    report.canonicalSha256 = digest(initial.canonicalJSON);
    report.status = 'PASS';
    console.log('PASS', report.poses.length, 'camera/tier poses; visible entity bases remain in shadow coverage.');
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    throw error;
} finally {
    await writeFile(output + '/camera-check.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
