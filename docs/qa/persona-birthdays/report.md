# Individual Persona birthdays — #171

The versioned calendar is available for owner review on new campaigns at /fjord-play?birthdays=individual-v1. It is **not the default**. Existing saved campaigns retain their own policy. The approved lifecycle is documented in [the calendar contract](../../INDIVIDUAL-BIRTHDAYS.md).

Actual birthdays spread the synchronized scene work. They do not remove total fitting work or all annual stalls. The strict requirement of no extra Core cost is not demonstrated by every matrix cell; default activation remains an owner-review decision.

## Sources and measurement conditions

- Main baseline: a20bac1, already including #168/#169 and #170 fitting reuse. The historical 1.64–1.90 second #167 result is not reused as a new before sample or credited twice.
- Full-year native comparison: runtime sources equivalent to b30c91c. Its launch HEAD was ffc2d9b with the tested exact-care corrections in the working tree; those unchanged sources were committed during the run. [Native results](native-results.json) preserve this distinction. Later age-query hot-path changes were measured separately.
- Final Core matrix and normal production build: 96af0fadeb46646a7ab9625be059070784877cdc. [Production checksums](production-build.json) identify the actual 5180 bundle. QA instrumentation is absent from that build.
- Shared Windows 10 desktop, Intel i7-7700HQ, 16 GB installed RAM, Intel HD Graphics 630 through ANGLE/D3D11, Edge 155.0.4283.45, headless 1280×800 viewport, actual canvas 1264×655 at pixel ratio 1, 1024² shadow map. This is not a dedicated benchmark machine or physical mobile device.
- Timing harnesses ran sequentially. All accepted browser cases assert the loaded initial Core, require real owned models with zero placeholders, and compare their final Core against authoritative replay. An initial invalid fixture import was rejected and corrected before accepted samples; no fallback fresh-campaign timing is included.

## Full-year native fitting: isolate spreading and caching

The developed, real-house boundary-810 fixture has 17 living residents, ten rendered Humans and two simulated CPU clans. Both variants use identical initial ages, assets, camera, graphics and the same sequence of tick batches over 1,000 ticks. The batch schedule is the union of personal birthdays, the annual boundary and the interval end. The simulation remains running during this accelerated presentation test; no delay or gameplay pause hides fitting work.

Calibration disables unrelated fertility, mortality and career changes in both variants. Only founder dates are synthetic comparison inputs; recorded children keep their actual historical tick-0 birthdays. This is a controlled QA fixture, never a runtime save migration. The original fixture hash and all run summaries are retained. Calibrated fixtures receive a fresh Clan Book instead of reusing a book tied to another canonical identity.

Three trials per cell, alternating calendar order. Inclusive stacks overlap and must not be added. These are per-run/per-resident distributions, not individually retained native frame timestamps.

| Fitting path | Calendar | Median total applyDNA CPU/year (ms) | Median largest scene-update batch (ms) | Median maximum frame (range, ms) |
| --- | --- | ---: | ---: | ---: |
| Existing #170 cache | Annual | 1171.1 | 1635.4 | 1766.6 (1716.7–1916.6) |
| Existing #170 cache | Individual | 1205.1 | 442.1 | 866.8 (850.0–883.3) |
| Forced original full refit, diagnostic only | Annual | 1463.9 | 2107.5 | 2333.3 (2283.2–2350.0) |
| Forced original full refit, diagnostic only | Individual | 1508.5 | 426.6 | 800.0 (783.2–800.0) |

With the existing cache, the largest scene batch falls about 73% and the maximum-frame median about 51%. Total inclusive fitting CPU is about 3% higher in this sample, not eliminated. Ten age updates occur in every trial. Legacy children still synchronize at tick 0 in this deliberately history-preserving fixture. Substantial annual work and individual refits remain. The forced-refit cells isolate spreading; they do not represent the shipped default and do not establish a new cache improvement.

Actor/source-template counts stay 18/4 before and after each full-year run. Renderer memory starts at 72 geometries and 69 textures, with 26 programs in both calendars. Draw counts and GPU/heap distributions are retained in the JSON. Resource snapshots and one-year runs do not prove zero allocation or long-term heap stability. No independent GPU speedup is claimed.

## Normal production build on LAN 5180

One paired pilot per speed and fixture, with a 5.5-second requested wall-clock capture around the annual crossing, using the public Run/Pause and year-length controls. Every case verifies that the QA bridge is absent. Full frame interval arrays, frame p95/p99/max, actual ticks and GPU identity are retained in [stock-results.json](stock-results.json).

| Fixture | Minutes/year | Annual max frame (ms) | Individual max frame (ms) | Frame p95 annual → individual (ms) | Actual ticks annual / individual |
| --- | ---: | ---: | ---: | ---: | --- |
| First (810) | 1 | 1799.9 | 449.9 | 100.0 → 99.9 | 50 / 74 |
| First (810) | 3 | 1750.0 | 550.0 | 150.0 → 83.6 | 19 / 24 |
| First (810) | 5 | 1766.5 | 566.5 | 166.7 → 100.2 | 11 / 14 |
| Later (811) | 1 | 1950.0 | 800.1 | 150.0 → 150.0 | 48 / 60 |
| Later (811) | 3 | 1933.3 | 799.9 | 100.2 → 150.0 | 16 / 21 |
| Later (811) | 5 | 1933.4 | 766.7 | 100.2 → 100.0 | 11 / 13 |

These normal-build cases confirm smaller annual peaks at all three speeds on this host. They are short, single paired pilots, run annual then individual, with different actual tick counts because stalls slow wall-clock progression. They are not equal-command CPU attribution or repeated device-performance acceptance. The full-year native matrix accounts for effort outside the crossing. Later-fixture peaks remain near 0.8 seconds; this is not a claim that every frame meets a 500 ms target.

## Headless Core and snapshot matrix

Three repeats per cell, alternating variant order; 1,000 ticks/run with 10, 25, 50 or 100 synthetic adult residents **per clan**, including two CPU clans (30–300 people total). Same real public commands and save validation. Unrelated lifecycle rolls are disabled equally. Each completed run equals a single authoritative 1,000-tick replay. [Core results](core-results.json) retain all command distributions, totals and serialized sizes.

Median total elapsed milliseconds per 1,000 ticks:

| Residents/clan | Batch | Main a20bac1 | Current legacy rules | Current individual dates |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 10 | 246.9 | 227.5 | 234.7 |
| 10 | 1000 | 46.5 | 49.5 | 52.1 |
| 25 | 10 | 471.2 | 478.1 | 481.4 |
| 25 | 1000 | 151.0 | 165.6 | 169.6 |
| 50 | 10 | 1056.6 | 1081.2 | 1082.3 |
| 50 | 1000 | 499.6 | 542.5 | 546.4 |
| 100 | 10 | 2877.6 | 2840.8 | 2773.4 |
| 100 | 1000 | 1539.1 | 1732.6 | 1707.9 |

Ten-tick batches are approximately flat or faster/slower by a few percent on this shared host. Single 1,000-tick batches are consistently slower than main, by approximately 9–12% for individual dates here. At 100 residents/clan the individual total is 1707.9 vs 1539.1 ms: about 0.17 ms extra per simulated tick across 300 residents. The current legacy control also shows overhead, so the whole difference cannot be attributed solely to personal birthdays. Timing/JIT variation remains. **A strict no-increase Core acceptance is not established.**

At 100 residents/clan, the serialized Core grows from 538,899 to 543,828 bytes. Birthday dates add identity data; no second per-tick population pass, per-birthday full-state clone or stored mutable age is added. Snapshot sizes are not an allocation-rate or heap-leak measurement.

## Lifecycle, visuals and validation

Sixteen focused public-contract tests cover deterministic founders/CPU dates, real scheduled deliveries, exact care duration, saved pending births, maternal death/transfer/absence, father identity, immediate work eligibility, fifth-birthday visibility, exact death/departure ages, malformed saves, New/Restart/import semantics and single/mixed/large-batch replay. Permanent maternal transfer ends care for children who remain behind; it cannot leave a stale future within-year endpoint in the receiving clan.

The [review page](review.html) includes touch-emulated fifth-birthday selection/reload and native 17→18, 45→46, 6→7 and 50→51 scene comparisons across tick 500→501. Presentation movement is paused only for fixed-camera images; a real Core command performs the birthday. Raw CharacterDNA.age remains unchanged. The existing greying curve begins gradually after 45; age 46 has greyAmount 0.025, not fully grey hair. Mouse/touch ray picking, disposal/reappearance, unchanged canonical state and equal model ownership counts are checked. This is one ownership cycle, not a long-term leak test. Physical iPad/iPhone support has not been re-tested for this slice.

All 19 local calendar/fitting contract tests pass (16 calendar tests plus three owned-asset fitting tests). Existing #170 fitting-equivalence contracts cover native body/clothing/hair/beard geometry, animation, bounds, colour changes and disposal. No character asset or fitting algorithm is changed by #171. The normal build and character validation passed CI for the pinned runtime revision; final PR-head checks must also pass before readiness. The first broad local run overlapped edits and had two invalidated failures; isolated stable reruns corrected them. It is not represented as a clean exact-head full-suite run. The pre-existing RUN_R3_EVIDENCE opt-in omission is unrelated to earlier failures.

## Reproduce

1. Check out the PR and prepare the existing owned runtime assets as for Fjord. Restore baseline sources with git archive a20bac1 src into artifacts/persona-birthdays/base before the Core matrix.
2. Run node scripts/qa/measure-persona-birthdays.mjs. QA_OUTPUT changes its output directory; optional QA_POPULATIONS and QA_BATCHES contain JSON arrays.
3. Start QA_PORT=5194 node scripts/qa/fjord-runtime-server.mjs. Run QA_PHASE=micro node scripts/qa/measure-persona-birthday-world.mjs (default three repeats), and node scripts/qa/check-birthday-character-stages.mjs. The bridge is QA-only.
4. Build normally and serve Vite preview on 5180. Run QA_PHASE=stock QA_REPEATS=1 node scripts/qa/measure-persona-birthday-world.mjs for the twelve-case pilot above. Increase repeats for a stronger device comparison; do not compare its raw wall-clock frames as equal-command CPU work.
5. Run node scripts/qa/check-persona-birthdays.mjs against the production origin for the touch-emulated new-campaign/fifth-birthday proof. Run the repository build, required character validation and test workflow. Keep draft until current-head checks pass.
6. For this production-preview review only, copy docs/qa/persona-birthdays into dist/docs/qa/persona-birthdays and docs/INDIVIDUAL-BIRTHDAYS.md into dist/docs after building. The application build does not automatically publish the source docs tree.

Owner visual/performance review is required by #171 before making individual dates the default. Existing Alpha campaigns need no backfill and are never rewritten.
