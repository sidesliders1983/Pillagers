import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const source = 'artifacts/island-map', output = 'docs/qa/island-map';
const controls = JSON.parse(await readFile(source + '/controls.json', 'utf8'));
const scene = JSON.parse(await readFile(source + '/scene.json', 'utf8'));
assert.equal(controls.status, 'PASS');
assert.equal(scene.status, 'PASS');
await mkdir(output, { recursive: true });
for (const file of ['controls.json', 'scene.json', 'desktop-32-closed.png', 'desktop-32-home.png',
    'mobile-390-open.png', 'mobile-390-closed.png', 'mobile-844-open.png'])
    await copyFile(source + '/' + file, output + '/' + file);
const rows = scene.runs.flatMap(run => run.measurements.map(sample =>
    `| ${run.campaign} / ${run.terrain} | ${sample.quality} | ${sample.open ? 'Open' : 'Closed'} | ${sample.p50.toFixed(2)} | ${sample.p95.toFixed(2)} | ${sample.scene.drawCalls} | ${sample.map.baseMs.toFixed(2)} | ${sample.map.maximumCameraMs.toFixed(2)} |`
)).join('\n');
await writeFile(output + '/report.md', `# Island map and Home — #194

The owner requested a lower-left icon, collapsed by default, superseding the issue's original persistent bottom-right desktop proposal. There is one numbered destination flag per active group, never individual resident markers. Returning groups point Home. [Current contract](../../ISLAND-MAP-V01.md).

## Validation

24 related map/discovery/camera tests pass. Focused browser controls pass: ${controls.checks.join('; ')}. Geographic marks are explicitly checked inside the raster's SVG overlay, rather than inside toolbar icons.

Actual Fjord scene checks: ${scene.runs.map(run => `campaign ${run.campaign}, terrain ${run.terrain}: ${run.checks.join('; ')}`).join('. ')}. No page errors. These are three campaign seeds on **two distinct production terrains**, not three island geometries.

The paused campaign remains byte-equivalent through camera navigation, Home and orbit/zoom. Map clicks do not commit expedition orders or discovery. Existing UI uses the Horizon shell; physical iPhone/iPad testing remains open. Screenshots are from the actual game and were inspected visually. [Existing Horizon reference](../mobile-horizon-182/README.md).

## Measurements

Windows Edge on the development laptop. Each row retains all 120 consecutive frame intervals in [scene.json](scene.json); p50/p95 are frame intervals in milliseconds, not isolated map CPU timings. Closed/open is a same-build comparison, not a historical before/after claim. No millisecond threshold is used as a merge gate.

| Campaign / terrain | Quality | Map | Frame p50 ms | Frame p95 ms | Scene draw calls | Map generation ms | Maximum camera overlay ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
${rows}

The geographic preview is at most 128 × 128. Its typed preview/base/output caches total 212,992 bytes at that size; the Canvas backing is another 65,536 bytes. These are explicit buffer sizes, not a measured total browser heap. No additional WebGL map renderer, texture or draw pass is created. SVG/Canvas DOM compositing and browser overhead are not included in those byte counts. GPU time and isolated retained JS heap were unavailable in this run.

Camera overlays are bounded to at most 10 updates/second while open and only when their signature changes; closing the map skips camera work. Raster and mask work are separate. Recorded diagnostics expose generation time, mask updates, camera update count, maximum camera CPU time and backing bytes. Quality changes retain one geographic base build.

## Reproduce and review

Run \`node --test tests/island-map.test.mjs tests/camera-clearance.test.mjs tests/clan-discovery.test.mjs tests/discovery-cache.test.mjs tests/settlement-discovery.test.mjs\`, then \`node scripts/qa/check-island-map.mjs\` and \`node scripts/qa/check-island-map-scene.mjs\` against the current served checkout. Set \`QA_ORIGIN\` to override port 5180. Publish with \`node scripts/qa/publish-island-map.mjs\`.

TypeScript/build, full-suite and exact-head CI results are reported on the draft PR. Source formatting was reviewed manually; no formatter is configured. Owner usefulness/fit approval and physical-device acceptance remain open before merge. Historical reports are unchanged.
`);
await writeFile(output + '/review.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FjordSide · Island map</title>
<style>body{margin:auto;max-width:1100px;padding:24px;background:#192529;color:#eee8dc;font:17px/1.55 system-ui}h1,h2{font-family:Georgia,serif;color:#dcbf84}a{color:#f4d59a}img{display:block;width:100%;border-radius:8px}figure{margin:24px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.portrait img{max-height:650px;object-fit:contain}</style></head>
<body><h1>Island map &amp; Home</h1><p><a href="/fjord-play">Open your settlement</a> · <a href="report.md">Validation and measurements</a></p>
<p>Use the Map icon in the lower-left to show or hide the map. Home returns the camera directly to the campfire. A numbered flag marks each expedition group's destination. Returning groups point Home; individuals are not marked.</p>
<p>Known points move only the camera. Dim unexplored terrain stays undiscovered; no hidden enemy markers appear. Mobile uses a deliberate map window with Home and Close. The campaign continues running if it was already running.</p>
<figure><img src="desktop-32-home.png" alt="Actual game with lower-left island map, Home marker, camera footprint and expedition destination flag"><figcaption>Desktop map open at Home, with Group 1's destination on the same island.</figcaption></figure>
<figure><img src="desktop-32-closed.png" alt="Actual Fjord game with map collapsed and Map and Home icons in the lower-left"><figcaption>Collapsed by default.</figcaption></figure>
<div class="grid"><figure class="portrait"><img src="mobile-390-closed.png" alt="Phone game with only lower-left Map and Home controls"><figcaption>Phone map closed.</figcaption></figure><figure class="portrait"><img src="mobile-390-open.png" alt="Phone map overlay with Home and Close buttons"><figcaption>Phone map open.</figcaption></figure></div>
<figure><img src="mobile-844-open.png" alt="Landscape phone map window respecting the Horizon controls"><figcaption>Landscape map window.</figcaption></figure>
<p>Tested with Edge device/touch emulation. Physical iPhone/iPad usefulness and fit still need owner review.</p></body></html>`);
console.log('Published actual map screenshots, checks and retained frame samples.');
