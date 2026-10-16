import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const source = 'artifacts/clan-discovery', output = 'docs/qa/clan-discovery';
const matrix = JSON.parse(await readFile(source + '/matrix.json', 'utf8'));
const render = JSON.parse(await readFile(source + '/render-matrix.json', 'utf8'));
const route = JSON.parse(await readFile(source + '/observer-route.json', 'utf8'));
const browser = JSON.parse(await readFile(source + '/browser.json', 'utf8'));
if (!browser.runtime || !browser.touchSelection) throw new Error('Finish the final production touch check first.');
await mkdir(output, { recursive: true });
const pictures = matrix.results.flatMap(row => ['top-clear','top-fog','oblique-clear','oblique-fog','dusk','night'].map(suffix => row.seed + '-' + suffix + '.jpg'));
pictures.push('founding-tablet.png','founding-phone.png','high-zoom.png','route-midpoint.jpg','route-arrived.jpg','route-departed.jpg');
for (const name of [...pictures,'matrix.json','render-matrix.json','observer-route.json','browser.json'])
    await copyFile(source + '/' + name, output + '/' + name);
const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1];
const performanceRows = [];
for (const quality of ['low','standard']) for (const fog of [false,true]) {
    const runs = render.results.flatMap(row => row.metrics.filter(m => m.quality === quality && m.fog === fog));
    const frames = runs.flatMap(run => run.samples);
    performanceRows.push(`| ${quality} | ${fog ? 'On' : 'Off'} | ${runs[0].drawCalls} | ${runs[0].triangles.toLocaleString('en-US')} | ${percentile(frames.map(f=>f.submitMs),.5).toFixed(2)} | ${percentile(frames.map(f=>f.intervalMs),.95).toFixed(2)} |`);
}
const rows = matrix.results.map(r => `| ${r.seed} | ${r.accepted ? 'PASS' : 'Existing rejection'} | ${(r.exploredCells/r.totalCells*100).toFixed(2)}% | ${r.observationMs.toFixed(2)} | ${r.savedBytes} | ${r.rivalVisibility ?? 'No reserved rival'} |`).join('\n');
const stepObservations = route.observations.map(o=>o.timings.observationMs);
const stepPresentation = route.observations.map(o=>o.timings.presentationMs);
const range = values => `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}`;
await writeFile(output + '/report.md', `# Clan Discovery & Fog of War — #147

Status: opt-in first slice of #146; technical review ready after green current-head CI. Default rollout and physical-mobile/owner visual acceptance remain pending. [Review gallery](review.html) · [Contract](../../CLAN-DISCOVERY-V04A.md).

## Canonical result

The 8 m prototype ties explored/current masks to one canonical world identity and clan. Founding settlement/landing observations use the existing terrain-triangle LOS; camera, quality, light/weather fog and the loading fly-in do not reveal territory. The public read model is frozen and clan-scoped. Foreign marker fields are explicitly selected and require current visibility; old Scouted/Surveyed intelligence is separate. Existing four-direction campaigns retain their state and mission semantics. No Core clocks, RNG, stocks, events or published story text are changed by binding discovery.

47 relevant public contract tests passed, including eight new discovery/save/session tests; TypeScript, production build and complete character/Lab asset validation passed. The production browser check covers exact mask reload, orbit/zoom, 390 px touch selection and both quality controls. The first new browser test failed before opt-in wiring; public validation tests failed before their corresponding guards. The actual foreground pixel test failed before native depth testing was restored, and the draw-call test failed before the unnecessary transparent second pass was removed.

## Ten fixed geography seeds

These are ten structural generator fixtures, not ten new production campaign layouts: production still selects its approved two-island pool. Rejected generator seeds were retained, not replaced or made valid by weakening site rules. The six accepted site pairs all keep the reserved rival centre unknown. The four rejected fixtures have no reserved rival.

| Seed | Inherited site result | Known cells | Initial observation ms | Discovery JSON bytes | Rival centre |
| --- | --- | --- | --- | --- | --- |
${rows}

The JSON numbers include metadata and hexadecimal encoding. The two bitsets themselves total 2,500 raw bytes at 8 m, not 2,500 encoded JSON bytes. The saved extension is approximately 5.3 kB per one-clan world. The measured 4/8/16 m alternatives and exact timings are retained in [matrix.json](matrix.json). CPU timings are individual diagnostic calls, not distributions or physical-iOS measurements.

## Render cost

Native alphaMap, no bespoke shader or offscreen multipass. The steady layer adds one draw call and 320,008 triangles over the unchanged terrain; an active 0.8 s fade can temporarily add one further call. The geometry is 7,056,436 attribute/index bytes; each alpha texture is 646,416 bytes. A fade shares the geometry and temporarily retains the previous texture/material. These are retained typed-array sizes, excluding transient builder arrays, process overhead and GPU copies. No full-grid computation runs every frame.

The isolated, undecorated Three.js fixture used 1024×768 desktop Edge with 60 raw frame samples per condition/seed (2,400 samples total), Low pixel ratio 1 and Standard 1.5. This isolates the fog workload; it is not the full settlement or physical Safari. Submit time measures CPU render submission, not completed GPU time. RAF intervals include scheduling/vsync. Background desktop activity was uncontrolled; raw samples and source hashes are preserved in [render-matrix.json](render-matrix.json).

| Quality | Fog | Draw calls | Triangles | Median submit ms | P95 RAF interval ms |
| --- | --- | --- | --- | --- | --- |
${performanceRows.join(String.fromCharCode(10))}

The real 390 px game has separate raw RAF samples and its existing renderer diagnostics in [browser.json](browser.json). Emulation is not a physical iPhone/iPad test. Do not infer a mobile performance guarantee from this desktop run.

## Confirmed observer proof

A deliberately labeled developer fixture traverses 25 confirmed samples of the existing seed-18 canonical navigation connection. It does not dispatch a Core mission, charge provisions or pretend that #148 is implemented. Observed cells commit immediately; successive masks reveal progressively rather than at route planning. Interrupted fades preserve visual continuity. Coverage grows from ${route.startingCells} to ${route.arrivedCells} cells. Departing retains ${route.departedCells} mapped cells while removing the live rival fixture. Native depth testing preserves the known red foreground box (actual pixel ${JSON.stringify(route.foregroundPixel)}), rather than allowing a distant fog surface to paint over it.

Per-step browser diagnostics are ${range(stepObservations)} ms for canonical observation and ${range(stepPresentation)} ms for mask presentation/reconciliation in this fixture. These synchronous update costs are separate from steady render cost; they must be budgeted in the real #148 travel integration before default rollout. No per-frame recomputation is used. [Raw observations](observer-route.json).

## Scope and remaining review

Unknown nature roots and standing-tree targets are excluded from production scene assembly. A future allowed discovery reconciles scenery while retaining cleared plots. Ordinary ambient residents cannot reveal terrain and stay on mapped ground. The current game only instantiates the player's own entities: a living physical rival is #149. The sanitized marker/label/picking contract is proven with fixtures; this report does not claim that an unimplemented rival scene has been end-to-end tested. No cryptographic anti-cheat secrecy is claimed.

Day, dusk/night, atmospheric fog on/off, full-map and oblique views are included for all ten seeds. Terrain edges remain recognizably based on an 8 m grid at high global zoom despite the inward feather. This is a visual prototype, not owner-approved final fog art. The whole island remains allowed in the loader preview, without CPU sites or resource intelligence.

No physical-mobile coverage is claimed for #147; the owner's earlier 10 s/2 min return tests concerned #161. Default activation is deferred until the first playable #147+#148 exploration milestone and owner review. Expedition UI/travel (#148), the real rival (#149), spatial missions (#150) and final epic QA (#151) remain open.
`);
const figure = (src, text) => `<figure><img loading="lazy" src="${src}" alt="${text}"><figcaption>${text}</figcaption></figure>`;
const cards = matrix.results.map(r => `<details><summary>Seed ${r.seed} · ${r.accepted ? 'valid site pair' : 'inherited site rejection'} · ${(r.exploredCells/100).toFixed(2)}% known</summary><div class="grid">${figure(r.seed+'-top-clear.jpg','Geography preview · no knowledge granted')}${figure(r.seed+'-top-fog.jpg','Founding knowledge · top-down')}${figure(r.seed+'-oblique-clear.jpg','Same terrain · oblique baseline')}${figure(r.seed+'-oblique-fog.jpg','Same camera · discovery fog')}${figure(r.seed+'-dusk.jpg','Dusk + atmospheric fog')}${figure(r.seed+'-night.jpg','Night · atmospheric fog off')}</div></details>`).join('\n');
await writeFile(output + '/review.html', `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FjordSide · Discovery review</title>
<style>body{margin:0;background:#142831;color:#ede8d5;font:16px/1.55 system-ui}
main{max-width:1240px;margin:auto;padding:24px}
h1{font-family:Georgia,serif;font-size:2.2rem}
a{color:#efcf86}
nav{display:flex;gap:16px;flex-wrap:wrap}
nav a,summary{padding:12px;border:1px solid #718172;border-radius:8px}
p{max-width:84ch}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px}
figure{margin:0}
img{display:block;width:100%;border-radius:7px}
figcaption{padding:6px 0;color:#d0c8ae}
details{margin:18px 0}
summary{cursor:pointer;background:#1a3439}
aside{padding:16px;background:#203b3e;border-radius:8px}
.phone img{max-height:680px;width:auto;max-width:100%;margin:auto}
</style>
<main>
<h1>Discovery v0.4A · Fog of war</h1>
<p>The first exploration slice saves what the clan has actually observed. Camera travel grants no knowledge. Mapped terrain remains after departure; live rival details require current observation. This review is a prototype; Expedition Group controls follow in #148.</p>
<nav>
<a href="/fjord-play?discovery=1&amp;debugDiscovery=1" target="_blank" rel="noopener">Open fog prototype in a new tab</a>
<a href="report.md">Evidence and limitations</a>
<a href="../../CLAN-DISCOVERY-V04A.md">Implementation contract</a>
</nav>
<aside>
<p>Use a new campaign to see the prototype. If a recovery window appears, choose <strong>Start a new campaign</strong>. Existing active/imported campaigns retain their saved fog setting. Normal new campaigns remain unchanged while this slice is reviewed. The whole island in the loading preview does not reveal it in gameplay.</p>
<p>Please review the fog boundary near the settlement, coast and ridge, orbit/zoom and touch selection. Actual physical iPhone/iPad coverage for this slice is still pending.</p>
</aside>
<h2>Real game · 1024 px / 390 px</h2>
<div class="grid">${figure('high-zoom.png','Actual game · known founding surroundings')}<div class="phone">${figure('founding-phone.png','Actual game · phone-size viewport')}</div>
</div>
<h2>Confirmed-observer fixture</h2>
<p>This developer-only proof follows an existing navigation route. It demonstrates committed map growth and retained knowledge; it is not a playable expedition or a simulated rival clan.</p>
<div class="grid">${figure('route-midpoint.jpg','Confirmed observations · midway')}${figure('route-arrived.jpg','After confirmed arrival')}${figure('route-departed.jpg','After departure · mapped ground retained')}</div>
<h2>Ten structural seeds · before and after</h2>
<p>All comparisons use the same terrain and camera. Four inherited site rejections are retained explicitly. These fixtures test geography and fog; they do not replace the approved campaign island pool.</p>${cards}<p>
<a href="matrix.json">CPU and storage data</a> · <a href="render-matrix.json">All raw render samples</a> · <a href="observer-route.json">Confirmed observation proof</a> · <a href="browser.json">Production browser results</a>
</p>
</main>
</html>`);
console.log('Published the measured review gallery and report.');
