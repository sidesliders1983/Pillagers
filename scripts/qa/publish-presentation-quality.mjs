import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = 'artifacts/quality-policy-211', output = 'docs/qa/presentation-quality-211';
const read = async path => JSON.parse(await readFile(root + '/' + path, 'utf8'));
const decision = process.env.QA_QUALITY_DECISION;
assert.ok(['retain', 'defer'].includes(decision), 'Record a reviewed retain/defer decision; this experiment changes no default');
const rationale = process.env.QA_QUALITY_RATIONALE;
assert.ok(rationale?.trim(), 'Record the evidence-based reason for the decision');
const data = await read('measurements/resolution.json');
assert.equal(data.runs.length, 12);
assert.equal(data.failure, undefined);
assert.deepEqual(data.errors, []);
const pairs = [];
for (const before of data.runs.filter(run => run.scenario.pixelRatio === 1)) {
    const after = data.runs.find(run => run.repeat === before.repeat &&
        run.scenario.fixture === before.scenario.fixture && run.scenario.pixelRatio === .85);
    assert.ok(after);
    for (const run of [before, after]) {
        assert.equal(run.canonicalReplayEqual, true);
        assert.equal(run.actualTicksFromFixture, 250);
        assert.deepEqual(run.after.placeholders, []);
        assert.ok(run.windows[0].durationMs >= 44000, 'Complete the sustained 45-second command schedule');
        assert.equal(run.after.renderer.pixelRatio, run.scenario.pixelRatio);
    }
    assert.equal(before.canonicalSha256, after.canonicalSha256);
    pairs.push({ fixture: before.scenario.fixture, repeat: before.repeat,
        canonicalSha256: after.canonicalSha256,
        before: { frames: before.windows[0].frames, gpu: before.windows[0].gpu },
        after: { frames: after.windows[0].frames, gpu: after.windows[0].gpu } });
}
for (const name of ['default-desktop', 'default-mobile'])
    assert.equal((await read(name + '/parity.json')).status, 'PASS');
for (const name of ['controls', 'interactions', 'candidate-interactions', 'owner'])
    assert.equal((await read(name + '/checks.json')).status, 'PASS');
await mkdir(output, { recursive: true });
const copies = [
    ['measurements/resolution.json', 'measurements.json'],
    ['default-desktop/results.json', 'default-desktop.json'],
    ['default-mobile/results.json', 'default-mobile.json'],
    ['default-desktop/parity.json', 'desktop-parity.json'],
    ['default-mobile/parity.json', 'mobile-parity.json'],
    ['controls/checks.json', 'quality-controls.json'],
    ['interactions/checks.json', 'normal-controls.json'],
    ['candidate-interactions/checks.json', 'candidate-controls.json'],
    ['owner/checks.json', 'scene-owner.json'],
    ['red-policy.txt', 'expected-red-policy.txt'],
    ['red-preferences.txt', 'expected-red-preferences.txt'],
    ['related-tests.txt', 'related-tests.txt'],
    ['public-check.txt', 'public-check.txt'],
    ['character-check.txt', 'character-check.txt'],
    ['build.txt', 'initial-build.txt'],
    ['vite-build.txt', 'vite-build.txt'],
];
for (const [source, target] of copies) {
    // Keep raw local logs; remove terminal-only trailing spaces in the committed copies.
    if (source.endsWith('.txt')) {
        const log = await readFile(root + '/' + source, 'utf8');
        await writeFile(output + '/' + target, log.replace(/[ \t]+(?=\r?$)/gm, ''));
    } else await copyFile(root + '/' + source, output + '/' + target);
}
const imageRows = [];
for (const size of ['desktop', 'mobile']) {
    const a = await read('resolution-' + size + '-before/results.json');
    const b = await read('resolution-' + size + '-after/results.json');
    assert.equal(a.status, 'PASS'); assert.equal(b.status, 'PASS');
    const before = a.cases[0].captures[0], after = b.cases[0].captures[0];
    assert.equal(before.canonicalSha256, after.canonicalSha256);
    assert.equal(before.blueprintSha256, after.blueprintSha256);
    assert.equal(before.cardSha256, after.cardSha256);
    const clean = state => {
        const value = structuredClone(state);
        delete value.renderer.width; delete value.renderer.height; delete value.renderer.pixelRatio;
        return value;
    };
    assert.deepEqual(clean(before.state), clean(after.state), 'Only drawing-buffer dimensions may differ');
    assert.equal(before.state.renderer.pixelRatio, 1);
    assert.equal(after.state.renderer.pixelRatio, .85);
    imageRows.push({ size, before: before.state.renderer, after: after.state.renderer,
        canonicalSha256: after.canonicalSha256, cardSha256: after.cardSha256 });
    for (const [side, result] of [['before', a], ['after', b]]) {
        await copyFile(root + '/resolution-' + size + '-' + side + '/results.json', output + '/' + size + '-' + side + '.json');
        const image = result.cases[0].captures[0].image.replace('-world.png', '-desktop.png');
        await copyFile(root + '/resolution-' + size + '-' + side + '/' + image, output + '/' + size + '-' + side + '.png');
    }
}
const runnerHash = createHash('sha256').update(await readFile('scripts/qa/fjord-runtime-audit.mjs')).digest('hex');
await writeFile(output + '/decision.json', JSON.stringify({ decision, rationale, defaultsChanged: false,
    runtime: data.sourceCommit, runnerSha256: runnerHash, pairs, imageRows }, null, 2));
const n = value => Number.isFinite(value) ? value.toFixed(1) : 'unavailable';
const frameRows = data.runs.map(run => {
    const sample = run.windows[0], r = run.after.renderer;
    const gpu = sample.gpuSupported && sample.gpu.count ? n(sample.gpu.mean) + ' / ' + n(sample.gpu.p95) : 'unavailable';
    return `| ${run.scenario.fixture} · ${run.repeat} | ${run.scenario.pixelRatio} | ${n(sample.durationMs / 1000)} | ${[sample.frames.p50, sample.frames.p95, sample.frames.p99, sample.frames.max].map(n).join(' / ')} | ${gpu} | ${r.render.calls} / ${r.render.triangles} | ${sample.longTasks.count} / ${n(sample.longTasks.total)} | ${sample.heap ? n(sample.heap.used / 1048576) : 'unavailable'} |`;
}).join('\n');
const cpuRows = data.runs.map(run => {
    const spans = run.windows[0].spans;
    return `| ${run.scenario.fixture} · ${run.repeat} · ${run.scenario.pixelRatio} | ${n(spans['frame.callback.inclusive']?.total)} | ${n(spans['render.submit.inclusive']?.total)} | ${n(spans['session.command.inclusive']?.total)} | ${n(run.cdpMetrics.ScriptDuration * 1000)} | ${run.after.renderer.memory.geometries} / ${run.after.renderer.memory.textures} |`;
}).join('\n');
await writeFile(output + '/report.md', `# Coherent presentation quality — #211

Runtime: ${data.sourceCommit}; baseline #210 is 11fc49d7cb8f7be52bf712206b6cc2ce02d19b5e. Stage A is independently reviewable in commit 54c266b. It consolidates the existing choices without changing defaults, save semantics, native detail or simulation. The [consumer/application map](../../gameplay/PRESENTATION-QUALITY.md) is the current policy documentation. #210's measured optimizations remain intact on the same branch/PR; #212 is the unmerged dependency. Main was ac3833d at inspection.

## One candidate and decision

**Decision: ${decision === 'retain' ? 'RETAIN the existing shipped values' : 'DEFER candidate adoption; keep the existing shipped values'}.** ${rationale}

The QA-only candidate sets drawing-buffer pixel ratio from 1 to 0.85 at existing Low quality. No other quality axis changes: native models/rigs/modules, water profile, 1024 shadow map, terrain textures, particles, dressing, camera, CSS/UI and canonical schedules retain their settings. The candidate is explicit in the existing QA runner; it is not saved, automatically enabled by viewport, or exposed as another product preference. At equal CSS size it submits about 27.75% fewer main drawing-buffer pixels, with integer rounding; this is not a proportional FPS or VRAM result.

Any future adoption still requires owner visual/performance acceptance under #211. This delivery adds no new LOD switching, animation decimation, shader technology, culling or portrait renderer. #151 remains open for integrated density/device acceptance and #198 owns actual portrait requests and budgets.

## Default-preserving acceptance

Selected-resident Summer/Winter Standard desktop and Summer Low 390px captures exactly match #210's fixed-time world pixels, card markup, Core/RNG/history/discovery, geography, native actors/appearance, camera, lighting and render resources. The unchanged cold-start ratio 1 is retained even for a saved Standard campaign. Explicit Standard live switching still caps DPR at 1.5, and loaded ground tier still changes only on world replacement. Their intentionally different application times are documented rather than silently normalized.

The real DPR2 browser check performs three Low/Standard cycles, checks retained native root UUIDs, verifies live water/shadows/DPR and stabilized GPU resource counters, and preserves exact Core/book/blueprint. Off/Low/Normal effects, reduced motion, orientation resize, synthetic cached return, real WebGL context loss/recovery and genuine reload pass. Synthetic lifecycle and desktop touch emulation are not physical iOS tests. Ordinary and candidate-resolution actual touch Recon/map/paid-house/focused-edit flows pass with exact canonical command/charge semantics. Required final-head CI is recorded on the draft PR. Test-first RED outputs and focused test results are included; no owned modules were mocked.

The normal-server scene-owner check also passes delayed native/world loads, disposal, three world replacements and a campaign replacement during loading. Only current-campaign presentation is published; native resident instances and owned resource counts stabilize.

Local validation: 30 related tests, TypeScript, production build, all 465 committed public files / 47 decoded terrain models, and explicit character/Lab-preview validation (20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules) pass. The first Vite invocation could not write to the existing linked dependency cache outside the workspace; the same build passed with cache access. Both logs are retained. Existing chunk-size warnings are unchanged.

## Measurement protocol and limits

Windows Edge ${data.browserVersion}, actual renderer ${data.runs[0].after.renderer.gpu}. Device-scale factor 1; village-17 is a 1280×800 desktop inhabited village, visited-800 a 390×844 desktop-emulated touch layout with the observed independent rival. Both reuse published #151/#203 fixtures verbatim, whose hashes appear in the raw output. visited-800 crosses an annual boundary during the 250-tick trace; native age fitting and CPU-clan work are retained.

Three alternating repetitions reverse scenario order on repetition two. Each starts with the same saved facts, warms ten seconds with canonical time held, then executes ninety public tick commands at the existing 500ms schedule (2/3/3/3/3/2/3/3/3), exactly 250 ticks over at least 45 seconds. Camera is stationary; the game and local effects run. Each run matches an independently restored headless campaign exactly, and each resolution pair has the same full canonical hash. No heavy local tests/captures ran alongside the timing windows. All samples, including unfavorable results, are retained.

| Fixture · repetition | DPR | Window seconds | Frame p50 / p95 / p99 / max ms | GPU mean / p95 ms | Actual draws / triangles, all passes | Long tasks count / total ms | Used JS heap MiB |
| --- | ---: | ---: | --- | --- | --- | --- | ---: |
${frameRows}

| Fixture · repetition · DPR | Frame scope total ms | Render-submit scope total ms | Canonical-command scope total ms | CDP script duration ms | GPU geometry / texture counts |
| --- | ---: | ---: | ---: | ---: | --- |
${cpuRows}

Scopes are attributed inclusive JS/driver wall time and must not be summed as independent CPU costs; CDP counters and native shadow/draw counters are retained separately. GPU times use the existing disjoint timer queries, with sample counts/disjoint data in the raw report; unavailable timing is reported as unavailable. Draw/triangle/resource counters are not GPU timing. JS heap is measured occupancy, not allocation rate or VRAM. Driver VRAM, temperatures, throttling and unrelated host load are unmeasured. This shared laptop and instrumented Vite build do not establish a universal device/FPS budget, physical iPhone/iPad Safari performance or thermal acceptance.

## Reproduce and review

Use the existing opt-in fjord-runtime-server on a fresh cache/port, then fjord-runtime-audit with QA_GROUP=resolution, QA_REPEATS=3, QA_WARMUP_MS=10000 and QA_SAMPLE_MS=45000. QA_SCENARIOS are recorded verbatim in measurements.json. Copy village-17-island-pool-v2.json from docs/qa/village-nature-203 and visited-review.json from docs/qa/rival-visibility into the recorded fixture names. The runner fingerprint is ${runnerHash}. Explicit QA pixel ratio is the sole candidate override; its native-asset and exact replay guards remain enabled.

capture-golden-fjord reuses frozen real scenes with QA_PIXEL_RATIO=1 or 0.85 and QA_SELECTED=persona:founder-1. Before/after images retain exact actor/camera/card/geography state; only drawing-buffer dimensions differ. check-presentation-quality covers the existing controls/lifecycle and check-scene-interactions retains its strict normal-server path plus an explicit opt-in QA-only resolution test. No new benchmark application or production test API is introduced.

The visual comparison is in review.html. Reverting stage-A commit 54c266b removes this policy consolidation; #210's separate commits can remain. There are no migrations or new dependencies. Formatting/whitespace were manually reviewed; no project formatter is configured. Existing optional-source skips and build warnings remain recorded on the PR. Publication follows validated main only; this feature branch does not update the public Site.
`);
await writeFile(output + '/review.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FjordSide · Quality policy review</title><style>body{max-width:1400px;margin:auto;padding:24px;background:#182328;color:#eee4d0;font:17px/1.5 system-ui}a{color:#e2bd7e}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%}figure{margin:0}section{margin-top:32px}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Presentation quality</h1><p>The shared policy preserves current settings. This experiment changes only the world drawing-buffer ratio; UI text and touch targets keep their CSS size.</p><p><strong>Decision: ${decision}. Shipped defaults are unchanged.</strong> Physical iPhone/iPad Safari and thermal acceptance remain pending under #151.</p><p><a href="report.md">Measurements and limitations</a> · <a href="decision.json">Exact pairs and decision</a> · <a href="quality-controls.json">Quality/lifecycle controls</a></p>${['desktop','mobile'].map(size => `<section><h2>${size === 'desktop' ? 'Desktop' : '390px touch layout'}</h2><div class="pair">${['before','after'].map(side => `<figure><img src="${size}-${side}.png" alt="${size}, drawing-buffer ratio ${side === 'before' ? '1' : '0.85'}"><figcaption>${side === 'before' ? 'Current · ratio 1' : 'QA candidate · ratio 0.85'}</figcaption></figure>`).join('')}</div></section>`).join('')}<p>Candidate image captures use Effects Off and frozen time for a stable comparison. Running measurements use identical Low effects on both variants.</p></html>`);
console.log('Published default parity, one resolution candidate and the recorded decision.');
