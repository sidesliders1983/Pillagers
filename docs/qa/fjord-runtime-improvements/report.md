# Fjordside runtime improvements — measured implementation report

> Evidence archive: bulky generated captures are retained at the pinned merged commit. See [access and restore instructions](../fjord-performance-evidence.md). Measurement results, source pins and limitations below are unchanged.

Three independently rollbackable changes address repeated campaign reads, failed route searches and annual native wardrobe fitting. They share draft [PR #167](https://github.com/sidesliders1983/Pillagers/pull/167). The [original audit #166](../fjord-runtime-performance/report.md), including its historical failures and initial asset-environment correction, remains unchanged.

## Results and acceptance

Component times are main-thread elapsed CPU work, supported by native samples. They are not percentages of whole-machine utilization or overall FPS gains. Nested inclusive spans overlap and must not be summed. Actual GPU command execution is measured separately from JS submission; this shared laptop uses Edge/ANGLE on Intel HD630 rather than its installed NVIDIA adapter. GPU timing varies substantially in unchanged Paused controls, so observed deltas do not establish an independent GPU optimization.

| Issue | Measured CPU result | Observed GPU result | Important remaining gates |
| --- | --- | --- | --- |
| [168 — snapshot/UI](168/report.md) | Final paired median refresh CPU **-65.6%**; broad 54-run matrix -67.8% | Final paired median **+0.1%** | Final refresh p95 37.2 / 30.6 / 59.2ms; third trial misses 50ms |
| [169 — routing](169/report.md) | Final paired median late route CPU **-94.9%** over three five-minute trials | Median **+11.2%**, range -0.9% to +20.9%; host drift | Cold motion p99 <25ms and median occupation-arrival rate miss; cold single-route maxima can worsen |
| [170 — annual fitting](170/report.md) | First boundary **-99.9%** at all three year speeds; later-boundary median **-83.0%** | First-boundary medians **-0.7% / -2.0% / -2.2%**; controls vary | 70% CPU gate passes all twelve annual pairs; maximum frame <500ms fails (after 1.07–5.53s); steady p95/p99 no-increase not demonstrated |

All matched scheduled comparisons retain exact authoritative Core and complete campaign/narrative/checkpoint identity. No canonical ticks are skipped to claim a gain. Real owner-prepared house GLBs, actual DNA-driven Human bodies and authored modules are used with zero placeholders. Source pins, fixtures, raw distributions, profiles, model IDs, GPU queries and negative controls are linked from each issue report. The strict missed gates remain visible; these results do not close every performance/behavior acceptance criterion.

## Behavior and ownership

Snapshot reads share only detached immutable internal views, while public snapshots remain independently mutable. Successful commands/import/restart invalidate revision caches; rejected commands retain valid reads. Explicit/scheduled saves retain current pacing, selection, narrative state and canonical serialization validation. An asynchronous scene pass captures one consistent state/projection pair.

Failed-route memory is bounded in active presentation time and invalidates on relevant world/goal changes. A stable heap avoids repeated sorted-open-set work. Workers can return along their verified outward corridor, with current static and per-step body clearance checks. No teleport, permanent blacklist or suppressed canonical activity is introduced. Arrival-rate differences and remaining slow searches are reported rather than inferred away.

Fitting reuse is per person and depends on actual neutral geometry/rig/binding/coverage/scale/output revisions. Fresh DNA, age, skin colour, pose, motion and eligible clothes remain current; growth, new garments and actual hair/beard colour changes take the complete original path. Offscreen aging, selection and owned resource disposal are tested. Canonical birthday/Winter rules are preserved; separate birthday ticks would be a gameplay/save change rather than a prerequisite for these optimizations.

## Verification and review status

- [Full local suite](https://github.com/sidesliders1983/Pillagers/blob/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements/validation/full-tests.txt): **805 tests, 804 passed, zero failed, one pre-existing opt-in r3 export evidence test skipped**. The skip requires RUN_R3_EVIDENCE=1 and its separate frozen preview GLB; validation was not bypassed.
- [Character validation](https://github.com/sidesliders1983/Pillagers/blob/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements/validation/characters.txt): **20 assets / 36 GLBs, 12 Golden Characters, 19 modules, Idle/Walk/Run + World passed**.
- [TypeScript and normal production build](https://github.com/sidesliders1983/Pillagers/blob/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements/validation/build.txt) passed. Normal bundles contain no opt-in QA bridge. The measured application is the separately pinned fitting implementation; subsequent integration of main is described below.
- A separate inherited-test repair verifies the actual 0.2 skin uniform, independent ownership and native-neutral 0.0/restored0.2 behavior. The production shader is unchanged and the original failed test record remains in audit #166.
- [Uninstrumented production confirmation](170/stock-results.json): six natural annual crossings, zero placeholders/QA bridge and exact replay of each actual tick count. Median maximum frame **2,233.1→450.0ms**; after range **400.0–583.3ms**, so one of three still misses 500ms. Natural tick counts differ; controlled matched pairs remain the CPU/GPU evidence.
- [Fitting visual proof](170/visual/comparison.json): **44 images / 22 pairs, all pixel-identical**, exact bounds/ray/profile/module/resource metadata, both actual aged-world save/reload/removal/picking checks pass. Difficult garment/child/elder/LOD/mobile views were inspected; existing source seams/forms remain and owner sign-off is outstanding.
- Required current-head CI is available on [the PR checks page](https://github.com/sidesliders1983/Pillagers/pull/167/checks). Keep draft until all required checks pass and the owner reviews movement/garment fidelity.

No formatter is configured; changed source follows neighboring style and is checked manually with node --check and git diff --check. Physical mobile hardware remains untested. Existing authored-garment fitting limitations and ordinary-animation cached-bounds approximations are not reclassified as solved.

## Reproduction notes

Use the scripts/qa/fjord-runtime-* harness and per-issue plan files. The bridge is loaded only by the opt-in QA Vite server; production confirmations use public controls and assert that it is absent. Fitting captures require and record the same native-fit-v1 protocol on both sources. A stale first bridge capture is retained as invalid evidence; a later low-disk interruption preserves five complete raw cases with checksum-verified resumption. No incomplete run is accepted.

Licensed/source asset bytes are not duplicated into Git. Generated production static folders may share identical local bytes through junctions; application JS/CSS bundles remain normal build output. No dependency, save migration, gameplay/balance or authored asset change is required. Source commits for each component can be reverted independently; the fitting API also retains its forced full-refit path for comparison.

## Integration with current main

After all pinned measurements, main advanced to `512bedc` (FjordSide branding, PR #163). Its single conflict is a diagnostics row changed by snapshot consistency: retain `sceneCanonicalTime` from the captured scene state and apply the new FjordSide spelling. Titles, bootstrap/icons/manifest and suggested export filenames follow main. Fitting, routing, authoritative Core and the measured snapshot algorithm are unchanged. The original pinned comparisons and historical evidence remain intact; they are not relabeled as measurements of the branding merge. A fresh production build and current-head CI validate the integration. Final bridge-free public-control smoke results are recorded in the PR review notes.
