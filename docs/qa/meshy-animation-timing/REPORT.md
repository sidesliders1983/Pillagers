# Meshy Human animation timing follow-up

Date: 2026-10-09. Branch: codex/character-modules-v2. Source-rate playback in the
original Character Lab and the focused Meshy preview now uses each loaded GLB's
complete duration, including exact endpoint sampling and one-shot holds.

## Findings and change

All 14 prepared clips already matched the original source duration at LOD0/1/2.
There was no asset truncation. Lab playback inherited DNA cadence, so its wall time
could differ from the authored duration. Labs now keep a persistent 1× override;
world residents retain their existing DNA cadence and stride behavior.

The preview also limited frame time to 0.05 s. A new public-UI clock check reproduced
Running taking **1.423 s** in the slow software-rendered focused preview even though
its source is **0.666667 s**. Native animation playback now consumes elapsed frame
time. The existing spring still uses bounded substeps independently.

The original Lab previously had a fixed 60-second time field and no clip duration
label. Both views now show the actual duration and an advancing clock. Committing
an edited time freezes that pose before the live clock can overwrite it on blur.
Frozen values retain full precision, including endpoints such as Attack's
2.8333332538604736 s. Repeating clips wrap only at their GLB endpoint; Attack and
Death hold the final frame. Focused Lab clip selection restarts from zero.

## Frozen source lengths

[Source audit and immutable master/LOD hashes](source-audit.json). Source duration,
last authored key and all three prepared LOD durations are identical for each clip.
The original master and runtime GLBs are unchanged.

| Source clip | Duration (seconds; rounded for display) |
| --- | ---: |
| Running | 0.666667 |
| Walking | 1.041667 |
| 01a11653-99cc-7579-b58e-8682f15317fa | 4.041667 |
| Attack | 2.833333 |
| Fall_Dead_from_Abdominal_Injury | 3.500000 |
| Idle_02 | 1.875000 |
| Idle_03 | 4.291667 |
| Idle_11 | 1.875000 |
| Idle_7 | 8.750000 |
| Listening_Gesture | 9.333333 |
| Pull_Radish | 4.708333 |
| Talk_Passionately | 10.291667 |
| Unsteady_Walk | 3.000000 |
| 01a11653-99cc-7579-b58e-8682f15317fa.001 | 0.083333 |

## Verification

- The new public-factory regression first failed because the source-rate behavior
  was absent, then passed for all 42 clip/LOD combinations. Each combination also
  runs after a child DNA change, checking late playback, loop wrapping and one-shot
  endpoint holds against the actual GLB timestamps.
- The browser workflow separately reproduced and fixed time-field overwrite and
  frozen endpoint rounding. It checks **84 visible duration/endpoint cases** across
  both Lab routes and all three LODs. Original Lab snapshots preserve exact end
  times; native range-control decimal serialization is allowed only 1e-12 s error.
- **Eight observed loops** of Running and Unsteady Walk complete across both routes.
  Periods are measured from the visible time field, with render-frame tolerance.
  Playback must reach the final observable section within one measured frame;
  exact endpoint poses are checked separately for every clip.
- Six actual near-end/endpoint screenshots were visually inspected. No browser
  errors or failed HTTP responses. [Public UI evidence](public-lab-evidence.json).
- Full local suite: **430 tests, 428 passed, 0 failed, 2 existing optional skips**.
  Skips concern the unavailable generated-house and historical r3 fixtures.
  Focused Lab/runtime/body tests: 31 passed; final timing/snapshot checks: 3 passed.
- TypeScript and production build passed. Full character validation, including
  explicit Lab-preview audits, passed. The existing large-bundle build warning is
  retained. No formatter is configured; changed code was manually formatted and
  checked with git diff --check.

| Lab route | Clip | GLB seconds | Observed loop seconds | Largest render gap (seconds) |
| --- | --- | ---: | ---: | ---: |
| /character-lab | Running | 0.666667 | 0.638 | 0.105 |
| /character-lab | Unsteady_Walk | 3.000000 | 2.966 | 0.101 |
| /meshy-preview | Running | 0.666667 | 0.645 | 0.279 |
| /meshy-preview | Unsteady_Walk | 3.000000 | 3.001 | 0.174 |

## Actual Lab views

| Clip | Original Lab near end | Exact endpoint | Focused preview near end |
| --- | --- | --- | --- |
| Running | [View](original-Running-near-end.png) | [View](original-Running-endpoint.png) | [View](focused-Running-near-end.png) |
| Unsteady Walk | [View](original-Unsteady_Walk-near-end.png) | [View](original-Unsteady_Walk-endpoint.png) | [View](focused-Unsteady_Walk-near-end.png) |

## Scope

These checks verify timing and source-body endpoint inspection. They preserve the
source's authored loop seams and do not certify every clip as artistically seamless.
The software GPU is not a crowd-performance benchmark. Native outfit previews remain
qualified only for the previously recorded adult Idle/Walk/Run fitting samples;
other clips are not promoted by this timing check. Earlier neck/outfit evidence is
retained as its original measurement record.
