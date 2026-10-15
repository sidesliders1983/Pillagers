# Issue 168 — measured campaign-read optimization

Before: `46ee1b50630a978455b48731167507d33bff6b75`. After: `156651a0d44b3a0c61581c1a1e25ac33e8839e55`. Historical audit #166 remains unchanged.

Three alternating paired trials per scenario, actual owner house models, zero placeholders, Low quality/effects, DPR 1, Edge/Intel HD 630. Five-second warmup, nominal twenty-second capture. Scheduled cases commit exactly 40 AdvanceTicks(3) commands at 500 ms deadlines; the QA-only clock guard prevents additional canonical commands. Paused and natural-clock controls are labelled separately. Before/after columns are medians of per-trial metrics; percent columns are medians of within-pair changes (ratios and medians need not commute under host drift). Full ranges/raw windows are in [results.json](results.json) and [paired.json](paired.json).

All 54 browser replays pass. 24 pairs also have identical complete Core and campaign/narrative/save hashes; scheduled cases process exactly 120 ticks on each build. Actual GPU query samples are non-disjoint. Host power/thermal limitations remain those of the audit; viewport tests do not establish physical mobile performance.

| Scenario | Refresh mean before → after ms | Refresh p95 before → after ms | Paired CPU change | Frame p95 before → after ms | GPU mean before → after ms | Paired GPU change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| {"fixture":"summer-32","running":true,"commands":40} | 14.2 → 5.6 | 17.5 → 8.0 | -61.8% | 116.9 → 116.9 | 100.4 → 100.3 | -0.1% |
| {"fixture":"summer-17","running":true,"cameraPath":true,"commands":40} | 19.8 → 7.4 | 23.4 → 11.4 | -63.0% | 116.9 → 116.9 | 98.3 → 97.5 | -0.8% |
| {"fixture":"developed-810","running":true,"commands":40} | 96.9 → 31.0 | 104.2 → 36.6 | -67.8% | 183.6 → 100.2 | 85.4 → 85.1 | 0.0% |
| {"fixture":"developed-810","running":true,"selected":true,"commands":40} | 160.4 → 76.6 | 172.5 → 83.1 | -52.8% | 217.0 → 100.3 | 85.4 → 85.7 | 0.4% |
| {"fixture":"developed-810","running":true,"cameraPath":true,"commands":40} | 99.3 → 32.4 | 109.9 → 38.6 | -69.1% | 183.6 → 100.2 | 85.7 → 85.1 | -4.5% |
| {"fixture":"developed-810","running":false,"cameraPath":true} | UNKNOWN → UNKNOWN | UNKNOWN → UNKNOWN | UNKNOWN% | 100.2 → 100.2 | 83.8 → 84.0 | 0.3% |
| {"fixture":"boundary-810","running":true,"minutes":3,"commands":40} | 104.9 → 35.4 | 112.8 → 41.0 | -65.8% | 183.6 → 100.3 | 87.5 → 83.7 | -0.2% |
| {"fixture":"crowd-25","running":true,"cameraPath":true,"commands":40} | 24.8 → 9.6 | 28.5 → 12.4 | -61.0% | 183.7 → 183.7 | 158.0 → 157.0 | 4.5% |
| {"fixture":"developed-810","running":true} | 97.4 → 30.7 | 106.8 → 34.7 | -68.4% | 183.6 → 100.2 | 86.7 → 85.2 | -1.8% |

Negative GPU change means a lower observed command interval. The crowd frame-time outliers and late host-wide GPU timing shift remain visible in the raw pair ranges; no universal frame-rate gain is claimed from #168 alone. Route-specific stalls are addressed separately in #169. UI work does not remove the fixed GPU load; small deltas under host drift are not a GPU optimization claim.

The public snapshot still clones. Internal readSnapshot creates one isolated deeply frozen snapshot per committed revision, and readProjection caches a detached frozen presentation model. Core commands/import/restart/replacement invalidate it; rejected commands retain the previous valid read. Selection, playback and fractional pacing serialize their current values on every scheduled/explicit save. Canonical serializeState validation is retained once per immutable revision. Availability probes still call authoritative applyCommand, with bounded per-revision reuse of identical finite-JSON commands; no alternative eligibility rules were introduced.

Remaining copies: one complete snapshot per new revision consumed by the UI; independent public snapshots on request; one small detached projection per changed canonical/layout/geography input; existing narrative and import/handoff ownership copies. Scheduled persistence is retained, and the matching save hashes include narrative publication/read flags, layout, selection and pacing.

Validation: TypeScript/production build and 51 focused tests pass, including five new read/caching/eligibility/exact-save tests. A separate test repair verifies the actual 0.2 shader uniform, independent per-person ownership, native-neutral 0.0 and restored 0.2; all nine original-Human tests pass. Production shader code is unchanged and the original failed audit record is preserved. Current-head full suite/character validation/CI and final production-bundle isolation are recorded in the combined implementation handoff.

Rollback: revert the #168 source commits as one slice; no save migration or gameplay-rule change is required. Layout/geometry/rendering source and default visual policies are unchanged. Owner review precedes merge.

Final implementation confirmation: `9dbdb69a2fd1d7eb4241d46482e5440e0e360bef` was measured in three additional alternating pairs after capturing a consistent immutable state/view through asynchronous scene synchronization. All six replays, three complete checkpoint pairs and the delayed-layer coalescing check pass. Final paired median UI CPU change: -65.6%. Final refresh p95 values: 37.2, 30.6, 59.2 ms. The third trial (59.2 ms) misses the strict 50 ms target; it is retained, so this gate is not fully met on the final code. Observed paired GPU change: 0.1%, with no rendering change or GPU improvement claim. See [final-plan.json](final-plan.json), [final-paired.json](final-paired.json) and finalConfirmation in results.json. The broad matrix above retains its original source pin.
