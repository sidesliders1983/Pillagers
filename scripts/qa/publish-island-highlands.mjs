import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import sharp from 'sharp';
const source = process.env.QA_OUTPUT ?? 'scratch/island-highlands';
const output = 'docs/qa/island-highlands';
const measured = JSON.parse(await readFile(source + '/measurements.json', 'utf8'));
const browser = JSON.parse(await readFile(source + '/browser.json', 'utf8'));
if (browser.errors.length || browser.checks.length !== 3 || browser.captures.length !== 41) {
    throw new Error('Complete browser evidence is required before publishing.');
}
await mkdir(output, { recursive: true });
await copyFile(source + '/measurements.json', output + '/measurements.json');
await copyFile(source + '/browser.json', output + '/browser.json');
for (const capture of browser.captures) await copyFile(source + '/' + capture.file, output + '/' + capture.file);
const stops = [[0, [114, 130, 107]], [16, [137, 145, 113]], [32, [164, 154, 130]],
    [48, [176, 157, 136]], [80, [231, 216, 202]]];
for (const seed of measured.seeds) for (const mode of ['before', 'after']) {
    const { blueprint: world } = JSON.parse(await readFile(source + '/' + seed + '-' + mode + '.json', 'utf8'));
    const pixels = Buffer.alloc(world.terrain.heights.length * 3);
    world.terrain.heights.forEach((height, i) => {
        const elevation = height - world.waterLevel;
        let colour = [37, 70, 89];
        if (elevation > 0) {
            const last = stops.findIndex(([upper]) => upper >= elevation);
            if (last < 0) colour = stops.at(-1)[1];
            else {
                const [low, a] = stops[Math.max(0, last - 1)], [high, b] = stops[last];
                const amount = high === low ? 0 : (elevation - low) / (high - low);
                colour = a.map((value, channel) => Math.round(value + amount * (b[channel] - value)));
            }
        }
        pixels.set(colour, i * 3);
    });
    await sharp(pixels, { raw: { width: world.terrain.columns, height: world.terrain.rows, channels: 3 } })
        .resize(802, 802, { kernel: 'nearest' }).png().toFile(output + '/' + seed + '-' + mode + '-elevation.png');
}
const f = number => number.toFixed(1);
const pairs = measured.seeds.map(seed => ({ seed,
    before: measured.results.find(r => r.seed === seed && r.mode === 'before'),
    after: measured.results.find(r => r.seed === seed && r.mode === 'after') }));
const tableRows = pairs.map(({ seed, before, after }) => [seed,
    f(before.peakAboveSea) + ' → ' + f(after.peakAboveSea),
    f(before.highlandSlopeP90) + ' → ' + f(after.highlandSlopeP90),
    after.accepted ? 'PASS' : 'REJECTED', after.visibility?.exposedRays,
    after.selected?.routeLength].join(' | '));
const explanation = `The owner accepted the #137 material direction and then requested lower central ridges. This is a separate, explicitly versioned geography follow-up within PR #145. The earlier ground-blending gallery remains unchanged.

The existing eroded ridge field is lowered above 6.2m over sea level. Across the next 12 vertical metres, the height derivative transitions smoothly from 1 to a spatially varying retained fraction of 0.40–0.58. Above that shoulder, the same fraction applies. The broad variation reuses the existing bedrock noise stream; it does not place cones, alter drainage routes, add mesh noise or store another terrain field. The coastline, sea and lowlands at/below 6.2m are unchanged before bounded foundation grading.

New Environment Lab islands explicitly use fjordside-island-v0.3b-r3, or fjordside-island-v0.3e-r2 with Player & hidden rival sites. Existing API defaults and campaign presets remain unchanged. Old versions and imports preserve their original canonical field. All five pre-change saved fixtures regenerate byte-for-byte; all five new worlds reproduce deterministically and pass full save/load.

The #134 rules are unchanged: 160m between centres, 40m between construction zones, 240m minimum landing route, at most 0.6m foundation grading, and terrain occlusion of the sampled rival footprint up to 8m building height from all three starting viewpoints. The final scenery-aware connection is checked as walkable. The planner reruns after lowering; some pairs and routes change. Visibility remains a documented sampled-footprint proof, not a guarantee for every future camera or tower.

All five fixed seeds pass. Peaks fall from 58.8–75.8m to 37.3–46.1m. The reported slope statistic is the 90th percentile of physical-query slopes at the same cells that were above 16m in the old world; it is not an average over an expanding lowland region. No acceptance criterion, seed or material recipe was changed to achieve this result. These are five regression examples, not a claim that every seed qualifies.

Before/after views use identical cameras, sun direction, light colour/intensity and exposure. Fog, water, vegetation and village are disabled in the paired captures. Shadow bounds automatically fit each changed terrain and are recorded in browser.json. Material maps and projection settings are unchanged; #135 zoning is recomputed from the new canonical slopes/elevation through its existing classifier. The final settlement image is contextual, not a matched camera pair, because the selected player site can change.

Elevation maps use a fixed 0–80m scale in metres above sea level and show the entire 800×800m heightfield without vegetation or material detail. Bare-form and source-material renders are separate. No new performance benchmark is claimed for this geometry pass. Visual acceptance remains with the owner.`;
await writeFile(output + '/report.md', '# Gentler island highlands — controlled comparison\n\n' + explanation +
    '\n\n| Seed | Peak metres, before → after | Highland slope p90, m/m | Sites | Exposed roof rays | Route metres |\n' +
    '| --- | --- | --- | --- | --- | --- |\n' + tableRows.map(row => '| ' + row + ' |').join('\n') +
    '\n\n## Reproduce\n\n```text\nnode --test tests/island-highlands.test.mjs\nnode scripts/qa/measure-island-highlands.mjs\nnode scripts/qa/check-island-highlands.mjs\nnode scripts/qa/publish-island-highlands.mjs\n```\n');
const paired = (seed, suffix, title) => `<h3>${title}</h3><div class="pair">${['before', 'after'].map(mode =>
    `<figure><a href="${seed}-${mode}-${suffix}"><img loading="lazy" src="${seed}-${mode}-${suffix}" alt="Seed ${seed}, ${mode}, ${title}"></a><figcaption>${mode === 'before' ? 'Before · v0.3e' : 'After · v0.3e-r2'}</figcaption></figure>`).join('')}</div>`;
const sections = pairs.map(({ seed, before, after }) => `<section id="seed-${seed}"><h2>Seed ${seed}</h2>
<p>Peak: <b>${f(before.peakAboveSea)} → ${f(after.peakAboveSea)}m</b>. Sites ${after.accepted ? 'PASS' : 'REJECTED'}; exposed roof rays: ${after.visibility?.exposedRays}; walking route: ${after.selected?.routeLength}m.</p>
${paired(seed, 'overview-none.jpg', 'Ridge detail · unchanged source-material recipe')}
${paired(seed, 'island-oblique-form.jpg', 'Entire island · bare form')}
${paired(seed, 'elevation.png', 'Top-down elevation · fixed 0–80m scale')}
${paired(seed, 'overview-form.jpg', 'Ridge detail · bare form')}
${paired(seed, 'island-oblique-none.jpg', 'Entire island · unchanged source-material recipe')}</section>`).join('');
await writeFile(output + '/review.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gentler island highlands · Pillagers</title><style>
body{margin:0;padding:24px;background:#152822;color:#eee8d5;font:17px/1.6 system-ui}main{max-width:1500px;margin:auto}a{color:#e2c888}h1,h2,h3{line-height:1.25}h2{margin-top:0}section{margin:32px 0;padding-top:24px;border-top:1px solid #6a7869}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px}p{max-width:1100px}table{border-collapse:collapse}th,td{padding:8px 16px;border:1px solid #6a7869}.legend{display:flex;max-width:650px;justify-content:space-between;background:linear-gradient(90deg,#72826b,#899171 20%,#a49a82 40%,#b09d88 60%,#e7d8ca);color:#111;padding:8px}.context{max-width:1100px}@media(max-width:750px){body{padding:12px}.pair{grid-template-columns:1fr}table{font-size:12px}th,td{padding:5px}}
</style><main><h1>Lower, gentler island ridges</h1><p>The same five seeds, before and after the height refinement. The accepted ground-material recipe is unchanged. Compare the rock mass first, then the bare terrain and fixed-scale elevation maps.</p>
<p>Peaks: <b>59–76m → 37–46m</b>. All five seeds retain valid settlement pairs, walkable connections and terrain-hidden rival roofs under the existing #134 rules. Old saved worlds remain unchanged.</p>
<p>${measured.seeds.map(seed => `<a href="#seed-${seed}">Seed ${seed}</a>`).join(' · ')} · <a href="report.md">Method and limits</a> · <a href="measurements.json">Measurements</a> · <a href="../ground-blending/review.html">Original material review</a></p>
<p>Identical cameras and sun settings. No vegetation, water, fog or village in paired views. Shadow bounds fit the changed terrain automatically. Slope-driven material weights are recalculated using the existing zoning fields. Elevation legend (metres above sea):</p><div class="legend"><span>0</span><span>16</span><span>32</span><span>48</span><span>80</span></div>
${sections}<section><h2>Seed 18 · newly selected settlement</h2><p>Context only: the planner reruns after the terrain changes. This is the new starting camera with the village, nature and water restored.</p><img class="context" src="18-after-player-start-none.jpg" alt="New settlement starting view"></section></main></html>`);
console.log('Published ' + output + '/review.html');
