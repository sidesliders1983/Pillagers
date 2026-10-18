# Spatial island missions — #150

Status: technical checks passed; physical iPad acceptance remains open.

Implemented contract: [v0.4D](../../ISLAND-MISSIONS-V04D.md). Separate home missions retain existing prices, weather, duration, risk and capacity. No gameplay tuning was made for this run.

## Validation

- Full local suite: 945 passed, 10 existing skips, no failures. Three additional focused regressions were then added for impossible routes, failed Recon/casualties and corrected site reattachment; all 10 island-mission tests pass. The final related 55-test Core/expedition/Clan Book run also passed. Required CI verifies the final revision.
- TypeScript, production build, public asset validation and the explicit character/Lab-preview validator pass. Existing bundle-size warnings remain warnings.
- Parent-revision comparison: exact full-state equality against 255ef2d for three seeds / 27 old-format commands, including Recon, Surveillance, Pillage, actual person transfer, mid-mission save/load and later Winters.
- Ten real campaign seeds: exact split replay and 2,000 further ticks each. Full SharedSettlement restore reattaches saved geography and routes. These seeds use the established two-island curated pool; they are not ten unique landforms.
- Public Core tests also cover failed/partial results, old Region isolation, no remote intel refresh, actual transfers in all four cargo categories, Food conservation at dispatch, safe recall, exact off-grid homes, unreachable/overlong route rejection and malformed task references.
- Browser: Touch on known 3D site opens contextual missions; walking alone cannot enable Surveillance or Pillage; Mapped-area targeting opens an accessible confirmation over the 3D map; cancellation preserves state; Recon confirmation spends once, preserves pause and disables +1 Year; separate mission has return control; Real running clock advances physical travel; reload restores exact mission/clock without regeneration; 390px mobile drawer retains accessible mission controls; Identified clan enables Surveillance/Pillage; Pillage confirmation spends 5 Food; actual final movement tick publishes the homecoming report; Mobile UI uses collapsed cargo options, persistent expanded report details, 44px modal controls and no horizontal overflow. No page errors.
- A separate default-rule People-first continuation of seed 1983 confirms that the transferred identity renders in the player settlement without layout diagnostics (person-arrival.json).
- Manual source/diff/whitespace review; no project formatter is configured.

## Real-seed outcomes

The fixed-pack Explore leg is ordinary gameplay, not a pre-revealed target or enlarged supply budget. A run that does not sight the rival cannot initiate Recon against its hidden site. Food shortages and crew loss are retained, rather than bypassed to make every raid succeed.

| Campaign seed | Island seed | Rival sighted | Returned missions | Blocked follow-up |
| --- | --- | --- | --- | --- |
| 17 | 7 | Yes | Recon ✓, Surveillance ✓ | Pillage: Mission needs 7 Food. |
| 42 | 18 | No | — | — |
| 91 | 7 | Yes | Recon ✓, Surveillance ✓ | Pillage: Mission needs 7 Food. |
| 1983 | 7 | Yes | Recon ✓, Surveillance ✓, Pillage ✓ | — |
| 1337 | 7 | Yes | Recon ✓, Surveillance ✓ | Pillage: Mission needs 8 Food. |
| 7 | 7 | Yes | Recon ✓, Surveillance failed, Pillage ✓ | — |
| 18 | 18 | No | — | — |
| 32 | 18 | No | — | — |
| 64 | 18 | No | — | — |
| 127 | 7 | Yes | Recon ✓, Surveillance failed | Pillage: Group member is unavailable after the preceding mission. |

Six runs sighted the rival; two completed actual Pillage. Surveillance failed in two cases; seed 127 then had no eligible surviving crew member for Pillage. Existing weather raises some provision quotes. These are recorded gameplay outcomes, not test failures.

## Browser measurements

Local Windows Edge, touch emulation, 1024 × 768, Low quality: 120 consecutive frame intervals retained in browser.json; median 50.00 ms, p95 50.20 ms. Scene diagnostics are recorded alongside the samples. These are host measurements, not physical iPad timings and not a before/after mobile performance claim. No millisecond threshold was used as an acceptance gate.

## Review

Open [the review page](review.html). Review saves are paused copies made through actual Core commands. The sighted save requires Recon; the identified save permits Surveillance/Pillage if the group and stocks remain eligible. A successful Recon identifies the CPU clan; merely walking or mapping terrain never enables Surveillance.

Reproduce locally after installing dependencies: run scripts/qa/measure-island-missions.mjs, scripts/qa/check-island-mission-arrival.mjs, then scripts/qa/check-island-missions.mjs with QA_ORIGIN pointing at the served checkout, and scripts/qa/publish-island-missions.mjs. The legacy comparison additionally uses a git archive of parent revision 255ef2d under artifacts/island-missions/legacy-baseline.

Physical iPhone/iPad UAT has not been claimed. Please check site-ring selection, confirmation, drag/pinch navigation and returning reports on device. Land missions cannot cross water; new ship-based spatial missions, tactical combat, CPU raids and rescue of stranded groups remain outside this slice.
