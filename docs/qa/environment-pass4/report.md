# Environment Pass 4 — combined review and handoff

Date: 2026-10-08. Status: **not integration-ready**. This is an agent review of the exact recorded candidate, not owner visual approval.

PR #67 delivered Ground v0.4 after both current-head checks passed. The owner clarified that the very old development laptop is a diagnostic reference: a few milliseconds above the proposed, unapproved threshold must not block the Lab merge. All earlier measurements and failures remain historical records. Combined visual approval and representative-device evidence remain part of #59/#60.

## Exact candidate and sources

Capture/runtime revision: `f6a19b224a614e5307a5c33f6bae7f0f08dfccfe`, merged without changing runtime files into main as `612da515c176c8cf59c38721043da82da6b990ff`. Seed 1983, phase zero, GrassField OFF, DPR 1. Canvas sizes are 1536×1024 for reference review and 1024×768 for historical/performance comparison. The [capture manifest](capture-manifest.json) records camera position/target/FOV/zoom, light, quality, renderer, ground configuration, counts, canvas rectangle and image hashes.

- Water: boona13 revision `97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159`, MIT, documented compatibility/lifecycle adapters; unchanged upstream shader. Compatibility quality uses the historical water fallback, not the approved primary water.
- Ground: selected CC0 ambientCG Ground037/Ground054 and Poly Haven grass_path_2/mossy_rock. Twelve native material regions, same canonical triangles and heights. Standard retains colour/normal/roughness; Low retains colour/roughness. Exact delivery configuration and hashes are in [Ground v0.4 manifest](../../../public/ground-materials/v04/manifest.json).
- Nature: fourteen locked KayKit Forest 1.0 FREE roles, original geometry/atlas, CC0. [Role/file lock](../../references/environment/kaykit-source-lock.json) and [unchanged source/runtime contact sheet](../environment-v03/source-runtime-contact-sheet.png). No EZ-Tree replacement, generated scenery, new GLSL or renderer migration.
- Original Meshy houses/farmyards and the existing 1.8m static human remain. This fixture has one static person; it does not certify the ~10 animated production residents required for #60.

[Source and capture audit](source-and-capture-audit.json) verifies 157 current files, including both original reference hashes, every selected KayKit runtime file, old/new ground outputs, vendor source/license records and all 36 captures. The earlier [Ground repeat-bake proof](../ground-v04/replay-proof.json) is unchanged. Hash verification is source/fixture evidence, not art approval or measured GPU memory.

## Full capture matrix

Every supported day/night × Standard/Low/Compatibility cell is recorded. All nine dusk cells are **blocked** because the Lab exposes no dusk preset. The fallback images do not grant primary-water acceptance. Near/far daylight pairs exist for each composition in Standard; extra Low/Compatibility distance pairs are untested.

| Composition | Standard day / night | Low day / night | Compatibility day / night |
| --- | --- | --- | --- |
| Shore | [Day](shore-standard-day.webp) / [Night](shore-standard-night.webp) | [Day](shore-low-day.webp) / [Night](shore-low-night.webp) | [Day](shore-legacy-day.webp) / [Night](shore-legacy-night.webp) |
| Village | [Day](village-standard-day.webp) / [Night](village-standard-night.webp) | [Day](village-low-day.webp) / [Night](village-low-night.webp) | [Day](village-legacy-day.webp) / [Night](village-legacy-night.webp) |
| Forest edge | [Day](forest-standard-day.webp) / [Night](forest-standard-night.webp) | [Day](forest-low-day.webp) / [Night](forest-low-night.webp) | [Day](forest-legacy-day.webp) / [Night](forest-legacy-night.webp) |

| View | Near / far | Isolated layers / combined |
| --- | --- | --- |
| Shore | [Near](shore-standard-day-near.webp) / [Far](shore-standard-day-far.webp) | [Ground](shore-ground-only.webp) / [KayKit](shore-kaykit-only.webp) / [Combined](shore-combined.webp) |
| Village | [Near](village-standard-day-near.webp) / [Far](village-standard-day-far.webp) | [Ground](village-ground-only.webp) / [KayKit](village-kaykit-only.webp) / [Combined](village-combined.webp) |
| Forest | [Near](forest-standard-day-near.webp) / [Far](forest-standard-day-far.webp) | Combined in matrix above |

[GrassField ON](village-grass-on.webp) / [OFF](village-grass-off.webp) uses identical framing; it is secondary detail, not a remedy for failed ground/composition. [Overview](overview-standard-day.webp). Three [1024px historical-framing captures](shore-standard-day-1024.webp) are separately labelled in the manifest. Ground-only retains water to inspect the boundary; KayKit-only hides terrain, village and water to inspect source silhouettes, not grounding.

## Reference scorecard

The [original REF-A](../../references/environment/REF-A.png), [original REF-B](../../references/environment/REF-B.png) and [crop coordinates/hashes](../../references/environment/references.json) are unchanged. Compare REF-A spring/winter panels and REF-B village-ground / shore-and-dock / forest-and-backdrop crops with the linked actual views. These are directional comparisons, not pixel registration: mock-up cameras, seasons and buildings differ. HUD, snow, raids, wedding/fire gameplay and new houses are outside scope.

| Criterion | Shore | Village | Forest edge | Visible evidence and cause |
| --- | --- | --- | --- | --- |
| 1. Authored crowns, variation, clustered forest/gaps | **Fail richness** | **Fail richness** | **Fail richness** | Actual locked KayKit crowns exist and clusters vary in height; silhouettes remain simple layered masses with thin exposed trunks. REF-B and REF-A winter have richer branching and canopy depth. Source authenticity passes; target richness does not. |
| 2. Faceted rocks, several scales, broken rocky edge | **Pass local placement** | **Fail cohesion** | **Fail cohesion** | Shore has genuine irregular stones/boulders at several sizes. Tower-like grouped KayKit outcrops near buildings/forest read as stacked columns rather than reference fractured geology. Missing distant cliffs belong to criterion 6; soil pixels are not counted as rock assets. |
| 3. Worn activity zones, patchy margins, no lawn | **Fail final composition** | **Fail final composition** | **Fail final composition** | #63 supplies finer sourced texture and visible worn routes with GrassField OFF. Broad vacant pads, smooth banks and separated rounded shrubs still differ from compact, rock-fragmented reference clearings. Residual far-view repetition is still reviewable. This is a ground/composition gap, not a missing grass shader. |
| 4. Readable warm timber/person vs cool rock/water | **Fail palette cohesion** | **Fail palette cohesion** | **Fail palette cohesion** | Warm Meshy timber remains legible and faceted rocks are cool, but bright rounded green shrubs/crowns and pale ground diverge from the references' restrained cool foliage/warm focused light. The human is a static body, not a new approved clothing design. |
| 5. Calm blue-grey fjord, continuity, reflections | **Blocked reflections** | **Blocked / water mostly out of frame** | **Blocked / water out of frame** | Muted primary water and shore continuity are visible. boona13 sky-gradient Fresnel is not geometry reflection: houses, rocks and trees do not mirror. No dock/longship composition has been added to this Lab. HDR alone would not fix scene reflections. |
| 6. Foreground / compact village / background depth | **Fail backdrop/dock** | **Fail backdrop** | **Fail backdrop** | Foreground rocks, midground original buildings and clustered trees exist. Blank sky/horizon, absent fjord walls/mountains and missing dock composition prevent reference depth. No handmade cliff stand-ins were introduced. |
| 7. Contacts, seams, popping, sorting, night readability | **Blocked final coverage** | **Fail night atmosphere** | **Fail night atmosphere** | No obvious chunk boundary, z-fighting or alpha failure was found in the recorded fixed poses; near/far sampling is not exhaustive orbit/LOD proof. Night silhouettes remain discernible but the ground halo and dark houses do not supply reference warm windows/torches. Dusk is unavailable. Mobile, tab visibility and production animation coverage remain untested. |

The **visual result is not accepted**. Source compliance, functional checks, visual assessment and performance diagnosis are reported independently. Passing source hashes or CI does not pass the scorecard.

## Performance and robustness

The completed matched benchmark uses actual Intel HD Graphics 630 / ANGLE D3D11, Edge on Windows, 1024×768 DPR 1, ten seconds warmup then thirty seconds of rAF intervals, three runs per baseline/candidate and Standard/Low at village/forest. Baseline/candidate ordering alternates by repetition. The baseline keeps the same KayKit/Meshy/water and changes only ground to v0.2. This measures the ground change in the composed scene; it is not a full old-release comparison or GPU-exclusive timer. All 24 runs completed: regional village/forest Standard and Low p95 was 16.8ms in every run; baseline p95 was 16.8ms except one forest Standard run at 17.0ms. This is display-capped presentation timing, not proof of zero additional GPU work. Regional ground adds seven reported calls in village and eight in forest. Exact results are in [hardware measurements](hardware-measurements.json) and [summary](hardware-summary.json) and [full timing table](hardware-report.md).

The old laptop is diagnostic, **not a hard millisecond release gate**, per owner instruction. No cherry-picking, removal of slow runs or fabricated target-device pass. Standard regional delivery is 18,864,090 bytes versus Low's 598,386 runtime bytes. Conservative regional RGBA8+mip upper bounds are 192/32 MiB, not actual VRAM; the Lab also loads comparison maps and scenery. These resource tradeoffs still matter independently of small timing differences.

[Fresh current-stack lifecycle evidence](lifecycle-observations.json) records ten page reloads and ten complete Low/Compatibility/Standard cycles. Reload count stability is true; per-quality count stability is {"low":false,"legacy":true,"standard":true}. Paused reload pixels were **not identical**; the cause was not established and pixel determinism is not declared passed. Low geometry count changes from 35 in the first cycle to 37 after the fallback is first exercised, then stays at 37 for cycles 2–10; its texture count stays 54. Compatibility and Standard counts are stable throughout. This is a one-time count transition, not continuing observed growth, but it is not presented as a strict all-cycle equality pass. All five layer controls restored their initial values and changed the recorded pixels; Day/Night, zoom, pan, wave resume/pause and resize observations are retained with zero browser errors. Navigations exercise pagehide disposal; stable renderer counts are not a measured-VRAM leak proof. [Browser asset delivery observations](resource-delivery.json) retain actual request URLs and encoded/cache transfer sizes, without adding repeated/cache requests into a fake minimal runtime total. [Static viewer observations](review-browser-observations.json) cover all 24 image choices with no page errors.

Physical mobile/tab-visibility, measured GPU memory, full production resident load and long exploration remain untested. No new scene implementation was changed solely to meet an arbitrary timing number.

## Bounded follow-ups from evidence

1. **Lighting/contact cohesion:** assess the already named Poly Haven Lonely Road Afternoon Pure Sky daylight HDR using native Scene.environment/PMREM on pinned Three. A separate controlled pilot must compare OFF/ON at identical views and ground, record file/hash/license, directional/ambient/exposure settings, actual consuming materials, night behaviour and disposal. Keep background independent and do not label HDR as geometry reflection/contact shadows. No HDR file or new lighting default is imported by this QA pass; pilot result is **untested**.
2. **Canopy:** matched KayKit/EZ-Tree GLB/LOD comparison is justified by criterion 1. Lock a reviewed MIT revision and exported asset provenance; compare crown shape, density, palette, triangles/materials/draw calls and shadows. Exact alternate needs owner acceptance. Existing KayKit remains selected; no automatic replacement or broad pack survey.
3. **Backdrops/dock/reflections:** obtain an explicit authored cliff/backdrop source and composition decision. Water2 is the named separate scene-reflection option if needed, not an inferred boona13 feature. Tidewater stays a visual reference, not an engine migration. These are separately bounded implementation proposals rather than hidden additions to #63.

The [pinned bounded source assessment](bounded-follow-ups.md) separates verified native API/library capability from untested pilot/export results.

See [Integration Readiness Note](integration-readiness.md). #60 is blocked until an exact combined visual stack is accepted. The completed Lab merge is not that acceptance.
