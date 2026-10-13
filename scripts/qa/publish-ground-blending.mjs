import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

const input = 'scratch/ground-blending', output = 'docs/qa/ground-blending';
const browser = JSON.parse(await readFile(input + '/browser.json', 'utf8'));
const sources = JSON.parse(await readFile(input + '/source-metrics.json', 'utf8'));
assert.deepEqual(browser.errors, []);
assert.equal(browser.captures.length, 62);
await mkdir(output, { recursive: true });
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
const textureEstimate = ground => ground.maps.flatMap(material => material.textures)
    .reduce((sum, texture) => sum + texture.width * texture.height * 4 * (texture.mipmaps ? 4 / 3 : 1), 0);
const captures = browser.captures.map(capture => ({
    name: capture.name, quality: capture.quality, fixture: capture.fixture,
    seed: capture.world.seed, generatorVersion: capture.world.generatorVersion,
    environment: capture.world.environment, metrics: capture.metrics, ground: capture.ground,
    frames: capture.frames, medianMs: quantile(capture.frames, .5), p95Ms: quantile(capture.frames, .95),
    textureRgbaMipEstimateBytes: Math.round(textureEstimate(capture.ground)),
    groundGpuBufferAndTextureEstimateBytes: Math.round(textureEstimate(capture.ground) +
        capture.ground.terrainBytes + capture.ground.indexBytes + capture.ground.maskBytes),
    javascriptHeap: capture.javascriptHeap,
}));
const find = name => {
    const capture = captures.find(item => item.name === name);
    assert.ok(capture, name);
    return capture;
};
const hashes = [];
for (const capture of captures) {
    const file = capture.name + '.jpg';
    await copyFile(input + '/' + file, output + '/' + file);
    hashes.push({ file, sha256: createHash('sha256').update(await readFile(output + '/' + file)).digest('hex') });
}
const pairs = [];
function addPair(title, beforeName, afterName, labels) {
    const before = find(beforeName), after = find(afterName);
    assert.deepEqual(before.fixture.camera, after.fixture.camera, title);
    assert.equal(before.quality, after.quality);
    assert.deepEqual(before.fixture.lightSettings, after.fixture.lightSettings, title);
    pairs.push({ title, before: beforeName, after: afterName, labels });
}
for (const lighting of ['day', 'sun10']) {
    for (const view of ['ground-rock', 'ground-sea-cliff', 'ground-rock-transition', 'island-oblique']) {
        addPair('Colour only · ' + view + ' · ' + lighting,
            'zoned-' + view + '-tone-source-' + lighting,
            'zoned-' + view + '-tone-grey-' + lighting, ['Original olive atlas', 'Cool-grey atlas']);
    }
}
for (const before of captures.filter(item => item.name.startsWith('baseline-'))) {
    addPair('Full material change · ' + before.name.slice(9).replaceAll('-', ' '),
        before.name, before.name.replace('baseline-', 'zoned-'), ['Original tiled baseline', 'Zoned cool-grey candidate']);
}
addPair('Cold fictional climate · optional snow', 'zoned-island-oblique-cold-snow-off',
    'zoned-island-oblique-cold-snow-on', ['Snow off', 'Snow on']);

const runtime = JSON.parse(await readFile(input + '/runtime.json', 'utf8'));
assert.deepEqual(runtime.errors, []);
assert.equal(runtime.runs.length, 12);
await copyFile(input + '/runtime.json', output + '/runtime.json');
const runtimeRows = [];
for (const tier of ['standard', 'low']) {
    for (const mode of ['baseline', 'zoned']) {
        const runs = runtime.runs.filter(run => run.tier === tier && run.mode === mode);
        const frames = runs.flatMap(run => run.frames);
        runtimeRows.push('| ' + tier + ' · ' + mode + ' | ' + quantile(frames, .5).toFixed(1) +
            ' | ' + quantile(frames, .95).toFixed(1) + ' | ' +
            runs.map(run => quantile(run.frames, .5).toFixed(1)).join(' / ') + ' |');
    }
}
await writeFile(output + '/measurements.json', JSON.stringify({
    date: browser.date,
    hardware: { cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
    method: '90 raw rAF intervals per capture after a 1 s settle. Shared laptop; repository tests ran concurrently with visual QA. These timings are load-contaminated observations, not a controlled performance comparison or separate CPU/GPU measurement. Memory is an RGBA+mipmap/buffer estimate, not measured device allocation.',
    checks: browser.checks, sources, captures, hashes, runtime,
}, null, 2));
const mib = bytes => (bytes / 1048576).toFixed(1);
const allocationRows = ['standard', 'low'].map(tier => {
    const before = find('baseline-ground-rock-' + tier), after = find('zoned-ground-rock-' + tier);
    return '| ' + tier + ' | ' + mib(before.textureRgbaMipEstimateBytes) + ' / ' +
        mib(before.groundGpuBufferAndTextureEstimateBytes) + ' | ' +
        mib(after.textureRgbaMipEstimateBytes) + ' / ' + mib(after.groundGpuBufferAndTextureEstimateBytes) + ' |';
});
const timingRows = ['ground-rock-standard', 'ground-rock-low', 'player-start-settlement', 'player-start-tablet-low'].map(view => {
    const before = find('baseline-' + view), after = find('zoned-' + view);
    return '| ' + view + ' | ' + before.medianMs.toFixed(1) + ' / ' + before.p95Ms.toFixed(1) +
        ' | ' + after.medianMs.toFixed(1) + ' / ' + after.p95Ms.toFixed(1) + ' | ' +
        before.metrics.calls + ' → ' + after.metrics.calls + ' | ' +
        before.metrics.triangles + ' → ' + after.metrics.triangles + ' |';
});
await writeFile(output + '/report.md', `# Procedural ground and cool-grey stone — #137

## Awaiting owner visual review

The candidate replaces the conspicuous repeating grass tiles and stretched vertical cliff detail with source-derived atlases and native height-aware rock projections. Exposed walls now read as grey stone, retaining darker structure; grass and soil remain visible around their edges. The existing Poly Haven mossy_rock source is sufficient for this first colour candidate. No replacement asset is proposed or implicitly approved.

[Open the paired viewer](review.html). Its first eight comparisons isolate **colour only**: the original olive atlas versus its cool-grey treatment, with the same normal/roughness, projection, terrain, camera, light and tier. They cover a steep inland wall, low sea cliff, rock/grass transition and whole-island oblique in day and low sun. The remaining pairs compare the full original material stack with the candidate. There are **62 captures** across accepted seeds 18, 42 and 1983, including settlement, Standard/Low, night, tablet viewport and optional cold-climate snow.

The exact daylight cliff and valley screenshots still require owner sign-off. This is an Environment Lab study, not a production-default change or a claim of completed visual acceptance.

## Sources and material changes

- Approved CC0 sources remain ambientCG Ground037/Ground054 and Poly Haven mossy_rock/grass_path_2. Original source hashes, URLs and licences are retained in the new delivery manifest alongside output hashes.
- Rock colour is a separately selectable deterministic treatment: preserve linear luminance structure, reduce chroma, apply a restrained cool tint and 1.3 linear gain. It does not replace textured RGB with a flat colour. Normal and roughness files remain identical between colour candidates. Snow is off in all colour comparisons.
- Twenty base atlas maps plus two alternate rock colour maps are delivered. The selected colour replaces the other at runtime; both are not simultaneously bound. Standard uses 1024 px colour/normal/roughness; Low uses 512 px colour/roughness without normals.
- Seeded quarter-turns and offsets blend overlapping source patches offline. The full atlas repeats every 24 m while retaining the source's 3/4 m physical detail scale. This is bounded periodic variation, not infinite non-repetition.
- At the original repeat distance, the stored source autocorrelation values are near zero rather than the exact tiled reference of 1. This supports, but cannot replace, the screenshots. Very close detail is softer than the original small tile. Distant 24 m repetition remains a limitation.

## Preserved world and rendering contracts

Existing #135 grass, sand, mud and rockExposure fields are normalized for rendering. The existing moisture/shelter/slope context already contributes to those fields; clearing/path wear shifts the mix toward soil. No second classifier, new saved raster, geometric noise, terrain displacement or change to height/coast/navigation is introduced.

Six native MeshStandardMaterial passes use native texture channels for XZ/ZY/XY rock projection and independent alpha masks. There is no GLSL, onBeforeCompile or custom splat/triplanar shader. All projections share the source images. The base retains every canonical triangle; extra passes omit a quad only if all four bilinear alpha corners are zero. Seed 18's bare-terrain submitted count changes from 1,280,032 to 746,464 triangles, with 4 → 6 draws. Saved unzoned worlds retain the baseline. Export after preview changes matches the original imported world.

Some broad zoning boundaries remain readable; this slice deliberately does not alter the accepted geology or zoning to conceal them. House/farmyard contact, worn ground and coast are shown with the existing scene in the settlement captures.

## Timing and memory limits

Machine: ${os.cpus()[0].model}, Edge/Chromium on Windows. Each capture retains all 90 raw rAF intervals after a 1-second settle. **Repository tests ran concurrently with this visual capture**, so these frame observations are load-contaminated and must not be interpreted as a reliable speed comparison. They do not separate CPU and GPU time. A separate quiet timing run, if included, is identified independently rather than replacing these observations.

| View | Baseline median / p95 ms | Candidate median / p95 ms | Calls | Submitted triangles |
| --- | ---: | ---: | ---: | ---: |
${timingRows.join('\n')}

| Tier | Baseline texture / total ground estimate MiB | Candidate texture / total ground estimate MiB |
| --- | ---: | ---: |
${allocationRows.join('\n')}

Texture estimates assume RGBA and mipmaps; total includes render attributes, index and alpha masks. They exclude driver alignment, temporary CPU construction arrays, decoded-image residency, render targets and the rest of the scene. Native rock texture clones share GPU source images. Raw evidence also records total renderer texture counts and JavaScript heap observations; neither is an isolated GPU memory measurement. Tablet-sized touch emulation is not a physical iPad performance result.

## Separate quiet timing run

After the regression suite, build and visual capture completed, a separate browser session measured the same bare inland wall. Each tier/mode has three runs, alternating order, 120 raw rAF intervals per run after a two-second settle. No repository tests or other task QA ran concurrently. OS background activity and display scheduling remain uncontrolled; this is browser wall time, not exclusive CPU/GPU timing.

Graphics reported by WebGL: ${runtime.graphics?.renderer ?? 'unavailable'}.

| Tier / mode | Combined median ms | Combined p95 ms | Individual run medians ms |
| --- | ---: | ---: | --- |
${runtimeRows.join('\n')}

[All 1,440 raw timing intervals and settings](runtime.json) are retained separately. These measurements inform the cost discussion; they do not establish physical iPad performance or an acceptance threshold on this old laptop.

## Optional snow

Normal 6 °C annual climate has zero retained snow potential and allocates no snow pass. The separate fictional −8 °C fixture has identical terrain and uses the saved climate/aspect/shelter/slope-driven snow potential. Its on/off comparison uses a seventh native white material pass; off restores the substrate. Snow stays off by default, separate from grey stone and pending owner approval.

## Validation and reproduction

Public terrain tests cover normalized composition, steep-wall texture scale, live wear, empty-pass omission, climate snow gating, deterministic save/load and old-world fallback. Browser assertions cover matched views, colour-only map changes, all weight diagnostics, immutable export, tiers/lighting, touch controls, snow and reference return. Local validation: 730 tests, 729 passed, zero failed, one existing opt-in pose-fixture skip; TypeScript and Vite build passed; character validation including explicit Lab previews passed (20 assets / 36 GLBs). Existing large-chunk build warnings remain. PR checks must pass for the published head before readiness. No formatter is configured; source formatting was reviewed manually and git diff --check was run.

1. Run scripts/qa/prepare-ground-fixtures.mjs to reproduce the fixed versioned worlds.
2. Run scripts/prepare-blended-ground.mjs with the original approved source directory.
3. Start the local Vite server; run scripts/qa/check-ground-blending.mjs (QA_ORIGIN can override port 5180).
4. After tests and other QA stop, run scripts/qa/measure-ground-runtime.mjs for the separate timing capture.
5. Run scripts/qa/measure-ground-sources.mjs, then scripts/qa/publish-ground-blending.mjs.

See [the implementation contract](../../PROCEDURAL-GROUND-BLENDING.md) and [raw evidence](measurements.json).
`);
const displayCaptures = captures.map(({ name, seed, quality, medianMs, metrics }) =>
    ({ name, seed, quality, medianMs, calls: metrics.calls }));
await writeFile(output + '/review.html', `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Ground and cool-grey stone review · Pillagers</title>
    <style>
        body { font: 16px/1.5 system-ui; background: #172827; color: #e8e6d6; margin: 0; padding: 24px; }
        main { max-width: 1600px; margin: auto; }
        h1, a { color: #e3cd99; }
        h1 { margin: 0; }
        select { font: inherit; padding: 10px; background: #314440; color: white; max-width: 100%; }
        label { display: block; margin: 18px 0; }
        .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        figure { margin: 0; }
        img { width: 100%; display: block; background: #111; }
        figcaption { padding: 8px; background: #243936; }
        article { border-top: 1px solid #637469; margin-top: 20px; padding-top: 14px; }
        @media(max-width: 900px) { body { padding: 12px; } .pair { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
<main>
    <h1>Ground blending and cool-grey stone</h1>
    <p>Owner visual review pending. The first eight pairs isolate rock colour; subsequent pairs compare the full material change.</p>
    <p><a href="/environment-lab">Environment Lab</a> · <a href="report.md">Report</a> · <a href="measurements.json">Evidence</a></p>
    <label>Comparison <select id="view"></select></label>
    <div class="pair">
        <figure><a id="before-link"><img id="before"></a><figcaption id="before-caption"></figcaption></figure>
        <figure><a id="after-link"><img id="after"></a><figcaption id="after-caption"></figcaption></figure>
    </div>
    <article>
        <strong>Review focus</strong>
        <p>Check that exposed walls read as cool-grey stone with darker detail, while grass and soil remain around sheltered transitions. Compare daylight and low sun without changing camera or exposure. Click an image to inspect full size.</p>
        <p>The full-change pairs also address stretched cliff detail and repeating small tiles. The 24 m atlas remains periodic; close detail can be softer. Geometry and saved zoning are unchanged.</p>
        <p>Snow is a separate optional cold-climate study. Timings from this capture overlap regression tests and cannot establish a speed gain. Tablet captures do not establish physical iPad performance.</p>
        <p>62 captures · seeds 18, 42 and 1983 · native materials · existing CC0 sources.</p>
    </article>
</main>
<script>
    const pairs = ${JSON.stringify(pairs)};
    const captures = ${JSON.stringify(displayCaptures)};
    const menu = document.querySelector('#view');
    pairs.forEach((pair, index) => menu.add(new Option(pair.title, index)));
    function show() {
        const pair = pairs[Number(menu.value)];
        for (const [index, side] of ['before', 'after'].entries()) {
            const name = pair[side];
            const data = captures.find(item => item.name === name);
            const image = document.querySelector('#' + side);
            image.src = name + '.jpg';
            image.alt = pair.labels[index] + ' · ' + pair.title;
            document.querySelector('#' + side + '-link').href = image.src;
            document.querySelector('#' + side + '-caption').textContent = pair.labels[index] +
                ' · seed ' + data.seed + ' · ' + data.quality + ' · ' + data.calls + ' draws';
        }
    }
    menu.addEventListener('change', show);
    show();
</script>
</body>
</html>`);
console.log({ captures: captures.length, pairs: pairs.length });
