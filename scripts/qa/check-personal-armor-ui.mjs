import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
    origin: { type: 'string', default: 'http://127.0.0.1:5204' },
    output: { type: 'string' },
    chrome: { type: 'string' },
    'expect-commit': { type: 'string' },
    help: { type: 'boolean', default: false },
} });
if (values.help) {
    console.log(`Usage: node scripts/qa/check-personal-armor-ui.mjs [options]
  --origin URL         Review server (default http://127.0.0.1:5204)
  --output PATH        Evidence directory, relative to the repository or absolute
  --chrome PATH        Optional Chrome executable; otherwise Playwright Chromium
  --expect-commit SHA  Require this exact served build source commit

Set PILLAGERS_PLAYWRIGHT_MODULE to an installed Playwright module directory when
it is not installed in the repository. No dependencies are installed by this runner.
Prepare the ordinary player-format fixtures with prepare-personal-armor-review.mjs
and serve the built candidate with serve-personal-armor-review.mjs first.`);
    process.exit(0);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = new URL(values.origin).origin;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(root, values.output ?? `scratch/personal-armor-browser/ui-${stamp}`);
const fixtureDirectory = resolve(root, 'scratch/personal-armor-review-333');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const itemNames = ['Iron-tipped Spear', 'Iron-reinforced Shield', 'Iron-reinforced Body Armor', 'Iron Helmet'];
const slots = ['weapon', 'shield', 'bodyArmor', 'headgear'];
const hero = 'founder-1', ally = 'founder-3', group = 'group-2';
const nativeItems = ['equipment/native-iron-spear', 'equipment/native-iron-shield'];
const report = {
    schemaVersion: 1, kind: 'Personal armor public UI journey', status: 'RUNNING',
    startedAt: new Date().toISOString(), origin, output,
    steps: [], pageErrors: [], consoleErrors: [], failedRequests: [], httpErrors: [],
    scope: {
        publicDOMOnly: true, isolatedContexts: true, storageInjection: false,
        desktop: { width: 1366, height: 768, deviceScaleFactor: 1 },
        compactDesktop: { width: 844, height: 390 },
        touch: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
        reducedMotion: 'reduce', quality: 'low', effects: 'off',
    },
    requestFailureScope: 'All request failures are retained. Only requests failing during closure of an owned context are marked as cleanup; none are silently removed.',
    limitations: [
        'UI correctness and factual clothing projection only; geometry fit acceptance is separate.',
        'Touch-emulated Chrome is not a physical iPhone or a phone heat/frame-pacing test.',
        'No CPU/GPU delta, rendering-resource budget or physical-device performance is measured.',
    ],
};
let browser, activePage;
const contexts = new Map();
const closingContexts = new Set();
const pageScopes = new WeakMap();
await mkdir(output, { recursive: true });

function record(step, evidence = {}) {
    report.steps.push({ step, result: 'PASS', ...evidence });
    console.log('PASS ' + step);
}

function campaignFromFile(text) {
    const bridge = JSON.parse(text);
    assert.ok([1, 2].includes(bridge.bridgeVersion), 'Use an ordinary FjordCampaign player export.');
    assert.equal(bridge.sharedVersion, undefined, 'QA files must not use a shared-session wrapper.');
    return { bridge, core: typeof bridge.campaign === 'string' ? JSON.parse(bridge.campaign) : bridge.campaign };
}

function invariantFacts(core) {
    return { time: core.time, rngState: core.rngState, stocks: core.stocks,
        specialistStocks: core.specialistStocks, stored: core.smithery.stored,
        assignments: core.smithery.assignments, targets: core.smithery.targets };
}

function watch(page, label) {
    pageScopes.set(page, 'public-journey');
    page.on('pageerror', error => report.pageErrors.push({ context: label, message: String(error) }));
    page.on('console', message => {
        if (message.type() === 'error') report.consoleErrors.push({ context: label, message: message.text() });
    });
    page.on('requestfailed', request => {
        const duringOwnedCleanup = closingContexts.has(label);
        report.failedRequests.push({ context: label, phase: pageScopes.get(page),
            url: request.url(), reason: request.failure()?.errorText, duringOwnedCleanup,
            ...(duringOwnedCleanup ? { note: 'Observed while closing this runner-owned context.' } : {}),
        });
    });
    page.on('response', response => {
        if (response.status() >= 400) report.httpErrors.push({ context: label,
            url: response.url(), status: response.status() });
    });
}

async function activate(locator, touch = false) {
    await locator.scrollIntoViewIfNeeded();
    if (touch) await locator.tap();
    else await locator.click();
}

async function screenshot(page, name) {
    const file = name + '.png';
    await page.screenshot({ path: join(output, file), animations: 'disabled' });
    return file;
}

async function ready(page) {
    await page.waitForFunction(() => {
        const canvas = document.querySelector('#fjord-canvas');
        try {
            return canvas?.dataset.loading && canvas.dataset.rendered &&
                JSON.parse(canvas.dataset.loading).started > 0 &&
                Array.isArray(JSON.parse(canvas.dataset.rendered));
        }
        catch { return false; }
    }, undefined, { timeout: 240000 });
    await page.locator('#fjord-canvas').waitFor({ state: 'visible' });
}

async function importAtStart(page, fixture, touch) {
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await activate(page.getByRole('button', { name: /^Load game/ }), touch);
    await page.locator('input[type="file"]:visible').setInputFiles(fixture);
    const continueButton = page.getByRole('button', { name: /^Continue campaign/ });
    await continueButton.waitFor({ state: 'visible' });
    await activate(continueButton, touch);
    await ready(page);
}

async function menu(page, open, touch) {
    const details = page.locator('#fjord-menu');
    if (await details.evaluate(element => element.open) !== open)
        await activate(page.locator('#fjord-menu > summary'), touch);
}

async function menuSection(page, childSelector, touch) {
    await menu(page, true, touch);
    const section = page.locator('#fjord-menu details[data-menu-section]')
        .filter({ has: page.locator(childSelector) });
    assert.equal(await section.count(), 1, 'The requested public menu section must be unique.');
    if (!await section.evaluate(element => element.open))
        await activate(section.locator(':scope > summary'), touch);
}

async function lowPresentation(page, touch) {
    await menuSection(page, '#fjord-quality', touch);
    await page.locator('#fjord-quality').selectOption('low');
    await page.locator('#fjord-effects').selectOption('off');
    await menu(page, false, touch);
}

async function openGroupEquipment(page, touch = false) {
    const groupButton = page.locator(`#expedition-panel [data-expedition-group="${group}"]`);
    // Expeditions is a toggle. Do not close an already visible workspace.
    if (!await groupButton.isVisible())
        await activate(page.locator('#fjord-navigation [data-surface="expeditions"]'), touch);
    await groupButton.waitFor({ state: 'visible' });
    if (await groupButton.getAttribute('aria-pressed') !== 'true')
        await activate(groupButton, touch);
    const places = page.locator('#expedition-panel [data-expedition-view="places"]');
    if (await places.getAttribute('aria-pressed') !== 'true') await activate(places, touch);
    await page.locator('#island-mission-panel').waitFor({ state: 'visible' });
    await page.locator(`[data-equipment-person="${hero}"][data-equipment-slot="bodyArmor"]`)
        .waitFor({ state: 'visible' });
}

function slotChoice(page, person, slot) {
    return page.locator(`#island-mission-panel select[data-equipment-person="${person}"]` +
        `[data-equipment-slot="${slot}"]`);
}

async function readSlots(page, person) {
    return page.locator(`#island-mission-panel select[data-equipment-person="${person}"]`)
        .evaluateAll(elements => elements.map(element => ({ slot: element.dataset.equipmentSlot,
            value: element.value, disabled: element.disabled,
            label: element.getAttribute('aria-label'),
            options: Array.from(element.options, option => ({ value: option.value,
                text: option.textContent.trim(), disabled: option.disabled })),
        })));
}

async function assertSlots(page, person, expected, disabled) {
    const actual = await readSlots(page, person);
    assert.deepEqual(actual.map(choice => choice.slot).sort(), [...slots].sort());
    for (const choice of actual) {
        assert.equal(choice.value, expected[choice.slot] ?? '', `${person}: ${choice.slot}`);
        assert.equal(choice.disabled, disabled, `${person}: ${choice.slot} availability`);
        assert.ok(choice.label?.length, 'Every native selector needs its resident and slot label.');
    }
    return actual;
}

async function changeSlot(page, person, slot, item) {
    await slotChoice(page, person, slot).selectOption(item);
    await page.waitForFunction(({ person, slot, item }) => {
        const select = document.querySelector(`select[data-equipment-person="${person}"]` +
            `[data-equipment-slot="${slot}"]`);
        return select?.value === item;
    }, { person, slot, item });
    assert.match(await page.locator('.island-mission-status').textContent(), /Personal equipment updated\./);
}

async function accessibleSlots(page, person, disabled) {
    const boxes = [];
    for (const slot of slots) {
        const control = slotChoice(page, person, slot);
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        const viewport = page.viewportSize();
        assert.ok(box && box.width > 0 && box.height > 0, `${slot} must remain visible.`);
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1,
            `${slot} must fit the viewport horizontally.`);
        assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1,
            `${slot} must be reachable by scrolling.`);
        if (!disabled) await control.click({ trial: true });
        boxes.push({ slot, box });
    }
    const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        coarse: matchMedia('(pointer: coarse)').matches,
        mobile: !!document.querySelector('#fjord-play.fjord-mobile'),
        maxTouchPoints: navigator.maxTouchPoints }));
    assert.ok(dimensions.documentWidth <= dimensions.width + 1, 'The document must not overflow horizontally.');
    return { dimensions, boxes };
}

async function openCharacterCard(page, touch) {
    await menu(page, false, touch);
    await activate(page.locator('[data-stock="settlement"]'), touch);
    await activate(page.locator(`#fjord-directory [data-kind="persona"][data-id="${hero}"]:visible`), touch);
    const assigned = page.locator('#entity-panel section[aria-label="Personal equipment"]');
    await assigned.waitFor({ state: 'visible' });
    const text = await assigned.innerText();
    for (const name of itemNames) assert.ok(text.includes(name), 'Character Card must name ' + name);
    return text;
}

async function exportCampaign(page, filename) {
    await menuSection(page, '#fjord-export', false);
    const pending = page.waitForEvent('download');
    await activate(page.locator('#fjord-export'));
    const download = await pending;
    assert.equal(await download.failure(), null, 'The normal campaign download must finish.');
    const path = join(output, filename);
    await download.saveAs(path);
    await menu(page, false, false);
    const text = await readFile(path, 'utf8');
    return { path, text, ...campaignFromFile(text) };
}

async function reimportCampaign(page, path) {
    pageScopes.set(page, 'public-campaign-reimport');
    await menuSection(page, '#fjord-import', false);
    await page.locator('#fjord-import').setInputFiles(path);
    // The notice is a hidden toast when the menu is open. Read text, never wait for visibility.
    await page.waitForFunction(() => document.querySelector('#fjord-import')?.value === '',
        undefined, { timeout: 240000 });
    const notice = (await page.locator('#fjord-notice').textContent()).trim();
    assert.equal(notice, 'Campaign imported, paused.', 'The public importer must acknowledge success.');
    await menu(page, false, false);
    pageScopes.set(page, 'public-journey');
    return notice;
}

async function newContext(options, label) {
    const context = await browser.newContext({ acceptDownloads: true, deviceScaleFactor: 1,
        reducedMotion: 'reduce', ...options });
    contexts.set(context, label);
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(30000);
    watch(page, label);
    return { context, page };
}

try {
    const fixtures = {};
    for (const name of ['home', 'field']) {
        const path = join(fixtureDirectory, name + '-campaign.json');
        const text = await readFile(path, 'utf8');
        fixtures[name] = { path, text, ...campaignFromFile(text) };
        assert.equal(fixtures[name].core.world?.territory?.version, 1,
            'The review fixture must use on-site combat rules.');
    }
    report.source = {
        runnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
        home: { path: fixtures.home.path, sha256: sha256(fixtures.home.text),
            coreSha256: sha256(JSON.stringify(fixtures.home.core)) },
        field: { path: fixtures.field.path, sha256: sha256(fixtures.field.text),
            coreSha256: sha256(JSON.stringify(fixtures.field.core)) },
    };
    const playwright = createRequire(import.meta.url)(process.env.PILLAGERS_PLAYWRIGHT_MODULE || 'playwright');
    browser = await playwright.chromium.launch({ headless: true, args: ['--mute-audio'],
        ...(values.chrome ? { executablePath: values.chrome } : {}) });

    const desktop = await newContext({ viewport: { width: 1366, height: 768 } }, 'desktop');
    try {
        const { page } = desktop;
        const response = await page.request.get(origin + '/build-info.json');
        assert.ok(response.ok(), 'The served build identity must be available.');
        report.build = await response.json();
        if (values['expect-commit']) {
            assert.equal(report.build.source.commit, values['expect-commit'], 'Served build source commit differs.');
            assert.equal(report.build.source.dirty, false, 'Pinned final browser checks require a clean source build.');
        }
        await writeFile(join(output, 'build-info.json'), JSON.stringify(report.build, null, 2) + '\n');
        await importAtStart(page, fixtures.home.path, false);
        await lowPresentation(page, false);
        record('Normal home file import and Continue campaign');
        await openGroupEquipment(page);
        const source = fixtures.home.core;
        const homeSlots = await assertSlots(page, hero, source.smithery.assignments[hero], false);
        await assertSlots(page, ally, source.smithery.assignments[ally], false);
        record('Home Group 2 exposes four actual personal slots', { slots: homeSlots,
            screenshot: await screenshot(page, '01-home-equipment') });

        for (const slot of ['bodyArmor', 'headgear']) {
            const heroItem = source.smithery.assignments[hero][slot];
            const allyItem = source.smithery.assignments[ally][slot] ?? '';
            if (allyItem) await changeSlot(page, ally, slot, '');
            await changeSlot(page, hero, slot, '');
            await changeSlot(page, ally, slot, heroItem);
            if (allyItem) await changeSlot(page, hero, slot, allyItem);
            assert.equal(await slotChoice(page, ally, slot).inputValue(), heroItem);
            assert.equal(await slotChoice(page, hero, slot).inputValue(), allyItem);
            await changeSlot(page, ally, slot, '');
            if (allyItem) await changeSlot(page, hero, slot, '');
            await changeSlot(page, hero, slot, heroItem);
            if (allyItem) await changeSlot(page, ally, slot, allyItem);
        }
        await assertSlots(page, hero, source.smithery.assignments[hero], false);
        await assertSlots(page, ally, source.smithery.assignments[ally], false);
        record('Body Armor and Headgear transfer independently to the ally and back; hand slots unchanged');

        await activate(page.locator('[data-island-type="Pillage"]'));
        const dialog = page.locator('#island-mission-dialog');
        await dialog.waitFor({ state: 'visible' });
        const offer = await dialog.innerText();
        for (const name of itemNames) assert.ok(offer.includes(name), 'Pillage preview must name ' + name);
        assert.match(offer, /Combat depends on actual present defenders/);
        assert.match(offer, /Combat losses are resolved on site/);
        const offerScreenshot = await screenshot(page, '02-home-pillage-offer');
        await activate(page.locator('#island-mission-dialog [data-island-cancel]'));
        await dialog.waitFor({ state: 'hidden' });
        record('Actual on-site Pillage preview; Back closes it without dispatch',
            { text: offer, screenshot: offerScreenshot });

        const exported = await exportCampaign(page, 'home-ui-roundtrip.json');
        assert.deepEqual(invariantFacts(exported.core), invariantFacts(source),
            'Public assignment roundtrip and cancelled preview must conserve time, RNG, resources and all gear.');
        report.export = { file: 'home-ui-roundtrip.json', sha256: sha256(exported.text),
            coreSha256: sha256(JSON.stringify(exported.core)), formatKeys: Object.keys(exported.bridge) };
        record('Normal campaign download conserves canonical time, RNG, stocks and all gear',
            { facts: invariantFacts(exported.core) });
        const notice = await reimportCampaign(page, exported.path);
        await openGroupEquipment(page);
        await assertSlots(page, hero, source.smithery.assignments[hero], false);
        await assertSlots(page, ally, source.smithery.assignments[ally], false);
        const reexported = await exportCampaign(page, 'home-ui-reimported.json');
        assert.deepEqual(invariantFacts(reexported.core), invariantFacts(source));
        assert.deepEqual(reexported.core, exported.core, 'Reimport must preserve the complete exported canonical state.');
        record('Ordinary in-game file reimport remains paused and preserves the complete exported Core', { notice });

        await page.setViewportSize({ width: 844, height: 390 });
        await openGroupEquipment(page);
        const compact = await accessibleSlots(page, hero, false);
        record('Short desktop viewport retains reachable four-slot controls',
            { ...compact, screenshot: await screenshot(page, '03-compact-desktop-equipment') });
        await page.setViewportSize({ width: 1366, height: 768 });
        const homeCard = await openCharacterCard(page, false);
        assert.match(homeCard, /Iron Helmet stowed while the occupational hat is worn\./);
        record('Home Character Card names four actual items and honest occupational-hat stowage',
            { text: homeCard, screenshot: await screenshot(page, '04-home-character-card') });
    } finally {
        closingContexts.add('desktop');
        pageScopes.set(desktop.page, 'owned-context-cleanup');
        await desktop.context.close();
        contexts.delete(desktop.context);
        activePage = undefined;
    }

    const touch = await newContext({ viewport: { width: 844, height: 390 },
        isMobile: true, hasTouch: true }, 'touch-landscape');
    try {
        const { page } = touch;
        await importAtStart(page, fixtures.field.path, true);
        await lowPresentation(page, true);
        record('Fresh touch context imports ordinary field file through Load game and Continue');
        await openGroupEquipment(page, true);
        const fieldSlots = await assertSlots(page, hero, fixtures.field.core.smithery.assignments[hero], true);
        await assertSlots(page, ally, fixtures.field.core.smithery.assignments[ally], true);
        const touchAccess = await accessibleSlots(page, hero, true);
        assert.equal(touchAccess.dimensions.coarse, true);
        assert.equal(touchAccess.dimensions.mobile, true, 'The application must apply its actual mobile shell.');
        assert.ok(touchAccess.dimensions.maxTouchPoints > 0);
        record('Touch-emulated landscape has four disabled away slots and reachable controls',
            { ...touchAccess, slots: fieldSlots,
                screenshot: await screenshot(page, '05-touch-away-equipment') });

        await page.waitForFunction(id => {
            try {
                const actors = JSON.parse(document.querySelector('#fjord-canvas')?.dataset.rendered ?? '[]');
                return actors.some(actor => actor.kind === 'persona' && actor.id === id &&
                    !actor.placeholder && actor.clothing?.assets?.bodyArmor);
            } catch { return false; }
        }, hero);
        const actor = await page.locator('#fjord-canvas').evaluate((canvas, id) =>
            JSON.parse(canvas.dataset.rendered).find(actor => actor.kind === 'persona' && actor.id === id), hero);
        assert.equal(actor.visible, true);
        assert.equal(actor.clothing.id, 'generic', 'Away gear must use the normal field tunic, not occupational clothes.');
        assert.equal(actor.clothing.assets.outfit, 'garment/meshy-grid-trial-001');
        assert.equal(actor.clothing.assets.headwear, 'headwear/native-iron-helmet');
        assert.equal(actor.clothing.assets.bodyArmor, 'garment/native-iron-body-armor');
        assert.deepEqual([...actor.clothing.assets.equipmentItems].sort(), [...nativeItems].sort());
        assert.deepEqual(actor.equipment, fixtures.field.core.smithery.assignments[hero]);
        await page.waitForFunction(id => {
            try {
                return JSON.parse(document.querySelector('#fjord-canvas')?.dataset.rendered ?? '[]')
                    .some(person => person.kind === 'persona' && person.id === id &&
                        !person.placeholder && person.clothing?.assets?.headwear === 'headwear/native-leather-helmet');
            } catch { return false; }
        }, ally);
        const other = await page.locator('#fjord-canvas').evaluate((canvas, id) =>
            JSON.parse(canvas.dataset.rendered).find(person => person.kind === 'persona' && person.id === id), ally);
        assert.equal(other.clothing.id, 'generic');
        assert.equal(other.clothing.assets.bodyArmor, 'garment/native-leather-body-armor');
        assert.equal(other.clothing.assets.headwear, 'headwear/native-leather-helmet');
        assert.deepEqual(other.equipment, fixtures.field.core.smithery.assignments[ally]);
        record('Public scene DOM projects both actual body and helmet variants with field clothing',
            { rendered: actor, ally: other });

        const fieldCard = await openCharacterCard(page, true);
        assert.doesNotMatch(fieldCard, /stowed/i, 'The away card must not claim home occupational stowage.');
        const portrait = page.locator('#entity-panel .fjord-portrait img');
        await portrait.waitFor({ state: 'visible' });
        await page.waitForFunction(() => {
            const image = document.querySelector('#entity-panel .fjord-portrait img');
            return image?.complete && image.naturalWidth > 0;
        });
        record('Touch Character Card names all four assignments and loads its native portrait',
            { text: fieldCard, screenshot: await screenshot(page, '06-touch-character-card'),
                portrait: await portrait.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight })) });
    } finally {
        closingContexts.add('touch-landscape');
        pageScopes.set(touch.page, 'owned-context-cleanup');
        await touch.context.close();
        contexts.delete(touch.context);
        activePage = undefined;
    }
    assert.deepEqual(report.pageErrors, [], 'No uncaught page errors are allowed.');
    assert.deepEqual(report.consoleErrors, [], 'Unexpected browser console errors must be investigated.');
    assert.deepEqual(report.httpErrors, [], 'Unexpected HTTP failures must not be hidden by the harness.');
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = { message: String(error), stack: error.stack };
    process.exitCode = 1;
    if (activePage && !activePage.isClosed()) {
        report.failure.visibleText = await activePage.locator('body').innerText().catch(() => undefined);
        await activePage.screenshot({ path: join(output, 'failure.png'), timeout: 15000 }).catch(() => {});
    }
    console.error(error);
} finally {
    for (const [context, label] of contexts) {
        closingContexts.add(label);
        for (const page of context.pages()) pageScopes.set(page, 'owned-context-cleanup');
        await context.close().catch(() => {});
    }
    await browser?.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('Evidence: ' + output);
}
