# Personality Life Events v0.1 · evidence and recommendation

Issue #120; all prototype values confirmed by the owner. The experiment remains disabled for ordinary and legacy campaigns.

## Scope and reproducibility

Two paired cohorts: 100 seeds (0–99) × 25 years each. One uses unchanged campaign balance and initial generation, with the optional world extension removed for domestic measurement. The other is a labelled Einar/Liv/Astrid shortage fixture: ages 32/30/20, no occupations, initial Food 0, Materials 100, mortality/partnership/fertility/career disabled and care duration 0. Social probabilities retain the approved settings. Four additional full-world seeds (0, 7, 32, 99) retain ordinary CPU targets. Total: 204 pairs / 408 campaigns / 10,200 campaign-year windows.

Every year compares all non-social canonical outcomes with social enabled/disabled. Only the added social extension/events and sequential event numbers are normalized, independently for each clan. No economic, demographic or existing RNG field is omitted. Exact repeat, batch and midpoint-save/load checks pass on all four verification seeds in all three cohorts (36 comparisons). Raw initial/final saves, configuration, windows, source events, per-person/pair counts and timings are retained in 204 compressed records.

Run: `node scripts/qa/run-personality-study.mjs`, then `node scripts/qa/review-personality-study.mjs`. [Manifest](manifest.json) records source revision, source hashes, environment, exact fixture recipe and raw-record digests; [summary](summary.json) retains every per-seed count. The source revision identifies the branch base at measurement time; the accompanying file hashes identify the implementation measured before its delivery commit.

## Observed frequency

| Metric | Default domestic (100) | Controlled (100) | Full world (4) |
| --- | ---: | ---: | ---: |
| Quarrel opportunities | 505 | 1721 | 20 |
| Quarrels opened | 90 | 275 | 3 |
| Mediation opportunities | 30 | 728 | 3 |
| Mediation attempts | 10 | 128 | 0 |
| Successful mediation | 6 | 70 | 0 |
| Independent reconciliation opportunities | 221 | 651 | 6 |
| Independent reconciliations | 36 | 85 | 2 |
| Total resolutions | 42 | 155 | 2 |
| Expired unresolved | 32 | 92 | 0 |
| Inactive after death/departure | 2 | 0 | 0 |
| Open at final boundary | 14 | 28 | 1 |
| Pairs recurring within a seed | 7 | 67 | 0 |
| Uneventful runs | 49 | 1 | 3 |

Successful mediation and its resolution refer to the same episode: they are not two successful aid episodes. Openings balance exactly with resolutions, expiry, inactivity and remaining open incidents in each cohort.

Default domestic rate: 90 openings in 2,500 annual windows (3.6% of windows); 49/100 runs have no social event. The controlled cohort deliberately supplies persistent pressure and a tied adult helper, so its higher frequency is not a prediction for normal play. Full-world samples are verification samples, too small for frequency inference.

## Trait isolation, limits and fairness

Fixed-context public tests give 5%/30% quarrel at Temperament 0/1, 10%/30% helper initiative at helper Temperament 0/1, separate 50% mediation success, and 20%/10% independent reconciliation at mean Temperament 0/1. Recent reconciliation halves the pair chance. These isolate the formula without changing production DNA in a cohort and attributing economic differences to social behavior.

The post-run audit checks all 5,100 enabled annual windows for the 128 candidate-check budget, at most one new incident and one resolution, and no resident appearing in distinct actual episodes within a window. Per-person, per-pair, helper and recurrence counts are in the summary and raw files. Seeded starting points/reservoir selection remove an unconditional smallest-ID preference; this cohort does not prove equal demographic opportunity, and age, real ties, availability and shortage differ between residents. Very large clans use a bounded sample rather than an exhaustive pair scan.

Tests additionally cover the no-event branch, 0%/100% transitions, mediation failure/cooldown, opening-year exclusion, memory/expiry, death, actual mission absence, midyear transfer, duplicate/stale references, malformed saves, exact rollback, pause/render/read behavior and 2D/3D handoff. Temporary commitments are not falsely recorded as reconciliation.

## Source-linked readable example

Controlled seed 1:

> In the eighteenth winter after the clan began, Astrid and Liv quarrelled. The following winter, Einar attempted to mediate the quarrel between Astrid and Liv; the mediation succeeded. That same winter, Astrid and Liv reconciled through mediation.

[Recorded episode](episode.json) includes the opening, attempt, resolution, exact resident FoodConsumed context and paragraph source references. Nothing in this prose asserts an insult, motive, personality judgment, unrecorded witness or ownership. Exact Food/Materials values remain in the factual ledger. Older plan versions and published chapters are retained.

## Browser and cost

[Browser report](browser/report.json): Gameplay Lab at 1440 px and 390 px, existing Clan Book reader at 1024 px with touch emulation. New-campaign-only setting, real imported Core transitions, stable disclosure, save/load rollback and no render-triggered rerolls pass without page errors. This is desktop Edge emulation, not a physical iPad certification.

Mean wall time per complete annual Core command (enabled / disabled): default domestic 38.21 / 37.17 ms; controlled 3.97 / 3.53 ms; full world 272.15 / 270.27 ms. Measurements ran with two workers alongside development checks on the old laptop. These are descriptive command/run totals, not isolated CPU overhead, frame samples or an FPS benchmark. No millisecond gate.

## Recommendation

**Keep the opt-in pilot; defer default enablement and wider consequences.** The source-linked sequence is recognizable and rare in the ordinary cohort. Helpers are scarce in normal play (30 opportunities, 10 attempts): widening real social opportunity should be assessed before raising success rates. Preserve the approved probabilities until an owner review; do not force a story by inventing witnesses or by giving every unrelated resident a tie. Working incidents expire and recent memory decays; no permanent escalation or economic penalties were added.

Inherited rule discrepancy: current default childcare remains five years, despite an earlier two-year direction. The pilot follows each saved configuration; it does not silently recalibrate this unrelated rule or rewrite historical reports.

## Delivery checks

Local build and unchanged asset validation passed. The full suite reports 630 tests (629 passed, zero failed, one inherited conditional GLB portability skip); the final targeted social/harness suite passes 18 tests, including three additional restore/memory/name checks. No formatter is configured; changed code was inspected manually and git diff --check passed. [Verification](verification.json). Required GitHub checks remain authoritative for the delivered head revision.

## Clarification · 12 October 2026

The earlier childcare discrepancy statement above was mistaken. The settled rules are **two complete Winters of birth cooldown and five Winters of childcare**; five-Winter care is correct. No measured configurations, results, raw records or hashes have changed.

After reviewing this pilot, the owner superseded the opt-in-only rollout recommendation: the existing behavior now defaults on for genuinely new player campaigns in Gameplay Lab, 2D and Fjord, with an explicit development opt-out. Existing/legacy saves and saved-rule restarts retain their behavior; CPU neighbours remain disabled. This rollout decision does not change the measured coefficients, prerequisites, limits or consequences, and requires no new social-balance study before #122. The measurements and original recommendation above remain a record of the earlier pilot.
