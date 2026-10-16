# Living island clan — #149 review

Recorded 2026-10-16T20:23:29.959Z. Implementation: b2791cc on top of merged #179. Draft PR [#185](https://github.com/sidesliders1983/Pillagers/pull/185). [Interactive review](review.html).

## Result and scope

One real, independently seeded domestic Core lives at the existing reserved rival site from fresh opt-in campaign creation. Its actual founding tents, residents, cattle and campfire reuse the normal Fjord projection and sourced models. The canonical CPU continues while unseen. Observation does not create/reset it. Existing version-1 graph campaigns keep four target clans and historical mission/replay semantics. Default rollout remains pending owner review.

The player projection returns no hidden enemy identity, inventory, names, kinship or live actor list. Currently observed residents are anonymous and have neutral gameplay traits in the rendering surrogate, while retaining their actual visible body profile. The normal picker, header, management panel, heritage and production popups stay player-only. Mapped terrain is not Scouted/Surveyed intelligence. No new terrain, classification, Food balance, autonomous raid, CPU management strategy or spatial Recon/Pillage is included.

## Validation

- 67 focused public Core, session, terrain/discovery, campfire, spatial and legacy-world tests pass (0 failures/skips). This includes actual ten-household capacity on curated island 7, atomic corrupt imports and an expedition goal corrected away from the physical rival campfire.
- TypeScript and production build pass. Both required CI checks passed on implementation b2791cc; documentation/evidence revisions require their own exact-head checks. PR stays draft.
- The full production browser confirms hidden camera proximity reveals no actors/information, real observed residents use sourced models, enemy touch does not select player management, the browser clock advances the rival exactly once (8 canonical ticks matched standalone Core), paused camera/quality changes do not advance Core, and importing the hidden save culls the observed actors with exact canonical state. No page errors.
- The separate sourced-model browser confirms actual body weights with neutral rendering traits, autonomous movement, exact pause, zero hidden actors, release on culling, stable identities on reveal and no Core mutations.
- A 100-Winter replay is exactly equal to the same domestic target independently stepped for 100,000 ticks, including save/load at year 50. Independent CPU total: 2474.1 ms. Coupled player+CPU+private-layout total: 11376.6 ms. These totals are different workloads, not an isolated marginal frame cost.

## Ten founding seeds

These are ten campaign/population seeds across **two** curated island geometries, not ten independently shaped islands. Every non-indoor canonical founding identity has supported placement; no population or terrain is changed to force fit.

| Campaign seed | Island seed | Tent households | Founding actors | First observation (active ticks) | Maximum observed actors |
| --- | --- | --- | --- | --- | --- |
| 17 | 7 | 9 | 23 | 84 | 23 |
| 42 | 18 | 9 | 23 | not reached | 0 |
| 91 | 7 | 8 | 22 | 84 | 22 |
| 1983 | 7 | 8 | 22 | 84 | 22 |
| 1337 | 7 | 8 | 22 | 84 | 22 |
| 7 | 7 | 10 | 24 | 84 | 24 |
| 18 | 18 | 9 | 23 | not reached | 0 |
| 32 | 18 | 8 | 22 | not reached | 0 |
| 64 | 18 | 10 | 24 | not reached | 0 |
| 127 | 7 | 8 | 22 | 84 | 22 |

Island 7 observations use ordinary nearer objectives along the established land route, under the real paid expedition commands. All ten residents and all founding actors can be observed. A redundant final order near the corrected campfire goal correctly rejects “Choose a destination farther from the group.” after observation; the raw run retains that result. Island 18 returns before observing the reserve with its current 500-tick pack. Direct distant requests may also exceed the existing bounded search. This slice neither raises search budgets nor provisions, changes terrain, teleports a scout or injects knowledge. Wider-range access needs an explicit subsequent mission/balance decision.

## Long-term actual state (seed 32)

| Years advanced | Living residents | Tent households | Houses | Unsupported outdoor identities |
| --- | --- | --- | --- | --- |
| 1 | 10 | 7 | 0 | 0 |
| 5 | 10 | 5 | 0 | 0 |
| 10 | 11 | 5 | 0 | 0 |
| 20 | 11 | 5 | 0 | 0 |
| 50 | 6 | 3 | 1 | 0 |
| 100 | 0 | 0 | 0 | 0 |

Paths connect every actual permanent house in the sampled history. The rival reaches zero living residents by year 100 under existing rules. There is no hidden rescue, respawn or subsidy. A real canonical founding ship is retained, but the rival reserve has no validated berth, so no rendered boat is invented there.

## Desktop browser samples

Host: Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz, 15.9 GiB RAM. Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0. Actual WebGL renderer: ANGLE (Intel, Intel(R) HD Graphics 630 (0x0000591B) Direct3D11 vs_5_0 ps_5_0, D3D11).

Headless Edge, desktop host, touch enabled, viewport emulation only. These are **paused-scene** requestAnimationFrame intervals, with 120 individual intervals retained per variant in [browser.json](browser.json). Median/p95 include scheduling/compositor effects; renderer draw time and counts are also recorded separately. They are not physical iPhone/iPad FPS or running-campaign budgets. No milliseconds threshold is used to gate the development laptop. Hidden/observed variants face the same valley; the observed fixture is 116 real scout ticks later, so this is not a perfect isolated GPU experiment.

| Scene | Viewport | Quality | Median interval ms | p95 interval ms | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- | --- |
| hidden | 1024 × 768 | low | 50.1 | 66.9 | 42 | 2046990 |
| hidden | 1024 × 768 | standard | 50.2 | 67.1 | 42 | 2053134 |
| hidden | 390 × 844 | low | 50.0 | 66.8 | 42 | 2046990 |
| hidden | 390 × 844 | standard | 50.0 | 66.9 | 42 | 2053134 |
| observed | 1024 × 768 | low | 100.0 | 116.8 | 96 | 3260196 |
| observed | 1024 × 768 | standard | 83.5 | 100.1 | 96 | 3266340 |
| observed | 390 × 844 | low | 83.3 | 100.1 | 93 | 3252309 |
| observed | 390 × 844 | standard | 66.7 | 117.0 | 93 | 3258453 |

## Reproduction and review

1. Run the current production preview with its existing static assets. Open [review.html](review.html), then each scenario in a new tab. The saved camera faces the reserve and the campaign is paused.
2. Hidden: white discovery fog and no rival actors. Camera motion alone must not reveal it. Observed: real tents, people, cattle and fire ring; start/pause to inspect motion. Rival actors cannot open player management.
3. Let the real scout return; only mapped geography remains. Save/reload and import retain the canonical community.
4. Scripts: measure-island-clans.mjs (ten seeds/replay/real scout fixtures), check-island-clan-models.mjs (sourced model lifetime), check-island-clans.mjs (production UI/raw intervals), prepare-island-clan-review.mjs (review poses). Source hashes are in the recorded JSON.

Physical iPhone/iPad controls, performance, warmth and long-session memory are **not confirmed by desktop emulation**. Owner visual/mobile acceptance and default rollout remain open. Recon, Surveillance, hostile intel and Pillage integration remain #150.
