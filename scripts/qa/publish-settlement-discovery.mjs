import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const source = process.env.QA_OUTPUT ?? 'scratch/settlement-discovery';
const output = 'docs/qa/settlement-discovery';
const measurements = JSON.parse(await readFile(source + '/measurements.json', 'utf8'));
const browser = JSON.parse(await readFile(source + '/browser.json', 'utf8'));
assert.equal(measurements.passed, true);
assert.equal(measurements.results.length, 5);
assert.equal(browser.passed, true);
assert.equal(browser.checks.length, 3);
assert.deepEqual(browser.errors, []);
await mkdir(output, { recursive: true });
for (const file of ['measurements.json', 'browser.json', 'sites.jpg']) {
    await copyFile(source + '/' + file, output + '/' + file);
}
const rows = measurements.results.map(row => [
    row.seed, row.selected.playerId + ' → ' + row.selected.rivalId,
    row.compartments.join(' / '), row.selected.centerDistance.toFixed(1),
    row.selected.bufferDistance.toFixed(1), row.selected.routeLength,
    row.exposedRays + ' / ' + row.rays,
]);
const headings = ['Seed', 'Selected pair', 'Natural compartments', 'Center distance (m)',
    'Neutral gap (m)', 'Landing route (m)', 'Exposed / sampled rays'];
const table = [headings, headings.map(() => '---'), ...rows]
    .map(row => '| ' + row.join(' | ') + ' |').join('\n');
const report = `# Settlement placement: visibility as a diagnostic

Measured ${measurements.date}. This is the owner-approved revision of the earlier #134 concealment requirement, within PR #145.

New Environment Lab worlds use fjordside-island-v0.3e-r3. A rival may be visible from the starting viewpoints. Placement must still use distinct existing natural compartments, six fitting parcels per site, a 160 m center separation, 40 m neutral gap, a 240 m landing route, and at most 0.6 m grading per foundation. The search does not raise terrain to block sightlines, reseed on failure, or add a second classifier. It uses the same gentler-highland formation as e-r2.

${table}

All five fixed seeds pass, repeat identically, round-trip through full save validation and have a walkable final scenery-aware connection. These five examples do not establish a success rate for arbitrary seeds. Complete configurations and blueprint hashes are in [measurements.json](measurements.json).

Sightlines sample the rival construction bounds up to 8 m above ground from the landing, settlement center and starting camera. Exposed rays remain real diagnostic evidence, not rejection criteria or ranking penalties. Future discovery fog is separate; no discovery mask or fog-of-war state is implemented by this change. The existing atmospheric-fog toggle remains purely visual.

The prior e/e-r2 generation contracts still require concealment. The seed-256 e-r2 world retains its concealed pair, passes save/load and matches the saved pre-change fixture when that optional historical fixture is available (this run: ${measurements.legacy.previousFixturePreserved}). Existing saves are not upgraded. The earlier height and settlement reports remain unchanged records of their original requirements.

## Browser check

${browser.checks.map(check => '- ' + check).join('\n')}

Microsoft Edge Chromium, touch-enabled 1024 × 768 viewport, Low quality, local Vite server. No browser page/console errors. This is tablet emulation, not a physical iPad test or a performance measurement. The screenshot is the diagnostic island overview, with nature/village/atmospheric fog disabled; representative sightlines, player/rival bounds and access are shown. It is not a new terrain-art comparison.

[Open the review](review.html) · [Browser evidence](browser.json)

## Reproduce

Run \`node --test tests/settlement-discovery.test.mjs\`, then \`node scripts/qa/measure-settlement-discovery.mjs\`, \`node scripts/qa/check-settlement-discovery.mjs\` and \`node scripts/qa/publish-settlement-discovery.mjs\`. The browser uses port 5180 by default; set QA_ORIGIN to change it. The measure step writes the explicit legacy fixture used by import QA.
`;
await writeFile(output + '/report.md', report);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Settlement discovery placement review</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#ecede6;color:#20352f;margin:0 auto;max-width:1100px;padding:24px}img{width:100%;display:block}table{border-collapse:collapse;white-space:nowrap}td,th{padding:10px;border-bottom:1px solid #a6b3a9;text-align:left}.scroll{overflow:auto}a{color:#205949}</style>
<h1>Rival visibility is a diagnostic</h1>
<p>New Lab worlds allow an exposed rival. Natural compartments, foundation limits, separation and walking access still govern placement. Discovery fog will be added separately.</p>
<p><a href="report.md">Method and limits</a> · <a href="measurements.json">Five-seed measurements</a> · <a href="browser.json">Browser evidence</a> · <a href="/environment-lab">Environment Lab</a></p>
<div class="scroll"><table><thead><tr>${headings.map(h => '<th>' + h + '</th>').join('')}</tr></thead><tbody>${rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('')}</tbody></table></div>
<h2>Seed 256 — diagnostic overview</h2><p>Green: player. Pink: rival reserve. Gold: buffer. Cyan: route. Orange: blocked sightlines. Red: exposed sightlines. Only a subset of rays is drawn; all are measured.</p>
<img src="sites.jpg" alt="Seed 256 island with separated player and rival reservations, route and terrain sightline overlay">
<p>Five deterministic save/load checks passed. Touch generation, legacy import and current import passed in tablet emulation. Earlier worlds retain their stored rules and terrain.</p></html>`;
await writeFile(output + '/review.html', html);
