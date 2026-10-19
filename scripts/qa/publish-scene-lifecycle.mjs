import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const source = 'artifacts/scene-lifecycle', output = 'docs/qa/scene-lifecycle';
await mkdir(output, { recursive: true });
const read = async path => JSON.parse(await readFile(source + '/' + path, 'utf8'));
const desktop = await read('after-final/parity.json');
const mobile = await read('after-mobile-final/parity.json');
const owner = await read('owner/checks.json');
const interactions = await read('interactions/checks.json');
const imports = await read('import-restart/lifecycle.json');
const cinematic = await read('cinematic/lifecycle.json');
for (const result of [desktop, mobile, owner, interactions, imports]) assert.equal(result.status, 'PASS');
assert.equal(cinematic.flows.length, 2);
assert.ok(cinematic.failedRequests > 0);
for (const [input, name] of [
    ['before-final/results.json', 'before.json'], ['after-final/results.json', 'after.json'],
    ['before-mobile/results.json', 'before-mobile.json'], ['after-mobile-final/results.json', 'after-mobile.json'],
    ['after-final/parity.json', 'desktop-parity.json'], ['after-mobile-final/parity.json', 'mobile-parity.json'],
    ['owner/checks.json', 'owner.json'], ['interactions/checks.json', 'interactions.json'],
    ['import-restart/lifecycle.json', 'import-restart.json'], ['cinematic/lifecycle.json', 'cinematic.json'],
    ['resume/browser.json', 'resume.json'], ['related-tests.log', 'related-tests.txt'],
]) await copyFile(source + '/' + input, output + '/' + name);
const views = [
    ['village-17-island-pool-v2-standard-0-desktop.png', 'summer', 'before-final', 'after-final'],
    ['winter-32-island-pool-v2-standard-0-desktop.png', 'winter', 'before-final', 'after-final'],
    ['village-17-island-pool-v2-low-0-desktop.png', 'mobile', 'before-mobile', 'after-mobile-final'],
];
for (const [file, name, before, after] of views) {
    for (const [side, directory] of [['before', before], ['after', after]])
        await copyFile(source + '/' + directory + '/' + file, output + '/' + name + '-' + side + '.png');
}
const before = await read('before-final/results.json'), after = await read('after-final/results.json');
const rows = before.cases.map((item, i) => {
    const sample = item.profiles[0].sample, current = after.cases[i].profiles[0].sample;
    const pair = key => sample[key].p50.toFixed(1) + ' / ' + current[key].p50.toFixed(1);
    return `| ${item.name} | ${pair('frames')} | ${sample.spans['frame.callback.inclusive'].p50.toFixed(1)} / ${current.spans['frame.callback.inclusive'].p50.toFixed(1)} | ${pair('gpu')} | ${(sample.heap.used / 1048576).toFixed(1)} / ${(current.heap.used / 1048576).toFixed(1)} |`;
}).join('\n');
await writeFile(output + '/report.md', `# Active scene lifecycle — #209

Status: technical validation complete; normal owner review and physical iOS acceptance remain open. Required current-head CI is recorded on the draft PR. No automatic merge.

## Source and scope

Baseline main: ac3833d4fc286bce5c8522920420a006607a6e0f. No overlapping PRs were open at the final main check. Mechanical extraction: 48b4391. Lifecycle fixes: ede0d9c. Raw capture JSON records source hashes, dirty-diff fingerprint, exact fixture/asset hashes, Edge version, camera, Core and world projections. Later QA/documentation commits do not change runtime code.

One concrete createFjordScene owner now constructs, replaces, updates and releases the active Three.js presentation. FjordPlay retains campaign restoration, commands, UI, clock intent, page/context recovery and frame-loop installation. The [ownership map](../../gameplay/GAMEPLAY-FIRST-ARCHITECTURE.md#active-presentation-ownership-209) updates the existing #17 architecture location. No shader, scheduling, quality, gameplay, source asset, dependency or save-format changes. #210 and #211 remain separate.

## Exact parity

Desktop 1400×900 Standard: the existing paid village-17 Summer and winter-32 fixtures have identical Core/RNG/history/discovery, blueprint, camera, native wardrobe/actor projection, season/lighting, render resources and fixed-time RGBA pixels before/after. Desktop all-pass draw counts remain 235 and 246; geometry/texture counts remain 111/71 and 119/75. Mobile viewport 390×844 Low: the village fixture has identical state and pixels, 223 calls and 111/71 resources. The separate live interaction checks use Low effects; reproducible golden images freeze presentation time with effects Off. This does not assert pixel identity across physical devices.

The first extracted capture exposed a real HUD difference caused by CSS side-effect import order. The original order was restored in the mechanical commit and the final comparison passes without ignoring the UI or loosening its pixel assertion. Source hashes are checked again after each capture to reject edits during measurement.

## Lifecycle and actual gameplay controls

${owner.checks.map(text => '- ' + text).join('\n')}
- An already-captured frame callback after disposal neither throws nor renders. Three world replacements stabilize at 12 roots, 111 geometries, 71 textures, one map and zero pending work; native resident object identity is retained. Final disposal leaves zero roots and removes owned control bindings.
${imports.checks.map(text => '- ' + text).join('\n')}
${cinematic.flows.map(text => '- ' + text).join('\n')}
${interactions.checks.map(text => '- ' + text).join('\n')}
- Existing 390px resume runner: persisted pagehide/pageshow simulation keeps the warm scene paused with exact Core; real WEBGL_lose_context/restore preserves the campaign; genuine page reload restores the checkpoint exactly. BFCache event dispatch is synthetic, not evidence of physical Safari eviction behavior.
- Existing damaged-save recovery runner passed: damaged active save is exportable, failed worker restoration can retry from the exact valid checkpoint. No restored time is advanced during loading.

## Defects isolated from extraction

The public-owner tests went red for an attached target root after disposal, a late native model reading a disposed layer, a superseded campaign publishing old campfire coordinates, and a frame callback touching disposed motion. Fixes use the existing presentation epoch, stop/abort owned bindings, reject obsolete reconciliation, and defer shared model/template disposal until already-owned asynchronous work drains. They do not add a global resource cache or alter steady-state update cadence. Late model instances are released through their existing model owner. The optional FjordEntities current-revision guard retains the old default for other consumers.

## Representative host observations

Windows Edge ${after.browser}, Intel HD Graphics 630 via ANGLE/D3D11, DPR 1, 1400×900 Standard, paused canonical clock, animated presentation, 10-second samples from the existing opt-in audit. Other local QA browsers/build activity overlapped parts of these samples; the observations describe this host and are not controlled performance comparisons. JS heap is the whole-page instantaneous used heap, not an allocation-rate or leak measurement. There is no FPS improvement claim or timing acceptance threshold. Stable repeated resource counters and retained objects are the bounded lifetime evidence.

| Campaign | Frame interval median ms before / after | CPU callback median ms before / after | GPU query median ms before / after | Used JS heap MiB before / after |
| --- | --- | --- | --- | --- |
${rows}

All profile windows preserve exact Core. Raw frame distributions, CPU spans, GPU availability, heap totals and renderer counters are in before.json and after.json. Device acceptance under #151 remains separate.

## Validation and reproduction

- Production build, tsc, tracked public validation (465 files, 47 decoded terrain models) and explicit character/Lab-preview validation (20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules) passed. Existing Vite large-chunk warning remains unchanged.
- Related Node run: 80 passed, zero failed/skipped; see related-tests.txt. Full repository test/asset checks use the unmodified current-head GitHub workflow.
- Manual source/diff and whitespace review; no project formatter is configured. New owner formatting uses the installed TypeScript formatter.
- Serve the normal checkout with Vite on 5182, then run check-scene-owner.mjs and check-scene-interactions.mjs. Set QA_ORIGIN and QA_OUTPUT for check-island-map-lifecycle.mjs, check-cinematic-lifecycle.mjs, check-campaign-resume.mjs and check-campaign-recovery.mjs; never overwrite historical QA reports.
- For golden pairs, use fjord-runtime-server.mjs with QA_GOLDEN=1 on separate ports/cache directories. Pin the baseline with QA_SOURCE_REF=ac3833d4fc286bce5c8522920420a006607a6e0f and QA_PIN_SCENE_LIFECYCLE=1. capture-golden-fjord.mjs uses QA_FIXTURE_DIR=docs/qa/village-nature-203, QA_FIXTURES=village-17-island-pool-v2,winter-32-island-pool-v2, QA_RELOADS=1 and optional QA_PROFILE_MS=10000. Set QA_WIDTH=390, QA_HEIGHT=844, QA_QUALITY=low and the village fixture for mobile. Run compare-scene-lifecycle.mjs for each pair, then this publisher.

## Owner review and revert

Open review.html for matched captures. Physical iPhone/iPad remains pending: new/import/reload, background return, selection, drag/pinch, paid house actions, map/mission controls and retained field edits should feel unchanged. Browser touch emulation is not physical-device acceptance.

Revert the lifecycle-fix commit and mechanical extraction together (plus the QA/documentation commit if desired), then rerun the unchanged checks. There are no canonical/save migrations, asset conversions or new dependencies to undo.
`);
await writeFile(output + '/review.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FjordSide · Scene lifecycle review</title><style>body{margin:0 auto;max-width:1400px;padding:24px;background:#182328;color:#eee4d0;font:17px/1.5 system-ui}h1,h2{font-family:Georgia,serif}a{color:#e2bd7e}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;height:auto}figcaption{padding:8px}section{margin:32px 0}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Scene lifecycle · behavior-preserving extraction</h1><p>Matched current-main campaigns before and after the refactor. Exact fixed-time state and pixels match on this Windows Edge host. Physical iOS review remains pending. This is a maintainability change, with no frame-rate improvement claim.</p><p><a href="report.md">Evidence and reproduction</a> · <a href="desktop-parity.json">Desktop equality</a> · <a href="mobile-parity.json">Mobile equality</a> · <a href="owner.json">Lifecycle probes</a> · <a href="interactions.json">Actual controls</a> · <a href="/fjord-play">Open FjordSide</a></p>${['summer','winter','mobile'].map(name => `<section><h2>${name === 'mobile' ? '390×844 Low · mobile viewport' : name === 'summer' ? 'Paid village · Summer · Standard' : 'Winter · Standard'}</h2><div class="pair">${['before','after'].map(side => `<figure><img src="${name}-${side}.png" alt="${name} ${side} extraction"><figcaption>${side === 'before' ? 'Main ac3833d' : 'Extracted lifecycle + isolated safety fixes'}</figcaption></figure>`).join('')}</div></section>`).join('')}<p>Please review loading/import, pause/background return, selection/camera, native wardrobe, paid houses, map/mission controls and edits on a physical iPhone/iPad. The PR remains draft for normal review; nothing is merged automatically.</p></html>`);
console.log('Published matched lifecycle evidence and review.');
