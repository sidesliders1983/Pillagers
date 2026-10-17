import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const output = 'docs/qa/integrated-playtest-180';
await mkdir(output, { recursive: true });
const evidence = { version: 'integrated-fjord-playtest-v1', cases: [], errors: [] };
const sourceFiles = ['src/fjord-play/FjordPlay.ts', 'src/fjord-play/FjordInterface.ts',
    'src/fjord-play/FjordHeader.ts', 'src/fjord-play/WorkPlan.ts', 'src/world/SeasonTint.ts',
    'src/world/WorldGroundMaterials.ts', 'src/config/FjordTerrain.ts', 'src/gameplay-lab/GameplaySession.ts',
    'src/fjord-play/fjord-interface.css', 'src/fjord-play/FjordIcons.ts', 'src/world/WorldFactory.ts', 'src/config/FjordPresentation.ts',
    'scripts/qa/capture-integrated-playtest-180.mjs'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
evidence.sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, hash(await readFile(file))])));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    for (const fixtureName of (process.env.QA_CASES || 'summer-32,developed-810,snow-811,summer-17').split(','))
        for (const quality of (process.env.QA_TIERS || 'standard,low').split(',')) {
        const fixture = JSON.parse(await readFile(`${output}/${fixtureName === 'summer-32' ? 'funded-800' : fixtureName}.json`, 'utf8'));
        fixture.target = 'fjord'; fixture.pace.running = false;
        const expected = core.reconstructState(JSON.stringify(fixture.fjord.campaign));
        const entry = { fixture: fixtureName, quality, checks: [], images: [] };
        evidence.cases.push(entry);
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
        page.setDefaultTimeout(240000);
        page.on('pageerror', error => { evidence.errors.push(error.message); console.log('ERROR', error.message); });
        page.on('console', message => { if (message.type() === 'error') evidence.errors.push(message.text()); });
        try {
            await page.addInitScript(({ json, quality }) => {
                sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
                const observer = new MutationObserver(() => {
                    const field = document.querySelector('#fjord-quality');
                    if (!field) return;
                    field.value = quality;
                    document.querySelector('#fjord-effects').value = 'off';
                    observer.disconnect();
                });
                observer.observe(document, { childList: true, subtree: true });
            }, { json: JSON.stringify(fixture), quality });
            console.log('OPEN', fixtureName, quality);
            await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5198') + '/fjord-play', { waitUntil: 'domcontentloaded' });
            const progress = setInterval(async () => {
                try {
                    console.log('LOADING', (await page.locator('body').innerText()).slice(-900));
                    await page.screenshot({ path: 'artifacts/integrated-playtest-180/loading.jpg', type: 'jpeg' });
                } catch {}
            }, 15000);
            try {
                await page.waitForFunction(() => document.querySelector('#fjord-canvas')?.dataset.ready === 'true' ||
                    document.querySelector('.fjord-load-error'));
            } finally { clearInterval(progress); }
            assert.equal(await page.locator('.fjord-load-error').count(), 0,
                await page.locator('body').innerText().then(text => text.slice(-1200)));
            assert.deepEqual(await page.evaluate(() => window.__fjordAudit.references.session.readSnapshot()), expected);
            assert.equal((await page.locator('#fjord-canvas').getAttribute('data-terrain-style')).includes('iceland-v1'), true);
            entry.materials = await page.evaluate(() => window.__fjordAudit.references.world.terrain.material.map(material => ({
                name: material.name, width: material.map?.image.width ?? null,
                normalMap: !!material.normalMap, roughnessMap: !!material.roughnessMap,
            })));
            assert.equal(entry.materials.length, 6);
            assert.ok(entry.materials.every(material => material.width === (quality === 'standard' ? 1024 : 512) &&
                !material.normalMap && !material.roughnessMap));
            assert.equal(await page.locator('#fjord-management').isHidden(), true);
            assert.equal(await page.locator('#fjord-workspace').isHidden(), true);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.ok(await page.locator('#fjord-stocks strong').evaluateAll(nodes => nodes.every(node =>
                node.getBoundingClientRect().height < 30)), 'Stock values remain on one line');
            entry.checks.push('canonical restore; integrated terrain; unobstructed observe state');
            const shot = async name => {
                const image = `${fixtureName}-${quality}-${name}.jpg`;
                await page.screenshot({ path: output + '/' + image, type: 'jpeg', quality: 88 });
                entry.images.push(image);
            };
            await shot('observe');
            if (fixtureName === 'summer-32') {
                const subject = await page.evaluate(() => {
                    const refs = window.__fjordAudit.references;
                    const home = Object.values(refs.session.readSnapshot().households)[0];
                    const bounds = refs.layer.bounds('household:' + home.id);
                    if (!bounds) throw Error('Founding tent not rendered');
                    const point = refs.camera.position.clone().copy(bounds.min).add(bounds.max).multiplyScalar(.5).project(refs.camera);
                    const rect = refs.renderer.domElement.getBoundingClientRect();
                    return { id: home.id, x: rect.x + (point.x + 1) / 2 * rect.width, y: rect.y + (1 - point.y) / 2 * rect.height };
                });
                await page.mouse.click(subject.x, subject.y);
                assert.equal(await page.locator('#fjord-canvas').getAttribute('data-selected'), 'household:' + subject.id);
                await page.locator('[data-ui="work-menu"]').click();
                assert.equal(await page.locator('[data-ui="plan"]').count(), core.occupationIds.length);
                await page.locator('[data-ui="farmyard"]').click();
                for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
                    await page.setViewportSize(viewport);
                    const rect = await page.locator('[data-ui="commit-plan"]').boundingBox();
                    assert.ok(rect && rect.y >= 0 && rect.y + rect.height < viewport.height - 70, 'Commit visible without scrolling');
                }
                await shot('farmyard-review');
                const before = await page.evaluate(() => window.__fjordAudit.references.session.saveJSON());
                assert.equal(await page.locator('[data-cattle]:checked').count(), 3);
                await page.locator('[data-ui="commit-plan"]').click();
                await page.waitForFunction(() => document.querySelector('#entity-panel')?.textContent.includes('Farmyard setup completed.'));
                const after = await page.evaluate(() => window.__fjordAudit.references.session.readSnapshot());
                assert.equal(core.landingSummary(after).farmyards[0].occupants, 3);
                assert.equal(after.stocks.materials, JSON.parse(before).stocks.materials - after.mechanics.config.houseCost);
                assert.equal(after.time.tick, JSON.parse(before).time.tick);
                entry.checks.push('four physical clicks: visible tent → Manage work → Set up farmyard → Confirm; three real cattle sheltered');
                entry.farmyardClicks = 4;
                await shot('farmyard-result');
                await page.locator('[data-legacy-management] > summary').click();
                await page.locator('[data-command*="SalvageBuilding"]').click();
                await page.locator('#fjord-command-review [data-cancel]').click();
                assert.deepEqual(await page.evaluate(() => window.__fjordAudit.references.session.readSnapshot()), after);
                entry.checks.push('irreversible action review cancels without state changes');
                if (quality === 'standard') {
                    const secondHome = Object.values(after.households).find(h => h.id !== subject.id);
                    await page.locator('button[data-surface="settlement"]').click();
                    await page.locator('[data-ui="directory"][data-kind="household"]').click();
                    await page.locator(`#fjord-directory [data-ui="inspect"][data-id="${secondHome.id}"]`).click();
                    await page.locator('[data-ui="build"]').click();
                    await page.waitForFunction(id => {
                        const state = window.__fjordAudit.references.session.readSnapshot();
                        return state.residences[state.households[id].residenceId]?.kind === 'house';
                    }, secondHome.id);
                    const housing = await page.evaluate(() => window.__fjordAudit.references.session.readSnapshot());
                    for (const id of secondHome.memberIds) assert.equal(housing.personas[id].occupation, after.personas[id].occupation);
                    assert.deepEqual(housing.landing.cattle, after.landing.cattle);
                    await page.locator('[data-ui="work-menu"]').click();
                    await page.locator('[data-ui="plan"][data-role="smith"]').click();
                    const worker = await page.locator('[data-ui="worker"][aria-pressed="true"]').getAttribute('data-id');
                    await page.locator('[data-ui="commit-plan"]').click();
                    await page.waitForFunction(id => window.__fjordAudit.references.session.readSnapshot().personas[id].occupation === 'smith', worker);
                    assert.deepEqual(await page.evaluate(() => window.__fjordAudit.references.session.readSnapshot().landing.cattle), after.landing.cattle);
                    entry.checks.push('ordinary housing preserves occupations; Smithing uses the shared task without assigning cattle');
                }
                await page.locator('button[data-surface="settlement"]').click();
                await page.locator('[data-ui="directory"][data-kind="persona"]').click();
                const personId = Object.values(after.personas)[0].id;
                await page.locator(`#fjord-directory [data-ui="inspect"][data-id="${personId}"]`).click();
                assert.ok(await page.locator('#entity-panel').textContent().then(text => text.includes('Productivity') && text.includes('Partner') && text.includes('Physicality')));
                await shot('character');
                await page.locator('[data-personal-history] > summary').click();
                await page.waitForFunction(() => document.querySelector('.personal-history-content')?.textContent.trim().length > 0);
                await page.locator('[data-ui="occupation"]').click();
                assert.equal(await page.locator('[data-ui="choose-occupation"]').count(), 10);
                entry.checks.push('personal data and all ten canonical occupation choices');
                await page.keyboard.press('Escape');
                await page.keyboard.press('Escape');
                await page.locator('button[data-surface="expeditions"]').click();
                assert.equal(await page.locator('#expedition-panel').isVisible(), true);
                await shot('expeditions');
                await page.locator('[data-ui="close-workspace"]').click();
                await page.locator('#fjord-book').click();
                await shot('clan-book');
                entry.checks.push('real expedition controls and Clan Book remain connected');
                if (quality === 'standard') {
                    await page.keyboard.press('Escape');
                    await page.locator('#fjord-menu > summary').click();
                    await page.getByText('Campaign', { exact: true }).click();
                    await page.locator('#fjord-save').click();
                    await page.waitForFunction(() => document.querySelector('#fjord-notice')?.textContent.includes('saved locally'));
                    const saved = await page.evaluate(() => window.__fjordAudit.references.session.saveJSON());
                    await page.locator('#fjord-load').click();
                    await page.waitForFunction(() => document.querySelector('#fjord-notice')?.textContent.includes('Shared campaign loaded, paused.'));
                    assert.equal(await page.evaluate(() => window.__fjordAudit.references.session.saveJSON()), saved);
                    await page.locator('#fjord-menu > summary').click();
                    const tick = await page.evaluate(() => window.__fjordAudit.references.session.readSnapshot().time.tick);
                    await page.getByRole('button', { name: 'Start simulation', exact: true }).click();
                    await page.waitForFunction(tick => window.__fjordAudit.references.session.readSnapshot().time.tick > tick, tick);
                    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
                    assert.equal(await page.evaluate(() => window.__fjordAudit.references.session.running), false);
                    entry.checks.push('exact local save/load and real Start/Pause clock');
                }
            }
            await page.keyboard.press('Escape');
            if (await page.locator('[data-ui="close-card"]').isVisible()) await page.locator('[data-ui="close-card"]').click();
            await page.locator('#fjord-menu > summary').click();
            await page.getByText('Camera views & controls', { exact: true }).click();
            await page.locator('#fjord-view-summit').click();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await shot('highlands');
            entry.checks.push('native highland camera and integrated snow shader');
            assert.deepEqual(evidence.errors, []);
            await writeFile(output + '/observations.json', JSON.stringify(evidence, null, 2) + '\n');
        } catch (error) {
            await page.screenshot({ path: output + '/' + fixtureName + '-failure.jpg', type: 'jpeg' });
            console.log('PAGE', (await page.locator('body').innerText()).slice(-1800));
            throw error;
        } finally { await page.close(); }
    }
    for (const [file, expected] of Object.entries(evidence.sourceHashes)) assert.equal(hash(await readFile(file)), expected);
    evidence.status = 'PASS';
} catch (error) {
    evidence.status = 'FAIL'; evidence.failure = String(error); throw error;
} finally {
    await writeFile(output + '/observations.json', JSON.stringify(evidence, null, 2) + '\n');
    await browser.close();
}
