import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory = process.env.QA_OUTPUT || 'docs/qa/terrain-shading';
const lab = JSON.parse(await readFile(directory + '/lab/results.json', 'utf8'));
const full = JSON.parse(await readFile(directory + '/full-scene/results.json', 'utf8'));
assert.equal(full.failure, undefined);
assert.deepEqual(full.errors, []);
assert.deepEqual(lab.errors, []);
assert.equal(full.runs.length, 24, 'Three matched trials across two qualities and viewports');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const format = value => value == null ? 'unknown' : value.toFixed(1);
const range = values => format(Math.min(...values)) + '–' + format(Math.max(...values));
const summary = [];
for (const mobile of [false, true]) {
    for (const quality of ['low', 'standard']) {
        const variants = {};
        for (const mode of ['baseline', 'smooth']) {
            const rows = full.runs.filter(row => row.mobile === mobile && row.quality === quality && row.mode === mode);
            assert.equal(rows.length, 3);
            variants[mode] = {
                p50: median(rows.map(row => row.measured.frames.p50)),
                p95: median(rows.map(row => row.measured.frames.p95)),
                p99: median(rows.map(row => row.measured.frames.p99)),
                p50Range: range(rows.map(row => row.measured.frames.p50)),
                p95Range: range(rows.map(row => row.measured.frames.p95)),
                gpu: rows.every(row => row.measured.gpu.count) ? median(rows.map(row => row.measured.gpu.p50)) : null,
                renderCPU: median(rows.map(row => row.measured.spans['render.submit.inclusive'].p50)),
                readyMs: median(rows.map(row => row.prepared.readyMs)),
                readyRange: range(rows.map(row => row.prepared.readyMs)),
                normalCpuMs: median(rows.map(row => row.prepared.description.terrainShading.normalCpuMs)),
                maxBatchMs: Math.max(...rows.map(row => row.prepared.description.terrainShading.maxNormalBatchMs)),
                scratchBytes: rows[0].prepared.description.terrainShading.scratchBytes,
                renderer: rows[0].prepared.inspection.renderer,
                memory: rows[0].after.memory,
                heap: median(rows.map(row => row.measured.heap?.used || 0)),
            };
        }
        const a = variants.baseline, b = variants.smooth;
        const delta50 = (b.p50 / a.p50 - 1) * 100;
        const delta95 = (b.p95 / a.p95 - 1) * 100;
        summary.push({ mobile, quality, variants, delta50, delta95,
            provisionalGate: delta50 <= 5 && delta95 <= 5 ? 'within proposed bound; noise remains' : 'outside proposed bound; no default activation' });
    }
}
await writeFile(directory + '/summary.json', JSON.stringify(summary, null, 2) + '\n');
const rows = summary.flatMap(group => Object.entries(group.variants).map(([mode, row]) =>
    '| ' + [group.mobile ? '390px simulated' : '1280px desktop', group.quality, mode === 'baseline' ? 'A' : 'B',
        format(row.p50), format(row.p95), format(row.p99), row.p95Range,
        format(row.gpu), format(row.renderCPU), format(row.readyMs)].join(' | ') + ' |'));
const costs = summary.flatMap(group => Object.entries(group.variants).map(([mode, row]) =>
    '| ' + [group.mobile ? '390px' : '1280px', group.quality, mode === 'baseline' ? 'A' : 'B',
        row.renderer.render.calls, row.renderer.render.triangles, row.renderer.memory.geometries,
        row.renderer.memory.textures, row.memory.materials,
        (row.memory.totalEstimateBytes / 1048576).toFixed(1),
        (row.heap / 1048576).toFixed(1), format(row.normalCpuMs), format(row.maxBatchMs),
        (row.scratchBytes / 1048576).toFixed(2)].join(' | ') + ' |'));
const gates = summary.map(group => '- ' + (group.mobile ? '390px' : '1280px') + ' ' + group.quality +
    ': median ' + format(group.delta50) + '%, p95 ' + format(group.delta95) + '% — ' + group.provisionalGate + '.');
const report = [
    '# Terrain shading pilot — #173', '',
    'The owner selected B from the paired images and then reported trying B in the game and preferring it on 2026-10-16. A separate integration step enables B by default in /fjord-play. A remains the explicit Lab/reference variant. No instrumented physical Safari/iPhone frame measurements were collected; the owner gameplay trial is qualitative.', '',
    '## Visual diagnosis', '',
    'The neutral, texture-free pass shows that shared normals reduce the regular triangular lighting pattern on grassy rolling slopes. Fully exposed bedrock retains deliberate face definition. Broad already-flat parcels show little difference. Source texture detail and zoning bands remain visible; this pilot does not claim to erase the heightfield silhouette or every material transition.', '',
    'The grass-only UV diagnostic holds normals fixed against the full material pass. B is the visually selected variant. C is omitted: the evidence does not establish a need for adding UV distortion to this focused normal correction. Source UVs and mask UVs remain byte-identical.', '',
    '[Open the paired gallery](review.html). Lab diagnostics use a regular seed-18 blueprint without decorations; full-scene pairs use the actual seed-32 campaign on canonical island 18. The blueprints differ between those two cohorts; each A/B pair has identical geometry, state and camera.', '',
    '## Method and limits', '',
    'Pinned source: `' + full.sourceCommit + '`. Browser: ' + full.browserVersion + '. GPU: ' + full.runs[0].prepared.inspection.renderer.gpu + '.', '',
    'Three alternating-order trials per variant, quality and viewport; DPR 1; real houses, cattle and residents; fixed camera orbit; frozen campaign and presentation clock. Each sample follows ' + full.warmupMs + ' ms warm-up and lasts approximately ' + full.sampleMs + ' ms. Measurements use the existing QA-only bridge in Vite development modules, not an optimized production performance guarantee. Shader compilation occurs before sampling. No repository tests run concurrently with the timed matrix.', '',
    'Mobile is 390 × 844 desktop Edge viewport emulation. Physical Safari/iPhone remains untested. p50/p95/p99 below are medians of the three per-run percentiles; p95 range exposes repeat variance. GPU duration uses EXT_disjoint_timer_query_webgl2 where samples are returned; unavailable values are unknown. The Render CPU column is synchronous renderer-call wall time; it can include driver/GPU waits and is not exclusive CPU utilisation.', '',
    '## Frame and loading measurements', '',
    '| Viewport | Quality | Variant | p50 ms | p95 ms | p99 ms | p95 run range | GPU p50 ms | Render CPU p50 ms | Ready ms |',
    '| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |', ...rows, '',
    ...gates, '',
    'These are bounded prototype checks on one older Intel laptop. Similar results within run variance are inconclusive evidence of cost, not proof of free GPU work. Ready time measures navigation to scene readiness in fresh contexts; network, decoding, normal baking and native setup overlap. See individual runs for ranges and loading long tasks; differences cannot be attributed solely to the normal bake.', '',
    'B increases the measured median time to scene readiness by about 1.3–2.5 seconds (roughly 4–8%) on this host. The bake itself uses about 0.57–0.60 seconds of active CPU plus awaited preparation yields and 4.29 MiB of temporary storage. This pilot therefore does not claim free loading; physical iPhone input responsiveness and loading cost still need review.', '',
    '## Resource and bake costs', '',
    '| Viewport | Quality | Variant | Calls with shadows | Triangles with shadows | GPU geometries | GPU textures | Scene materials | Estimated MiB | Heap MiB | Bake CPU ms | Max bake batch ms | Scratch MiB |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |', ...costs, '',
    'Calls/triangles and GPU resource counts are the matched starting view, including shadow passes; the full moving-path inspections remain in the raw result. Heap is the median usedJSHeapSize at the end of sampling. Estimated memory counts referenced geometry and RGBA8 texture images with a mip allowance plus shadow texels; it is a partial inventory estimate, not measured VRAM. It omits shader-uniform textures, render targets, bone buffers and driver/program/framebuffer overhead; shared decoded texture images may also be counted more than once. Bake CPU excludes awaited yields and common preparation. Scratch is temporary and released; retained attribute-byte delta is zero. No UV bake or extra textures are added. Heap differences across fresh contexts are noisy and are not a retained-leak or physical mobile memory proof.', '',
    '## Correctness and reproduction', '',
    'The browser runner asserts identical A/B position, UV0/1/2/3, colour and index hashes, restored time, Core and canonical world exports. The Lab runner asserts unchanged exports after variant and quality changes and checks latest-request behavior. The public mesh tests cover shared normals, rock definition, deep-sea join, all material flags including climate snow, identical masks/geometry/UVs and asynchronous output. Existing navigation, loading, seasons and deterministic campaign regressions remain in the repository suite.', '',
    'See [implementation contract](../../TERRAIN-SHADING-STUDY.md), [Lab data](lab/results.json), [full-scene distributions](full-scene/results.json) and [summary](summary.json) and [local asset hashes](asset-manifest.json). The gallery was captured at commit `' + full.gallerySourceCommit + '`; later source changes before timing affect QA hashing/resume only, not terrain runtime. Histograms and run summaries are retained; individual frame samples are not. Fixture files are the existing `docs/qa/fjord-runtime-performance/fixtures` sources, identified by SHA-256 in every result.', '',
    'Following the owner image review and subsequent gameplay trial, the separate integration commit enables B by default on `/fjord-play`. `/fjord-play?terrain-study=baseline` remains available for controlled A diagnostics. The measured normal algorithm is unchanged by this default-selection step.', '',
];
await writeFile(directory + '/report.md', report.join('\n'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const pairs = [];
const labels = {
    'meadow-normal': 'Rolling hillside · normals only',
    'meadow-textured': 'Rolling hillside · approved materials',
    'source-uv': 'Rolling hillside · grass source only',
    bedrock: 'Exposed bedrock', shoreline: 'Shoreline and water edge',
    'island-overhead': 'Whole island · overhead', soil: 'Wet ground · close view',
    'low-sun': 'Rolling hillside · low sun',
    'summer-32': 'Founding settlement · Summer',
    'developed-810': 'Developed settlement · Summer',
    'snow-811': 'Developed settlement · Winter',
};
for (let index = 0; index < lab.captures.length; index += 2) {
    const [a, b] = lab.captures.slice(index, index + 2);
    pairs.push({ title: labels[a.id] || a.id, note: a.camera ? a.light + ' · ' + a.overlay : '',
        a: 'lab/' + a.path, b: 'lab/' + b.path });
}
for (let index = 0; index < full.captures.length; index += 2) {
    const [a, b] = full.captures.slice(index, index + 2);
    pairs.push({ title: labels[a.name] || a.name, note: 'Real pinned models · Standard · identical camera and season',
        a: 'full-scene/' + a.path, b: 'full-scene/' + b.path });
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FjordSide · Terrain shading review</title><style>
body{margin:0;background:#172b27;color:#eee6d2;font:16px/1.5 system-ui}main{max-width:1500px;margin:auto;padding:24px}a{color:#ebcb7e}
h1,h2{line-height:1.2}.pairs{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block}section{margin:32px 0;border-top:1px solid #708174;padding-top:16px}figcaption{padding:6px}small{color:#bfc9bb}button{font:inherit;padding:10px;margin:4px;background:#334c40;color:inherit;border:1px solid #a39468;border-radius:4px}@media(max-width:700px){main{padding:12px}.pairs{grid-template-columns:1fr}}
</style><main><h1>Terrain shading: A / B</h1>
<p>B is the approved game default. It shares grassy heightfield normals while retaining exposed rock definition. A remains available in the Lab for comparison. Geometry, approved maps and saves stay identical.</p>
<p><a href="report.md">Measurements and limitations</a> · <a href="/environment-lab">Environment Lab</a> · <a href="/fjord-play?terrain-study=smooth">Open B in the full game</a></p>
<p>C was not added. This review tests the normal correction without distorting the approved source UVs. The owner selected B visually, then tried B in the game and confirmed the preference. B is now the game default. Instrumented physical Safari/iPhone performance remains unmeasured.</p>
${pairs.map(pair => `<section><h2>${escape(pair.title)}</h2><p><small>${escape(pair.note)}</small></p><div class="pairs"><figure><a href="${pair.a}"><img loading="lazy" src="${pair.a}" alt="${escape(pair.title)} A existing flat normals"></a><figcaption>A · existing flat normals</figcaption></figure><figure><a href="${pair.b}"><img loading="lazy" src="${pair.b}" alt="${escape(pair.title)} B shared normals"></a><figcaption>B · shared normals</figcaption></figure></div></section>`).join('')}
</main></html>`;
await writeFile(directory + '/review.html', html);
console.log(JSON.stringify(summary.map(({ mobile, quality, delta50, delta95, provisionalGate }) =>
    ({ mobile, quality, delta50, delta95, provisionalGate })), null, 2));
