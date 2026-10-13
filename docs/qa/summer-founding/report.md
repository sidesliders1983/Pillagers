# Summer founding review — #157

Status: implementation preview; owner visual acceptance and default activation pending. The ordinary new-game default is unchanged. PR #145 (island campaign integration) was merged before this branch.

## Reproduce

- [Review page](review.html), [raw first-boundary results](first-boundary.json), [browser evidence](browser.json).
- Open /fjord-play?start=summer&seed=32. Existing sessions are preserved: select Menu → Campaign → New campaign from seed to see the new opening.
- Run node scripts/qa/measure-summer-founding.mjs and node scripts/qa/check-summer-founding.mjs from the repository root with the preview server on port 5180 (or QA_ORIGIN).

The browser captures use Edge/Chromium. A MutationObserver pauses immediately after readiness for a reproducible opening screenshot; production auto-start remains unchanged. Pre-ready saved clocks stay at 800:500. The ready frame projects Summer, all ordinary terrain/foliage snow amounts are zero, and tents/campfire have zero seasonal snow. Physical iPad and the future #153 cinematic are not claimed as verified.

## Ten-seed first boundary

All cases use real Simulation Core creation/commands with current defaults (15 player Food, 5 Materials; mortality, cattle lifecycle, weather and social events enabled). Each seed has a passive landing and one-Farmyard intervention, each paired with the historical tick-0 start. Each of the 40 scenarios is repeated and compared by every output field and canonical state hash. Save/load at one tick before the boundary reproduces the uninterrupted result exactly. CPU clans reach the same 801:0 boundary.

The intervention chooses the first existing farmer by ID (or assigns the first resident if none), salvages the longship, builds that household's home, and assigns all three cattle. All commands, exposure IDs, stocks, consumption, births, deaths and state hashes are recorded in the JSON. This is one transparent action sequence, not an optimized survival strategy; normal overcrowding/upkeep rules still apply.

| Seed | Outgoing weather | Food: Winter passive | Food: Summer passive | Food: Summer Farmyard | Summer passive unmet Food | Resident deaths | Cattle deaths |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Normal | 30 | 9 | 13 | 0 | 0 | 0 |
| 2 | Normal | 16 | 2 | 8 | 0 | 0 | 0 |
| 3 | Normal | 21 | 5 | 9 | 0 | 0 | 0 |
| 7 | Normal | 18 | 2 | 8 | 0 | 0 | 0 |
| 17 | Normal | 16 | 2 | 6 | 0 | 0 | 0 |
| 32 | Normal | 24 | 6 | 10 | 0 | 0 | 0 |
| 42 | Normal | 15 | 1 | 5 | 0 | 0 | 0 |
| 91 | Normal | 27 | 7 | 13 | 0 | 0 | 0 |
| 1983 | Mild | 28 | 8 | 12 | 0 | 0 | 0 |
| 1337 | Harsh | 0 | 0 | 0 | 20 | 0 | 0 |

Without intervention, all ten residents and three founding cattle are exposed at arrival. A farmer home shelters its one or two current residents and all three assigned cattle. No resident or cattle deaths occurred before the first boundary in these ten Summer cases. This small sample is not a claim that exposure is safe: configured mortality and weather risks are unchanged. Living counts can increase through births; these are recorded separately.

Nine passive Summer seeds retain 1–9 Food versus 15–30 in their tick-0 controls. The corresponding Farmyard cases retain 5–13 Food. Harsh seed 1337 produces no Food and records 20 unmet Food in both phases and both strategies. The engine records unmet Food; this report does not equate it with starvation deaths. Shorter production time reduces the reserve without prorating the full annual bill. No Food grant, mortality reduction or consumption discount was added.

Later births and RNG trajectories can differ because the played duration, provisions and eligible decisions differ; identical initial RNG and identities do not imply identical future outcomes. Both variants remain independently reproducible.

## Contracts and narrative

Test-first regressions established the previous 800:0 behavior before adding the explicit phase, then covered Core/CPU initialization, no phantom occupation experience, first/subsequent boundaries, pacing, restart, old imports, shared transfer and frozen Summer opening. The first Clan Book interval ends at 805:0 with complete, reconciled Food/Materials accounting for 4.5 actual years. Existing published narrative and default fixture shapes remain intact.

The HUD uses Summer 800. The annual weather panel explicitly says Year 800 and annual weather; it does not claim the current season is Winter. Opening prose records arrival in summer from factual metadata. Canonical diagnostics and ages retain the established Winter terminology.

## Validation status

TypeScript, production build, full character validation (including Lab previews), the forty repeated measurement scenarios, and browser flows passed. The existing build chunk-size advisory remains. The full regression suite and current-head CI are still pending at the time of this report; the PR must remain draft until required checks pass. Default activation remains pending visual acceptance. The unimplemented #153 camera-flight/loading preview is a follow-up dependency, not part of these screenshots.
