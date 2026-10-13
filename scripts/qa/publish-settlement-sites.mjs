import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const source = 'scratch/settlement-sites-refinement';
const destination = 'docs/qa/settlement-sites-refinement';
await mkdir(destination, { recursive: true });
const batch = JSON.parse(await readFile(source + '/batch.json', 'utf8'));
const browser = JSON.parse(await readFile(source + '/browser.json', 'utf8'));
for (const file of ['batch.json', 'browser.json', 'old-save-check.json', 'validation.json', ...browser.captures]) {
    await copyFile(source + '/' + file, destination + '/' + file);
}
const accepted = batch.results.filter(r => r.accepted);
const round = value => Number(value).toFixed(1);
const table = batch.results.map(r => {
    const p = r.selected;
    const eligible = r.compartments.filter(c => c.eligibleAnchors).length;
    const fits = r.candidates.filter(c => c.foundations.length === 6).length;
    return `| ${r.seed} | ${r.accepted ? 'PASS' : 'REJECTED'} | ${eligible}/${r.compartments.length} | ${fits}/48 | ` +
        `${p ? round(p.centerDistance) : '-'} | ${p ? round(p.bufferDistance) : '-'} | ${p?.routeLength ?? '-'} | ` +
        `${r.visibility.rayCount || '-'} | ${round(r.generationMs / 1000)} | ${r.foundingDay.tents} |`;
}).join('\n');
const coverage = batch.results.map(r => `### Seed ${r.seed}\n\n` + r.compartments.map(c =>
    `- ${c.id}: ${c.candidateIds.length}/${c.eligibleAnchors} anchors evaluated; ${c.sixParcelFits} six-parcel fits. ` +
    (c.reasons.join(' ') || 'Coverage retained.')).join('\n') +
    `\n\nPlacement attempts: ${r.searchCost.layoutAttempts}; nodes: ${r.searchCost.placementNodes}. ` +
    `Best partial placement counts (parcels: candidates): ${JSON.stringify(r.searchCost.partialCapacity)}.\n`).join('\n');
const metricRows = browser.layouts.map(layout => {
    const windows = layout.rendererWindows;
    return `| ${layout.seed} | ${round(Math.min(...windows.map(w => w.ms)))}-${round(Math.max(...windows.map(w => w.ms)))} | ` +
        `${windows[0].calls} | ${windows[0].triangles} | ${windows[0].geometries} | ${windows[0].textures} |`;
}).join('\n');
const report = `# Settlement site refinement - owner review\n\n` +
`Issue #134 / PR #139. Fixed requested seeds: ${batch.seeds.join(', ')}.\n\n` +
`**${accepted.length}/10 accepted**, compared with 1/10 in the unchanged [initial report](../settlement-sites/report.md). ` +
`The accepted seeds are ${accepted.map(r => r.seed).join(', ')}. All ten reproduce their complete blueprint hash and round-trip saves. ` +
`No seed was substituted and the six-parcel requirement, authored sizes, setbacks, 0.6m cut/fill and 160/40/240m limits remain.\n\n` +
`## Fixed batch\n\n` +
`| Seed | Result | Eligible/all compartments | Six-parcel fits | Centers m | Zone gap m | Route m | Full proof rays | Generation s | Founding tents |\n` +
`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${table}\n\n` +
`Eligible compartments have at least one connected 3000m² coastal anchor. All cores, including ineligible ones, are recorded below and in the Lab. ` +
`The route is measured from the actual landing, not between site centers. Every accepted ray is terrain-occluded at 8m roof height, including footprint edges.\n\n` +
`## What changed\n\n` +
`- Lowland cores and geodesic expansion identify terrain compartments; candidate budgets are shared round-robin rather than spent on a single globally ranked plain.\n` +
`- Denser anchors and a 65m natural-pocket search support twelve bounded layout/order combinations, authored plus compass rotations, and backtracking. The terrain silhouette is untouched.\n` +
`- Physical poses and player routes are cached. Disconnected pairs fail before expensive sightline work. A visible sample stops a rejected proof early, explicitly reported as a lower bound; accepted proofs remain complete.\n` +
`- Saves retain full terrain and optional diagnostics. A blueprint produced from original revision da0c7c6 was parsed by the new code without changing any field; see old-save-check.json.\n\n` +
`## Remaining limitations and capacity decision\n\n` +
`Seeds 17, 91 and 1337 have complete fits concentrated in one compartment. Seed 512 has fits in two nearby compartments but no pair satisfying separation/buffer. ` +
`Seed 104 has multiple buildable areas but fails land connection or visibility. More searching is not proof that all rejected terrain is unusable. ` +
`Five of ten is still a material limitation, so the feature remains opt-in and the PR draft for review.\n\n` +
`The [capacity review](../../SETTLEMENT-CAPACITY-REVIEW.md) distinguishes the actual founding party (ten people, seven to ten tents, zero permanent houses) from the six mixed Lab expansion parcels. ` +
`The batch records actual tent counts from Core; this is not a spatial guarantee for those gameplay plots. Any smaller acceptance contract needs explicit owner approval.\n\n` +
`## Visual and browser review\n\n` +
`Five different accepted seeds have overhead and actual player-start images. Nature and atmospheric fog are disabled for the proof; source ground/water and authored player houses remain visible. ` +
`No rival village or CPU state is created. The overhead debug camera deliberately reveals the reservation. ` +
`Seed 42 places the player in an enclosed inlet valley; 211 separates opposite outer shores through intervening highland and a long coastal walk. ` +
`The images show materially different geography and layouts. Ground texture striping is visible in the existing material and is outside this placement change.\n\n` +
`Browser checks passed for generation, compartment/pair diagnostics, complete export/import, shared start camera, rejected-world UI and reference fallback. ` +
`1024×768 touch-enabled browser viewport and orbit passed. A physical iPad was not tested.\n\n` +
`## Cost observations\n\n` +
`Generation took ${round(Math.min(...batch.results.map(r => r.generationMs)) / 1000)}-${round(Math.max(...batch.results.map(r => r.generationMs)) / 1000)} seconds in this run; the initial implementation reported 2.4-5.3 seconds. ` +
`These are development-machine observations, not a controlled speed benchmark or a hard millisecond gate. The increased generation cost buys broader coverage; generation is synchronous and can pause the Lab UI. ` +
`This limitation is reported rather than concealed by rerolling or weakening checks.\n\n` +
`The following are four renderer summary windows per desktop view, with nature/fog off. They are not individual frame samples, peak RAM or GPU timings. ` +
`Other validation ran on the same old development laptop. These observations cannot certify physical-device performance.\n\n` +
`| Seed | ms/frame window range | Draw calls incl. shadows | Triangles | Geometries | Textures |\n` +
`| --- | --- | --- | --- | --- | --- |\n${metricRows}\n\n` +
`Tablet window: ${round(browser.tabletMetrics.ms)} ms/frame; ${browser.tabletMetrics.calls} draw calls. ` +
`No rendering technology, shader or asset size was changed.\n\n` +
`## Per-compartment evidence\n\n${coverage}\n` +
`## Validation\n\n708 local tests passed; zero failed; one existing opt-in skip (709 total). All 13 focused placement tests, the TypeScript/Vite build and character validation with Lab previews passed. GitHub CI is tracked independently at the PR head. See validation.json. No formatter is configured; manual review and git diff --check passed.\n\n` +
`## Reproduce\n\n` +
'```text\nnode --test tests/settlement-sites.test.mjs\nnode scripts/qa/measure-settlement-sites.mjs\nnode scripts/qa/check-settlement-sites.mjs\nnode scripts/qa/check-settlement-sites-previous-save.mjs\nnode scripts/qa/publish-settlement-sites.mjs\n```\n';
await writeFile(destination + '/report.md', report);
const sections = accepted.map(r => {
    const overhead = r.seed === 18 ? 'sites-overhead.png' : `seed-${r.seed}-overhead.png`;
    const start = r.seed === 18 ? 'player-start.png' : `seed-${r.seed}-start.png`;
    return `<section><h2>Seed ${r.seed}</h2><p>${round(r.selected.centerDistance)}m between centers; ` +
        `${round(r.selected.bufferDistance)}m construction gap; ${r.selected.routeLength}m walking route; ` +
        `${r.visibility.rayCount} terrain-blocked roof-height rays.</p><figure><img loading="lazy" src="${overhead}" ` +
        `alt="Seed ${r.seed}: player and rival zones separated by natural terrain"><figcaption>Overhead reservations and route.</figcaption></figure>` +
        `<figure><img loading="lazy" src="${start}" alt="Seed ${r.seed}: actual player starting view with rival terrain-hidden">` +
        `<figcaption>Actual start camera used in the proof. Nature and fog disabled.</figcaption></figure></section>`;
}).join('\n');
await writeFile(destination + '/review.html', `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Settlement placement refinement review</title>
<style>body{margin:0;background:#142724;color:#eee7d4;font:17px/1.5 system-ui}main{max-width:1450px;margin:auto;padding:24px}h1,h2{color:#dbc890}a{color:#bde6da}img{width:100%;height:auto;border:1px solid #536a60}figure{margin:20px 0}section{margin:48px 0}.note{padding:16px;background:#344335}p{max-width:1080px}</style>
<main><h1>Settlement placement refinement</h1><p>Issue #134 / PR #139 - same terrain, stronger placement search.</p>
<p class="note"><strong>${accepted.length}/10 fixed seeds accepted (previously 1/10).</strong> No changed seeds, smaller parcels or relaxed limits. The PR remains draft for review; 5/10 is still a limitation.</p>
<p><a href="report.md">Full report and compartment evidence</a> · <a href="batch.json">Ten-seed measurement</a> · <a href="browser.json">Browser evidence</a> · <a href="../../SETTLEMENT-CAPACITY-REVIEW.md">Founding versus expansion</a> · <a href="../settlement-sites/review.html">Original review</a></p>
<p><a href="/environment-lab">Environment Lab</a> → Settings → Nordic Island → Player &amp; hidden rival sites → one of ${accepted.map(r => r.seed).join(', ')} → Generate World.</p>
<p>Green: player; pink: reserved rival; gold: neutral buffers; cyan: natural walking route; orange: terrain-blocked rays. The overlay draws a representative subset; exports retain every measured ray.</p>
${sections}
<section><h2>Tablet viewport</h2><p>1024 × 768 browser emulation, not a physical-device certification.</p><img src="tablet-start.png" alt="Tablet player starting view"></section>
</main></html>`);
console.log('Published review for ' + accepted.length + ' accepted fixed seeds.');
