import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { core, createLifecycleScenario } from './fjord-lifecycle-scenario.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-lifecycle';
const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checkpoints = [], errors = [], checks = [];
let { state, farm } = createLifecycleScenario();
const from = state.events.length;
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => {
        if (!sessionStorage.getItem('pillagers.fjord-play.active.v1'))
            sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
    }, core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    const ready = async () => page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await ready();
    const canvas = page.locator('#fjord-canvas');
    const rendered = async () => JSON.parse(await canvas.getAttribute('data-rendered'));
    const exportCore = async () => {
        await page.getByText('Campaign', { exact: true }).click();
        const [download] = await Promise.all([page.waitForEvent('download'),
            page.getByRole('button', { name: 'Export canonical JSON', exact: true }).click()]);
        try { return JSON.parse(await readFile(await download.path(), 'utf8')); }
        finally { await download.delete(); await page.getByText('Campaign', { exact: true }).click(); }
    };
    const checkpoint = async () => {
        await page.waitForFunction(winter => {
            const projected = JSON.parse(document.querySelector('#fjord-canvas').dataset.entities);
            const actual = JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered);
            return document.querySelector('#fjord-winter').textContent.includes('Winter ' + winter + ' · tick 0') &&
                projected.length === actual.length && projected.every(entity => actual.some(item => item.key === entity.selectionKey &&
                    item.asset === entity.asset && item.age === entity.status.age));
        }, state.time.winter);
        const actual = await rendered();
        const residents = Object.values(state.personas).filter(p => p.deathWinter === null && !core.personaAway(state, p.id));
        const cattle = Object.values(state.landing.cattle).filter(c => c.deathWinter === null);
        assert.deepEqual(actual.filter(e => e.kind === 'persona').map(e => e.id).sort(), residents.map(p => p.id).sort());
        assert.deepEqual(actual.filter(e => e.kind === 'cattle').map(e => e.id).sort(), cattle.map(c => c.id).sort());
        for (const entity of actual.filter(e => e.kind === 'cattle')) {
            const facts = core.inspectCattle(state, entity.id);
            assert.equal(entity.stage, facts.stage);
            assert.equal(entity.sheltered, facts.sheltered);
            assert.equal(entity.overcrowding, facts.overcrowding);
            assert.deepEqual(entity.parentIds, facts.parentIds);
            assert.equal(entity.asset, facts.stage === 'Young' ? 'baby' : facts.stage === 'Young Adult' ? 'young-adult' : facts.sex === 'female' ? 'adult-female' : 'adult-male');
        }
        for (const entity of actual.filter(e => e.kind === 'persona')) {
            assert.equal(entity.age, core.personaAge(state, entity.id));
            assert.ok(entity.bounds.max[1] > entity.bounds.min[1], 'Invalid rendered persona bounds: ' + JSON.stringify(entity));
        }
        const previous = checkpoints.at(-1);
        if (previous) for (const entity of actual) {
            const old = previous.instances.find(item => item.key === entity.key);
            if (old && old.asset === entity.asset) assert.equal(entity.renderId, old.renderId, 'Unchanged source preserves its instance.');
        }
        const weather = JSON.parse(await canvas.getAttribute('data-weather'));
        assert.equal(weather.class, core.inspectWeather(state).class);
        assert.equal(weather.observed.fogFar, weather.lighting.fogFar);
        assert.equal(weather.observed.sunIntensity, weather.lighting.sunIntensity);
        const production = JSON.parse(await page.locator('#fjord-production-labels').getAttribute('data-totals') || '[]');
        const canonical = state.events.slice(from).filter(e => e.type === 'ResourceProduced' || e.type === 'CattleFoodProduced');
        assert.equal(production.reduce((sum, event) => sum + event.units, 0), canonical.reduce((sum, event) => sum + event.details.units, 0));
        for (const output of production) assert.equal(output.units, canonical.filter(e => (e.type === 'CattleFoodProduced' ? 'cattle' : 'persona') === output.kind &&
            (e.personaId ?? e.details.cattleId) === output.id &&
            (e.type === 'CattleFoodProduced' ? 'food' : e.details.resource) === output.resource).reduce((sum, e) => sum + e.details.units, 0));
        assert.ok(await page.locator('#fjord-production-labels span').count() <= 6);
        checkpoints.push({ winter: state.time.winter, residents: residents.length, cattle: cattle.length,
            weather: weather.class, personalProduction: production.filter(e => e.kind === 'persona').reduce((sum, event) => sum + event.units, 0),
            cowProduction: production.filter(e => e.kind === 'cattle').reduce((sum, event) => sum + event.units, 0),
            placeholders: actual.filter(e => e.placeholder).map(e => e.key),
            instances: actual.map(e => ({ key: e.key, renderId: e.renderId, asset: e.asset, age: e.age, position: e.position })) });
    };
    await checkpoint();
    await mkdir(output, { recursive: true });
    for (let year = 1; year <= 25; year++) {
        await page.getByRole('button', { name: '+1 Winter', exact: true }).click();
        state = core.applyCommand(state, { type: 'AdvanceWinter' });
        await checkpoint();
        if ([1, 8, 16, 25].includes(year)) await page.screenshot({ path: output + '/winter-' + year + '.png' });
        console.log('Checked Winter ' + state.time.winter + ': ' + checkpoints.at(-1).residents + ' residents, ' + checkpoints.at(-1).cattle + ' cattle.');
    }
    assert.deepEqual(await exportCore(), JSON.parse(core.serializeState(state)), 'Entire browser run equals canonical replay.');
    const events = {};
    for (const event of state.events.slice(from)) events[event.type] = (events[event.type] ?? 0) + 1;
    assert.ok(events.ChildBorn && events.PersonaDied && events.CattleBorn && events.CattleDied);
    checks.push('All 26 checkpoints (founding + 25 Winters) match actual GLB identities, stages, ancestry, shelter, weather and exactly attributed production.');
    assert.deepEqual(errors, []);
    await writeFile(output + '/winters.json', JSON.stringify({ seed: 17, scenario: 'Default lifecycle/weather rates; initial reserves 10000 Food / 1000 Materials, founding pairing 100%',
        checks, events, checkpoints, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
