import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [] };
try {
    const page = await browser.newPage();
    await page.goto(origin + '/docs/qa/rival-visibility/review.html');
    await page.evaluate(async () => {
        const { SharedSettlement } = await import('/src/play/SharedSettlement.ts');
        const { IslandMissionPanel } = await import('/src/fjord-play/IslandMissionPanel.ts?guidance-review=2');
        const saved = await (await fetch('/docs/qa/rival-visibility/visited-review.json')).text();
        const owner = SharedSettlement.restore(saved, 'fjord');
        document.body.innerHTML = '<main class="fjord-stage"><section id="host"></section></main>';
        const panel = new IslandMissionPanel(document.querySelector('#host'), owner.session,
            command => { owner.session.command(command); panel.refresh(); }, () => ({}), () => {}, () => {}, () => {});
        panel.refresh();
        window.guidanceQA = { owner, panel };
    });
    assert.ok((await page.locator('#island-mission-panel').innerText()).includes('away on Explore'));
    assert.equal(await page.locator('[data-island-type="Recon"]').isDisabled(), true);
    assert.equal(await page.locator('[data-island-type="Surveillance"]').isDisabled(), true);
    assert.ok((await page.locator('[data-island-type="Recon"]').getAttribute('title')).includes('home'));
    const before = await page.evaluate(() => guidanceQA.owner.session.readSnapshot());
    await page.locator('[data-island-return]').click();
    const after = await page.evaluate(() => guidanceQA.owner.session.readSnapshot());
    assert.equal(Object.values(after.world.spatial.missions).at(-1).status, 'Returning');
    assert.deepEqual(after.time, before.time);
    assert.deepEqual(after.stocks, before.stocks);
    assert.ok((await page.locator('#island-mission-panel').innerText()).includes('returning home'));
    assert.equal(await page.locator('[data-island-return]').count(), 0);
    await page.evaluate(() => {
        for (let ticks = 0; ticks < 1000; ticks += 10) {
            const state = guidanceQA.owner.session.readSnapshot();
            if (Object.values(state.world.spatial.missions).every(mission => mission.status === 'Returned')) break;
            guidanceQA.owner.session.command({ type: 'AdvanceTicks', ticks: 10 });
        }
        guidanceQA.panel.refresh();
    });
    assert.equal(await page.locator('[data-island-type="Recon"]').isEnabled(), true);
    assert.equal(await page.locator('[data-island-type="Surveillance"]').isDisabled(), true);
    report.checks.push('An away Explore group explains its blocked Recon action and can be recalled from Known places without another charge or elapsed time');
    report.checks.push('Surveillance/Pillage still require a returned successful Recon; no at-site mission conversion is introduced');
    report.checks.push('Actual homecoming enables Recon for the same group without prematurely unlocking Surveillance');
    const save = JSON.parse(await readFile('docs/qa/rival-visibility/visited-review.json', 'utf8'));
    save.pace.running = false;
    await page.addInitScript(save => sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save)), save);
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await page.locator('#fjord-navigation [data-surface="expeditions"]').click();
    await page.locator('[data-island-return]').scrollIntoViewIfNeeded();
    assert.ok((await page.locator('#island-mission-panel').innerText()).includes('away on Explore'));
    await page.screenshot({ path: 'artifacts/island-map/mission-guidance.png' });
    report.checks.push('The production Expeditions workspace displays the explanation and return action');
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile('artifacts/island-map/mission-guidance.json', JSON.stringify(report, null, 2));
    await browser.close();
}
