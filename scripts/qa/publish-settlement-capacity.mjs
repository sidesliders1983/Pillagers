import { readFile, mkdir, writeFile } from 'node:fs/promises';
const input = process.env.QA_OUTPUT || 'scratch/settlement-capacity';
const output = 'docs/qa/settlement-capacity';
const report = JSON.parse(await readFile(input + '/batch.json', 'utf8'));
await mkdir(output, { recursive: true });
await writeFile(output + '/batch.json', JSON.stringify(report, null, 2));
const number = value => (value / 1000).toFixed(2);
const fixed = report.results.filter(r => r.batch === 'fixed');
const held = report.results.filter(r => r.batch === 'held-out');
const accepted = report.results.filter(r => r.accepted);
const stageTotals = {};
for (const result of report.results) for (const [name, sample] of Object.entries(result.stages)) {
    stageTotals[name] = (stageTotals[name] ?? 0) + sample.milliseconds;
}
const timeBefore = report.results.reduce((n, r) => n + r.baselineMs, 0);
const timeAfter = report.results.reduce((n, r) => n + r.generationMs, 0);
const rows = report.results.map(r => `| ${r.seed} | ${r.batch} | ${r.accepted ? 'PASS' : 'REJECTED'} | ${r.regions.map(s => s.founding.containedHouseholds + '/' + s.founding.households).join(' / ')} | ${r.regions.map(s => s.founding.viable ? 'yes' : 'no').join(' / ')} | ${r.regions.map(s => s.expansion.viable ? 'yes' : 'no').join(' / ')} | ${number(r.baselineMs)} | ${number(r.generationMs)} |`).join('\n');
const markdown = `# Real-campaign capacity and placement cost — #134 / PR #139

The placement generator remains an **opt-in Lab experiment**. Merging this measurement does not authorize default campaign adoption or a smaller acceptance contract.

## Reproducible paired result

The original ten seeds retain **${fixed.filter(r => r.accepted).length}/10** acceptance. Five held-out seeds were fixed before inspection: **7, 73, 256, 4096, 65537**; **${held.filter(r => r.accepted).length}/5** pass. No seed was replaced. Every complete blueprint is identical to revision ${report.revision}, repeats under the current code, and round-trips through save/load. The six-parcel fixture, 0.6m grading, 160/40/240m constraints, berth and all successful LOS rays are unchanged.

| Seed | Batch | Six-parcel pair | Contained/required households, P / R | Founding viable, P / R | Expansion viable, P / R | Before s | After s |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

Rejected seeds show the highest-ranked separated candidate pair for diagnosis, **not an accepted reservation**. Their capacity results cannot override pair failure. No active rival clan is created.

## Actual founding and expansion experiment

The experiment calls the current public Simulation Core campaign factory and the actual Fjord projection/plot allocator. Both regions use the same ten-resident founding fixture for a controlled spatial comparison; this does not predict a future CPU clan's population. Inputs, RNG, events and saved worlds are unchanged. The allocator keeps its real **15×15m** household plots, **17m** grid, **7m** camp clearing and existing **0.15m** nine-point flatness requirement. No terrain is graded for this experiment; existing approved player grading is retained, and the rival reservation remains naturally ungraded.

Founding viability requires every household, all ten residents, three cattle, a dry contained camp clearing, connected household approaches and an unobstructed landing-to-camp route with a real longship berth. Plots that the current allocator places outside the reserved zone are explicitly rejected. Nature is treated as removable construction clutter, as in current gameplay; this is a geometry capacity experiment, not authorization to remove assets from a saved world.

Expansion is an explicitly funded spatial fixture: actual BuildHouse commands convert each current household in place; existing plot transfers and permanent-home paths are inspected. A second factory fixture with no founding couples tests ten independent households (0–3 additional household reservations depending on the actual party), without shrinking plots. This is a sensitivity case, **not a guarantee of indefinite growth or every upgraded Farmyard model**. The existing Fjord 15m plots and its source-Farmyard fallback remain separate limitations. Any broader expansion contract needs owner approval.

${accepted.every(r => r.regions.every(s => !s.founding.viable)) ? '**No accepted six-parcel pair proves founding-day viability in both regions with the current allocator.**' : '**Founding and expansion results differ from the six-parcel stress result; see the explicit per-region results.**'} The current game allocator was built around a flatter reference clearing, uses stricter flatness than the 0.6m local grading contract, and may search outside a region. These observations block **default campaign adoption**, not preservation of the useful opt-in placement/LOS experiment.

## Cost investigation

Paired total generation time: **${number(timeBefore)}s before, ${number(timeAfter)}s after** across the same fifteen requests. These are consecutive before/after observations on this development laptop, not isolated hardware benchmarks or raw render frames. Compilation/loading occurs before the timed calls. Other apps and thermal state can affect results; no hard performance target is invented. This run does **not** demonstrate an overall speedup: the observed total is about 5% higher despite fewer repeated harbor calls. The investigation identifies costs and removes redundant work; it is not a claim that the synchronous generation delay is solved.

${Object.entries(stageTotals).sort((a, b) => b[1] - a[1]).map(([stage, ms]) => `- ${stage}: ${number(ms)}s accumulated across fifteen worlds.`).join('\n')}

The seed-104 baseline probe found foundation fit/backtracking and repeated candidate navigation rebuilding dominate; harbor and LOS checks cost much less. Coast extraction now skips wholly dry/submerged cells before allocating canonical crossing triangles, preserving segment order exactly. Harbor and starting viewpoints are cached once per player candidate. Candidate count, rotations, layouts and backtracking budgets are unchanged. More invasive worker/renderer architecture remains outside this issue. **Generation is still synchronous and can block the Lab UI.** Phase observers are opt-in and never serialized.

## Recommended staging decision

Merge as an opt-in Lab research capability, as authorized in the conversation. Keep the actual campaign allocator, default generator, stress acceptance and saved rules unchanged. Before making v0.3e a campaign default, require a separate owner-approved integration contract: region-bounded real plots, bounded per-foundation grading and a defined founding/expansion capacity. Measure that proposal on the same fixed and held-out seeds before adopting yield or performance targets. This change makes no such default-adoption decision.

## Visual evidence and reproduction

[Geometry diagrams and review](review.html) show actual allocated plots for both regions, including out-of-reserve placements. The [five-island overhead/start-camera evidence](../settlement-sites-refinement/review.html) remains applicable because the complete canonical blueprints compare identically with that revision. The view for seed 18 is linked directly in the review. Every region's reasons, geometry, paths, berth, stage timings and input hashes are in [batch.json](batch.json).

Run: node scripts/qa/measure-settlement-capacity.mjs, then node scripts/qa/publish-settlement-capacity.mjs. Run node --test tests/settlement-sites.test.mjs for the public-contract regressions. These research outputs add no gameplay or balance rule.
`;
await writeFile(output + '/report.md', markdown);
const diagrams = [];
for (const result of report.results) {
    for (const [index, region] of result.regions.entries()) {
        const geometry = region.founding.geometry, b = region.bounds;
        const xs = [b.minX, b.maxX, ...geometry.plots.flatMap(p => [p.x - 9, p.x + 9])];
        const zs = [b.minZ, b.maxZ, ...geometry.plots.flatMap(p => [p.z - 9, p.z + 9])];
        const x = Math.min(...xs) - 10, z = Math.min(...zs) - 10;
        const width = Math.max(...xs) - x + 10, depth = Math.max(...zs) - z + 10;
        const shapes = [`<rect x="${b.minX}" y="${b.minZ}" width="${b.maxX - b.minX}" height="${b.maxZ - b.minZ}" fill="#29443a" stroke="#dbc77a" stroke-width="1"/>`,
            `<circle cx="${geometry.camp.transform.x}" cy="${geometry.camp.transform.z}" r="7" fill="#9b5a27" stroke="#ffcf71"/>`];
        for (const p of geometry.plots) shapes.push(`<rect x="${p.x - 7.5}" y="${p.z - 7.5}" width="15" height="15" fill="#4889a6" fill-opacity=".7" stroke="#acdeed" stroke-width=".6"/>`);
        for (const path of geometry.paths) shapes.push(`<polyline points="${path.points.map(p => p.x + ',' + p.z).join(' ')}" fill="none" stroke="#e1ba76" stroke-width=".65"/>`);
        for (const p of geometry.residents.filter(Boolean)) shapes.push(`<circle cx="${p.x}" cy="${p.z}" r="1" fill="#f6e4ba"/>`);
        for (const p of geometry.cattle.filter(Boolean)) shapes.push(`<circle cx="${p.x}" cy="${p.z}" r="1.4" fill="#ed9c89"/>`);
        const file = `seed-${result.seed}-${index === 0 ? 'player' : 'rival'}.svg`;
        await writeFile(output + '/' + file, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${z} ${width} ${depth}"><rect x="${x}" y="${z}" width="${width}" height="${depth}" fill="#142621"/>${shapes.join('')}</svg>`);
        diagrams.push(`<figure><img src="${file}" alt="Actual household plots in seed ${result.seed}, ${index === 0 ? 'player' : 'rival'} region"><figcaption>Seed ${result.seed} · ${index === 0 ? 'Player' : 'Rival'} · ${result.regionsAreSelected ? 'selected reserve' : 'rejected candidate'} · ${region.founding.containedHouseholds}/${region.founding.households} contained plots.<br>${region.founding.reasons.join(' ')}</figcaption></figure>`);
    }
}
await writeFile(output + '/review.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campaign capacity study</title><style>body{background:#142621;color:#ede7d8;font:17px/1.5 system-ui;margin:24px}main{max-width:1400px;margin:auto}a{color:#bddeed}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px}figure{margin:0}img{width:100%;height:320px;object-fit:contain;background:#10201c}figcaption{padding:12px}h1,h2{color:#dbc77a}</style><main><h1>Actual campaign capacity — #134</h1><p>Six Lab parcels do not prove seven to ten real campaign household plots. This is a read-only experiment. Default campaign adoption remains gated.</p><p><a href="report.md">Full method, results and stage timings</a> · <a href="batch.json">Raw evidence</a> · <a href="../settlement-sites-refinement/review.html">Unchanged island/start-camera comparisons</a></p><p>Gold outline: reserved zone. Blue: actual 15×15m plots. Orange: 7m camp clearing. Gold paths: household circulation. White: residents. Pink: cattle. Plots outside the outline are failures.</p><h2>Representative player start · seed 18</h2><img src="../settlement-sites-refinement/player-start.png" style="height:auto" alt="Unchanged seed 18 player start camera"><h2>Both regions · fixed and held-out seeds</h2><div class="grid">${diagrams.join('')}</div></main></html>`);
console.log(markdown.split('## Actual')[0]);
