import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
import { openFjordCampaign, closeFjordMenu } from './fjord-header-controls.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5188';
const output = process.env.QA_OUTPUT || 'artifacts/fine-grained-updates/card';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8'));
fixture.pace.running = false;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(save => sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save)), fixture);
    await page.goto(origin + '/fjord-play');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const result = await page.evaluate(async () => {
        const { personaAge } = await import('/src/simulation/SimulationCore.ts');
        const refs = window.__fjordAudit.references;
        window.__fjordAudit.flags.manualClock = true;
        refs.setPlayback(false);
        refs.shared.select({ kind: 'persona', id: 'founder-1' });
        refs.refresh(); await refs.settle();
        const panel = document.querySelector('#entity-panel');
        const beforeCore = refs.session.saveJSON(), beforeMarkup = panel.innerHTML;
        const beforeBook = JSON.stringify(refs.session.book.snapshot());
        const root = panel.firstElementChild;
        // Observe actual browser parsing at the external DOM boundary, without
        // substituting updateView, the interface, the session or renderer modules.
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        let cardParses = 0;
        Object.defineProperty(Element.prototype, 'innerHTML', { ...descriptor, set(value) {
            if (this instanceof HTMLTemplateElement && String(value).includes('fjord-card-heading')) cardParses++;
            descriptor.set.call(this, value);
        } });
        try {
            for (let i = 0; i < 5; i++) { refs.refresh(); await refs.settle(); }
            const unchanged = { cardParses, exactCore: refs.session.saveJSON() === beforeCore,
                exactBook: JSON.stringify(refs.session.book.snapshot()) === beforeBook,
                sameMarkup: panel.innerHTML === beforeMarkup, sameRoot: panel.firstElementChild === root };
            const details = panel.querySelector('[data-legacy-management]');
            details.open = true;
            await new Promise(resolve => setTimeout(resolve, 0));
            refs.refresh(); await refs.settle();
            const field = panel.querySelector('#occupation');
            const canonicalOccupation = refs.session.readSnapshot().personas['founder-1'].occupation;
            field.value = canonicalOccupation === 'smith' ? 'fisher' : 'smith';
            const edited = field.value;
            field.focus();
            refs.setPlayback(true);
            await refs.advanceTicks(1);
            const preserved = field.value === edited && document.activeElement === field && details.open;
            refs.setPlayback(false);
            field.blur();
            refs.refresh(); await refs.settle();
            const reset = panel.querySelector('#occupation').value === canonicalOccupation;
            const priorAge = refs.session.readSnapshot().time.winter;
            await refs.advanceTicks(1000);
            const aged = refs.session.readSnapshot().time.winter === priorAge + 1 &&
                panel.textContent.includes(personaAge(refs.session.readSnapshot(), 'founder-1') + ' Winters');
            const beforeWork = panel.innerHTML;
            refs.session.command({ type: 'AssignOccupation', personaId: 'founder-1', occupation: 'fisher' });
            refs.refresh(); await refs.settle();
            const occupationFresh = refs.session.readSnapshot().personas['founder-1'].occupation === 'fisher' &&
                panel.innerHTML !== beforeWork && /Fisher/.test(panel.textContent);
            const totals = document.querySelector('#fjord-production-labels').dataset.totals;
            for (let i = 0; i < 3; i++) { refs.refresh(); await refs.settle(); }
            const noDuplicateAwards = JSON.parse(totals || '[]').length > 0 &&
                totals === document.querySelector('#fjord-production-labels').dataset.totals;
            const restored = refs.shared.constructor.restore(refs.shared.persist(), 'fjord');
            const exactRestore = restored.session.saveJSON() === refs.session.saveJSON() &&
                JSON.stringify(restored.session.book.snapshot()) === JSON.stringify(refs.session.book.snapshot());
            return { ...unchanged, preserved, reset, aged, occupationFresh, noDuplicateAwards, exactRestore };
        } finally { Object.defineProperty(Element.prototype, 'innerHTML', descriptor); }
    });
    report.unchanged = result;
    assert.equal(result.cardParses, 0, 'Warmed identical non-editable cards must not allocate and parse another template');
    assert.equal(result.sameMarkup, true);
    assert.equal(result.sameRoot, true);
    assert.equal(result.exactCore, true);
    for (const name of ['exactBook', 'preserved', 'reset', 'aged', 'occupationFresh', 'noDuplicateAwards', 'exactRestore'])
        assert.equal(result[name], true, name);
    report.checks.push('Warmed unchanged resident card retains DOM and exact Core without reparsing HTML');
    report.checks.push('Actual focused form edits/disclosures survive a tick; unfocused paused controls reconcile; age, work and resource feedback remain fresh without duplicate awards');
    // A real import reuses founder IDs and revisions while replacing the world.
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    const imported = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/summer-32.json', 'utf8')).fjord;
    await openFjordCampaign(page);
    await page.locator('#fjord-import').setInputFiles({ name: 'card-review.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(imported)) });
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign imported, paused.');
    await closeFjordMenu(page);
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    const affordability = await page.evaluate(async () => {
        const refs = window.__fjordAudit.references;
        refs.shared.select({ kind: 'household', id: 'founder-1' });
        refs.refresh(); await refs.settle();
        const before = document.querySelector('[data-ui="build"]').disabled;
        refs.session.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
        refs.refresh(); await refs.settle();
        return { before, after: document.querySelector('[data-ui="build"]').disabled,
            canonical: refs.session.saveJSON(), checkpoint: refs.shared.fjord.exportJSON() };
    });
    assert.equal(affordability.before, true);
    assert.equal(affordability.after, false);
    await page.locator('[data-ui="build"]').click();
    await page.waitForFunction(() => Object.keys(window.__fjordAudit.references.session.readSnapshot().buildings).length > 0);
    const built = await page.evaluate(() => window.__fjordAudit.references.session.saveJSON());
    assert.deepEqual(JSON.parse(built), core.applyCommand(core.reconstructState(affordability.canonical),
        { type: 'BuildHouse', householdId: 'founder-1' }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#entity-panel').getByRole('heading', { name: 'Home', exact: true }).count(), 1);
    report.checks.push('Import with reused identities invalidates the card; stock-dependent Build availability updates immediately; the real paid command spends once and the mobile card stays current');
    await page.setViewportSize({ width: 1400, height: 900 });
    await openFjordCampaign(page);
    await page.locator('#fjord-import').setInputFiles({ name: 'card-rollback.json', mimeType: 'application/json',
        buffer: Buffer.from(affordability.checkpoint) });
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign imported, paused.');
    await closeFjordMenu(page);
    const rolledBack = await page.evaluate(async () => {
        const refs = window.__fjordAudit.references;
        refs.shared.select({ kind: 'household', id: 'founder-1' });
        refs.refresh(); await refs.settle();
        return { core: refs.session.saveJSON(), buildEnabled: !document.querySelector('[data-ui="build"]').disabled };
    });
    assert.deepEqual(JSON.parse(rolledBack.core), JSON.parse(affordability.canonical));
    assert.equal(rolledBack.buildEnabled, true);
    report.checks.push('Core and published book survive save/load exactly; actual checkpoint rollback restores the prior tent/action state with reused identities');
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile(output + '/checks.json', JSON.stringify(report, null, 2));
    await browser.close();
}
