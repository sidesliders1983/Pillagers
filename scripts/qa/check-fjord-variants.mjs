import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { core } from './fjord-lifecycle-scenario.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = createRequire(import.meta.url)('sharp');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-lifecycle';
const mode = process.env.QA_CASE || 'all';
assert.ok(['all', 'weather', 'assets', 'smoke'].includes(mode));
let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000, foundingCoupleChanceBps: 10000,
    cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0,
    cattleMortalityOldBps: 0, cattleCrowdingBps: 0 },
    { fertilityChanceBps: 10000, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
const farm = Object.keys(state.buildings)[0];
for (const id of Object.keys(state.landing.cattle))
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId: id, farmyardId: farm });
const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks = [], errors = [], weatherSamples = [];
try {
    await mkdir(output, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => {
        if (!sessionStorage.getItem('pillagers.fjord-play.active.v1'))
            sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
    }, core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#fjord-canvas');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const actual = async () => JSON.parse(await canvas.getAttribute('data-rendered'));
    const select = async (kind, id) => {
        await page.getByText('Settlement identities', { exact: true }).click();
        await page.locator('#fjord-identities button[data-kind="' + kind + '"][data-id="' + id + '"]').click();
        await page.getByText('Settlement identities', { exact: true }).click();
    };
    const advance = async () => {
        state = core.applyCommand(state, { type: 'AdvanceWinter' });
        await page.getByRole('button', { name: '+1 Winter', exact: true }).click();
        await page.waitForFunction(winter => document.querySelector('#fjord-winter').textContent.includes('Winter ' + winter + ' · tick 0'), state.time.winter);
    };
    const importState = async next => {
        await page.getByText('Campaign', { exact: true }).click();
        await page.locator('#fjord-import').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(core.serializeState(next)) });
        await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
        await page.getByText('Campaign', { exact: true }).click();
        assert.equal(await page.locator('#fjord-production-labels span').count(), 0);
        state = next;
    };
    if (mode === 'all' || mode === 'assets') {
        await advance();
        const baby = Object.values(state.landing.cattle).find(c => c.origin === 'reproduction');
        const child = Object.values(state.personas).find(p => p.parentIds.length === 2);
        assert.ok(baby && child);
        await page.waitForFunction(id => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.id === id && e.asset === 'baby'), baby.id);
        let childModel = (await actual()).find(e => e.id === child.id);
        const childRenderId = childModel.renderId;
        assert.equal(childModel.scale[0], .4);
        const heightAtBirth = childModel.bounds.max[1] - childModel.bounds.min[1];
        await advance();
        await page.waitForFunction(id => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.id === id && e.asset === 'young-adult'), baby.id);
        childModel = (await actual()).find(e => e.id === child.id);
        assert.equal(childModel.renderId, childRenderId);
        assert.ok(childModel.bounds.max[1] - childModel.bounds.min[1] > heightAtBirth);
        await advance();
        await page.waitForFunction(id => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.id === id && e.stage === 'Adult'), baby.id);
        const animals = (await actual()).filter(e => e.kind === 'cattle');
        assert.ok(animals.some(e => e.asset === 'adult-female'));
        assert.ok(animals.some(e => e.asset === 'adult-male'));
        await select('building', farm);
        await page.selectOption('#specialization', 'farmer');
        await page.getByRole('button', { name: 'Specialize', exact: true }).click();
        state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId: farm, occupation: 'farmer' });
        const position = (await actual()).find(e => e.id === farm).position;
        for (const asset of ['farmHomestead', 'longhouse', 'greatHall']) {
            await page.getByRole('button', { name: /^Upgrade \(/ }).click();
            state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId: farm });
            await page.waitForFunction(({ id, asset }) => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.id === id && e.asset === asset), { id: farm, asset });
            assert.deepEqual((await actual()).find(e => e.id === farm).position, position);
        }
        await page.screenshot({ path: output + '/stages-upgrades.png' });
        await select('cattle', baby.id);
        await page.getByRole('button', { name: /^Slaughter \(/ }).click();
        state = core.applyCommand(state, { type: 'SlaughterCattle', cattleId: baby.id });
        await page.waitForFunction(id => !JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.id === id), baby.id);
        assert.match(await page.locator('#entity-panel').innerText(), /Died \/ slaughtered/);
        assert.match(await page.locator('#entity-panel').innerText(), /Parents:/);
        await select('building', farm);
        await page.getByRole('button', { name: /^Salvage house \(/ }).click();
        state = core.applyCommand(state, { type: 'SalvageBuilding', buildingId: farm });
        await page.waitForFunction(id => !JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.kind === 'building' && e.id === id), farm);
        const afterSalvage = await actual();
        assert.ok(afterSalvage.some(e => e.kind === 'household' && e.id === home));
        assert.ok(afterSalvage.filter(e => e.kind === 'cattle').every(e => !e.assignment && !e.sheltered));
        checks.push('Real births, child growth with stable model ID, baby/young-adult/cow/bull sources, stable building upgrades, slaughter history and salvage-to-tent/unassigned cattle.');
        let mortality = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 },
            { mortalityBands: [{ minAge: 0, chanceBps: 10000 }] }, { enabled: false });
        mortality = core.applyCommand(mortality, { type: 'BuildHouse', householdId: 'founder-1' });
        await importState(mortality);
        await select('persona', 'founder-1');
        await advance();
        await page.waitForFunction(() => !JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.kind === 'persona'));
        assert.match(await page.locator('#entity-panel').innerText(), /deceased in Winter/);
        assert.match(await page.locator('#entity-panel').innerText(), /History and lineage remain available/);
        assert.equal(await page.locator('#occupation').count(), 0);
        for (let year = 0; year < 2; year++) await advance();
        await page.waitForFunction(() => !JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered).some(e => e.kind === 'building'));
        checks.push('Controlled natural mortality removes all live residents, retains selected history and eventually collapses the vacant house.');
    }
    if (mode === 'all' || mode === 'weather') {
        for (const kind of core.weatherClasses) {
            const profiles = structuredClone(core.defaultWeatherConfig.profiles);
            for (const [name, profile] of Object.entries(profiles)) profile.probabilityBps = name === kind ? 10000 : 0;
            let weather = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 }, {}, { profiles });
            weather = core.applyCommand(weather, { type: 'BuildHouse', householdId: 'founder-1' });
            await importState(weather);
            const observed = JSON.parse(await canvas.getAttribute('data-weather'));
            assert.equal(observed.class, kind);
            assert.equal(observed.observed.sky, observed.lighting.sky);
            assert.equal(observed.observed.fogFar, observed.lighting.fogFar);
            assert.equal(observed.observed.exposure, observed.lighting.exposure);
            assert.match(await page.locator('#fjord-weather-information').innerText(), new RegExp(kind));
            if (kind === 'Harsh') assert.match(await page.locator('#fjord-weather-information').innerText(), /Food output 0% · Materials output 0%/);
            await page.screenshot({ path: output + '/weather-' + kind.toLowerCase() + '.png' });
            const scenePatch = await sharp(output + '/weather-' + kind.toLowerCase() + '.png')
                .extract({ left: 100, top: 250, width: 650, height: 300 }).toBuffer();
            const imageStats = await sharp(scenePatch).stats();
            const sceneDetail = imageStats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
            assert.ok(sceneDetail > 2, 'Weather must preserve scene detail in the initial view: ' + kind + ' variation ' + sceneDetail);
            weatherSamples.push({ ...observed, sceneDetail });
            console.log('Checked weather ' + kind);
        }
        await page.selectOption('#fjord-quality', 'standard');
        assert.equal(JSON.parse(await canvas.getAttribute('data-weather')).class, 'Severe');
        await page.screenshot({ path: output + '/weather-severe-standard.png' });
        await importState(core.createCampaign(17, {}, {}, { enabled: false }));
        assert.equal(JSON.parse(await canvas.getAttribute('data-weather')).class, null);
        assert.equal(JSON.parse(await canvas.getAttribute('data-weather')).snow, 0);
        checks.push('All four canonical weather classes reach actual native lights/fog/exposure, factual forecast and existing snow treatment; quality preserves the class and disabled weather restores baseline.');
    }
    if (mode === 'all' || mode === 'smoke') {
        await page.goto(origin + '/gameplay-lab', { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: 'Pillagers · Gameplay Lab', exact: true }).waitFor();
        await page.goto(origin + '/play', { waitUntil: 'domcontentloaded' });
        await page.locator('#entity-picker').waitFor();
        await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
        await page.locator('canvas[data-ready="true"]').waitFor();
        checks.push('Gameplay Lab, 2D Settlement and the original 3D Fjord prototype still open without browser errors.');
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/variants-' + mode + '.json', JSON.stringify({ checks, weatherSamples, browserErrors: errors }, null, 2));
    console.log(checks.join('\n'));
} finally { await browser.close(); }
