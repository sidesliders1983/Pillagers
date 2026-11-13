# Personal armor rendering observation

Status: PASS. Build: local-7fd18c9442ecded73fbc.

All profiles keep the same DNA, LOD2, hair, field tunic, shoes, iron hand props, Front camera and live Idle.

| Profile | Draws median | Submitted triangles median | Live textures | Live buffers | Live programs | Callback wall median ms | Callback wall p95 ms | GPU query median ms | Valid GPU samples | ThreadTime CPU ms / observed callback | TaskDuration CPU ms / observed callback | Native hair triangles delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 19 | 386806 | 19 | 44 | 10 | 1.500 | 1.800 | 7.136 | 30/30 | 3.583 | 3.514 | 0 |
| body-only | 21 | 400200 | 20 | 47 | 10 | 1.900 | 2.200 | 7.549 | 30/30 | 5.880 | 5.802 | 0 |
| helmet-only | 21 | 403068 | 21 | 49 | 10 | 1.500 | 1.700 | 7.533 | 30/30 | 4.934 | 4.846 | 3030 |
| both | 23 | 416462 | 21 | 52 | 10 | 1.500 | 2.000 | 8.060 | 30/30 | 4.829 | 4.749 | 3030 |

Callback wall time includes application work, driver waits, submission and instrumentation. It is neither isolated CPU time nor GPU duration. Optional EXT GPU elapsed queries are separate, asynchronously polled and discarded on disjoint. Programs are not material counts.

CDP threadTicks ThreadTime/TaskDuration are aggregate renderer-main-thread CPU counter deltas (seconds), converted to milliseconds per actual observed drawing callback. They include all main-thread work and measurement overhead. The raw report retains start/end metrics and the possible extra callbacks at CDP boundary reads; no isolated per-render CPU claim is made. Unsupported domains, absent/reset metrics and failed reads remain NOT MEASURED. GPU result polling occurs after the CPU window.

Warm resource-cycle plateau passed with exact counts.

This is desktop headless evidence. Physical-device heat and geometry-fit acceptance remain separate. Missing/disjoint GPU query durations are not a GPU timing pass. See report.json for raw frames, source/asset hashes, counters and any failures.
