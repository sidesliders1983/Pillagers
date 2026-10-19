# Fine-grained update reuse — #210

Status: implementation and local evidence complete; current-head CI is recorded on the draft PR. Physical iOS acceptance remains pending under #151. This is a stacked follow-up to #212; neither PR is merged automatically.

## Pin and two selected paths

Baseline: a54cb668f826b529ff132fc6275e22e095224423 (#212), with main ac3833d4fc286bce5c8522920420a006607a6e0f and no other overlapping open PR at inspection. Runtime after: bd69e50b9545e0a57ef9ba93e003e5ddf4de39aa. Raw measurements declare the exact baseline source override, current source commit, browser/settings, fixture hashes and source mode. Native asset hashes and runtime source fingerprints are retained in the golden capture reports. Later evidence commits do not change runtime code.

1. **Assigned-cattle floor sampling:** the old sync repeatedly traversed world matrices and raycast the same authored Farmyard at the same canonical source point. Each cattle entry now retains one result for the exact yard object, matrix and XYZ. Changed inputs, a new world, assignment removal or instance replacement invalidate it. Cached misses are also valid results. Dynamic animal navigation, collision/social coordination and yard-route surface sampling still run normally.
2. **Mounted card patching:** the interface still renders current truthful HTML. When the card has no editable fields and its HTML is identical, it retains the DOM instead of parsing another template. World/history generation changes invalidate this reuse. Forms keep the original field-preserving reconciliation even with identical HTML; current affordability and command validation still run. Other views, events and autosaves keep their original cadence.

The [existing architecture map](../../gameplay/GAMEPLAY-FIRST-ARCHITECTURE.md#scoped-presentation-reuse-210) records these dependencies under #17. These are bounded instance caches, not another authoritative read model or generic invalidation framework. No new engine, fitter, assets, quality policy, cadence, gameplay rules, dependencies or save schema. #211 remains separate.

## Measured starting point

Starting native and direct-block passes reused the published developed-810 and boundary-810 saves. Ordinary warmed DNA/wardrobe reconciliation was already cheap: 500 reconciliations consumed 11.7 ms aggregate in one 10-second attribution run, without DNA refits. That path was intentionally left alone. The annual boundary legitimately refit age-dependent bodies/modules (about 2.7 seconds aggregate applyDNA in that single native profile); this delivery does not remove that work.

The initial direct-block ordinary run recorded 160 repeated yard queries / 320.1 ms and 20 card patches / 38.5 ms over ten seconds. Final paired measurements below use an expanded, identical card scope including detection/preserved-field bookkeeping on both variants, so those initial card numbers are attribution evidence rather than the final comparison.

## Paired CPU and allocation evidence

Windows Edge 155.0.4283.62, Intel HD Graphics 630 via ANGLE/D3D11, DPR 1, existing Low quality/effects. Desktop 1280×800 for ordinary/annual cases; desktop-emulated 390×844 touch layout for visited-800. Two alternating repetitions reverse both variant and scenario order on repetition two. Each warms for two seconds and receives the same thirty public tick commands at the existing 500 ms QA schedule (pattern 2/3/3/3/3/2/3/3/3), totaling 83 canonical ticks over approximately fifteen seconds. Boundary time is held during warmup so the annual update is measured. Camera orbit runs for the ordinary and visited cases.

Every pair has exact full canonical equality, including RNG, events/history, both clans and discovery. All layers use real public assets with zero placeholders. visited-800 contains an actively observed rival settlement; its actual bound terrain/discovery contract is used for the independent headless replay. It has no Farmyard queries to eliminate, which remains a measured no-op.

| Fixture · repetition | Total floor-block CPU ms before → after | Total card-block CPU ms before → after |
| --- | ---: | ---: |
| developed-810 · 1 | 653.0 → 1.5 | 84.0 → 4.2 |
| boundary-810 · 1 | 689.1 → 24.9 | 95.8 → 7.4 |
| visited-800 · 1 | 0.0 → 0.0 | 18.5 → 0.0 |
| visited-800 · 2 | 0.0 → 0.0 | 14.0 → 0.2 |
| boundary-810 · 2 | 847.4 → 16.6 | 114.5 → 7.7 |
| developed-810 · 2 | 728.4 → 1.9 | 93.6 → 4.9 |

The floor block includes dependency checking, not just misses; its update cadence is retained. The focused external geometry-query probe observes 40 redundant queries across five unchanged updates before, zero after, with exact unchanged positions/bounds. The DOM parser probe observes five redundant card template parses before, zero after. Each cache is bounded: one sixteen-number matrix plus a point/height per applicable cattle entry, and one latest card string/identity per interface. These operation/allocation proofs do not depend on a hardware timing threshold. Whole-page heap below is a noisy end-window occupancy reading, not an allocation-rate or isolated cache measurement.

## Full-frame observations and limits

| Fixture · repetition | Variant | Frame p50 / p95 / p99 / max ms | Long tasks count / total ms | Whole-page used heap MiB |
| --- | --- | --- | --- | ---: |
| developed-810 · 1 | before | 83.3 / 166.7 / 366.6 / 1583.2 | 35 / 4526.0 | 467.1 |
| developed-810 · 1 | after | 66.7 / 83.5 / 166.8 / 366.6 | 22 / 1953.0 | 394.5 |
| boundary-810 · 1 | before | 66.7 / 100.0 / 1566.6 / 4850.0 | 22 / 8370.0 | 525.2 |
| boundary-810 · 1 | after | 133.3 / 233.3 / 4933.2 / 4933.2 | 19 / 8206.0 | 487.2 |
| visited-800 · 1 | before | 83.3 / 83.6 / 150.0 / 166.8 | 7 / 572.0 | 434.4 |
| visited-800 · 1 | after | 66.7 / 83.4 / 133.2 / 167.3 | 5 / 432.0 | 490.1 |
| visited-800 · 2 | after | 133.3 / 183.2 / 283.3 / 333.5 | 12 / 892.0 | 457.1 |
| visited-800 · 2 | before | 66.7 / 83.4 / 133.2 / 133.3 | 1 / 135.0 | 463.6 |
| boundary-810 · 2 | after | 83.2 / 100.1 / 983.2 / 5183.3 | 19 / 7224.0 | 512.7 |
| boundary-810 · 2 | before | 83.4 / 216.7 / 4966.5 / 4966.5 | 21 / 8720.0 | 520.2 |
| developed-810 · 2 | after | 83.3 / 166.8 / 500.1 / 699.9 | 37 / 5086.0 | 463.7 |
| developed-810 · 2 | before | 100.0 / 200.0 / 433.1 / 633.3 | 39 / 4853.0 | 476.7 |

This is a shared Windows laptop, using instrumented Vite development modules. GPU load/clock/thermal state and browser/OS scheduling are not controlled. The full-frame distributions vary, including cases that are slower after; selected CPU savings are not a GPU/FPS claim. Annual native fitting, canonical projection/persistence and navigation still contribute costs outside the selected paths. Raw GPU queries, CPU spans, CDP counters and both repetitions are preserved without removing unfavorable samples. Physical iPhone/iPad performance is unmeasured.

## Correctness and lifecycle

- The new geometry-query and DOM-parser expectations first failed on the pinned implementation (expected-red files); no owned modules were mocked. Tests use real assets and existing public scene/session/browser seams.
- Floor probes compare each retained result with a new real-asset layer across point/home transforms, assignment removal/restoration, life-stage model changes, removal/recreation, rollback and worlds with reused identities. Positions match exactly. Newly measured versus retained world bounds differ by ordinary translation roundoff around 1e-14 m; the test requires less than 1e-9 m, while unchanged bounds remain exact.
- Actual card controls retain focus/edits/disclosures through a tick, reset unpreserved paused controls, refresh work and age, and do not duplicate source-linked production awards. A real import reuses IDs, refreshes affordability after salvage, and the real paid BuildHouse command matches Core exactly and spends once. The 390px card remains current.
- Existing lifecycle and actual-control runners pass against the normal uninstrumented server: delayed/disposed/replaced loads, retained native instances, import/map/Recon/house commands and running focused edits. Their reports are included.
- Selected-resident Summer/Winter Standard desktop and Summer Low mobile golden pairs have exact fixed-time world pixels, selected-card markup, Core, authoritative blueprint/layout, native appearance/wardrobe, lighting/season, camera/markers and render-resource equality. Selection adds visible rings/card content to the existing #203 fixtures. No cross-device pixel identity is claimed.
- Production build, tracked public assets and explicit character/Lab-preview validation pass. The 59-test related run has zero failures/skips. Required full repository CI runs unchanged on the final head; existing optional-source skips are disclosed on the PR. No project formatter is configured; formatting and whitespace were manually reviewed. Existing Vite chunk-size warnings are retained.

## Reproduction, review and revert

Use the existing fjord-runtime-server.mjs with QA_UPDATE_STUDY=1 on separate cache/ports. Pin the baseline using QA_SOURCE_REF=a54cb668f826b529ff132fc6275e22e095224423 and QA_PIN_UPDATE_PATHS=1. Reuse fjord-runtime-audit.mjs with QA_VARIANTS before/after, QA_REPEATS=2, QA_WARMUP_MS=2000, QA_SAMPLE_MS=15000 and the three scenarios recorded verbatim in matched.json. The copied fixture bytes come from docs/qa/fjord-runtime-performance/fixtures and docs/qa/rival-visibility/visited-review.json. Do not run heavy local checks alongside timing windows.

Run check-fjord-floor-dependencies.mjs against normal Vite and check-fjord-card-dependencies.mjs against the opt-in bridge. Golden captures reuse capture-golden-fjord.mjs with QA_SELECTED=persona:founder-1, existing village/winter fixtures, frozen time, Effects Off and matched quality/viewport; compare-scene-lifecycle.mjs requires exact paired results. check-scene-owner.mjs and check-scene-interactions.mjs use QA_ORIGIN and QA_OUTPUT to avoid overwriting historical evidence. This publisher fails unless all twelve paired runs, canonical outcomes and focused/golden/lifecycle reports pass.

Review the images in review.html, then check selection, cards, editable fields, housing affordability, map/mission controls and background return on a physical iPhone/iPad before claiming device acceptance. No public Sites playtest is updated from this feature branch.

Revert the two optimization commits (640de54 and bd69e50) together; evidence/tooling may be reverted separately. The existing uncached code path and #209 owner remain. There are no migrations or new dependencies to undo.
