import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = 'docs/qa/island-snow-promotion';
const report = JSON.parse(await readFile(root + '/measurements.json', 'utf8'));
for (const [file, expected] of Object.entries(report.sources)) {
    assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), expected,
        'Evidence source changed: ' + file);
}
const fixed = number => number.toFixed(2);
const table = report.rows.map(row => `| ${row.seed} | ${row.campaignSeed} | ${fixed(row.previousSnowlineY)} → ${fixed(row.snowlineY)} | ${fixed(row.oldLandSnowPercent)} → ${fixed(row.newLandSnowPercent)} | ${row.regions.length} |`).join('\n');
await writeFile(root + '/report.md', `# Approved island pool and permanent snow

The owner approved the eight phase-one shortlisted islands on 2026-10-21 and requested permanent snow five metres lower, including the existing geographies. New campaigns now use **island-pool-v3**, with ordered pool **18, 7, 15, 79, 88, 101, 112, 168, 195, 227**. Existing v1/v2 selection, prepared terrain, nature, foundations, navigation and berth remain pinned.

## Snow placement

The existing summit-cap shader receives the previous 90%-of-relief snowline minus **5 metres**. Its minimum upward normal remains **0.97**. Gentle summit surfaces and upper shoulders retain snow; steep faces remain exposed. Seasonal snow still uses the existing seasons. No Core rules, climate zoning fields, topology, heights or saved snow arrays change. This is an art-directed game-scale cap, not a claim about Icelandic climate at these elevations.

The table measures qualifying canonical smooth-normal **grid samples**, not exact rasterized triangle area. Tiny regions can disappear in oblique views or join between samples. Full region centroids, elevation ranges and approximate areas are retained in [measurements.json](measurements.json). Four-neighbour components describe where the snow lies; they are QA observations, not a second runtime classifier.

| Geography | Example campaign seed | Snowline Y, metres before → after | Snow-capable land %, before → after | Sample regions |
| --- | --- | --- | --- | --- |
${table}

![All ten snow comparisons](snow-comparison.png)

Open [the interactive review](review.html) for top-down and oblique production-material renders. Left is the previous snowline; right is the lowered snowline. Maps use the same canonical smooth corner normals as the terrain. Undecorated summer views deliberately omit discovery fog and vegetation.

## Integration evidence

All ten islands were created through the public v3 recipe using a mapped campaign seed. Their complete canonical blueprint hashes equal the frozen phase-one **v2** candidate hashes. All ten passed compact save/restore, same-founder restart and mismatched-recipe rejection. Each separate funded construction fixture built ten independent homes through real Core commands, retained ten ground paths with no projection diagnostics, and found physical routes from every home to the campfire approach and dry shore approach around reserved parcels and actual nature.

All ten retain full-field connectivity between inhabited regions with home/fire exclusions. Nine pass the current bounded direct rival-route query. Existing geography **18** still reaches the 40,000-node direct-search limit; intermediate player waypoints may be needed. This existing limitation is recorded, not hidden by extending the search or changing terrain. The eight newly admitted islands all pass that direct query.

The initial QA preflight tried to send a walker to the ship's shallow-water harbor anchor. The final fixture instead uses the nearest dry canonical navigation point within twelve metres and records that point. This fixes the observation fixture, not gameplay. A separate full-field connectivity measurement is never substituted for a successful gameplay route.

Only the requested island is generated. The production cache retains at most **two** worlds, avoiding ten eagerly retained blueprints. Worker adoption, strict version dispatch and restored village-nature rendering cover v3 as well as v2. Existing v1/v2 pools remain **18, 7**, with their original hash and reconstruction semantics. A repeat island from a fresh campaign seed is possible; this is random selection, not a no-repeat shuffle.

## Reproduction and scope

From the feature checkout with installed dependencies and the preserved phase-one run directory:

\`\`\`powershell
node scripts/qa/validate-island-promotion.mjs
node scripts/qa/report-island-promotion.mjs
node --test --test-concurrency=1 tests/island-pool-expansion.test.mjs tests/permanent-snow.test.mjs tests/fjord-island.test.mjs tests/village-nature.test.mjs tests/async-generation.test.mjs
\`\`\`

The bounded validation runs two independent child processes, each limited to 1,024 MiB V8 heap and 180 seconds. Full render inputs stay in ignored scratch; compact source hashes, measurements, maps and screenshots are retained here. Historical 258-seed results and earlier QA are untouched. Browser viewport checks on this workstation do not constitute physical iPhone/iPad performance acceptance. No feature Site publication or main merge is implied.

Source and runner byte hashes are recorded in measurements.json. The report generator refuses changed sources. Source formatting was reviewed manually because the repository has no formatter command.
`);

const tiles = [];
for (let index = 0; index < report.rows.length; index++) {
    const row = report.rows[index], x = index % 2 * 650, y = Math.floor(index / 2) * 350;
    const label = Buffer.from(`<svg width="650" height="40"><rect width="650" height="40" fill="#10262d"/><text x="12" y="26" fill="#f0eee0" font-size="19" font-family="sans-serif">Island ${row.seed} · previous / lower by 5 m · ${fixed(row.snowlineY)} m</text></svg>`);
    tiles.push({ input: label, left: x, top: y });
    for (const [column, name] of ['before', 'after'].entries()) {
        const map = await sharp(root + '/maps/' + row.seed + '-' + name + '.png').resize(310, 310).toBuffer();
        tiles.push({ input: map, left: x + column * 325 + 7, top: y + 40 });
    }
}
await sharp({ create: { width: 1300, height: 1750, channels: 3, background: '#10262d' } })
    .composite(tiles).png().toFile(root + '/snow-comparison.png');
console.log('Verified source hashes; wrote ten-island snow report and comparison map.');
