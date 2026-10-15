import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT;
const variants = JSON.parse(process.env.QA_VARIANTS);
const fixture = await readFile('docs/qa/fjord-runtime-performance/fixtures/boundary-810.json', 'utf8');
const cases = [
    { id: 'child-five', age: 4, sex: 'female' },
    { id: 'child-growing', age: 6, sex: 'male' },
    { id: 'adult-entry', age: 17, sex: 'female', outfit: 'farmerFemale' },
    { id: 'farmer-female', age: 32, sex: 'female', outfit: 'farmerFemale', height: 1.28, seed: 17 },
    { id: 'farmer-male', age: 32, sex: 'male', outfit: 'farmerMale', seed: 32 },
    { id: 'tunic-hair-beard', age: 45, sex: 'male', hair: true },
    { id: 'aging-hair-colour', age: 45, sex: 'male', hair: true, autoColor: true },
    { id: 'elder-entry', age: 50, sex: 'female', outfit: 'farmerFemale', hair: true, hairColor: '#9a9a92' },
    { id: 'elder-male', age: 75, sex: 'male', hair: true, hairColor: '#9a9a92' },
    { id: 'lod0-farmer', age: 32, sex: 'male', outfit: 'farmerMale', lod: 0 },
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], captures = [], worldChecks = [];
try {
    for (const variant of variants) {
        const page = await browser.newPage({ viewport: { width: 720, height: 800 }, deviceScaleFactor: 1 });
        page.setDefaultTimeout(180000);
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(json => {
            if (!sessionStorage.getItem('pillagers.fjord-play.active.v1'))
                sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
        }, fixture);
        await page.goto(variant.origin + '/fjord-play');
        await page.waitForFunction(() => window.__fjordAudit && document.querySelector('#fjord-canvas')?.dataset.ready);
        const worldCheck = await page.evaluate(async () => {
            const refs = window.__fjordAudit.references;
            refs.setPlayback(false); window.__fjordAudit.flags.manualClock = true;
            const [root, actor] = [...refs.models.actors].find(([, actor]) =>
                actor.human?.dna.age >= 18 && actor.human.dna.age < 44);
            const key = root.name, id = root.userData.canonical.id;
            const initialAge = actor.human.dna.age;
            const beforeBounds = refs.layer.entries.get(key).localBounds;
            await refs.advanceTicks(15);
            const age = actor.human.dna.age;
            const boundsRetained = beforeBounds === refs.layer.entries.get(key).localBounds;
            const testPicking = () => {
                const box = refs.layer.bounds(key), centre = box.getCenter(refs.controller.focus.clone());
                const camera = refs.camera.clone();
                for (let side = 0; side < 16; side++) {
                    const angle = side * Math.PI / 8;
                    camera.position.copy(centre).add({ x: Math.sin(angle) * 4, y: .1, z: Math.cos(angle) * 4 });
                    camera.lookAt(centre); camera.updateMatrixWorld(true);
                    const viewport = { left: 0, top: 0, width: 1280, height: 800 };
                    const mouse = refs.layer.pick(camera, 640, 400, viewport, 'mouse');
                    const touch = refs.layer.pick(camera, 640, 400, viewport, 'touch');
                    if (mouse?.id === id && touch?.id === id) return { mouse: mouse.id, touch: touch.id, side };
                }
                throw Error('No unobstructed desktop/touch pick for aged resident ' + id);
            };
            const picking = testPicking();
            const originalView = { position: refs.camera.position.toArray(), target: refs.controller.focus.toArray() };
            refs.controller.setView({ position: originalView.position.map((value, i) => value + (i === 0 ? 200 : 0)),
                target: originalView.target.map((value, i) => value + (i === 0 ? 200 : 0)) });
            await refs.advanceTicks(1000);
            const offscreenAge = actor.human.dna.age;
            refs.controller.setView(originalView);
            const offscreenPicking = testPicking();
            const canonical = refs.session.saveJSON(), entities = refs.campaign.readProjection().entities;
            await refs.layer.sync(entities.filter(entity => entity.selectionKey !== key));
            const disposed = actor.human.isDisposed;
            await refs.layer.sync(entities);
            const newRoot = refs.layer.entries.get(key).model;
            const newHuman = refs.models.actors.get(newRoot).human;
            window.__fitReload = { canonical, checkpoint: refs.shared.persist() };
            return { id, initialAge, age, boundsRetained, picking, offscreenAge, offscreenPicking,
                disposed, distinctReappearance: newRoot !== root, restoredAge: newHuman.dna.age,
                canonicalUnchangedByRemoval: canonical === refs.session.saveJSON(),
                placeholders: refs.layer.describe().filter(entity => entity.placeholder).map(entity => entity.key) };
        });
        assert.equal(worldCheck.age, worldCheck.initialAge + 1);
        assert.equal(worldCheck.offscreenAge, worldCheck.initialAge + 2);
        assert.equal(worldCheck.restoredAge, worldCheck.offscreenAge);
        assert.equal(worldCheck.disposed, true);
        assert.equal(worldCheck.distinctReappearance, true);
        assert.equal(worldCheck.canonicalUnchangedByRemoval, true);
        assert.deepEqual(worldCheck.placeholders, []);
        if (variant.label === 'after') assert.equal(worldCheck.boundsRetained, true);
        const reload = await page.evaluate(() => window.__fitReload);
        await page.evaluate(checkpoint => sessionStorage.setItem('pillagers.fjord-play.active.v1', checkpoint), reload.checkpoint);
        await page.reload();
        await page.waitForFunction(() => window.__fjordAudit && document.querySelector('#fjord-canvas')?.dataset.ready);
        const restored = await page.evaluate(id => {
            const refs = window.__fjordAudit.references;
            const [, actor] = [...refs.models.actors].find(([root]) => root.userData.canonical.id === id);
            return { age: actor.human.dna.age, canonical: refs.session.saveJSON(),
                modules: [...actor.human.fit.modules.keys()], source: actor.human.fit.body };
        }, worldCheck.id);
        assert.equal(restored.canonical, reload.canonical);
        assert.equal(restored.age, worldCheck.offscreenAge);
        worldChecks.push({ variant: variant.label, sourceCommit: variant.sourceCommit, ...worldCheck,
            reload: { age: restored.age, canonicalEqual: true, modules: restored.modules, source: restored.source,
                canonicalSha256: createHash('sha256').update(restored.canonical).digest('hex') } });
        await page.evaluate(async () => { const module = await import('/scripts/qa/fjord-fit-stage.mjs'); window.__fitStage = await module.createFitStage(); });
        for (const spec of cases) for (const view of spec.hair ? ['front', 'detail'] : ['front', 'side']) {
            const result = await page.evaluate(({ spec, view }) => window.__fitStage.draw(spec, view), { spec, view });
            assert.ok(result.hitCount > 0);
            assert.equal(result.age, spec.age + 1);
            const path = variant.label + '-' + spec.id + '-' + view + '.png';
            await page.screenshot({ path: output + '/' + path });
            captures.push({ variant: variant.label, sourceCommit: variant.sourceCommit, path, ...result });
        }
        for (const spec of cases.filter(spec => ['child-five', 'elder-male'].includes(spec.id))) {
            await page.setViewportSize({ width: 390, height: 844 });
            const result = await page.evaluate(spec => window.__fitStage.draw(spec, 'front', true), spec);
            assert.ok(result.hitCount > 0);
            const path = variant.label + '-' + spec.id + '-mobile.png';
            await page.screenshot({ path: output + '/' + path });
            captures.push({ variant: variant.label, sourceCommit: variant.sourceCommit, path, ...result });
        }
        await page.evaluate(() => window.__fitStage.dispose());
        await page.close();
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/captures.json', JSON.stringify({ captures, worldChecks, errors,
        note: 'Authored native assets at fixed poses under neutral lights; child below-five is an isolated fitting proof, not a change to indoor visibility. Viewport is not physical mobile hardware. Before is the pinned pre-170 full-refit app; after performs the birthday through the optimized path.' }, null, 2) + '\n');
} catch (error) {
    await writeFile(output + '/failed-captures.json', JSON.stringify({ captures, worldChecks, errors, failure: String(error) }, null, 2) + '\n');
    throw error;
} finally { await browser.close(); }
