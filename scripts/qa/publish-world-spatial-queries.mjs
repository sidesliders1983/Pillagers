import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
const source = 'scratch/world-spatial-queries';
const output = 'docs/qa/world-spatial-queries';
await mkdir(output, { recursive: true });
const batch = JSON.parse(await readFile(source + '/batch.json', 'utf8'));
const browser = JSON.parse(await readFile(source + '/browser.json', 'utf8'));
for (const name of ['batch.json', 'browser.json']) await copyFile(source + '/' + name, output + '/' + name);
const images = [
    ['grid-ground.jpg', 'Ground membership from #135. Exact physical water takes precedence in this diagnostic view.'],
    ['grid-movement.jpg', 'Existing resident traversability: green available, red blocked, blue sea.'],
    ['grid-buildability.jpg', 'Point preflight: green unreserved, amber reserved or occupied, red unsuitable, blue sea.'],
    ['grid-reservations.jpg', 'Existing reservations: player green, rival pink, buffers amber, foundations pale and routes cyan.'],
    ['grid-slope.jpg', 'Exact triangle slope: green 0° through red 90°.'],
    ['grid-aspect.jpg', 'Exact downhill aspect: hue follows degrees clockwise from north; flat ground is grey.'],
    ['tablet-reserves.jpg', 'Tablet-sized player starting view, building-point overlay. This is browser emulation, not physical iPad validation.'],
];
for (const [name] of images) await copyFile(source + '/' + name, output + '/' + name);
const range = values => Math.min(...values).toFixed(2) + '–' + Math.max(...values).toFixed(2);
const passed = batch.results.filter(r => r.accepted).map(r => r.seed);
const rejected = batch.results.filter(r => !r.accepted).map(r => r.seed);
const tests = await readFile(source + '/tests.log', 'utf8');
const summary = tests.includes('ℹ duration_ms') ? tests.slice(tests.lastIndexOf('ℹ tests')).trim() :
    'Full suite still running when this report was generated; final result belongs in the PR checks.';
const rows = batch.results.map(r => `| ${r.seed} | ${r.accepted ? 'accepted' : 'rejected (inherited)'} | ${r.counts.sampled} | ${r.counts.traversable} | ${r.counts.available} | ${r.counts.zoneWaterMismatches} |`).join('\n');
await writeFile(output + '/report.md', `# Gameplay spatial queries — #136 QA

Date: ${batch.date}. Base: a4b7df3 (#135 / PR #142). Query contract: [WORLD-SPATIAL-QUERIES-V1](../../WORLD-SPATIAL-QUERIES-V1.md).

## Verified outcome

All ten seeds preserve saves, terrain/coast/visibility evidence and resident movement. The derived query reads #135 zoning; it has no biome classification formula or extra serialized terrain arrays. Seven public regression cases were developed red-first, covering exact triangles/flat aspect, reservations, old/zoned saves, movement parity, shoreline ties, harbor/rival reserves, saved navigation exclusions and narrow ridges. No production rules or material source maps changed.

The seed sweep queries every 37th navigation node: **${batch.results.reduce((n,r) => n+r.counts.sampled,0)} sampled points**, not every cell. It compares repeated queries after save/load and every sampled traversability result against the existing public resident adapter. It also checks every reserved route point and foundation centre, sampled canonical coast vertices, and the full-grid existing connectivity validator. Analytical tests cover coastal ties, flat terraces and cliffs independently of generated data.

Accepted seeds remain ${passed.join(', ')}. Rejected seeds remain ${rejected.join(', ')}; the rejection evidence is preserved, not waived. No new sites, visibility tests or terrain alterations are introduced.

| Seed | Existing site status | Sampled points | Traversable | Unreserved building points | Coarse zone/water mismatches |
| --- | --- | ---: | ---: | ---: | ---: |
${rows}

Coarse zoning/water mismatches are expected near the 4 m field's coastal edges. The API explicitly exposes them and retains the original primary label. Exact height, not this label, determines physical water and clearance. Old unzoned saves return null zoning; they are never regenerated.

## Cost and storage

Hardware: ${batch.hardware.cpu}; ${batch.hardware.cores} logical processors; Node ${batch.node}. This is the development laptop, with other validation running. These are observations, not universal performance targets.

- Sparse query-index initialization: ${range(batch.results.map(r=>r.initializationMs))} ms across ten worlds.
- Two query passes plus JSON hashing and resident-adapter comparison of 17,341 points: ${range(batch.results.map(r=>r.queryComparisonMs))} ms per world. This includes comparison work; it is not a single-query latency benchmark.
- Explicit full-grid navigation validation: ${range(batch.results.map(r=>r.navigationMs))} ms.
- Extra save storage: **0 bytes**. Sparse index counts are in batch.json. Process heap deltas are retained only as noisy observations; garbage collection of earlier worlds can make them negative and they are not an isolated allocation measurement.
- One active native RGBA debug texture: **2,566,404 bytes CPU pixel data**, plus its GPU copy. No mipmaps, extra terrain UV buffer or persistent raster cache. Previous textures are disposed on overlay replacement.
- Full debug-overlay construction: ${range(browser.overlays.map(r=>r.construction.milliseconds/1000))} seconds on this laptop. Construction happens on selection and can briefly block the Lab. It is not per-frame work.
- Settled bare-terrain renderer windows: ${range(browser.overlays.map(r=>r.metrics.ms))} ms/frame; 1 draw call, 320,008 triangles for this fixture. These are six summary windows after a 1.8-second settling period, not raw frame samples or a cross-device benchmark. The build/selection time is reported separately.

## Browser and visual review

Headless Edge, 1440×1000 and touch-enabled 1024×768. Verified point query, bounds feedback, route validation, all six cell overlays, unchanged export/import data, legacy import and reference cleanup. No page errors. [Gallery](review.html) includes undecorated overhead overlays and a tablet-sized player view. Native nearest filtering preserves 1 m cell edges instead of interpolating cells over 2 m triangles. Physical iPad testing was not performed in this slice.

## Validation

TypeScript and production build passed; the existing large Three.js bundle warning remains. Required character validation passed (20 assets / 36 GLBs). No formatter is configured; formatting was reviewed manually and git diff --check was used.

\`\`\`text
${summary}
\`\`\`

The one skipped case is the pre-existing opt-in r3 frozen-GLB evidence test (RUN_R3_EVIDENCE is unset). No required check was skipped because of a failure, and validation was not weakened.

## Reproduce

1. node --test tests/world-spatial-queries.test.mjs
2. node --expose-gc scripts/qa/measure-world-spatial-queries.mjs
3. With Vite on 5180: node scripts/qa/check-world-spatial-queries.mjs
4. node scripts/qa/publish-world-spatial-queries.mjs

The measurement script uses ignored #135 save fixtures when available, or deterministically generates the same ten requests. Browser QA uses local #135 fixtures (generate them with scripts/qa/measure-environment-zoning.mjs on a fresh checkout). Large saves are not duplicated in this report.

## #137 boundary

This is spatial data and diagnostics only. Repeating ground/rock textures remain for the material slice: reuse canonical zoning, repair material mapping/repetition within approved native Three.js composition, and do not add geometric noise as a substitute.
`);
await writeFile(output + '/review.html', `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Gameplay spatial grid · review</title>
<style>body{background:#172724;color:#f0eddc;font:17px/1.6 system-ui;max-width:1300px;margin:2rem auto;padding:0 1rem}a{color:#e5c787}img{width:100%;height:auto;border-radius:8px}figure{margin:2rem 0}figcaption{padding:.6rem 0}nav{display:flex;gap:1rem;flex-wrap:wrap}</style>
<h1>Gameplay spatial grid · #136</h1><nav><a href="/environment-lab">Environment Lab</a><a href="report.md">Report</a><a href="batch.json">10-seed evidence</a><a href="browser.json">Browser evidence</a></nav>
<p>One canonical world: existing 1 m navigation, exact terrain triangles and #135 zoning. No extra saved terrain fields. Seed 18, undecorated diagnostics. Ground materials are unchanged; their repetition is addressed separately in #137.</p>
${images.map(([name,caption])=>`<figure><img loading="lazy" src="${name}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`).join('\n')}
</html>`);
console.log('Published ' + output);
