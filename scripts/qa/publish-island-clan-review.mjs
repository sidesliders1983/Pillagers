import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import os from 'node:os';
const output = 'docs/qa/island-clans';
await mkdir(output, { recursive: true });
const read = async name => JSON.parse(await readFile('artifacts/island-clans/' + name + '.json', 'utf8'));
const measurements = await read('measurements'), browser = await read('browser');
for (const name of ['measurements.json', 'models.json', 'browser.json', 'unknown-desktop.png', 'observed-desktop.png',
    'observed-390-low.png', 'observed-390-standard.png', 'observed-1024-low.png', 'observed-1024-standard.png'])
    await copyFile('artifacts/island-clans/' + name, output + '/' + name);
const samples = browser.samples.map(sample => `| ${sample.label || 'observed'} | ${sample.viewport.width} × ${sample.viewport.height} | ${sample.quality} | ${sample.medianMs.toFixed(1)} | ${sample.p95Ms.toFixed(1)} | ${sample.stats.drawCalls} | ${sample.stats.triangles} |`).join('\n');
const seeds = measurements.cases.map(record => `| ${record.seed} | ${record.islandSeed} | ${record.households} | ${record.foundingActors} | ${record.observedAt ?? 'not reached'} | ${record.visibleActors} |`).join('\n');
const growth = measurements.replay.growth.map(record => `| ${record.year} | ${record.living} | ${record.households} | ${record.houses} | ${record.missing.length} |`).join('\n');
const report = `# Living island clan — #149 review

Recorded ${new Date().toISOString()}. Implementation: b2791cc on top of merged #179. Draft PR [#185](https://github.com/sidesliders1983/Pillagers/pull/185). [Interactive review](review.html).

## Result and scope

One real, independently seeded domestic Core lives at the existing reserved rival site from fresh opt-in campaign creation. Its actual founding tents, residents, cattle and campfire reuse the normal Fjord projection and sourced models. The canonical CPU continues while unseen. Observation does not create/reset it. Existing version-1 graph campaigns keep four target clans and historical mission/replay semantics. Default rollout remains pending owner review.

The player projection returns no hidden enemy identity, inventory, names, kinship or live actor list. Currently observed residents are anonymous and have neutral gameplay traits in the rendering surrogate, while retaining their actual visible body profile. The normal picker, header, management panel, heritage and production popups stay player-only. Mapped terrain is not Scouted/Surveyed intelligence. No new terrain, classification, Food balance, autonomous raid, CPU management strategy or spatial Recon/Pillage is included.

## Validation

- 67 focused public Core, session, terrain/discovery, campfire, spatial and legacy-world tests pass (0 failures/skips). This includes actual ten-household capacity on curated island 7, atomic corrupt imports and an expedition goal corrected away from the physical rival campfire.
- TypeScript and production build pass. Both required CI checks passed on implementation b2791cc; documentation/evidence revisions require their own exact-head checks. PR stays draft.
- The full production browser confirms hidden camera proximity reveals no actors/information, real observed residents use sourced models, enemy touch does not select player management, the browser clock advances the rival exactly once (${browser.cpuTicks} canonical ticks matched standalone Core), paused camera/quality changes do not advance Core, and importing the hidden save culls the observed actors with exact canonical state. No page errors.
- The separate sourced-model browser confirms actual body weights with neutral rendering traits, autonomous movement, exact pause, zero hidden actors, release on culling, stable identities on reveal and no Core mutations.
- A 100-Winter replay is exactly equal to the same domestic target independently stepped for 100,000 ticks, including save/load at year 50. Independent CPU total: ${measurements.replay.independentMs.toFixed(1)} ms. Coupled player+CPU+private-layout total: ${measurements.replay.coupledAndProjectionMs.toFixed(1)} ms. These totals are different workloads, not an isolated marginal frame cost.

## Ten founding seeds

These are ten campaign/population seeds across **two** curated island geometries, not ten independently shaped islands. Every non-indoor canonical founding identity has supported placement; no population or terrain is changed to force fit.

| Campaign seed | Island seed | Tent households | Founding actors | First observation (active ticks) | Maximum observed actors |
| --- | --- | --- | --- | --- | --- |
${seeds}

Island 7 observations use ordinary nearer objectives along the established land route, under the real paid expedition commands. All ten residents and all founding actors can be observed. A redundant final order near the corrected campfire goal correctly rejects “Choose a destination farther from the group.” after observation; the raw run retains that result. Island 18 returns before observing the reserve with its current 500-tick pack. Direct distant requests may also exceed the existing bounded search. This slice neither raises search budgets nor provisions, changes terrain, teleports a scout or injects knowledge. Wider-range access needs an explicit subsequent mission/balance decision.

## Long-term actual state (seed 32)

| Years advanced | Living residents | Tent households | Houses | Unsupported outdoor identities |
| --- | --- | --- | --- | --- |
${growth}

Paths connect every actual permanent house in the sampled history. The rival reaches zero living residents by year 100 under existing rules. There is no hidden rescue, respawn or subsidy. A real canonical founding ship is retained, but the rival reserve has no validated berth, so no rendered boat is invented there.

## Desktop browser samples

Host: ${os.cpus()[0].model.trim()}, ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM. ${browser.userAgent}. Actual WebGL renderer: ${browser.samples[0]?.renderer || 'not recorded in the earlier run'}.

Headless Edge, desktop host, touch enabled, viewport emulation only. These are **paused-scene** requestAnimationFrame intervals, with 120 individual intervals retained per variant in [browser.json](browser.json). Median/p95 include scheduling/compositor effects; renderer draw time and counts are also recorded separately. They are not physical iPhone/iPad FPS or running-campaign budgets. No milliseconds threshold is used to gate the development laptop. Hidden/observed variants face the same valley; the observed fixture is 116 real scout ticks later, so this is not a perfect isolated GPU experiment.

| Scene | Viewport | Quality | Median interval ms | p95 interval ms | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- | --- |
${samples}

## Reproduction and review

1. Run the current production preview with its existing static assets. Open [review.html](review.html), then each scenario in a new tab. The saved camera faces the reserve and the campaign is paused.
2. Hidden: white discovery fog and no rival actors. Camera motion alone must not reveal it. Observed: real tents, people, cattle and fire ring; start/pause to inspect motion. Rival actors cannot open player management.
3. Let the real scout return; only mapped geography remains. Save/reload and import retain the canonical community.
4. Scripts: measure-island-clans.mjs (ten seeds/replay/real scout fixtures), check-island-clan-models.mjs (sourced model lifetime), check-island-clans.mjs (production UI/raw intervals), prepare-island-clan-review.mjs (review poses). Source hashes are in the recorded JSON.

Physical iPhone/iPad controls, performance, warmth and long-session memory are **not confirmed by desktop emulation**. Owner visual/mobile acceptance and default rollout remain open. Recon, Surveillance, hostile intel and Pillage integration remain #150.
`;
await writeFile(output + '/report.md', report);
