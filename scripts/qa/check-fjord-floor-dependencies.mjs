import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5186';
const output = process.env.QA_OUTPUT || 'artifacts/fine-grained-updates/floor';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
try {
    const page = await browser.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/docs/qa/scene-lifecycle/review.html');
    const result = await page.evaluate(async () => {
        const source = await (await fetch('/src/fjord-play/FjordEntities.ts')).text();
        const three = source.match(/from ["']([^"']*\/three\.js[^"']*)["']/)[1];
        const { Raycaster } = await import(three);
        const { AssetManager } = await import('/src/core/AssetManager.ts');
        const { FjordModels } = await import('/src/fjord-play/FjordModels.ts');
        const { FjordEntities } = await import('/src/fjord-play/FjordEntities.ts');
        const { SharedSettlement } = await import('/src/play/SharedSettlement.ts');
        const save = await (await fetch('/docs/qa/fjord-runtime-performance/fixtures/developed-810.json')).text();
        const shared = SharedSettlement.restore(save, 'fjord');
        const before = shared.session.saveJSON();
        const assets = new AssetManager();
        await assets.loadForSimulation();
        const models = new FjordModels(assets), layer = new FjordEntities(models);
        const entities = shared.fjord.readProjection().entities.filter(e => e.kind === 'building' || e.kind === 'cattle');
        // Count the real external geometry query; never replace owned models or reconciliation.
        let queries = 0;
        const intersect = Raycaster.prototype.intersectObject;
        Raycaster.prototype.intersectObject = function (object, ...args) {
            if (['farmHutTerrain', 'farmyardMarker'].includes(object.name)) queries++;
            return intersect.call(this, object, ...args);
        };
        const describe = owner => owner.describe().map(e => ({ key: e.key, asset: e.asset,
            position: e.position, bounds: e.bounds, placeholder: e.placeholder }))
            .sort((a, b) => a.key.localeCompare(b.key));
        try {
            layer.prepareExpeditions(shared.session.readSnapshot(), shared.fjord.blueprint);
            await layer.sync(entities);
            const warmQueries = queries, expected = describe(layer);
            for (let i = 0; i < 5; i++) await layer.sync(structuredClone(entities));
            const unchangedQueries = queries;
            const cases = [];
            const cattle = entities.find(e => e.kind === 'cattle' && e.status.assignment);
            const home = entities.find(e => e.selectionKey === 'building:' + cattle.status.assignment);
            async function compare(label, next, expectedQueries) {
                const count = queries;
                await layer.sync(next);
                const additionalQueries = queries - count;
                const fresh = new FjordEntities(models);
                await fresh.sync(next);
                const actual = describe(layer), expected = describe(fresh);
                fresh.dispose();
                const positionsEqual = actual.length === expected.length && actual.every((value, i) =>
                    value.key === expected[i].key && value.asset === expected[i].asset &&
                    value.placeholder === expected[i].placeholder &&
                    value.position.every((position, axis) => position === expected[i].position[axis]));
                const maxBoundsDelta = Math.max(0, ...actual.flatMap((value, i) =>
                    ['min', 'max'].flatMap(edge => ['x', 'y', 'z'].map(axis =>
                        Math.abs(value.bounds[edge][axis] - expected[i].bounds[edge][axis])))));
                cases.push({ label, additionalQueries, expectedQueries, positionsEqual, maxBoundsDelta });
            }
            const moved = structuredClone(entities);
            moved.find(e => e.selectionKey === cattle.selectionKey).transform.x += .5;
            await compare('One source point changes', moved, 1);
            await compare('Point rollback', entities, 1);
            const lifted = structuredClone(entities);
            lifted.find(e => e.selectionKey === home.selectionKey).transform.y += .3;
            const assigned = entities.filter(e => e.kind === 'cattle' && e.status.assignment === cattle.status.assignment).length;
            await compare('One Farmyard transform changes', lifted, assigned);
            await compare('Farmyard rollback', entities, assigned);
            const unassigned = structuredClone(entities);
            delete unassigned.find(e => e.selectionKey === cattle.selectionKey).status.assignment;
            await compare('Assignment removed', unassigned, 0);
            await compare('Assignment restored', entities, 1);
            const young = entities.find(e => e.kind === 'cattle' && e.asset === 'young-adult' && e.status.assignment);
            const grown = structuredClone(entities);
            const adult = grown.find(e => e.selectionKey === young.selectionKey);
            adult.asset = adult.status.sex === 'female' ? 'adult-female' : 'adult-male';
            adult.status.stage = 'Adult';
            await compare('Life-stage source replacement', grown, 1);
            await compare('Life-stage rollback', entities, 1);
            const removed = entities.filter(e => e.selectionKey !== cattle.selectionKey);
            await compare('Cattle removed', removed, 0);
            await compare('Cattle instance recreated', entities, 1);
            layer.prepareExpeditions(shared.session.readSnapshot(), structuredClone(shared.fjord.blueprint));
            await compare('Another world with reused identities', entities,
                entities.filter(e => e.kind === 'cattle' && e.status.assignment).length);
            const fresh = new FjordEntities(models);
            await fresh.sync(entities);
            const reference = describe(fresh);
            fresh.dispose();
            return { warmQueries, unchangedQueries, cases, expected, actual: describe(layer), reference,
                exactCore: before === shared.session.saveJSON() };
        } finally {
            Raycaster.prototype.intersectObject = intersect;
            layer.dispose(); models.dispose(); assets.dispose();
        }
    });
    report.unchanged = result;
    assert.ok(result.warmQueries > 0, 'The native fixture must exercise assigned livestock on a real Farmyard');
    assert.equal(result.unchangedQueries, result.warmQueries,
        'Warmed identical yard and source positions must not repeat geometry queries');
    assert.deepEqual(result.actual, result.expected);
    assert.deepEqual(result.actual, result.reference, 'Retained floor placement must equal a fresh real-asset reconciliation');
    assert.equal(result.exactCore, true);
    for (const item of result.cases) {
        assert.equal(item.additionalQueries, item.expectedQueries, item.label + ' must refresh only affected query inputs');
        assert.equal(item.positionsEqual, true, item.label + ' positions must exactly equal a fresh reconciliation');
        // Retained local bounds and newly measured world bounds cancel translation in a
        // different order; their baseline floating-point differences are around 1e-14 m.
        assert.ok(item.maxBoundsDelta < 1e-9, item.label + ' bounds must equal the fresh geometry within numerical precision');
    }
    report.checks.push('Unchanged assigned-cattle placement reuses geometry queries and matches a fresh real-asset layer with exact Core');
    report.checks.push('Point/home transforms, assignment, removal, rollback and world replacement invalidate only the affected floor samples');
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile(output + '/checks.json', JSON.stringify(report, null, 2));
    await browser.close();
}
