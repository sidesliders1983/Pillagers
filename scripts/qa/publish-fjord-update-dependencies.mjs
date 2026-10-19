import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const source = 'artifacts/fine-grained-updates', output = 'docs/qa/fine-grained-updates';
const read = async path => JSON.parse(await readFile(source + '/' + path, 'utf8'));
await mkdir(output, { recursive: true });
const measurements = await read('matched/matched.json');
assert.equal(measurements.runs.length, 12, 'Two alternating repetitions of three matched scenarios');
assert.equal(measurements.failure, undefined);
assert.deepEqual(measurements.errors, []);
const comparisons = [];
for (const before of measurements.runs.filter(run => run.variant === 'before')) {
    const after = measurements.runs.find(run => run.variant === 'after' && run.repeat === before.repeat &&
        JSON.stringify(run.scenario) === JSON.stringify(before.scenario));
    assert.ok(after);
    assert.equal(before.canonicalReplayEqual, true);
    assert.equal(after.canonicalReplayEqual, true);
    assert.equal(after.canonicalSha256, before.canonicalSha256, 'Exact paired canonical outcome');
    assert.equal(after.actualTicksFromFixture, 83);
    assert.equal(before.actualTicksFromFixture, 83);
    assert.deepEqual(before.after.placeholders, []);
    assert.deepEqual(after.after.placeholders, []);
    const a = before.windows[0], b = after.windows[0];
    const floorBefore = a.spans['scene.yardFloor']?.total ?? 0;
    const floorAfter = b.spans['scene.yardFloor']?.total ?? 0;
    const cardBefore = a.spans['ui.cardPatch'].total, cardAfter = b.spans['ui.cardPatch'].total;
    if (floorBefore) assert.ok(floorAfter < floorBefore, 'Measured floor bookkeeping must cost less than the original queries');
    assert.ok(cardAfter < cardBefore, 'Measured card bookkeeping must cost less than the original patch');
    comparisons.push({ fixture: before.scenario.fixture, repeat: before.repeat,
        canonicalSha256: after.canonicalSha256, floorBefore, floorAfter, cardBefore, cardAfter });
}
for (const name of ['floor', 'card']) assert.equal((await read(name + '/checks.json')).status, 'PASS');
for (const name of ['desktop', 'mobile']) assert.equal((await read('golden-' + name + '-after/parity.json')).status, 'PASS');
const runtime = execFileSync('git', ['rev-parse', 'bd69e50'], { encoding: 'utf8' }).trim();
for (const [input, name] of [
    ['matched/matched.json', 'matched.json'], ['baseline/baseline.json', 'starting-native.json'],
    ['target-baseline/baseline.json', 'starting-blocks.json'], ['floor/checks.json', 'floor.json'],
    ['card/checks.json', 'card.json'], ['red-floor/checks.json', 'expected-red-floor.json'],
    ['red-card/checks.json', 'expected-red-card.json'], ['related-tests.log', 'related-tests.txt'],
    ['golden-desktop-after/parity.json', 'desktop-parity.json'],
    ['golden-mobile-after/parity.json', 'mobile-parity.json'],
    ['golden-desktop-before/results.json', 'golden-desktop-before.json'],
    ['golden-desktop-after/results.json', 'golden-desktop-after.json'],
    ['golden-mobile-before/results.json', 'golden-mobile-before.json'],
    ['golden-mobile-after/results.json', 'golden-mobile-after.json'],
    ['owner/checks.json', 'lifecycle.json'], ['interactions/checks.json', 'actual-controls.json'],
]) await copyFile(source + '/' + input, output + '/' + name);
for (const file of ['running-selected.cpuprofile.gz', 'running-selected.trace.json.gz',
    'boundary-running-selected.cpuprofile.gz', 'boundary-running-selected.trace.json.gz'])
    await copyFile(source + '/baseline/profiles/' + file, output + '/' + file);
assert.equal((await read('owner/checks.json')).status, 'PASS');
assert.equal((await read('interactions/checks.json')).status, 'PASS');
await writeFile(output + '/comparisons.json', JSON.stringify({ status: 'PASS', runtime, comparisons }, null, 2));
const costRows = comparisons.map(row => `| ${row.fixture} · ${row.repeat} | ${row.floorBefore.toFixed(1)} → ${row.floorAfter.toFixed(1)} | ${row.cardBefore.toFixed(1)} → ${row.cardAfter.toFixed(1)} |`).join('\n');
const frameRows = measurements.runs.map(run => {
    const sample = run.windows[0], frames = sample.frames;
    const heap = sample.heap ? (sample.heap.used / 1048576).toFixed(1) : 'unavailable';
    return `| ${run.scenario.fixture} · ${run.repeat} | ${run.variant} | ${[frames.p50, frames.p95, frames.p99, frames.max].map(n => n.toFixed(1)).join(' / ')} | ${sample.longTasks.count} / ${sample.longTasks.total.toFixed(1)} | ${heap} |`;
}).join('\n');
const images = [
    ['village-17-island-pool-v2-standard-0-desktop.png', 'summer', 'desktop'],
    ['winter-32-island-pool-v2-standard-0-desktop.png', 'winter', 'desktop'],
    ['village-17-island-pool-v2-low-0-desktop.png', 'mobile', 'mobile'],
];
for (const [file, name, size] of images)
    for (const side of ['before', 'after'])
        await copyFile(`${source}/golden-${size}-${side}/${file}`, `${output}/${name}-${side}.png`);
await writeFile(output + '/report.md', `# Fine-grained update reuse — #210

Status: implementation and local evidence complete; current-head CI is recorded on the draft PR. Physical iOS acceptance remains pending under #151. This is a stacked follow-up to #212; neither PR is merged automatically.

## Pin and two selected paths

Baseline: a54cb668f826b529ff132fc6275e22e095224423 (#212), with main ac3833d4fc286bce5c8522920420a006607a6e0f and no other overlapping open PR at inspection. Runtime after: ${runtime}. Raw measurements declare the exact baseline source override, current source commit, browser/settings, fixture hashes and source mode. Native asset hashes and runtime source fingerprints are retained in the golden capture reports. Later evidence commits do not change runtime code.

1. **Assigned-cattle floor sampling:** the old sync repeatedly traversed world matrices and raycast the same authored Farmyard at the same canonical source point. Each cattle entry now retains one result for the exact yard object, matrix and XYZ. Changed inputs, a new world, assignment removal or instance replacement invalidate it. Cached misses are also valid results. Dynamic animal navigation, collision/social coordination and yard-route surface sampling still run normally.
2. **Mounted card patching:** the interface still renders current truthful HTML. When the card has no editable fields and its HTML is identical, it retains the DOM instead of parsing another template. World/history generation changes invalidate this reuse. Forms keep the original field-preserving reconciliation even with identical HTML; current affordability and command validation still run. Other views, events and autosaves keep their original cadence.

The [existing architecture map](../../gameplay/GAMEPLAY-FIRST-ARCHITECTURE.md#scoped-presentation-reuse-210) records these dependencies under #17. These are bounded instance caches, not another authoritative read model or generic invalidation framework. No new engine, fitter, assets, quality policy, cadence, gameplay rules, dependencies or save schema. #211 remains separate.

## Measured starting point

Starting native and direct-block passes reused the published developed-810 and boundary-810 saves. Ordinary warmed DNA/wardrobe reconciliation was already cheap: 500 reconciliations consumed 11.7 ms aggregate in one 10-second attribution run, without DNA refits. That path was intentionally left alone. The annual boundary legitimately refit age-dependent bodies/modules (about 2.7 seconds aggregate applyDNA in that single native profile); this delivery does not remove that work.

The initial direct-block ordinary run recorded 160 repeated yard queries / 320.1 ms and 20 card patches / 38.5 ms over ten seconds. Final paired measurements below use an expanded, identical card scope including detection/preserved-field bookkeeping on both variants, so those initial card numbers are attribution evidence rather than the final comparison.

## Paired CPU and allocation evidence

Windows Edge ${measurements.browserVersion}, Intel HD Graphics 630 via ANGLE/D3D11, DPR 1, existing Low quality/effects. Desktop 1280×800 for ordinary/annual cases; desktop-emulated 390×844 touch layout for visited-800. Two alternating repetitions reverse both variant and scenario order on repetition two. Each warms for two seconds and receives the same thirty public tick commands at the existing 500 ms QA schedule (pattern 2/3/3/3/3/2/3/3/3), totaling 83 canonical ticks over approximately fifteen seconds. Boundary time is held during warmup so the annual update is measured. Camera orbit runs for the ordinary and visited cases.

Every pair has exact full canonical equality, including RNG, events/history, both clans and discovery. All layers use real public assets with zero placeholders. visited-800 contains an actively observed rival settlement; its actual bound terrain/discovery contract is used for the independent headless replay. It has no Farmyard queries to eliminate, which remains a measured no-op.

| Fixture · repetition | Total floor-block CPU ms before → after | Total card-block CPU ms before → after |
| --- | ---: | ---: |
${costRows}

The floor block includes dependency checking, not just misses; its update cadence is retained. The focused external geometry-query probe observes 40 redundant queries across five unchanged updates before, zero after, with exact unchanged positions/bounds. The DOM parser probe observes five redundant card template parses before, zero after. Each cache is bounded: one sixteen-number matrix plus a point/height per applicable cattle entry, and one latest card string/identity per interface. These operation/allocation proofs do not depend on a hardware timing threshold. Whole-page heap below is a noisy end-window occupancy reading, not an allocation-rate or isolated cache measurement.

## Full-frame observations and limits

| Fixture · repetition | Variant | Frame p50 / p95 / p99 / max ms | Long tasks count / total ms | Whole-page used heap MiB |
| --- | --- | --- | --- | ---: |
${frameRows}

This is a shared Windows laptop, using instrumented Vite development modules. GPU load/clock/thermal state and browser/OS scheduling are not controlled. The full-frame distributions vary, including cases that are slower after; selected CPU savings are not a GPU/FPS claim. Annual native fitting, canonical projection/persistence and navigation still contribute costs outside the selected paths. Raw GPU queries, CPU spans, CDP counters and both repetitions are preserved without removing unfavorable samples. Physical iPhone/iPad performance is unmeasured.

## Correctness and lifecycle

- The new geometry-query and DOM-parser expectations first failed on the pinned implementation (expected-red files); no owned modules were mocked. Tests use real assets and existing public scene/session/browser seams.
- Floor probes compare each retained result with a new real-asset layer across point/home transforms, assignment removal/restoration, life-stage model changes, removal/recreation, rollback and worlds with reused identities. Positions match exactly. Newly measured versus retained world bounds differ by ordinary translation roundoff around 1e-14 m; the test requires less than 1e-9 m, while unchanged bounds remain exact.
- Actual card controls retain focus/edits/disclosures through a tick, reset unpreserved paused controls, refresh work and age, and do not duplicate source-linked production awards. A real import reuses IDs, refreshes affordability after salvage, and the real paid BuildHouse command matches Core exactly and spends once. The 390px card remains current.
- Existing lifecycle and actual-control runners pass against the normal uninstrumented server: delayed/disposed/replaced loads, retained native instances, import/map/Recon/house commands and running focused edits. Their reports are included.
- Selected-resident Summer/Winter Standard desktop and Summer Low mobile golden pairs have exact fixed-time world pixels, selected-card markup, Core, authoritative blueprint/layout, native appearance/wardrobe, lighting/season, camera/markers and render-resource equality. Selection adds visible rings/card content to the existing #203 fixtures. No cross-device pixel identity is claimed.
- Production build, tracked public assets and explicit character/Lab-preview validation pass. The 59-test related run has zero failures/skips. Required full repository CI runs unchanged on the final head; existing optional-source skips are disclosed on the PR. No project formatter is configured; formatting and whitespace were manually reviewed. Existing Vite chunk-size warnings are retained.

## Reproduction, review and revert

Use the existing fjord-runtime-server.mjs with QA_UPDATE_STUDY=1 on separate cache/ports. Pin the baseline using QA_SOURCE_REF=a54cb668f826b529ff132fc6275e22e095224423 and QA_PIN_UPDATE_PATHS=1. Reuse fjord-runtime-audit.mjs with QA_VARIANTS before/after, QA_REPEATS=2, QA_WARMUP_MS=2000, QA_SAMPLE_MS=15000 and the three scenarios recorded verbatim in matched.json. The copied fixture bytes come from docs/qa/fjord-runtime-performance/fixtures and docs/qa/rival-visibility/visited-review.json. Do not run heavy local checks alongside timing windows.

Run check-fjord-floor-dependencies.mjs against normal Vite and check-fjord-card-dependencies.mjs against the opt-in bridge. Golden captures reuse capture-golden-fjord.mjs with QA_SELECTED=persona:founder-1, existing village/winter fixtures, frozen time, Effects Off and matched quality/viewport; compare-scene-lifecycle.mjs requires exact paired results. check-scene-owner.mjs and check-scene-interactions.mjs use QA_ORIGIN and QA_OUTPUT to avoid overwriting historical evidence. This publisher fails unless all twelve paired runs, canonical outcomes and focused/golden/lifecycle reports pass.

Review the images in review.html, then check selection, cards, editable fields, housing affordability, map/mission controls and background return on a physical iPhone/iPad before claiming device acceptance. No public Sites playtest is updated from this feature branch.

Revert the two optimization commits (640de54 and bd69e50) together; evidence/tooling may be reverted separately. The existing uncached code path and #209 owner remain. There are no migrations or new dependencies to undo.
`);
await writeFile(output + '/review.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FjordSide · Update reuse review</title><style>body{margin:auto;max-width:1400px;padding:24px;background:#182328;color:#eee4d0;font:17px/1.5 system-ui}h1,h2{font-family:Georgia,serif}a{color:#e2bd7e}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%}section{margin:32px 0}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Targeted update reuse</h1><p>Real Farmyard floor queries and unchanged card DOM are reused. Current facts, editable controls, events, assets, quality and simulation cadence stay on their established paths.</p><p><a href="report.md">Measurements, limits and reproduction</a> · <a href="comparisons.json">Paired CPU/Core results</a> · <a href="floor.json">Real-asset floor probes</a> · <a href="card.json">Actual card controls</a></p><p>Selected CPU work is lower; this is not an FPS or physical iOS performance claim. The full report retains all frame distributions, including unfavorable samples. Both PRs remain subject to owner review.</p>${images.map(([,name]) => `<section><h2>${name === 'mobile' ? 'Selected resident · 390×844 Low' : 'Selected resident · ' + name + ' · Standard'}</h2><div class="pair">${['before','after'].map(side => `<figure><img src="${name}-${side}.png" alt="${name} ${side} targeted update reuse"><figcaption>${side === 'before' ? 'Lifecycle baseline #212' : 'Targeted update reuse #210'}</figcaption></figure>`).join('')}</div></section>`).join('')}<p><a href="/fjord-play">Open FjordSide</a>. Physical iPhone/iPad review remains pending: selection, edits, house actions, map/missions and background return should feel unchanged.</p></html>`);
console.log('Published paired CPU, parity and lifecycle evidence.');
