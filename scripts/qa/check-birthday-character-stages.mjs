import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5194';
const output = process.env.QA_OUTPUT || 'artifacts/persona-birthdays/stages';
const saved = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/boundary-810.json'));
saved.fjord.campaign = core.createCampaign(32, {}, {
    fertilityChanceBps: 0, partnershipChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }],
}, {}, {}, {}, {}, 'summer-800-v1', 'individual-v1');
delete saved.fjord.narrative;
saved.target = 'fjord';
saved.pace.running = false;
const cases = [
    { id: 'founder-1', label: 'adult-entry', age: 17 },
    { id: 'founder-2', label: 'greying', age: 45 },
    { id: 'founder-3', label: 'child-growth', age: 6 },
    { id: 'founder-4', label: 'elder-entry', age: 50 },
];
for (const item of cases) {
    const person = saved.fjord.campaign.personas[item.id];
    person.birthWinter = 799 - item.age;
    person.birthTick = 501;
}
core.serializeState(saved.fjord.campaign);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
page.setDefaultTimeout(180000);
const errors = [], captures = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await page.addInitScript(data => sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(data)), saved);
    await page.goto(origin + '/fjord-play');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.waitForFunction(() => window.__fjordAudit);
    await page.evaluate(() => {
        window.__fjordAudit.flags.manualClock = true;
        window.__fjordAudit.references.setPlayback(false);
    });
    await page.locator('#fjord-management-toggle').click();
    for (const phase of ['before', 'after']) {
        if (phase === 'after')
            await page.evaluate(() => window.__fjordAudit.references.advanceTicks(1));
        for (const item of cases) {
            const result = await page.evaluate(({ id, phase }) => {
                const refs = window.__fjordAudit.references;
                const [root, actor] = [...refs.models.actors].find(([root]) => root.userData.canonical.id === id);
                const box = refs.layer.bounds(root.name), centre = box.getCenter(refs.controller.focus.clone());
                window.__birthdayViews ??= {};
                if (phase === 'before') {
                    const size = box.max.y - box.min.y;
                    window.__birthdayViews[id] = {
                        position: [centre.x + size * .5, centre.y + size * .15, centre.z + size * 2.6],
                        target: centre.toArray(),
                    };
                }
                refs.controller.setView(window.__birthdayViews[id]);
                const human = actor.human;
                return { id, phase, age: human.dna.age, modules: [...human.fit.modules.keys()],
                    bounds: { min: box.min.toArray(), max: box.max.toArray() },
                    appearance: human.root.userData.selectedAssets,
                    profile: human.root.userData.universalHumanProfile,
                    rawAge: refs.session.readSnapshot().personas[id].dna.age,
                    time: { ...refs.session.readSnapshot().time } };
            }, { id: item.id, phase });
            assert.equal(result.age, item.age + (phase === 'after' ? 1 : 0));
            assert.equal(result.time.tick, phase === 'after' ? 501 : 500);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const path = item.label + '-' + phase + '.png';
            await page.locator('#fjord-canvas').screenshot({ path: output + '/' + path });
            captures.push({ ...result, path });
        }
    }
    const capture = (label, phase) => captures.find(result => result.path === label + '-' + phase + '.png');
    assert.equal(capture('adult-entry', 'before').profile.stage, 'teen');
    assert.equal(capture('adult-entry', 'after').profile.stage, 'adult');
    assert.equal(capture('greying', 'before').profile.appearance.greyAmount, 0);
    assert.equal(capture('greying', 'after').profile.appearance.greyAmount, .025);
    assert.equal(capture('elder-entry', 'before').profile.stage, 'adult');
    assert.equal(capture('elder-entry', 'after').profile.stage, 'elder');
    const height = result => result.bounds.max[1] - result.bounds.min[1];
    assert.ok(height(capture('child-growth', 'after')) > height(capture('child-growth', 'before')));
    const ownership = await page.evaluate(async (id) => {
        const refs = window.__fjordAudit.references;
        const [root, actor] = [...refs.models.actors].find(([root]) => root.userData.canonical.id === id);
        const canonical = refs.session.saveJSON();
        const entities = refs.campaign.readProjection().entities;
        const resources = refs.models.inspectResources();
        const viewport = { left: 0, top: 0, width: 1024, height: 768 };
        const box = refs.layer.bounds(root.name), centre = box.getCenter(refs.controller.focus.clone());
        let picking;
        for (let side = 0; side < 16; side++) {
            const angle = side * Math.PI / 8, camera = refs.camera.clone();
            camera.position.copy(centre).add({ x: Math.sin(angle) * 4, y: .1, z: Math.cos(angle) * 4 });
            camera.lookAt(centre);
            camera.updateMatrixWorld(true);
            const mouse = refs.layer.pick(camera, 512, 384, viewport, 'mouse');
            const touch = refs.layer.pick(camera, 512, 384, viewport, 'touch');
            if (mouse?.id === id && touch?.id === id) {
                picking = { mouse: mouse.id, touch: touch.id };
                break;
            }
        }
        await refs.layer.sync(entities.filter(entity => entity.selectionKey !== root.name));
        const disposed = actor.human.isDisposed;
        await refs.layer.sync(entities);
        return { picking, disposed, canonicalUnchanged: canonical === refs.session.saveJSON(),
            resourcesBefore: resources, resourcesAfter: refs.models.inspectResources(),
            placeholders: refs.layer.describe().filter(entity => entity.placeholder) };
    }, cases[0].id);
    assert.ok(ownership.picking);
    assert.equal(ownership.disposed, true);
    assert.equal(ownership.canonicalUnchanged, true);
    assert.deepEqual(ownership.placeholders, []);
    const actual = await page.evaluate(() => window.__fjordAudit.references.session.snapshot());
    assert.deepEqual(actual, core.applyCommand(saved.fjord.campaign, { type: 'AdvanceTicks', ticks: 1 }));
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ origin, captures, ownership, errors,
        note: 'Actual scene models across canonical tick 500 to 501. Controlled fixture dates; no historical migration. One removal/reappearance cycle checks ownership, not long-term heap stability. Desktop Edge, not physical mobile hardware.' }, null, 2));
    console.log('Native adult, grey-hair and child-growth birthdays, picking and disposal passed.');
}
finally {
    await browser.close();
}
