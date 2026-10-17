import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE
    || 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5175';
const directory = 'docs/qa/desktop-ui-redesign-180/screenshots-v2';
const route = origin + '/docs/qa/desktop-ui-redesign-180/prototype-v2.html';
const studyData = JSON.parse(await readFile('docs/qa/desktop-ui-redesign-180/study-data-v2.json', 'utf8'));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const report = { browser: browser.version(), viewport: { width: 1440, height: 900 }, observations: [], errors: [] };
report.sources = {};
for (const file of ['prototype-v2.html', 'prototype-v2.css', 'prototype-v2.mjs', 'study-data-v2.json']) {
    const bytes = await readFile('docs/qa/desktop-ui-redesign-180/' + file);
    report.sources[file] = createHash('sha256').update(bytes).digest('hex');
}
page.on('pageerror', error => report.errors.push(error.message));
page.on('response', response => {
    if (response.status() >= 400) report.errors.push(response.status() + ' ' + response.url());
});

async function open(variant, journey) {
    await page.goto(route + '?variant=' + variant + '&journey=' + journey + '&capture=1',
        { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.fjordUiStudy && document.querySelector('#game').dataset.worldPercent);
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
}

async function record(name, screenshot = true) {
    await page.waitForTimeout(100);
    const observation = await page.evaluate(() => {
        const root = document.querySelector('#game').getBoundingClientRect();
        const boxes = [...document.querySelectorAll('[data-overlay]')].map(node => {
            const box = node.getBoundingClientRect();
            return { id: node.dataset.overlay, x: box.x, y: box.y, width: box.width, height: box.height,
                inBounds: box.left >= 0 && box.top >= 0 && box.right <= root.right + 1 && box.bottom <= root.bottom + 1 };
        });
        const commit = document.querySelector('[data-action=confirm-farmyard], [data-action=confirm-work], [data-action=build-house]');
        const commitBox = commit?.getBoundingClientRect();
        const panelBox = commit?.closest('[data-overlay]')?.getBoundingClientRect();
        return {
            viewport: { width: innerWidth, height: innerHeight },
            state: window.fjordUiStudy.snapshot(),
            worldPercent: Number(document.querySelector('#game').dataset.worldPercent),
            boxes,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            commitVisible: !commitBox || (commitBox.top >= panelBox.top && commitBox.bottom <= panelBox.bottom),
            commitDisabled: commit?.disabled,
            occupationChoices: [...document.querySelectorAll('[data-action^="occupation:"]')]
                .map(button => ({ id: button.dataset.action.slice(11), disabled: button.disabled })),
            workTaskChoices: [...document.querySelectorAll('[data-action^="set-up-work:"]')]
                .map(button => ({ id: button.dataset.action.slice(12), disabled: button.disabled })),
            detailScrollRequired: [...document.querySelectorAll('.right > .body')]
                .some(node => node.scrollHeight > node.clientHeight + 1),
            campaignStorage: [...Object.keys(sessionStorage), ...Object.keys(localStorage)]
                .filter(key => key.startsWith('pillagers.')),
            campaignBridge: typeof window.__fjordAudit,
        };
    });
    report.observations.push({ name, ...observation });
    if (screenshot) await page.locator('#game').screenshot({
        path: directory + '/' + name + '.jpg', type: 'jpeg', quality: 90,
    });
    console.log(name + ': ' + observation.state.clicks + ' clicks, ' + observation.worldPercent
        + '% world, commit visible=' + observation.commitVisible);
}

try {
    for (const variant of ['A', 'B', 'C']) {
        await open(variant, 'housing');
        await page.locator('[data-action=home]').click();
        await record(variant + '-housing');
        await page.locator('[data-action=build-house]').click();
        await record(variant + '-house-result');
        if (variant === 'A') {
            await page.locator('[data-action=household-work]').click();
            await record('A-household-work');
            await page.locator('[data-action=set-up-farmyard]').click();
            await record('A-existing-home-farmyard');
            await page.locator('[data-action=confirm-farmyard]').click();
            await record('A-existing-home-result');
        }
        await open(variant, 'farmyard');
        await record(variant + '-observe');
        await page.locator('[data-action=home]').click();
        await record(variant + '-inspect');
        await page.locator('[data-action=household-work]').click();
        await page.locator('[data-action=set-up-farmyard]').click();
        await record(variant + '-farmyard');
        await page.locator('[data-action=confirm-farmyard]').click();
        await record(variant + '-result');

        await open(variant, 'expedition');
        await page.locator('[data-action=expeditions]').click();
        await page.locator('[data-action=create-group]').click();
        for (const id of ['founder-1', 'founder-4', 'founder-5']) {
            await page.locator('[data-action="member:' + id + '"]').click();
        }
        await record(variant + '-expedition');
        await page.locator('[data-action=start-expedition]').click();
        await page.locator('[data-action=explore]').click();
        await page.locator('[data-action=world]').click({ position: { x: 780, y: 350 } });
        await record(variant + '-dispatched');
        await page.locator('[data-action=clock]').click();
        await record(variant + '-running', false);

        await open(variant, 'history');
        await page.locator('[data-action=book]').click();
        await page.locator('[data-action=book-family]').click();
        await page.locator('[data-action="family:founder-1"]').click();
        await record(variant + '-family');
    }
    await open('A', 'blocked');
    await page.locator('[data-action=home]').click();
    await record('A-blocked-housing');
    await page.locator('[data-action=household-work]').click();
    await page.locator('[data-action=set-up-farmyard]').click();
    await record('A-blocked');
    await page.keyboard.press('Escape');
    await record('A-cancelled', false);

    await page.setViewportSize({ width: 1280, height: 720 });
    for (const variant of ['A', 'B', 'C']) {
        await open(variant, 'farmyard');
        await page.locator('[data-action=home]').click();
        await page.locator('[data-action=household-work]').click();
        await page.locator('[data-action=set-up-farmyard]').click();
        await record(variant + '-1280');
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await open('B', 'farmyard');
    await page.locator('[data-action=home]').click();
    await page.locator('[data-action=household-work]').click();
    await page.locator('[data-action=set-up-farmyard]').click();
    await record('B-1920');
    await page.setViewportSize({ width: 1440, height: 900 });
    await open('C', 'developed');
    await page.locator('[data-action="person:founder-1"]').click();
    await record('C-developed');
    await page.locator('[data-action=work]').click();
    await page.locator('[data-action="occupation:hunter"]').click();
    await record('C-occupation-risk');
    await page.locator('[data-action=work]').click();
    await page.keyboard.press('Escape');
    await record('C-kept-farmer', false);

    await open('C', 'farmyard');
    await page.locator('[data-action=home]').click();
    await page.locator('[data-action=household-work]').click();
    await page.locator('[data-action=set-up-farmyard]').click();
    await page.locator('[data-action="worker:founder-10"]').click();
    await page.keyboard.press('ArrowRight');
    await record('A-kept-draft', false);
    await page.locator('[data-action=confirm-farmyard]').click();
    await record('A-alternate-farmer');

    await open('A', 'resident');
    await page.locator('[data-action="person:founder-1"]').click();
    await page.locator('[data-action=work]').click();
    await record('A-occupations');
    await page.locator('[data-action="occupation:smith"]').click();
    await record('A-smith-result');
    await page.locator('[data-action=livestock]').click();
    await record('A-livestock');

    for (const variant of ['A', 'B', 'C']) {
        const occupations = variant === 'A' ? studyData.occupations : ['smith', 'fisher', 'hunter'];
        for (const occupation of occupations) {
            const capture = ['smith', 'fisher', 'hunter'].includes(occupation);
            await open(variant, 'work');
            await page.locator('[data-action=home]').click();
            await page.locator('[data-action=household-work]').click();
            if (occupation === 'smith') await record(variant + '-work-options');
            await page.locator('[data-action="set-up-work:' + occupation + '"]').click();
            await record(variant + '-' + occupation + '-work-setup', capture);
            await page.locator('[data-action=confirm-work]').click();
            await record(variant + '-' + occupation + '-work-result', capture);
        }
    }
    await open('A', 'blocked');
    await page.locator('[data-action=home]').click();
    await page.locator('[data-action=household-work]').click();
    await page.locator('[data-action="set-up-work:smith"]').click();
    await record('A-work-needs-materials');
    await page.locator('[data-action=toggle-house]').click();
    await page.locator('[data-action=confirm-work]').click();
    await record('A-work-without-house');

    const workResults = report.observations.filter(item => item.name.endsWith('-work-result'));
    report.review = {
        housingOnly: report.observations.filter(item => item.name.endsWith('-house-result'))
            .every(({ state }) => state.homeBuilt && !state.farmReady && state.spentMaterials === 10
                && Object.keys(state.roles).length === 0 && state.buildingSpecialization === null
                && state.assignedCattleIds.length === 0 && state.clicks === 2),
        existingHomeReused: report.observations.find(item => item.name === 'A-existing-home-result')
            .state.spentMaterials === 10,
        canonicalOccupationCount: report.observations.find(item => item.name === 'A-occupations')
            .occupationChoices.length,
        canonicalWorkTaskCount: report.observations.find(item => item.name === 'A-work-options')
            .workTaskChoices.length,
        workPlansReviewed: workResults.length,
        workPlansMatchCore: workResults.every(({ state }) => {
            const canonical = studyData.workResults[state.workOccupation];
            const worker = studyData.scenes.funded.people.find(person => person.id === state.workerId);
            return state.workerId === canonical.workerId && state.homeBuilt
                && (state.roles[worker.id] || worker.occupation) === canonical.occupation
                && state.buildingSpecialization === canonical.specialization
                && studyData.scenes.funded.stocks.materials - state.spentMaterials === canonical.materials
                && state.farmReady === Boolean(canonical.farmyard)
                && state.assignedCattleIds.length === 0 && state.clicks === 4;
        }),
        workWithoutHouse: report.observations.filter(item => item.name === 'A-work-without-house')
            .every(({ state }) => !state.homeBuilt && state.spentMaterials === 0
                && state.buildingSpecialization === null && state.assignedCattleIds.length === 0
                && state.roles[state.workerId] === 'smith' && state.clicks === 5),
    };
    await page.setViewportSize({ width: 1500, height: 820 });
    await page.goto(origin + '/docs/qa/desktop-ui-redesign-180/comparison-v2.html',
        { waitUntil: 'networkidle' });
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await page.screenshot({
        path: 'docs/qa/desktop-ui-redesign-180/comparison-v2.png', fullPage: true,
    });
} finally {
    await writeFile('docs/qa/desktop-ui-redesign-180/observations-v2.json',
        JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
