# Resident preparation follow-up — 22 October 2026

Owner iPhone screenshots from port 5230 show 80% at elapsed 01:02, then 4/23 settlement
models at 01:22, and 97% / 78 of 153 first-draw batches at 02:05. These are physical-device
observations, not a completed matched cold/warm benchmark. The exact browser, campaign seed,
quality, recording state and cache conditions were not supplied. The game becoming interactive
is not shown in those frames. The misleading `Preparing settlement paths` title persisted after
that nested operation finished; model counters were already reporting later work.

## Measured CPU cause and change

A small Node harness uses ten actual seed-32 founder identities/faces, the published world LOD2,
existing clothing selection, original source assets and actual FjordModels create/reconcile.
Images are stubbed; file reads, GLTF parsing and CPU fitting remain real. It is not WebGL, network,
image decode or an end-to-end iPhone load benchmark. Nested method timings overlap.

The baseline was source commit `b0ac985d69ce431e798a3b7700796d02e23fa9a2` with the observation
script added. Most CPU time was inside native clothing coverage generation, rather than the
62 animation samples per resident. Each garment divides the body into multiple fragments;
previously each fragment decoded every source/morph attribute, materialized unused native
vertices and only then compacted them away.

`createBodyCoverageBuilder` now reads those attributes once per synchronous outfit refit.
Fragments read immutable native values from that local snapshot and allocate append values for
cut corners. Native joint mixtures are expanded only for corners participating in a cut. Each
fragment is compacted before its final typed attributes are allocated, preserving the native
prefix on the first fragment. Other normalized/interleaved/custom accessor semantics remain on
their existing path. A new refit reads fresh source values, including unversioned in-place edits.

There is no persistent/cross-resident cache, shared mutable mask, extra GPU resource, LOD change,
reduced detail, animation sampling change or different clothing rule. Temporary preparation
buffers become collectible after the synchronous operation. True browser/process peak memory
was not measured; this is not a claim of a quantified memory reduction or OOM recovery.

| CPU workload | Before | After (median of three runs) |
| --- | ---: | ---: |
| Ten residents, complete create/reconcile | 6,333.8 ms | 3,690.3 ms |
| Nested module refitting | 4,767.7 ms | 2,101.4 ms |

After total runs: 3,693.4 / 3,690.3 / 3,617.7 ms, about **42% less CPU preparation time** for this
workload. Source read/parse remained roughly 300–350 ms. These are separate fresh Node processes;
OS file-cache state is uncontrolled. CPU sampling corroborated repeated coverage-array decoding
and fragment building as the hot path. No inference about GPU compilation duration follows.

## Correctness and loading copy

The before/after receipt compares every resident's body attribute, index and morph buffer bytes,
selected module IDs and measured walking pace: all ten match exactly in all three final runs.
It does not compare rendered material pixels. See `comparison.json`; its historical baseline is
retained as measured. The reproducible harness is `scripts/qa/measure-settlement-models.mjs`:

```text
node scripts/qa/measure-settlement-models.mjs after path/to/settlement-before.json
```

42 focused tests pass, including all body LODs, children/adults/elders, forced versus retained fits,
coverage mutations, source ownership, hats/beards/clothes, native passenger poses and loader
failure/retry. New small fixtures cover normalized/interleaved attributes, morph buffers, exact
cut weights/lineage, fragment ownership and fresh refit reads. Production validation, strict
TypeScript and Vite build pass. Manual formatting/diff checking was used; no formatter is configured.

The loading owner now restores the parent phase after a successful nested operation and measures
settlement models separately, so `paths` no longer labels the later model stage. New landing screens
omit the redundant Summer/clock helper sentence at the owner's request. Percentage and elapsed time
remain work-based. Physical iPhone rerun and exact-head CI are still required; the full 2-minute load
has not been remeasured. Other slow-load causes remain under #151.
