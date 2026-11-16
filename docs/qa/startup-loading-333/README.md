# Campaign startup loading refinement, 16 November 2026

This change removes repeated preparation work. It does not establish the cause of the reported 4:30 load, which was not reproduced here, or reduce the at least approximately 52 MB of observed window transfers (worker requests are outside that count).

## Change and scope

The game still prepares all eight housing profiles and their complete, fade, opaque-reveal and fading-reveal states before play. The same 24 owners retain their programs until disposal. Two awaited compilation batches replace 33 individually awaited calls; two eager-only scene draws replace nine full-world draws. Other scene drawables are excluded temporarily through finally-restored layers; actual lights, fog and shadow configuration remain in use. Only the same initial Hut/FarmHut/scaffold textures and geometry upload eagerly.

Nature source loading starts four roles at a time, settles each batch and adopts models in the original canonical order. Atlas choice, geometry, grounding and placeholders remain identical. Failure drains the batch and releases decoded resources without disturbing the retained prefix. No source models, clothing topology, texture quality, simulation rules or Core timing changed.

## Measurements and limits

Measured baseline commit: `4e2226a0abe91b65379e19af30edae4f645f776e`.
Measured candidate commit: `d9bf10c8cb511e8740c013654c29495c94a292ab`.
Later receipt/tooling commits retain those production source objects unchanged.

The fixed ordinary field campaign is retained as `fixture-campaign.json.gz`; its uncompressed SHA256 is `aec3bb8a4eb1249afe73230d0d80e861f49a565202e795c9a6c5db22901b5068`. All browser runs import through public player controls in isolated owned contexts.

| Installed Chrome157, Intel HD630/D3D11 | Baseline first | Candidate | Baseline repeat |
| --- | ---: | ---: | ---: |
| Authoritative source playable |27.788s|21.159s|19.940s|
| Construction preparation |8.092s|0.398s|2.650s|
| Four GPU preparation stages combined |9.626s|3.353s|4.045s|
| Initial GPU draws |1.060s|2.116s|1.068s|

One browser launch, three fresh contexts, disabled HTTP cache, normal motion, same low quality,1366×768/DPR1, settled animated entry before Continue, no CPU profiler. These observations support the bounded prewarm-stage improvement. They do not show a robust total native loading gain: the repeated baseline finished faster than the candidate. OS and graphics-driver caches were not reset, and first-draw work increased.

The software-renderer pilot used bundled headless-shell SwiftShader, reduced motion, the same fixture and low quality. Candidate source playable was 31.375 s, versus historical 54.684 s and 62.444 s. Construction fell from29.909/37.019s to2.205s; final draws increased from6.565/8.288s to11.530s. The historical cold observation had CPU-profiler overhead and the repeat did not achieve a fully cached browser load. This supports a substantial software-fallback pilot reduction, not a controlled percentage, hardware prediction or phone claim. The delayed candidate DOM observer reported43.519s; source marks are not interchangeable with callback timing.

The actual private Sites service-header cold-path diagnostic took61.036s internally, approximately 63 s to the report, using software rendering. It recorded 162 window resources and 52,067,248 transferred bytes: approximately 25.11 MiB prepared character sources,12.57 MiB compact models and8.24 MiB pine assets. Origin-restricted request routing disabled HTTP cache; CDN/server caches were not reset. The separate delivery probe retained CF cache-statusHIT even with unique queries, so it does not reproduce an empty edge cache. No conclusion about the playtester's connection is made.

## Correctness

All native hardware appearances, assigned equipment, UI and camera matrices match. All ten residents rendered. Every measured hardware/software candidate run had zero failed requests, HTTP errors, page errors and console errors.

The candidate's ordinary exported Core is deep-exact with the input after the two existing public Fjord import compatibility commands, `UseSeasonalWeatherProduction` and `UseCulturalOccasions`. The raw eight differences are retained in `core-parity-diff.json`; time, RNG, stocks and equipment already matched without normalization. This patch adds no adoption commands.

All fourteen islands were actually regenerated with `node scripts/prepare-campaign-islands.mjs`, not `--repack`. Every compressed binary and decoded canonical world, plan, terrain, navigation and placement identity matched the baseline. Only the generated input fingerprint changed. The unchanged strict validator passed fourteen islands and 74 prepared character sources. Before/after receipts are retained.

Twenty-eight focused preparation, construction-transition, resource-ownership and loading-lifecycle tests pass. Full public-asset validation, TypeScript and Vite build pass. The shader tests assert every material state and cancellation/restoration behavior rather than only the reduced compilation-call count. Formatting was reviewed manually; no repository formatter is configured.

## Evidence and reproduction

`retained-files.json` pins the exact retained files and the uncompressed identities of gzip receipts. `hardware-summary.json`, `software-summary.json` and `software-baseline-summary.json` describe the protocols and limits. Raw reports retain every resource, stage, error and long-task array. The historical software CPU profile is explicitly software-renderer evidence. Screenshots are records of the journeys, not a pixel-equality claim; the candidate screenshot was captured after opening the export menu.

Use `scripts/qa/serve-startup-build.mjs` for each validated static snapshot, then `scripts/qa/measure-campaign-startup.mjs --help` for the matched public-UI runner. Supply the exact fixture, both origins and expected source commits, an installed Chrome executable and an installed Playwright module through `PILLAGERS_PLAYWRIGHT_MODULE`. It does not install dependencies or patch game APIs. Keep the same viewport, quality, motion, cache policy and browser flags between legs. No browser run is a substitute for the remaining owner playtest or physical-phone loading/thermal review.