import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Native-browser acceptance evidence, separate from the historical card-based runner.
// Run each size independently: node scripts/qa/check-anchored-basics.mjs desktop|touch|portrait [--arrival-only]
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const variant = process.argv[2] || 'desktop';
const arrivalOnly = process.argv.includes('--arrival-only');
assert.ok(['desktop', 'touch', 'portrait'].includes(variant), 'Use desktop, touch or portrait as the run argument.');
assert.ok(variant !== 'portrait' || arrivalOnly, 'Portrait is a focused arrival review; add --arrival-only.');
const mobile = variant !== 'desktop';
const viewport = variant === 'portrait' ? { width: 390, height: 844 } :
    mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 };
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const origin = (process.env.QA_ORIGIN || 'http://127.0.0.1:5195').replace(/\/$/, '');
const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
const output = path.resolve(process.env.QA_OUTPUT || path.join(repositoryRoot,
    'scratch/onboarding-ui-basics-325', `${arrivalOnly ? 'arrival' : 'anchored'}-browser-${variant}-${stamp}-${process.pid}`));
const git = process.env.QA_GIT || (process.platform === 'win32'
    ? 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe'
    : 'git');
const sourcePaths = [
    'src/fjord-play/FirstStepsGuide.ts', 'src/fjord-play/FirstStepsTour.ts',
    'src/fjord-play/FirstStepsState.ts', 'src/fjord-play/JourneyProgress.ts',
    'src/fjord-play/FoundingJourney.ts', 'src/fjord-play/FjordInterface.ts',
    'src/fjord-play/FjordPlay.ts', 'src/fjord-play/FjordHeader.ts',
    'src/fjord-play/CampaignPlayback.ts', 'src/fjord-play/IslandLoading.ts',
    'src/lore/FoundingBookWindow.ts', 'src/fjord-play/island-loading.css', 'src/fjord-play/first-steps.css',
    'src/fjord-play/first-steps-tour.css', 'scripts/qa/check-anchored-basics.mjs',
];
const hash = value => createHash('sha256').update(value).digest('hex');
const gitRead = args => execFileSync(git, args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async source =>
    [source, hash(await readFile(path.join(repositoryRoot, source)))])));

// A run always owns a newly created directory. Reusing QA_OUTPUT is an error.
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const temporaryDirectory = path.join(output, 'tmp');
await mkdir(temporaryDirectory);
process.env.TEMP = temporaryDirectory;
process.env.TMP = temporaryDirectory;
process.env.TMPDIR = temporaryDirectory;
const report = {
    schemaVersion: 1, variant, viewport, scope: arrivalOnly ? 'arrival-handoff' : 'anchored-tour', origin, startedUtc: new Date().toISOString(),
    initialGitRevision: gitRead(['rev-parse', 'HEAD']),
    initialGitStatus: gitRead(['status', '--porcelain=v1', '--untracked-files=no']),
    initialSourceSHA256: await sourceHashes(), status: 'running', stages: [],
    targetTransitions: [], observations: [], screenshots: [], errors: [], dialogs: [],
    launch: { headless: true, chromiumSandbox: true, renderingOverride: false,
        executablePath: process.env.QA_CHROME || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' },
    seams: ['Read the persisted public campaign envelope from sessionStorage.',
        'Use actual controls, native pointer/touch input and real file import.',
        'Explicit scrollIntoViewIfNeeded is programmatic DOM scrolling of the real card, not a physical touch gesture.',
        'Temporarily hide the marked live DOM anchor and dispatch its public layout event; restore it afterward.'],
    limits: ['Chrome touch emulation is not physical iPhone Safari acceptance.',
        'No uncoached human playtest, owner approval or private session command is used.'],
};
const save = () => writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
await save();
let browser, context, page;
let screenshotIndex = 0;
let previousTarget;
const orientationIds = ['ui-camera', 'ui-resident', 'ui-connections', 'ui-home', 'ui-time', 'ui-navigation'];
const canonical = data => JSON.stringify(data.fjord.campaign);
const snapshot = () => page.evaluate(() => {
    const value = sessionStorage.getItem('pillagers.fjord-play.active.v1');
    return value ? JSON.parse(value) : null;
});
const activate = locator => mobile ? locator.tap() : locator.click();
const next = () => activate(page.locator('#fjord-basics-callout [data-basics="next"]'));
const settled = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
const escapeXML = value => String(value).replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));

async function ready(previousAttempt) {
    await page.waitForFunction(previous => {
        const canvas = document.querySelector('#fjord-canvas');
        if (canvas?.dataset.ready !== 'true' || document.body.classList.contains('island-preparing')) return false;
        if (!previous) return true;
        const diagnostics = JSON.parse(canvas.dataset.loadDiagnostics || '{}');
        return diagnostics.attempt !== previous && diagnostics.outcome === 'playable';
    }, previousAttempt, { timeout: 180000 });
}

async function waitModel(step, phase) {
    await page.waitForFunction(({ step, phase }) => {
        const callout = document.querySelector('#fjord-basics-callout');
        return callout && !callout.closest('[hidden]') && callout.dataset.step === step &&
            (!phase || callout.dataset.phase === phase);
    }, { step, phase });
    await settled();
}

async function paused() {
    assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
}

async function geometry(label, allowFallback = false) {
    await settled();
    const observation = await page.evaluate(() => {
        const visible = element => !!element && !element.closest('[hidden]') &&
            getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0;
        const rect = element => {
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height,
                right: box.right, bottom: box.bottom };
        };
        const callout = document.querySelector('#fjord-basics-callout');
        if (!visible(callout)) return { visible: false };
        const source = callout.dataset.anchorSource;
        let targets = [];
        try { targets = source ? [...document.querySelectorAll(source)] : []; } catch { /* Report an invalid selector. */ }
        const target = targets.length === 1 ? targets[0] : null;
        const halo = document.querySelector('#fjord-basics-tour .basics-target-halo');
        const arrow = document.querySelector('#fjord-basics-tour .basics-target-arrow');
        const haloVisible = visible(halo), arrowVisible = visible(arrow);
        const targetRect = target ? rect(target) : null;
        const haloRect = haloVisible ? rect(halo) : null;
        const calloutRect = rect(callout);
        const chip = document.querySelector('#fjord-basics-chip');
        const chipRect = visible(chip) ? rect(chip) : null;
        const chipHit = chipRect ? document.elementFromPoint(chipRect.x + chipRect.width / 2,
            chipRect.y + chipRect.height / 2) : null;
        const viewport = visualViewport;
        const bounds = { x: viewport?.offsetLeft ?? 0, y: viewport?.offsetTop ?? 0,
            right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth),
            bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) };
        const inBounds = box => box && box.x >= bounds.x - 1 && box.y >= bounds.y - 1 &&
            box.right <= bounds.right + 1 && box.bottom <= bounds.bottom + 1;
        const overlap = (a, b) => a && b ?
            Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)) : null;
        // The canvas fills the world; the marked edge halo is its protected anchor zone.
        const protectedRect = target?.id === 'fjord-canvas' ? haloRect : targetRect;
        const hit = targetRect ? document.elementFromPoint(targetRect.x + targetRect.width / 2,
            targetRect.y + targetRect.height / 2) : null;
        const buttons = [...document.querySelectorAll('#fjord-basics-tour button')].filter(visible)
            .map(button => ({ label: button.textContent.trim(), ...rect(button) }));
        return { visible: true, step: callout.dataset.step, phase: callout.dataset.phase,
            complete: callout.dataset.complete === 'true', source, targetCount: targets.length,
            target: target ? { id: target.id, tag: target.tagName, ui: target.dataset.ui,
                kind: target.dataset.kind, entityId: target.dataset.id } : null,
            targetRect, haloRect, calloutRect, chipRect, bounds,
            targetOverlap: overlap(calloutRect, protectedRect),
            calloutChipOverlap: overlap(calloutRect, chipRect),
            chipCentreReceivesInput: !!chip && (chip === chipHit || chip.contains(chipHit)),
            chipHitElement: chipHit?.id || chipHit?.tagName,
            calloutInBounds: inBounds(calloutRect), chipInBounds: inBounds(chipRect),
            haloInBounds: !haloVisible || inBounds(haloRect),
            haloVisible, arrowVisible, haloPointerEvents: halo ? getComputedStyle(halo).pointerEvents : null,
            arrowPointerEvents: arrow ? getComputedStyle(arrow).pointerEvents : null,
            targetCentreReceivesInput: !!target && (target === hit || target.contains(hit)),
            hitElement: hit?.id || hit?.tagName, buttons, text: callout.innerText,
            fallback: callout.dataset.anchor === 'fallback' || !target };
    });
    observation.label = label;
    report.observations.push(observation);
    if (observation.visible && observation.target) {
        const identity = JSON.stringify([observation.step, observation.phase, observation.target]);
        if (identity !== previousTarget) report.targetTransitions.push({ label,
            step: observation.step, phase: observation.phase, target: observation.target });
        previousTarget = identity;
    }
    await save();
    if (!observation.visible) return observation;
    assert.ok(observation.calloutInBounds, `${label}: callout outside viewport`);
    assert.ok(observation.haloInBounds, `${label}: halo outside viewport`);
    assert.ok(observation.buttons.every(button => button.width >= 43.9 && button.height >= 43.9),
        `${label}: tour button smaller than 44 × 44px`);
    assert.ok(observation.chipRect && observation.chipRect.width >= 43.9 && observation.chipRect.height >= 43.9,
        `${label}: Journey chip must retain its full 44px target`);
    assert.ok(observation.chipInBounds, `${label}: Journey chip outside viewport`);
    assert.ok(observation.calloutChipOverlap <= .1, `${label}: callout covers the Journey chip`);
    assert.ok(observation.chipCentreReceivesInput, `${label}: Journey chip centre is intercepted`);
    assert.equal(observation.haloPointerEvents, 'none', `${label}: halo intercepts input`);
    assert.equal(observation.arrowPointerEvents, 'none', `${label}: arrow intercepts input`);
    if (!allowFallback) {
        assert.equal(observation.targetCount, 1, `${label}: live anchor ref must identify exactly one DOM target`);
        assert.ok(observation.haloVisible && observation.arrowVisible, `${label}: halo/arrow missing`);
        assert.ok(observation.targetOverlap <= .1, `${label}: callout covers its highlighted target`);
        assert.ok(observation.targetCentreReceivesInput, `${label}: actual target centre is intercepted`);
    } else {
        assert.ok(observation.fallback || observation.targetCentreReceivesInput,
            `${label}: missing anchor did not produce a usable fallback`);
    }
    return observation;
}

async function capture(label, annotation = true) {
    const name = `${String(++screenshotIndex).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const raw = await page.screenshot({ path: path.join(output, `${name}.png`) });
    const item = { label, raw: `${name}.png` };
    if (annotation) {
        const current = report.observations.at(-1);
        const image = await sharp(raw).metadata();
        const rectangle = (box, colour) => box ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="${colour}" stroke-width="3"/>` : '';
        const description = current?.visible ? `${current.step}/${current.phase} · ${current.source || 'fallback'}` : 'Tour hidden / paused entry';
        const svg = `<svg width="${image.width}" height="${image.height}" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="${Math.min(image.width - 16, 700)}" height="28" rx="5" fill="#071920"/><text x="16" y="27" fill="#f4f8fa" font-size="14" font-family="sans-serif">QA annotation · ${escapeXML(description)}</text>${rectangle(current?.haloRect, '#a9edff')}${rectangle(current?.calloutRect, '#d8ae60')}${rectangle(current?.chipRect, '#cbe9a0')}</svg>`;
        item.annotated = `${name}-annotated.png`;
        await sharp(raw).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(output, item.annotated));
    }
    report.screenshots.push(item);
    await save();
}

async function stage(name, action) {
    const started = Date.now();
    try {
        const result = await action();
        report.stages.push({ name, status: 'passed', elapsedMs: Date.now() - started, result });
        console.log(`PASS ${variant} ${name}`);
        await save();
        return result;
    } catch (error) {
        report.stages.push({ name, status: 'failed', elapsedMs: Date.now() - started, error: error.message });
        throw error;
    }
}

async function observeArrival() {
    await page.evaluate(() => {
        const review = window.__arrivalReview = {
            samples: [], violations: [], firstArrivalAt: null, renderedFrames: 0,
            invitationAt: null, running: true,
        };
        const visible = element => {
            if (!element || !element.getClientRects().length) return false;
            for (let current = element; current; current = current.parentElement) {
                const style = getComputedStyle(current);
                if (current.hidden || style.display === 'none' || style.visibility === 'hidden' ||
                    style.visibility === 'collapse' || style.opacity === '0') return false;
            }
            return true;
        };
        const sample = source => {
            const loading = document.querySelector('#island-loading');
            const arriving = !!loading?.classList.contains('island-loading-arrival');
            if (arriving && review.firstArrivalAt === null) review.firstArrivalAt = performance.now();
            if (review.firstArrivalAt === null) return;
            if (arriving && source === 'animation-frame') review.renderedFrames++;
            const guide = document.querySelector('[data-guide="guide"]');
            const explore = document.querySelector('[data-guide="explore"]');
            const invitation = visible(guide) && visible(explore) && !visible(loading);
            const unwanted = {
                progress: visible(document.querySelector('#island-loading .island-load-progress')),
                title: visible(document.querySelector('#island-loading-status')),
                eyebrow: visible(document.querySelector('#island-loading .island-loading-eyebrow')),
                help: visible(document.querySelector('#island-loading .island-loading-help')),
                back: visible(document.querySelector('#island-loading-cancel')),
                retry: visible(document.querySelector('#island-loading-retry')),
                foundingBook: !!document.querySelector('#loading-clan-book'),
            };
            const buttons = [...(loading?.querySelectorAll('button') ?? [])].filter(visible)
                .map(button => button.textContent.trim());
            const unexpectedButtons = buttons.filter(label => label !== 'Skip camera arrival');
            const skip = document.querySelector('#island-loading-skip');
            const bounds = skip?.getBoundingClientRect();
            const skipHit = bounds ? document.elementFromPoint(bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2) : null;
            const skipControl = arriving ? {
                visible: visible(skip), rect: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width,
                    height: bounds.height, right: bounds.right, bottom: bounds.bottom } : null,
                inBounds: !!bounds && bounds.x >= 0 && bounds.y >= 0 &&
                    bounds.right <= innerWidth && bounds.bottom <= innerHeight,
                centreReceivesInput: !!skip && (skip === skipHit || skip.contains(skipHit)),
            } : null;
            const badSkip = arriving && (!skipControl.visible || !skipControl.inBounds ||
                !skipControl.centreReceivesInput || skipControl.rect.width < 44 || skipControl.rect.height < 44);
            const item = { at: performance.now(), source, arriving, invitation,
                renderedFrames: review.renderedFrames, unwanted, visibleLoadingButtons: buttons, skipControl,
                camera: document.querySelector('#fjord-canvas')?.dataset.camera,
                ready: document.querySelector('#fjord-canvas')?.dataset.ready };
            if (review.samples.length < 256) review.samples.push(item);
            if (Object.values(unwanted).some(Boolean) || unexpectedButtons.length || badSkip)
                if (review.violations.length < 32) review.violations.push({ ...item, unexpectedButtons });
            if (invitation && review.invitationAt === null) review.invitationAt = performance.now();
        };
        const observer = new MutationObserver(() => sample('mutation'));
        observer.observe(document.body, { subtree: true, childList: true, attributes: true,
            attributeFilter: ['class', 'hidden', 'open', 'aria-hidden', 'data-stage'] });
        const frame = () => {
            if (!review.running) return;
            sample('animation-frame');
            review.frame = requestAnimationFrame(frame);
        };
        review.stop = () => {
            review.running = false;
            observer.disconnect();
            cancelAnimationFrame(review.frame);
        };
        review.frame = requestAnimationFrame(frame);
    });
}

async function arriveAtInvitation() {
    await page.waitForFunction(() => window.__arrivalReview?.firstArrivalAt !== null,
        undefined, { timeout: 180000, polling: 20 });
    const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!reduced) {
        await page.waitForFunction(() => window.__arrivalReview.renderedFrames > 0 &&
            performance.now() - window.__arrivalReview.firstArrivalAt >= 750,
            undefined, { timeout: 20000, polling: 20 });
        assert.equal(await page.locator('#island-loading.island-loading-arrival').isVisible(), true,
            'The arrival screenshot must come from the real camera movement, not a recreated state.');
        await capture('actual-camera-arrival', false);
    } else report.arrivalCaptureLimit = 'Reduced motion can complete before a screenshot; mutation evidence is retained.';
    await page.locator('[data-guide="guide"]').waitFor({ timeout: 180000 });
    await page.locator('[data-guide="explore"]').waitFor();
    await ready();
    await settled();
    report.arrival = await page.evaluate(() => {
        window.__arrivalReview.stop();
        const { stop, frame, ...review } = window.__arrivalReview;
        return review;
    });
    assert.ok(report.arrival.firstArrivalAt !== null, 'The actual arrival lifecycle was observed.');
    if (!reduced) assert.ok(report.arrival.renderedFrames > 0, 'Actual camera-arrival frames were observed.');
    assert.deepEqual(report.arrival.violations, [], 'Loading progress, Back, title or founding book leaked into arrival.');
    assert.ok(report.arrival.invitationAt >= report.arrival.firstArrivalAt,
        'The next handoff is the direct Guide me / Explore invitation.');
    assert.equal(await page.locator('#loading-clan-book').count(), 0,
        'The founding book must not reopen between camera arrival and the invitation.');
    assert.equal(await page.locator('#island-loading').count(), 0);
    report.invitationControls = await page.evaluate(() => ['guide', 'explore'].map(action => {
        const button = document.querySelector(`[data-guide="${action}"]`);
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { action, disabled: button.disabled, text: button.textContent.trim(),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                right: rect.right, bottom: rect.bottom },
            inBounds: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
            centreReceivesInput: button === hit || button.contains(hit) };
    }));
    assert.ok(report.invitationControls.every(control => !control.disabled && control.inBounds &&
        control.centreReceivesInput && control.rect.width > 0 && control.rect.height > 0),
    'Both Guide me and Explore on my own must be visible, enabled and reachable at the handoff.');
    await paused();
}

async function openHelp() {
    if (await page.locator('#fjord-menu').evaluate(element => element.open))
        await activate(page.locator('#fjord-menu [data-menu-close]'));
    if (mobile) await activate(page.locator('#fjord-mobile-menu'));
    await activate(page.locator('#fjord-first-steps'));
}

async function menuSection(label) {
    const menu = page.locator('#fjord-menu');
    if (!await menu.evaluate(element => element.open)) await activate(menu.locator(':scope > summary'));
    const section = menu.locator('[data-menu-section]').filter({
        has: page.locator('summary').filter({ hasText: label }),
    }).first();
    if (!await section.evaluate(element => element.open)) await activate(section.locator(':scope > summary'));
}

async function inspectDirectoryScroll() {
    const target = page.locator('[data-basics-target]');
    const scrollable = await target.evaluate(element => {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const overflow = getComputedStyle(parent).overflowY;
            if (['auto', 'scroll'].includes(overflow) && parent.scrollHeight > parent.clientHeight + 4) {
                parent.dataset.qaBasicsScroll = 'true';
                return { before: parent.scrollTop, maximum: parent.scrollHeight - parent.clientHeight,
                    id: parent.id, className: parent.className };
            }
        }
        return null;
    });
    if (!scrollable) {
        report.scrollEvidence = { exercised: false, limitation: 'No overflowing ancestor of the real resident target exists at this viewport.' };
        return;
    }
    const owner = page.locator('[data-qa-basics-scroll]');
    try {
        const after = await owner.evaluate((element, before) => {
            element.scrollTop = before < 24 ? 48 : 0;
            return element.scrollTop;
        }, scrollable.before);
        report.scrollEvidence = { ...scrollable, after, exercised: after !== scrollable.before };
        assert.ok(report.scrollEvidence.exercised, 'The real scroll owner did not move.');
        await geometry('directory-scroll-reanchors', true);
        await capture('directory-scroll-reanchors');
    } finally {
        await owner.evaluate((element, before) => {
            element.scrollTop = before;
            delete element.dataset.qaBasicsScroll;
        }, scrollable.before);
    }
    await geometry('directory-scroll-restored');
}

async function openResident(inspectScroll = false) {
    await activate(page.locator('[data-stock="settlement"]'));
    const workspace = page.locator('#fjord-workspace');
    await workspace.waitFor();
    const residents = workspace.locator('[data-ui="directory"][data-kind="persona"]');
    if (await residents.getAttribute('aria-pressed') !== 'true') await activate(residents);
    const markedRow = page.locator('.fjord-directory-list [data-basics-target][data-kind="persona"]');
    const row = await markedRow.count() ? markedRow : workspace.locator('.fjord-directory-list [data-kind="persona"]').first();
    await geometry('real-resident-list-target');
    await capture('real-resident-list-target');
    if (inspectScroll) await inspectDirectoryScroll();
    const id = await row.getAttribute('data-id');
    await activate(row);
    await page.locator('#entity-panel .fjord-relations').waitFor();
    return id;
}

function laterChapterFacts(progress) {
    const { status, collapsed, journey, ...facts } = progress;
    if (!journey) return facts;
    const { chapter, selected, orientation, tour, skipped, later, ...journeyFacts } = journey;
    return { ...facts, journey: { ...journeyFacts,
        skipped: skipped.filter(id => !orientationIds.includes(id)),
        later: later.filter(id => !orientationIds.includes(id)) } };
}

try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
        executablePath: report.launch.executablePath });
    report.browser = browser.version();
    context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: mobile,
        isMobile: mobile, reducedMotion: arrivalOnly ? 'no-preference' : mobile ? 'reduce' : 'no-preference' });
    await context.addInitScript(() => localStorage.setItem('fjordside.entry-motion', 'off'));
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('dialog', async dialog => {
        report.dialogs.push({ type: dialog.type(), message: dialog.message() });
        if (dialog.type() === 'confirm') await dialog.accept();
        else await dialog.dismiss();
    });
    let originalCore;
    await stage(arrivalOnly ? 'clean camera arrival leads directly to paused guidance choice' :
        'real New game and Guide me keep the first frame paused', async () => {
        await page.goto(`${origin}/fjord-play?debugLifecycle=1`);
        await observeArrival();
        await activate(page.getByRole('button', { name: 'New game', exact: true }));
        await activate(page.locator('[data-entry="new"]'));
        await arriveAtInvitation();
        await paused();
        const initial = await snapshot();
        originalCore = canonical(initial);
        report.seed = initial.fjord.campaign.seed;
        report.initialCoreSHA256 = hash(originalCore);
        await capture('paused-invitation', false);
        if (arrivalOnly && mobile) {
            await activate(page.locator('[data-guide="explore"]'));
            assert.equal(await page.locator('#fjord-basics-tour').isVisible(), false);
            assert.equal((await snapshot()).fjord.firstSteps.status, 'skipped');
            await capture('explore-remains-paused', false);
        } else {
            await activate(page.locator('[data-guide="guide"]'));
            await waitModel('ui-camera');
            assert.equal(await page.locator('#fjord-first-steps-card').isVisible(), false);
            await geometry('camera-initial');
            await capture('camera-initial');
        }
        await paused();
        assert.equal(canonical(await snapshot()), originalCore);
        return { seed: report.seed, coreSHA256: report.initialCoreSHA256, paused: true };
    });
    if (!arrivalOnly) {
        await stage('camera gesture or deliberate acknowledgment moves the real anchor', async () => {
            if (mobile) await next();
            else {
                const box = await page.locator('#fjord-canvas').boundingBox();
                const start = { x: box.x + box.width * .45, y: box.y + box.height * .65 };
                const clear = await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.id === 'fjord-canvas', start);
                assert.ok(clear, 'The actual camera gesture start must be free of UI.');
                await page.mouse.move(start.x, start.y); await page.mouse.down();
                await page.mouse.move(start.x + 60, start.y + 20, { steps: 6 }); await page.mouse.up();
            }
            await waitModel('ui-resident', 'entry');
            await geometry('camera-to-resident-entry'); await capture('resident-entry');
            assert.equal(canonical(await snapshot()), originalCore);
        });
        await stage('Show me reveals an entry without pretending the player inspected a resident', async () => {
            const before = await snapshot();
            await activate(page.locator('#fjord-basics-callout [data-basics="show"]'));
            assert.equal(await page.locator('#entity-panel .fjord-relations').isVisible(), false);
            assert.deepEqual((await snapshot()).fjord.firstSteps.journey.orientation,
                before.fjord.firstSteps.journey.orientation);
            assert.equal(canonical(await snapshot()), originalCore);
            if (await page.locator('#fjord-workspace').isVisible())
                await activate(page.locator('#fjord-workspace [data-ui="close-workspace"]'));
            await waitModel('ui-resident', 'entry');
            await geometry('show-me-does-not-inspect');
        });
        await stage('Back and invisible-anchor fallback preserve progress', async () => {
            const before = await snapshot();
            await activate(page.locator('#fjord-basics-callout [data-basics="back"]'));
            await waitModel('ui-camera');
            assert.deepEqual((await snapshot()).fjord.firstSteps.journey.orientation,
                before.fjord.firstSteps.journey.orientation);
            await next(); await waitModel('ui-resident', 'entry');
            await page.locator('[data-basics-target]').evaluate(element => {
                element.dataset.qaPreviousStyle = element.getAttribute('style') ?? '';
                element.dataset.qaHiddenAnchor = 'true';
                element.style.setProperty('display', 'none', 'important');
                document.dispatchEvent(new Event('fjord-layout-change'));
            });
            try {
                await geometry('invisible-anchor-fallback', true); await capture('invisible-anchor-fallback');
                assert.equal(canonical(await snapshot()), originalCore);
            } finally {
                await page.locator('[data-qa-hidden-anchor]').evaluate(element => {
                    element.setAttribute('style', element.dataset.qaPreviousStyle);
                    delete element.dataset.qaPreviousStyle; delete element.dataset.qaHiddenAnchor;
                    document.dispatchEvent(new Event('fjord-layout-change'));
                });
            }
            await geometry('anchor-restored');
        });
        await stage('actual Settlement row opens the card and targets its real close control', async () => {
            const id = await openResident(true);
            await waitModel('ui-resident', 'card');
            await geometry('real-resident-card'); await capture('real-resident-card');
            const alternate = mobile ? { width: 390, height: 844 } : { width: 844, height: 390 };
            await page.setViewportSize(alternate); await geometry('card-resize-reflow'); await capture('card-resize-reflow');
            await page.setViewportSize(viewport); await geometry('card-size-restored');
            await next(); await waitModel('ui-resident', 'close');
            await geometry('actual-card-close'); await capture('actual-card-close');
            await activate(page.locator('#entity-panel [data-ui="close-card"]'));
            await waitModel('ui-connections', 'entry');
            assert.ok((await snapshot()).fjord.firstSteps.journey.orientation.includes('ui-resident'));
            assert.equal(canonical(await snapshot()), originalCore);
            return { residentId: id };
        });
        await stage('real household link result closes through the existing panel', async () => {
            await openResident();
            const link = page.locator('#entity-panel .fjord-relations [data-kind="household"]').first();
            await link.waitFor();
            const scrollOffsets = () => link.evaluate(element => {
                const offsets = [];
                for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                    if (parent.scrollHeight > parent.clientHeight + 1) offsets.push({
                        id: parent.id, className: parent.className, scrollTop: parent.scrollTop,
                        clientHeight: parent.clientHeight, scrollHeight: parent.scrollHeight,
                        overflowY: getComputedStyle(parent).overflowY,
                    });
                }
                return offsets;
            });
            const beforeScroll = await scrollOffsets();
            const scrollProbe = await link.evaluate(element => {
                for (let owner = element.parentElement; owner; owner = owner.parentElement) {
                    if (!['auto', 'scroll'].includes(getComputedStyle(owner).overflowY) ||
                        owner.scrollHeight <= owner.clientHeight + 1) continue;
                    const before = owner.scrollTop;
                    const maximum = owner.scrollHeight - owner.clientHeight;
                    owner.scrollTop = before < maximum ? Math.min(maximum, before + 48) : Math.max(0, before - 48);
                    return { id: owner.id, before, after: owner.scrollTop, maximum };
                }
                return null;
            });
            if (scrollProbe) await geometry('connection-programmatic-scroll-probe', true);
            const beforeReveal = await scrollOffsets();
            await link.scrollIntoViewIfNeeded();
            const afterScroll = await scrollOffsets();
            const overflowExists = beforeScroll.some(owner => ['auto', 'scroll'].includes(owner.overflowY));
            report.connectionScrollEvidence = {
                mechanism: 'Programmatic DOM scroll probe followed by Playwright scrollIntoViewIfNeeded on the real card; not a physical touch gesture.',
                before: beforeScroll, probe: scrollProbe, beforeReveal, after: afterScroll, overflowExists,
                revealMoved: afterScroll.some((owner, index) => owner.scrollTop !== beforeReveal[index]?.scrollTop),
                exercised: !!scrollProbe && scrollProbe.after !== scrollProbe.before ||
                    afterScroll.some((owner, index) => owner.scrollTop !== beforeScroll[index]?.scrollTop),
            };
            if (overflowExists) assert.ok(report.connectionScrollEvidence.exercised,
                'The real overflowing card must show an actual programmatic scroll offset change.');
            const connectionAnchor = await geometry('household-link-after-real-scroll');
            assert.equal(connectionAnchor.target?.kind, 'household',
                'The connection callout must identify the actual visible household link after scrolling.');
            await capture('household-link-after-real-scroll');
            await activate(link);
            await page.locator('#entity-panel .fjord-home-residents').waitFor();
            await waitModel('ui-connections', 'result');
            await geometry('household-result'); await capture('household-result');
            await activate(page.locator('#entity-panel [data-ui="close-card"]'));
            await waitModel('ui-home');
            assert.equal(canonical(await snapshot()), originalCore);
        });
        await stage('actual Map opens and closes without revealing or advancing Core', async () => {
            await geometry('map-entry'); await capture('map-entry');
            await activate(page.locator('#fjord-map-toggle'));
            await page.locator('#fjord-island-map').waitFor();
            await geometry('map-result'); await capture('map-result');
            await activate(page.locator('[data-map-close]'));
            await waitModel('ui-time');
            assert.equal(canonical(await snapshot()), originalCore);
        });
        await stage('time Got it and actual menu open-close finish without starting time', async () => {
            await geometry('time-control'); await capture('time-control');
            await paused(); await next(); await waitModel('ui-navigation');
            await geometry('navigation-entry');
            await activate(page.locator('#fjord-menu > summary'));
            await waitModel('ui-navigation', 'result');
            await geometry('menu-result'); await capture('menu-result');
            await activate(page.locator('#fjord-menu [data-menu-close]'));
            await page.waitForFunction(() => document.querySelector('#fjord-basics-callout')?.dataset.complete === 'true');
            const complete = await snapshot();
            assert.equal(complete.fjord.firstSteps.journey.orientation.length, 6);
            assert.equal(complete.fjord.firstSteps.journey.chapter, 'orientation');
            assert.equal(canonical(complete), originalCore); await paused();
            await geometry('basics-complete'); await capture('basics-complete');
            assert.match(await page.locator('#fjord-basics-callout [data-basics="next"]').innerText(), /Continue to Chapter I/);
            await next();
            assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'home');
            assert.ok(report.targetTransitions.length >= 3, 'At least three actual target changes must be recorded.');
            return { completed: complete.fjord.firstSteps.journey.orientation, explicitContinue: true };
        });
        await stage('Replay Basics and Skip retain all old chapter inspection facts', async () => {
            const before = await snapshot();
            await activate(page.locator('[data-guide="chapter"][data-chapter="orientation"]'));
            await activate(page.locator('[data-guide="replay-basics"]'));
            await waitModel('ui-camera');
            const replayed = await snapshot();
            assert.deepEqual(laterChapterFacts(replayed.fjord.firstSteps), laterChapterFacts(before.fjord.firstSteps));
            assert.deepEqual(replayed.fjord.firstSteps.journey.orientation, []);
            assert.equal(canonical(replayed), originalCore); await paused();
            await activate(page.locator('#fjord-basics-chip'));
            assert.equal(await page.locator('#fjord-basics-tour').isVisible(), false);
            assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'orientation');
            await activate(page.locator('[data-guide="replay-basics"]'));
            await waitModel('ui-camera');
            await activate(page.locator('#fjord-basics-callout [data-basics="skip"]'));
            assert.equal(await page.locator('#fjord-basics-tour').isVisible(), false);
            await openHelp();
            await activate(page.locator('[data-guide="chapter"][data-chapter="conflict"]'));
            assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'conflict');
            assert.equal(canonical(await snapshot()), originalCore);
        });
        await stage('ordinary Continue remains paused and does not reopen the tour', async () => {
            const before = await snapshot();
            await page.reload(); await activate(page.locator('[data-entry="continue"]')); await ready();
            await paused();
            assert.equal(await page.locator('#fjord-basics-tour').isVisible(), false);
            assert.equal(await page.locator('#fjord-first-steps-card').isVisible(), false);
            const continued = await snapshot();
            assert.equal(canonical(continued), canonical(before));
            assert.equal(continued.fjord.firstSteps.journey.chapter, 'conflict');
            await openHelp();
            assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'conflict');
            await capture('continue-paused', false);
        });
        await stage('real v1 file import preserves old chapters, UI facts and paused entry', async () => {
            const legacy = structuredClone((await snapshot()).fjord);
            legacy.firstSteps.status = 'active';
            legacy.firstSteps.journey.chapter = 'discovery';
            legacy.firstSteps.journey.selected = 'wildlife-species';
            legacy.firstSteps.journey.later = ['wildlife-species'];
            legacy.firstSteps.journey.skipped = ['pillage'];
            delete legacy.firstSteps.journey.orientation; delete legacy.firstSteps.journey.tour;
            await writeFile(path.join(output, 'legacy-v1-presentation-fixture.json'), JSON.stringify(legacy, null, 2));
            await menuSection('Load game');
            const previous = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-load-diagnostics')).attempt;
            await page.locator('#fjord-import').setInputFiles({ name: 'legacy-v1-presentation-fixture.json',
                mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
            await ready(previous); await paused();
            assert.equal(await page.locator('#fjord-basics-tour').isVisible(), false);
            const imported = await snapshot();
            assert.deepEqual(imported.fjord.campaign, legacy.campaign);
            assert.deepEqual(laterChapterFacts(imported.fjord.firstSteps), laterChapterFacts(legacy.firstSteps));
            await openHelp();
            assert.equal(await page.locator('#fjord-first-steps-card').getAttribute('data-chapter'), 'discovery');
            await capture('legacy-v1-import-paused', false);
            await activate(page.locator('[data-guide="chapter"][data-chapter="orientation"]'));
            await activate(page.locator('[data-guide="replay-basics"]'));
            await waitModel('ui-camera');
            assert.deepEqual(laterChapterFacts((await snapshot()).fjord.firstSteps), laterChapterFacts(legacy.firstSteps));
            await geometry('legacy-replay-preserves-I-III');
        });
    }
    assert.deepEqual(report.errors, []);
    report.finalCoreSHA256 = hash(canonical(await snapshot()));
    assert.equal(report.finalCoreSHA256, report.initialCoreSHA256);
    report.finalSourceSHA256 = await sourceHashes();
    assert.deepEqual(report.finalSourceSHA256, report.initialSourceSHA256, 'Source changed while browser QA was running.');
    report.status = 'complete';
} catch (error) {
    report.status = 'failed';
    report.failure = { message: error.message, stack: error.stack };
    if (page) {
        await geometry('failure-state', true).catch(error => { report.failureGeometryError = error.message; });
        await capture('failure').catch(() => {});
        report.failurePage = await page.evaluate(() => ({ text: document.body.innerText.slice(-6000),
            active: document.activeElement?.outerHTML.slice(0, 500) })).catch(() => null);
    }
    process.exitCode = 1;
} finally {
    report.finishedUtc = new Date().toISOString();
    await save();
    await browser?.close();
}
console.log(JSON.stringify({ variant, status: report.status, output,
    stages: report.stages.length, targetTransitions: report.targetTransitions.length,
    errors: report.errors, failure: report.failure?.message }));
