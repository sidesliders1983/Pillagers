import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8'));
fixture.target = 'fjord';
fixture.pace.running = false;
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => sessionStorage.setItem('pillagers.fjord-play.active.v1', value), JSON.stringify(fixture));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5190') + '/fjord-play');
    await page.waitForFunction(() => window.__fjordAudit && document.querySelector('#fjord-canvas')?.dataset.ready);
    await page.evaluate(() => {
        const refs = window.__fjordAudit.references;
        refs.setPlayback(false);
        const gate = { seen: [], selections: [], first: true };
        gate.wait = new Promise(resolve => { gate.release = resolve; });
        window.__fjordReadConsistency = gate;
        const sync = refs.layer.sync.bind(refs.layer);
        refs.layer.sync = async (...args) => {
            if (gate.first) { gate.first = false; await gate.wait; }
            return sync(...args);
        };
        const setLit = refs.campfireEffect.setLit.bind(refs.campfireEffect);
        refs.campfireEffect.setLit = lit => { gate.seen.push(lit); return setLit(lit); };
        const selection = refs.shared.selectionPresentation.bind(refs.shared);
        refs.shared.selectionPresentation = (...args) => {
            gate.selections.push((args[0] || refs.session.readSnapshot()).campfire.lit);
            return selection(...args);
        };
        refs.session.command({ type: 'SetCampfire', lit: true });
        refs.refresh();
        refs.session.command({ type: 'SetCampfire', lit: false });
        refs.refresh();
        gate.release();
    });
    await page.waitForFunction(() => window.__fjordReadConsistency.seen.length >= 2);
    const result = await page.evaluate(() => ({ seen: window.__fjordReadConsistency.seen,
        selections: window.__fjordReadConsistency.selections,
        canonical: window.__fjordAudit.references.session.saveJSON(),
        placeholders: window.__fjordAudit.references.layer.describe().filter(entity => entity.placeholder).map(entity => entity.key) }));
    const expected = core.applyCommand(core.applyCommand(fixture.fjord.campaign,
        { type: 'SetCampfire', lit: true }), { type: 'SetCampfire', lit: false });
    const output = process.env.QA_OUTPUT || 'docs/qa/fjord-runtime-improvements/168';
    await mkdir(output, { recursive: true });
    const record = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        expectedFireRevisions: [true, false], actualFireRevisions: result.seen.slice(0, 2),
        actualSelectionRevisions: result.selections, placeholders: result.placeholders, errors,
        canonicalReplayEqual: JSON.stringify(expected) === result.canonical,
        canonicalSha256: createHash('sha256').update(result.canonical).digest('hex') };
    await writeFile(output + '/read-consistency.json', JSON.stringify(record, null, 2) + '\n');
    assert.deepEqual(record.actualFireRevisions, record.expectedFireRevisions, 'Each async scene must use its captured revision');
    assert.deepEqual(record.actualSelectionRevisions.slice(-2), [true, false], 'Labels must use the same captured scene revisions');
    assert.equal(record.canonicalReplayEqual, true);
    assert.deepEqual(record.placeholders, []);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(record));
} finally { await browser.close(); }
