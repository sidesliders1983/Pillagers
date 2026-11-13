# Personal armor rendering observation

Status: PASS. Build: local-4ca0cb28c899bc6803a7.

All profiles keep the same DNA, LOD2, hair, field tunic, shoes, iron hand props, Front camera and live Idle.

| Profile | Draws median | Submitted triangles median | Live textures | Live buffers | Live programs | Callback wall median ms | Callback wall p95 ms | GPU query median ms | Valid GPU samples | ThreadTime CPU ms / observed callback | TaskDuration CPU ms / observed callback | Native hair triangles delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 19 | 386806 | 19 | 44 | 10 | 1.800 | 2.500 | 7.294 | 30/30 | 4.928 | 4.833 | 0 |
| body-only | 21 | 398838 | 20 | 47 | 10 | 1.500 | 2.200 | 6.405 | 30/30 | 5.464 | 5.393 | 0 |
| helmet-only | 21 | 403088 | 21 | 49 | 10 | 1.700 | 2.100 | 7.540 | 30/30 | 5.559 | 5.479 | 3270 |
| both | 23 | 415120 | 21 | 52 | 10 | 1.600 | 1.900 | 7.468 | 30/30 | 5.052 | 4.982 | 3270 |

Callback wall time includes application work, driver waits, submission and instrumentation. It is neither isolated CPU time nor GPU duration. Optional EXT GPU elapsed queries are separate, asynchronously polled and discarded on disjoint. Programs are not material counts.

CDP threadTicks ThreadTime/TaskDuration are aggregate renderer-main-thread CPU counter deltas (seconds), converted to milliseconds per actual observed drawing callback. They include all main-thread work and measurement overhead. The raw report retains start/end metrics and the possible extra callbacks at CDP boundary reads; no isolated per-render CPU claim is made. Unsupported domains, absent/reset metrics and failed reads remain NOT MEASURED. GPU result polling occurs after the CPU window.

Warm resource-cycle plateau passed with exact counts.

This is desktop headless evidence. Physical-device heat and geometry-fit acceptance remain separate. Missing/disjoint GPU query durations are not a GPU timing pass. See report.json for raw frames, source/asset hashes, counters and any failures.
